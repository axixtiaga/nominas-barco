/**
 * Cálculo del MONTEMAYOR por (DÍA, PUERTO).
 *
 * Una factura de captura puede contener líneas de varios días (cada InvoiceLine
 * tiene su propia lineDate). El nivel de granularidad útil para nóminas es
 * (día, puerto), porque un marinero puede no haber ido a la mar todos los días
 * que aparecen en una misma factura.
 *
 * Fórmula por (día, puerto):
 *   total_pesca       = Σ line.amount  para  line.lineDate == día
 *                                            AND line.invoice.portId == puerto
 *                                            AND line.invoice.status == VERIFIED
 *   impuesto_puerto   = total_pesca × tasa_puerto    (% según PortTaxRate del puerto)
 *   subtotal          = total_pesca − impuesto_puerto
 *   kofradia_hnd      = subtotal × 3,0 %
 *   federacion        = subtotal × 0,1 %
 *   opegui            = subtotal × 0,4 %
 *   gastos_dia        = Σ gastos imputables al (día, puerto)
 *   montemayor        = subtotal − kofradia_hnd − federacion − opegui − gastos_dia
 *   ss_3_5            = (subtotal − kofradia − federación − opegui) × 3,5 %    ← misma base que la manta
 *   ss_4              = (subtotal − kofradia − federación − opegui) × 4,0 %    ← (los gastos NO se descuentan en la base SS)
 */
import { prisma } from "../prisma";

const KOFRADIA_HND_RATE = 0.03;
const FEDERACION_RATE   = 0.001;
const OPEGUI_RATE       = 0.004;
const SS_LOW_RATE       = 0.035;
const SS_HIGH_RATE      = 0.04;

/**
 * Puertos en los que la Federación (0,1%) y Opegui (0,4%) se calculan sobre el
 * TOTAL PESCA bruto (no sobre el subtotal después de descontar el % del puerto
 * de descarga). Esta excepción aplica en Getaria y Pasaia (Pasajes).
 *
 * El resto de puertos calcula Federación y Opegui sobre el subtotal (lo normal).
 */
const PORTS_FED_OPEGUI_ON_GROSS = ["GETARIA", "PASAIA", "PASAJES"];

