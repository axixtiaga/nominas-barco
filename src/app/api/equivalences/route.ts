import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { mastersRepo } from "@/lib/repositories/masters";
import { equivalenceSchema } from "@/lib/zod/schemas";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const portId = req.nextUrl.searchParams.get("portId");
    return ok(await mastersRepo.equivalences.list(portId));
  } catch (e) { return handle(e); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const data = equivalenceSchema.parse(await req.json());
    const saved = await mastersRepo.equivalences.upsert({ ...data, portId: data.portId ?? null });
    await audit({ userId: s.sub, entity: "SpeciesEquivalence", entityId: saved.id, action: "CREATE", newValue: data });
    return ok(saved, 201);
  } catch (e) { return handle(e); }
}
