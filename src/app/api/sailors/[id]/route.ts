import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const s = await prisma.sailor.findUnique({ where: { id: params.id } });
    if (!s) return fail(404, "Marinero no encontrado");
    return ok(s);
  } catch (e) { return handle(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();
    const data: any = {};
    for (const f of ["dni", "name", "role", "cotizacionType", "parts", "irpfRate", "ssRateLow", "ssRateHigh", "active", "notes", "contactEmail"]) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.joinedAt !== undefined) data.joinedAt = body.joinedAt ? new Date(body.joinedAt) : null;
    if (body.leftAt !== undefined)   data.leftAt   = body.leftAt   ? new Date(body.leftAt)   : null;
    const updated = await prisma.sailor.update({ where: { id: params.id }, data });
    await audit({ userId: s.sub, entity: "Sailor", entityId: updated.id, action: "UPDATE", newValue: data });
    return ok(updated);
  } catch (e) { return handle(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN"]);
    // Soft delete: marca como inactivo en lugar de borrar (preserva trazabilidad)
    const updated = await prisma.sailor.update({ where: { id: params.id }, data: { active: false } });
    await audit({ userId: s.sub, entity: "Sailor", entityId: updated.id, action: "DELETE" });
    return ok({ deleted: true });
  } catch (e) { return handle(e); }
}
