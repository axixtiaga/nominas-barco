import { NextRequest, NextResponse } from "next/server";
import { handle, fail } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { calcMantaPayroll } from "@/lib/services/manta-payroll";
// @ts-ignore — pdfkit no trae tipos oficiales
import PDFDocument from "pdfkit";

const fmtEur = (n: number) =>
  (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" });
};

// Roles que se ocultan en la versión "marineros" (los armadores y el patrón
// no quieren que su línea aparezca en la copia que se entrega a la tripulación).
const HIDDEN_ROLES_FOR_MARINEROS = new Set(["ARMADOR", "PATRON"]);

/**
 * GET /api/nominas/manta/[manta]/pdf
 *   Genera y descarga el PDF de la manta (estilo "Nomina N Itsas Lagunak").
 *   Query params:
 *     audience=marineros → oculta las filas de ARMADOR y PATRON en la tabla por marinero
 *     audience=armadores (o ausente) → muestra todo
 */
export async function GET(req: NextRequest, { params }: { params: { manta: string } }) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const manta = decodeURIComponent(params.manta);
    const audience = (req.nextUrl.searchParams.get("audience") ?? "armadores").toLowerCase();
    const data = await calcMantaPayroll(manta);
    if (!data) return fail(404, "Manta no encontrada");

    // Aplica el filtro de audiencia sobre la tabla por marinero. NO toca cálculos
    // globales (liquidoBruto, importePorParte, etc): esos son magnitudes del barco.
    const visibleMarineros = audience === "marineros"
      ? data.marineros.filter((m: any) => !HIDDEN_ROLES_FOR_MARINEROS.has(String(m.role).toUpperCase()))
      : data.marineros;
    const visibleSumPartes = visibleMarineros.reduce((a: number, m: any) => a + (m.parts || 0), 0);
    const visibleSumImporte = visibleMarineros.reduce((a: number, m: any) => a + (m.importeManta || 0), 0);
    const visibleSumIrpf = visibleMarineros.reduce((a: number, m: any) => a + (m.irpfImporte || 0), 0);
    const visibleSumLiquido = visibleMarineros.reduce((a: number, m: any) => a + (m.liquidoAPercibir || 0), 0);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const finished = new Promise<Buffer>(resolve => doc.on("end", () => resolve(Buffer.concat(chunks))));

    // Cabecera
    doc.fontSize(18).font("Helvetica-Bold").text("ITSAS LAGUNAK", 50, doc.y, { align: "left" });
    doc.fontSize(10).font("Helvetica").text(`Hondarribia · Manta nº ${manta}`, 50, doc.y, { align: "left" });
    if (audience === "marineros") {
      doc.fontSize(9).font("Helvetica-Oblique").fillColor("#64748b")
        .text("Versión para tripulación (marineros)", 50, doc.y, { align: "left" });
      doc.fillColor("#000");
    }
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica-Oblique")
      .text(`MANTA CORRESPONDIENTE A LOS PERIODOS COMPRENDIDOS ENTRE`, 50, doc.y, { align: "center", width: 495 });
    doc.fontSize(11).font("Helvetica-Bold")
      .text(`EL ${fmtDate(data.periodFrom)}    AL    ${fmtDate(data.periodTo)}`, 50, doc.y, { align: "center", width: 495 });
    doc.moveDown();

    // INGRESOS
    sectionTitle(doc, "INGRESOS");
    for (const p of data.ingresosPorPuerto) {
      twoCols(doc, `Pesca líquida "Monte Mayor" en ${p.portName.toUpperCase()}`, fmtEur(p.total));
    }
    doc.moveDown(0.3);
    twoCols(doc, "TOTAL INGRESOS", fmtEur(data.totalIngresos), true);
    doc.moveDown();

    // GASTOS — consolidados por (categoría + descripción + proveedor) para que
    // el PDF no acabe siendo una lista enorme con 4 líneas iguales de PALETS.
    sectionTitle(doc, "GASTOS \"MONTE MAYOR\"");
    if (data.gastosLineas.length === 0) {
      doc.fontSize(9).font("Helvetica-Oblique").text("Sin gastos imputados a esta manta.", 50, doc.y, { width: 495 });
    } else {
      const consolidated = consolidateGastos(data.gastosLineas);
      for (const g of consolidated) {
        // Tres columnas: categoría (corta), descripción + proveedor + (×N), importe.
        const supplierPart = g.supplier ? "  (" + g.supplier + ")" : "";
        const countPart = g.count > 1 ? `  ×${g.count}` : "";
        threeColsGasto(doc, g.category, `${prettyDescription(g.description)}${supplierPart}${countPart}`, fmtEur(g.amount));
      }
    }
    doc.moveDown(0.3);
    twoCols(doc, "TOTAL GASTOS \"MONTE MAYOR\"", fmtEur(data.totalGastos), true);
    doc.moveDown();

    // LÍQUIDO MM
    sectionTitle(doc, "LÍQUIDO MONTE MAYOR");
    twoCols(doc, "Total ingresos", fmtEur(data.totalIngresos));
    twoCols(doc, "Total gastos \"Monte Mayor\"", `−${fmtEur(data.totalGastos)}`);
    doc.moveDown(0.2);
    twoCols(doc, "LÍQUIDO MONTE MAYOR", fmtEur(data.liquidoMonteMayor), true);
    doc.moveDown();

    // REPARTO TRIPULACIÓN
    sectionTitle(doc, "REPARTO TRIPULACIÓN");
    twoCols(doc, "Participación Tripulación 50%", fmtEur(data.participacionTripulacion));
    twoCols(doc, "Participación 3,5% Seguridad Social, parte tripulación", `−${fmtEur(data.ssTripulacion)}`);
    doc.moveDown(0.2);
    twoCols(doc, "LÍQUIDO BRUTO", fmtEur(data.liquidoBruto), true);
    doc.moveDown(0.2);
    twoCols(doc, `${fmtEur(data.liquidoBruto)} entre ${data.totalPartes} partes, resulta la "MANTA" a`, fmtEur(data.importePorParte));
    doc.moveDown();

    // MARINEROS
    sectionTitle(doc, audience === "marineros" ? "LÍQUIDO POR MARINERO (TRIPULACIÓN)" : "LÍQUIDO POR MARINERO");
    if (visibleMarineros.length === 0) {
      doc.fontSize(9).font("Helvetica-Oblique").text("Sin marineros activos.", 50, doc.y, { width: 495 });
    } else {
      // Cabecera de tabla
      const headerY = doc.y;
      doc.fontSize(8).font("Helvetica-Bold");
      doc.text("Marinero", 50, headerY, { width: 180 });
      doc.text("Rol", 230, headerY, { width: 60 });
      doc.text("Partes", 290, headerY, { width: 40, align: "right" });
      doc.text("Importe", 330, headerY, { width: 60, align: "right" });
      doc.text("IRPF", 390, headerY, { width: 60, align: "right" });
      doc.text("Líquido", 450, headerY, { width: 95, align: "right" });
      doc.y = headerY + 14;
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.y += 4;

      doc.fontSize(8).font("Helvetica");
      for (const m of visibleMarineros) {
        const y = doc.y;
        doc.text(m.name, 50, y, { width: 180 });
        doc.text(m.role, 230, y, { width: 60 });
        doc.text(m.parts.toFixed(2).replace(".", ","), 290, y, { width: 40, align: "right" });
        doc.text(fmtEur(m.importeManta), 330, y, { width: 60, align: "right" });
        doc.text(`−${fmtEur(m.irpfImporte)}`, 390, y, { width: 60, align: "right" });
        doc.text(fmtEur(m.liquidoAPercibir), 450, y, { width: 95, align: "right" });
        doc.y = y + 12;
      }
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.y += 4;
      doc.fontSize(8).font("Helvetica-Bold");
      const ty = doc.y;
      doc.text(`TOTAL (${visibleMarineros.length} ${audience === "marineros" ? "personas" : "marineros"})`, 50, ty, { width: 240 });
      doc.text(visibleSumPartes.toFixed(2).replace(".", ","), 290, ty, { width: 40, align: "right" });
      doc.text(fmtEur(visibleSumImporte), 330, ty, { width: 60, align: "right" });
      doc.text(`−${fmtEur(visibleSumIrpf)}`, 390, ty, { width: 60, align: "right" });
      doc.text(fmtEur(visibleSumLiquido), 450, ty, { width: 95, align: "right" });
      doc.y = ty + 14;
    }

    doc.moveDown(2);
    doc.fontSize(9).font("Helvetica-Oblique")
      .text(`Hondarribia, a ${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}`, 50, doc.y, { align: "right", width: 495 });

    if (data.validatedAt) {
      doc.fontSize(8).fillColor("#10b981")
        .text(`Manta validada el ${new Date(data.validatedAt).toLocaleString("es-ES")}`, 50, doc.y, { align: "right", width: 495 });
      doc.fillColor("#000");
    }

    doc.end();
    const pdfBuffer = await finished;

    const filenameSuffix = audience === "marineros" ? "-marineros" : "";
    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Nomina-Manta-${manta}${filenameSuffix}.pdf"`
      }
    });
  } catch (e) { return handle(e); }
}

