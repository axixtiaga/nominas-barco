/**
 * Confección de la nómina (manta) replicando la fórmula del PDF "Nomina N Itsas Lagunak":
 *
 *   INGRESOS = Σ Monte Mayor "puro" por puerto (sin descontar gastos)   ← MM puro = subtotal − kofradia − federación − opegui
 *   GASTOS   = Σ líneas de gasto marcadas para descontar (incluye gastos de cofradía Y proveedores varios)
 *   LIQUIDO MONTE MAYOR = INGRESOS − GASTOS
 *   PARTICIPACION TRIPULACION 50% = LIQUIDO MONTE MAYOR × 0.5
 *   SS PARTE TRIPULACION = INGRESOS × 4%   ← cálculo real (etiquetado como "3,5%" en UI/PDF por decisión del usuario)
 *   LIQUIDO BRUTO        = PARTICIPACION 50% − SS PARTE TRIPULACION
 *   MANTA POR PARTE = LIQUIDO BRUTO / Σ partes de marineros activos
 *   IRPF MARINERO = MANTA × IRPF% del marinero
 *   LIQUIDO A PERCIBIR = MANTA POR PARTE − IRPF MARINERO
 */
import { prisma } from "../prisma";

const KOFRADIA_HND_RATE = 0.03;
const FEDERACION_RATE   = 0.001;
const OPEGUI_RATE       = 0.004;
// Tipo REAL de retención por Seguridad Social aplicado sobre los ingresos brutos
// para calcular la parte de la tripulación. Desde 2026 = 4%.
// IMPORTANTE: por decisión del usuario, en las etiquetas mostradas a la
// tripulación (PDF, UI) se sigue indicando "3,5%" aunque el cálculo use 4%.
// No igualar la etiqueta sin confirmar con el armador.
const SS_TRIPULACION    = 0.04;
const PORTS_FED_OPEGUI_ON_GROSS = ["GETARIA", "PASAIA", "PASAJES"];

const round2 = (n: number) => Math.round(n * 100) / 100;

export type IngresoPorPuerto = { portId: string | null; portName: string; total: number };
export type GastoPorCategoria = { category: string; total: number };
export type GastoLinea = { expenseId: string; lineId?: string | null; description: string; supplier: string | null; category: string; amount: number; date: string | null };

export type MarineroEntrada = {
  sailorId: string;
  name: string;
  role: string;
  parts: number;
  irpfRate: number;
  importeManta: number;
  irpfImporte: number;
  liquidoAPercibir: number;
};

export type MantaPayroll = {
  manta: string;
  periodFrom: string | null;
  periodTo: string | null;
  validatedAt: string | null;
  ingresosPorPuerto: IngresoPorPuerto[];
  totalIngresos: number;
  gastosPorCategoria: GastoPorCategoria[];
  gastosLineas: GastoLinea[];
  totalGastos: number;
  liquidoMonteMayor: number;
  participacionTripulacion: number;     // 50% del líquido MM
  ssTripulacion: number;                 // 3.5% sobre ingresos
  liquidoBruto: number;
  totalPartes: number;
  importePorParte: number;
  marineros: MarineroEntrada[];
  totalIrpfRetenido: number;
  totalLiquidoAPercibir: number;
};

