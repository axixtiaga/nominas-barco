import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { calcMantaPayroll } from "@/lib/services/manta-payroll";

/**
 * GET /api/mi/nominas/[manta]
 *   Devuelve el detalle de UNA manta concreta para el marinero autenticado.
 *   Incluye magnitudes globales del barco (necesarias para entender el cálculo)
 *   PERO oculta las filas individuales de los demás marineros.
 *   Los gastos se devuelven consolidados por categoría/concepto.
 */
export async function GET(req: NextRequest, { params }: { params: { manta: string } }) {
  try {
    const s = await requireSession();
    const querySailorId = req.nextUrl.searchParams.get("sailorId");
    const manta = decodeURIComponent(params.manta);

    let sailorId: string | null = null;
    if (s.role === "MARINERO") {
      sailorId = s.sailorId ?? null;
      if (!sailorId) return fail(403, "Tu usuario no está asociado a ningún marinero. Contacta con el administrador.");
    } else if (querySailorId) {
      sailorId = querySailorId;
    } else {
      return fail(400, "Debes indicar ?sailorId= si no eres MARINERO");
    }

    const data = await calcMantaPayroll(manta);
    if (!data) return fail(404, "Manta no encontrada");

    const mio = data.marineros.find((m: any) => m.sailorId === sailorId);
    if (!mio) return fail(403, "No apareces en esta manta");

    // Consolida gastos por categoría + concepto para que sean legibles
    const norm = (s: any) => String(s ?? "").trim().toLowerCase();
    type GroupedGasto = { category: string; concept: string; amount: number; count: number };
    const map = new Map<string, GroupedGasto>();
    for (const g of data.gastosLineas as any[]) {
      const key = `${norm(g.category)}|${norm(g.description)}`;
      const cur = map.get(key);
      if (cur) { cur.amount += Number(g.amount) || 0; cur.count++; }
      else map.set(key, { category: g.category, concept: g.description, amount: Number(g.amount) || 0, count: 1 });
    }
    const gastosResumen = Array.from(map.values()).sort((a, b) => b.amount - a.amount);

    return ok({
      manta: data.manta,
      periodFrom: data.periodFrom,
      periodTo: data.periodTo,
      validatedAt: data.validatedAt ?? null,
      totalIngresos: data.totalIngresos,
      totalGastos: data.totalGastos,
      liquidoMonteMayor: data.liquidoMonteMayor,
      participacionTripulacion: data.participacionTripulacion,
      ssTripulacion: data.ssTripulacion,
      liquidoBruto: data.liquidoBruto,
      totalPartes: data.totalPartes,
      importePorParte: data.importePorParte,
      ingresosPorPuerto: data.ingresosPorPuerto,
      gastosResumen,
      mio: {
        sailorId: mio.sailorId,
        name: mio.name,
        role: mio.role,
        parts: mio.parts,
        importeManta: mio.importeManta,
        irpfRate: mio.irpfRate,
        irpfImporte: mio.irpfImporte,
        liquidoAPercibir: mio.liquidoAPercibir
      }
    });
  } catch (e) { return handle(e); }
}
