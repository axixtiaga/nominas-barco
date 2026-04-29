import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();
    const data: any = {};
    for (const f of ["amount", "totalCost", "employerPart", "employeePart", "notes", "month"]) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    const updated = await prisma.ssPayment.update({ where: { id: params.id }, data });
    await audit({ userId: s.sub, entity: "SsPayment", entityId: updated.id, action: "UPDATE", newValue: data });
    return ok(updated);
  } catch (e: any) {
    if (e?.code === "P2025") return fail(404, "No existe");
    return handle(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    await prisma.ssPayment.delete({ where: { id: params.id } });
    await audit({ userId: s.sub, entity: "SsPayment", entityId: params.id, action: "DELETE" });
    return ok({ deleted: true });
  } catch (e: any) {
    if (e?.code === "P2025") return fail(404, "No existe");
    return handle(e);
  }
}
