import PDFDocument from "pdfkit";

type Row = Record<string, any>;

export async function toPdf(rows: Row[], title = "Capturas"): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(title, { align: "left" }).moveDown(0.5);
    doc.fontSize(9);

    if (!rows.length) { doc.text("Sin datos."); doc.end(); return; }

    const cols = Object.keys(rows[0]);
    const colWidth = (doc.page.width - 72) / cols.length;
    // header
    cols.forEach((c, i) => doc.text(c, 36 + i * colWidth, doc.y, { width: colWidth, continued: i < cols.length - 1 }));
    doc.moveDown(0.5);
    // rows
    rows.forEach(r => {
      cols.forEach((c, i) => {
        const v = r[c];
        doc.text(v == null ? "" : String(v), 36 + i * colWidth, doc.y, {
          width: colWidth, continued: i < cols.length - 1
        });
      });
      doc.moveDown(0.2);
      if (doc.y > doc.page.height - 50) doc.addPage();
    });

    doc.end();
  });
}
