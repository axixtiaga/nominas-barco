import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized, parsePaginationParams, paginationMeta } from "@/lib/utils";
import { speciesSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = parsePaginationParams(sp);
  const search   = sp.get("q")    || "";
  const all      = sp.get("all") === "true"; // return all without pagination

  const where = search ? { name: { contains: search, mode: "insensitive" as const } } : {};

  if (all) {
    const data = await prisma.species.findMany({ where, orderBy: { name: "asc" } });
    return apiSuccess(data);
  }

  const [data, total] = await Promise.all([
    prisma.species.findMany({ where, skip, take: limit, orderBy: { name: "asc" } }),
    prisma.species.count({ where }),
  ]);

  return apiSuccess({ items: data, meta: paginationMeta(total, page, limit) });
}

export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const body = await req.json();
  const parsed = speciesSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const item = await prisma.species.create({ data: parsed.data });
  await createAuditLog({ userId: session.id, action: "CREATE", entity: "Species", entityId: item.id, newValues: item });
  return apiSuccess(item, 201);
}
