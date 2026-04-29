import ExcelJS from "exceljs";

type Row = Record<string, any>;

export async function toXlsx(rows: Row[], sheetName = "Capturas"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  if (rows.length) {
    const cols = Object.keys(rows[0]);
    ws.columns = cols.map(k => ({ header: k, key: k, width: Math.max(12, k.length + 2) }));
    rows.forEach(r => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
