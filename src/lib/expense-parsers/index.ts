import { ExpenseParserHandler, ExpenseParserContext, ParsedExpense } from "./base";
import { santonaGastosParser } from "./santona-gastos";
import { hondarribiaSanPedroGastosParser } from "./hondarribia-sanpedro-gastos";
import { agrocomercialUranzuParser } from "./agrocomercial-uranzu";
import { sumipescaParser } from "./sumipesca";
import { genericGastoParser } from "./generic-gasto";

/** Registro de parsers de gastos en orden de prioridad (genérico siempre el último). */
export const expenseRegistry: ExpenseParserHandler[] = [
  santonaGastosParser,
  hondarribiaSanPedroGastosParser,
  agrocomercialUranzuParser,
  sumipescaParser,
  genericGastoParser   // fallback
];

/**
 * Selecciona el parser de gasto adecuado según el texto del PDF.
 * Devuelve siempre uno (el genérico como último recurso).
 */
export function resolveExpenseParser(rawText: string): ExpenseParserHandler {
  const ctx: ExpenseParserContext = { rawText };
  for (const p of expenseRegistry) {
    if (p.key === "generic-gasto") continue;
    if (p.matches(ctx)) return p;
  }
  return genericGastoParser;
}

export type { ParsedExpense, ExpenseParserContext, ExpenseParserHandler };
export {
  santonaGastosParser,
  hondarribiaSanPedroGastosParser,
  agrocomercialUranzuParser,
  sumipescaParser,
  genericGastoParser
};
