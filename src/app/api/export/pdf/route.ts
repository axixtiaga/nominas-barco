import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { d } from "@/lib/decimal";
import PDFDocument from "pdfkit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fmt(n: number): string {
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";
}

export async function GET(req: NextRequest) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const sp    = req.nextUrl.searchParams;
  const runId = sp.get("runId");
  if (!runId) return new NextResponse("runId required", { status: 400 });

  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: {
      items: {
        include: { crewMember: { include: { category: true } } },
        orderBy: { brutoPescador: "desc" },
      },
      period: true,
      boat:   true,
      runByUser: { select: { name: true } },
    },
  });
  if (!run) return new NextResponse("Not found", { status: 404 });

  const totalParts = run.items.reduce((s: number, i: typeof run.items[0]) => s + d(i.baseParts), 0);

  // Build PDF in memory
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const BLUE   = "#0369A1";
  const GRAY   = "#64748B";
  const BLACK  = "#1E293B";
  const LIGHT  = "#F1F5F9";

  // Header
  doc.rect(0, 0, doc.page.width, 80).fill(BLUE);
  doc.fillColor("white").fontSize(20).font("Helvetica-Bold").text("LIQUIDACIÓN DE PESCA", 50, 22);
  doc.fontSize(10).font("Helvetica").text(`Nóminas del Barco — Sistema de Gestión`, 50, 48);
  doc.fillColor(BLACK);

  // Meta
  doc.moveDown(2);
  const meta = [
    ["Período",  run.period.name],
    ["Barco",    run.boat.name],
    ["Estado",   run.status],
    ["Calculado por", run.runByUser.name],
    ["Fecha cálculo", run.calculatedAt.toLocaleDateString("es-ES")],
  ];
  let y = 100;
  meta.forEach(([label, val]) => {
    doc.fontSize(9).fillColor(GRAY).text(label + ":", 50, y);
    doc.fontSize(9).fillColor(BLACK).text(String(val), 200, y);
    y += 16;
  });

  // Summary box
  y += 10;
  doc.rect(50, y, doc.page.width - 100, 110).fill(LIGHT);
  doc.fillColor(BLACK);

  const summaryRows = [
    ["Total Capturas",   fmt(d(run.totalCapturas))],
    ["Total Gastos",     fmt(d(run.totalGastos))],
    ["Monte Mayor",      fmt(d(run.monteMayor))],
    ["Parte Armador",    fmt(d(run.ownerShare))],
    ["Parte Tripulación",fmt(d(run.crewShare))],
  ];
  let sy = y + 12;
  summaryRows.forEach(([label, val]) => {
    doc.fontSize(9).fillColor(GRAY).text(label + ":", 65, sy);
    doc.fontSize(9).fillColor(BLACK).font("Helvetica-Bold").text(val, 250, sy);
    doc.font("Helvetica");
    sy += 17;
  });

  // Detail table
  y = sy + 20;
  doc.fontSize(12).font("Helvetica-Bold").fillColor(BLUE).text("Detalle por Marinero", 50, y);
  y += 18;

  // Table header
  const cols = [50, 180, 240, 300, 360, 420, 480];
  const headers = ["Marinero", "Partes", "Bruto", "SS Emp.", "IRPF", "Neto"];
  doc.rect(50, y, doc.page.width - 100, 18).fill(BLUE);
  headers.forEach((h, i) => {
    doc.fontSize(8).font("Helvetica-Bold").fillColor("white").text(h, cols[i] + 3, y + 5, { width: 60 });
  });
  y += 18;

  run.items.forEach((item: typeof run.items[0], idx: number) => {
    const rowY = y + idx * 20;
    if (idx % 2 === 0) doc.rect(50, rowY, doc.page.width - 100, 20).fill(LIGHT);

    const fullName = `${item.crewMember.name} ${item.crewMember.lastName}`;
    const pct = totalParts > 0 ? `${Math.round((d(item.baseParts) / totalParts) * 1000) / 10}%` : "—";

    doc.font("Helvetica").fontSize(8).fillColor(BLACK);
    doc.text(fullName.slice(0, 22), cols[0] + 3, rowY + 6);
    doc.text(`${d(item.baseParts)} (${pct})`, cols[1] + 3, rowY + 6);
    doc.text(fmt(d(item.brutoPescador)), cols[2] + 3, rowY + 6);
    doc.text(fmt(d(item.ssEmployee)), cols[3] + 3, rowY + 6);
    doc.text(fmt(d(item.irpfAmount)), cols[4] + 3, rowY + 6);
    doc.font("Helvetica-Bold").text(fmt(d(item.netoPescador)), cols[5] + 3, rowY + 6);
  });

  y = y + run.items.length * 20 + 15;

  // Totals row
  doc.rect(50, y, doc.page.width - 100, 22).fill(BLUE);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("white");
  doc.text("TOTALES", cols[0] + 3, y + 7);
  doc.text(fmt(d(run.totalBruto)),   cols[2] + 3, y + 7);
  doc.text(fmt(d(run.totalSS)),      cols[3] + 3, y + 7);
  doc.text(fmt(d(run.totalIRPF)),    cols[4] + 3, y + 7);
  doc.text(fmt(d(run.totalNeto)),    cols[5] + 3, y + 7);

  // Warnings
  const warnings = (run.rulesSnapshot as { warnings?: string[] })?.warnings || [];
  if (warnings.length) {
    y += 40;
    doc.fontSize(9).fillColor("#92400E").font("Helvetica-Bold").text("⚠ Avisos de parametrización:", 50, y);
    warnings.forEach((w, i) => {
      doc.fontSize(8).font("Helvetica").fillColor("#78350F").text(`• ${w}`, 50, y + 14 + i * 12, { width: doc.page.width - 100 });
    });
  }

  // Footer
  doc.fontSize(7).fillColor(GRAY).font("Helvetica")
    .text(`Generado: ${new Date().toLocaleString("es-ES")} — ${run.runByUser.name}`, 50, doc.page.height - 40, { align: "center", width: doc.page.width - 100 });

  doc.end();

  const pdfBuffer = await new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="liquidacion_${run.period.name.replace(/\s/g, "_")}.pdf"`,
    },
  });
}
