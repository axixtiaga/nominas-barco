import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { mastersRepo } from "@/lib/repositories/masters";
import { boatSchema } from "@/lib/zod/schemas";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function GET() { try { return ok(await mastersRepo.boats.list()); } catch (e) { return handle(e); } }
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const data = boatSchema.parse(await req.json());
    const created = await mastersRepo.boats.create(data);
    await audit({ userId: s.sub, entity: "Boat", entityId: created.id, action: "CREATE", newValue: data });
    return ok(created, 201);
  } catch (e) { return handle(e); }
}
