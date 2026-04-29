import { ParserHandler, ParsedInvoice, ParsedInvoiceLine } from "./base";
import { parseNumberES, round2 } from "../money";
import { consolidateLines } from "./_basque-shared";

/**
 * Parser del formato usado por la Cofradía de Pescadores Ntra. Sra. San Martín (Laredo, Cantabria).
 *
 * Datos identificativos del emisor:
 *   CIF: G39022454
 *   Dirección: Nuevo Puerto Pesquero s/n, 39770 LAREDO
 *   Email: administracion@cpsanmartin.es
 *
 * Formato de factura "FACTURA PESCA SUBASTADA" — Serie E, p.ej. "E26/55".
 * En el texto plano las columnas aparecen fusionadas:
 *   <codComprador>   <NOMBRE COMPRADOR><importe><precio><kilos>
 *   /                                                              ← solo en la 1ª fila del bloque
 *   <ESPECIE>                                                      ← p.ej. "ANEBOCARTE VIIIc"
 *
 * NOTA: en el PDF aparece "HONDARRIBIA" como dirección del comprador
 * (Bernardo Sistiaga y Otros C.B., propietario del Itsas Lagunak), NO como puerto.
 * El puerto donde se subasta y emite la factura es LAREDO.
 */
export const laredoSanMartinParser: ParserHandler = {
  key: "laredo-sanmartin",
  label: "Laredo · Cofradía San Martín",
  matches(ctx) {
    return /\bG39022454\b/.test(ctx.rawText)
      || /cpsanmartin\.es/i.test(ctx.rawText)
      || /COFRAD[ÍI]A\s+DE\s+PESCADORES\s+NTRA\.?\s*SAN\s+MARTIN/i.test(ctx.rawText);
  },
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;
    const defaultVat = Number((ctx.formatConfig?.defaultVatRate as number | undefined) ?? 10);

    const invoiceNumber = firstMatch(text, [
      /\b([A-Z]\d{2}\/\d{1,6})\b/,
      /Factura\s*n[ºo°]?\s*[:\s]*([A-Z0-9\/\-]+)/i
    ]);
    const issueDate = parseDate(firstMatch(text, [
      /(\d{2}\/\d{2}\/\d{4})/
    ]));

    const supplierName = /COFRAD[ÍI]A\s+DE\s+PESCADORES\s+NTRA\.\s*SAN\s+MARTIN/i.test(text)
      ? "COFRADÍA DE PESCADORES NTRA. SAN MARTIN"
      : null;
    const supplierTaxId = firstMatch(text, [/\bG39022454\b/, /CIF:\s*([A-Z]\d{8})/i]);

    const portName = "Laredo";
    const boatName = /IT[SX]AS\s+LAGUNAK/i.test(text) ? "ITSAS LAGUNAK" : null;

    const subtotal = parseNumberES(firstMatch(text, [/Base\s+Imponible[:\s]*([\d\.\,]+)/i])) || 0;
    const taxes = parseNumberES(firstMatch(text, [
      /I\.?V\.?A\.?\s*\n?\s*[\d\.,]*\s*([\d\.,]+)/i,
      /I\.?V\.?A\.?\s*\n?\s*10[\.,]00([\d\.,]+)/i
    ])) || 0;
    const gastosBase = parseNumberES(firstMatch(text, [/GASTOS\s*([\d\.\,]+)\s*[\d\.\,]+/i])) || 0;
    const total = parseNumberES(firstMatch(text, [/Total\s+Factura[:\s]*([\d\.\,]+)/i])) || 0;

    const rawLines = parseLines(text, issueDate, defaultVat);
    const lines = consolidateLines(rawLines);

    return {
      invoiceNumber,
      issueDate,
      portName,
      boatName,
      supplierName,
      supplierTaxId: supplierTaxId ?? "G39022454",
      currency: "EUR",
      subtotal: subtotal || lines.reduce((a, l) => a + l.amount, 0),
      taxes,
      fees: gastosBase,
      other: 0,
      total,
      notes: null,
      lines,
      meta: { formatKey: "laredo-sanmartin" }
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

function parseLines(text: string, issueDateISO: string | null, defaultVatRate: number): ParsedInvoiceLine[] {
  const lines: ParsedInvoiceLine[] = [];
  const blocks = splitBlocks(text);
  let lineNo = 0;

  for (const block of blocks) {
    const dateISO = resolveBlockDate(block.day, issueDateISO);
    // Captura la especie que aparece tras la fila. Cosas a tener en cuenta:
    //   - El separador "/" entre fila y especie es OPCIONAL: solo la primera fila del
    //     bloque lo trae; las siguientes pegan la especie directamente debajo.
    //   - La especie puede contener minúsculas en el código de zona FAO (p.ej.
    //     "ANEBOCARTE VIIIc", "JUREL IXa"), así que el rango admite [a-z] además.
    // IMPORTANTE: precio siempre tiene 3 decimales en San Martín (p.ej. "4,820").
    const re = /(\d{1,4})\s{2,}([A-ZÁÉÍÓÚÑ\. ]+?)([\d\.]+,\d{2})\s*([\d\.]*,\d{3})\s*([\d\.]+,\d{2})(?:\s*\n\s*\/?\s*\n?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ0-9 \/\-]+))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block.text)) !== null) {
      const [, buyerCode, buyerName, amountStr, priceStr, kilosStr, speciesRaw] = m;
      const amount = parseNumberES(amountStr);
      const price = parseNumberES(priceStr);
      const kilos = parseNumberES(kilosStr);
      const vatAmount = round2(amount * (defaultVatRate / 100));
      const rawSpecies = (speciesRaw ?? "").trim().replace(/\s+/g, " ").toUpperCase();

      if (!rawSpecies) continue;
      if (kilos <= 0 && amount <= 0) continue;

      lines.push({
        lineNo: ++lineNo,
        lineDate: dateISO,
        rawSpeciesName: rawSpecies,
        description: `${buyerCode} - ${buyerName.trim()}`,
        kilos, pricePerKg: price, amount,
        vatRate: defaultVatRate,
        vatAmount
      });
    }
  }
  return lines;
}

function splitBlocks(text: string): { day: string | null; text: string }[] {
  const parts = text.split(/Totales\s+para\s+el\s+dia\s+([0-9]{1,2}\/[0-9]{1,2})/i);
  const out: { day: string | null; text: string }[] = [];
  if (parts.length <= 1) return [{ day: null, text }];
  let i = 0;
  let current = parts[0];
  while (i + 1 < parts.length) {
    const day = parts[i + 1];
    out.push({ day, text: current });
    current = parts[i + 2] ?? "";
    i += 2;
  }
  return out;
}

function resolveBlockDate(day: string | null, invoiceDate: string | null): string | null {
  if (!day) return invoiceDate;
  const [d, mo] = day.split("/").map(s => s.trim());
  if (!invoiceDate) return null;
  const yyyy = invoiceDate.slice(0, 4);
  return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
