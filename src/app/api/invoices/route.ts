import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { invoicesRepo } from "@/lib/repositories/invoices";
import { requireSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const q = req.nextUrl.searchParams;
    return ok(await invoicesRepo.list({
      portId: q.get("portId") ?? undefined,
      boatId: q.get("boatId") ?? undefined,
      supplierId: q.get("supplierId") ?? undefined,
      speciesId: q.get("speciesId") ?? undefined,
      rawSpecies: q.get("rawSpecies") ?? undefined,
      status: q.get("status") ?? undefined,
      // Atajo: ?date=YYYY-MM-DD filtra capturas con issueDate de ese día (lo usa el editor de gastos).
      from: q.get("date") ? new Date(q.get("date")! + "T00:00:00") : (q.get("from") ? new Date(q.get("from")!) : undefined),
      to:   q.get("date") ? new Date(q.get("date")! + "T23:59:59") : (q.get("to")   ? new Date(q.get("to")!)   : undefined)
    }));
  } catch (e) { return handle(e); }
}
