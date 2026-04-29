import { ok, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveSpeciesId } from "@/lib/services/species-normalizer";
import { audit } from "@/lib/audit";

/**
 * Re-ejecuta el normalizador de especies sobre todas las líneas con speciesId=null.
 * Útil después de añadir equivalencias nuevas al maestro.
 */
export async function POST() {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const missing = await prisma.invoiceLine.findMany({
      where: { speciesId: null },
      include: { invoice: { select: { portId: true } } }
    });

    let resolved = 0;
    for (const line of missing) {
      const speciesId = await resolveSpeciesId(line.rawSpeciesName, line.invoice?.portId ?? null);
      if (speciesId) {
        await prisma.invoiceLine.update({ where: { id: line.id }, data: { speciesId } });
        resolved++;
      }
    }
    await audit({
      userId: s.sub, entity: "InvoiceLine", entityId: "bulk",
      action: "UPDATE", field: "speciesId",
      newValue: { resolved, scanned: missing.length }
    });
    return ok({ scanned: missing.length, resolved });
  } catch (e) { return handle(e); }
}
