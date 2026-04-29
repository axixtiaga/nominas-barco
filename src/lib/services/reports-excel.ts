/**
 * Generación de ficheros Excel con los reportes (mensual y anual).
 *
 * Crea un único libro con varias hojas:
 *   - Resumen
 *   - Mantas
 *   - Por marinero
 *   - Gastos por categoría
 *   - Seg. Social (mensual) / Mes a mes (anual)
 *
 * Devuelve un Buffer con el contenido .xlsx, listo para descargar.
 */
import ExcelJS from "exceljs";
import { MonthlyReport, AnnualReport } from "./reports";

const fmtEur = (n: number) => Number(n) || 0;

function applyHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

function applyTotal(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
  row.border = { top: { style: "medium" } };
}

// ─── EXCEL MENSUAL ────────────────────────────────────────────

export async function generateMonthlyExcel(report: MonthlyReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Itsas Lagunak";
  wb.created = new Date();

  // ── Hoja 1: Resumen ──
  const wsResumen = wb.addWorksheet("Resumen", { properties: { defaultRowHeight: 20 } });
  wsResumen.columns = [
    { header: "Concepto", key: "concepto", width: 50 },
    { header: "Importe", key: "importe", width: 18, style: { numFmt: '#,##0.00 "€"' } }
  ];
  applyHeader(wsResumen.getRow(1));
  wsResumen.addRow({});
  wsResumen.getCell("A2").value = `RESUMEN MENSUAL — ${report.monthLabel}`;
  wsResumen.getCell("A2").font = { bold: true, size: 14 };
  wsResumen.addRow({});

  const data = [
    ["Mantas confeccionadas", report.totals.mantas],
    ["Total ingresos (Monte Mayor puro)", fmtEur(report.totals.ingresos)],
    ["Total gastos", fmtEur(report.totals.gastos)],
    ["Líquido Monte Mayor", fmtEur(report.totals.liquidoMonteMayor)],
    ["SS retenida tripulación", fmtEur(report.totals.ssTripulacion)],
    ["Líquido bruto a repartir", fmtEur(report.totals.liquidoBruto)],
    ["IRPF retenido total", fmtEur(report.totals.irpfRetenido)],
    ["Líquido a percibir total", fmtEur(report.totals.liquidoAPercibir)],
    ["", ""],
    ["SS pagada a la Seguridad Social", fmtEur(report.ss.pagado)],
    ["SS retenida en mantas", fmtEur(report.ss.retenido)],
    ["Diferencia (pagada − retenida)", fmtEur(report.ss.diferencia)]
  ];
  for (const [c, v] of data) {
    const row = wsResumen.addRow({ concepto: c, importe: v });
    if (typeof v === "number") row.getCell("importe").numFmt = '#,##0.00 "€"';
  }

  // ── Hoja 2: Mantas ──
  const wsMantas = wb.addWorksheet("Mantas");
  wsMantas.columns = [
    { header: "Manta", key: "manta", width: 8 },
    { header: "Período desde", key: "from", width: 14 },
    { header: "Período hasta", key: "to", width: 14 },
    { header: "Validada", key: "val", width: 18 },
    { header: "Marineros", key: "mar", width: 10 },
    { header: "Ingresos", key: "ing", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Gastos", key: "gas", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Líquido MM", key: "lmm", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "SS 4%", key: "ss", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Líquido bruto", key: "lb", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "€/parte", key: "ep", width: 12, style: { numFmt: '#,##0.00 "€"' } },
    { header: "IRPF", key: "irpf", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Líquido a percibir", key: "lp", width: 16, style: { numFmt: '#,##0.00 "€"' } }
  ];
  applyHeader(wsMantas.getRow(1));
  for (const m of report.mantas) {
    wsMantas.addRow({
      manta: m.manta,
      from: m.periodFrom ?? "",
      to: m.periodTo ?? "",
      val: m.validatedAt ? new Date(m.validatedAt).toLocaleDateString("es-ES") : "—",
      mar: m.marineros,
      ing: m.totalIngresos,
      gas: m.totalGastos,
      lmm: m.liquidoMonteMayor,
      ss: m.ssTripulacion,
      lb: m.liquidoBruto,
      ep: m.importePorParte,
      irpf: m.totalIrpfRetenido,
      lp: m.totalLiquidoAPercibir
    });
  }
  if (report.mantas.length > 0) {
    const totalRow = wsMantas.addRow({
      manta: "TOTAL",
      mar: "", from: "", to: "", val: "",
      ing: report.totals.ingresos,
      gas: report.totals.gastos,
      lmm: report.totals.liquidoMonteMayor,
      ss: report.totals.ssTripulacion,
      lb: report.totals.liquidoBruto,
      ep: "",
      irpf: report.totals.irpfRetenido,
      lp: report.totals.liquidoAPercibir
    });
    applyTotal(totalRow);
  }

  // ── Hoja 3: Por marinero ──
  const wsSailor = wb.addWorksheet("Por marinero");
  wsSailor.columns = [
    { header: "DNI/NIF", key: "dni", width: 14 },
    { header: "Nombre", key: "name", width: 32 },
    { header: "Rol", key: "role", width: 14 },
    { header: "Mantas", key: "mantas", width: 10 },
    { header: "Importe bruto", key: "bruto", width: 16, style: { numFmt: '#,##0.00 "€"' } },
    { header: "% IRPF", key: "irpfRate", width: 10, style: { numFmt: '0.00"%"' } },
    { header: "IRPF retenido", key: "irpf", width: 16, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Líquido percibido", key: "liquido", width: 18, style: { numFmt: '#,##0.00 "€"' } }
  ];
  applyHeader(wsSailor.getRow(1));
  for (const s of report.bySailor) {
    wsSailor.addRow({
      dni: s.dni ?? "",
      name: s.name,
      role: s.role,
      mantas: s.mantasCount,
      bruto: s.importeBruto,
      irpfRate: s.irpfRate,
      irpf: s.irpfRetenido,
      liquido: s.liquidoPercibido
    });
  }
  if (report.bySailor.length > 0) {
    const tot = wsSailor.addRow({
      dni: "", name: "TOTAL", role: "",
      mantas: report.bySailor.reduce((a, s) => a + s.mantasCount, 0),
      bruto: report.bySailor.reduce((a, s) => a + s.importeBruto, 0),
      irpfRate: "",
      irpf: report.totals.irpfRetenido,
      liquido: report.totals.liquidoAPercibir
    });
    applyTotal(tot);
  }

  // ── Hoja 4: Gastos por categoría ──
  const wsCat = wb.addWorksheet("Gastos por categoría");
  wsCat.columns = [
    { header: "Categoría", key: "cat", width: 22 },
    { header: "Nº líneas", key: "count", width: 10 },
    { header: "Total", key: "total", width: 16, style: { numFmt: '#,##0.00 "€"' } }
  ];
  applyHeader(wsCat.getRow(1));
  for (const g of report.expensesByCategory) {
    wsCat.addRow({ cat: g.category, count: g.count, total: g.total });
  }
  if (report.expensesByCategory.length > 0) {
    const tot = wsCat.addRow({
      cat: "TOTAL",
      count: report.expensesByCategory.reduce((a, g) => a + g.count, 0),
      total: report.totals.gastos
    });
    applyTotal(tot);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── EXCEL ANUAL ──────────────────────────────────────────────

export async function generateAnnualExcel(report: AnnualReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Itsas Lagunak";
  wb.created = new Date();

  // ── Hoja 1: Resumen ──
  const wsResumen = wb.addWorksheet("Resumen");
  wsResumen.columns = [
    { header: "Concepto", key: "concepto", width: 50 },
    { header: "Importe", key: "importe", width: 18, style: { numFmt: '#,##0.00 "€"' } }
  ];
  applyHeader(wsResumen.getRow(1));
  wsResumen.addRow({});
  wsResumen.getCell("A2").value = `RESUMEN ANUAL ${report.year}`;
  wsResumen.getCell("A2").font = { bold: true, size: 14 };
  wsResumen.addRow({});

  const data = [
    ["Mantas confeccionadas", report.totals.mantas],
    ["Total ingresos (Monte Mayor puro)", fmtEur(report.totals.ingresos)],
    ["Total gastos", fmtEur(report.totals.gastos)],
    ["Líquido Monte Mayor", fmtEur(report.totals.liquidoMonteMayor)],
    ["SS retenida tripulación (anual)", fmtEur(report.totals.ssTripulacion)],
    ["Líquido bruto a repartir", fmtEur(report.totals.liquidoBruto)],
    ["IRPF retenido total", fmtEur(report.totals.irpfRetenido)],
    ["Líquido a percibir total", fmtEur(report.totals.liquidoAPercibir)],
    ["", ""],
    ["SS pagada a la Seguridad Social (anual)", fmtEur(report.totals.ssPagado)],
    ["Diferencia (pagada − retenida)", fmtEur(report.totals.ssPagado - report.totals.ssTripulacion)]
  ];
  for (const [c, v] of data) {
    const row = wsResumen.addRow({ concepto: c, importe: v });
    if (typeof v === "number") row.getCell("importe").numFmt = '#,##0.00 "€"';
  }

  // ── Hoja 2: Mes a mes ──
  const wsMes = wb.addWorksheet("Mes a mes");
  wsMes.columns = [
    { header: "Mes", key: "mes", width: 18 },
    { header: "Mantas", key: "mantas", width: 10 },
    { header: "Ingresos", key: "ing", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Gastos", key: "gas", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Líquido bruto", key: "lb", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "IRPF retenido", key: "irpf", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Líquido percibir", key: "lp", width: 16, style: { numFmt: '#,##0.00 "€"' } },
    { header: "SS retenida", key: "ssr", width: 14, style: { numFmt: '#,##0.00 "€"' } },
    { header: "SS pagada", key: "ssp", width: 14, style: { numFmt: '#,##0.00 "€"' } }
  ];
  applyHeader(wsMes.getRow(1));
  for (const m of report.months) {
    wsMes.addRow({
      mes: m.label, mantas: m.mantas,
      ing: m.ingresos, gas: m.gastos, lb: m.liquidoBruto,
      irpf: m.irpfRetenido, lp: m.liquidoAPercibir,
      ssr: m.ssRetenido, ssp: m.ssPagado
    });
  }
  const totRow = wsMes.addRow({
    mes: "TOTAL ANUAL",
    mantas: report.totals.mantas,
    ing: report.totals.ingresos,
    gas: report.totals.gastos,
    lb: report.totals.liquidoBruto,
    irpf: report.totals.irpfRetenido,
    lp: report.totals.liquidoAPercibir,
    ssr: report.totals.ssTripulacion,
    ssp: report.totals.ssPagado
  });
  applyTotal(totRow);

  // ── Hoja 3: Por marinero (CLAVE para Modelo 190) ──
  const wsSailor = wb.addWorksheet("Por marinero (Modelo 190)");
  wsSailor.columns = [
    { header: "DNI/NIF", key: "dni", width: 14 },
    { header: "Nombre y apellidos", key: "name", width: 36 },
    { header: "Rol", key: "role", width: 14 },
    { header: "Mantas cobradas", key: "mantas", width: 14 },
    { header: "Percepciones íntegras", key: "bruto", width: 18, style: { numFmt: '#,##0.00 "€"' } },
    { header: "% IRPF", key: "irpfRate", width: 10, style: { numFmt: '0.00"%"' } },
    { header: "Retenciones", key: "irpf", width: 16, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Líquido percibido", key: "liquido", width: 18, style: { numFmt: '#,##0.00 "€"' } }
  ];
  applyHeader(wsSailor.getRow(1));
  for (const s of report.bySailor) {
    wsSailor.addRow({
      dni: s.dni ?? "",
      name: s.name, role: s.role,
      mantas: s.mantasCount,
      bruto: s.importeBruto,
      irpfRate: s.irpfRate,
      irpf: s.irpfRetenido,
      liquido: s.liquidoPercibido
    });
  }
  if (report.bySailor.length > 0) {
    const tot = wsSailor.addRow({
      dni: "", name: "TOTAL", role: "",
      mantas: report.bySailor.reduce((a, s) => a + s.mantasCount, 0),
      bruto: report.bySailor.reduce((a, s) => a + s.importeBruto, 0),
      irpfRate: "",
      irpf: report.totals.irpfRetenido,
      liquido: report.totals.liquidoAPercibir
    });
    applyTotal(tot);
  }

  // ── Hoja 4: Gastos por categoría ──
  const wsCat = wb.addWorksheet("Gastos por categoría");
  wsCat.columns = [
    { header: "Categoría", key: "cat", width: 22 },
    { header: "Nº líneas", key: "count", width: 10 },
    { header: "Total anual", key: "total", width: 16, style: { numFmt: '#,##0.00 "€"' } }
  ];
  applyHeader(wsCat.getRow(1));
  for (const g of report.expensesByCategory) {
    wsCat.addRow({ cat: g.category, count: g.count, total: g.total });
  }
  if (report.expensesByCategory.length > 0) {
    const tot = wsCat.addRow({
      cat: "TOTAL",
      count: report.expensesByCategory.reduce((a, g) => a + g.count, 0),
      total: report.totals.gastos
    });
    applyTotal(tot);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