function normalizePortName(name: string | null): string {
  if (!name) return "";
  // Quita tildes y pasa a mayúsculas para comparar con la lista de excepciones.
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const dayKey = (d: Date | null) => d ? d.toISOString().slice(0, 10) : "";

export type NominaRow = {
  /** Clave compuesta única para esta fila: "YYYY-MM-DD|portId" */
  key: string;
  date: string | null;            // ISO yyyy-mm-dd
  portId: string | null;
  portName: string | null;
  /** Capturas (Invoices) que aportan datos a esta jornada — informativo. */
  invoiceIds: string[];
  invoiceNumbers: string[];
  /** Manta asignada y estado cobrado, leídos del modelo NominaDay. */
  manta: string | null;
  paid: boolean;
  /** Importes calculados */
  totalPesca: number;
  portRate: number;
  impuestoPuerto: number;
  subtotal: number;
  kofradiaHnd: number;
  federacion: number;
  opegui: number;
  gastosDia: number;
  montemayor: number;
  ss35: number;
  ss40: number;
  gastosBreakdown: { source: string; description: string; amount: number; expenseId: string; lineId?: string | null }[];
};

export type NominaFilter = {
  from?: Date;
  to?: Date;
  portId?: string;
};

/**
 * Calcula las filas de nómina por (día, puerto) cruzando líneas de captura,
 * gastos y datos de NominaDay.
 */
export async function calcNominaDays(filter: NominaFilter = {}): Promise<NominaRow[]> {
  // 1) Líneas de captura VERIFIED con fecha y puerto resoluble
  const lines = await prisma.invoiceLine.findMany({
    where: {
      lineDate: filter.from || filter.to ? {
        ...(filter.from ? { gte: filter.from } : {}),
        ...(filter.to ? { lte: filter.to } : {})
      } : { not: null },
      invoice: {
        kind: "CAPTURA",
        status: "VERIFIED",
        ...(filter.portId ? { portId: filter.portId } : {})
      }
    },
    include: {
      invoice: { include: { port: { include: { taxRate: true } } } }
    }
  });

  // 2) Agrupa por (lineDate, portId)
  type Bucket = {
    date: string;
    portId: string | null;
    portName: string | null;
    portRate: number;
    totalPesca: number;
    invoiceIds: Set<string>;
    invoiceNumbers: Set<string>;
  };
  const buckets = new Map<string, Bucket>();
  for (const ln of lines) {
    if (!ln.lineDate) continue;
    const date = dayKey(ln.lineDate);
    const portId = ln.invoice.portId ?? null;
    const portName = ln.invoice.port?.name ?? null;
    const portRate = ln.invoice.port?.taxRate ? Number(ln.invoice.port.taxRate.rate) : 0;
    const key = `${date}|${portId ?? ""}`;
    const b = buckets.get(key) ?? {
      date, portId, portName, portRate,
      totalPesca: 0,
      invoiceIds: new Set<string>(),
      invoiceNumbers: new Set<string>()
    };
    b.totalPesca += Number(ln.amount);
    b.invoiceIds.add(ln.invoiceId);
    if (ln.invoice.invoiceNumber) b.invoiceNumbers.add(ln.invoice.invoiceNumber);
    buckets.set(key, b);
  }

  if (buckets.size === 0) return [];

  // 3) Carga gastos VERIFIED y sus líneas
  const expenses = await prisma.expense.findMany({
    where: { status: "VERIFIED" },
    include: { lines: true }
  });

  // 4) Carga las marcas NominaDay existentes para los días/puertos en juego.
  //    OJO: parsear como UTC para que coincida con cómo guarda /upsert.
  const datesInvolved = Array.from(new Set(Array.from(buckets.values()).map(b => new Date(b.date + "T00:00:00.000Z"))));
  const nominaDayRecords = await prisma.nominaDay.findMany({
    where: {
      date: { in: datesInvolved }
    }
  });
  const ndMap = new Map<string, typeof nominaDayRecords[number]>();
  for (const nd of nominaDayRecords) {
    ndMap.set(`${dayKey(nd.date)}|${nd.portId ?? ""}`, nd);
  }

  // 5) Construye filas finales
  const result: NominaRow[] = [];
  for (const [key, b] of buckets.entries()) {
    const totalPesca = round2(b.totalPesca);
    const impuestoPuerto = round2(totalPesca * b.portRate / 100);
    const subtotal = round2(totalPesca - impuestoPuerto);
    const kofradiaHnd = round2(subtotal * KOFRADIA_HND_RATE);
    // Excepción Getaria/Pasaia: Federación y Opegui se calculan sobre el TOTAL_PESCA
    // bruto (no sobre el subtotal). Para el resto de puertos: sobre el subtotal.
    const portNorm = normalizePortName(b.portName);
    const federacionBase = PORTS_FED_OPEGUI_ON_GROSS.includes(portNorm) ? totalPesca : subtotal;
    const federacion = round2(federacionBase * FEDERACION_RATE);
    const opegui = round2(federacionBase * OPEGUI_RATE);

    // Gastos imputables a esta (día, puerto)
    const gastosBreakdown: NominaRow["gastosBreakdown"] = [];
    let gastosDia = 0;
    const sameDayPort = (d: Date | null, pId: string | null) =>
      d && dayKey(d) === b.date && pId && pId === b.portId;
    const isLinkedToInvoice = (invoiceId: string | null) => invoiceId && b.invoiceIds.has(invoiceId);

    for (const exp of expenses) {
      if (exp.lines.length > 0) {
        for (const ln of exp.lines) {
          if (!ln.includeInMontemayor) continue;
          let belongs = false;
          if (ln.linkedInvoiceId && b.invoiceIds.has(ln.linkedInvoiceId) && (!ln.lineDate || dayKey(ln.lineDate) === b.date)) belongs = true;
          else if (!ln.linkedInvoiceId && exp.invoiceId && b.invoiceIds.has(exp.invoiceId) && (!ln.lineDate || dayKey(ln.lineDate) === b.date)) belongs = true;
          else if (!ln.linkedInvoiceId && !exp.invoiceId && ln.lineDate && dayKey(ln.lineDate) === b.date && exp.portId === b.portId) belongs = true;
          if (belongs) {
            const amt = Number(ln.amount);
            gastosDia += amt;
            gastosBreakdown.push({
              source: exp.expenseNumber ?? "(s/n)",
              description: ln.description ?? exp.concept ?? "(sin descripción)",
              amount: amt,
              expenseId: exp.id,
              lineId: ln.id
            });
          }
        }
      } else {
        let belongs = false;
        if (isLinkedToInvoice(exp.invoiceId) && exp.serviceDate && dayKey(exp.serviceDate) === b.date) belongs = true;
        else if (isLinkedToInvoice(exp.invoiceId) && exp.issueDate && dayKey(exp.issueDate) === b.date) belongs = true;
        else if (!exp.invoiceId && sameDayPort(exp.serviceDate ?? exp.issueDate, exp.portId)) belongs = true;
        if (belongs) {
          const amt = Number(exp.totalAmount);
          gastosDia += amt;
          gastosBreakdown.push({
            source: exp.expenseNumber ?? "(s/n)",
            description: exp.concept ?? "(sin concepto)",
            amount: amt,
            expenseId: exp.id,
            lineId: null
          });
        }
      }
    }
    gastosDia = round2(gastosDia);
    const montemayor = round2(subtotal - kofradiaHnd - federacion - opegui - gastosDia);
    // SS se calcula sobre los INGRESOS BRUTOS (Monte Mayor puro, antes de gastos)
    // para que coincida con la fórmula de la manta (manta-payroll.ts):
    //   manta SS = totalIngresos × tasa
    //   donde totalIngresos = Σ (subtotal − kofradia − federación − opegui) por jornada
    // Antes restábamos gastos_dia y por eso los totales del módulo SS no cuadraban
    // con los retenidos en las mantas.
    const ssBase = round2(subtotal - kofradiaHnd - federacion - opegui);
    const ss35 = round2(ssBase * SS_LOW_RATE);
    const ss40 = round2(ssBase * SS_HIGH_RATE);

    const nd = ndMap.get(key);

    result.push({
      key,
      date: b.date,
      portId: b.portId,
      portName: b.portName,
      invoiceIds: Array.from(b.invoiceIds),
      invoiceNumbers: Array.from(b.invoiceNumbers),
      manta: nd?.manta ?? null,
      paid: nd?.paid ?? false,
      totalPesca,
      portRate: b.portRate,
      impuestoPuerto,
      subtotal,
      kofradiaHnd,
      federacion,
      opegui,
      gastosDia,
      montemayor,
      ss35,
      ss40,
      gastosBreakdown
    });
  }

  // Orden por defecto: día asc, luego puerto
  result.sort((a, b) => {
    const dc = (a.date ?? "").localeCompare(b.date ?? "");
    if (dc !== 0) return dc;
    return (a.portName ?? "").localeCompare(b.portName ?? "");
  });
  return result;
}
