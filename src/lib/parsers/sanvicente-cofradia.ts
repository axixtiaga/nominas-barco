import { ParserHandler, ParsedInvoice, ParsedInvoiceLine } from "./base";
import { parseNumberES, round2 } from "../money";
import { consolidateLines } from "./_basque-shared";

/**
 * Parser del formato "POLIZA PESCA SUBASTADA" / ALBARÁN usado por la
 * COFRADIA PESCADORES DE SAN VICENTE (San Vicente de la Barquera, Cantabria).
 *
 * Datos identificativos del emisor:
 *   CIF: G39024567
 *   Ubicación: Puerto Pesquero s/n, 39540 San Vicente de la Barquera (Cantabria)
 *   Tlfn.: 942711508
 *
 * Estructura típica del PDF (texto extraído con pdf-parse):
 *   ALBARÁN
 *   <nº albarán>            ej. 4000000443
 *   ITSAS LAGUNAK
 *   <datos del barco>
 *   B26 461 11/05/2026     ← código + nº + fecha (B26/461)
 *   POLIZA PESCA SUBASTADA
 *   COFRADIA PESCADORES DE SAN VICENTE
 *   ...
 *   SS-1 - 2-05            ← código interno del barco
 *
 * Cada línea de detalle se reparte en CUATRO sub-líneas (pdf-parse rompe la
 * fila visual del PDF y reordena los campos de forma rara):
 *
 *   Sub-línea 1: "{día} {mes}"                                    ej. "11 5"
 *   Sub-línea 2: "{cod_comp}{nombre}{importe}{precio}{kilos}"     ej. "10.510PESCADOS OROL, S.L.7.362,293,8201.927,30"
 *                (todo pegado, SIN espacios entre campos numéricos)
 *   Sub-línea 3: "/"
 *   Sub-línea 4: "{FAO}{ESPECIE}"                                 ej. "ANEBOCARTE"
 *                (FAO = 3 letras mayúsculas pegadas al nombre)
 *
 *   · día: 11
 *   · mes: 5
 *   · especie: BOCARTE  (código FAO: ANE)
 *   · código comprador: 10.510
 *   · nombre comprador: "PESCADOS OROL, S.L."
 *   · importe: 7.362,29 €
 *   · precio: 3,820 €/kg  (3 decimales SIN miles)
 *   · kilos: 1.927,30 kg
 *
 * Validación matemática: cantidad × precio = importe (con redondeo a 2 decimales).
 *
 * Líneas que SE IGNORAN al parsear:
 *   - Subtotales por día:           "11/ 5  3.472,10"
 *   - Importe Bruto:                "Importe Bruto 11.768,06"
 *   - Base Imponible:               "Base Imponible 11.768,06"
 *   - I.V.A.:                       "10,00  1.176,81  I.V.A."
 *   - Total Albarán:                "Total Albarán . . . 12.944,87"
 *
 * Consolidación: usamos consolidateLines() para fusionar varias ventas del
 * mismo (día, especie) en una única línea con precio medio ponderado.
 */
