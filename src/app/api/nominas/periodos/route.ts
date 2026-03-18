import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { periodSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const data = await prisma.payrollPeriod.findMany({ orderBy: { startDate: "desc" } });
  return apiSuccess(data);
}

export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const body = await req.json();
  const parsed = periodSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const item = await prisma.payrollPeriod.create({
    data: {
      ...parsed.data,
      startDate: new Date(parsed.data.startDate),
      endDate:   new Date(parsed.data.endDate),
      boatId:    parsed.data.boatId || null,
    },
  });
  await createAuditLog({ userId: session.id, action: "CREATE", entity: "PayrollPeriod", entityId: item.id, newValues: item });
  return apiSuccess(item, 201);
}
