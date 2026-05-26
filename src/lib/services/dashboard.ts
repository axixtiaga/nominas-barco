import { prisma } from "../prisma";

/**
 * KPIs y breakdowns del dashboard. Solo computa facturas VERIFIED
 * — los borradores NO entran en el cálculo (aparecen en /documents para revisar,
 * pero no aquí hasta que el usuario los valide).
 */
export async function getDashboard(params: { from?: Date; to?: Date } = {}) {
  const where: any = { status: "VERIFIED" };
  if (params.from || params.to) where.issueDate = { gte: params.from, lte: params.to };

  // WHERE para líneas: por las facturas VERIFIED relacionadas.
  const lineWhere: any = { invoice: { status: "VERIFIED" } };
  if (params.from || params.to) lineWhere.invoice.issueDate = { gte: params.from, lte: params.to };

  const [totalInvoices, aggInv, byPort, byBoat, bySupplier, byMonth, bySpecies, byRaw] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where, _sum: { subtotal: true, taxes: true, fees: true, total: true }, _avg: { subtotal: true, total: true } }),
    prisma.invoice.groupBy({ by: ["portId"], where, _count: { _all: true }, _sum: { subtotal: true, total: true } }),
    prisma.invoice.groupBy({ by: ["boatId"], where, _count: { _all: true }, _sum: { subtotal: true, total: true } }),
    prisma.invoice.groupBy({ by: ["supplierId"], where, _count: { _all: true }, _sum: { subtotal: true, total: true } }),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT to_char(date_trunc('month', "issueDate"), 'YYYY-MM') as month,
              COUNT(*)::int as invoices,
              COALESCE(SUM("subtotal"),0)::float as subtotal,
              COALESCE(SUM("total"),0)::float as total
         FROM "Invoice"
        WHERE "issueDate" IS NOT NULL AND status = 'VERIFIED'
        GROUP BY 1 ORDER BY 1`
    ),
    prisma.invoiceLine.groupBy({
      by: ["speciesId"],
      where: lineWhere,
      _sum: { kilos: true, amount: true },
      _avg: { pricePerKg: true }
    }),
    prisma.invoiceLine.groupBy({
      by: ["rawSpeciesName"],
      where: lineWhere,
      _sum: { kilos: true, amount: true }
    })
  ]);

  const [ports, boats, suppliers, species] = await Promise.all([
    prisma.port.findMany(), prisma.boat.findMany(), prisma.supplier.findMany(), prisma.species.findMany()
  ]);
  const name = <T extends { id: string; name?: string; commonName?: string }>(arr: T[], id: string | null) =>
    arr.find(x => x.id === id)?.["name" as keyof T] as string | undefined;

  return {
    kpis: {
      totalInvoices,
      income: Number(aggInv._sum.subtotal ?? 0),
      taxes: Number(aggInv._sum.taxes ?? 0),
      fees: Number(aggInv._sum.fees ?? 0),
      total: Number(aggInv._sum.total ?? 0),
      avgSubtotal: Number(aggInv._avg.subtotal ?? 0),
      avgTotal: Number(aggInv._avg.total ?? 0)
    },
    byPort: byPort.map(r => ({ portId: r.portId, portName: name(ports, r.portId) ?? "—", invoices: r._count._all, subtotal: Number(r._sum.subtotal ?? 0), total: Number(r._sum.total ?? 0) })),
    byBoat: byBoat.map(r => ({ boatId: r.boatId, boatName: name(boats, r.boatId) ?? "—", invoices: r._count._all, subtotal: Number(r._sum.subtotal ?? 0), total: Number(r._sum.total ?? 0) })),
    bySupplier: bySupplier.map(r => ({ supplierId: r.supplierId, supplierName: name(suppliers, r.supplierId) ?? "—", invoices: r._count._all, subtotal: Number(r._sum.subtotal ?? 0), total: Number(r._sum.total ?? 0) })),
    bySpecies: bySpecies.map(r => {
      const sp = species.find(s => s.id === r.speciesId);
      return {
        speciesId: r.speciesId,
        code: sp?.code ?? null,
        commonName: sp?.commonName ?? "(sin normalizar)",
        kilos: Number(r._sum.kilos ?? 0),
        amount: Number(r._sum.amount ?? 0),
        avgPrice: Number(r._avg.pricePerKg ?? 0)
      };
    }),
    byRawSpecies: byRaw.map(r => ({ rawName: r.rawSpeciesName, kilos: Number(r._sum.kilos ?? 0), amount: Number(r._sum.amount ?? 0) })),
    byMonth
  };
}
