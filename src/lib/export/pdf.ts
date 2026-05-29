import PDFDocument from "pdfkit";

type Row = Record<string, any>;

/**
 * Definición de las columnas que se exportan al PDF. Las dimensiones están
 * pensadas para A4 horizontal (≈770 pt de ancho útil con márgenes de 36 pt).
 * El campo `align` controla el alineado del texto y `fmt` formatea el valor
 * crudo de la fila a un string presentable (números en formato ES con coma
 * decimal y punto de miles, etc.).
 */
type ColDef = {
  key: string;
  label: string;
  width: number;          // ancho en puntos PDF
  align?: "left" | "right" | "center";
  fmt?: (v: any) => string;
};

const fmtNumES = (n: any, d = 2): string => {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  const fixed = Math.abs(v).toFixed(d);
  const [i, dec] = fixed.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec ? `${sign}${grouped},${dec}` : `${sign}${grouped}`;
};
const fmtEur = (v: any) => fmtNumES(v, 2);
const fmtKg  = (v: any) => fmtNumES(v, 2);
const fmtPct = (v: any) => `${fmtNumES(v, 0)} %`;
const fmtStr = (v: any) => (v == null ? "" : String(v));

// Columnas curadas — un subconjunto legible. Se omiten columnas redundantes
// (subtotal, impuestos, tasas, otros, moneda, descripcion) para que la tabla
// quepa en una sola pagina de ancho A4 horizontal sin que se rompan las celdas.
const COLUMNS: ColDef[] = [
  { key: "fecha",               label: "Fecha",       width: 55,  align: "left",   fmt: fmtStr },
  { key: "año",                 label: "Año",         width: 35,  align: "right",  fmt: fmtStr },
  { key: "mes",                 label: "Mes",         width: 30,  align: "right",  fmt: fmtStr },
  { key: "factura",             label: "Factura",     width: 60,  align: "left",   fmt: fmtStr },
  { key: "puerto",              label: "Puerto",      width: 55,  align: "left",   fmt: fmtStr },
  { key: "proveedor",           label: "Proveedor",   width: 100, align: "left",   fmt: fmtStr },
  { key: "especie_normalizada", label: "Especie",     width: 70,  align: "left",   fmt: fmtStr },
  { key: "kilos",               label: "Kilos",       width: 55,  align: "right",  fmt: fmtKg },
  { key: "precio_kg",           label: "€/Kg",        width: 45,  align: "right",  fmt: (v) => fmtNumES(v, 3) },
  { key: "importe",             label: "Importe",     width: 60,  align: "right",  fmt: fmtEur },
  { key: "iva_pct",             label: "IVA %",       width: 35,  align: "right",  fmt: fmtPct },
  { key: "iva_eur",             label: "IVA €",       width: 55,  align: "right",  fmt: fmtEur },
  { key: "total",               label: "Total fact.", width: 60,  align: "right",  fmt: fmtEur },
  { key: "estado",              label: "Estado",      width: 50,  align: "left",   fmt: fmtStr }
];

const ROW_HEIGHT = 14;     // alto fijo de cada fila de datos
const HEADER_HEIGHT = 18;  // alto de la cabecera de tabla
const FONT_SIZE = 8;
const HEADER_FONT_SIZE = 8;
const TITLE_FONT_SIZE = 14;
const PAGE_MARGIN = 36;

