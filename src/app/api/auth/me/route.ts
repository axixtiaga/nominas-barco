import { ok, handle } from "@/lib/http";
import { requireSession } from "@/lib/session";

export async function GET() {
  try {
    const s = await requireSession();
    return ok({ email: s.email, name: s.name, role: s.role, sailorId: s.sailorId ?? null });
  } catch (e) { return handle(e); }
}
