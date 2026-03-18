import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiSuccess, apiUnauthorized, parsePaginationParams, paginationMeta } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = parsePaginationParams(sp);
  const periodId = sp.get("periodId") || undefined;
  const boatId   = sp.get("boatId")   || undefined;
  const status   = sp.get("status")   || undefined;

  const where = {
    ...(periodId && { periodId }),
    ...(boatId   && { boatId }),
    ...(status   && { status: status as "BORRADOR" | "VALIDADA" | "CERRADA" | "PAGADA" }),
  };

  const [data, total] = await Promise.all([
    prisma.payrollRun.findMany({
      where,
      skip,
      take: limit,
      include: {
        period: true,
        boat: true,
        runByUser: { select: { name: true } },
        items: { include: { crewMember: true } },
      },
      orderBy: { calculatedAt: "desc" },
    }),
    prisma.payrollRun.count({ where }),
  ]);

  return apiSuccess({ items: data, meta: paginationMeta(total, page, limit) });
}
