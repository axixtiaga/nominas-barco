import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * PATCH /api/port-tax-rates/[portId]
 *   Establece o actualiza el % de impuesto de un puerto existente.
 *   Body: { rate, notes?, active? }
 */
export async function PATCH(req: NextRequest, { params }: { params: { portId: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();
    if (typeof body.rate !== "number" && typeof body.rate !== "string") {
      return fail(400, "Rate requerido (número)");
    }
    const rate = Number(body.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return fail(400, "Rate debe estar entre 0 y 100");
    }

    const port = await prisma.port.findUnique({ where: { id: params.portId } });
    if (!port) return fail(404, "Puerto no encontrado");

    const existing = await prisma.portTaxRate.findUnique({ where: { portId: port.id } });
    let result;
    if (existing) {
      result = await prisma.portTaxRate.update({
        where: { portId: port.id },
        data: {
          rate,
          notes: body.notes ?? existing.notes,
          active: body.active ?? existing.active
        }
      });
    } else {
      result = await prisma.portTaxRate.create({
        data: {
          portId: port.id,
          rate,
          notes: body.notes ?? null,
          active: body.active ?? true
        }
      });
    }

    await audit({
      userId: s.sub, entity: "PortTaxRate", entityId: result.id,
      action: existing ? "UPDATE" : "CREATE",
      newValue: { portId: port.id, portName: port.name, rate }
    });
    return ok(result);
  } catch (e) { return handle(e); }
}

/**
 * DELETE /api/port-tax-rates/[portId]
 *   Borra el tax rate de un puerto (deja el puerto sin %).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { portId: string } }) {
  try {
    const s = await requireRole(["ADMIN"]);
    const existing = await prisma.portTaxRate.findUnique({ where: { portId: params.portId } });
    if (!existing) return fail(404, "Tax rate no encontrado");
    await prisma.portTaxRate.delete({ where: { portId: params.portId } });
    await audit({ userId: s.sub, entity: "PortTaxRate", entityId: existing.id, action: "DELETE" });
    return ok({ deleted: true });
  } catch (e) { return handle(e); }
}
