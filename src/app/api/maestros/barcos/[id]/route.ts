import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { boatSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const item = await prisma.boat.findUnique({ where: { id } });
  if (!item) return apiError("No encontrado", 404);
  return apiSuccess(item);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;

  const body = await req.json();
  const parsed = boatSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const old = await prisma.boat.findUnique({ where: { id } });
  if (!old) return apiError("No encontrado", 404);

  const updated = await prisma.boat.update({ where: { id }, data: parsed.data });
  await createAuditLog({ userId: session.id, action: "UPDATE", entity: "Boat", entityId: id, oldValues: old, newValues: updated });
  return apiSuccess(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;

  const old = await prisma.boat.findUnique({ where: { id } });
  if (!old) return apiError("No encontrado", 404);

  await prisma.boat.update({ where: { id }, data: { active: false } });
  await createAuditLog({ userId: session.id, action: "DELETE", entity: "Boat", entityId: id, oldValues: old });
  return apiSuccess({ ok: true });
}
