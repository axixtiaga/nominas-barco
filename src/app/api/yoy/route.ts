import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { getYoyAnalysis } from "@/lib/services/yoy-analysis";

// El análisis comparado debe reflejar SIEMPRE el estado actual de la BD.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/yoy
 * Devuelve KPIs, serie diaria, agregados mensuales y desglose por especie/puerto
 * comparando el año en curso contra el anterior al "mismo día".
 *
 * Query params (todos opcionales):
 *   refDate    — ISO (YYYY-MM-DD) — "hoy virtual" (por defecto, hoy)
 *   thisYear   — año a comparar
 *   lastYear   — año contra el que comparar
 *   portId     — filtro por puerto
 *   speciesId  — filtro por especie
 */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const q = req.nextUrl.searchParams;
    const refDate = q.get("refDate") ? new Date(q.get("refDate")!) : undefined;
    const thisYear = q.get("thisYear") ? Number(q.get("thisYear")) : undefined;
    const lastYear = q.get("lastYear") ? Number(q.get("lastYear")) : undefined;
    const portId = q.get("portId") || null;
    const speciesId = q.get("speciesId") || null;

    return ok(await getYoyAnalysis({
      refDate,
      thisYear: Number.isFinite(thisYear) ? thisYear : undefined,
      lastYear: Number.isFinite(lastYear) ? lastYear : undefined,
      portId,
      speciesId
    }));
  } catch (e) { return handle(e); }
}
