import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function PATCH(req: NextRequest, { params }: { params: { manta: string; id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();
    const data: any = {};
    for (const f of ["category", "description", "notes"]) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.hours !== undefined)      data.hours = body.hours != null ? Number(body.hours) : null;
    if (body.kgPerHour !== undefined)  data.kgPerHour = body.kgPerHour != null ? Number(body.kgPerHour) : null;
    if (body.pricePerTn !== undefined) data.pricePerTn = body.pricePerTn != null ? Number(body.pricePerTn) : null;

    // Recalcular amount si hay los 3 valores
    const h = data.hours ?? body.hours;
    const k = data.kgPerHour ?? body.kgPerHour;
    const p = data.pricePerTn ?? body.pricePerTn;
    if (h != null && k != null && p != null && Number(h) && Number(k) && Number(p)) {
      data.amount = round2(Number(h) * Number(k) * Number(p));
    } else if (body.amount !== undefined) {
      data.amount = Number(body.amount) || 0;
    }

    const upd = await prisma.mantaManualGasto.update({ where: { id: params.id }, data });
    await audit({ userId: s.sub, entity: "MantaManualGasto", entityId: upd.id, action: "UPDATE", newValue: data });
    return ok(upd);
  } catch (e) { return handle(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: { manta: string; id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    await prisma.mantaManualGasto.delete({ where: { id: params.id } });
    await audit({ userId: s.sub, entity: "MantaManualGasto", entityId: params.id, action: "DELETE" });
    return ok({ deleted: true });
  } catch (e) { return handle(e); }
}
