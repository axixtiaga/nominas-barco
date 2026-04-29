import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /api/nominas/manta/[manta]/manual-gastos
 *   Lista los gastos manuales asignados a una manta.
 */
export async function GET(_req: NextRequest, { params }: { params: { manta: string } }) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const manta = decodeURIComponent(params.manta);
    const list = await prisma.mantaManualGasto.findMany({ where: { manta }, orderBy: { createdAt: "asc" } });
    return ok(list);
  } catch (e) { return handle(e); }
}

/**
 * POST /api/nominas/manta/[manta]/manual-gastos
 *   Crea un gasto manual en la manta.
 *   Body: { category, description, hours?, kgPerHour?, pricePerTn?, amount? }
 *   Si vienen hours/kgPerHour/pricePerTn, calcula amount automáticamente como
 *     amount = hours × kgPerHour × pricePerTn / 1000
 *   (kg × €/Tn ÷ 1000 = €).
 */
export async function POST(req: NextRequest, { params }: { params: { manta: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const manta = decodeURIComponent(params.manta);
    const body = await req.json();
    if (!body.description) return fail(400, "Falta descripción");

    const hours = body.hours != null ? Number(body.hours) : null;
    const kgPerHour = body.kgPerHour != null ? Number(body.kgPerHour) : null;
    const pricePerTn = body.pricePerTn != null ? Number(body.pricePerTn) : null;

    let amount = body.amount != null ? Number(body.amount) : 0;
    // Cálculo automático: hours × kgPerHour × pricePerTn (multiplicación directa).
    // Ej.: 10h × 290 kg/h × 0,05 = 145,00 €
    if (hours && kgPerHour && pricePerTn) {
      amount = round2(hours * kgPerHour * pricePerTn);
    }

    // Restricción: solo puede haber UN Hielo producido por manta.
    if (body.category === "HIELO_PRODUCIDO") {
      const existing = await prisma.mantaManualGasto.findFirst({
        where: { manta, category: "HIELO_PRODUCIDO" }
      });
      if (existing) return fail(400, "Ya existe un gasto HIELO_PRODUCIDO en esta manta. Edita el existente o bórralo antes de añadir uno nuevo.");
    }

    const created = await prisma.mantaManualGasto.create({
      data: {
        manta,
        category: body.category ?? "OTRO",
        description: body.description,
        hours, kgPerHour, pricePerTn,
        amount,
        notes: body.notes ?? null
      }
    });
    await audit({ userId: s.sub, entity: "MantaManualGasto", entityId: created.id, action: "CREATE", newValue: { manta, amount } });
    return ok(created, 201);
  } catch (e) { return handle(e); }
}
