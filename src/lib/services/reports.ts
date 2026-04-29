/**
 * Servicio de generación de reportes (mensuales / anuales) para asesoría.
 *
 * Agrega datos de:
 *   - Mantas (ingresos, gastos, líquido)
 *   - Marineros (IRPF retenido, líquido percibido)
 *   - Seguridad Social (pagos vs retenidos)
 *   - Gastos por categoría
 *   - Capturas por puerto y por especie
 *
 * Devuelve estructuras planas listas para imprimir en pantalla, exportar a
 * Excel o usar en certificados PDF.
 */
import { prisma } from "../prisma";
import { calcMantaPayroll } from "./manta-payroll";

const round2 = (n: number) => Math.round(n * 100) / 100;

function decimalToNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber();
  const n = parseFloat(typeof v.toString === "function" ? v.toString() : String(v));
  return Number.isFinite(n) ? n : 0;
}

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

export type MonthlyReport = {
  month: string;             // YYYY-MM
  monthLabel: string;        // "Marzo de 2026"
  mantas: {
    manta: string;
    periodFrom: string | null;
    periodTo: string | null;
    validatedAt: string | null;
    totalIngresos: number;
    totalGastos: number;
    liquidoMonteMayor: number;
    ssTripulacion: number;
    liquidoBruto: number;
    importePorParte: number;
    totalLiquidoAPercibir: number;
    totalIrpfRetenido: number;
    marineros: number;
  }[];
  totals: {
    mantas: number;
    ingresos: number;
    gastos: number;
    liquidoMonteMayor: number;
    ssTripulacion: number;
    liquidoBruto: number;
    irpfRetenido: number;
    liquidoAPercibir: number;
  };
  bySailor: {
    sailorId: string;
    name: string;
    role: string;
    dni: string | null;
    mantasCount: number;
    importeBruto: number;
    irpfRate: number;       // si todos en el mismo, único; si varían, promedio
    irpfRetenido: number;
    liquidoPercibido: number;
  }[];
  expensesByCategory: {
    category: string;
    total: number;
    count: number;
  }[];
  ss: {
    pagado: number;        // suma de SsPayment.amount del mes
    retenido: number;      // suma de SS retenida en mantas del mes
    diferencia: number;
  };
};

