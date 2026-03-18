import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { supplierSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const item = await prisma.supplier.findUnique({ where: { id } });
  if (!item) return apiError("No encontrado", 404);
  return apiSuccess(item);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const body = await req.json();
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);
  const old = await prisma.supplier.findUnique({ where: { id } });
  if (!old) return apiError("No encontrado", 404);
  const updated = await prisma.supplier.update({
    where: { id },
    data: { ...parsed.data, email: parsed.data.email || null, portId: parsed.data.portId || null },
  });
  await createAuditLog({ userId: session.id, action: "UPDATE", entity: "Supplier", entityId: id, oldValues: old, newValues: updated });
  return apiSuccess(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;
  await prisma.supplier.update({ where: { id }, data: { active: false } });
  await createAuditLog({ userId: session.id, action: "DELETE", entity: "Supplier", entityId: id });
  return apiSuccess({ ok: true });
}
