import { ExpenseParserHandler, ParsedExpense, ParsedExpenseLine } from "./base";
import { parseNumberES } from "../money";

/**
 * Parser de "ALBARAN DE GASTOS Y SERVICIOS" de la Cofradía de Pescadores de
 * San Vicente de la Barquera (CIF G39024567, serie D, p.ej. "D26 / 504").
 *
 * OJO: es el MISMO emisor que las capturas de San Vicente (POLIZA PESCA
 * SUBASTADA), por eso el matches() exige además la leyenda "ALBARAN DE GASTOS
 * Y SERVICIOS" para no confundirlo con una venta.
 *
 * ESTRUCTURA del texto extraído con pdf-parse (campos pegados al final de cada
 * línea de detalle; algunas líneas de detalle se parten en varias):
 *
 *   99.010   Cuota Voluntaria (3,50%) (B26-504)1,00430,310430,31
 *     └código └descripción                     └cant└precio └importe
 *   6   Alquiler caja barco (18/05/2026) (B26-504)764,000,12091,68
 *   20   Palets (18/05/2026) (B26-504)20,000,91018,20
 *   60   CAJAS COGIDAS DEL DEPOSITO (11/05/2026) (B26-504)-400,00   ← solo cantidad (sin importe)
 *   62   PALETS COGIDOS DEL DEPOSITO (11/05/2026)
 *   (B26-504)                                                       ← continuación de la línea anterior
 *   -10,00                                                          ← cantidad de la línea 62
 *
 * Totales (recuadro inferior):
 *   430,31 / 109,88   ← bases por tipo de IVA
 *   %10,00 / %21,00   ← tipos de IVA
 *   43,03 / 23,07     ← IVA por tipo
 *   606,29            ← TOTAL
 *   540,1966,10Totales ← base total (540,19) + IVA total (66,10)
 *
 * Como pidió el usuario, se extraen TODAS las líneas (incluso las de depósito
 * sin importe) para que él decida cuáles son gasto real.
 */
export const sanvicenteGastosParser: ExpenseParserHandler = {
  key: "sanvicente-gastos",
  label: "San Vicente · Albarán gastos y servicios (serie D)",
  matches(ctx) {
    const t = ctx.rawText;
    return /\bG39024567\b/.test(t)
      && /ALBAR[AÁ]N\s+DE\s+GASTOS\s+Y\s+SERVICIOS/i.test(t);
  },
  parse(ctx): ParsedExpense {
    const t = ctx.rawText;
    const allLines = t.split(/\r?\n/).map(l => l.trim());

    // Número: "D26 / 504"
    const expenseNumber = firstMatch(t, [/\b(D\d{2}\s*\/\s*\d+)\b/])?.replace(/\s+/g, "") ?? null;

    // Fecha dd/mm/yyyy
    const issueDate = parseDate(firstMatch(t, [/(\d{2}\/\d{2}\/\d{4})/]));

    // Líneas de detalle
    const lines = parseDetailLines(allLines, issueDate);

    // Totales: "540,1966,10Totales" → base total, IVA total
    let baseAmount = 0, vatAmount = 0;
    const totM = t.match(/(\d[\d\.]*,\d{2})(\d[\d\.]*,\d{2})\s*Totales/i);
    if (totM) { baseAmount = parseNumberES(totM[1]); vatAmount = parseNumberES(totM[2]); }
    const sumLines = round2(lines.reduce((a, l) => a + l.amount, 0));
    if (!baseAmount) baseAmount = sumLines;

    // Tipos de IVA presentes (puede haber varios: 10% y 21%)
    const vatRates = Array.from(t.matchAll(/%\s*(\d{1,2},\d{2})/g)).map(m => parseNumberES(m[1]));
    const totalAmount = round2(baseAmount + vatAmount);
    const effectiveRate = baseAmount > 0 ? round2(vatAmount / baseAmount * 100) : 0;

    const notes = vatRates.length > 1
      ? `IVA con varios tipos (${vatRates.map(r => fmtPct(r)).join(" + ")}). Tipo efectivo aplicado: ${fmtPct(effectiveRate)}.`
      : null;

    return {
      expenseNumber,
      issueDate,
      supplierName: "COFRADIA DE PESCADORES DE SAN VICENTE",
      supplierTaxId: "G39024567",
      portName: "San Vicente de la Barquera",
      concept: buildConcept(lines),
      category: "COFRADIA",
      baseAmount: round2(baseAmount),
      vatRate: effectiveRate,
      vatAmount: round2(vatAmount),
      totalAmount,
      currency: "EUR",
      notes,
      lines,
      meta: { formatKey: "sanvicente-gastos", vatRates }
    };
  }
};

