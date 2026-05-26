import { ExpenseParserHandler, ParsedExpense, ParsedExpenseLine } from "./base";
import { parseNumberES } from "../money";

/**
 * Parser de FACTURAS DE GASTO de la NUEVA RULA DE AVILES, S.A. (CIF A74242512).
 *
 * OJO: es el MISMO emisor que las capturas de Avilés (aviles-rula). La
 * diferencia es que estas facturas son por SERVICIOS (p.ej. "Servicio Cajas"),
 * con la columna T = "G" y un número de factura serie "CB" (p.ej. CB601274),
 * mientras que las capturas son ventas de pescado (T = "K", factura serie "AV").
 *
 * Por eso el matches() exige A74242512 + un indicador de gasto/servicio.
 *
 * ESTRUCTURA del texto extraído con pdf-parse (campos partidos/pegados):
 *
 *   CB601274                ← Factura
 *   19 - May - 2026         ← Fecha
 *   ITSAS LAGUNAK           ← Embarcación
 *   ...
 *   Albaran nº :CB/26-0413219-05-26   ← referencia albarán + fecha
 *   122,30                            ← importe del albarán (subtotal grupo)
 *   Servicio  Cajas   PL-21           ← concepto
 *   G                                 ← T (servicio)
 *   19-05-26SERV.CAJAS1.223,000,100122,30  ← fecha+ref+cantidad+precio+importe pegados
 *   ...
 *   TOTAL FACTURA
 *   147,98
 *   147,9825,6821,00122,30122,30      ← total+IVA+%IVA+base+importe pegados (reversed)
 */
export const avilesGastosParser: ExpenseParserHandler = {
  key: "aviles-gastos",
  label: "Avilés · Gastos/servicios Rula (serie CB)",
  matches(ctx) {
    const t = ctx.rawText;
    if (!/\bA74242512\b/.test(t)) return false;
    // Indicadores de que es un GASTO de Avilés (no una venta de pescado):
    return /\bSERV(ICIO|\.)/i.test(t)
      || /\bCB\d{6}\b/.test(t)
      || /Albaran\s+n[º°]?\s*:?\s*CB\//i.test(t);
  },
  parse(ctx): ParsedExpense {
    const t = ctx.rawText;
    const allLines = t.split(/\r?\n/).map(l => l.trim());

    // Número de factura: "CB601274"
    const expenseNumber = firstMatch(t, [/\b(CB\d{6,})\b/]) ?? null;

    // Fecha: "19 - May - 2026" (mes abreviado o completo)
    const issueDate = parseEsDate(firstMatch(t, [
      /(\d{1,2}\s*-\s*[A-Za-zñÑáéíóú]+\s*-\s*\d{4})/
    ]));

    // Referencia del albarán: "Albaran nº :CB/26-0413219-05-26" → "CB/26-04132".
    // Lookahead a la fecha (dd-mm-yy) que viene pegada, para no tragarnos sus dígitos.
    const reference = (firstMatch(t, [
      /Albaran\s+n[º°]?\s*:?\s*(CB\/?\d{2}-\d+?)(?=\d{2}-\d{2}-\d{2})/i,
      /Albaran\s+n[º°]?\s*:?\s*(CB\/?\d{2}-\d+)/i
    ])) ?? null;

    // Líneas de detalle
    const lines = parseDetailLines(allLines, issueDate, reference);

    // Totales: línea "147,9825,6821,00122,30122,30" = total+IVA+%IVA+base+importe (reversed)
    let baseAmount = 0, vatRate = 21, vatAmount = 0, totalAmount = 0;
    const totM = t.match(/^(\d[\d\.]*,\d{2})(\d[\d\.]*,\d{2})(\d{1,2},\d{2})(\d[\d\.]*,\d{2})(\d[\d\.]*,\d{2})$/m);
    if (totM) {
      totalAmount = parseNumberES(totM[1]);
      vatAmount   = parseNumberES(totM[2]);
      vatRate     = parseNumberES(totM[3]);
      baseAmount  = parseNumberES(totM[4]);
    }
    // Fallbacks
    const sumLines = round2(lines.reduce((a, l) => a + l.amount, 0));
    if (!baseAmount) baseAmount = sumLines;
    if (!totalAmount) {
      totalAmount = parseAmountFromMatch(t, [/TOTAL\s+FACTURA[\s\n]+([\d\.]+,\d{2})/i]) ?? round2(baseAmount + vatAmount);
    }

    const category = /caja/i.test(t) ? "CAJAS" : "OTRO";

    return {
      expenseNumber,
      issueDate,
      supplierName: "NUEVA RULA DE AVILES, S.A.",
      supplierTaxId: "A74242512",
      portName: "Avilés",
      concept: buildConcept(lines),
      category: category as any,
      baseAmount: round2(baseAmount),
      vatRate,
      vatAmount: round2(vatAmount),
      totalAmount: round2(totalAmount),
      currency: "EUR",
      notes: reference ? `Albarán: ${reference}` : null,
      lines,
      meta: { formatKey: "aviles-gastos", reference }
    };
  }
};

