import { ExpenseParserHandler, ParsedExpense } from "./base";
import { parseNumberES } from "../money";

/**
 * Parser de facturas de AGROCOMERCIAL URANZU S.L. (proveedor de víveres).
 * CIF: B20597142.
 * Número: serie A (p.ej. "A26004546").
 */
export const agrocomercialUranzuParser: ExpenseParserHandler = {
  key: "agrocomercial-uranzu",
  label: "Víveres · AGROCOMERCIAL URANZU S.L.",
  matches(ctx) {
    const t = ctx.rawText;
    return /\bB20597142\b/.test(t) || /AGROCOMERCIAL\s+URANZU/i.test(t);
  },
  parse(ctx): ParsedExpense {
    const t = ctx.rawText;

    const expenseNumber = firstMatch(t, [
      /\b(A\d{6,8})\b/,
      /Faktura\s*zbk\s*[\s\n]*N[ºo°]?\s*Factura\s*[\s\n]*([A-Z]\d{6,8})/i
    ]);

    const issueDate = parseDate(firstMatch(t, [/(\d{2}\/\d{2}\/\d{4})/]));

    // Total: "TOTAL A PAGAR  258,38" o "FAKTURA GUZTIRA / TOTAL FACTURA  258,38"
    const totalAmount = parseNumberES(firstMatch(t, [
      /TOTAL\s+A\s+PAGAR\s*([\d\.]+,\d{2})/i,
      /(?:FAKTURA\s+GUZTIRA|TOTAL\s+FACTURA)\s*([\d\.]+,\d{2})/i
    ]) ?? "0");

    // Sumar cuotas IVA por línea (4%, 10%, 21%)
    const vatLines = Array.from(t.matchAll(/(\d{1,2}[,.]\d{2})%?\s+([\d\.]+,\d{2})/g));
    let baseAmount = 0, vatAmount = 0;
    // Mejor extraer el sumatorio de la fila final (tabla de IVAs)
    const totalLine = firstMatch(t, [/([\d\.]+,\d{2})\s*\n?\s*TOTAL\s+A\s+PAGAR/i]);
    // Alternativa más robusta: buscar la fila resumen al final.
    const sumLine = t.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*\n?\s*TOTAL\s+A\s+PAGAR/i);
    if (sumLine) {
      vatAmount = parseNumberES(sumLine[1]);
      baseAmount = parseNumberES(String(totalAmount - vatAmount));
    } else {
      // Como fallback, base = total / 1.10 aproximado
      baseAmount = totalAmount > 0 ? Math.round((totalAmount / 1.10) * 100) / 100 : 0;
      vatAmount = Math.round((totalAmount - baseAmount) * 100) / 100;
    }

    return {
      expenseNumber: expenseNumber ?? null,
      issueDate,
      supplierName: "AGROCOMERCIAL URANZU S.L.",
      supplierTaxId: "B20597142",
      concept: "Víveres / suministros generales",
      category: "VIVERES",
      baseAmount,
      vatRate: baseAmount > 0 ? Math.round((vatAmount / baseAmount) * 10000) / 100 : 10,
      vatAmount,
      totalAmount,
      currency: "EUR",
      meta: { formatKey: "agrocomercial-uranzu" }
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
