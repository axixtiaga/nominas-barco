import { NextRequest, NextResponse } from "next/server";
import { fail, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { getAnnualReport } from "@/lib/services/reports";
import { generateAnnualExcel } from "@/lib/services/reports-excel";

/**
 * GET /api/reports/annual/excel?year=YYYY
 *   Descarga el Excel del reporte anual.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const yearStr = req.nextUrl.searchParams.get("year");
    const year = parseInt(yearStr ?? "", 10);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return fail(400, "Parámetro 'year' requerido (4 dígitos)");
    }
    const report = await getAnnualReport(year);
    const buf = await generateAnnualExcel(report);
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Reporte-Anual-Itsas-Lagunak-${year}.xlsx"`
      }
    });
  } catch (e) { return handle(e); }
}
