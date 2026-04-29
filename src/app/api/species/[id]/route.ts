import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/** Editar una especie (nombre común, código, nombre científico, activo). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();

    const data: any = {};
    if ("code" in body) {
      const c = String(body.code ?? "").toUpperCase().trim();
      if (!c) return fail(400, "El código no puede quedar vacío.");
      data.code = c;
    }
    if ("commonName" in body) {
      const n = String(body.commonName ?? "").trim();
      if (!n) return fail(400, "El nombre común no puede quedar vacío.");
      data.commonName = n;
    }
    if ("scientificName" in body) {
      data.scientificName = body.scientificName ? String(body.scientificName).trim() : null;
    }
    if ("active" in body) data.active = !!body.active;

    try {
      const updated = await prisma.species.update({ where: { id: params.id }, data });
      await audit({ userId: s.sub, entity: "Species", entityId: params.id, action: "UPDATE", newValue: data });
      return ok(updated);
    } catch (e: any) {
      if (e?.code === "P2002") return fail(409, "Ya existe otra especie con ese código.");
      throw e;
    }
  } catch (e) { return handle(e); }
}

/** Borra (desactiva) una especie. No se elimina físicamente para no romper líneas existentes. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN"]);
    const updated = await prisma.species.update({ where: { id: params.id }, data: { active: false } });
    await audit({ userId: s.sub, entity: "Species", entityId: params.id, action: "DELETE" });
    return ok(updated);
  } catch (e) { return handle(e); }
}
