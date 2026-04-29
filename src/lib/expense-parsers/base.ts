// Tipos compartidos para los parsers de gastos.
// Cada parser implementa ExpenseParserHandler y se registra en expense-parsers/index.ts

export type ExpenseCategoryKey =
  | "COFRADIA"
  | "COMBUSTIBLE"
  | "HIELO"
  | "VIVERES"
  | "TELEFONIA"
  | "TRANSPORTE"
  | "MANTENIMIENTO"
  | "OTRO";

export type ParsedExpenseLine = {
  lineNo: number;
  lineDate?: string | null;            // ISO yyyy-mm-dd (fecha del albarán/concepto)
  conceptCode?: string | null;          // código del concepto (ej. "99.010", "20")
  description: string;                  // texto libre
  reference?: string | null;            // ej. "B26-964" — albarán origen
  quantity?: number;
  unitPrice?: number;
  amount: number;
  /** Si true (por defecto), la línea se descuenta del montemayor.
   *  Para gastos como "Cuota Voluntaria" (que ya están descontados en la captura)
   *  el parser puede ponerlo a false. */
  includeInMontemayor?: boolean;
  notes?: string | null;
};

export type ParsedExpense = {
  expenseNumber?: string | null;
  issueDate?: string | null;          // ISO yyyy-mm-dd
  serviceDate?: string | null;         // ISO; si distinta de la de emisión
  supplierName?: string | null;
  supplierTaxId?: string | null;
  portName?: string | null;            // si el gasto viene de un puerto/cofradía
  concept?: string | null;             // texto libre / resumen
  category?: ExpenseCategoryKey;
  baseAmount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  currency?: string;
  notes?: string | null;
  /** Líneas de detalle (cada concepto/albarán). Solo Santoña gastos las usa por ahora. */
  lines?: ParsedExpenseLine[];
  /** Metadatos sueltos */
  meta?: Record<string, unknown>;
};

export type ExpenseParserContext = {
  rawText: string;
  formatConfig?: Record<string, unknown>;
};

export interface ExpenseParserHandler {
  key: string;
  label: string;
  matches(ctx: ExpenseParserContext): boolean;
  parse(ctx: ExpenseParserContext): ParsedExpense;
}
