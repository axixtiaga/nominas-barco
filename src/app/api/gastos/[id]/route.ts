import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { expenseSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const item = await prisma.expense.findUnique({ where: { id }, include: { expenseType: true, period: true, boat: true, crewMember: true } });
  if (!item) return apiError("No encontrado", 404);
  return apiSuccess(item);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;

  const body = await req.json();
  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const old = await prisma.expense.findUnique({ where: { id } });
  if (!old) return apiError("No encontrado", 404);

  const updated = await prisma.expense.update({
    where: { id },
    data: { ...parsed.data, date: new Date(parsed.data.date), periodId: parsed.data.periodId || null, boatId: parsed.data.boatId || null, crewMemberId: parsed.data.crewMemberId || null },
    include: { expenseType: true },
  });
  await createAuditLog({ userId: session.id, action: "UPDATE", entity: "Expense", entityId: id, oldValues: old, newValues: updated });
  return apiSuccess(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;
  const old = await prisma.expense.findUnique({ where: { id } });
  if (!old) return apiError("No encontrado", 404);
  await prisma.expense.delete({ where: { id } });
  await createAuditLog({ userId: session.id, action: "DELETE", entity: "Expense", entityId: id });
  return apiSuccess({ ok: true });
}
