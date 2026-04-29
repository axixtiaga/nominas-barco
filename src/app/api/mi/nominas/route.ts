import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { calcMantaPayroll } from "@/lib/services/manta-payroll";

/**
 * GET /api/mi/nominas
 *   Devuelve las mantas en las que aparece el marinero autenticado.
 *   Solo expone los datos relevantes a esa persona (su importe, su IRPF, su líquido)
 *   y los totales generales del barco que necesita ver para entender el cálculo.
 *   NO devuelve datos de los demás marineros.
 *
 *   Acceso: cualquier usuario autenticado, pero solo MARINERO con sailorId asociado
 *   obtiene resultados propios. Para ADMIN/OPERATOR/VIEWER, requiere ?sailorId=
 *   explícito (útil para que un admin previsualice lo que ve un marinero).
 */
export async function GET(req: NextRequest) {
  try {
    const s = await requireSession();
    const querySailorId = req.nextUrl.searchParams.get("sailorId");

    let sailorId: string | null = null;
    if (s.role === "MARINERO") {
      sailorId = s.sailorId ?? null;
      if (!sailorId) return fail(403, "Tu usuario no está asociado a ningún marinero. Contacta con el administrador.");
    } else if (querySailorId) {
      sailorId = querySailorId;
    } else {
      return fail(400, "Debes indicar ?sailorId= si no eres MARINERO");
    }

    const sailor = await prisma.sailor.findUnique({ where: { id: sailorId } });
    if (!sailor) return fail(404, "Marinero no encontrado");

    // Saca todas las mantas existentes y filtra las que incluyen a este marinero
    const mantasRows = await prisma.nominaDay.findMany({
      where: { manta: { not: null } },
      select: { manta: true },
      distinct: ["manta"]
    });
    const allMantaIds = mantasRows.map(m => m.manta!).filter(Boolean);

    type MantaResumen = {
      manta: string;
      periodFrom: string | null;
      periodTo: string | null;
      validatedAt: string | null;
      totalIngresos: number;
      totalGastos: number;
      liquidoMonteMayor: number;
      liquidoBruto: number;
      importePorParte: number;
      // Datos propios del marinero
      mias: {
        parts: number;
        importeManta: number;
        irpfRate: number;
        irpfImporte: number;
        liquidoAPercibir: number;
      } | null;
    };

    const mantas: MantaResumen[] = [];
    for (const mid of allMantaIds) {
      const p = await calcMantaPayroll(mid);
      const mio = p.marineros.find((m: any) => m.sailorId === sailorId) ?? null;
      if (!mio) continue;   // si no aparezco, no la muestro
      mantas.push({
        manta: p.manta,
        periodFrom: p.periodFrom,
        periodTo: p.periodTo,
        validatedAt: p.validatedAt ?? null,
        totalIngresos: p.totalIngresos,
        totalGastos: p.totalGastos,
        liquidoMonteMayor: p.liquidoMonteMayor,
        liquidoBruto: p.liquidoBruto,
        importePorParte: p.importePorParte,
        mias: {
          parts: mio.parts,
          importeManta: mio.importeManta,
          irpfRate: mio.irpfRate,
          irpfImporte: mio.irpfImporte,
          liquidoAPercibir: mio.liquidoAPercibir
        }
      });
    }

    // Orden: más reciente primero (por periodTo desc, fallback periodFrom)
    mantas.sort((a, b) => (b.periodTo ?? b.periodFrom ?? "").localeCompare(a.periodTo ?? a.periodFrom ?? ""));

    // KPI agregados (solo del marinero)
    const totalImporte = mantas.reduce((a, m) => a + (m.mias?.importeManta ?? 0), 0);
    const totalIrpf = mantas.reduce((a, m) => a + (m.mias?.irpfImporte ?? 0), 0);
    const totalLiquido = mantas.reduce((a, m) => a + (m.mias?.liquidoAPercibir ?? 0), 0);

    return ok({
      sailor: { id: sailor.id, name: sailor.name, role: sailor.role, parts: Number(sailor.parts), irpfRate: Number(sailor.irpfRate) },
      mantas,
      totals: {
        mantasCount: mantas.length,
        totalImporte, totalIrpf, totalLiquido
      }
    });
  } catch (e) { return handle(e); }
}
