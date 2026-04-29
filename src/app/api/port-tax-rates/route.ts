import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * GET /api/port-tax-rates
 *   Lista todos los puertos con su % de impuesto. Devuelve también puertos
 *   sin tax rate definido (rate=null) para que el usuario pueda asignarles uno.
 */
export async function GET(_req: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const ports = await prisma.port.findMany({
      include: { taxRate: true },
      orderBy: { name: "asc" }
    });
    const data = ports.map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      province: p.province,
      country: p.country,
      rate: p.taxRate ? Number(p.taxRate.rate) : null,
      taxRateId: p.taxRate?.id ?? null,
      taxNotes: p.taxRate?.notes ?? null,
      taxActive: p.taxRate?.active ?? true
    }));
    return ok(data);
  } catch (e) { return handle(e); }
}

/**
 * POST /api/port-tax-rates
 *   Crea un puerto nuevo con su % de impuesto.
 *   Body: { name, code?, province?, rate, notes? }
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();
    if (!body.name) return fail(400, "Nombre requerido");

    const code = (body.code ?? body.name).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, "_").slice(0, 16);

    const port = await prisma.port.create({
      data: {
        code,
        name: body.name,
        province: body.province ?? null,
        taxRate: {
          create: {
            rate: Number(body.rate) || 0,
            notes: body.notes ?? null,
            active: true
          }
        }
      },
      include: { taxRate: true }
    });

    await audit({ userId: s.sub, entity: "Port", entityId: port.id, action: "CREATE", newValue: { name: port.name, rate: body.rate } });
    return ok(port, 201);
  } catch (e) { return handle(e); }
}
