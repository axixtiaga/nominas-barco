import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";

export type AnalysisDim = "species" | "port" | "boat" | "supplier" | "daily" | "weekly" | "monthly";

export type AnalysisFilters = {
  from?: Date;
  to?: Date;
  portId?: string;
  speciesId?: string;
};

/**
 * Construye el WHERE base sobre InvoiceLine con joins implícitos a Invoice.
 * Por defecto solo incluye facturas VERIFIED (datos consolidados). Los borradores
 * todavía no contables no entran en el dashboard ni los KPIs.
 */
function buildLineWhere(f: AnalysisFilters): Prisma.InvoiceLineWhereInput {
  const where: Prisma.InvoiceLineWhereInput = {};
  if (f.speciesId) where.speciesId = f.speciesId;
  const invWhere: Prisma.InvoiceWhereInput = { status: "VERIFIED" };
  if (f.from || f.to) invWhere.issueDate = { gte: f.from, lte: f.to };
  if (f.portId) invWhere.portId = f.portId;
  where.invoice = invWhere;
  return where;
}

/** KPIs globales respetando los filtros aplicados. */
export async function getKpis(f: AnalysisFilters) {
  const where = buildLineWhere(f);
  const agg = await prisma.invoiceLine.aggregate({
    where,
    _sum: { kilos: true, amount: true, vatAmount: true },
    _count: { _all: true }
  });
  const invoicesCount = await prisma.invoice.count({
    where: {
      status: "VERIFIED",
      ...(f.from || f.to ? { issueDate: { gte: f.from, lte: f.to } } : {}),
      ...(f.portId ? { portId: f.portId } : {}),
      ...(f.speciesId ? { lines: { some: { speciesId: f.speciesId } } } : {})
    }
  });
  return {
    invoices: invoicesCount,
    lines: agg._count._all,
    kilos: Number(agg._sum.kilos ?? 0),
    amount: Number(agg._sum.amount ?? 0),
    vat: Number(agg._sum.vatAmount ?? 0),
    avgPrice: Number(agg._sum.kilos ?? 0) > 0
      ? Number(agg._sum.amount ?? 0) / Number(agg._sum.kilos ?? 0)
      : 0
  };
}

/** Serie temporal por día: (fecha, puerto, kilos, importe). Solo facturas verificadas. */
export async function getDaily(f: AnalysisFilters) {
  const params: any[] = [];
  const conds: string[] = [`il."lineDate" IS NOT NULL`, `inv.status = 'VERIFIED'`];
  if (f.from) { params.push(f.from); conds.push(`il."lineDate" >= $${params.length}`); }
  if (f.to)   { params.push(f.to);   conds.push(`il."lineDate" <= $${params.length}`); }
  if (f.portId) { params.push(f.portId); conds.push(`inv."portId" = $${params.length}`); }
  if (f.speciesId) { params.push(f.speciesId); conds.push(`il."speciesId" = $${params.length}`); }

  const sql = `
    SELECT
      TO_CHAR(il."lineDate", 'YYYY-MM-DD') AS day,
      inv."portId" AS "portId",
      p.name AS "portName",
      SUM(il.kilos)::float AS kilos,
      SUM(il.amount)::float AS amount
    FROM "InvoiceLine" il
    JOIN "Invoice" inv ON il."invoiceId" = inv.id
    LEFT JOIN "Port" p ON inv."portId" = p.id
    WHERE ${conds.join(" AND ")}
    GROUP BY 1, 2, 3
    ORDER BY 1 DESC, p.name ASC
  `;
  return prisma.$queryRawUnsafe<any[]>(sql, ...params);
}

/**
 * Agrupa por semana ISO (lunes-domingo). Solo facturas verificadas.
 * Devuelve:
 *  - week:      identificador ordenable "2026-W18"
 *  - label:     etiqueta legible para gráficos: "S18 · 27/04-03/05"
 *  - weekStart: lunes de la semana en DD/MM/YYYY
 *  - weekEnd:   domingo de la semana en DD/MM/YYYY
 *  - kilos, amount, invoices
 */
export async function getWeekly(f: AnalysisFilters) {
  const params: any[] = [];
  const conds: string[] = [`il."lineDate" IS NOT NULL`, `inv.status = 'VERIFIED'`];
  if (f.from) { params.push(f.from); conds.push(`il."lineDate" >= $${params.length}`); }
  if (f.to)   { params.push(f.to);   conds.push(`il."lineDate" <= $${params.length}`); }
  if (f.portId) { params.push(f.portId); conds.push(`inv."portId" = $${params.length}`); }
  if (f.speciesId) { params.push(f.speciesId); conds.push(`il."speciesId" = $${params.length}`); }

  const sql = `
    SELECT
      TO_CHAR(DATE_TRUNC('week', il."lineDate"), 'IYYY"-W"IW') AS week,
      'S' || TO_CHAR(DATE_TRUNC('week', il."lineDate"), 'IW') ||
        ' · ' || TO_CHAR(DATE_TRUNC('week', il."lineDate"), 'DD/MM') ||
        '-'   || TO_CHAR(DATE_TRUNC('week', il."lineDate") + INTERVAL '6 days', 'DD/MM') AS label,
      TO_CHAR(DATE_TRUNC('week', il."lineDate"), 'DD/MM/YYYY') AS "weekStart",
      TO_CHAR(DATE_TRUNC('week', il."lineDate") + INTERVAL '6 days', 'DD/MM/YYYY') AS "weekEnd",
      SUM(il.kilos)::float AS kilos,
      SUM(il.amount)::float AS amount,
      COUNT(DISTINCT il."invoiceId")::int AS invoices
    FROM "InvoiceLine" il
    JOIN "Invoice" inv ON il."invoiceId" = inv.id
    WHERE ${conds.join(" AND ")}
    GROUP BY 1, 2, 3, 4
    ORDER BY 1 ASC
  `;
  return prisma.$queryRawUnsafe<any[]>(sql, ...params);
}

