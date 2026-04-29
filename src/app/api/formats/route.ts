import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { mastersRepo } from "@/lib/repositories/masters";
import { documentFormatSchema } from "@/lib/zod/schemas";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function GET() { try { return ok(await mastersRepo.formats.list()); } catch (e) { return handle(e); } }
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN"]);
    const data = documentFormatSchema.parse(await req.json());
    const saved = await mastersRepo.formats.upsert({ ...data, portId: data.portId ?? null });
    await audit({ userId: s.sub, entity: "DocumentFormat", entityId: saved.id, action: "UPDATE", newValue: data });
    return ok(saved, 201);
  } catch (e) { return handle(e); }
}
