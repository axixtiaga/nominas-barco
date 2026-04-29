import { ParserHandler, ParsedInvoice, ParsedInvoiceLine } from "./base";
import { parseNumberES, round2 } from "../money";
import { consolidateLines } from "./_basque-shared";

/**
 * Parser del formato usado por la Cofradía de Pescadores Ntra. Sra. del Puerto (Santoña, Cantabria).
 *
 * Datos identificativos del emisor:
 *   CIF: V39023569
 *   Dirección: Muelle Pesquero s/n, 39740 SANTOÑA
 *
 * Estructura típica del PDF (ALBARAN PESCA SUBASTADA, serie B, p.ej. "B26371"):
 *   - Cabecera con datos del barco y del comprador (ITSAS LAGUNAK / Bernardo Sistiaga C.B.)
 *   - Tabla de líneas; cada línea se expande en varias filas de texto plano:
 *
 *     18    3                                     ← día  mes
 *     371   VALLE FRANCISCO, TEODORO213,151,450147,00
 *     /                                            ← separador
 *     ANEBOCARTE                                   ← especie
 *
 *   - Donde la fila fusionada es: <codComprador>   <NOMBRE><importe><precio><kilos>
 *   - Variante B: si la captura no se subasta y solo se pesa, la fila lleva
 *     únicamente kilos (sin importe ni precio): <code>   <NOMBRE><kilos>
 *
 * Los importes van en formato español (punto miles, coma decimal).
 */
export const santonaDelPuertoParser: ParserHandler = {
  key: "santona-delpuerto",
  label: "Santoña · Cofradía Ntra. Sra. del Puerto",
  matches(ctx) {
    return /\bV39023569\b/.test(ctx.rawText)
      || /NTRA\.?\s*SRA\.?\s*DEL\s+PUERTO/i.test(ctx.rawText)
      || (/(?:ALBARAN|FACTURA)\s+PESCA\s+SUBASTADA/i.test(ctx.rawText)
          && /SANTO[ÑN]A/i.test(ctx.rawText));
  },
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;
    const defaultVat = Number((ctx.formatConfig?.defaultVatRate as number | undefined) ?? 10);

    // Cabecera
    // Número: albaranes serie B ("B26371", "B26 / 1.320") o facturas serie E ("E26/458").
    // Variantes observadas: con/sin espacios alrededor de la "/", con punto de miles
    // ("1.320"), o pegado todo junto ("B261320"). Limpiamos espacios y puntos al final.
    const invoiceNumber = firstMatch(text, [
      /Ref:\s*([A-Z]\d{2}\s*\/\s*[\d\.]+)/i,
      /\b([A-Z]\d{2}\s*\/\s*[\d\.]+)\b/,
      /\b(B\d{5,7})\b/,
      /(?:Albar[áa]n|Factura)\s*n[ºo°]?\s*[:\s]*([A-Z0-9\/\.\-]+)/i
    ])?.replace(/\s+/g, "").replace(/\./g, "") ?? null;
    const issueDate = parseDate(firstMatch(text, [
      /(\d{2}\/\d{2}\/\d{4})/
    ]));

    const supplierName = /COFRAD[ÍI]A\s+DE\s+PESCADORES\s+NTRA\.\s*SRA\.\s*DEL\s+PUERTO/i.test(text)
      ? "COFRADÍA DE PESCADORES NTRA. SRA. DEL PUERTO"
      : null;
    const supplierTaxId = firstMatch(text, [/\bV39023569\b/, /CIF:\s*([A-Z]\d{8})/i]) ?? "V39023569";

    const portName = "Santoña";
    const boatName = /IT[SX]AS\s+LAGUNAK/i.test(text) ? "ITSAS LAGUNAK" : null;

    const rawLines = parseLines(text, issueDate, defaultVat);
    const lines = consolidateLines(rawLines);

    const subtotal = lines.reduce((a, l) => a + l.amount, 0);
    const taxes = lines.reduce((a, l) => a + (l.vatAmount ?? 0), 0);
    const total = subtotal + taxes;

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
      fees: 0,
      other: 0,
      total,
      notes: null,
      lines,
      meta: { formatKey: "santona-delpuerto", documentKind: "ALBARAN" }
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

function parseLines(text: string, invoiceDateISO: string | null, defaultVatRate: number): ParsedInvoiceLine[] {
  // Marcadores de día: una línea con "DD    M" seguida de otra línea con <cod>...
  const dayMarkers: { pos: number; day: string; month: string }[] = [];
  const dayRe = /(?:^|\n)\s*(\d{1,2})\s{2,}(\d{1,2})\s*(?=\n\s*\d{1,4}\s{2,})/g;
  let dm: RegExpExecArray | null;
  while ((dm = dayRe.exec(text)) !== null) {
    dayMarkers.push({ pos: dm.index, day: dm[1], month: dm[2] });
  }

  // Cada fila puede tener DOS variantes:
  //   A) Subastada (lo habitual): <code>   <NOMBRE><importe><precio><kilos>
  //   B) Solo pesada, NO subastada: <code>   <NOMBRE><kilos>
  // El grupo (precio + kilos) entre paréntesis es OPCIONAL.
  //
  // IMPORTANTE: precio siempre tiene 3 decimales en Santoña (p.ej. "2,070", "1,900").
  // Si se permitieran 2-4 decimales, el regex greedy se comería un dígito del campo kilos
  // (p.ej. "1,9001.564,25" se rompería como precio=1,9001 + kilos=.564,25).
  const rowRe = /(?:^|\n)\s*(\d{1,4})\s{2,}([^\n\d][^\n\d]*?)([\d\.]+,\d{2})(?:\s*([\d\.]*,\d{3})\s*([\d\.]+,\d{2}))?\s*\n(?:\s*\/\s*\n)?\s*([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 \/\-]*)/g;

  const dayFor = (pos: number): { day: string; month: string } | null => {
    let best: { day: string; month: string; pos: number } | null = null;
    for (const d of dayMarkers) {
      if (d.pos <= pos && (!best || d.pos > best.pos)) best = d;
    }
    return best;
  };

  const lines: ParsedInvoiceLine[] = [];
  let lineNo = 0;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(text)) !== null) {
    const [, buyerCode, buyerName, firstNumStr, priceStr, lastNumStr, speciesRaw] = m;
    // Si lastNumStr existe → fila subastada (importe, precio, kilos).
    // Si no → fila solo-pesaje: el único número es kilos.
    const isFullRow = lastNumStr !== undefined;
    const amount = isFullRow ? parseNumberES(firstNumStr) : 0;
    const price  = isFullRow ? parseNumberES(priceStr) : 0;
    const kilos  = isFullRow ? parseNumberES(lastNumStr) : parseNumberES(firstNumStr);
    const rawSpecies = (speciesRaw ?? "").trim().replace(/\s+/g, " ").toUpperCase();

    if (!rawSpecies) continue;
    if (/^TOTALES/i.test(rawSpecies)) continue;
    if (kilos <= 0 && amount <= 0) continue;

    const dayInfo = dayFor(m.index);
    const lineDate = (dayInfo && invoiceDateISO)
      ? `${invoiceDateISO.slice(0, 4)}-${dayInfo.month.padStart(2, "0")}-${dayInfo.day.padStart(2, "0")}`
      : invoiceDateISO;

    const vatAmount = round2(amount * (defaultVatRate / 100));

    lines.push({
      lineNo: ++lineNo,
      lineDate,
      rawSpeciesName: rawSpecies,
      description: null,
      kilos, pricePerKg: price, amount,
      vatRate: defaultVatRate,
      vatAmount
    });
  }
  return lines;
}
