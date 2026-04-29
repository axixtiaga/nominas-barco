import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

/**
 * GET /api/ss-payments
 *   Lista los pagos de Seguridad Social registrados.
 *   Query: ?month=YYYY-MM (opcional) → solo ese mes
 *   Devuelve también la lista de meses disponibles.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const month = req.nextUrl.searchParams.get("month");

    const where = month ? { month } : {};
    const [payments, allMonthsRaw, sailors] = await Promise.all([
      prisma.ssPayment.findMany({
        where,
        include: { sailor: { select: { id: true, name: true, role: true } } },
        orderBy: [{ month: "desc" }, { sailorNameRaw: "asc" }]
      }),
      prisma.ssPayment.findMany({
        select: { month: true },
        distinct: ["month"],
        orderBy: { month: "desc" }
      }),
      prisma.sailor.findMany({
        where: { active: true },
        select: { id: true, name: true, role: true }
      })
    ]);

    return ok({
      payments: payments.map(p => ({
        id: p.id,
        sailorId: p.sailorId,
        sailorName: p.sailor.name,
        sailorRole: p.sailor.role,
        sailorNameRaw: p.sailorNameRaw,
        sailorDniRaw: p.sailorDniRaw,
        month: p.month,
        amount: decimalToNumber(p.amount),
        totalCost: p.totalCost ? decimalToNumber(p.totalCost) : null,
        employerPart: p.employerPart ? decimalToNumber(p.employerPart) : null,
        employeePart: p.employeePart ? decimalToNumber(p.employeePart) : null,
        sourceFile: p.sourceFile,
        importedAt: p.importedAt
      })),
      availableMonths: allMonthsRaw.map(m => m.month),
      activeSailors: sailors,
      filter: { month }
    });
  } catch (e) { return handle(e); }
}

function decimalToNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    const n = v.toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const s = (typeof v.toString === "function") ? v.toString() : String(v);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
