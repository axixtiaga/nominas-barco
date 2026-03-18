import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;

  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return apiError("No encontrado", 404);

  const updated = await prisma.invoice.update({
    where: { id },
    data: { reviewed: true, reviewedAt: new Date(), reviewedBy: session.id },
  });

  await createAuditLog({ userId: session.id, action: "REVIEW", entity: "Invoice", entityId: id });
  return apiSuccess(updated);
}
