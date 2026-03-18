import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized, parsePaginationParams, paginationMeta } from "@/lib/utils";
import { expenseSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = parsePaginationParams(sp);
  const periodId  = sp.get("periodId")  || undefined;
  const boatId    = sp.get("boatId")    || undefined;
  const typeCode  = sp.get("typeCode")  || undefined;

  const where = {
    ...(periodId && { periodId }),
    ...(boatId   && { boatId }),
    ...(typeCode  && { expenseType: { code: typeCode } }),
  };

  const [data, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip,
      take: limit,
      include: { expenseType: true, period: true, boat: true, crewMember: true },
      orderBy: { date: "desc" },
    }),
    prisma.expense.count({ where }),
  ]);

  return apiSuccess({ items: data, meta: paginationMeta(total, page, limit) });
}

export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const body = await req.json();
  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const item = await prisma.expense.create({
    data: {
      ...parsed.data,
      date: new Date(parsed.data.date),
      periodId:     parsed.data.periodId     || null,
      boatId:       parsed.data.boatId       || null,
      crewMemberId: parsed.data.crewMemberId || null,
    },
    include: { expenseType: true, period: true, boat: true },
  });

  await createAuditLog({ userId: session.id, action: "CREATE", entity: "Expense", entityId: item.id, newValues: item });
  return apiSuccess(item, 201);
}
