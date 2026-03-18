import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { allocationRuleSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const item = await prisma.allocationRule.findUnique({ where: { id } });
  if (!item) return apiError("No encontrado", 404);
  return apiSuccess(item);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;

  const body = await req.json();
  const parsed = allocationRuleSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  if (Math.abs(parsed.data.ownerPercent + parsed.data.crewPercent - 100) > 0.01) {
    return apiError("El porcentaje armador + tripulación debe sumar 100%");
  }

  const old = await prisma.allocationRule.findUnique({ where: { id } });
  if (!old) return apiError("No encontrado", 404);

  const updated = await prisma.allocationRule.update({
    where: { id },
    data: {
      ...parsed.data,
      validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
      validTo:   parsed.data.validTo   ? new Date(parsed.data.validTo)   : null,
    },
  });

  await createAuditLog({ userId: session.id, action: "UPDATE", entity: "AllocationRule", entityId: id, oldValues: old, newValues: updated });
  return apiSuccess(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;
  await prisma.allocationRule.update({ where: { id }, data: { active: false } });
  await createAuditLog({ userId: session.id, action: "DELETE", entity: "AllocationRule", entityId: id });
  return apiSuccess({ ok: true });
}
