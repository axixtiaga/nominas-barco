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

  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      period: true,
      boat: true,
      runByUser: { select: { name: true, email: true } },
      items: {
        include: {
          crewMember: { include: { category: true } },
        },
        orderBy: { brutoPescador: "desc" },
      },
    },
  });

  if (!run) return apiError("No encontrado", 404);
  return apiSuccess(run);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;

  const { action, adjustments } = await req.json();

  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) return apiError("No encontrado", 404);

  if (run.status === "CERRADA" || run.status === "PAGADA") {
    return apiError("No se puede modificar una nómina cerrada o pagada");
  }

  let updated;

  if (action === "validar") {
    updated = await prisma.payrollRun.update({
      where: { id },
      data: { status: "VALIDADA", validatedAt: new Date() },
    });
    await createAuditLog({ userId: session.id, action: "VALIDATE", entity: "PayrollRun", entityId: id });
  } else if (action === "cerrar") {
    if (run.status !== "VALIDADA") return apiError("Solo se pueden cerrar nóminas validadas");
    updated = await prisma.payrollRun.update({
      where: { id },
      data: { status: "CERRADA", closedAt: new Date() },
    });
    // Lock the period
    await prisma.payrollPeriod.update({
      where: { id: run.periodId },
      data: { status: "CERRADO" },
    });
    await createAuditLog({ userId: session.id, action: "CLOSE", entity: "PayrollRun", entityId: id });
  } else if (action === "ajustar" && adjustments) {
    // Apply manual adjustments to individual items
    await prisma.$transaction(
      adjustments.map((adj: { itemId: string; amount: number; note: string }) =>
        prisma.payrollItem.update({
          where: { id: adj.itemId },
          data: {
            manualAdjustment: adj.amount,
            adjustmentNote: adj.note,
            netoPescador: { increment: adj.amount },
          },
        })
      )
    );
    updated = await prisma.payrollRun.findUnique({ where: { id } });
    await createAuditLog({ userId: session.id, action: "ADJUST", entity: "PayrollRun", entityId: id, newValues: { adjustments } });
  } else {
    return apiError("Acción no reconocida");
  }

  return apiSuccess(updated);
}
