import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized, parsePaginationParams, paginationMeta } from "@/lib/utils";
import { crewMemberSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = parsePaginationParams(sp);
  const search = sp.get("q") || "";
  const boatId = sp.get("boatId") || undefined;

  const where = {
    ...(boatId && { boatId }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { lastName: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.crewMember.findMany({
      where,
      skip,
      take: limit,
      include: { category: true, boat: true },
      orderBy: [{ lastName: "asc" }, { name: "asc" }],
    }),
    prisma.crewMember.count({ where }),
  ]);

  return apiSuccess({ items: data, meta: paginationMeta(total, page, limit) });
}

export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const body = await req.json();
  const parsed = crewMemberSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const data = {
    ...parsed.data,
    email: parsed.data.email || null,
    joinDate: parsed.data.joinDate ? new Date(parsed.data.joinDate) : null,
  };

  const item = await prisma.crewMember.create({ data, include: { category: true } });
  await createAuditLog({ userId: session.id, action: "CREATE", entity: "CrewMember", entityId: item.id, newValues: item });
  return apiSuccess(item, 201);
}
