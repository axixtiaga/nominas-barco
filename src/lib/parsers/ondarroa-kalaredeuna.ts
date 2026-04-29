import { ParserHandler, ParsedInvoice, ParsedInvoiceLine } from "./base";
import { parseNumberES, round2 } from "../money";
import { consolidateLines } from "./_basque-shared";

/**
 * Parser del formato usado por la KALARE DEUNA ARRANTZALEEN KOFRADIA
 * (Cofradía de San Nicolás) de Ondarroa, Bizkaia.
 *
 * CIF: G48108039 (ESG48108039 en formato VAT)
 * Serie: "FP<codigoBarco>/<año>-<secuencia>" p.ej. "FP0601084/26-00001".
 *
 * A diferencia de Getaria/Hondarribia que usan código de comprador (4 dígitos),
 * Ondarroa usa el nombre razonable del comprador completo (PESCADOS LLORENTE
 * S.L., ARRANKOBA 08 S.L., BERIPESCA SEAFOOD S.L., etc.) fusionado con los
 * importes en la misma línea de texto extraído.
 *
 * Patrón por línea (3 renglones por fila de la factura):
 *   <NOMBRE_COMPRADOR><importe X,XX><precio X,XXX><kilos X,XX>
 *   <ESPECIE>
 *   [<fecha-ISO>]<nº cajas>
 *
 * Ejemplo:
 *   PESCADOS LLORENTE S.L.1.985,340,6962.852,50
 *   SARDINA
 *   2026-02-24365
 *
 *   (kilos 2.852,50 × precio 0,696 = importe 1.985,34)
 *
 * Líneas consolidadas por (fecha, especie).
 */
export const ondarroaKalareDeunaParser: ParserHandler = {
  key: "ondarroa-kalaredeuna",
  label: "Ondarroa · Kalare Deuna Kofradía",
  matches(ctx) {
    return /ESG?48108039\b/.test(ctx.rawText)
      || /KALARE\s+DEUNA/i.test(ctx.rawText);
  },
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;
    const defaultVat = Number((ctx.formatConfig?.defaultVatRate as number | undefined) ?? 10);
    // IVA fijo al 10% para todas las capturas del Cantábrico — anula el valor
    // del config por si quedó en 0 desde algún seed previo.
    const vatRate = defaultVat || 10;

    const invoiceNumber = (text.match(/FP\d{4,}\/\d{2}-\d{3,6}/) ?? [null])[0];
    const issueDate = extractIssueDate(text);

    const supplierName = /KALARE\s+DEUNA\s+ARRANTZALEEN\s+KOFRADIA/i.test(text)
      ? "KALARE DEUNA ARRANTZALEEN KOFRADIA"
      : null;
    const supplierTaxId = "G48108039";
    const portName = "Ondarroa";
    const boatName = /IT[SX]AS\s+LAGUNAK/i.test(text) ? "ITSAS LAGUNAK" : null;

    const rawLines = parseLines(text, issueDate, vatRate);
    const lines = consolidateLines(rawLines);
    const subtotal = lines.reduce((a, l) => a + l.amount, 0);

    // Totales oficiales del PDF
    //  - total:  número grande tras "TOTAL FACTURA EUROS" (p.ej. 10.781,34)
    //  - fees:   "GASTOS" (comisión de cofradía, p.ej. 482,72)
    //  - taxes:  10% del subtotal calculado a partir de las líneas (más fiable
    //            que intentar encontrar el IVA en el texto, porque las cifras
    //            se fusionan en el texto extraído y salen falsos positivos).
    const fees = extractValueAfter(text, /GASTOS/i) ?? 0;
    const taxes = round2(subtotal * (vatRate / 100));
    const total = extractValueAfter(text, /TOTAL\s+FACTURA\s+EUROS/i) ?? (subtotal + taxes);

    return {
      invoiceNumber,
      issueDate,
      portName,
      boatName,
      supplierName,
      supplierTaxId,
      currency: "EUR",
      subtotal,
      taxes,
      fees,
      other: 0,
      total,
      notes: null,
      lines,
      meta: { formatKey: "ondarroa-kalaredeuna" }
    };
  }
};

/* ───────── helpers ───────── */

/**
 * Parser línea-a-línea. Más robusto que un regex gigante: evitamos ambigüedades
 * y empantanamientos del motor de regex cuando hay filas consecutivas con la
 * misma estructura.
 *
 * Estructura de cada fila de la factura (ocupando 3 líneas de texto):
 *   <NOMBRE COMPRADOR><importe><precio><kilos>       ← fusionado
 *   <ESPECIE>                                         ← puede multilinea si hay (
 *   [<fecha-ISO>]<cajas>                              ← fecha opcional
 */
