import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcMantaPayroll } from "@/lib/services/manta-payroll";

/**
 * GET /api/ss-payments/comparativa
 *   Comparativa mensual SS pagada vs SS retenida en MANTAS.
 *
 *   Estrategia: en lugar de sumar la SS de jornadas sueltas (que incluiría días
 *   sin manta asignada), agregamos por MANTA usando calcMantaPayroll. La manta
 *   es la unidad real donde se retiene la SS al marinero, así que esto coincide
 *   exactamente con lo que aparece en los PDFs de las mantas.
 *
 *   Por cada manta:
 *     - Se calcula su totalIngresos (Monte Mayor puro, sin gastos)
 *     - retenido_3.5 = totalIngresos × 3,5%
 *     - retenido_4   = totalIngresos × 4%
 *     - Se asigna al MES de su periodFrom (o periodTo si no hay periodFrom)
 *
 *   Al SS pagado se le hace match por mes (campo SsPayment.month).
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const filterMonth = req.nextUrl.searchParams.get("month");

    // 1) Pagos SS, agrupados por mes
    const payments = await prisma.ssPayment.findMany({
      include: { sailor: { select: { id: true, name: true, role: true } } },
      orderBy: { month: "asc" }
    });

    // 2) Mantas existentes (calcula cada una)
    const mantasRows = await prisma.nominaDay.findMany({
      where: { manta: { not: null } },
      select: { manta: true },
      distinct: ["manta"]
    });
    const mantaIds = mantasRows.map(m => m.manta!).filter(Boolean);

    type MonthAgg = {
      month: string;
      totalPagado: number;
      totalRetenido35: number;
      totalRetenido40: number;
      diferencia35: number;
      diferencia40: number;
      mantasCount: number;
    };
    const map = new Map<string, MonthAgg>();
    function init(month: string): MonthAgg {
      let m = map.get(month);
      if (!m) {
        m = {
          month,
          totalPagado: 0, totalRetenido35: 0, totalRetenido40: 0,
          diferencia35: 0, diferencia40: 0, mantasCount: 0
        };
        map.set(month, m);
      }
      return m;
    }

    // Por cada manta, calcula y asigna al mes de su período
    for (const mid of mantaIds) {
      const p = await calcMantaPayroll(mid);
      if (!p) continue;
      const monthKey = (p.periodFrom ?? p.periodTo ?? "").slice(0, 7);
      if (!monthKey) continue;
      const agg = init(monthKey);
      agg.totalRetenido35 += p.totalIngresos * 0.035;
      agg.totalRetenido40 += p.totalIngresos * 0.04;
      agg.mantasCount++;
    }

    // SS pagada — conversión defensiva del Decimal de Prisma
    for (const p of payments) {
      const amt = decimalToNumber(p.amount);
      init(p.month).totalPagado += amt;
    }

    const months = Array.from(map.values())
      .map(m => ({
        month: m.month,
        mantasCount: m.mantasCount,
        totalRetenido35: round2(m.totalRetenido35),
        totalRetenido40: round2(m.totalRetenido40),
        totalPagado: round2(m.totalPagado),
        diferencia35: round2(m.totalPagado - m.totalRetenido35),
        diferencia40: round2(m.totalPagado - m.totalRetenido40)
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    // Detalle por marinero del mes solicitado
    let perSailor: Array<{
      sailorId: string; sailorName: string; sailorRole: string;
      pagado: number; sourceFile: string | null;
    }> = [];
    if (filterMonth) {
      perSailor = payments
        .filter(p => p.month === filterMonth)
        .map(p => ({
          sailorId: p.sailorId,
          sailorName: p.sailor.name,
          sailorRole: p.sailor.role,
          pagado: decimalToNumber(p.amount),
          sourceFile: p.sourceFile
        }))
        .sort((a, b) => b.pagado - a.pagado);
    }

    return ok({ months, perSailor, filter: { month: filterMonth } });
  } catch (e) { return handle(e); }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Convierte un Decimal de Prisma a número de forma segura.
 * Evita el bug de `Number(decimalInstance)` que en algunos entornos Next/Edge
 * devuelve la representación interna multiplicada por 100. Usa toString() que
 * siempre da la forma humana ("281.05") y luego parseFloat.
 */
function decimalToNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  // decimal.js tiene .toNumber() que es lo más fiable
  if (typeof v === "object" && typeof v.toNumber === "function") {
    const n = v.toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  // Fallback: toString + parseFloat
  const s = (typeof v.toString === "function") ? v.toString() : String(v);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
