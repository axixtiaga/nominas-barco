import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { calcMantaPayroll } from "@/lib/services/manta-payroll";

/**
 * GET /api/nominas/manta/[manta]
 *   Devuelve el cálculo completo de la nómina para esa manta.
 */
export async function GET(_req: NextRequest, { params }: { params: { manta: string } }) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const result = await calcMantaPayroll(decodeURIComponent(params.manta));
    return ok(result);
  } catch (e) { return handle(e); }
}
