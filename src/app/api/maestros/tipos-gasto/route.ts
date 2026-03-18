import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiSuccess, apiUnauthorized } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const data = await prisma.expenseType.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return apiSuccess(data);
}