/** Agrupa por mes. Solo facturas verificadas. */
export async function getMonthly(f: AnalysisFilters) {
  const params: any[] = [];
  const conds: string[] = [`il."lineDate" IS NOT NULL`, `inv.status = 'VERIFIED'`];
  if (f.from) { params.push(f.from); conds.push(`il."lineDate" >= $${params.length}`); }
  if (f.to)   { params.push(f.to);   conds.push(`il."lineDate" <= $${params.length}`); }
  if (f.portId) { params.push(f.portId); conds.push(`inv."portId" = $${params.length}`); }
  if (f.speciesId) { params.push(f.speciesId); conds.push(`il."speciesId" = $${params.length}`); }

  const sql = `
    SELECT
      TO_CHAR(DATE_TRUNC('month', il."lineDate"), 'YYYY-MM') AS month,
      SUM(il.kilos)::float AS kilos,
      SUM(il.amount)::float AS amount,
      COUNT(DISTINCT il."invoiceId")::int AS invoices
    FROM "InvoiceLine" il
    JOIN "Invoice" inv ON il."invoiceId" = inv.id
    WHERE ${conds.join(" AND ")}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  return prisma.$queryRawUnsafe<any[]>(sql, ...params);
}

/** Agrupa por especie normalizada. Incluye las líneas sin normalizar como "(sin especie)". */
export async function getBySpecies(f: AnalysisFilters) {
  const where = buildLineWhere(f);
  const rows = await prisma.invoiceLine.groupBy({
    by: ["speciesId"],
    where,
    _sum: { kilos: true, amount: true },
    _avg: { pricePerKg: true }
  });
  const species = await prisma.species.findMany();
  return rows.map(r => {
    const sp = species.find(s => s.id === r.speciesId);
    return {
      speciesId: r.speciesId,
      code: sp?.code ?? null,
      commonName: sp?.commonName ?? "(sin especie)",
      kilos: Number(r._sum.kilos ?? 0),
      amount: Number(r._sum.amount ?? 0),
      avgPrice: Number(r._avg.pricePerKg ?? 0)
    };
  }).sort((a, b) => b.amount - a.amount);
}

export async function getByPort(f: AnalysisFilters) {
  const where = buildLineWhere(f);
  const rows = await prisma.invoiceLine.groupBy({
    by: ["invoiceId"],
    where,
    _sum: { kilos: true, amount: true }
  });
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: rows.map(r => r.invoiceId) } },
    select: { id: true, portId: true, port: { select: { name: true } } }
  });
  const byPort = new Map<string, { portId: string | null; portName: string; kilos: number; amount: number; invoices: number }>();
  for (const r of rows) {
    const inv = invoices.find(i => i.id === r.invoiceId);
    const portId = inv?.portId ?? null;
    const key = portId ?? "NULL";
    const acc = byPort.get(key) ?? { portId, portName: inv?.port?.name ?? "(sin puerto)", kilos: 0, amount: 0, invoices: 0 };
    acc.kilos += Number(r._sum.kilos ?? 0);
    acc.amount += Number(r._sum.amount ?? 0);
    acc.invoices += 1;
    byPort.set(key, acc);
  }
  return [...byPort.values()].sort((a, b) => b.amount - a.amount);
}

export async function getBySupplier(f: AnalysisFilters) {
  const whereInv: Prisma.InvoiceWhereInput = {
    status: "VERIFIED",
    ...(f.from || f.to ? { issueDate: { gte: f.from, lte: f.to } } : {}),
    ...(f.portId ? { portId: f.portId } : {}),
    ...(f.speciesId ? { lines: { some: { speciesId: f.speciesId } } } : {})
  };
  const invoices = await prisma.invoice.findMany({
    where: whereInv,
    include: { supplier: true, lines: true }
  });
  const m = new Map<string, { supplierId: string | null; name: string; kilos: number; amount: number; invoices: number }>();
  for (const inv of invoices) {
    const key = inv.supplierId ?? "NULL";
    const acc = m.get(key) ?? { supplierId: inv.supplierId, name: inv.supplier?.name ?? "(sin proveedor)", kilos: 0, amount: 0, invoices: 0 };
    acc.kilos += inv.lines.reduce((a, l) => a + Number(l.kilos), 0);
    acc.amount += inv.lines.reduce((a, l) => a + Number(l.amount), 0);
    acc.invoices += 1;
    m.set(key, acc);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}
