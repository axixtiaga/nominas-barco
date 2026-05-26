import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { requireSession } from "@/lib/session";
import {
  AnalysisFilters,
  getKpis, getDaily, getWeekly, getMonthly, getBySpecies, getByPort, getBySupplier
} from "@/lib/services/analysis";

// Igual que /api/dashboard: estos endpoints alimentan el panel y deben
// reflejar el estado actual de la BD tras un DELETE / edición.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: { dim: string } }) {
  try {
    await requireSession();
    const q = req.nextUrl.searchParams;
    const filters: AnalysisFilters = {
      from: q.get("from") ? new Date(q.get("from")!) : undefined,
      to: q.get("to") ? new Date(q.get("to")!) : undefined,
      portId: q.get("portId") ?? undefined,
      speciesId: q.get("speciesId") ?? undefined
    };

    const kpis = await getKpis(filters);
    let breakdown: any[] = [];
    switch (params.dim) {
      case "daily":    breakdown = await getDaily(filters); break;
      case "weekly":   breakdown = await getWeekly(filters); break;
      case "monthly":  breakdown = await getMonthly(filters); break;
      case "species":  breakdown = await getBySpecies(filters); break;
      case "port":     breakdown = await getByPort(filters); break;
      case "supplier": breakdown = await getBySupplier(filters); break;
      default: return fail(400, "Dimensión no soportada");
    }

    return ok({ kpis, breakdown });
  } catch (e) { return handle(e); }
}
