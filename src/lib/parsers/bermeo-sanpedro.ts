import { ParserHandler, ParsedInvoice, ParsedInvoiceLine } from "./base";
import { parseNumberES, round2 } from "../money";
import { consolidateLines } from "./_basque-shared";

/**
 * Parser del formato "TXANTEL" usado por la SAN PEDRO ARRANTZALEEN KOFRADIA
 * de Bermeo, Bizkaia.
 *
 * Datos identificativos del emisor:
 *   CIF: G48039002
 *   Teléfono: 94-6186173
 *   Ubicación: Bermeo (Bizkaia)
 *
 * TXANTEL es un certificado/ticket de captura (similar a un albarán).
 * Formato de nº de documento: "FB3SS12-/26-<seq>" p.ej. "FB3SS12-/26-00001".
 *
 * ATENCIÓN — orden de columnas invertido en el texto plano extraído:
 * Las cabeceras listan "IMPORTE / PRECIO / KILOS" pero los valores
 * aparecen fusionados en el orden <kilos><precio><importe>.
 * Se ha verificado con varias líneas: kilos × precio = importe.
 *
 * Estructura de línea (tres filas de texto por línea real):
 *   <fecha-ISO>
 *   <ESPECIE código>                (ej. "ANTXOA 44", "SARDINA 36/67")
 *   <kilos X,XX><precio X,XXX><importe X,XXX>
 *
 * Existe una línea "TOTAL DIA <fecha>" con el subtotal del día; la ignoramos
 * al parsear para no duplicar datos con las líneas individuales.
 */
export const bermeoSanPedroParser: ParserHandler = {
  key: "bermeo-sanpedro",
  label: "Bermeo · San Pedro Arrantzaleen Kofradia",
  matches(ctx) {
    const t = ctx.rawText.toUpperCase();
    const sigs = (ctx.formatConfig?.signatures as string[] | undefined) ?? [
      "BERMEO", "TXANTEL", "SAN PEDRO ARRANTZALEEN"
    ];
    const hit = sigs.filter(s => t.includes(s.toUpperCase())).length;
    return hit >= 2 || /\bG48039002\b/.test(ctx.rawText);
  },
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;
    const defaultVat = Number((ctx.formatConfig?.defaultVatRate as number | undefined) ?? 10);

    // Nº txantel: "FB3SS12-/26-00001"
    const invoiceNumber = firstMatch(text, [
      /\b(FB\d+SS\d+[\-\/]\d+[\-\/]\d+)\b/,
      /\b(FB\w+[\-\/]\d+[\-\/]\d+)\b/,
      /TX\.ZKIA[^\n]*\n?([A-Z0-9\-\/]+)/i
    ]);
    const issueDate = parseDate(firstMatch(text, [/(\d{2}[\-\/]\d{2}[\-\/]\d{4})/]));

    const supplierName = /SAN\s+PEDRO\s+ARRANTZALEEN\s+KOFRADIA/i.test(text)
      ? "SAN PEDRO ARRANTZALEEN KOFRADIA"
      : null;
    const supplierTaxId = firstMatch(text, [/\b(G48039002)\b/, /N\.?I\.?F\.?[:\s]+([A-Z]\d{8})/i]) ?? "G48039002";

    const portName = "Bermeo";
    const boatName = /IT[SX]AS\s+LAGUNAK/i.test(text) ? "ITSAS LAGUNAK" : null;

    const rawLines = parseLines(text, defaultVat);
    // Consolidar por (fecha, especie): varios compradores del mismo día y misma
    // especie se fusionan en una sola línea.
    const lines = consolidateLines(rawLines);
    const subtotal = lines.reduce((a, l) => a + l.amount, 0);
    const total = subtotal;   // no se ha observado IVA explícito en txanteles

    return {
      invoiceNumber,
      issueDate,
      portName,
      boatName,
      supplierName,
      supplierTaxId,
      currency: "EUR",
      subtotal,
      taxes: 0,
      fees: 0,
      other: 0,
      total,
      notes: null,
      lines,
      meta: { formatKey: "bermeo-sanpedro", documentKind: "TXANTEL" }
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

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const yyyy = y.length === 2 ? (Number(y) > 70 ? "19" + y : "20" + y) : y;
  return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Extrae líneas.
 * Estructura:
 *   <fecha-ISO>
 *   <ESPECIE (línea no numérica)>
 *   <kilos X,XX><precio X,XXX><importe X,XXX>
 *
 * El texto suele intercalar "TOTAL DIA <fecha>\n<kilos total><importe total>"
 * al cerrar cada bloque de día. Esa línea NO tiene especie encima sino la
 * cadena "TOTAL DIA ..." — por eso filtramos por que el campo especie empiece
 * con letra (no con la palabra TOTAL).
 */
function parseLines(text: string, defaultVatRate: number): ParsedInvoiceLine[] {
  const lines: ParsedInvoiceLine[] = [];

  // 1=fecha, 2=especie, 3=kilos(2d), 4=precio(3d), 5=importe(3d)
  const re = /(\d{4}-\d{2}-\d{2})\s*\n([A-ZÁÉÍÓÚÑa-záéíóúñ][^\n]*?)\s*\n\s*([\d\.]+,\d{2})([\d\.]+,\d{3})([\d\.]+,\d{3})/g;

  let m: RegExpExecArray | null;
  let lineNo = 0;
  while ((m = re.exec(text)) !== null) {
    const [, lineDateISO, speciesRaw, kilosStr, priceStr, amountStr] = m;
    // Descartamos accidentalmente el total del día si se colase.
    if (/TOTAL\s+DIA/i.test(speciesRaw)) continue;

    const kilos = parseNumberES(kilosStr);
    const price = parseNumberES(priceStr);
    const amount = parseNumberES(amountStr);

    const rawSpecies = speciesRaw.replace(/\s+/g, " ").trim().toUpperCase();
    if (!rawSpecies) continue;
    if (kilos <= 0 && amount <= 0) continue;

    const vatAmount = round2(amount * (defaultVatRate / 100));
    lines.push({
      lineNo: ++lineNo,
      lineDate: lineDateISO,
      rawSpeciesName: rawSpecies,
      description: null,
      kilos, pricePerKg: price, amount,
      vatRate: defaultVatRate,
      vatAmount
    });
  }
  return lines;
}
