import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { generateSuggestions } from "@/lib/services/species-suggester";

/**
 * GET /api/equivalences/suggestions
 *   Devuelve sugerencias automáticas de equivalencias basadas en los rawSpeciesName
 *   de las facturas que NO tienen equivalencia. Cada sugerencia incluye nivel de
 *   confianza (HIGH/MEDIUM/LOW) y el motivo.
 */
export async function GET(_req: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const suggestions = await generateSuggestions();
    return ok({ suggestions, total: suggestions.length });
  } catch (e) { return handle(e); }
}
