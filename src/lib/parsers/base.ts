// Tipos compartidos para el sistema de parsers.
// Cada parser implementa ParserHandler y se registra en parsers/index.ts

export type ParsedInvoiceLine = {
  lineNo: number;
  lineDate?: string | null;         // ISO yyyy-mm-dd
  rawSpeciesName: string;
  description?: string | null;       // comprador / texto libre
  kilos: number;
  pricePerKg: number;
  amount: number;
  vatRate?: number;
  vatAmount?: number;
  notes?: string | null;
};

export type ParsedInvoice = {
  invoiceNumber?: string | null;
  issueDate?: string | null;         // ISO
  portName?: string | null;
  boatName?: string | null;
  supplierName?: string | null;
  supplierTaxId?: string | null;
  currency?: string;
  subtotal: number;
  taxes: number;
  fees: number;
  other: number;
  total: number;
  notes?: string | null;
  lines: ParsedInvoiceLine[];
  /** metadatos y residuos que el parser no supo estructurar (se guardan en documento.rawParsed) */
  meta?: Record<string, unknown>;
};

export type ParserContext = {
  rawText: string;
  portHint?: string | null;
  formatConfig?: Record<string, unknown>;
};

export interface ParserHandler {
  key: string;                                  // "hondarribia-sanmartin", "generic"...
  label: string;
  /** Devuelve true si el parser reconoce el documento. */
  matches(ctx: ParserContext): boolean;
  parse(ctx: ParserContext): ParsedInvoice;
}
