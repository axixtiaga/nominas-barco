import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ssSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  employeePercent: z.number().min(0).max(1),
  employerPercent: z.number().min(0).max(1),
  baseType: z.string().default("TOTAL_CAPTURAS"),
  description: z.string().optional(),
  validFrom: z.string().min(1),
  validTo: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const data = await prisma.socialSecurityParameter.findMany({ orderBy: { validFrom: "desc" } });
  return apiSuccess(data);
}

export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const body = await req.json();
  const parsed = ssSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const item = await prisma.socialSecurityParameter.create({
    data: { ...parsed.data, validFrom: new Date(parsed.data.validFrom), validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null },
  });
  await createAuditLog({ userId: session.id, action: "CREATE", entity: "SSParam", entityId: item.id, newValues: item });
  return apiSuccess(item, 201);
}
