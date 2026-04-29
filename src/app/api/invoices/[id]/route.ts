import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { invoicesRepo } from "@/lib/repositories/invoices";
import { invoiceUpdateSchema } from "@/lib/zod/schemas";
import { updateInvoice } from "@/lib/services/invoices";
import { requireRole, requireSession } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const inv = await invoicesRepo.get(params.id);
    if (!inv) return fail(404, "Factura no encontrada");
    return ok(inv);
  } catch (e) { return handle(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = invoiceUpdateSchema.parse(await req.json());
    const updated = await updateInvoice(params.id, body, s.sub);
    return ok(updated);
  } catch (e) { return handle(e); }
}
