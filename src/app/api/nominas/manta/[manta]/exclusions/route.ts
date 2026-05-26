import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * POST /api/nominas/manta/[manta]/exclusions
 *   Excluye a un marinero del cálculo de esta manta concreta.
 *   Body: { sailorId: string, reason?: string }
 *
 *   El marinero sigue activo en el maestro, solo no participa en ESTA manta.
 *   Al excluirlo, sus partes se restan del total y el €/parte se reparte entre los demás.
 */
export async function POST(req: NextRequest, { params }: { params: { manta: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const manta = decodeURIComponent(params.manta);
    const body = await req.json();
    const sailorId = String(body?.sailorId ?? "").trim();
    const reason = body?.reason ? String(body.reason).trim() : null;
    if (!sailorId) return fail(400, "sailorId requerido");

    // Verifica que el marinero existe
    const sailor = await prisma.sailor.findUnique({ where: { id: sailorId }, select: { id: true, name: true } });
    if (!sailor) return fail(404, "Marinero no encontrado");

    // Upsert (si ya estaba excluido, actualizamos el reason)
    const created = await prisma.mantaSailorExclusion.upsert({
      where: { manta_sailorId: { manta, sailorId } },
      update: { reason, createdBy: s.sub },
      create: { manta, sailorId, reason, createdBy: s.sub }
    });

    await audit({
      userId: s.sub, entity: "MantaSailorExclusion", entityId: created.id,
      action: "CREATE",
      newValue: { manta, sailorId, sailorName: sailor.name, reason }
    });

    return ok({ id: created.id, manta, sailorId, sailorName: sailor.name, reason });
  } catch (e) { return handle(e); }
}
