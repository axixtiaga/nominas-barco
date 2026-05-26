import { ParserHandler, ParsedInvoice, ParsedInvoiceLine } from "./base";
import { parseNumberES, round2 } from "../money";
import { consolidateLines } from "./_basque-shared";

/**
 * Parser del formato FACTURA de la NUEVA RULA DE AVILES, S.A.
 *
 * Datos identificativos del emisor:
 *   CIF: A74242512
 *   Ubicación: Avda. Conde de Guadalhorce s/n, 33400 Avilés (Asturias)
 *   Web: www.pescadodeconfianza.es · info@ruladeaviles.es
 *   Tlf.: 985 56 44 33
 *
 * Estructura del PDF (texto extraído con pdf-parse):
 *   ...
 *   Fecha Factura : 19 - Mayo - 2026
 *   Factura       : AV600001
 *   Num.Marea     : 1607
 *   Fecha Marea   : 19 - Mayo - 2026
 *   Embarcacion   : ITSAS LAGUNAK
 *
 * Cabecera de la tabla:
 *   CONCEPTO T FECHA REFER. ENVASES CANTIDAD PRECIO IMPORTE
 *
 * Cada línea de detalle se reparte en OCHO sub-líneas extraídas por pdf-parse
 * (no respeta el orden visual del PDF):
 *
 *   [i-1] "K"                  ← T (unidad, una sola letra)
 *   [i  ] "19-05-26"           ← fecha (dd-mm-yy)
 *   [i+1] "1223"               ← envases (nº)
 *   [i+2] "9.998,50"           ← kilos
 *   [i+3] "PL-21"              ← envase tipo
 *   [i+4] "2"                  ← refer
 *   [i+5] "26.995,952,70"      ← IMPORTE+PRECIO pegados (sin separador)
 *   [i+6] "ANCHOA/BOCARTEMSC"  ← ESPECIE+CERT pegadas
 *
 * Línea de totales (también partida y mashed):
 *
 *   [j-1] "28.804,68"                       ← TOTAL FACTURA
 *   [j  ] "26.995,9526.186,07809,8810,00"   ← IMPORTE+BASE+TASA+%IVA pegados
 *   [j+1] "2.618,61"                        ← IVA importe
 *   [j+2] "Pesca"                           ← label
 *
 * Convención de almacenamiento:
 *   · invoice.subtotal = BASE IMPONIBLE (sin IVA, neto tras tasa de la rula)
 *   · invoice.fees     = TASA/DCTO (tasa de la rula)
 *   · invoice.taxes    = IVA
 *   · invoice.total    = TOTAL FACTURA del PDF
 *   · line.amount      = IMPORTE bruto del PDF (antes de tasa)
 *
 * Validación matemática: kilos × precio ≈ importe.
 */
export const avilesRulaParser: ParserHandler = {
  key: "aviles-rula",
  label: "Avilés · Nueva Rula de Avilés",
  matches(ctx) {
    const t = ctx.rawText.toUpperCase();
    const sigs = (ctx.formatConfig?.signatures as string[] | undefined) ?? [
      "NUEVA RULA DE AVILES", "RULA DE AVILES", "RULA DE AVILÉS",
      "A74242512", "RULADEAVILES.ES", "PESCADODECONFIANZA",
      "33400 AVILES", "985 56 44 33"
    ];
    const hit = sigs.filter(s => t.includes(s.toUpperCase())).length;
    return hit >= 2 || /\bA74242512\b/.test(ctx.rawText);
  },
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;
    const defaultVat = Number((ctx.formatConfig?.defaultVatRate as number | undefined) ?? 10);

    // Nº factura: "AV600001" (formato AV + 6 dígitos típicamente)
    const invoiceNumber = firstMatch(text, [
      /\b(AV\d{6,})\b/,
      /Factura\s*:?\s*\n?\s*(AV\d{6,})/i
    ]);

    // Fecha factura: "19 - Mayo - 2026"
    const issueDate = parseEsDateLong(firstMatch(text, [
      /Fecha\s+Factura\s*:?\s*\n?\s*(\d{1,2}\s*-\s*\w+\s*-\s*\d{4})/i,
      /(\d{1,2}\s*-\s*(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*-\s*\d{4})/i
    ]));

    const supplierName = "NUEVA RULA DE AVILES, S.A.";
    const supplierTaxId = "A74242512";
    const portName = "Avilés";
    const boatName = /IT[SX]AS\s+LAGUNAK/i.test(text) ? "ITSAS LAGUNAK" : null;

    // Parsear líneas detalle
    const issueYear = issueDate ? Number(issueDate.slice(0, 4)) : new Date().getFullYear();
    const rawLines = parseLines(text, issueYear, defaultVat);
    const lines = consolidateLines(rawLines);

    // Totales: extraemos del bloque de 4 valores pegados + total/IVA separados.
    const t = extractTotals(text);
    const importeBruto = t.importeBruto;
    const tasaDcto = t.tasaDcto;
    const baseImponible = t.baseImponible;
    const ivaRate = t.ivaRate;
    const ivaImporte = t.ivaImporte;
    let totalFactura = t.totalFactura;
    // Fallback al "TOTAL FACTURA" del pie si no encontramos el bloque "Pesca"
    if (totalFactura == null) {
      totalFactura = parseAmountFromMatch(text, [
        /TOTAL\s+FACTURA[\s\n]+([\d\.]+,\d{2})/i
      ]);
    }

    // Convención: subtotal = base imponible (sin IVA, neto tras tasa)
    const subtotal = baseImponible ?? round2(lines.reduce((a, l) => a + l.amount, 0));
    const total = totalFactura ?? round2(subtotal + (ivaImporte ?? 0));

    return {
      invoiceNumber,
      issueDate,
      portName,
      boatName,
      supplierName,
      supplierTaxId,
      currency: "EUR",
      subtotal: round2(subtotal),
      taxes: round2(ivaImporte ?? 0),
      fees: round2(tasaDcto ?? 0),
      other: 0,
      total: round2(total),
      notes: null,
      lines,
      meta: {
        formatKey: "aviles-rula",
        documentKind: "FACTURA",
        ivaRate,
        importeBruto,
        tasaDcto
      }
    };
  }
};

