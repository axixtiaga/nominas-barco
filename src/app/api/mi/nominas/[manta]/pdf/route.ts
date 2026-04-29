import { NextRequest, NextResponse } from "next/server";
import { handle, fail } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { generatePersonalPdf } from "@/lib/services/personal-pdf";

/**
 * GET /api/mi/nominas/[manta]/pdf
 *   Genera el PDF personal del marinero para una manta concreta.
 *   Acceso:
 *     - role=MARINERO → usa su propio sailorId (del JWT).
 *     - otros roles → necesitan ?sailorId= explícito.
 */
export async function GET(req: NextRequest, { params }: { params: { manta: string } }) {
  try {
    const s = await requireSession();
    const querySailorId = req.nextUrl.searchParams.get("sailorId");
    const manta = decodeURIComponent(params.manta);

    let sailorId: string | null = null;
    if (s.role === "MARINERO") {
      sailorId = s.sailorId ?? null;
      if (!sailorId) return fail(403, "Tu usuario no está asociado a ningún marinero.");
    } else if (querySailorId) {
      sailorId = querySailorId;
    } else {
      return fail(400, "Debes indicar ?sailorId= si no eres MARINERO");
    }

    const result = await generatePersonalPdf(manta, sailorId);
    if (!result) return fail(404, "Manta no encontrada o no apareces en ella");

    return new NextResponse(result.buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`
      }
    });
  } catch (e) { return handle(e); }
}
