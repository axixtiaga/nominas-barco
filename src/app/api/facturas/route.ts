import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized, parsePaginationParams, paginationMeta } from "@/lib/utils";
import { invoiceSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = parsePaginationParams(sp);
  const search   = sp.get("q")        || "";
  const boatId   = sp.get("boatId")   || undefined;
  const portId   = sp.get("portId")   || undefined;
  const periodId = sp.get("periodId") || undefined;
  const from     = sp.get("from");
  const to       = sp.get("to");

  // Resolve date range
  let dateFilter: { gte?: Date; lte?: Date } = {};
  if (periodId) {
    const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (period) dateFilter = { gte: period.startDate, lte: period.endDate };
  } else if (from || to) {
    if (from) dateFilter.gte = new Date(from);
    if (to)   dateFilter.lte = new Date(to);
  }

  const where = {
    ...(boatId && { boatId }),
    ...(portId && { portId }),
    ...(Object.keys(dateFilter).length && { invoiceDate: dateFilter }),
    ...(search && {
      OR: [
        { invoiceNumber: { contains: search, mode: "insensitive" as const } },
        { boat:     { name: { contains: search, mode: "insensitive" as const } } },
        { supplier: { name: { contains: search, mode: "insensitive" as const } } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: limit,
      include: {
        port: true,
        supplier: true,
        boat: true,
        lines: { include: { species: true } },
        document: { select: { id: true, filename: true, status: true } },
      },
      orderBy: { invoiceDate: "desc" },
    }),
    prisma.invoice.count({ where }),
  ]);

  return apiSuccess({ items: data, meta: paginationMeta(total, page, limit) });
}

export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const body = await req.json();
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const { lines, ...invoiceData } = parsed.data;

  const invoice = await prisma.invoice.create({
    data: {
      ...invoiceData,
      invoiceDate: new Date(invoiceData.invoiceDate),
      lines: { create: lines },
    },
    include: { lines: true, port: true, supplier: true, boat: true },
  });

  await createAuditLog({ userId: session.id, action: "CREATE", entity: "Invoice", entityId: invoice.id, newValues: { invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount } });
  return apiSuccess(invoice, 201);
}
