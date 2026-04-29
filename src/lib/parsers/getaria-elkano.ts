import { ParserHandler, ParsedInvoice } from "./base";
import { parseAndConsolidateBasqueLines } from "./_basque-shared";

/**
 * Parser del formato usado por ELKANO ARRANTZALEEN KOFRADIA (Cofradía Elkano),
 * Getaria, Gipuzkoa.
 *
 * CIF: G20045522 (ESG20045522 en formato VAT)
 * Dirección: Ipar Kaia-Lonja 28, 20808 GETARIA, Gipuzkoa
 *
 * Formato "ITSASONTZIKO FAKTURA / FACTURA DE BARCO", bilingüe.
 * Serie de factura: "B<numero>/<año>-<secuencia>" p.ej. "B1339/26-00002".
 *
 * Las líneas se consolidan por (fecha, especie) — varios compradores del
 * mismo pescado en el mismo día suman kilos e importes en una sola línea.
 */
export const getariaElkanoParser: ParserHandler = {
  key: "getaria-elkano",
  label: "Getaria · Elkano Kofradía",
  matches(ctx) {
    // Identificación estricta por CIF o nombre único del emisor.
    return /ESG?20045522\b/.test(ctx.rawText)
      || /ELKANO\s+ARRANTZALEEN/i.test(ctx.rawText);
  },
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;
    const defaultVat = Number((ctx.formatConfig?.defaultVatRate as number | undefined) ?? 10);

    const invoiceNumber = extractInvoiceNumber(text);
    const issueDate = extractIssueDate(text);

    const supplierName = /ELKANO\s+ARRANTZALEEN\s+KOFRADIA/i.test(text)
      ? "ELKANO ARRANTZALEEN KOFRADIA"
      : null;
    const supplierTaxId = "G20045522";
    const portName = "Getaria";
    const boatName = /IT[SX]AS\s+LAGUNAK/i.test(text) ? "ITSAS LAGUNAK" : null;

    const lines = parseAndConsolidateBasqueLines(text, issueDate, defaultVat);
    const subtotal = lines.reduce((a, l) => a + l.amount, 0);
    const total = subtotal;       // el usuario revisa en UI si falta algo

    return {
      invoiceNumber,
      issueDate,
      portName,
      boatName,
      supplierName,
      supplierTaxId,
      currency: "EUR",
      subtotal,
      taxes: 0,
      fees: 0,
      other: 0,
      total,
      notes: null,
      lines,
      meta: { formatKey: "getaria-elkano" }
    };
  }
};

/* ───────── helpers ───────── */

/** Busca "B<num>/<yy>-<seq>" con longitudes fijas (secuencia 5 dígitos). */
function extractInvoiceNumber(text: string): string | null {
  // Patrones observados: B1339/26-00002 (Getaria), B0342/26-00006 (Hondarribia).
  const m = text.match(/B\d{3,4}\/\d{2}-\d{5}/);
  return m ? m[0] : null;
}

/**
 * Busca la fecha de emisión exigiendo mismo separador en ambos lados
 * (evita capturar "39/26-0000" del nº de factura) y valida rangos día/mes/año.
 */
function extractIssueDate(text: string): string | null {
  for (const m of text.matchAll(/(\d{2})([\-\/])(\d{2})\2(\d{4})/g)) {
    const [, dd, , mm, yy] = m;
    const d = Number(dd), mo = Number(mm), y = Number(yy);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) {
      return `${yy}-${mm}-${dd}`;
    }
  }
  return null;
}
