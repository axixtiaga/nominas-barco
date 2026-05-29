import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { bulkVerifyDocuments } from "@/lib/services/bulk-verify";

/**
 * POST /api/documents/bulk-verify
 *
 * Verifica masivamente los documentos en estado DRAFT que pasen los filtros
 * y tengan datos completos. Sólo ADMIN/OPERATOR.
 *
 * Body (todo opcional):
 *   {
 *     "kind": "CAPTURA" | "GASTO",   // si se omite, ambos
 *     "year": 2025,                    // si se omite, todos los años
 *     "portId": "...",                 // si se omite, todos los puertos
 *     "dryRun": true                   // si true, NO modifica nada (solo predice)
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json().catch(() => ({} as any));
    const kind = body?.kind === "CAPTURA" || body?.kind === "GASTO" ? body.kind : undefined;
    const year = Number.isFinite(Number(body?.year)) ? Number(body.year) : undefined;
    const portId = typeof body?.portId === "string" && body.portId.length > 0 ? body.portId : undefined;
    const dryRun = body?.dryRun === true;

    const result = await bulkVerifyDocuments({ kind, year, portId, dryRun }, s.sub);
    return ok(result);
  } catch (e) { return handle(e); }
}
