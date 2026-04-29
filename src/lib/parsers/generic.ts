import { ParserHandler, ParsedInvoice } from "./base";
import { parseNumberES } from "../money";

/**
 * Parser por defecto. No asume ningún formato concreto.
 * Intenta extraer lo mínimo (nº factura, fecha, total) con heurísticas muy conservadoras.
 * Devuelve cabecera y totales a 0 si no está seguro — el usuario revisa manualmente.
 */
export const genericParser: ParserHandler = {
  key: "generic",
  label: "Genérico",
  matches: () => true,                         // fallback, siempre último en el registry
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;

    const invoiceNumber = match(text, /(?:n[ºo°]?\s*factura|factura\s*n[ºo°]?)[:\s]*([A-Z0-9\-\/\.]+)/i);
    const issueDate = parseDate(match(text, /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/));
    const totalStr = match(text, /total\s*factura[:\s]*([0-9\.\,]+)/i);

    return {
      invoiceNumber,
      issueDate,
      portName: ctx.portHint ?? null,
      boatName: null,
      supplierName: null,
      supplierTaxId: null,
      currency: "EUR",
      subtotal: 0, taxes: 0, fees: 0, other: 0,
      total: parseNumberES(totalStr),
      notes: null,
      lines: [],
      meta: { reason: "generic-parser", rawTextPreview: text.slice(0, 600) }
    };
  }
};

function match(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1]?.trim() ?? null;
}
function parseDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const yyyy = y.length === 2 ? (Number(y) > 70 ? "19" + y : "20" + y) : y;
  const iso = `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return iso;
}
