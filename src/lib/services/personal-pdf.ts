/**
 * Generador del PDF personal de un marinero para una manta.
 *
 * Misma plantilla que /api/mi/nominas/[manta]/pdf, pero como función reutilizable
 * que devuelve un Buffer. La usan:
 *   - El endpoint GET /api/mi/nominas/[manta]/pdf (descarga directa).
 *   - El endpoint POST /api/nominas/manta/[manta]/send-personal-pdfs (envío por email
 *     a todos los marineros).
 */

import { calcMantaPayroll } from "./manta-payroll";
// @ts-ignore — pdfkit no trae tipos oficiales
import PDFDocument from "pdfkit";

const fmtEur = (n: number) =>
  (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as any);

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" });
};

export type PersonalPdfResult = {
  buffer: Buffer;
  filename: string;
  marineroName: string;
  liquidoAPercibir: number;
};

export async function generatePersonalPdf(manta: string, sailorId: string): Promise<PersonalPdfResult | null> {
  const data = await calcMantaPayroll(manta);
  if (!data) return null;
  const mio = data.marineros.find((m: any) => m.sailorId === sailorId);
  if (!mio) return null;

  // Consolidar gastos por (categoría + descripción)
  const norm = (s: any) => String(s ?? "").trim().toLowerCase();
  type GroupedGasto = { category: string; description: string; amount: number; count: number };
  const map = new Map<string, GroupedGasto>();
  for (const g of data.gastosLineas as any[]) {
    const key = `${norm(g.category)}|${norm(g.description)}`;
    const cur = map.get(key);
    if (cur) { cur.amount += Number(g.amount) || 0; cur.count++; }
    else map.set(key, { category: g.category ?? "", description: g.description ?? "", amount: Number(g.amount) || 0, count: 1 });
  }
  const gastosResumen = Array.from(map.values()).sort((a, b) => b.amount - a.amount);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>(resolve => doc.on("end", () => resolve(Buffer.concat(chunks))));

  // ── Cabecera ───────────────────────────────────────────────────────────
  doc.fontSize(18).font("Helvetica-Bold").text("ITSAS LAGUNAK", 50, doc.y, { align: "left" });
  doc.fontSize(10).font("Helvetica").text(`Hondarribia · Manta nº ${manta}`, 50, doc.y, { align: "left" });
  doc.fontSize(9).font("Helvetica-Oblique").fillColor("#64748b")
    .text(`Nómina personal — ${mio.name} (${mio.role})`, 50, doc.y, { align: "left" });
  doc.fillColor("#000");
  doc.moveDown(0.5);
  doc.fontSize(11).font("Helvetica-Oblique")
    .text(`MANTA CORRESPONDIENTE A LOS PERIODOS COMPRENDIDOS ENTRE`, 50, doc.y, { align: "center", width: 495 });
  doc.fontSize(11).font("Helvetica-Bold")
    .text(`EL ${fmtDate(data.periodFrom)}    AL    ${fmtDate(data.periodTo)}`, 50, doc.y, { align: "center", width: 495 });
  doc.moveDown();

  // ── BLOQUE DESTACADO: TU LÍQUIDO ──────────────────────────────────────
  const boxTop = doc.y;
  const boxHeight = 110;
  doc.rect(50, boxTop, 495, boxHeight).fillAndStroke("#ecfdf5", "#10b981");
  doc.fillColor("#065f46").fontSize(10).font("Helvetica-Bold")
    .text("TU LÍQUIDO A PERCIBIR", 60, boxTop + 12, { width: 240 });
  doc.fontSize(26).font("Helvetica-Bold")
    .text(fmtEur(mio.liquidoAPercibir), 60, boxTop + 30, { width: 240 });
  const miniX = 310;
  const miniColW = 225;
  doc.fontSize(9).font("Helvetica").fillColor("#065f46");
  miniRow(doc, "Tus partes",                miniX, boxTop + 18, miniColW, mio.parts.toFixed(2).replace(".", ","));
  miniRow(doc, "Importe bruto manta",       miniX, boxTop + 38, miniColW, fmtEur(mio.importeManta));
  miniRow(doc, `IRPF (${mio.irpfRate.toFixed(2).replace(".", ",")}%)`, miniX, boxTop + 58, miniColW, `−${fmtEur(mio.irpfImporte)}`);
  miniRow(doc, "Líquido",                   miniX, boxTop + 78, miniColW, fmtEur(mio.liquidoAPercibir), true);
  doc.fillColor("#000");
  doc.y = boxTop + boxHeight + 12;

  // ── INGRESOS ──────────────────────────────────────────────────────────
  sectionTitle(doc, "INGRESOS DEL BARCO");
  for (const p of data.ingresosPorPuerto as any[]) {
    twoCols(doc, `Pesca líquida "Monte Mayor" en ${p.portName.toUpperCase()}`, fmtEur(p.total));
  }
  doc.moveDown(0.3);
  twoCols(doc, "TOTAL INGRESOS", fmtEur(data.totalIngresos), true);
  doc.moveDown();

  // ── GASTOS ────────────────────────────────────────────────────────────
  sectionTitle(doc, "GASTOS \"MONTE MAYOR\"");
  if (gastosResumen.length === 0) {
    doc.fontSize(9).font("Helvetica-Oblique").text("Sin gastos imputados a esta manta.", 50, doc.y, { width: 495 });
  } else {
    for (const g of gastosResumen) {
      const countPart = g.count > 1 ? `  ×${g.count}` : "";
      threeColsGasto(doc, g.category, `${prettyDescription(g.description)}${countPart}`, fmtEur(g.amount));
    }
  }
  doc.moveDown(0.3);
  twoCols(doc, "TOTAL GASTOS \"MONTE MAYOR\"", fmtEur(data.totalGastos), true);
  doc.moveDown();

  // ── REPARTO ───────────────────────────────────────────────────────────
  sectionTitle(doc, "CÓMO SE REPARTE");
  twoCols(doc, "Líquido Monte Mayor", fmtEur(data.liquidoMonteMayor));
  twoCols(doc, "Participación Tripulación 50%", fmtEur(data.participacionTripulacion));
  twoCols(doc, "Participación 3,5% Seguridad Social, parte tripulación", `−${fmtEur(data.ssTripulacion)}`);
  doc.moveDown(0.2);
  twoCols(doc, "LÍQUIDO BRUTO A REPARTIR", fmtEur(data.liquidoBruto), true);
  doc.moveDown(0.2);
  twoCols(doc, `${fmtEur(data.liquidoBruto)} entre ${data.totalPartes} partes, resulta la "MANTA" a`, fmtEur(data.importePorParte));
  doc.moveDown();

  sectionTitle(doc, "TU IMPORTE");
  twoCols(doc, `${fmtEur(data.importePorParte)} × ${mio.parts.toFixed(2).replace(".", ",")} partes`, fmtEur(mio.importeManta));
  twoCols(doc, `IRPF (${mio.irpfRate.toFixed(2).replace(".", ",")}%)`, `−${fmtEur(mio.irpfImporte)}`);
  doc.moveDown(0.2);
  twoCols(doc, "TU LÍQUIDO A PERCIBIR", fmtEur(mio.liquidoAPercibir), true);

  doc.moveDown(2);
  doc.fontSize(9).font("Helvetica-Oblique")
    .text(`Hondarribia, a ${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}`, 50, doc.y, { align: "right", width: 495 });
  if (data.validatedAt) {
    doc.fontSize(8).fillColor("#10b981")
      .text(`Manta validada el ${new Date(data.validatedAt).toLocaleString("es-ES")}`, 50, doc.y, { align: "right", width: 495 });
    doc.fillColor("#000");
  }
  doc.fontSize(7).fillColor("#94a3b8")
    .text("Documento personal: solo se muestran tus datos. El reparto a otros miembros de la tripulación es confidencial.",
          50, doc.y + 6, { align: "center", width: 495 });
  doc.fillColor("#000");

  doc.end();
  const buffer = await finished;
  const safeName = mio.name.replace(/[^a-zA-Z0-9]/g, "_");
  return {
    buffer,
    filename: `Mi-Nomina-Manta-${manta}-${safeName}.pdf`,
    marineroName: mio.name,
    liquidoAPercibir: mio.liquidoAPercibir
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function sectionTitle(doc: any, title: string) {
  doc.fontSize(11).font("Helvetica-BoldOblique").fillColor("#0f172a")
    .text(title, 50, doc.y, { width: 495 });
  doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor("#cbd5e1").stroke();
  doc.fillColor("#000").strokeColor("#000");
  doc.y += 8;
}

function twoCols(doc: any, left: string, right: string, bold: boolean = false) {
  const y = doc.y;
  doc.fontSize(9).font(bold ? "Helvetica-Bold" : "Helvetica");
  doc.text(left, 50, y, { width: 380 });
  const leftEnd = doc.y;
  doc.text(right, 430, y, { width: 115, align: "right" });
  const rightEnd = doc.y;
  doc.y = Math.max(leftEnd, rightEnd) + 3;
}

function threeColsGasto(doc: any, category: string, description: string, amount: string) {
  const y = doc.y;
  doc.fontSize(9).font("Helvetica");
  doc.text(category, 50, y, { width: 95 });
  const catEnd = doc.y;
  doc.text(description, 150, y, { width: 275 });
  const descEnd = doc.y;
  doc.text(amount, 430, y, { width: 115, align: "right" });
  const amtEnd = doc.y;
  doc.y = Math.max(catEnd, descEnd, amtEnd) + 3;
}

function miniRow(doc: any, label: string, x: number, y: number, totalW: number, value: string, bold: boolean = false) {
  const labelW = Math.floor(totalW * 0.55);
  const valueW = totalW - labelW;
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").text(label, x, y, { width: labelW });
  doc.font("Helvetica-Bold").text(value, x + labelW, y, { width: valueW, align: "right" });
}

function prettyDescription(s: string): string {
  if (!s) return s;
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  if (letters.length === 0) return s;
  const upperRatio = (letters.match(/[A-ZÁÉÍÓÚÑ]/g) ?? []).length / letters.length;
  if (upperRatio < 0.8) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
