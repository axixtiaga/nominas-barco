import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { mastersRepo } from "@/lib/repositories/masters";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const res = await mastersRepo.equivalences.remove(params.id);
    await audit({ userId: s.sub, entity: "SpeciesEquivalence", entityId: params.id, action: "DELETE" });
    return ok(res);
  } catch (e) { return handle(e); }
}

/**
 * Edición inline de cualquier campo de una equivalencia. Acepta un objeto parcial
 * con cualquier combinación de rawName / scope / portId / speciesId / notes / active.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();

    const data: any = {};
    if ("rawName" in body) {
      const n = String(body.rawName ?? "").toUpperCase().replace(/\s+/g, " ").trim();
      if (!n) return fail(400, "La denominación no puede quedar vacía.");
      data.rawName = n;
    }
    if ("scope" in body) {
      if (body.scope !== "GLOBAL" && body.scope !== "PORT") return fail(400, "Alcance no válido.");
      data.scope = body.scope;
    }
    if ("portId" in body) data.portId = body.portId || null;
    if ("speciesId" in body) {
      if (!body.speciesId) return fail(400, "Debes seleccionar una especie.");
      data.speciesId = body.speciesId;
    }
    if ("notes" in body) data.notes = body.notes ? String(body.notes) : null;
    if ("active" in body) data.active = !!body.active;

    // Regla de consistencia: scope GLOBAL ⇒ portId = null
    if (data.scope === "GLOBAL") data.portId = null;
    if (data.scope === "PORT" && !("portId" in data)) {
      // Si dejan PORT sin puerto, rechazamos
      const existing = await prisma.speciesEquivalence.findUnique({ where: { id: params.id } });
      if (!existing?.portId) return fail(400, "Selecciona un puerto para alcance PORT.");
    }

    try {
      const updated = await prisma.speciesEquivalence.update({
        where: { id: params.id },
        data
      });
      await audit({ userId: s.sub, entity: "SpeciesEquivalence", entityId: params.id, action: "UPDATE", newValue: data });
      return ok(updated);
    } catch (e: any) {
      if (e?.code === "P2002") {
        return fail(409, "Ya existe otra equivalencia con esa denominación y puerto.");
      }
      throw e;
    }
  } catch (e) { return handle(e); }
}
