import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { documentsRepo } from "@/lib/repositories/documents";
import { requireSession } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const doc = await documentsRepo.get(params.id);
    if (!doc) return fail(404, "Documento no encontrado");
    return ok(doc);
  } catch (e) { return handle(e); }
}
