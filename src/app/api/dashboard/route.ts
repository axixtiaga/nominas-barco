import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { getDashboard } from "@/lib/services/dashboard";

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
