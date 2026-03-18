import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { d } from "@/lib/decimal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
}

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const sp    = req.nextUrl.searchParams;
  const type  = sp.get("type") || "facturas";
  const runId = sp.get("runId") || undefined;
  const periodId = sp.get("periodId") || undefined;

  let csv = "";
  let filename = "export.csv";

  if (type === "facturas") {
    const items = await prisma.invoice.findMany({
      ...(periodId && {
        where: {
          invoiceDate: {
            gte: (await prisma.payrollPeriod.findUnique({ where: { id: periodId } }))?.startDate,
            lte: (await prisma.payrollPeriod.findUnique({ where: { id: periodId } }))?.endDate,
          },
        },
      }),
      include: { port: true, supplier: true, boat: true },
      orderBy: { invoiceDate: "desc" },
    });
    csv = toCsv(
      ["Número", "Fecha", "Puerto", "Proveedor", "Barco", "Subtotal", "Tasas", "Total"],
      items.map((i: typeof items[0]) => [
        i.invoiceNumber || "", i.invoiceDate.toISOString().slice(0, 10),
        i.port?.name || "", i.supplier?.name || "", i.boat?.name || "",
        d(i.subtotal), d(i.feesAmount), d(i.totalAmount),
      ])
    );
    filename = "facturas.csv";
  } else if (type === "capturas-especie") {
    const lines = await prisma.invoiceLine.findMany({
      include: { species: true, invoice: { include: { boat: true, port: true } } },
      orderBy: { createdAt: "desc" },
    });
    csv = toCsv(
      ["Especie", "Kilos", "Precio/Kg", "Importe", "Fecha", "Puerto", "Barco"],
      lines.map((l: typeof lines[0]) => [
        l.species?.name || l.speciesName || "",
        d(l.kilos), d(l.pricePerKilo), d(l.lineAmount),
        l.invoice.invoiceDate.toISOString().slice(0, 10),
        l.invoice.port?.name || "", l.invoice.boat?.name || "",
      ])
    );
    filename = "capturas_especie.csv";
  } else if (type === "gastos") {
    const expenses = await prisma.expense.findMany({
      ...(periodId && { where: { periodId } }),
      include: { expenseType: true, boat: true },
      orderBy: { date: "desc" },
    });
    csv = toCsv(
      ["Fecha", "Tipo", "Descripción", "Importe", "Imputable a", "Barco"],
      expenses.map((e: typeof expenses[0]) => [
        e.date.toISOString().slice(0, 10),
        e.expenseType.name, e.description || "",
        d(e.amount), e.target, e.boat?.name || "",
      ])
    );
    filename = "gastos.csv";
  } else if (type === "nominas" && runId) {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        items: { include: { crewMember: { include: { category: true } } } },
        period: true,
        boat: true,
      },
    });
    if (!run) return new NextResponse("Not found", { status: 404 });
    csv = toCsv(
      ["Marinero", "Categoría", "Partes", "% Reparto", "Bruto", "SS Empleado", "SS Empleador", "IRPF %", "IRPF €", "Neto"],
      run.items.map((item: typeof run.items[0]) => [
        `${item.crewMember.name} ${item.crewMember.lastName}`,
        item.crewMember.category.name,
        d(item.baseParts),
        Math.round((d(item.baseParts) / run.items.reduce((s: number, i: typeof run.items[0]) => s + d(i.baseParts), 0)) * 10000) / 100,
        d(item.brutoPescador), d(item.ssEmployee), d(item.ssEmployer),
        d(item.irpfPercent), d(item.irpfAmount), d(item.netoPescador),
      ])
    );
    filename = `nominas_${run.period.name.replace(/\s/g, "_")}.csv`;
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
