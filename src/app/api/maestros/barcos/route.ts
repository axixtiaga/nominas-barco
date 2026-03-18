import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized, parsePaginationParams, paginationMeta } from "@/lib/utils";
import { boatSchema } from "@/lib/validations";
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
    ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { registration: { contains: search, mode: "insensitive" as const } }] }
    : {};

  const [data, total] = await Promise.all([
    prisma.boat.findMany({ where, skip, take: limit, orderBy: { name: "asc" } }),
    prisma.boat.count({ where }),
  ]);

  return apiSuccess({ items: data, meta: paginationMeta(total, page, limit) });
}

export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const body = await req.json();
  const parsed = boatSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const existing = await prisma.boat.findUnique({ where: { registration: parsed.data.registration } });
  if (existing) return apiError("Ya existe un barco con esa matrícula", 409);

  const boat = await prisma.boat.create({
    data: { ...parsed.data, tonGt: parsed.data.tonGt ? parsed.data.tonGt : undefined },
  });

  await createAuditLog({ userId: session.id, action: "CREATE", entity: "Boat", entityId: boat.id, newValues: boat });
  return apiSuccess(boat, 201);
}
