import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiSuccess, apiUnauthorized } from "@/lib/utils";
import { d } from "@/lib/decimal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const sp = req.nextUrl.searchParams;
  const periodId = sp.get("periodId") || undefined;
  const boatId   = sp.get("boatId")   || undefined;

  // Date range from period
  let dateFilter: { gte?: Date; lte?: Date } = {};
  if (periodId) {
    const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (period) dateFilter = { gte: period.startDate, lte: period.endDate };
  }

  const invoiceWhere = {
    ...(boatId && { boatId }),
    ...(Object.keys(dateFilter).length && { invoiceDate: dateFilter }),
  };

  const expenseWhere = {
    ...(boatId && { boatId }),
    ...(periodId && { periodId }),
  };

  // Parallel queries
  const [invoices, lines, expenses, latestRun, recentInvoices] = await Promise.all([
    prisma.invoice.aggregate({
      where: invoiceWhere,
      _sum: { totalAmount: true, subtotal: true },
      _count: { id: true },
    }),
    prisma.invoiceLine.findMany({
      where: { invoice: invoiceWhere },
      include: { species: true },
    }),
    prisma.expense.groupBy({
      by: ["target"],
      where: expenseWhere,
      _sum: { amount: true },
    }),
    prisma.payrollRun.findFirst({
      where: { ...(boatId && { boatId }), ...(periodId && { periodId }) },
      orderBy: { calculatedAt: "desc" },
      include: { period: true, boat: true },
    }),
    prisma.invoice.findMany({
      where: invoiceWhere,
      take: 5,
      orderBy: { invoiceDate: "desc" },
      include: { port: true, boat: true },
    }),
  ]);

  // Kilos & importe por especie
  const speciesMap: Record<string, { name: string; kilos: number; amount: number; lines: number }> = {};
  for (const line of lines) {
    const key = line.speciesId || line.speciesName || "Desconocida";
    const name = line.species?.name || line.speciesName || "Desconocida";
    if (!speciesMap[key]) speciesMap[key] = { name, kilos: 0, amount: 0, lines: 0 };
    speciesMap[key].kilos  += d(line.kilos);
    speciesMap[key].amount += d(line.lineAmount);
    speciesMap[key].lines  += 1;
  }
  const speciesSummary = Object.values(speciesMap)
    .sort((a, b) => b.amount - a.amount)
    .map((s) => ({
      ...s,
      kilos: Math.round(s.kilos * 10) / 10,
      amount: Math.round(s.amount * 100) / 100,
      priceAvg: s.kilos > 0 ? Math.round((s.amount / s.kilos) * 100) / 100 : 0,
    }));

  const totalKilos = lines.reduce((s: number, l: typeof lines[0]) => s + d(l.kilos), 0);
  const totalCapturas = d(invoices._sum.totalAmount);
  const totalExpenses = expenses.reduce((s: number, e: typeof expenses[0]) => s + d(e._sum.amount), 0);

  return apiSuccess({
    totalCapturas:  Math.round(totalCapturas * 100) / 100,
    totalInvoices:  invoices._count.id,
    totalKilos:     Math.round(totalKilos * 10) / 10,
    totalExpenses:  Math.round(totalExpenses * 100) / 100,
    costPerKilo:    totalKilos > 0 ? Math.round((totalExpenses / totalKilos) * 100) / 100 : 0,
    netIncome:      Math.round((totalCapturas - totalExpenses) * 100) / 100,
    speciesSummary,
    expensesByTarget: expenses.map((e: typeof expenses[0]) => ({ target: e.target, amount: d(e._sum.amount) })),
    latestRun:      latestRun ? {
      id:          latestRun.id,
      status:      latestRun.status,
      totalNeto:   d(latestRun.totalNeto),
      totalBruto:  d(latestRun.totalBruto),
      period:      latestRun.period.name,
      boat:        latestRun.boat.name,
      calculatedAt:latestRun.calculatedAt,
    } : null,
    recentInvoices: recentInvoices.map((inv: typeof recentInvoices[0]) => ({
      id:            inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate:   inv.invoiceDate,
      totalAmount:   d(inv.totalAmount),
      port:          inv.port?.name,
      boat:          inv.boat?.name,
    })),
  });
}
