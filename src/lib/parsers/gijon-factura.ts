import { ParserHandler, ParsedInvoice, ParsedInvoiceLine } from "./base";
import { parseNumberES, round2 } from "../money";
import { consolidateLines } from "./_basque-shared";

/**
 * Parser de FACTURA de pesca (sufijo "FP") de LONJA GIJÓN MUSEL S.A.
 *
 * Es DISTINTO al parser "gijon-lonja" (que cubría la "LISTA DE COMPRAS"). Aquí
 * el documento es una FACTURA con número tipo "4-G", varias líneas por especie
 * y subtotales por especie y media total.
 *
 * Identificadores: presencia de "LONJA GIJÓN MUSEL" + "Importe Subasta"
 * (la lista de compras NO tiene "Importe Subasta", la factura SÍ).
 *
 * Estructura de CADA línea de detalle en el texto extraído por pdf-parse —
 * son TRES sub-líneas seguidas:
 *
 *   1015-ANCHOA  MSC      663,0016/05    682     ← código-NOMBRE + kilos + fecha(dd/mm) + comprador
 *     2,25  1.491,75                              ← precio + importe
 *   377/7346                                      ← referencia (vale)
 *
 * Entre líneas de la misma especie aparecen subtotales (importe medio del
 * grupo, kilos totales del grupo) que se IGNORAN automáticamente porque no
 * encajan en el patrón de detalle.
 *
 * Totales (al pie): "Importe Subasta", "Base Imponible", "Cuota I.V.A.",
 * "Total Factura", "Total a Pagar" — los valores aparecen como una columna
 * de decimales tras la lista de etiquetas.
 */
export const gijonFacturaParser: ParserHandler = {
  key: "gijon-factura",
  label: "Gijón · Lonja Gijón Musel (factura de pesca)",
  matches(ctx) {
    const t = ctx.rawText;
    return /LONJA\s+GIJ[OÓ]N\s+MUSEL/i.test(t)
      && /Importe\s+Subasta/i.test(t);
  },
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;
    const allLines = text.split(/\r?\n/);
    const defaultVat = Number((ctx.formatConfig?.defaultVatRate as number | undefined) ?? 10);

    // Nº factura: "FACTURA: 4-G"
    const invoiceNumber = firstMatch(text, [
      /FACTURA:\s*([\w\-]+)/i
    ]);

    // Fecha "FECHA: 16/05/2025"
    const issueDate = parseDate(firstMatch(text, [
      /FECHA:\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i,
      /(\d{2}\/\d{2}\/\d{4})/
    ]));

    const supplierName = "LONJA GIJÓN MUSEL S.A.";
    const supplierTaxId = "A33831934";
    const portName = "Gijón";
    const boatName = /IT[SX]AS\s+LAGUNAK/i.test(text) ? "ITSAS LAGUNAK" : null;

    const issueYear = issueDate ? Number(issueDate.slice(0, 4)) : new Date().getFullYear();
    const rawLines = parseLines(allLines, issueYear);
    const lines = consolidateLines(rawLines);

    // Totales del pie. Los valores aparecen como columna ordenada tras la
    // lista de etiquetas (Importe Subasta / Importe Compra / Base Imponible /
    // Cuota IVA / Total Factura / Total a Pagar).
    const totals = extractTotals(allLines);
    const baseAmount = totals.baseAmount ?? round2(lines.reduce((a, l) => a + l.amount, 0));
    const vatAmount = totals.vatAmount ?? round2(baseAmount * (defaultVat / 100));
    const totalAmount = totals.totalAmount ?? round2(baseAmount + vatAmount);
    const vatRate = totals.vatRate ?? defaultVat;

    return {
      invoiceNumber,
      issueDate,
      portName,
      boatName,
      supplierName,
      supplierTaxId,
      currency: "EUR",
      subtotal: round2(baseAmount),
      taxes: round2(vatAmount),
      fees: 0,
      other: 0,
      total: round2(totalAmount),
      notes: null,
      lines,
      meta: { formatKey: "gijon-factura", documentKind: "FACTURA-FP", ivaRate: vatRate }
    };
  }
};

/* ───────── helpers ───────── */

/**
 * Extrae las líneas de detalle. Cada línea ocupa 3 sub-líneas en el texto:
 *   [i]   "1015-ANCHOA  MSC      663,0016/05    682"
 *   [i+1] "  2,25  1.491,75"
 *   [i+2] "377/7346"
 *
 * Validación: kilos × precio ≈ importe (tolerancia 5%).
 */
