import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

/**
 * GET /api/dashboard/expenses
 *   KPIs y agregados de gastos para el panel de control.
 *   Solo gastos VERIFIED para los importes; los DRAFT solo se cuentan como "pendientes".
 */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const q = req.nextUrl.searchParams;
    const from = q.get("from") ? new Date(q.get("from")! + "T00:00:00.000Z") : undefined;
    const to   = q.get("to")   ? new Date(q.get("to")!   + "T23:59:59.999Z") : undefined;

    const dateFilter = (from || to) ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

    // 1) KPIs principales (gastos VERIFIED dentro del rango)
    const [verifiedAgg, draftCount, failedCount] = await Promise.all([
      prisma.expense.aggregate({
        where: { status: "VERIFIED", ...dateFilter },
        _sum: { totalAmount: true, baseAmount: true, vatAmount: true },
        _count: { _all: true }
      }),
      prisma.expense.count({ where: { status: "DRAFT" } }),
      prisma.expense.count({ where: { status: "FAILED" } as any })
    ]);

    // 2) Total descontable del montemayor
    const verifiedExpenses = await prisma.expense.findMany({
      where: { status: "VERIFIED", ...dateFilter },
      include: { lines: { select: { amount: true, includeInMontemayor: true, lineDate: true } } }
    });
    let computableTotal = 0;
    for (const e of verifiedExpenses) {
      if (e.lines.length > 0) {
        for (const ln of e.lines) {
          if (ln.includeInMontemayor) computableTotal += Number(ln.amount);
        }
      } else {
        computableTotal += Number(e.totalAmount);
      }
    }
    computableTotal = Math.round(computableTotal * 100) / 100;

    // 3) Por categoría
    const byCategoryRaw = await prisma.expense.groupBy({
      by: ["category"],
      where: { status: "VERIFIED", ...dateFilter },
      _sum: { totalAmount: true },
      _count: { _all: true },
      orderBy: { _sum: { totalAmount: "desc" } }
    });
    const byCategory = byCategoryRaw.map(r => ({
      category: r.category,
      count: r._count._all,
      total: Number(r._sum.totalAmount ?? 0)
    }));

    // 4) Top proveedores
    const bySupplierRaw = await prisma.expense.groupBy({
      by: ["supplierId"],
      where: { status: "VERIFIED", supplierId: { not: null }, ...dateFilter },
      _sum: { totalAmount: true },
      _count: { _all: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 20
    });
    const supplierIds = bySupplierRaw.map(r => r.supplierId).filter(Boolean) as string[];
    const suppliers = supplierIds.length
      ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, taxId: true } })
      : [];
    const supplierMap = new Map(suppliers.map(s => [s.id, s]));
    const bySupplier = bySupplierRaw.map(r => ({
      supplierId: r.supplierId,
      supplierName: r.supplierId ? supplierMap.get(r.supplierId)?.name ?? "(desconocido)" : "(sin proveedor)",
      count: r._count._all,
      total: Number(r._sum.totalAmount ?? 0)
    }));

    // 5) Evolución mensual y diaria
    const verifiedWithDates = await prisma.expense.findMany({
      where: { status: "VERIFIED", issueDate: { not: null }, ...dateFilter },
      select: { issueDate: true, totalAmount: true, category: true }
    });
    const byMonthMap = new Map<string, { total: number; count: number }>();
    const byDayMap = new Map<string, { total: number; count: number }>();
    for (const e of verifiedWithDates) {
      if (!e.issueDate) continue;
      const monthKey = e.issueDate.toISOString().slice(0, 7);
      const dayKey = e.issueDate.toISOString().slice(0, 10);
      const m = byMonthMap.get(monthKey) ?? { total: 0, count: 0 };
      m.total += Number(e.totalAmount); m.count += 1;
      byMonthMap.set(monthKey, m);
      const d = byDayMap.get(dayKey) ?? { total: 0, count: 0 };
      d.total += Number(e.totalAmount); d.count += 1;
      byDayMap.set(dayKey, d);
    }
    const byMonth = Array.from(byMonthMap.entries())
      .map(([month, v]) => ({ month, total: Math.round(v.total * 100) / 100, count: v.count }))
      .sort((a, b) => a.month.localeCompare(b.month));
    const byDay = Array.from(byDayMap.entries())
      .map(([day, v]) => ({ day, total: Math.round(v.total * 100) / 100, count: v.count }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return ok({
      kpis: {
        verifiedTotal: Number(verifiedAgg._sum.totalAmount ?? 0),
        verifiedBase: Number(verifiedAgg._sum.baseAmount ?? 0),
        verifiedVat: Number(verifiedAgg._sum.vatAmount ?? 0),
        verifiedCount: verifiedAgg._count._all,
        draftCount,
        failedCount,
        computableTotal
      },
      byCategory,
      bySupplier,
      byMonth,
      byDay
    });
  } catch (e) { return handle(e); }
}
