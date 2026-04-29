import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { getMonthlyReport } from "@/lib/services/reports";

/**
 * GET /api/reports/monthly?month=YYYY-MM
 *   Datos del reporte mensual para mostrar en pantalla.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const month = req.nextUrl.searchParams.get("month");
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return fail(400, "Parámetro 'month' requerido en formato YYYY-MM");
    }
    const report = await getMonthlyReport(month);
    return ok(report);
  } catch (e) { return handle(e); }
}
