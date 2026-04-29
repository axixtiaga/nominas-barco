import { ExpenseParserHandler, ParsedExpense } from "./base";
import { parseNumberES } from "../money";

/**
 * Parser de "FAKTURA GASTUAK / FACTURA GASTOS" de la Cofradía San Pedro (Hondarribia).
 *
 * Identificadores: CIF G20037339 + "FAKTURA GASTUAK".
 * Número de factura serie G (p.ej. "G/26-00048").
 * Fecha en formato DD-MM-YYYY.
 *
 * El cuerpo lista conceptos (Latiguillos, Camión grua, Pan, Hielo barco)
 * más cargos automáticos derivados de capturas (cofradía, federación, opegui).
 */
export const hondarribiaSanPedroGastosParser: ExpenseParserHandler = {
  key: "hondarribia-sanpedro-gastos",
  label: "Hondarribia · Gastos cofradía San Pedro (serie G)",
  matches(ctx) {
    const t = ctx.rawText;
    return /\bG20037339\b/.test(t)
      && /(FAKTURA\s+GASTUAK|FACTURA\s+GASTOS)/i.test(t);
  },
  parse(ctx): ParsedExpense {
    const t = ctx.rawText;

    const expenseNumber = firstMatch(t, [
      /\b(G\s*\/\s*\d{2}\s*-\s*\d+)\b/i
    ])?.replace(/\s+/g, "") ?? null;

    // Fecha en formato dd-mm-yyyy
    const issueDate = parseDate(firstMatch(t, [/(\d{2}-\d{2}-\d{4})/]));

    // Totales: Base imponible | %IVA | IVA | Total
    // "696,43  21,00  146,25  ...  1.253,93"
    let baseAmount = 0, vatRate = 21, vatAmount = 0, totalAmount = 0;
    const totalLineRe = /([\d\.]+,\d{2})\s+(\d{1,2}[,.]\d{2})\s+([\d\.]+,\d{2})/;
    const m = t.match(totalLineRe);
    if (m) {
      baseAmount = parseNumberES(m[1]);
      vatRate = parseNumberES(m[2]);
      vatAmount = parseNumberES(m[3]);
    }
    // El total final aparece destacado: "TOTAL FACTURA EUROS 1.253,93"
    totalAmount = parseNumberES(firstMatch(t, [
      /TOTAL\s+FACTURA(?:\s+EUROS)?\s*([\d\.]+,\d{2})/i,
      /GUZTIRA\s+FAKTURA\s*([\d\.]+,\d{2})/i
    ]) ?? String(baseAmount + vatAmount));

    // Concepto resumen: lista los "Total <X>" del bloque TOTALES
    let concept = "Gastos varios";
    const totales = Array.from(t.matchAll(/Total\s+(Hielo\s+barco|Latiguillos|Cami[oó]n\s+grua|Pan|G[aá]soil|V[ií]veres)/gi)).map(m => m[1]);
    if (totales.length) {
      const uniq = Array.from(new Set(totales.map(s => s.replace(/\s+/g, " "))));
      concept = uniq.join(" + ");
    }

    // Categoría heurística según el primer concepto encontrado
    const cat = guessCategory(t);

    return {
      expenseNumber,
      issueDate,
      supplierName: "COFRADIA DE MAREANTES DE SAN PEDRO",
      supplierTaxId: "G20037339",
      portName: "Hondarribia",
      concept,
      category: cat,
      baseAmount,
      vatRate,
      vatAmount,
      totalAmount,
      currency: "EUR",
      meta: { formatKey: "hondarribia-sanpedro-gastos" }
    };
  }
};

function guessCategory(t: string): "COFRADIA" | "MANTENIMIENTO" | "HIELO" | "VIVERES" | "OTRO" {
  // Si lleva cargos de cofradía/federación/opegui, es claramente COFRADIA.
  if (/(Cofrad[ií]a|Federaci[oó]n|Opegui)/i.test(t)) return "COFRADIA";
  if (/Latiguillos|Cami[oó]n\s+grua/i.test(t)) return "MANTENIMIENTO";
  if (/Hielo/i.test(t)) return "HIELO";
  if (/Pan|V[ií]veres/i.test(t)) return "VIVERES";
  return "OTRO";
}

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