export const sanvicenteCofradiaParser: ParserHandler = {
  key: "sanvicente-cofradia",
  label: "San Vicente de la Barquera · Cofradía Pescadores",
  matches(ctx) {
    const t = ctx.rawText.toUpperCase();
    const sigs = (ctx.formatConfig?.signatures as string[] | undefined) ?? [
      "SAN VICENTE", "BARQUERA", "POLIZA PESCA SUBASTADA",
      "G39024567", "942711508"
    ];
    const hit = sigs.filter(s => t.includes(s.toUpperCase())).length;
    return hit >= 2 || /\bG39024567\b/.test(ctx.rawText);
  },
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;
    const defaultVat = Number((ctx.formatConfig?.defaultVatRate as number | undefined) ?? 10);

    // Nº albarán: el primer número largo tras "ALBARAN" (ej. "4000000443").
    const invoiceNumber = firstMatch(text, [
      /ALBAR[ÁA]N\s*\nFecha\s*:?\s*\nITSAS\s+LAGUNAK\s*\n(\d{8,12})/i,
      /ALBAR[ÁA]N[\s\n]+(?:Fecha[:\s\n]+)?(?:ITSAS\s+LAGUNAK[\s\n]+)?(\d{8,12})/i,
      /\b(\d{10})\b/   // fallback: cualquier código de 10 dígitos
    ]);

    // Fecha emisión (en formato dd/mm/yyyy)
    const issueDateStr = firstMatch(text, [
      /\b(\d{2}\/\d{2}\/\d{4})\b/
    ]);
    const issueDate = parseDate(issueDateStr);

    const supplierName = "COFRADIA PESCADORES DE SAN VICENTE";
    const supplierTaxId = "G39024567";
    const portName = "San Vicente de la Barquera";
    const boatName = /IT[SX]AS\s+LAGUNAK/i.test(text) ? "ITSAS LAGUNAK" : null;

    // Parsear líneas detalle
    const issueYear = issueDate ? Number(issueDate.slice(0, 4)) : new Date().getFullYear();
    const rawLines = parseLines(text, issueYear, defaultVat);
    const lines = consolidateLines(rawLines);

    // Totales del documento (los leemos para reportar, pero también recalculamos
    // a partir de las líneas para sanity check)
    const totalAlbaran = parseAmountFromMatch(text, [
      /Total\s+Albar[áa]n[\s\.]+([\d\.]+,\d{2})/i
    ]);
    const importeBruto = parseAmountFromMatch(text, [
      /Importe\s+Bruto[\s]+([\d\.]+,\d{2})/i
    ]);
    const ivaImporte = parseAmountFromMatch(text, [
      /(\d+,\d{2})\s+([\d\.]+,\d{2})\s+I\.?V\.?A\./i
    ], 2);   // grupo 2 = importe IVA (grupo 1 sería el %)
    const ivaRate = parseAmountFromMatch(text, [
      /(\d+,\d{2})\s+[\d\.]+,\d{2}\s+I\.?V\.?A\./i
    ], 1);   // grupo 1 = % IVA

    const subtotal = importeBruto ?? round2(lines.reduce((a, l) => a + l.amount, 0));
    const total = totalAlbaran ?? round2(subtotal + (ivaImporte ?? 0));

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
      fees: 0,
      other: 0,
      total: round2(total),
      notes: null,
      lines,
      meta: { formatKey: "sanvicente-cofradia", documentKind: "ALBARAN", ivaRate }
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

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const yyyy = y.length === 2 ? (Number(y) > 70 ? "19" + y : "20" + y) : y;
  return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Extrae las líneas de detalle del documento.
 *
 * Cada línea está partida en 4 sub-líneas del texto extraído:
 *   [i]   "11 5"                                            (día mes)
 *   [i+1] "10.510PESCADOS OROL, S.L.7.362,293,8201.927,30"  (cod+nombre+imp+precio+kg)
 *   [i+2] "/"
 *   [i+3] "ANEBOCARTE"                                      (FAO+especie)
 *
 * El truco para el grupo i+1 (sin espacios entre campos numéricos) es:
 *   - cod_comp: ^(\d{1,3}\.\d{3})              ej. "10.510"
 *   - nombre: (.+?)                            mínimo perezoso hasta los números
 *   - importe: (\d[\d\.]*,\d{2})               empieza por dígito (no por punto)
 *   - precio:  (\d+,\d{3})                     SIEMPRE 3 decimales, sin miles
 *   - kilos:   (\d[\d\.]*,\d{2})$              hasta fin de línea
 */
function parseLines(
  text: string,
  issueYear: number,
  defaultVatRate: number
): ParsedInvoiceLine[] {
  const out: ParsedInvoiceLine[] = [];
  const allLines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, ""));

  const dateRe   = /^\s*(\d{1,2})\s+(\d{1,2})\s*$/;
  const detailRe = /^(\d{1,3}\.\d{3})(.+?)(\d[\d\.]*,\d{2})(\d+,\d{3})(\d[\d\.]*,\d{2})\s*$/;
  const slashRe  = /^\s*\/\s*$/;
  const speciesRe = /^([A-Z]{3})([A-Z][A-Z\s]*)\s*$/;

  let i = 0;
  while (i < allLines.length) {
    const dm = allLines[i].match(dateRe);
    if (!dm) { i++; continue; }

    // Saltamos posibles líneas en blanco entre las 4 sub-líneas
    const next = (offset: number) => {
      let k = i + offset;
      while (k < allLines.length && allLines[k].trim() === "") k++;
      return k;
    };

    const i2 = next(1);
    const i3 = i2 < allLines.length ? next(i2 - i + 1) : -1;
    const i4 = i3 < allLines.length ? next(i3 - i + 1) : -1;

    if (i2 >= allLines.length || i3 >= allLines.length || i4 >= allLines.length) { i++; continue; }

    const detM = allLines[i2].match(detailRe);
    const slashM = allLines[i3].match(slashRe);
    const spM = allLines[i4].match(speciesRe);

    if (!detM || !slashM || !spM) { i++; continue; }

    const day = Number(dm[1]);
    const month = Number(dm[2]);
    if (!Number.isFinite(day) || day < 1 || day > 31) { i++; continue; }
    if (!Number.isFinite(month) || month < 1 || month > 12) { i++; continue; }

    const [, /*buyerCode*/, buyerNameRaw, importeStr, priceStr, kilosStr] = detM;
    const [, /*faoCode*/, speciesNameRaw] = spM;

    const importe = parseNumberES(importeStr);
    const kilos   = parseNumberES(kilosStr);
    const price   = parseNumberES(priceStr);

    // Sanity check matemático: kilos × precio ≈ importe
    const expected = kilos * price;
    const tolerance = Math.max(0.05, importe * 0.02);
    if (Math.abs(expected - importe) > tolerance) { i++; continue; }

    const species = speciesNameRaw.replace(/\s+/g, " ").trim().toUpperCase();
    if (!species) { i++; continue; }

    const buyerName = buyerNameRaw.replace(/\s+/g, " ").trim();
    const lineDate = `${issueYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const vatAmount = round2(importe * (defaultVatRate / 100));

    out.push({
      lineNo: out.length + 1,
      lineDate,
      rawSpeciesName: species,
      description: buyerName,
      kilos: round2(kilos),
      pricePerKg: round2(price),
      amount: round2(importe),
      vatRate: defaultVatRate,
      vatAmount
    });

    // Saltamos las 4 sub-líneas que acabamos de consumir
    i = i4 + 1;
  }

  return out;
}
