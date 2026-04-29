import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * POST /api/nominas/upsert
 *   Crea o actualiza una marca de NominaDay para un (date, portId).
 *
 *   Body:
 *     { date: "YYYY-MM-DD", portId: string|null, manta?: string|null, paid?: boolean, notes?: string|null }
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();
    if (!body.date) return fail(400, "Falta 'date' (YYYY-MM-DD)");

    // IMPORTANTE: usar UTC para que la fecha guardada coincida con la que el cálculo
    // saca de InvoiceLine.lineDate (que también está en UTC porque el parser hace
    // `new Date("YYYY-MM-DD")` que JS interpreta como medianoche UTC).
    // Si pusiéramos `T00:00:00` sin Z, en Spain (UTC+1/+2) se desplazaría al día anterior.
    const date = new Date(body.date + "T00:00:00.000Z");
    const portId: string | null = body.portId ?? null;

    const existing = await prisma.nominaDay.findUnique({
      where: { date_portId: { date, portId } as any }
    }).catch(() => null);

    const data: any = {};
    if (body.manta !== undefined) data.manta = body.manta || null;
    if (body.paid !== undefined) {
      data.paid = !!body.paid;
      data.paidAt = body.paid ? new Date() : null;
    }
    if (body.notes !== undefined) data.notes = body.notes || null;

    let result;
    if (existing) {
      result = await prisma.nominaDay.update({ where: { id: existing.id }, data });
    } else {
      result = await prisma.nominaDay.create({
        data: {
          date,
          portId,
          manta: data.manta ?? null,
          paid: data.paid ?? false,
          paidAt: data.paidAt ?? null,
          notes: data.notes ?? null
        }
      });
    }

    await audit({
      userId: s.sub, entity: "NominaDay", entityId: result.id,
      action: existing ? "UPDATE" : "CREATE",
      newValue: { date: body.date, portId, manta: data.manta, paid: data.paid }
    });

    return ok(result);
  } catch (e) { return handle(e); }
}