export type AnnualReport = {
  year: number;
  months: Array<{
    month: string;
    label: string;
    ingresos: number;
    gastos: number;
    liquidoBruto: number;
    irpfRetenido: number;
    liquidoAPercibir: number;
    mantas: number;
    ssPagado: number;
    ssRetenido: number;
  }>;
  totals: {
    ingresos: number;
    gastos: number;
    liquidoMonteMayor: number;
    ssTripulacion: number;
    liquidoBruto: number;
    irpfRetenido: number;
    liquidoAPercibir: number;
    ssPagado: number;
    mantas: number;
  };
  bySailor: {
    sailorId: string;
    name: string;
    role: string;
    dni: string | null;
    irpfRate: number;
    mantasCount: number;
    importeBruto: number;
    irpfRetenido: number;
    liquidoPercibido: number;
  }[];
  expensesByCategory: {
    category: string;
    total: number;
    count: number;
  }[];
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) return yyyymm;
  const d = new Date(Date.UTC(y, m - 1, 1));
  const label = d.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function loadMantasInRange(yearOrMonth: string): Promise<Array<Awaited<ReturnType<typeof calcMantaPayroll>>>> {
  const mantasRows = await prisma.nominaDay.findMany({
    where: { manta: { not: null } },
    select: { manta: true },
    distinct: ["manta"]
  });
  const ids = mantasRows.map(m => m.manta!).filter(Boolean);

  const out = [];
  for (const id of ids) {
    const p = await calcMantaPayroll(id);
    if (!p) continue;
    const key = (p.periodFrom ?? p.periodTo ?? "").slice(0, yearOrMonth.length);   // 4 (year) o 7 (month)
    if (key === yearOrMonth) out.push(p);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Reporte mensual
// ─────────────────────────────────────────────────────────────

export async function getMonthlyReport(month: string): Promise<MonthlyReport> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Mes inválido: ${month}`);

  const mantas = await loadMantasInRange(month);

  // Totales globales
  const totals = mantas.reduce((a, m) => ({
    mantas: a.mantas + 1,
    ingresos: a.ingresos + m!.totalIngresos,
    gastos: a.gastos + m!.totalGastos,
    liquidoMonteMayor: a.liquidoMonteMayor + m!.liquidoMonteMayor,
    ssTripulacion: a.ssTripulacion + m!.ssTripulacion,
    liquidoBruto: a.liquidoBruto + m!.liquidoBruto,
    irpfRetenido: a.irpfRetenido + m!.totalIrpfRetenido,
    liquidoAPercibir: a.liquidoAPercibir + m!.totalLiquidoAPercibir
  }), {
    mantas: 0, ingresos: 0, gastos: 0, liquidoMonteMayor: 0, ssTripulacion: 0,
    liquidoBruto: 0, irpfRetenido: 0, liquidoAPercibir: 0
  });

  // Por marinero
  type SailorAgg = {
    sailorId: string; name: string; role: string; dni: string | null;
    mantasCount: number; importeBruto: number;
    irpfRateSum: number; irpfRetenido: number; liquidoPercibido: number;
  };
  const bySailorMap = new Map<string, SailorAgg>();
  for (const m of mantas) {
    for (const mar of m!.marineros) {
      const cur = bySailorMap.get(mar.sailorId) ?? {
        sailorId: mar.sailorId, name: mar.name, role: mar.role, dni: null,
        mantasCount: 0, importeBruto: 0, irpfRateSum: 0, irpfRetenido: 0, liquidoPercibido: 0
      };
      cur.mantasCount++;
      cur.importeBruto += mar.importeManta;
      cur.irpfRateSum += mar.irpfRate;
      cur.irpfRetenido += mar.irpfImporte;
      cur.liquidoPercibido += mar.liquidoAPercibir;
      bySailorMap.set(mar.sailorId, cur);
    }
  }

  // Cargar DNIs reales de la BD
  const sailorIds = Array.from(bySailorMap.keys());
  const sailorsDb = await prisma.sailor.findMany({
    where: { id: { in: sailorIds } },
    select: { id: true, dni: true }
  });
  for (const s of sailorsDb) {
    const cur = bySailorMap.get(s.id);
    if (cur) cur.dni = s.dni;
  }

  const bySailor = Array.from(bySailorMap.values()).map(s => ({
    sailorId: s.sailorId,
    name: s.name,
    role: s.role,
    dni: s.dni,
    mantasCount: s.mantasCount,
    importeBruto: round2(s.importeBruto),
    irpfRate: s.mantasCount ? round2(s.irpfRateSum / s.mantasCount) : 0,
    irpfRetenido: round2(s.irpfRetenido),
    liquidoPercibido: round2(s.liquidoPercibido)
  })).sort((a, b) => b.liquidoPercibido - a.liquidoPercibido);

  // Gastos por categoría: cargar ExpenseLines de las mantas del mes
  type CatAgg = { category: string; total: number; count: number };
  const catMap = new Map<string, CatAgg>();
  for (const m of mantas) {
    for (const g of m!.gastosLineas) {
      const cur = catMap.get(g.category) ?? { category: g.category, total: 0, count: 0 };
      cur.total += g.amount;
      cur.count++;
      catMap.set(g.category, cur);
    }
  }
  const expensesByCategory = Array.from(catMap.values())
    .map(c => ({ ...c, total: round2(c.total) }))
    .sort((a, b) => b.total - a.total);

  // SS pagado vs retenido
  const ssPagosDb = await prisma.ssPayment.findMany({ where: { month }, select: { amount: true } });
  const ssPagado = ssPagosDb.reduce((a, p) => a + decimalToNumber(p.amount), 0);
  const ssRetenido = totals.ssTripulacion;

  return {
    month,
    monthLabel: monthLabel(month),
    mantas: mantas.map(m => ({
      manta: m!.manta,
      periodFrom: m!.periodFrom,
      periodTo: m!.periodTo,
      validatedAt: m!.validatedAt ?? null,
      totalIngresos: m!.totalIngresos,
      totalGastos: m!.totalGastos,
      liquidoMonteMayor: m!.liquidoMonteMayor,
      ssTripulacion: m!.ssTripulacion,
      liquidoBruto: m!.liquidoBruto,
      importePorParte: m!.importePorParte,
      totalLiquidoAPercibir: m!.totalLiquidoAPercibir,
      totalIrpfRetenido: m!.totalIrpfRetenido,
      marineros: m!.marineros.length
    })),
    totals: {
      mantas: totals.mantas,
      ingresos: round2(totals.ingresos),
      gastos: round2(totals.gastos),
      liquidoMonteMayor: round2(totals.liquidoMonteMayor),
      ssTripulacion: round2(totals.ssTripulacion),
      liquidoBruto: round2(totals.liquidoBruto),
      irpfRetenido: round2(totals.irpfRetenido),
      liquidoAPercibir: round2(totals.liquidoAPercibir)
    },
    bySailor,
    expensesByCategory,
    ss: {
      pagado: round2(ssPagado),
      retenido: round2(ssRetenido),
      diferencia: round2(ssPagado - ssRetenido)
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Reporte anual
// ─────────────────────────────────────────────────────────────

export async function getAnnualReport(year: number): Promise<AnnualReport> {
  const yearStr = String(year);
  const mantas = await loadMantasInRange(yearStr);

  // Por mes
  type MonthAgg = {
    month: string; ingresos: number; gastos: number; liquidoBruto: number;
    irpfRetenido: number; liquidoAPercibir: number; mantas: number;
    ssRetenido: number;
  };
  const monthMap = new Map<string, MonthAgg>();
  function getMonth(monthKey: string): MonthAgg {
    let m = monthMap.get(monthKey);
    if (!m) {
      m = {
        month: monthKey,
        ingresos: 0, gastos: 0, liquidoBruto: 0, irpfRetenido: 0,
        liquidoAPercibir: 0, mantas: 0, ssRetenido: 0
      };
      monthMap.set(monthKey, m);
    }
    return m;
  }
  for (const m of mantas) {
    const monthKey = (m!.periodFrom ?? m!.periodTo ?? "").slice(0, 7);
    if (!monthKey) continue;
    const agg = getMonth(monthKey);
    agg.ingresos += m!.totalIngresos;
    agg.gastos += m!.totalGastos;
    agg.liquidoBruto += m!.liquidoBruto;
    agg.irpfRetenido += m!.totalIrpfRetenido;
    agg.liquidoAPercibir += m!.totalLiquidoAPercibir;
    agg.ssRetenido += m!.ssTripulacion;
    agg.mantas++;
  }

  // SS pagado por mes
  const ssPagos = await prisma.ssPayment.findMany({
    where: { month: { startsWith: `${yearStr}-` } },
    select: { month: true, amount: true }
  });
  const ssPorMes = new Map<string, number>();
  for (const p of ssPagos) {
    ssPorMes.set(p.month, (ssPorMes.get(p.month) ?? 0) + decimalToNumber(p.amount));
  }

  // Lista todos los meses del año (rellena con 0 si no hay datos)
  const months = [];
  for (let i = 1; i <= 12; i++) {
    const monthKey = `${yearStr}-${String(i).padStart(2, "0")}`;
    const agg = monthMap.get(monthKey);
    months.push({
      month: monthKey,
      label: monthLabel(monthKey),
      ingresos: round2(agg?.ingresos ?? 0),
      gastos: round2(agg?.gastos ?? 0),
      liquidoBruto: round2(agg?.liquidoBruto ?? 0),
      irpfRetenido: round2(agg?.irpfRetenido ?? 0),
      liquidoAPercibir: round2(agg?.liquidoAPercibir ?? 0),
      mantas: agg?.mantas ?? 0,
      ssRetenido: round2(agg?.ssRetenido ?? 0),
      ssPagado: round2(ssPorMes.get(monthKey) ?? 0)
    });
  }

  // Totales anuales
  const totals = mantas.reduce((a, m) => ({
    ingresos: a.ingresos + m!.totalIngresos,
    gastos: a.gastos + m!.totalGastos,
    liquidoMonteMayor: a.liquidoMonteMayor + m!.liquidoMonteMayor,
    ssTripulacion: a.ssTripulacion + m!.ssTripulacion,
    liquidoBruto: a.liquidoBruto + m!.liquidoBruto,
    irpfRetenido: a.irpfRetenido + m!.totalIrpfRetenido,
    liquidoAPercibir: a.liquidoAPercibir + m!.totalLiquidoAPercibir,
    mantas: a.mantas + 1
  }), {
    ingresos: 0, gastos: 0, liquidoMonteMayor: 0, ssTripulacion: 0,
    liquidoBruto: 0, irpfRetenido: 0, liquidoAPercibir: 0, mantas: 0
  });
  const ssPagadoAnual = Array.from(ssPorMes.values()).reduce((a, b) => a + b, 0);

  // Por marinero (mismo cálculo que en mensual pero acumulado año)
  type SailorYearAgg = {
    sailorId: string; name: string; role: string; dni: string | null;
    mantasCount: number; importeBruto: number;
    irpfRateSum: number; irpfRetenido: number; liquidoPercibido: number;
  };
  const bySailorMap = new Map<string, SailorYearAgg>();
  for (const m of mantas) {
    for (const mar of m!.marineros) {
      const cur = bySailorMap.get(mar.sailorId) ?? {
        sailorId: mar.sailorId, name: mar.name, role: mar.role, dni: null,
        mantasCount: 0, importeBruto: 0, irpfRateSum: 0, irpfRetenido: 0, liquidoPercibido: 0
      };
      cur.mantasCount++;
      cur.importeBruto += mar.importeManta;
      cur.irpfRateSum += mar.irpfRate;
      cur.irpfRetenido += mar.irpfImporte;
      cur.liquidoPercibido += mar.liquidoAPercibir;
      bySailorMap.set(mar.sailorId, cur);
    }
  }
  const sailorIds = Array.from(bySailorMap.keys());
  const sailorsDb = await prisma.sailor.findMany({
    where: { id: { in: sailorIds } },
    select: { id: true, dni: true }
  });
  for (const s of sailorsDb) {
    const cur = bySailorMap.get(s.id);
    if (cur) cur.dni = s.dni;
  }
  const bySailor = Array.from(bySailorMap.values()).map(s => ({
    sailorId: s.sailorId,
    name: s.name,
    role: s.role,
    dni: s.dni,
    mantasCount: s.mantasCount,
    importeBruto: round2(s.importeBruto),
    irpfRate: s.mantasCount ? round2(s.irpfRateSum / s.mantasCount) : 0,
    irpfRetenido: round2(s.irpfRetenido),
    liquidoPercibido: round2(s.liquidoPercibido)
  })).sort((a, b) => b.liquidoPercibido - a.liquidoPercibido);

  // Gastos por categoría
  type CatAgg = { category: string; total: number; count: number };
  const catMap = new Map<string, CatAgg>();
  for (const m of mantas) {
    for (const g of m!.gastosLineas) {
      const cur = catMap.get(g.category) ?? { category: g.category, total: 0, count: 0 };
      cur.total += g.amount;
      cur.count++;
      catMap.set(g.category, cur);
    }
  }
  const expensesByCategory = Array.from(catMap.values())
    .map(c => ({ ...c, total: round2(c.total) }))
    .sort((a, b) => b.total - a.total);

  return {
    year,
    months,
    totals: {
      ingresos: round2(totals.ingresos),
      gastos: round2(totals.gastos),
      liquidoMonteMayor: round2(totals.liquidoMonteMayor),
      ssTripulacion: round2(totals.ssTripulacion),
      liquidoBruto: round2(totals.liquidoBruto),
      irpfRetenido: round2(totals.irpfRetenido),
      liquidoAPercibir: round2(totals.liquidoAPercibir),
      ssPagado: round2(ssPagadoAnual),
      mantas: totals.mantas
    },
    bySailor,
    expensesByCategory
  };
}
