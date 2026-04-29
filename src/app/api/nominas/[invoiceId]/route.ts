// Endpoint legacy mantenido por compatibilidad. La nómina se gestiona ahora por
// (día, puerto) — usa POST /api/nominas/upsert.
import { NextRequest } from "next/server";
import { fail } from "@/lib/http";

export async function PATCH(_req: NextRequest, _ctx: { params: { invoiceId: string } }) {
  return fail(410, "Endpoint obsoleto: usa POST /api/nominas/upsert con { date, portId, manta, paid }.");
}
