import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * POST /api/ss-payments/reset
 *   Borra TODOS los pagos de Seguridad Social registrados.
 *   Útil para limpiar tras una importación con datos erróneos y empezar de cero.
 *   También se puede limitar a un mes con ?month=YYYY-MM.
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN"]);
    const month = req.nextUrl.searchParams.get("month");
    const where = month ? { month } : {};
    const result = await prisma.ssPayment.deleteMany({ where });
    await audit({
      userId: s.sub, entity: "SsPayment", entityId: "bulk",
      action: "DELETE", newValue: { deleted: result.count, month: month ?? "ALL" }
    });
    return ok({ deleted: result.count, month: month ?? "ALL" });
  } catch (e) { return handle(e); }
}
