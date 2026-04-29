import { ExpenseParserHandler, ParsedExpense } from "./base";
import { parseNumberES } from "../money";

/**
 * Parser genérico de fallback para gastos que no encajen en ningún otro formato.
 * Intenta capturar: CIF emisor, fecha, total. Deja el resto vacío para revisión manual.
 */
export const genericGastoParser: ExpenseParserHandler = {
  key: "generic-gasto",
  label: "Gasto · genérico (fallback)",
  matches() { return true; },
  parse(ctx): ParsedExpense {
    const t = ctx.rawText;
    const taxId = firstMatch(t, [
      /CIF[:\s]*([A-Z]\d{8})/i,
      /N\.?I\.?F\.?[:\s]*([A-Z]\d{8})/i,
      /\b([A-Z]\d{8})\b/
    ]);
    const issueDate = parseDate(firstMatch(t, [/(\d{2}\/\d{2}\/\d{4})/, /(\d{2}-\d{2}-\d{4})/]));
    const totalAmount = parseNumberES(firstMatch(t, [
      /TOTAL\s+A\s+PAGAR[:\s]*([\d\.]+,\d{2})/i,
      /TOTAL\s+FACTURA[:\s]*([\d\.]+,\d{2})/i,
      /TOTAL[:\s]*([\d\.]+,\d{2})/i
    ]) ?? "0");

    return {
      expenseNumber: null,
      issueDate,
      supplierName: null,
      supplierTaxId: taxId,
      concept: "Por revisar (parser genérico)",
      category: "OTRO",
      baseAmount: 0,
      vatRate: 0,
      vatAmount: 0,
      totalAmount,
      currency: "EUR",
      meta: { formatKey: "generic-gasto" }
    };
  }
};

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
