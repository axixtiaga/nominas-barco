import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized, parsePaginationParams, paginationMeta } from "@/lib/utils";
import { portSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = parsePaginationParams(sp);
  const search = sp.get("q") || "";

  const where = search
    ? { name: { contains: search, mode: "insensitive" as const } }
    : {};

  const [data, total] = await Promise.all([
    prisma.port.findMany({ where, skip, take: limit, orderBy: { name: "asc" } }),
    prisma.port.count({ where }),
  ]);

  return apiSuccess({ items: data, meta: paginationMeta(total, page, limit) });
}

export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const body = await req.json();
  const parsed = portSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const item = await prisma.port.create({ data: parsed.data });
  await createAuditLog({ userId: session.id, action: "CREATE", entity: "Port", entityId: item.id, newValues: item });
  return apiSuccess(item, 201);
}
