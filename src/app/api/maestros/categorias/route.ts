import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const categorySchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  code: z.string().min(1, "Código requerido"),
  allocationParts: z.number().min(0).default(1),
  socialSecurityGroup: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const data = await prisma.crewCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return apiSuccess(data);
}

export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const body = await req.json();
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);
  const existing = await prisma.crewCategory.findUnique({ where: { code: parsed.data.code } });
  if (existing) return apiError("Ya existe una categoría con ese código", 409);
  const item = await prisma.crewCategory.create({ data: parsed.data });
  await createAuditLog({ userId: session.id, action: "CREATE", entity: "CrewCategory", entityId: item.id, newValues: item });
  return apiSuccess(item, 201);
}
