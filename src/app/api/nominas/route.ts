import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { calcNominaDays } from "@/lib/services/nomina-calc";

/**
 * GET /api/nominas
 *   Devuelve filas de nómina por (día, puerto) cruzando líneas de captura VERIFIED.
 *
 *   Query params:
 *     ?from=YYYY-MM-DD
 *     ?to=YYYY-MM-DD
 *     ?portId=XXX
 *     ?manta=X              → filtra por una manta concreta
 *     ?withMantaOnly=true   → solo días que tienen manta asignada (default: true)
 *     ?paid=true|false      → filtra cobrado/no cobrado
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const q = req.nextUrl.searchParams;

    const from = q.get("from") ? new Date(q.get("from")! + "T00:00:00") : undefined;
    const to   = q.get("to")   ? new Date(q.get("to")!   + "T23:59:59") : undefined;
    const portId = q.get("portId") ?? undefined;
    const manta = q.get("manta") ?? undefined;
    const withMantaOnly = (q.get("withMantaOnly") ?? "true") !== "false";
    const paidParam = q.get("paid");
    const paid = paidParam === "true" ? true : paidParam === "false" ? false : undefined;

    let rows = await calcNominaDays({ from, to, portId });

    // Filtros post-cálculo (porque manta y paid vienen del modelo NominaDay)
    if (manta) rows = rows.filter(r => r.manta === manta);
    else if (withMantaOnly) rows = rows.filter(r => !!r.manta);
    if (paid !== undefined) rows = rows.filter(r => r.paid === paid);

    const totals = rows.reduce((a, r) => ({
      totalPesca: a.totalPesca + r.totalPesca,
      impuestoPuerto: a.impuestoPuerto + r.impuestoPuerto,
      subtotal: a.subtotal + r.subtotal,
      kofradiaHnd: a.kofradiaHnd + r.kofradiaHnd,
      federacion: a.federacion + r.federacion,
      opegui: a.opegui + r.opegui,
      gastosDia: a.gastosDia + r.gastosDia,
      montemayor: a.montemayor + r.montemayor,
      ss35: a.ss35 + r.ss35,
      ss40: a.ss40 + r.ss40
    }), {
      totalPesca: 0, impuestoPuerto: 0, subtotal: 0, kofradiaHnd: 0,
      federacion: 0, opegui: 0, gastosDia: 0, montemayor: 0, ss35: 0, ss40: 0
    });

    return ok({ rows, totals, count: rows.length });
  } catch (e) { return handle(e); }
}
