import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * POST /api/sailors/[id]/user-account
 *   Crea una cuenta de Usuario asociada al marinero indicado.
 *   Body: { email: string, password: string }
 *   - El usuario se crea con role=MARINERO y queda enlazado al Sailor.
 *   - Si el Sailor ya tiene cuenta, devuelve 409.
 *   - Si el email ya está usado por otro usuario, 409.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN"]);
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    if (!email || !email.includes("@")) return fail(400, "Email inválido");
    if (password.length < 6) return fail(400, "La contraseña debe tener al menos 6 caracteres");

    const sailor = await prisma.sailor.findUnique({ where: { id: params.id } });
    if (!sailor) return fail(404, "Marinero no encontrado");
    if (sailor.userId) return fail(409, "Este marinero ya tiene una cuenta asociada");

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return fail(409, "Ya existe un usuario con ese email");

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email, passwordHash, name: sailor.name,
        role: "MARINERO", active: true
      }
    });
    await prisma.sailor.update({ where: { id: sailor.id }, data: { userId: user.id } });

    await audit({
      userId: s.sub, entity: "Sailor", entityId: sailor.id,
      action: "UPDATE", field: "userId",
      newValue: { userId: user.id, email, role: "MARINERO" }
    });
    return ok({ userId: user.id, email, sailorId: sailor.id }, 201);
  } catch (e) { return handle(e); }
}

/**
 * PUT /api/sailors/[id]/user-account
 *   Resetea la contraseña del usuario asociado al marinero.
 *   Body: { password: string }
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN"]);
    const body = await req.json();
    const password = String(body?.password ?? "");
    if (password.length < 6) return fail(400, "La contraseña debe tener al menos 6 caracteres");

    const sailor = await prisma.sailor.findUnique({ where: { id: params.id } });
    if (!sailor || !sailor.userId) return fail(404, "Este marinero no tiene cuenta asociada");

    const passwordHash = await hashPassword(password);
    await prisma.user.update({ where: { id: sailor.userId }, data: { passwordHash } });
    await audit({
      userId: s.sub, entity: "User", entityId: sailor.userId,
      action: "UPDATE", field: "passwordHash"
    });
    return ok({ updated: true });
  } catch (e) { return handle(e); }
}

/**
 * DELETE /api/sailors/[id]/user-account
 *   Borra la cuenta de usuario asociada al marinero (sin borrar al marinero).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN"]);
    const sailor = await prisma.sailor.findUnique({ where: { id: params.id } });
    if (!sailor || !sailor.userId) return fail(404, "Este marinero no tiene cuenta asociada");
    const userId = sailor.userId;
    await prisma.sailor.update({ where: { id: sailor.id }, data: { userId: null } });
    await prisma.user.delete({ where: { id: userId } });
    await audit({
      userId: s.sub, entity: "Sailor", entityId: sailor.id,
      action: "DELETE", field: "userId"
    });
    return ok({ deleted: true });
  } catch (e) { return handle(e); }
}
