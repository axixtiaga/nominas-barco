import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * GET /api/sailors
 *   ?onlyActive=true (default) → solo activos
 *   ?all=true → todos (activos + inactivos)
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const q = req.nextUrl.searchParams;
    const all = q.get("all") === "true";
    const onlyActive = !all && q.get("onlyActive") !== "false";
    const sailors = await prisma.sailor.findMany({
      where: onlyActive ? { active: true } : {},
      orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
      include: {
        user: { select: { email: true } }
      }
    });
    // Aplana userEmail al nivel raíz para que la UI no tenga que navegar relaciones
    const flat = sailors.map(s => ({
      ...s,
      userEmail: s.user?.email ?? null
    }));
    return ok(flat);
  } catch (e) { return handle(e); }
}

/**
 * POST /api/sailors
 *   Body: { name, role?, parts?, irpfRate?, ssRateLow?, ssRateHigh?, active?, joinedAt?, leftAt?, notes? }
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();
    if (!body.name) return fail(400, "Nombre requerido");
    const sailor = await prisma.sailor.create({
      data: {
        dni: body.dni ?? null,
        name: body.name,
        role: body.role ?? "MARINERO",
        cotizacionType: body.cotizacionType ?? null,
        parts: body.parts ?? 1,
        irpfRate: body.irpfRate ?? 15,
        ssRateLow: body.ssRateLow ?? 3.5,
        ssRateHigh: body.ssRateHigh ?? 4,
        active: body.active !== false,
        joinedAt: body.joinedAt ? new Date(body.joinedAt) : null,
        leftAt: body.leftAt ? new Date(body.leftAt) : null,
        notes: body.notes ?? null
      }
    });
    await audit({ userId: s.sub, entity: "Sailor", entityId: sailor.id, action: "CREATE", newValue: { name: sailor.name } });
    return ok(sailor, 201);
  } catch (e) { return handle(e); }
}
