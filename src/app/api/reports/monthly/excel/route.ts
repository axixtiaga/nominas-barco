import { NextRequest, NextResponse } from "next/server";
import { fail, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { getMonthlyReport } from "@/lib/services/reports";
import { generateMonthlyExcel } from "@/lib/services/reports-excel";

/**
 * GET /api/reports/monthly/excel?month=YYYY-MM
 *   Descarga el Excel del reporte mensual.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const month = req.nextUrl.searchParams.get("month");
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return fail(400, "Parámetro 'month' requerido en formato YYYY-MM");
    }
    const report = await getMonthlyReport(month);
    const buf = await generateMonthlyExcel(report);
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Reporte-Itsas-Lagunak-${month}.xlsx"`
      }
    });
  } catch (e) { return handle(e); }
}
