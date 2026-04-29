import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { mastersRepo } from "@/lib/repositories/masters";
import { speciesSchema } from "@/lib/zod/schemas";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function GET() { try { return ok(await mastersRepo.species.list()); } catch (e) { return handle(e); } }
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const data = speciesSchema.parse(await req.json());
    const created = await mastersRepo.species.create(data);
    await audit({ userId: s.sub, entity: "Species", entityId: created.id, action: "CREATE", newValue: data });
    return ok(created, 201);
  } catch (e) { return handle(e); }
}