/* ───────── helpers ───────── */

function firstMatch(text: string, regexes: RegExp[]): string | null {
  for (const re of regexes) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
    if (m && !m[1] && m[0]) return m[0].trim();
  }
  return null;
}

function parseAmountFromMatch(text: string, regexes: RegExp[], group: number = 1): number | null {
  for (const re of regexes) {
    const m = text.match(re);
    if (m && m[group]) return parseNumberES(m[group]);
  }
  return null;
}

const MONTHS_ES: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04",
  mayo: "05", junio: "06", julio: "07", agosto: "08",
  septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12"
};

/** Parsea "19 - Mayo - 2026" → "2026-05-19" */
function parseEsDateLong(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*-\s*(\w+)\s*-\s*(\d{4})/i);
  if (!m) return null;
  const [, dStr, monthName, yStr] = m;
  const mm = MONTHS_ES[monthName.toLowerCase()];
  if (!mm) return null;
  return `${yStr}-${mm}-${dStr.padStart(2, "0")}`;
}

/** Parsea "19-05-26" → "2026-05-19" (asume año 20XX) */
function parseShortDate(s: string, fallbackYear: number): string {
  const m = s.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (!m) {
    return `${fallbackYear}-01-01`;
  }
  const [, d, mo, y] = m;
  const yyyy = Number(y) > 70 ? "19" + y : "20" + y;
  return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Extrae las líneas de detalle del documento.
 *
 * Detecta cada línea anclando en la fecha (formato dd-mm-yy, único y reconocible)
 * y leyendo los offsets fijos alrededor según el orden observado del extractor.
 */
function parseLines(
  text: string,
  issueYear: number,
  defaultVatRate: number
): ParsedInvoiceLine[] {
  const out: ParsedInvoiceLine[] = [];
  const allLines = text.split(/\r?\n/).map(l => l.trim());

  const dateRe       = /^(\d{2})-(\d{2})-(\d{2})$/;
  const singleLetter = /^[A-Z]$/;
  const intRe        = /^\d+$/;
  const decRe        = /^[\d\.]+,\d{2}$/;
  const envTypeRe    = /^[A-Z0-9][A-Z0-9\-]*$/;
  // Importe + precio pegados sin separador: "26.995,952,70" o "1.006,503,820"
  const mashedImpPrice = /^([\d\.]+,\d{2})(\d+,\d{2,3})$/;
  // Especie (puede incluir / y terminar con MSC/ECO/BIO sin espacio)
  const speciesRe = /^[A-Z][A-Z\/\s]*[A-Z]$/;

  for (let i = 0; i < allLines.length; i++) {
    const dm = allLines[i].match(dateRe);
    if (!dm) continue;

    // Comprobar los 8 sub-líneas en torno a la fecha
    if (i - 1 < 0 || i + 6 >= allLines.length) continue;

    const tUnit     = allLines[i - 1];
    const envCount  = allLines[i + 1];
    const kilosStr  = allLines[i + 2];
    const envType   = allLines[i + 3];
    const referStr  = allLines[i + 4];
    const impPrice  = allLines[i + 5];
    const species   = allLines[i + 6];

    if (!singleLetter.test(tUnit)) continue;
    if (!intRe.test(envCount)) continue;
    if (!decRe.test(kilosStr)) continue;
    if (!envTypeRe.test(envType)) continue;
    if (!intRe.test(referStr)) continue;
    const impM = impPrice.match(mashedImpPrice);
    if (!impM) continue;
    if (!speciesRe.test(species)) continue;

    const kilos   = parseNumberES(kilosStr);
    const importe = parseNumberES(impM[1]);
    const price   = parseNumberES(impM[2]);

    // Sanity check: kilos × precio ≈ importe
    const expected = kilos * price;
    const tolerance = Math.max(0.05, importe * 0.02);
    if (Math.abs(expected - importe) > tolerance) continue;

    const speciesNormalised = splitSpeciesAndCert(species);
    const lineDate = parseShortDate(dm[0], issueYear);
    const vatAmount = round2(importe * (defaultVatRate / 100));

    out.push({
      lineNo: out.length + 1,
      lineDate,
      rawSpeciesName: speciesNormalised,
      description: "Nueva Rula de Avilés",
      kilos: round2(kilos),
      pricePerKg: round2(price),
      amount: round2(importe),
      vatRate: defaultVatRate,
      vatAmount
    });
  }

  return out;
}

/**
 * "ANCHOA/BOCARTEMSC" → "ANCHOA/BOCARTE MSC"
 * "ANCHOA/BOCARTEECO" → "ANCHOA/BOCARTE ECO"
 * "BONITO"            → "BONITO"
 */
function splitSpeciesAndCert(s: string): string {
  const certRe = /(MSC|ECO|BIO|RAW|CCL)$/;
  const m = s.match(certRe);
  if (m && s.length > m[1].length) {
    const base = s.slice(0, -m[1].length).replace(/\s+$/, "");
    return `${base} ${m[1]}`.toUpperCase();
  }
  return s.toUpperCase();
}

/**
 * Extrae los totales del pie de la factura. Estructura observada:
 *
 *   [j-1] "28.804,68"                       ← TOTAL FACTURA
 *   [j  ] "26.995,9526.186,07809,8810,00"   ← IMPORTE+BASE+TASA+%IVA pegados
 *   [j+1] "2.618,61"                        ← IVA importe
 *   [j+2] "Pesca"                           ← label (anclaje)
 *
 * Validamos la coherencia con: importe - tasa = base, base × %iva/100 = iva_imp.
 */
function extractTotals(text: string): {
  importeBruto: number | null;
  baseImponible: number | null;
  tasaDcto: number | null;
  ivaRate: number | null;
  ivaImporte: number | null;
  totalFactura: number | null;
} {
  const empty = {
    importeBruto: null, baseImponible: null, tasaDcto: null,
    ivaRate: null, ivaImporte: null, totalFactura: null
  };
  const allLines = text.split(/\r?\n/).map(l => l.trim());

  // 4 valores pegados: importe(8) + base(8) + tasa(varia) + %iva(5).
  // Anclamos en este patrón y validamos con las líneas vecinas.
  const mashedTotalsRe = /^([\d\.]+,\d{2})([\d\.]+,\d{2})([\d\.]+,\d{2})(\d+,\d{2})$/;
  const decRe = /^[\d\.]+,\d{2}$/;

  for (let j = 0; j < allLines.length; j++) {
    const m = allLines[j].match(mashedTotalsRe);
    if (!m) continue;

    const totalStr = allLines[j - 1];
    const ivaImpStr = allLines[j + 1];
    const label = (allLines[j + 2] ?? "").toLowerCase();

    if (!decRe.test(totalStr ?? "")) continue;
    if (!decRe.test(ivaImpStr ?? "")) continue;
    // El bloque tiene que estar etiquetado como "Pesca" (concepto único)
    if (!label.includes("pesca")) continue;

    const importeBruto = parseNumberES(m[1]);
    const baseImponible = parseNumberES(m[2]);
    const tasaDcto = parseNumberES(m[3]);
    const ivaRate = parseNumberES(m[4]);
    const ivaImporte = parseNumberES(ivaImpStr);
    const totalFactura = parseNumberES(totalStr);

    // Validar coherencia matemática (con tolerancia 1 céntimo)
    const tol = 0.05;
    if (Math.abs((importeBruto - tasaDcto) - baseImponible) > tol) continue;
    if (Math.abs((baseImponible + ivaImporte) - totalFactura) > tol) continue;

    return { importeBruto, baseImponible, tasaDcto, ivaRate, ivaImporte, totalFactura };
  }

  return empty;
}
