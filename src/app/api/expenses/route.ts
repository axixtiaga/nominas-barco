import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const where: any = {};
    if (status) where.status = status as any;
    const expenses = await prisma.expense.findMany({
      where,
      include: {
        document: { select: { id: true, filename: true, createdAt: true, status: true, parseError: true } },
        supplier: true,
        port: true,
        invoice: { select: { id: true, invoiceNumber: true, issueDate: true } }
      },
      orderBy: { issueDate: "desc" },
      take: 200
    });
    return ok(expenses);
  } catch (e) { return handle(e); }
}