/* ───────── helpers ───────── */

/**
 * Extrae las líneas de servicio. La "línea de datos" tiene este patrón pegado:
 *   "19-05-26SERV.CAJAS1.223,000,100122,30"
 *   = fecha(dd-mm-yy) + ref(letras/puntos) + cantidad(2dec) + precio(3dec) + importe(2dec)
 * La descripción ("Servicio Cajas PL-21") está en una línea de texto anterior.
 */
function parseDetailLines(allLines: string[], issueDate: string | null, reference: string | null): ParsedExpenseLine[] {
  const out: ParsedExpenseLine[] = [];
  const dataRe = /^(\d{2}-\d{2}-\d{2})([A-Z][A-Z\. ]*?)(\d[\d\.]*,\d{2})(\d[\d\.]*,\d{3})(\d[\d\.]*,\d{2})$/;

  for (let i = 0; i < allLines.length; i++) {
    const m = allLines[i].match(dataRe);
    if (!m) continue;

    const dateStr = m[1];
    const ref = m[2].trim();
    const cantidad = parseNumberES(m[3]);
    const precio = parseNumberES(m[4]);
    const importe = parseNumberES(m[5]);

    // Validación: cantidad × precio ≈ importe
    if (Math.abs(cantidad * precio - importe) > Math.max(0.05, importe * 0.02)) continue;

    // Descripción: la línea de texto anterior (saltando la T de una sola letra).
    let desc = ref;
    for (let k = i - 1; k >= 0 && k >= i - 4; k--) {
      const cand = allLines[k];
      if (/^[A-Z]$/.test(cand)) continue;          // columna T ("G")
      if (/^[\d\.,\-]+$/.test(cand)) continue;       // un número suelto
      if (/^Albaran/i.test(cand)) continue;          // cabecera del albarán
      if (cand.length > 1) { desc = cand.replace(/\s+/g, " ").trim(); break; }
    }

    const lineDate = parseShortDate(dateStr, issueDate);
    out.push({
      lineNo: out.length + 1,
      lineDate,
      conceptCode: null,
      description: desc || ref || "(servicio)",
      reference,
      quantity: round2(cantidad),
      unitPrice: round2(precio),
      amount: round2(importe),
      includeInMontemayor: true
    });
  }

  return out;
}

function buildConcept(lines: ParsedExpenseLine[]): string {
  if (!lines.length) return "Servicio Rula Avilés";
  const uniq = Array.from(new Set(lines.map(l => l.description)));
  return uniq.join(" + ");
}

const MONTHS3: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12"
};

/** Parsea "19 - May - 2026" o "19 - Mayo - 2026" → "2026-05-19" */
function parseEsDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*-\s*([A-Za-zñÑáéíóú]+)\s*-\s*(\d{4})/);
  if (!m) return null;
  const [, d, monthName, y] = m;
  const mm = MONTHS3[monthName.toLowerCase().slice(0, 3)];
  if (!mm) return null;
  return `${y}-${mm}-${d.padStart(2, "0")}`;
}

/** Parsea "19-05-26" → "2026-05-19" */
function parseShortDate(s: string, fallback: string | null): string | null {
  const m = s.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return fallback;
  const [, d, mo, y] = m;
  const yyyy = Number(y) > 70 ? "19" + y : "20" + y;
  return `${yyyy}-${mo}-${d}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function firstMatch(text: string, regexes: RegExp[]): string | null {
  for (const re of regexes) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
    if (m && !m[1] && m[0]) return m[0].trim();
  }
  return null;
}

function parseAmountFromMatch(text: string, regexes: RegExp[], group = 1): number | null {
  for (const re of regexes) {
    const m = text.match(re);
    if (m && m[group]) return parseNumberES(m[group]);
  }
  return null;
}
