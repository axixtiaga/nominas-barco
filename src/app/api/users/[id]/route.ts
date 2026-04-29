import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * PATCH /api/users/[id]
 *   Edita un usuario. Solo ADMIN.
 *   Body: { name?, role?, active?, email? }
 *   No permite cambiar la contraseña aquí — usar PUT /api/users/[id]/password.
 *   No permite cambiar usuarios MARINERO (esos van por /api/sailors).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN"]);
    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return fail(404, "Usuario no encontrado");
    if (target.role === "MARINERO") return fail(400, "Los usuarios MARINERO se gestionan desde el maestro de marineros");

    const body = await req.json();
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.email !== undefined) data.email = String(body.email).trim().toLowerCase();
    if (body.role !== undefined) {
      if (!["ADMIN", "OPERATOR", "VIEWER"].includes(body.role)) return fail(400, "Rol inválido");
      data.role = body.role;
    }
    if (body.active !== undefined) data.active = !!body.active;

    // Salvaguarda: no dejar la app sin ningún ADMIN activo
    if (
      (data.role && data.role !== "ADMIN" && target.role === "ADMIN") ||
      (data.active === false && target.role === "ADMIN")
    ) {
      const otherAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true, id: { not: target.id } }
      });
      if (otherAdmins === 0) return fail(400, "No se puede degradar/desactivar al único ADMIN activo");
    }

    const updated = await prisma.user.update({
      where: { id: params.id }, data,
      select: { id: true, email: true, name: true, role: true, active: true }
    });
    await audit({ userId: s.sub, entity: "User", entityId: updated.id, action: "UPDATE", newValue: data });
    return ok(updated);
  } catch (e: any) {
    if (e?.code === "P2002") return fail(409, "Email duplicado");
    return handle(e);
  }
}

/**
 * DELETE /api/users/[id]
 *   Borra un usuario. Solo ADMIN. No deja borrar al único ADMIN activo.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN"]);
    if (s.sub === params.id) return fail(400, "No puedes borrarte a ti mismo. Usa otra cuenta admin para hacerlo.");

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return fail(404, "Usuario no encontrado");
    if (target.role === "MARINERO") return fail(400, "Los usuarios MARINERO se borran desde el maestro de marineros");

    if (target.role === "ADMIN") {
      const otherAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true, id: { not: target.id } }
      });
      if (otherAdmins === 0) return fail(400, "No se puede borrar al único ADMIN activo");
    }

    await prisma.user.delete({ where: { id: params.id } });
    await audit({ userId: s.sub, entity: "User", entityId: params.id, action: "DELETE" });
    return ok({ deleted: true });
  } catch (e) { return handle(e); }
}
