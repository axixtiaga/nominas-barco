import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const item = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!item) return apiError("No encontrado", 404);
  return apiSuccess(item);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;

  const body = await req.json();
  const { status } = body;

  if (!["ABIERTO", "CERRADO", "BLOQUEADO"].includes(status)) {
    return apiError("Estado inválido");
  }

  const old = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!old) return apiError("No encontrado", 404);

  const updated = await prisma.payrollPeriod.update({
    where: { id },
    data: {
      status,
      ...(status === "BLOQUEADO" && { lockedAt: new Date(), lockedBy: session.id }),
    },
  });

  await createAuditLog({ userId: session.id, action: "UPDATE_STATUS", entity: "PayrollPeriod", entityId: id, oldValues: { status: old.status }, newValues: { status } });
  return apiSuccess(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;

  const runs = await prisma.payrollRun.count({ where: { periodId: id } });
  if (runs > 0) return apiError("No se puede eliminar un período con liquidaciones asociadas", 409);

  await prisma.payrollPeriod.delete({ where: { id } });
  await createAuditLog({ userId: session.id, action: "DELETE", entity: "PayrollPeriod", entityId: id });
  return apiSuccess({ ok: true });
}
