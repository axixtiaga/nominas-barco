import { ExpenseParserHandler, ParsedExpense, ParsedExpenseLine } from "./base";
import { parseNumberES } from "../money";

/**
 * Parser GENERAL de "ALBARAN DE GASTOS Y SERVICIOS" (serie D) emitido por varias
 * cofradías con el mismo software/formato. Probado con:
 *   · Cofradía de Pescadores de San Vicente  (CIF G39024567) — IVA mixto 10% + 21%
 *   · Cofradía de Pescadores de Santoña      (CIF V39023569) — IVA 21%
 *
 * Sustituye al antiguo parser específico de San Vicente: se identifica por la
 * leyenda + el CIF, y los datos del emisor (nombre, puerto) se resuelven con una
 * tabla de cofradías conocidas, o se extraen del propio documento si es nueva.
 *
 * Estructura de cada línea (campos pegados al final):
 *   99.010   Cuota Voluntaria (2,50%) (B26-2209)1,00368,430368,43
 *     └código └descripción                       └cant└precio └importe
 *   27   SALIDAS CAJAS BARCOS (B26-2209)1.265,00   ← solo cantidad (sin importe)
 *
 * Totales:  "437,9391,97Totales"  → base(437,93) + IVA(91,97)
 *           "%21,00"              → tipo(s) de IVA
 */

// Cofradías conocidas (CIF → nombre + puerto). Para las nuevas, extracción dinámica.
const COFRADIAS: Record<string, { supplier: string; port: string }> = {
  "G39024567": { supplier: "Cofradía de Pescadores de San Vicente", port: "San Vicente de la Barquera" },
  "V39023569": { supplier: "Cofradía de Pescadores Ntra. Sra. del Puerto de Santoña", port: "Santoña" }
};

export const cofradiaAlbaranGastosParser: ExpenseParserHandler = {
  key: "cofradia-albaran-gastos",
  label: "Cofradía · Albarán gastos y servicios (serie D)",
  matches(ctx) {
    const t = ctx.rawText;
    return /ALBAR[AÁ]N\s+DE\s+GASTOS\s+Y\s+SERVICIOS/i.test(t)
      && /CIF:\s*[A-Z]\d{8}/i.test(t);
  },
  parse(ctx): ParsedExpense {
    const t = ctx.rawText;
    const allLines = t.split(/\r?\n/).map(l => l.trim());

    // CIF de la cofradía emisora
    const cif = firstMatch(t, [/CIF:\s*([A-Z]\d{8})/i])?.toUpperCase() ?? null;
    const known = cif ? COFRADIAS[cif] : undefined;

    // Número: "D26 / 2.221" o "D26 /2.221"
    const expenseNumber = firstMatch(t, [/\b(D\d{2}\s*\/\s*[\d\.]+)\b/])?.replace(/\s+/g, "") ?? null;

    // Fecha dd/mm/yyyy
    const issueDate = parseDate(firstMatch(t, [/(\d{2}\/\d{2}\/\d{4})/]));

    const supplierTaxId = cif;
    const supplierName = known?.supplier ?? "Cofradía de Pescadores";
    const portName = known?.port ?? extractPort(allLines);

    // Líneas de detalle
    const lines = parseDetailLines(allLines, issueDate);

    // Totales: "{base}{iva}Totales"
    let baseAmount = 0, vatAmount = 0;
    const totM = t.match(/(\d[\d\.]*,\d{2})(\d[\d\.]*,\d{2})\s*Totales/i);
    if (totM) { baseAmount = parseNumberES(totM[1]); vatAmount = parseNumberES(totM[2]); }
    const sumLines = round2(lines.reduce((a, l) => a + l.amount, 0));
    if (!baseAmount) baseAmount = sumLines;

    // Tipos de IVA presentes (puede haber 1 o varios)
    const vatRates = Array.from(t.matchAll(/%\s*(\d{1,2},\d{2})/g)).map(m => parseNumberES(m[1]));
    const totalAmount = round2(baseAmount + vatAmount);
    const effectiveRate = baseAmount > 0 ? round2(vatAmount / baseAmount * 100) : (vatRates[0] ?? 21);

    const notes = vatRates.length > 1
      ? `IVA con varios tipos (${vatRates.map(r => fmtPct(r)).join(" + ")}). Tipo efectivo: ${fmtPct(effectiveRate)}.`
      : null;

    return {
      expenseNumber,
      issueDate,
      supplierName,
      supplierTaxId,
      portName,
      concept: buildConcept(lines),
      category: "COFRADIA",
      baseAmount: round2(baseAmount),
      vatRate: vatRates.length === 1 ? vatRates[0] : effectiveRate,
      vatAmount: round2(vatAmount),
      totalAmount,
      currency: "EUR",
      notes,
      lines,
      meta: { formatKey: "cofradia-albaran-gastos", cif, vatRates }
    };
  }
};

/* ───────── helpers ───────── */

function parseDetailLines(allLines: string[], issueDate: string | null): ParsedExpenseLine[] {
  const out: ParsedExpenseLine[] = [];
  const codeRe = /^(\d+(?:\.\d+)?)\s{2,}(\S.*)$/;

  // Sección de detalle: desde el primer código hasta "Base Imponible".
  let start = -1, end = allLines.length;
  for (let i = 0; i < allLines.length; i++) {
    if (start < 0 && codeRe.test(allLines[i])) start = i;
    if (start >= 0 && /Base\s+Imponible/i.test(allLines[i])) { end = i; break; }
  }
  if (start < 0) return out;

  type Entry = { code: string; rest: string };
  const entries: Entry[] = [];
  let cur: Entry | null = null;
  for (let i = start; i < end; i++) {
    const m = allLines[i].match(codeRe);
    if (m) {
      if (cur) entries.push(cur);
      cur = { code: m[1], rest: m[2] };
    } else if (cur) {
      cur.rest += allLines[i];
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
        importe = 0;   // movimiento sin valor monetario
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
      includeInMontemayor: importe !== 0
    });
  }

  return out;
}

/** Extrae el puerto del bloque de dirección de la cofradía (cód. postal 3xxxx). */
function extractPort(allLines: string[]): string | null {
  for (const l of allLines) {
    const m = l.match(/^(3\d{4})\s*-?\s*([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ\.\s]+)$/);
    if (m) return m[2].replace(/\s+/g, " ").trim();
  }
  return null;
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
