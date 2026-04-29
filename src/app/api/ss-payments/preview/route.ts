import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import ExcelJS from "exceljs";

/**
 * POST /api/ss-payments/preview
 *   Devuelve la estructura del Excel SIN guardar nada en BD. Útil para depurar
 *   el formato de un fichero nuevo antes de importar.
 *
 *   Recibe multipart/form-data con un campo `file`.
 *   Devuelve:
 *     - sheetNames
 *     - rowCount, columnCount
 *     - first30Rows: cada fila con sus columnas A..T (texto literal limitado a 60 chars)
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATOR"]);
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    if (!file) return fail(400, "Falta el fichero");

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const sheets = wb.worksheets.map(ws => ({
      name: ws.name, rowCount: ws.rowCount, columnCount: ws.columnCount
    }));

    const main = wb.worksheets[0];
    if (!main) return fail(400, "Excel sin hojas");

    const colLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T"];
    const first30Rows: Array<{ row: number; cells: Record<string, string> }> = [];
    const lastRow = Math.min(main.rowCount, 30);
    for (let r = 1; r <= lastRow; r++) {
      const cells: Record<string, string> = {};
      for (let c = 0; c < colLetters.length; c++) {
        const v = cellText(main.getCell(r, c + 1).value);
        if (v.trim() !== "") cells[colLetters[c]] = v.slice(0, 60);
      }
      first30Rows.push({ row: r, cells });
    }

    return ok({
      filename: file.name,
      sheets,
      mainSheet: main.name,
      mainRowCount: main.rowCount,
      mainColumnCount: main.columnCount,
      first30Rows
    });
  } catch (e) { return handle(e); }
}

function cellText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return (v as any).richText.map((r: any) => r.text).join("");
    if ("text" in v) return String((v as any).text);
    if ("result" in v) return cellText((v as any).result);
    if ("formula" in v && "result" in v) return String((v as any).result ?? "");
  }
  return String(v);
}
