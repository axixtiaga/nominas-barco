import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * PUT /api/expense-concepts/[id]
 *   Actualiza una regla. Permite cambiar matchText, matchField, concept, category, priority, notes.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();
    const updated = await prisma.expenseConcept.update({
      where: { id: params.id },
      data: {
        ...(body.matchText !== undefined ? { matchText: String(body.matchText).trim() } : {}),
        ...(body.matchField !== undefined ? { matchField: body.matchField } : {}),
        ...(body.concept !== undefined ? { concept: String(body.concept).trim() } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.priority !== undefined ? { priority: Number(body.priority) || 100 } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {})
      }
    });
    await audit({ userId: s.sub, entity: "ExpenseConcept", entityId: updated.id, action: "UPDATE", newValue: updated });
    return ok(updated);
  } catch (e: any) {
    if (e?.code === "P2002") return fail(409, "Ya existe una regla con ese texto y campo");
    if (e?.code === "P2025") return fail(404, "No existe esa regla");
    return handle(e);
  }
}

/**
 * DELETE /api/expense-concepts/[id]
 *   Borra una regla.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    await prisma.expenseConcept.delete({ where: { id: params.id } });
    await audit({ userId: s.sub, entity: "ExpenseConcept", entityId: params.id, action: "DELETE" });
    return ok({ deleted: true });
  } catch (e: any) {
    if (e?.code === "P2025") return fail(404, "No existe esa regla");
    return handle(e);
  }
}
