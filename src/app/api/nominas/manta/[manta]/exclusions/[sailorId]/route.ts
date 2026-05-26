import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * DELETE /api/nominas/manta/[manta]/exclusions/[sailorId]
 *   Quita la exclusión: el marinero vuelve a participar en el reparto de esta manta.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { manta: string; sailorId: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const manta = decodeURIComponent(params.manta);
    const sailorId = params.sailorId;

    const existing = await prisma.mantaSailorExclusion.findUnique({
      where: { manta_sailorId: { manta, sailorId } }
    });
    if (!existing) return fail(404, "No existe la exclusión");

    await prisma.mantaSailorExclusion.delete({ where: { id: existing.id } });
    await audit({
      userId: s.sub, entity: "MantaSailorExclusion", entityId: existing.id,
      action: "DELETE",
      newValue: { manta, sailorId }
    });
    return ok({ deleted: true });
  } catch (e) { return handle(e); }
}
