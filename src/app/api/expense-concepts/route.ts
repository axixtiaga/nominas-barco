import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * GET /api/expense-concepts
 *   Lista todas las reglas de mapeo "texto en factura → concepto + categoría".
 *   Ordenadas por priority desc, luego matchText asc.
 */
export async function GET(_req: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const items = await prisma.expenseConcept.findMany({
      orderBy: [{ priority: "desc" }, { matchText: "asc" }]
    });
    return ok(items);
  } catch (e) { return handle(e); }
}

/**
 * POST /api/expense-concepts
 *   Crea una regla nueva.
 *   Body: { matchText, matchField?, concept, category?, priority?, notes? }
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();
    const matchText = String(body.matchText ?? "").trim();
    const concept = String(body.concept ?? "").trim();
    if (!matchText) return fail(400, "Texto a buscar requerido");
    if (!concept) return fail(400, "Concepto requerido");

    const created = await prisma.expenseConcept.create({
      data: {
        matchText,
        matchField: body.matchField ?? "SUPPLIER",
        concept,
        category: body.category ?? "OTRO",
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100,
        notes: body.notes ?? null
      }
    });
    await audit({ userId: s.sub, entity: "ExpenseConcept", entityId: created.id, action: "CREATE", newValue: created });
    return ok(created, 201);
  } catch (e: any) {
    // Duplicado (matchText + matchField)
    if (e?.code === "P2002") return fail(409, "Ya existe una regla con ese texto y campo");
    return handle(e);
  }
}
