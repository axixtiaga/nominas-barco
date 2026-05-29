import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

/**
 * Análisis comparado Year-over-Year ("tiempo constante"):
 * compara el año en curso contra el año anterior tomando como tope el MISMO día
 * del año en ambos. Por defecto la referencia es "hoy", pero se puede mover en
 * el tiempo para análisis retrospectivos (ej. "cómo iba el 30 de junio").
 *
 * Devuelve todo lo necesario para el panel de Análisis comparado en una única
 * llamada, para que la UI no tenga que orquestar varias peticiones.
 */

export type YoyFilters = {
  /** Año "actual" a comparar (por defecto el del refDate). */
  thisYear?: number;
  /** Año contra el que comparar (por defecto thisYear - 1). */
  lastYear?: number;
  /** Fecha de referencia: el "hoy virtual". Acota el comparativo al mismo día
   *  del año en ambos. Por defecto: ahora. */
  refDate?: Date;
  /** Filtrar por un puerto concreto. */
  portId?: string | null;
  /** Filtrar por una especie concreta (rawSpeciesName si no está normalizada). */
  speciesId?: string | null;
};

export type YoyKpi = {
  kilos: number;
  amount: number;
  invoices: number;
  avgPrice: number;
};

export type YoyDailyPoint = {
  /** Día del año (1-366) */
  day: number;
  thisKilos: number;
  thisAmount: number;
  lastKilos: number;
  lastAmount: number;
  /** Acumulado a este día (calculado en el cliente, pero también lo precalculamos aquí para conveniencia) */
  thisCumKilos: number;
  thisCumAmount: number;
  lastCumKilos: number;
  lastCumAmount: number;
};

export type YoyMonthlyPoint = {
  month: number;   // 1-12
  thisKilos: number;
  thisAmount: number;
  lastKilos: number;
  lastAmount: number;
};

export type YoyBreakdownRow = {
  key: string;             // identificador (speciesId, portId, o nombre normalizado)
  label: string;           // nombre legible
  thisKilos: number;
  thisAmount: number;
  thisAvgPrice: number;
  lastKilos: number;
  lastAmount: number;
  lastAvgPrice: number;
};

export type YoyResult = {
  meta: {
    thisYear: number;
    lastYear: number;
    refDateISO: string;
    dayOfYear: number;
    filters: { portId: string | null; speciesId: string | null };
  };
  kpis: { this: YoyKpi; last: YoyKpi };
  daily: YoyDailyPoint[];
  monthly: YoyMonthlyPoint[];
  bySpecies: YoyBreakdownRow[];
  byPort: YoyBreakdownRow[];
  /** Puertos que tienen datos en los dos años comparados (para el desplegable). */
  availablePorts: { id: string; name: string }[];
  /** Especies que tienen datos en los dos años comparados (para el desplegable). */
  availableSpecies: { id: string; commonName: string }[];
};

/** Devuelve el día del año (1-366) para una fecha. */
function dayOfYearOf(d: Date): number {
  const start = Date.UTC(d.getFullYear(), 0, 0);
  const end = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((end - start) / 86400000);
}

