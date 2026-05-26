import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { getDashboard } from "@/lib/services/dashboard";

// El panel debe reflejar SIEMPRE el estado actual de la BD (sin caché).
// Si no se fuerza, Next.js puede servir una respuesta cacheada tras un DELETE.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const q = req.nextUrl.searchParams;
    return ok(await getDashboard({
      from: q.get("from") ? new Date(q.get("from")!) : undefined,
      to: q.get("to") ? new Date(q.get("to")!) : undefined
    }));
  } catch (e) { return handle(e); }
}
