import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * PUT /api/users/[id]/password
 *   Resetea la contraseña de un usuario. Solo ADMIN.
 *   Body: { password }
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN"]);
    const body = await req.json();
    const password = String(body?.password ?? "");
    if (password.length < 6) return fail(400, "La contraseña debe tener al menos 6 caracteres");

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return fail(404, "Usuario no encontrado");

    const passwordHash = await hashPassword(password);
    await prisma.user.update({ where: { id: params.id }, data: { passwordHash } });
    await audit({ userId: s.sub, entity: "User", entityId: params.id, action: "UPDATE", field: "passwordHash" });
    return ok({ updated: true });
  } catch (e) { return handle(e); }
}
