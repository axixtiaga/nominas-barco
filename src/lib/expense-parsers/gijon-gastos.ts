import { ExpenseParserHandler, ParsedExpense, ParsedExpenseLine } from "./base";
import { parseNumberES } from "../money";

/**
 * Parser de FACTURAS DE SERVICIOS de LONJA GIJÓN MUSEL S.A. (CIF A33831934).
 *
 * OJO: mismo emisor que las capturas de Gijón (gijon-lonja). La diferencia es
 * que estas son facturas de SERVICIOS ("Total Suministros": Comisión Lonja,
 * Lavado de envases, etc.), no la "LISTA DE COMPRAS" de pescado. Además, el CIF
 * A33831934 NO aparece en el texto extraíble (está en el logo), por eso el
 * matches() se basa en "LONJA GIJÓN MUSEL" + "Total Suministros".
 *
 * Puede contener VARIAS facturas en el mismo PDF (p.ej. 40982 y 40872). Las
 * combinamos en un único gasto sumando totales y juntando todas las líneas
 * (un Document = un Expense en el modelo).
 *
 * Los totales vienen limpios (cada factura):
 *   IMPORTE BRUTO \n 220,20
 *   SERVICIOS BASE IMP. \n 220,20  21,00   ← base, %IVA
 *   % IVA CUOTA IVA \n 46,24             ← cuota IVA
 *   % R.E. R.EQUIV. TOTAL FRA. \n 266,44 ← total factura
 *
 * Las líneas vienen MUY desordenadas; cada concepto es "{cod}-{NOMBRE}" con su
 * importe en una línea cercana (par "precio importe" si es facturable, o un
 * número suelto si es 0,00 — movimientos de envases).
 */
export const gijonGastosParser: ExpenseParserHandler = {
  key: "gijon-gastos",
  label: "Gijón · Servicios Lonja (Comisión, envases)",
  matches(ctx) {
    const t = ctx.rawText;
    return /LONJA\s+GIJ[OÓ]N\s+MUSEL/i.test(t)
      && /Total\s+Suministros/i.test(t)
      && !/LISTA\s+DE\s+COMPRAS/i.test(t);
  },
  parse(ctx): ParsedExpense {
    const t = ctx.rawText;
    const L = t.split(/\r?\n/).map(l => l.trim());

    // Números de factura (puede haber varios en el mismo PDF)
    const facturas = [...t.matchAll(/FACTURA:\s*(\d+)/g)].map(m => m[1]);
    const expenseNumber = facturas[0] ?? null;

    // Fecha de emisión (dd/mm/yyyy)
    const issueDate = parseDate(firstMatch(t, [/(\d{2}\/\d{2}\/\d{4})/]));

    // ── Totales: sumamos a través de todas las facturas del PDF ─────────────
    let baseAmount = 0, vatAmount = 0, totalAmount = 0, vatRate = 21;
    for (let i = 0; i < L.length; i++) {
      if (/BASE\s+IMP\./i.test(L[i])) {
        const m = (L[i + 1] || "").match(/([\d\.]+,\d{2})\s+(\d{1,2},\d{2})/);
        if (m) { baseAmount += parseNumberES(m[1]); vatRate = parseNumberES(m[2]); }
      }
      if (/CUOTA\s+IVA/i.test(L[i])) {
        const m = (L[i + 1] || "").match(/([\d\.]+,\d{2})/);
        if (m) vatAmount += parseNumberES(m[1]);
      }
      if (/TOTAL\s+FRA\./i.test(L[i])) {
        const m = (L[i + 1] || "").match(/([\d\.]+,\d{2})/);
        if (m) totalAmount += parseNumberES(m[1]);
      }
    }

    // ── Líneas de detalle ───────────────────────────────────────────────────
    const lines = parseDetailLines(L, issueDate);

    // Fallbacks por si no se leyeron los totales del recuadro
    const sumLines = round2(lines.reduce((a, l) => a + l.amount, 0));
    if (!baseAmount) baseAmount = sumLines;
    if (!totalAmount) totalAmount = round2(baseAmount + vatAmount);

    const concept = buildConcept(lines);
    const notes = facturas.length > 1
      ? `Incluye facturas: ${facturas.join(", ")}`
      : null;

    return {
      expenseNumber,
      issueDate,
      supplierName: "LONJA GIJÓN MUSEL S.A.",
      supplierTaxId: "A33831934",
      portName: "Gijón",
      concept,
      category: "COFRADIA",
      baseAmount: round2(baseAmount),
      vatRate,
      vatAmount: round2(vatAmount),
      totalAmount: round2(totalAmount),
      currency: "EUR",
      notes,
      lines,
      meta: { formatKey: "gijon-gastos", facturas }
    };
  }
};

/* ───────── helpers ───────── */

function parseDetailLines(L: string[], issueDate: string | null): ParsedExpenseLine[] {
  const out: ParsedExpenseLine[] = [];
  const conceptRe = /(\d{1,3})-([A-ZÑÁÉÍÓÚ][^0-9]*?)\s+(-?[\d\.]+,\d{2})/;
  const pairRe = /^([\d\.]+,\d{2})\s+([\d\.]+,\d{2})$/;
  const bareRe = /^(-?[\d\.]+,\d{2})$/;

  for (let i = 0; i < L.length; i++) {
    const cm = L[i].match(conceptRe);
    if (!cm) continue;

    const code = cm[1];
    const name = cm[2].replace(/\s+/g, " ").trim();
    const cantidad = parseNumberES(cm[3]);

    // Buscar el importe en las líneas siguientes (hasta el próximo concepto).
    let importe = 0;
    for (let k = i + 1; k < Math.min(L.length, i + 4); k++) {
      if (conceptRe.test(L[k])) break;
      const pm = L[k].match(pairRe);
      if (pm) { importe = parseNumberES(pm[2]); break; }   // par precio+importe (facturable)
      const bm = L[k].match(bareRe);
      if (bm) { importe = parseNumberES(bm[1]); break; }    // número suelto (normalmente 0,00)
    }

    out.push({
      lineNo: out.length + 1,
      lineDate: issueDate,
      conceptCode: code,
      description: name || "(servicio)",
      reference: null,
      quantity: round2(cantidad),
      unitPrice: 0,
      amount: round2(importe),
      // Por defecto solo cuentan las líneas con importe real.
      includeInMontemayor: importe !== 0
    });
  }

  return out;
}

function buildConcept(lines: ParsedExpenseLine[]): string {
  const withAmount = lines.filter(l => l.amount !== 0);
  if (!withAmount.length) return "Servicios Lonja Gijón";
  const uniq = Array.from(new Set(withAmount.map(l => l.description)));
  return uniq.join(" + ");
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
