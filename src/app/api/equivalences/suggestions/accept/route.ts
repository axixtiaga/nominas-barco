import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { normalizeRawName, resolveSpeciesId } from "@/lib/services/species-normalizer";

/**
 * POST /api/equivalences/suggestions/accept
 *   Acepta en lote varias sugerencias del sugeridor. Por cada una crea (o actualiza)
 *   una SpeciesEquivalence y luego re-resuelve las InvoiceLine sin speciesId que
 *   coincidan con esa rawName, para que el cambio se propague a los datos ya importados.
 *
 *   Body: {
 *     items: [
 *       { rawName: string, speciesId: string, scope: "GLOBAL" | "PORT", portId?: string | null }
 *     ]
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) return fail(400, "Lista de sugerencias vacía");

    let created = 0, updated = 0, skipped = 0, linesResolved = 0;

    for (const it of items) {
      const rawName = normalizeRawName(String(it.rawName ?? ""));
      const speciesId = String(it.speciesId ?? "");
      const scope = it.scope === "PORT" ? "PORT" : "GLOBAL";
      const portId = scope === "PORT" ? (it.portId ?? null) : null;
      if (!rawName || !speciesId) { skipped++; continue; }

      // Upsert por (rawName, portId) — el constraint unique del modelo lo garantiza.
      const existing = await prisma.speciesEquivalence.findFirst({
        where: { rawName, portId }
      });

      let saved;
      if (existing) {
        saved = await prisma.speciesEquivalence.update({
          where: { id: existing.id },
          data: { speciesId, scope, active: true }
        });
        updated++;
      } else {
        saved = await prisma.speciesEquivalence.create({
          data: { rawName, scope, portId, speciesId, active: true }
        });
        created++;
      }

      await audit({
        userId: s.sub, entity: "SpeciesEquivalence", entityId: saved.id,
        action: existing ? "UPDATE" : "CREATE",
        newValue: { rawName, speciesId, scope, portId, source: "auto-suggest" }
      });
    }

    // Re-resuelve líneas sin speciesId (puede que ahora encuentren equivalencia)
    const missing = await prisma.invoiceLine.findMany({
      where: { speciesId: null },
      include: { invoice: { select: { portId: true } } }
    });
    for (const line of missing) {
      const sid = await resolveSpeciesId(line.rawSpeciesName, line.invoice?.portId ?? null);
      if (sid) {
        await prisma.invoiceLine.update({ where: { id: line.id }, data: { speciesId: sid } });
        linesResolved++;
      }
    }

    return ok({ created, updated, skipped, linesResolved });
  } catch (e) { return handle(e); }
}
