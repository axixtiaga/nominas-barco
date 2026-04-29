import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { getAnnualReport } from "@/lib/services/reports";

/**
 * GET /api/reports/annual?year=YYYY
 *   Datos del reporte anual.
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
    return ok(report);
  } catch (e) { return handle(e); }
}