function parseLines(text: string, invoiceDateISO: string | null, defaultVatRate: number): ParsedInvoiceLine[] {
  const lines: ParsedInvoiceLine[] = [];
  const textLines = text.split(/\r?\n/);

  const rowRe = /^([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9,\.\-& ]+?[A-Z\.])(\d[\d\.]*,\d{2})(\d[\d\.]*,\d{3})(\d[\d\.]*,\d{2})$/;
  const cajasRe = /^(\d{4}-\d{2}-\d{2})?(\d+)$/;

  let lineNo = 0;
  let i = 0;
  while (i < textLines.length) {
    const ln = textLines[i].trim();
    const m = ln.match(rowRe);
    if (!m) { i++; continue; }

    const [, buyerName, amountStr, priceStr, kilosStr] = m;
    const buyerClean = buyerName.trim();

    // Descarta falsos positivos de cabecera/resumen, usando word boundaries
    // para no tropezar con nombres válidos como "PESCADOS LLORENTE" o "PESCALVAREZ"
    // (eran eliminados por error al incluir "PESCA" sin delimitar).
    if (/\b(TOTAL|GUZTIRA|BASE\sIMPONIBLE|DESCUENTO|GASTOS)\b/i.test(buyerClean)) { i++; continue; }

    // Siguiente línea no vacía → ESPECIE (posible multilinea con paréntesis)
    let j = i + 1;
    while (j < textLines.length && textLines[j].trim() === "") j++;
    if (j >= textLines.length) break;

    let speciesRaw = textLines[j].trim();
    if ((speciesRaw.match(/\(/g) ?? []).length > (speciesRaw.match(/\)/g) ?? []).length
        && j + 1 < textLines.length) {
      j++;
      speciesRaw += " " + textLines[j].trim();
    }
    const rawSpecies = speciesRaw.replace(/\s+/g, " ").trim().toUpperCase();

    // Siguiente línea no vacía → CAJAS (con fecha opcional delante)
    let lineDateISO: string | null = null;
    let k = j + 1;
    while (k < textLines.length && textLines[k].trim() === "") k++;
    if (k < textLines.length) {
      const cm = textLines[k].trim().match(cajasRe);
      if (cm) {
        lineDateISO = cm[1] ?? null;
        i = k + 1;            // consumimos la línea de cajas
      } else {
        i = j + 1;            // esa línea no era cajas → no la consumimos aquí
      }
    } else {
      i = k;
    }

    const amount = parseNumberES(amountStr);
    const price = parseNumberES(priceStr);
    const kilos = parseNumberES(kilosStr);

    if (!rawSpecies) continue;
    if (/^(TOTAL|GUZTIRA|BASE|DESCUENTO)/i.test(rawSpecies)) continue;
    if (kilos <= 0 && amount <= 0) continue;

    const vatAmount = round2(amount * (defaultVatRate / 100));
    lines.push({
      lineNo: ++lineNo,
      lineDate: lineDateISO ?? invoiceDateISO ?? null,
      rawSpeciesName: rawSpecies,
      description: null,
      kilos, pricePerKg: price, amount,
      vatRate: defaultVatRate,
      vatAmount
    });
  }
  return lines;
}

function extractIssueDate(text: string): string | null {
  for (const m of text.matchAll(/(\d{2})([\-\/])(\d{2})\2(\d{4})/g)) {
    const [, dd, , mm, yy] = m;
    const d = Number(dd), mo = Number(mm), y = Number(yy);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) {
      return `${yy}-${mm}-${dd}`;
    }
  }
  return null;
}

/** Número con 2 decimales después de una marca textual (el primero tras ella). */
function extractValueAfter(text: string, marker: RegExp): number | null {
  const m = text.match(marker);
  if (!m) return null;
  // Si el regex tiene grupo capturado, úsalo; si no, mira los 200 chars posteriores.
  if (m[1]) return parseNumberES(m[1]);
  const idx = text.indexOf(m[0]) + m[0].length;
  const after = text.slice(idx, idx + 200);
  const nums = [...after.matchAll(/([\d\.]+,\d{2})(?!\d)/g)].map(x => x[1]);
  return nums.length ? parseNumberES(nums[0]) : null;
}
