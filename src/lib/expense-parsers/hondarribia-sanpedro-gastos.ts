import { ExpenseParserHandler, ParsedExpense, ParsedExpenseLine } from "./base";
import { parseNumberES } from "../money";

/**
 * Parser de "FAKTURA GASTUAK / FACTURA GASTOS" de la Cofradía San Pedro (Hondarribia).
 *
 * Identificadores: CIF G20037339 + "FAKTURA GASTUAK".
 * Número de factura serie G (p.ej. "G/26-00391").
 *
 * ESTRUCTURA REAL del texto extraído con pdf-parse (campos partidos y a veces
 * pegados, NO en orden visual):
 *
 *   G/26-0039118-05-20260342E207355511   ← número+fecha+código+NIF+página pegados
 *   ...
 *   26,0026,0001,00     ← línea de género: {importe(2dec)}{precio(3dec)}{kilos(2dec)} pegados
 *   Pan                 ← descripción
 *   2026-05-10          ← fecha del concepto (yyyy-mm-dd)
 *   26,0026,0001,00
 *   Pan
 *   2026-05-17
 *   Factura pesca B/26-00008 por 912,45   ← línea informativa (referencia de la captura)
 *   27,37               ← importe del cargo
 *   3,00% Cofradía S/ 912,45     ← descripción del cargo (% sobre la venta)
 *   0,91
 *   0,10% Federación S/ 912,45
 *   3,65
 *   0,40% Opegui S/ 912,45
 *   TOTALES
 *   52,002,00           ← total género (importe+kilos), se ignora
 *   Total Pan
 *   GUZTIRA FAKTURA
 *   TOTAL FACTURA EUROS
 *   101,56              ← TOTAL FACTURA
 *   ...Base imponible
 *   83,93               ← BASE IMPONIBLE (= suma de las líneas)
 *   ...I.V.A.
 *   21,0017,63          ← {%IVA}{IVA€} pegados
 *   MONTEMAYOR
 *   880,52              ← base montemayor (venta neta tras tasas cofradía)
 *
 * El importe del gasto se obtiene SUMANDO las líneas, no de un total suelto.
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
    const allLines = t.split(/\r?\n/).map(l => l.trim());

    // ── Número de factura: "G/26-00391" pegado a la fecha "18-05-2026" ──────
    // Usamos lookahead a la fecha para no tragarnos sus dígitos.
    let expenseNumber: string | null = null;
    const numM = t.match(/G\s*\/\s*(\d{2})\s*-\s*(\d+?)(?=\d{2}-\d{2}-\d{4})/);
    if (numM) {
      expenseNumber = `G/${numM[1]}-${numM[2]}`;
    } else {
      expenseNumber = firstMatch(t, [/\b(G\s*\/\s*\d{2}\s*-\s*\d{4,6})\b/i])?.replace(/\s+/g, "") ?? null;
    }

    // ── Fecha de emisión (dd-mm-yyyy) ───────────────────────────────────────
    const issueDate = parseDate(firstMatch(t, [/(\d{2}-\d{2}-\d{4})/]));

    // ── Referencia de la factura de pesca (informativa) ─────────────────────
    const pescaRef = firstMatch(t, [/Factura\s+pesca\s+([A-Z]\s*\/?\s*\d{2}\s*-\s*\d+)/i])?.replace(/\s+/g, "") ?? null;

    // ── Líneas de detalle ───────────────────────────────────────────────────
    const lines = parseDetailLines(allLines, issueDate);

    // ── Totales (del bloque inferior, NO del cuerpo) ────────────────────────
    const baseFromBox = firstDecimalAfterLabel(allLines, /Base\s+imponible/i);
    const totalFromBox = firstDecimalAfterLabel(allLines, /TOTAL\s+FACTURA\s+EUROS/i)
      ?? firstDecimalAfterLabel(allLines, /GUZTIRA\s+FAKTURA/i);

    // %IVA + IVA€ vienen pegados en una línea tipo "21,0017,63", PERO solo en el
    // recuadro inferior (tras "Base imponible"). Antes hay un total de género
    // "52,002,00" que tiene el mismo formato y nos confundiría: por eso buscamos
    // a partir del índice de "Base imponible".
    let vatRate = 21, vatAmount = 0;
    const baseIdx = allLines.findIndex(l => /Base\s+imponible/i.test(l));
    const searchFrom = baseIdx >= 0 ? baseIdx : 0;
    const ivaMashedRe = /^(\d{1,2},\d{2})(\d[\d\.]*,\d{2})$/;
    for (let k = searchFrom; k < allLines.length; k++) {
      const im = allLines[k].match(ivaMashedRe);
      if (im) { vatRate = parseNumberES(im[1]); vatAmount = parseNumberES(im[2]); break; }
    }

    // La base imponible debe ser la suma de las líneas; si la del recuadro no
    // cuadra (o no se encontró), usamos la suma de líneas como fuente de verdad.
    const sumLines = round2(lines.reduce((a, l) => a + l.amount, 0));
    let baseAmount = baseFromBox ?? sumLines;
    if (baseFromBox != null && Math.abs(baseFromBox - sumLines) > 0.05 && sumLines > 0) {
      // Discrepancia: confiamos en la suma de líneas (lo que pidió el usuario).
      baseAmount = sumLines;
    }

    const totalAmount = totalFromBox ?? round2(baseAmount + vatAmount);

    // ── Base montemayor (informativa) ───────────────────────────────────────
    const montemayor = firstDecimalAfterLabel(allLines, /MONTEMAYOR/i);

    // ── Concepto resumen + categoría ────────────────────────────────────────
    const concept = buildConcept(lines);
    const category = guessCategory(t);

    const notes = pescaRef ? `Factura pesca: ${pescaRef}` : null;

    return {
      expenseNumber,
      issueDate,
      supplierName: "COFRADIA DE MAREANTES DE SAN PEDRO",
      supplierTaxId: "G20037339",
      portName: "Hondarribia",
      concept,
      category,
      baseAmount: round2(baseAmount),
      vatRate,
      vatAmount: round2(vatAmount),
      totalAmount: round2(totalAmount),
      currency: "EUR",
      notes,
      lines,
      meta: {
        formatKey: "hondarribia-sanpedro-gastos",
        pescaRef,
        montemayor
      }
    };
  }
};

/* ───────── helpers ───────── */

