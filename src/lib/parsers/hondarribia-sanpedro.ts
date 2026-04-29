import { ParserHandler, ParsedInvoice, ParsedInvoiceLine } from "./base";
import { parseNumberES, round2 } from "../money";
import { consolidateLines } from "./_basque-shared";

/**
 * Parser del formato usado por la Cofradía de Mareantes de San Pedro
 * (Done Pedro Itsas Gizonen Kofradia), Hondarribia, Gipuzkoa.
 *
 * CIF: G20037339 (ESG20037339 en formato VAT)
 * Serie de factura: "B<numero>/<año>-<secuencia>" p.ej. "B0342/26-00005".
 *
 * Estructura de línea (4 renglones fusionados):
 *   <fecha DD-MM-YYYY>
 *   <especie>
 *   <kilos X,XX><precio X,XXX>
 *   <importe X,XX>
 *
 * Ejemplo real:
 *   25-03-2026
 *   ANTXOA - BOQUERON 57
 *   1.200,001,850
 *   2.220,00
 *
 *   (kilos 1.200,00 × precio 1,850 = importe 2.220,00)
 *
 * Líneas consolidadas por (fecha, especie).
 */
export const hondarribiaSanPedroParser: ParserHandler = {
  key: "hondarribia-sanpedro",
  label: "Hondarribia · Cofradía San Pedro",
  matches(ctx) {
    // Identificación estricta por CIF o nombre único del emisor.
    return /ESG?20037339\b/.test(ctx.rawText)
      || /DONE\s+PEDRO\s+ITSAS/i.test(ctx.rawText)
      || /MAREANTES\s+DE\s+SAN\s+PEDRO/i.test(ctx.rawText);
  },
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;
    const defaultVat = Number((ctx.formatConfig?.defaultVatRate as number | undefined) ?? 10);

    const invoiceNumber = (text.match(/B\d{3,4}\/\d{2}-\d{5}/) ?? [null])[0];
    const issueDate = extractIssueDate(text);

    const supplierName = /MAREANTES\s+DE\s+SAN\s+PEDRO/i.test(text)
      ? "COFRADÍA DE MAREANTES DE SAN PEDRO"
      : null;
    const supplierTaxId = "G20037339";
    const portName = "Hondarribia";
    const boatName = /IT[SX]AS\s+LAGUNAK/i.test(text) ? "ITSAS LAGUNAK" : null;

    const rawLines = parseLines(text, defaultVat);
    const lines = consolidateLines(rawLines);
    const subtotal = lines.reduce((a, l) => a + l.amount, 0);

    // Totales declarados en el PDF
    const taxes = extractValueAfter(text, /Base\s+Imponible[\s\S]*?I\.?V\.?A\.?[\s\S]*?/i)
               ?? extractTax(text) ?? round2(subtotal * (defaultVat / 100));
    const total = extractValueAfter(text, /TOTAL\s+FACTURA\s+EUROS/i) ?? extractTotalPesca(text) ?? (subtotal + taxes);

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
      meta: { formatKey: "hondarribia-sanpedro" }
    };
  }
};

/* ───────── helpers ───────── */

/** Parsea líneas con el patrón de 4 renglones por fila (ver cabecera). */
function parseLines(text: string, defaultVatRate: number): ParsedInvoiceLine[] {
  const lines: ParsedInvoiceLine[] = [];

  // 1=fecha DD-MM-YYYY, 2=especie (empieza con letra), 3=kilos (2 dec), 4=precio (3 dec), 5=importe (2 dec)
  const re = /(\d{2}-\d{2}-\d{4})\s*\n\s*([A-ZÁÉÍÓÚÑa-záéíóúñ][^\n]*?)\s*\n\s*([\d\.]+,\d{2})([\d\.]+,\d{3})\s*\n\s*([\d\.]+,\d{2})/g;

  let m: RegExpExecArray | null;
  let lineNo = 0;
  while ((m = re.exec(text)) !== null) {
    const [, dateStr, speciesRaw, kilosStr, priceStr, amountStr] = m;
    const kilos = parseNumberES(kilosStr);
    const price = parseNumberES(priceStr);
    const amount = parseNumberES(amountStr);
    const rawSpecies = speciesRaw.replace(/\s+/g, " ").trim().toUpperCase();

    if (!rawSpecies) continue;
    if (kilos <= 0 && amount <= 0) continue;

    // Descarta si la "especie" resulta ser una fila de totales
    if (/^(TOTAL|GUZTIRA|BASE|DESCUENTO)/i.test(rawSpecies)) continue;

    const [d, mo, y] = dateStr.split("-");
    const lineDate = `${y}-${mo}-${d}`;
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

function extractIssueDate(text: string): string | null {
  // Fecha de cabecera con formato DD-MM-YYYY o DD/MM/YYYY con mismo separador en los dos sitios.
  for (const m of text.matchAll(/(\d{2})([\-\/])(\d{2})\2(\d{4})/g)) {
    const [, dd, , mm, yy] = m;
    const d = Number(dd), mo = Number(mm), y = Number(yy);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) {
      return `${yy}-${mm}-${dd}`;
    }
  }
  return null;
}

/** Busca un número con 2 decimales después de una marca textual. */
function extractValueAfter(text: string, marker: RegExp): number | null {
  const m = text.match(marker);
  if (!m) return null;
  const idx = text.indexOf(m[0]) + m[0].length;
  const after = text.slice(idx, idx + 200);
  const nums = [...after.matchAll(/([\d\.]+,\d{2})(?!\d)/g)].map(x => x[1]);
  return nums.length ? parseNumberES(nums[0]) : null;
}

function extractTotalPesca(text: string): number | null {
  const m = text.match(/TOTAL\s+PESCA/i);
  if (!m) return null;
  const idx = text.indexOf(m[0]) + m[0].length;
  const after = text.slice(idx, idx + 200);
  const nums = [...after.matchAll(/([\d\.]+,\d{2})(?!\d)/g)].map(x => x[1]);
  return nums.length ? parseNumberES(nums[nums.length - 1]) : null;
}

/** Busca "10,00" o "IVA/B.E.Z." seguido del valor de impuestos. */
function extractTax(text: string): number | null {
  const m = text.match(/(?:B\.E\.Z\.|I\.V\.A\.)[\s\S]{0,60}?([\d\.]+,\d{2})(?!\d)/i);
  return m ? parseNumberES(m[1]) : null;
}
