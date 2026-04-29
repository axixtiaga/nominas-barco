import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { calcMantaPayroll } from "@/lib/services/manta-payroll";

/** Devuelve el siguiente mes en formato YYYY-MM dado un YYYY-MM. */
function monthAfter(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1));   // m es 1-indexed; pasar m a Date.UTC(y, m, 1) da el primer día del mes siguiente
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * GET /api/dashboard/payroll
 *   Devuelve el resumen de mantas con su líquido por marinero, agregado además por mes.
 *   Query params:
 *     manta=<id>         → filtra por manta concreta
 *     month=YYYY-MM      → filtra por mes de validación (solo mantas validadas en ese mes)
 */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const q = req.nextUrl.searchParams;
    const filterManta = q.get("manta") ?? "";
    const filterMonth = q.get("month") ?? "";   // formato YYYY-MM (mes de validación)

    // Mantas existentes (distintas, ordenadas)
    const mantasRows = await prisma.nominaDay.findMany({
      where: { manta: { not: null } },
      select: { manta: true, date: true },
      orderBy: { date: "asc" }
    });
    const allMantaIds = Array.from(new Set(mantasRows.map(m => m.manta!).filter(Boolean)));
    let mantaIds = [...allMantaIds];

    // Filtro por manta concreta
    if (filterManta) mantaIds = mantaIds.filter(m => m === filterManta);

    // Filtro por mes (de validación)
    if (filterMonth) {
      const validatedInMonth = await prisma.mantaInfo.findMany({
        where: {
          validatedAt: {
            gte: new Date(filterMonth + "-01T00:00:00.000Z"),
            lt: new Date(monthAfter(filterMonth) + "-01T00:00:00.000Z")
          }
        },
        select: { manta: true }
      });
      const validatedMantas = new Set(validatedInMonth.map(v => v.manta));
      mantaIds = mantaIds.filter(m => validatedMantas.has(m));
    }

    // Calcular cada manta
    const mantas = [];
    for (const m of mantaIds) {
      const p = await calcMantaPayroll(m);
      mantas.push({
        manta: p.manta,
        periodFrom: p.periodFrom,
        periodTo: p.periodTo,
        totalIngresos: p.totalIngresos,
        totalGastos: p.totalGastos,
        liquidoMonteMayor: p.liquidoMonteMayor,
        liquidoBruto: p.liquidoBruto,
        importePorParte: p.importePorParte,
        totalLiquidoAPercibir: p.totalLiquidoAPercibir,
        totalIrpfRetenido: p.totalIrpfRetenido,
        marineros: p.marineros
      });
    }

    // Agregado por marinero (sumando todas las mantas)
    type SailorAgg = { sailorId: string; name: string; role: string; partsCount: number; totalImporteManta: number; totalIrpf: number; totalLiquido: number };
    const bySailorMap = new Map<string, SailorAgg>();
    for (const m of mantas) {
      for (const mar of m.marineros) {
        const cur = bySailorMap.get(mar.sailorId) ?? {
          sailorId: mar.sailorId, name: mar.name, role: mar.role,
          partsCount: 0, totalImporteManta: 0, totalIrpf: 0, totalLiquido: 0
        };
        cur.partsCount += 1;
        cur.totalImporteManta += mar.importeManta;
        cur.totalIrpf += mar.irpfImporte;
        cur.totalLiquido += mar.liquidoAPercibir;
        bySailorMap.set(mar.sailorId, cur);
      }
    }
    const bySailor = Array.from(bySailorMap.values()).sort((a, b) => b.totalLiquido - a.totalLiquido);

    // Agregado por mes (mes = mes de periodFrom de cada manta)
    type MonthAgg = { month: string; mantas: number; totalIngresos: number; totalGastos: number; totalLiquidoBruto: number; totalLiquidoAPercibir: number };
    const byMonthMap = new Map<string, MonthAgg>();
    for (const m of mantas) {
      const monthKey = (m.periodFrom ?? m.periodTo ?? "").slice(0, 7);
      if (!monthKey) continue;
      const cur = byMonthMap.get(monthKey) ?? { month: monthKey, mantas: 0, totalIngresos: 0, totalGastos: 0, totalLiquidoBruto: 0, totalLiquidoAPercibir: 0 };
      cur.mantas += 1;
      cur.totalIngresos += m.totalIngresos;
      cur.totalGastos += m.totalGastos;
      cur.totalLiquidoBruto += m.liquidoBruto;
      cur.totalLiquidoAPercibir += m.totalLiquidoAPercibir;
      byMonthMap.set(monthKey, cur);
    }
    const byMonth = Array.from(byMonthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    // Lista global de meses disponibles (de todas las mantas validadas, no de las filtradas)
    const allValidated = await prisma.mantaInfo.findMany({
      where: { validatedAt: { not: null } },
      select: { manta: true, validatedAt: true },
      orderBy: { validatedAt: "asc" }
    });
    const monthsSet = new Set<string>();
    for (const v of allValidated) {
      if (v.validatedAt) {
        const d = new Date(v.validatedAt);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        monthsSet.add(key);
      }
    }
    const availableMonths = Array.from(monthsSet).sort();

    return ok({
      mantas,
      bySailor,
      byMonth,
      totalMantas: mantas.length,
      availableMantas: allMantaIds,
      availableMonths,
      filters: { manta: filterManta, month: filterMonth }
    });
  } catch (e) { return handle(e); }
}