/**
 * Extrae las líneas de detalle. Reconoce DOS patrones:
 *
 *  A) Género con kilos/precio (3 sub-líneas):
 *       [i  ] "26,0026,0001,00"  → importe(2)+precio(3)+kilos(2) pegados
 *       [i+1] "Pan"              → descripción
 *       [i+2] "2026-05-10"       → fecha (yyyy-mm-dd)
 *
 *  B) Cargo porcentual (2 sub-líneas):
 *       [i  ] "27,37"                       → importe
 *       [i+1] "3,00% Cofradía S/ 912,45"    → descripción con % y base
 *
 * Solo escanea ANTES del marcador "TOTALES" para no confundir con los totales.
 */
function parseDetailLines(allLines: string[], issueDate: string | null): ParsedExpenseLine[] {
  const out: ParsedExpenseLine[] = [];

  let end = allLines.findIndex(l => /^TOTALES$/i.test(l));
  if (end < 0) end = allLines.length;

  const goodsRe = /^(\d[\d\.]*,\d{2})(\d[\d\.]*,\d{3})(\d[\d\.]*,\d{2})$/;
  const bareRe  = /^(\d[\d\.]*,\d{2})$/;
  const feeDescRe = /^(\d+,\d{2})\s*%\s*(.+?)\s+S\/\s+([\d\.]+,\d{2})$/i;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;

  for (let i = 0; i < end; i++) {
    const line = allLines[i];

    // Patrón A: género con kilos/precio
    const gm = line.match(goodsRe);
    if (gm) {
      const desc = allLines[i + 1] ?? "";
      const dateStr = allLines[i + 2] ?? "";
      const importe = parseNumberES(gm[1]);
      const precio  = parseNumberES(gm[2]);
      const kilos   = parseNumberES(gm[3]);
      // Validación: kilos × precio ≈ importe
      if (Math.abs(kilos * precio - importe) <= Math.max(0.05, importe * 0.02)) {
        out.push({
          lineNo: out.length + 1,
          lineDate: dateRe.test(dateStr) ? dateStr : issueDate,
          description: desc || "(sin descripción)",
          quantity: round2(kilos),
          unitPrice: round2(precio),
          amount: round2(importe),
          includeInMontemayor: true
        });
        continue;
      }
    }

    // Patrón B: cargo porcentual (importe + descripción con %)
    const bm = line.match(bareRe);
    if (bm && i + 1 < end) {
      const fm = allLines[i + 1].match(feeDescRe);
      if (fm) {
        const importe = parseNumberES(bm[1]);
        const pct = fm[1];
        const concepto = fm[2].replace(/\s+/g, " ").trim();
        const base = fm[3];
        out.push({
          lineNo: out.length + 1,
          lineDate: issueDate,
          description: `${concepto} ${pct}% s/ ${base}`,
          amount: round2(importe),
          includeInMontemayor: true
        });
        continue;
      }
    }
  }

  return out;
}

/** Devuelve el primer número decimal que aparece tras una línea-etiqueta. */
function firstDecimalAfterLabel(lines: string[], labelRe: RegExp): number | null {
  const idx = lines.findIndex(l => labelRe.test(l));
  if (idx < 0) return null;
  for (let j = idx + 1; j < Math.min(lines.length, idx + 6); j++) {
    if (/^[\d\.]+,\d{2}$/.test(lines[j])) return parseNumberES(lines[j]);
  }
  return null;
}

function buildConcept(lines: ParsedExpenseLine[]): string {
  if (!lines.length) return "Gastos varios";
  // Agrupa descripciones por su primera palabra significativa
  const labels = lines.map(l => {
    const d = l.description;
    if (/cofrad/i.test(d)) return "Cofradía";
    if (/federaci/i.test(d)) return "Federación";
    if (/opegui/i.test(d)) return "Opegui";
    return d.split(/\s+/)[0];
  });
  const uniq = Array.from(new Set(labels));
  return uniq.join(" + ");
}

function guessCategory(t: string): "COFRADIA" | "MANTENIMIENTO" | "HIELO" | "VIVERES" | "OTRO" {
  if (/(Cofrad[ií]a|Federaci[oó]n|Opegui)/i.test(t)) return "COFRADIA";
  if (/Latiguillos|Cami[oó]n\s+grua/i.test(t)) return "MANTENIMIENTO";
  if (/Hielo/i.test(t)) return "HIELO";
  if (/Pan|V[ií]veres/i.test(t)) return "VIVERES";
  return "OTRO";
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
