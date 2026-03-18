import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { allocationRuleSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const data = await prisma.allocationRule.findMany({ orderBy: { createdAt: "desc" } });
  return apiSuccess(data);
}

export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const body = await req.json();
  const parsed = allocationRuleSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  if (Math.abs(parsed.data.ownerPercent + parsed.data.crewPercent - 100) > 0.01) {
    return apiError("El porcentaje armador + tripulación debe sumar 100%");
  }

  const item = await prisma.allocationRule.create({
    data: {
      ...parsed.data,
      validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
      validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null,
    },
  });
  await createAuditLog({ userId: session.id, action: "CREATE", entity: "AllocationRule", entityId: item.id, newValues: item });
  return apiSuccess(item, 201);
}