/* ───────── helpers ───────── */

/**
 * Extrae las líneas de detalle. Cada línea EMPIEZA con un código (p.ej. "99.010",
 * "6", "20"). Las líneas que no empiezan con código son continuación de la anterior.
 * Al final de cada línea vienen pegados: cantidad+precio+importe (3 números) o solo
 * cantidad (movimientos de depósito, sin importe).
 */
function parseDetailLines(allLines: string[], issueDate: string | null): ParsedExpenseLine[] {
  const out: ParsedExpenseLine[] = [];
  const codeRe = /^(\d+(?:\.\d+)?)\s{2,}(\S.*)$/;

  // Acotar la sección de detalle: desde el primer código hasta "Base Imponible".
  let start = -1, end = allLines.length;
  for (let i = 0; i < allLines.length; i++) {
    if (start < 0 && codeRe.test(allLines[i])) start = i;
    if (start >= 0 && /Base\s+Imponible/i.test(allLines[i])) { end = i; break; }
  }
  if (start < 0) return out;

  // Agrupar por líneas que empiezan con código.
  type Entry = { code: string; rest: string };
  const entries: Entry[] = [];
  let cur: Entry | null = null;
  for (let i = start; i < end; i++) {
    const m = allLines[i].match(codeRe);
    if (m) {
      if (cur) entries.push(cur);
      cur = { code: m[1], rest: m[2] };
    } else if (cur) {
      cur.rest += allLines[i];   // continuación, pegada
    }
  }
  if (cur) entries.push(cur);

  const threeNumRe = /(\d[\d\.]*,\d{2})(\d[\d\.]*,\d{3})(\d[\d\.]*,\d{2})$/;
  const oneNumRe   = /(-?\d[\d\.]*,\d{2})$/;
  const dateInDesc = /(\d{2}\/\d{2}\/\d{4})/;
  const refRe      = /\(([A-Z]\d{2}-\d+)\)/;

  for (const e of entries) {
    let desc = e.rest, cantidad = 0, precio = 0, importe = 0;

    const m3 = e.rest.match(threeNumRe);
    if (m3) {
      cantidad = parseNumberES(m3[1]);
      precio   = parseNumberES(m3[2]);
      importe  = parseNumberES(m3[3]);
      desc = e.rest.slice(0, e.rest.length - m3[0].length);
    } else {
      const m1 = e.rest.match(oneNumRe);
      if (m1) {
        cantidad = parseNumberES(m1[1]);
        importe = 0;   // movimiento de depósito sin valor monetario
        desc = e.rest.slice(0, e.rest.length - m1[0].length);
      }
    }

    desc = desc.replace(/\s+/g, " ").trim();
    const dateM = desc.match(dateInDesc);
    const refM = desc.match(refRe);

    out.push({
      lineNo: out.length + 1,
      lineDate: dateM ? parseDate(dateM[1]) : issueDate,
      conceptCode: e.code,
      description: desc || "(sin descripción)",
      reference: refM ? refM[1] : null,
      quantity: round2(cantidad),
      unitPrice: round2(precio),
      amount: round2(importe),
      // Por defecto, solo se descuenta del montemayor si tiene importe real.
      includeInMontemayor: importe !== 0
    });
  }

  return out;
}

function buildConcept(lines: ParsedExpenseLine[]): string {
  const withAmount = lines.filter(l => l.amount !== 0);
  if (!withAmount.length) return "Gastos cofradía";
  const labels = withAmount.map(l => l.description.split(/\(|\d/)[0].replace(/\s+/g, " ").trim()).filter(Boolean);
  const uniq = Array.from(new Set(labels));
  return uniq.join(" + ") || "Gastos cofradía";
}

function fmtPct(n: number): string {
  return n.toFixed(2).replace(".", ",") + "%";
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

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const yyyy = y.length === 2 ? (Number(y) > 70 ? "19" + y : "20" + y) : y;
  return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