function sectionTitle(doc: any, title: string) {
  // Siempre arrancar en el margen izquierdo (x=50) — si no, hereda el x del último
  // doc.text() (que pudo ser de un twoCols con x=430), lo que provocaba que el
  // título de sección apareciera desplazado a la derecha y partido en dos líneas.
  doc.fontSize(11).font("Helvetica-BoldOblique").fillColor("#0f172a")
    .text(title, 50, doc.y, { width: 495 });
  doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor("#cbd5e1").stroke();
  doc.fillColor("#000").strokeColor("#000");
  doc.y += 8;
}

/**
 * Normaliza una descripción para mostrarla con un formato legible y consistente:
 *   - Si está mayoritariamente en MAYÚSCULAS (≥80%), la pasa a "Capitalized first letter".
 *     Ej. "ALQUILER CAJA PLASTICO" → "Alquiler caja plastico"
 *   - Si ya tiene casing mixto (ej. "Hielo producido", "Palets"), la deja igual.
 */
function prettyDescription(s: string): string {
  if (!s) return s;
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  if (letters.length === 0) return s;
  const upperRatio = (letters.match(/[A-ZÁÉÍÓÚÑ]/g) ?? []).length / letters.length;
  if (upperRatio < 0.8) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Escribe una fila de dos columnas (texto a la izquierda + cifra a la derecha).
 * Tras escribir ambas columnas, deja el cursor en la posición Y MÁS BAJA de las
 * dos — así si la columna izquierda hace wrap a varias líneas la siguiente fila
 * no se solapa con ella.
 */
function twoCols(doc: any, left: string, right: string, bold: boolean = false) {
  const y = doc.y;
  doc.fontSize(9).font(bold ? "Helvetica-Bold" : "Helvetica");
  doc.text(left, 50, y, { width: 380 });
  const leftEnd = doc.y;
  doc.text(right, 430, y, { width: 115, align: "right" });
  const rightEnd = doc.y;
  doc.y = Math.max(leftEnd, rightEnd) + 3;
}

/**
 * Consolida las líneas de gastos por (categoría + descripción normalizada + proveedor):
 * suma los importes y cuenta cuántas líneas originales había. Mantiene el primer
 * texto encontrado para mostrar (description y supplier conservan mayúsculas/tildes
 * de la primera ocurrencia).
 *
 * Ejemplo: 4 líneas de "COFRADIA / Palets / Cofradía Hondarribia" se convierten en
 * una única fila con la suma y un contador "×4".
 *
 * El total general (data.totalGastos) NO cambia — solo se reagrupa la presentación.
 */
function consolidateGastos(lineas: any[]): Array<{ category: string; description: string; supplier: string; amount: number; count: number }> {
  const norm = (s: any) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const map = new Map<string, { category: string; description: string; supplier: string; amount: number; count: number }>();
  for (const g of lineas) {
    const key = `${norm(g.category)}|${norm(g.description)}|${norm(g.supplier)}`;
    const cur = map.get(key);
    if (cur) {
      cur.amount += Number(g.amount) || 0;
      cur.count += 1;
    } else {
      map.set(key, {
        category: g.category ?? "",
        description: g.description ?? "",
        supplier: g.supplier ?? "",
        amount: Number(g.amount) || 0,
        count: 1
      });
    }
  }
  // Orden: categoría asc, descripción asc.
  return Array.from(map.values()).sort((a, b) => {
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    return a.description.localeCompare(b.description);
  });
}

/**
 * Fila de gasto con tres columnas: categoría + descripción + importe.
 * La columna de categoría se ha ampliado a 100px para que entren etiquetas
 * largas como "HIELO_PRODUCIDO" sin partirse en dos líneas (lo que provocaba
 * que la "O" final apareciera debajo y se solapara con la siguiente fila).
 * Tras pintar las tres columnas, el cursor avanza a la línea más baja de las
 * tres para que ninguna fila pise a la siguiente, aunque haya wrap.
 */
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
