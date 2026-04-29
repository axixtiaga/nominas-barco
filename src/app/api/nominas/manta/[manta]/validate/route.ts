import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * POST /api/nominas/manta/[manta]/validate
 *   Valida (cierra) una manta — guarda fecha y autor de validación.
 *   Body: { validate: boolean, notes?: string }
 *     validate=true  → marca como validada con fecha actual
 *     validate=false → desvalida (vuelve a borrador)
 */
export async function POST(req: NextRequest, { params }: { params: { manta: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const manta = decodeURIComponent(params.manta);
    const body = await req.json();
    const validate = body.validate !== false;

    const existing = await prisma.mantaInfo.findUnique({ where: { manta } });
    let result;
    if (existing) {
      result = await prisma.mantaInfo.update({
        where: { manta },
        data: {
          validatedAt: validate ? new Date() : null,
          validatedBy: validate ? s.sub : null,
          notes: body.notes ?? existing.notes
        }
      });
    } else {
      result = await prisma.mantaInfo.create({
        data: {
          manta,
          validatedAt: validate ? new Date() : null,
          validatedBy: validate ? s.sub : null,
          notes: body.notes ?? null
        }
      });
    }

    await audit({
      userId: s.sub, entity: "MantaInfo", entityId: result.id,
      action: validate ? "VALIDATE" : "INVALIDATE",
      newValue: { manta, validatedAt: result.validatedAt }
    });
    return ok(result);
  } catch (e) { return handle(e); }
}
