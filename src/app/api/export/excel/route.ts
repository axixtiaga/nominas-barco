import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { d } from "@/lib/decimal";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const type   = sp.get("type") || "nominas";
  const runId  = sp.get("runId") || undefined;

  const workbook  = new ExcelJS.Workbook();
  workbook.creator = "Nóminas del Barco";
  workbook.created = new Date();

  const headerFill: ExcelJS.Fill = {
    type: "pattern", pattern: "solid",
    fgColor: { argb: "FF0369A1" },
  };
  const headerFont: Partial<ExcelJS.Font> = { color: { argb: "FFFFFFFF" }, bold: true };

  function styleHeader(sheet: ExcelJS.Worksheet, cols: number) {
    const row = sheet.getRow(1);
    for (let c = 1; c <= cols; c++) {
      row.getCell(c).fill  = headerFill;
      row.getCell(c).font  = headerFont;
      row.getCell(c).alignment = { horizontal: "center" };
    }
    row.commit();
  }

  if (type === "nominas" && runId) {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        items: { include: { crewMember: { include: { category: true } } } },
        period: true,
        boat:   true,
      },
    });
    if (!run) return new NextResponse("Not found", { status: 404 });

    // Sheet 1: Resumen
    const summary = workbook.addWorksheet("Resumen");
    summary.columns = [
      { header: "Campo", key: "campo", width: 28 },
      { header: "Valor", key: "valor", width: 20 },
    ];
    styleHeader(summary, 2);
    const rows = [
      ["Período",           run.period.name],
      ["Barco",             run.boat.name],
      ["Estado",            run.status],
      ["Total Capturas",    d(run.totalCapturas)],
      ["Monte Mayor",       d(run.monteMayor)],
      ["Total Gastos",      d(run.totalGastos)],
      ["Base Repartible",   d(run.baseRepartible)],
      ["Parte Armador",     d(run.ownerShare)],
      ["Parte Tripulación", d(run.crewShare)],
      ["Total Bruto",       d(run.totalBruto)],
      ["Total SS",          d(run.totalSS)],
      ["Total IRPF",        d(run.totalIRPF)],
      ["Total Neto",        d(run.totalNeto)],
    ];
    rows.forEach(([campo, valor]) => summary.addRow({ campo, valor }));

    // Sheet 2: Detalle marineros
    const detail = workbook.addWorksheet("Detalle Marineros");
    detail.columns = [
      { header: "Marinero",    key: "marinero",   width: 28 },
      { header: "Categoría",   key: "categoria",  width: 18 },
      { header: "Partes",      key: "partes",     width: 10 },
      { header: "% Reparto",   key: "pct",        width: 12 },
      { header: "Bruto (€)",   key: "bruto",      width: 14 },
      { header: "SS Emp. (€)", key: "ss",         width: 14 },
      { header: "IRPF %",      key: "irpfpct",    width: 10 },
      { header: "IRPF (€)",    key: "irpf",       width: 14 },
      { header: "Neto (€)",    key: "neto",       width: 14 },
    ];
    styleHeader(detail, 9);

    const totalParts = run.items.reduce((s: number, i: typeof run.items[0]) => s + d(i.baseParts), 0);
    run.items.forEach((item: typeof run.items[0]) => {
      detail.addRow({
        marinero:  `${item.crewMember.name} ${item.crewMember.lastName}`,
        categoria: item.crewMember.category.name,
        partes:    d(item.baseParts),
        pct:       totalParts > 0 ? Math.round((d(item.baseParts) / totalParts) * 10000) / 100 : 0,
        bruto:     d(item.brutoPescador),
        ss:        d(item.ssEmployee),
        irpfpct:   d(item.irpfPercent),
        irpf:      d(item.irpfAmount),
        neto:      d(item.netoPescador),
      });
    });

    // Number format for money columns
    ["bruto","ss","irpf","neto"].forEach((key) => {
      detail.getColumn(key).numFmt = '#,##0.00 "€"';
    });

    const buf = await workbook.xlsx.writeBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="nominas_${run.period.name.replace(/\s/g,"_")}.xlsx"`,
      },
    });
  }

  // Facturas export
  const invoices = await prisma.invoice.findMany({
    include: { port: true, supplier: true, boat: true },
    orderBy: { invoiceDate: "desc" },
  });
  const sheet = workbook.addWorksheet("Facturas");
  sheet.columns = [
    { header: "Número",     key: "num",      width: 22 },
    { header: "Fecha",      key: "fecha",    width: 14 },
    { header: "Puerto",     key: "puerto",   width: 18 },
    { header: "Proveedor",  key: "prov",     width: 24 },
    { header: "Barco",      key: "barco",    width: 20 },
    { header: "Subtotal",   key: "sub",      width: 14 },
    { header: "Tasas",      key: "tasas",    width: 12 },
    { header: "Total",      key: "total",    width: 14 },
    { header: "Revisada",   key: "rev",      width: 12 },
  ];
  styleHeader(sheet, 9);
  invoices.forEach((i: typeof invoices[0]) => sheet.addRow({
    num:    i.invoiceNumber || "",
    fecha:  i.invoiceDate.toISOString().slice(0,10),
    puerto: i.port?.name || "",
    prov:   i.supplier?.name || "",
    barco:  i.boat?.name || "",
    sub:    d(i.subtotal),
    tasas:  d(i.feesAmount),
    total:  d(i.totalAmount),
    rev:    i.reviewed ? "Sí" : "No",
  }));
  ["sub","tasas","total"].forEach((k) => sheet.getColumn(k).numFmt = '#,##0.00 "€"');

  const buf = await workbook.xlsx.writeBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="facturas.xlsx"',
    },
  });
}