function parseLines(allLines: string[], issueYear: number): ParsedInvoiceLine[] {
  const out: ParsedInvoiceLine[] = [];
  // {código}-{NOMBRE}   {kilos(2dec)}{dd/mm}   {compradorId}
  const detailRe = /^\s*(\d+)-(.+?)\s+([\d\.]+,\d{2})(\d{2}\/\d{2})\s+(\d+)\s*$/;
  // {precio}   {importe} (precio puede tener 2 decimales)
  const priceAmountRe = /^\s*(\d[\d\.]*,\d{2})\s+([\d\.]+,\d{2})\s*$/;
  // referencia "N/N"
  const refRe = /^\s*(\d+\/\d+)\s*$/;

  for (let i = 0; i < allLines.length; i++) {
    const dm = allLines[i].match(detailRe);
    if (!dm) continue;

    const code = dm[1];
    const speciesName = dm[2].replace(/\s+/g, " ").trim();
    const kilos = parseNumberES(dm[3]);
    const dateStr = dm[4];     // dd/mm
    const buyerId = dm[5];

    // Buscamos en las siguientes 3-4 líneas el par precio/importe y la referencia.
    // Saltamos posibles líneas "vacías" o subtotales sueltos (bare decimal).
    let price = 0, importe = 0, reference: string | null = null;
    let foundPriceAmount = false;
    for (let k = i + 1; k < Math.min(allLines.length, i + 5); k++) {
      // Si aparece otro detail antes de encontrar todo, paramos.
      if (detailRe.test(allLines[k])) break;
      if (!foundPriceAmount) {
        const pm = allLines[k].match(priceAmountRe);
        if (pm) {
          price = parseNumberES(pm[1]);
          importe = parseNumberES(pm[2]);
          foundPriceAmount = true;
          continue;
        }
      }
      const rm = allLines[k].match(refRe);
      if (rm) { reference = rm[1]; break; }
    }

    if (!foundPriceAmount) continue;
    // Validación matemática
    const expected = kilos * price;
    const tolerance = Math.max(0.05, importe * 0.05);
    if (Math.abs(expected - importe) > tolerance) continue;

    // Fecha de línea: dd/mm + año de la factura
    const [dd, mm] = dateStr.split("/");
    const lineDate = `${issueYear}-${mm}-${dd}`;
    const vatAmount = round2(importe * 0.10);  // IVA 10% por línea (la fra. lo recoge global, aquí informativo)

    out.push({
      lineNo: out.length + 1,
      lineDate,
      rawSpeciesName: speciesName.toUpperCase(),
      description: `Comprador ${buyerId}${reference ? ` · vale ${reference}` : ""}`,
      kilos: round2(kilos),
      pricePerKg: round2(price),
      amount: round2(importe),
      vatRate: 10,
      vatAmount
    });
  }

  return out;
}

/**
 * Lee los totales del pie. El bloque pdf-parse separa las etiquetas de los
 * valores: las 5-6 etiquetas vienen primero, después una columna con los 5-6
 * valores. Aprovechamos esa estructura.
 */
function extractTotals(allLines: string[]): {
  baseAmount: number | null; vatAmount: number | null;
  totalAmount: number | null; vatRate: number | null;
} {
  // Posición del primer valor (después del bloque "Importe Subasta...Total a Pagar")
  let firstValueIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (/Total\s+a\s+Pagar/i.test(allLines[i])) {
      // Buscamos la siguiente línea que sea solo un decimal
      for (let k = i + 1; k < Math.min(allLines.length, i + 5); k++) {
        if (/^\s*[\d\.]+,\d{2}\s*$/.test(allLines[k])) { firstValueIdx = k; break; }
      }
      break;
    }
  }
  if (firstValueIdx < 0) {
    return { baseAmount: null, vatAmount: null, totalAmount: null, vatRate: null };
  }
  // Cogemos hasta 6 decimales seguidos: 0=subasta, 1=compra, 2=base, 3=iva, 4=total fra, 5=total a pagar.
  const values: number[] = [];
  for (let k = firstValueIdx; k < allLines.length && values.length < 6; k++) {
    const m = allLines[k].match(/^\s*([\d\.]+,\d{2})\s*$/);
    if (!m) break;
    values.push(parseNumberES(m[1]));
  }
  const baseAmount  = values[2] ?? null;
  const vatAmount   = values[3] ?? null;
  const totalAmount = values[5] ?? values[4] ?? null;

  // Tipo de IVA — buscamos "10,00 %" o similar
  let vatRate: number | null = null;
  for (const l of allLines) {
    const m = l.match(/(\d{1,2},\d{2})\s*%/);
    if (m) { vatRate = parseNumberES(m[1]); break; }
  }

  return { baseAmount, vatAmount, totalAmount, vatRate };
}

function firstMatch(text: string, regexes: RegExp[]): string | null {
  for (const re of regexes) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
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
