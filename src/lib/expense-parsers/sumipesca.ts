import { ExpenseParserHandler, ParsedExpense } from "./base";
import { parseNumberES } from "../money";

/**
 * Parser de facturas de SUMIPESCA, S.A. (proveedor de víveres / suministros).
 * CIF: A48168306.
 * Número: formato AÑO/SERIE/NUMERO (p.ej. "2026/25/195").
 */
export const sumipescaParser: ExpenseParserHandler = {
  key: "sumipesca",
  label: "Víveres · SUMIPESCA, S.A.",
  matches(ctx) {
    const t = ctx.rawText;
    return /\bA48168306\b/.test(t) || /SUMIPESCA/i.test(t);
  },
  parse(ctx): ParsedExpense {
    const t = ctx.rawText;

    const expenseNumber = firstMatch(t, [
      /N[uú]mero[:\s]*([0-9]{4}\/\d{1,3}\/\d+)/i,
      /\b(\d{4}\/\d{1,3}\/\d+)\b/
    ]);

    const issueDate = parseDate(firstMatch(t, [/Fecha[:\s]*(\d{2}\/\d{2}\/\d{4})/i, /(\d{2}\/\d{2}\/\d{4})/]));

    // Total: "Total Factura: 177,41€"
    const totalAmount = parseNumberES(firstMatch(t, [
      /Total\s+Factura[:\s]*([\d\.]+,\d{2})/i,
      /TOTAL\s+A\s+PAGAR[:\s]*([\d\.]+,\d{2})/i
    ]) ?? "0");

    // Tabla resumen IVA: "Base | Tipo | Cuota | Total"
    // ejemplo: "161,28 10% 16,13 177,41"
    let baseAmount = 0, vatRate = 10, vatAmount = 0;
    const ivaTable = t.match(/([\d\.]+,\d{2})\s+(\d{1,2})%\s+([\d\.]+,\d{2})/);
    if (ivaTable) {
      baseAmount = parseNumberES(ivaTable[1]);
      vatRate = parseNumberES(ivaTable[2]);
      vatAmount = parseNumberES(ivaTable[3]);
    } else if (totalAmount > 0) {
      baseAmount = Math.round((totalAmount / 1.10) * 100) / 100;
      vatAmount = Math.round((totalAmount - baseAmount) * 100) / 100;
    }

    return {
      expenseNumber: expenseNumber ?? null,
      issueDate,
      supplierName: "SUMIPESCA, S.A.",
      supplierTaxId: "A48168306",
      concept: "Víveres / suministros",
      category: "VIVERES",
      baseAmount,
      vatRate,
      vatAmount,
      totalAmount,
      currency: "EUR",
      meta: { formatKey: "sumipesca" }
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
