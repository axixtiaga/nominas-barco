import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * GET /api/users
 *   Lista todos los usuarios. Solo ADMIN.
 *   No devuelve hashes de contraseñas.
 */
export async function GET(_req: NextRequest) {
  try {
    await requireRole(["ADMIN"]);
    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true, email: true, name: true, role: true, active: true,
        createdAt: true, updatedAt: true,
        sailor: { select: { id: true, name: true } }
      }
    });
    return ok(users);
  } catch (e) { return handle(e); }
}

/**
 * POST /api/users
 *   Crea un usuario nuevo. Solo ADMIN.
 *   Body: { email, password, name, role }
 *   role debe ser uno de: ADMIN, OPERATOR, VIEWER (los MARINERO se crean
 *   desde /api/sailors/[id]/user-account porque van enlazados a un Sailor).
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN"]);
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const name = String(body?.name ?? "").trim();
    const role = String(body?.role ?? "");
    if (!email || !email.includes("@")) return fail(400, "Email inválido");
    if (password.length < 6) return fail(400, "La contraseña debe tener al menos 6 caracteres");
    if (!name) return fail(400, "Nombre requerido");
    if (!["ADMIN", "OPERATOR", "VIEWER"].includes(role)) {
      return fail(400, "Rol inválido. Debe ser ADMIN, OPERATOR o VIEWER");
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail(409, "Ya existe un usuario con ese email");

    const passwordHash = await hashPassword(password);
    const created = await prisma.user.create({
      data: { email, passwordHash, name, role: role as any, active: true },
      select: { id: true, email: true, name: true, role: true, active: true }
    });
    await audit({ userId: s.sub, entity: "User", entityId: created.id, action: "CREATE", newValue: { email, name, role } });
    return ok(created, 201);
  } catch (e) { return handle(e); }
}