function normalizePortName(name: string | null): string {
  if (!name) return "";
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

function dayKey(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/**
 * Calcula la nómina (manta) completa para un identificador de manta dado.
 * Si no hay marineros activos, marineros[] queda vacío y los repartos individuales son 0.
 */
export async function calcMantaPayroll(manta: string): Promise<MantaPayroll> {
  // 1) Cargar todas las marcas NominaDay con esa manta (define qué (día, puerto) entran)
  const nominaDays = await prisma.nominaDay.findMany({
    where: { manta },
    include: { port: { include: { taxRate: true } } }
  });

  // 2) Para cada (día, puerto), obtener líneas de captura VERIFIED y agregar
  type Bucket = {
    portId: string | null;
    portName: string;
    portRate: number;
    totalPesca: number;
    invoiceIds: Set<string>;
    date: string;
  };
  const buckets: Bucket[] = [];

  for (const nd of nominaDays) {
    const dateISO = dayKey(nd.date);
    const portRate = nd.port?.taxRate ? Number(nd.port.taxRate.rate) : 0;
    // Líneas del día que correspondan al puerto
    const lines = await prisma.invoiceLine.findMany({
      where: {
        lineDate: { gte: new Date(dateISO + "T00:00:00.000Z"), lte: new Date(dateISO + "T23:59:59.999Z") },
        invoice: {
          kind: "CAPTURA",
          status: "VERIFIED",
          ...(nd.portId ? { portId: nd.portId } : {})
        }
      },
      select: { amount: true, invoiceId: true }
    });
    const totalPesca = lines.reduce((a, l) => a + Number(l.amount), 0);
    const invoiceIds = new Set(lines.map(l => l.invoiceId));
    buckets.push({
      portId: nd.portId,
      portName: nd.port?.name ?? "(sin puerto)",
      portRate,
      totalPesca,
      invoiceIds,
      date: dateISO
    });
  }

  // 3) Calcular MM "puro" por puerto (sumando todas las jornadas del mismo puerto)
  type PortAgg = { portId: string | null; portName: string; ingreso: number };
  const byPort = new Map<string, PortAgg>();
  for (const b of buckets) {
    const portRate = b.portRate;
    const impuestoPuerto = b.totalPesca * portRate / 100;
    const subtotal = b.totalPesca - impuestoPuerto;
    const kofradia = subtotal * KOFRADIA_HND_RATE;
    const portNorm = normalizePortName(b.portName);
    const fedBase = PORTS_FED_OPEGUI_ON_GROSS.includes(portNorm) ? b.totalPesca : subtotal;
    const federacion = fedBase * FEDERACION_RATE;
    const opegui = fedBase * OPEGUI_RATE;
    const ingresoMM = subtotal - kofradia - federacion - opegui;

    const key = `${b.portId ?? ""}`;
    const existing = byPort.get(key) ?? { portId: b.portId, portName: b.portName, ingreso: 0 };
    existing.ingreso += ingresoMM;
    byPort.set(key, existing);
  }

  const ingresosPorPuerto = Array.from(byPort.values())
    .map(p => ({ ...p, total: round2(p.ingreso) }))
    .filter(p => p.total !== 0)
    .sort((a, b) => b.total - a.total);
  const totalIngresos = round2(ingresosPorPuerto.reduce((a, p) => a + p.total, 0));

  // 4) Gastos: vinculados a alguna captura/jornada de la manta o que coincidan en (día, puerto)
  const allInvoiceIds = new Set<string>();
  for (const b of buckets) for (const id of b.invoiceIds) allInvoiceIds.add(id);

  const expenses = await prisma.expense.findMany({
    where: { status: "VERIFIED" },
    include: { lines: true, supplier: true }
  });

  const gastosLineas: GastoLinea[] = [];
  const gastosPorCategoriaMap = new Map<string, number>();

  function pushGasto(g: GastoLinea, cat: string) {
    gastosLineas.push(g);
    gastosPorCategoriaMap.set(cat, (gastosPorCategoriaMap.get(cat) ?? 0) + g.amount);
  }

  // PRIORIDADES de imputación de un gasto a una manta:
  //   1) ExpenseLine.manta == manta            (asignación explícita por línea)
  //   2) Expense.manta == manta                (asignación explícita por cabecera)
  //   3) line.linkedInvoiceId / expense.invoiceId pertenece a la manta
  //   4) Misma fecha + mismo puerto que una jornada de la manta
  // Si una línea/cabecera tiene manta asignada DISTINTA, se ignora aquí (va a la otra manta).
  for (const exp of expenses) {
    const cat = exp.category as string;
    const expHasOtherManta = exp.manta && exp.manta !== manta;
    if (exp.lines.length > 0) {
      for (const ln of exp.lines) {
        if (!ln.includeInMontemayor) continue;
        // Si la línea tiene manta asignada y no es esta, ignorar
        if (ln.manta && ln.manta !== manta) continue;
        // Si la cabecera del expense tiene manta asignada distinta y la línea no tiene la suya propia, ignorar
        if (!ln.manta && expHasOtherManta) continue;

        let belongs = false;
        if (ln.manta === manta) belongs = true;
        else if (exp.manta === manta) belongs = true;
        else if (ln.linkedInvoiceId && allInvoiceIds.has(ln.linkedInvoiceId)) belongs = true;
        else if (exp.invoiceId && allInvoiceIds.has(exp.invoiceId)) belongs = true;
        else if (ln.lineDate) {
          const ldKey = dayKey(ln.lineDate);
          for (const b of buckets) {
            if (b.date === ldKey && b.portId === exp.portId) { belongs = true; break; }
          }
        }
        if (belongs) {
          pushGasto({
            expenseId: exp.id,
            lineId: ln.id,
            description: ln.description ?? exp.concept ?? "(sin descripción)",
            supplier: exp.supplier?.name ?? null,
            category: cat,
            amount: Number(ln.amount),
            date: ln.lineDate ? dayKey(ln.lineDate) : null
          }, cat);
        }
      }
    } else {
      // Expense sin líneas de detalle
      if (expHasOtherManta) continue;

      let belongs = false;
      if (exp.manta === manta) belongs = true;
      else if (exp.invoiceId && allInvoiceIds.has(exp.invoiceId)) belongs = true;
      else if (!exp.invoiceId && exp.issueDate) {
        const eKey = dayKey(exp.serviceDate ?? exp.issueDate);
        for (const b of buckets) {
          if (b.date === eKey && b.portId === exp.portId) { belongs = true; break; }
        }
      }
      if (belongs) {
        pushGasto({
          expenseId: exp.id,
          description: exp.concept ?? "(sin concepto)",
          supplier: exp.supplier?.name ?? null,
          category: cat,
          amount: Number(exp.totalAmount),
          date: exp.serviceDate ? dayKey(exp.serviceDate) : (exp.issueDate ? dayKey(exp.issueDate) : null)
        }, cat);
      }
    }
  }

  // 4.b) Gastos MANUALES de la manta (Hielo producido y otros añadidos a mano)
  const manualGastos = await prisma.mantaManualGasto.findMany({ where: { manta } });
  for (const mg of manualGastos) {
    const cat = mg.category as string;
    pushGasto({
      expenseId: mg.id,
      description: mg.description + (mg.hours ? ` (${Number(mg.hours)}h × ${Number(mg.kgPerHour)}kg/h × ${Number(mg.pricePerTn)}€/Tn)` : ""),
      supplier: null,
      category: cat,
      amount: Number(mg.amount),
      date: null
    }, cat);
  }

  const gastosPorCategoria = Array.from(gastosPorCategoriaMap.entries())
    .map(([category, total]) => ({ category, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
  const totalGastos = round2(gastosPorCategoria.reduce((a, c) => a + c.total, 0));

  // 5) Cálculos agregados del manta
  const liquidoMonteMayor = round2(totalIngresos - totalGastos);
  const participacionTripulacion = round2(liquidoMonteMayor * 0.5);
  const ssTripulacion = round2(totalIngresos * SS_TRIPULACION);
  const liquidoBruto = round2(participacionTripulacion - ssTripulacion);

  // 6) Cargar marineros activos y repartir
  const sailors = await prisma.sailor.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const totalPartes = sailors.reduce((a, s) => a + Number(s.parts), 0);
  const importePorParte = totalPartes > 0 ? round2(liquidoBruto / totalPartes) : 0;

  const marineros: MarineroEntrada[] = sailors.map(s => {
    const parts = Number(s.parts);
    const importeManta = round2(importePorParte * parts);
    const irpfImporte = round2(importeManta * Number(s.irpfRate) / 100);
    const liquidoAPercibir = round2(importeManta - irpfImporte);
    return {
      sailorId: s.id,
      name: s.name,
      role: s.role as string,
      parts,
      irpfRate: Number(s.irpfRate),
      importeManta,
      irpfImporte,
      liquidoAPercibir
    };
  });

  const totalIrpfRetenido = round2(marineros.reduce((a, m) => a + m.irpfImporte, 0));
  const totalLiquidoAPercibir = round2(marineros.reduce((a, m) => a + m.liquidoAPercibir, 0));

  // Período: rango de fechas de las jornadas que componen el manta
  const dates = buckets.map(b => b.date).sort();
  const periodFrom = dates[0] ?? null;
  const periodTo = dates[dates.length - 1] ?? null;

  // Estado de validación
  const mantaInfo = await prisma.mantaInfo.findUnique({ where: { manta } });
  const validatedAt = mantaInfo?.validatedAt ? mantaInfo.validatedAt.toISOString() : null;

  return {
    manta,
    periodFrom,
    periodTo,
    validatedAt,
    ingresosPorPuerto,
    totalIngresos,
    gastosPorCategoria,
    gastosLineas,
    totalGastos,
    liquidoMonteMayor,
    participacionTripulacion,
    ssTripulacion,
    liquidoBruto,
    totalPartes,
    importePorParte,
    marineros,
    totalIrpfRetenido,
    totalLiquidoAPercibir
  };
}