function avg(amount: number, kilos: number): number {
  return kilos > 0 ? amount / kilos : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* ───────────── Servicio principal ───────────── */

export async function getYoyAnalysis(f: YoyFilters = {}): Promise<YoyResult> {
  const refDate = f.refDate ?? new Date();
  const thisYear = f.thisYear ?? refDate.getFullYear();
  const lastYear = f.lastYear ?? thisYear - 1;
  const dayCut = dayOfYearOf(refDate);

  // Filtros condicionales (parametrizados, seguros frente a inyección).
  const portCond = f.portId
    ? Prisma.sql`AND i."portId" = ${f.portId}`
    : Prisma.empty;
  const speciesCond = f.speciesId
    ? Prisma.sql`AND il."speciesId" = ${f.speciesId}`
    : Prisma.empty;

  // ── 1) KPIs YTD (kilos, importe, mareas, precio medio) por año ──
  const ytdRows = await prisma.$queryRaw<Array<{
    year: number; kilos: number; amount: number; invoices: number;
  }>>(Prisma.sql`
    SELECT
      EXTRACT(YEAR FROM il."lineDate")::int AS year,
      COALESCE(SUM(il.kilos), 0)::float AS kilos,
      COALESCE(SUM(il.amount), 0)::float AS amount,
      COUNT(DISTINCT i.id)::int AS invoices
    FROM "InvoiceLine" il
    JOIN "Invoice" i ON il."invoiceId" = i.id
    WHERE i.status = 'VERIFIED'
      AND il."lineDate" IS NOT NULL
      AND EXTRACT(YEAR FROM il."lineDate") IN (${thisYear}, ${lastYear})
      AND EXTRACT(DOY FROM il."lineDate") <= ${dayCut}
      ${portCond}
      ${speciesCond}
    GROUP BY year
  `);

  const ytdMap = new Map<number, { kilos: number; amount: number; invoices: number }>();
  for (const r of ytdRows) {
    ytdMap.set(Number(r.year), {
      kilos: Number(r.kilos), amount: Number(r.amount), invoices: Number(r.invoices)
    });
  }
  const thisYtd = ytdMap.get(thisYear) ?? { kilos: 0, amount: 0, invoices: 0 };
  const lastYtd = ytdMap.get(lastYear) ?? { kilos: 0, amount: 0, invoices: 0 };

  // ── 2) Serie diaria por año (kilos + importe por día del año) ──
  // Importante: para la curva de evolución cogemos TODO el año del año pasado
  // (no solo hasta el dayCut), para poder ver la temporada completa anterior.
  const dailyRows = await prisma.$queryRaw<Array<{
    year: number; doy: number; kilos: number; amount: number;
  }>>(Prisma.sql`
    SELECT
      EXTRACT(YEAR FROM il."lineDate")::int AS year,
      EXTRACT(DOY FROM il."lineDate")::int AS doy,
      COALESCE(SUM(il.kilos), 0)::float AS kilos,
      COALESCE(SUM(il.amount), 0)::float AS amount
    FROM "InvoiceLine" il
    JOIN "Invoice" i ON il."invoiceId" = i.id
    WHERE i.status = 'VERIFIED'
      AND il."lineDate" IS NOT NULL
      AND EXTRACT(YEAR FROM il."lineDate") IN (${thisYear}, ${lastYear})
      ${portCond}
      ${speciesCond}
    GROUP BY year, doy
    ORDER BY year, doy
  `);

  const dailyThis = new Map<number, { kilos: number; amount: number }>();
  const dailyLast = new Map<number, { kilos: number; amount: number }>();
  for (const r of dailyRows) {
    const target = Number(r.year) === thisYear ? dailyThis : dailyLast;
    target.set(Number(r.doy), { kilos: Number(r.kilos), amount: Number(r.amount) });
  }

  // Generamos la serie de 1 a 366 para tener una curva continua (con huecos = 0).
  // Para "thisYear" cortamos en dayCut (no hay datos futuros).
  const daily: YoyDailyPoint[] = [];
  let thisCumK = 0, thisCumA = 0, lastCumK = 0, lastCumA = 0;
  for (let d = 1; d <= 366; d++) {
    const tk = dailyThis.get(d)?.kilos ?? 0;
    const ta = dailyThis.get(d)?.amount ?? 0;
    const lk = dailyLast.get(d)?.kilos ?? 0;
    const la = dailyLast.get(d)?.amount ?? 0;

    // Acumulado año en curso solo hasta dayCut, sin valores futuros.
    if (d <= dayCut) {
      thisCumK += tk;
      thisCumA += ta;
    }
    lastCumK += lk;
    lastCumA += la;

    daily.push({
      day: d,
      thisKilos: d <= dayCut ? tk : 0,
      thisAmount: d <= dayCut ? ta : 0,
      lastKilos: lk,
      lastAmount: la,
      thisCumKilos: d <= dayCut ? round2(thisCumK) : 0,
      thisCumAmount: d <= dayCut ? round2(thisCumA) : 0,
      lastCumKilos: round2(lastCumK),
      lastCumAmount: round2(lastCumA)
    });
  }

  // ── 3) Agregados mensuales por año ──
  const monthlyRows = await prisma.$queryRaw<Array<{
    year: number; month: number; kilos: number; amount: number;
  }>>(Prisma.sql`
    SELECT
      EXTRACT(YEAR FROM il."lineDate")::int AS year,
      EXTRACT(MONTH FROM il."lineDate")::int AS month,
      COALESCE(SUM(il.kilos), 0)::float AS kilos,
      COALESCE(SUM(il.amount), 0)::float AS amount
    FROM "InvoiceLine" il
    JOIN "Invoice" i ON il."invoiceId" = i.id
    WHERE i.status = 'VERIFIED'
      AND il."lineDate" IS NOT NULL
      AND EXTRACT(YEAR FROM il."lineDate") IN (${thisYear}, ${lastYear})
      ${portCond}
      ${speciesCond}
    GROUP BY year, month
    ORDER BY year, month
  `);

  const monthlyMap = new Map<string, { kilos: number; amount: number }>();
  for (const r of monthlyRows) {
    monthlyMap.set(`${r.year}-${r.month}`, { kilos: Number(r.kilos), amount: Number(r.amount) });
  }
  const monthly: YoyMonthlyPoint[] = [];
  for (let m = 1; m <= 12; m++) {
    const t = monthlyMap.get(`${thisYear}-${m}`) ?? { kilos: 0, amount: 0 };
    const l = monthlyMap.get(`${lastYear}-${m}`) ?? { kilos: 0, amount: 0 };
    monthly.push({
      month: m,
      thisKilos: round2(t.kilos),
      thisAmount: round2(t.amount),
      lastKilos: round2(l.kilos),
      lastAmount: round2(l.amount)
    });
  }

  // ── 4) Desglose por especie (YoY, comparando hasta el mismo día) ──
  const speciesRows = await prisma.$queryRaw<Array<{
    year: number; species_id: string | null; common_name: string | null;
    raw_name: string | null; kilos: number; amount: number;
  }>>(Prisma.sql`
    SELECT
      EXTRACT(YEAR FROM il."lineDate")::int AS year,
      il."speciesId" AS species_id,
      s."commonName" AS common_name,
      il."rawSpeciesName" AS raw_name,
      COALESCE(SUM(il.kilos), 0)::float AS kilos,
      COALESCE(SUM(il.amount), 0)::float AS amount
    FROM "InvoiceLine" il
    JOIN "Invoice" i ON il."invoiceId" = i.id
    LEFT JOIN "Species" s ON il."speciesId" = s.id
    WHERE i.status = 'VERIFIED'
      AND il."lineDate" IS NOT NULL
      AND EXTRACT(YEAR FROM il."lineDate") IN (${thisYear}, ${lastYear})
      AND EXTRACT(DOY FROM il."lineDate") <= ${dayCut}
      ${portCond}
      ${speciesCond}
    GROUP BY year, species_id, common_name, raw_name
  `);

  // Pivot: agrupar por nombre normalizado y rellenar this/last.
  type SpeciesAccum = { label: string; thisK: number; thisA: number; lastK: number; lastA: number };
  const speciesMap = new Map<string, SpeciesAccum>();
  for (const r of speciesRows) {
    const label = (r.common_name ?? r.raw_name ?? "(sin especie)").toString();
    const key = r.species_id ?? `raw:${label}`;
    const acc = speciesMap.get(key) ?? { label, thisK: 0, thisA: 0, lastK: 0, lastA: 0 };
    if (Number(r.year) === thisYear) { acc.thisK += Number(r.kilos); acc.thisA += Number(r.amount); }
    else { acc.lastK += Number(r.kilos); acc.lastA += Number(r.amount); }
    speciesMap.set(key, acc);
  }
  const bySpecies: YoyBreakdownRow[] = Array.from(speciesMap.entries()).map(([key, a]) => ({
    key,
    label: a.label,
    thisKilos: round2(a.thisK),
    thisAmount: round2(a.thisA),
    thisAvgPrice: round2(avg(a.thisA, a.thisK)),
    lastKilos: round2(a.lastK),
    lastAmount: round2(a.lastA),
    lastAvgPrice: round2(avg(a.lastA, a.lastK))
  })).sort((x, y) => y.thisAmount - x.thisAmount);

  // ── 5) Desglose por puerto (YoY) ──
  const portRows = await prisma.$queryRaw<Array<{
    year: number; port_id: string | null; port_name: string | null;
    kilos: number; amount: number;
  }>>(Prisma.sql`
    SELECT
      EXTRACT(YEAR FROM il."lineDate")::int AS year,
      i."portId" AS port_id,
      p.name AS port_name,
      COALESCE(SUM(il.kilos), 0)::float AS kilos,
      COALESCE(SUM(il.amount), 0)::float AS amount
    FROM "InvoiceLine" il
    JOIN "Invoice" i ON il."invoiceId" = i.id
    LEFT JOIN "Port" p ON i."portId" = p.id
    WHERE i.status = 'VERIFIED'
      AND il."lineDate" IS NOT NULL
      AND EXTRACT(YEAR FROM il."lineDate") IN (${thisYear}, ${lastYear})
      AND EXTRACT(DOY FROM il."lineDate") <= ${dayCut}
      ${portCond}
      ${speciesCond}
    GROUP BY year, port_id, port_name
  `);

  type PortAccum = { label: string; thisK: number; thisA: number; lastK: number; lastA: number };
  const portMap = new Map<string, PortAccum>();
  for (const r of portRows) {
    const label = (r.port_name ?? "(sin puerto)").toString();
    const key = r.port_id ?? `noport:${label}`;
    const acc = portMap.get(key) ?? { label, thisK: 0, thisA: 0, lastK: 0, lastA: 0 };
    if (Number(r.year) === thisYear) { acc.thisK += Number(r.kilos); acc.thisA += Number(r.amount); }
    else { acc.lastK += Number(r.kilos); acc.lastA += Number(r.amount); }
    portMap.set(key, acc);
  }
  const byPort: YoyBreakdownRow[] = Array.from(portMap.entries()).map(([key, a]) => ({
    key,
    label: a.label,
    thisKilos: round2(a.thisK),
    thisAmount: round2(a.thisA),
    thisAvgPrice: round2(avg(a.thisA, a.thisK)),
    lastKilos: round2(a.lastK),
    lastAmount: round2(a.lastA),
    lastAvgPrice: round2(avg(a.lastA, a.lastK))
  })).sort((x, y) => y.thisAmount - x.thisAmount);

  // ── 6) Puertos y especies que TIENEN datos en los dos años comparados ──
  // Importante: estas listas NO aplican los filtros de portId/speciesId, para
  // que los desplegables del UI sigan ofreciendo todas las opciones del periodo
  // (no se autolimiten cuando ya hay un filtro elegido).
  const availablePortsRows = await prisma.$queryRaw<Array<{
    port_id: string | null; port_name: string | null;
  }>>(Prisma.sql`
    SELECT DISTINCT i."portId" AS port_id, p.name AS port_name
    FROM "Invoice" i
    LEFT JOIN "Port" p ON i."portId" = p.id
    JOIN "InvoiceLine" il ON il."invoiceId" = i.id
    WHERE i.status = 'VERIFIED'
      AND il."lineDate" IS NOT NULL
      AND EXTRACT(YEAR FROM il."lineDate") IN (${thisYear}, ${lastYear})
      AND i."portId" IS NOT NULL
    ORDER BY p.name
  `);
  const availablePorts = availablePortsRows
    .filter(r => r.port_id && r.port_name)
    .map(r => ({ id: r.port_id!, name: r.port_name! }));

  const availableSpeciesRows = await prisma.$queryRaw<Array<{
    species_id: string; common_name: string;
  }>>(Prisma.sql`
    SELECT DISTINCT il."speciesId" AS species_id, s."commonName" AS common_name
    FROM "InvoiceLine" il
    JOIN "Invoice" i ON il."invoiceId" = i.id
    JOIN "Species" s ON il."speciesId" = s.id
    WHERE i.status = 'VERIFIED'
      AND il."lineDate" IS NOT NULL
      AND EXTRACT(YEAR FROM il."lineDate") IN (${thisYear}, ${lastYear})
      AND il."speciesId" IS NOT NULL
    ORDER BY s."commonName"
  `);
  const availableSpecies = availableSpeciesRows
    .map(r => ({ id: r.species_id, commonName: r.common_name }));

  return {
    meta: {
      thisYear,
      lastYear,
      refDateISO: refDate.toISOString(),
      dayOfYear: dayCut,
      filters: { portId: f.portId ?? null, speciesId: f.speciesId ?? null }
    },
    kpis: {
      this: {
        kilos: round2(thisYtd.kilos),
        amount: round2(thisYtd.amount),
        invoices: thisYtd.invoices,
        avgPrice: round2(avg(thisYtd.amount, thisYtd.kilos))
      },
      last: {
        kilos: round2(lastYtd.kilos),
        amount: round2(lastYtd.amount),
        invoices: lastYtd.invoices,
        avgPrice: round2(avg(lastYtd.amount, lastYtd.kilos))
      }
    },
    daily,
    monthly,
    bySpecies,
    byPort,
    availablePorts,
    availableSpecies
  };
}