export async function toPdf(rows: Row[], title = "Capturas"): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: PAGE_MARGIN
    });
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const totalColsWidth = COLUMNS.reduce((s, c) => s + c.width, 0);
    const startX = PAGE_MARGIN;

    // ── Cabecera de documento ───────────────────────────────
    function drawDocHeader() {
      doc.fontSize(TITLE_FONT_SIZE).font("Helvetica-Bold").text(title, PAGE_MARGIN, PAGE_MARGIN);
      doc.fontSize(8).font("Helvetica").fillColor("#666")
        .text(`Generado: ${new Date().toLocaleString("es-ES")}  ·  ${rows.length} líneas`, PAGE_MARGIN, PAGE_MARGIN + 18);
      doc.fillColor("#000");
    }

    // ── Cabecera de tabla ──────────────────────────────────
    function drawTableHeader(y: number): number {
      doc.save();
      doc.rect(startX, y, totalColsWidth, HEADER_HEIGHT).fill("#1f2937");
      doc.fillColor("#fff").font("Helvetica-Bold").fontSize(HEADER_FONT_SIZE);
      let x = startX;
      for (const c of COLUMNS) {
        doc.text(c.label, x + 4, y + 5, {
          width: c.width - 8,
          align: c.align ?? "left",
          lineBreak: false
        });
        x += c.width;
      }
      doc.restore();
      return y + HEADER_HEIGHT;
    }

    // Trunca una cadena para que quepa en `maxWidth` puntos. Si no cabe,
    // recorta carácter a carácter y añade "…" al final. Garantizamos así que
    // pdfkit nunca tenga que envolver texto, evitando que la celda se desborde
    // verticalmente y pise la fila siguiente (lineBreak/ellipsis de pdfkit no
    // siempre clipan correctamente al usar coordenadas absolutas).
    function fitToWidth(txt: string, maxWidth: number): string {
      if (!txt) return "";
      if (doc.widthOfString(txt) <= maxWidth) return txt;
      let s = txt;
      while (s.length > 1 && doc.widthOfString(s + "…") > maxWidth) {
        s = s.slice(0, -1);
      }
      return s + "…";
    }

    // ── Una fila de datos ──────────────────────────────────
    function drawRow(y: number, row: Row, zebra: boolean): number {
      if (zebra) {
        doc.save();
        doc.rect(startX, y, totalColsWidth, ROW_HEIGHT).fill("#f3f4f6");
        doc.restore();
      }
      doc.font("Helvetica").fontSize(FONT_SIZE).fillColor("#111");
      let x = startX;
      for (const c of COLUMNS) {
        const raw = row[c.key];
        const rawTxt = c.fmt ? c.fmt(raw) : fmtStr(raw);
        const txt = fitToWidth(rawTxt, c.width - 8);
        doc.text(txt, x + 4, y + 3, {
          width: c.width - 8,
          align: c.align ?? "left",
          lineBreak: false
        });
        x += c.width;
      }
      // línea fina inferior
      doc.save();
      doc.strokeColor("#e5e7eb").lineWidth(0.5)
        .moveTo(startX, y + ROW_HEIGHT).lineTo(startX + totalColsWidth, y + ROW_HEIGHT).stroke();
      doc.restore();
      return y + ROW_HEIGHT;
    }

    // ── Render ─────────────────────────────────────────────
    drawDocHeader();
    let y = PAGE_MARGIN + 36; // espacio para título + subtítulo
    y = drawTableHeader(y);

    if (!rows.length) {
      doc.font("Helvetica").fontSize(10).fillColor("#666")
        .text("Sin datos para los filtros aplicados.", startX, y + 8);
      doc.end();
      return;
    }

    // Acumuladores para el pie de tabla
    let totalKilos = 0;
    let totalImporte = 0;
    let totalIva = 0;

    const pageBottom = doc.page.height - PAGE_MARGIN - 20; // dejamos 20pt para pie

    rows.forEach((r, idx) => {
      // ¿Cabe la fila? Si no, salto de página y repito cabeceras
      if (y + ROW_HEIGHT > pageBottom) {
        doc.addPage({ size: "A4", layout: "landscape", margin: PAGE_MARGIN });
        drawDocHeader();
        y = PAGE_MARGIN + 36;
        y = drawTableHeader(y);
      }
      y = drawRow(y, r, idx % 2 === 1);
      totalKilos   += Number(r.kilos) || 0;
      totalImporte += Number(r.importe) || 0;
      totalIva     += Number(r.iva_eur) || 0;
    });

    // ── Fila de totales ────────────────────────────────────
    if (y + ROW_HEIGHT + 4 > pageBottom) {
      doc.addPage({ size: "A4", layout: "landscape", margin: PAGE_MARGIN });
      drawDocHeader();
      y = PAGE_MARGIN + 36;
      y = drawTableHeader(y);
    }
    doc.save();
    doc.rect(startX, y, totalColsWidth, ROW_HEIGHT + 2).fill("#e5e7eb");
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(FONT_SIZE).fillColor("#111");
    let xT = startX;
    for (const c of COLUMNS) {
      let txt = "";
      if (c.key === "especie_normalizada") txt = "TOTAL";
      else if (c.key === "kilos")   txt = fmtKg(totalKilos);
      else if (c.key === "importe") txt = fmtEur(totalImporte);
      else if (c.key === "iva_eur") txt = fmtEur(totalIva);
      doc.text(fitToWidth(txt, c.width - 8), xT + 4, y + 4, {
        width: c.width - 8,
        align: c.align ?? "left",
        lineBreak: false
      });
      xT += c.width;
    }

    // ── Numeración de páginas ──────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(8).fillColor("#666")
        .text(`Página ${i - range.start + 1} de ${range.count}`,
          PAGE_MARGIN, doc.page.height - PAGE_MARGIN,
          { align: "right", width: doc.page.width - PAGE_MARGIN * 2 });
    }

    doc.end();
  });
}
