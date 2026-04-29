import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcMantaPayroll } from "@/lib/services/manta-payroll";
import { generatePersonalPdf } from "@/lib/services/personal-pdf";
import { sendEmail, verifySmtp } from "@/lib/services/mailer";
import { audit } from "@/lib/audit";

/**
 * POST /api/nominas/manta/[manta]/send-personal-pdfs
 *   Genera el PDF personal de cada marinero de la manta y se lo envía por email
 *   a su `contactEmail` (campo "Email de contacto" en el maestro de marineros).
 *
 *   Body opcional: { onlySailorIds?: string[] }
 *     Si se pasa, solo envía a esos marineros (útil para reintentos).
 *
 *   Devuelve un resumen detallado:
 *     {
 *       sent: [{ sailorId, name, email, messageId }],
 *       skipped: [{ sailorId, name, reason }],
 *       failed: [{ sailorId, name, email?, error }]
 *     }
 */
export async function POST(req: NextRequest, { params }: { params: { manta: string } }) {
  try {
    const session = await requireRole(["ADMIN", "OPERATOR"]);
    const manta = decodeURIComponent(params.manta);

    // Parse body opcional
    let onlySailorIds: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.onlySailorIds) && body.onlySailorIds.length > 0) {
        onlySailorIds = body.onlySailorIds.map(String);
      }
    } catch { /* sin body, ok */ }

    // Pre-chequeo de configuración SMTP
    const v = await verifySmtp();
    if (!v.ok) return fail(500, `SMTP no configurado correctamente: ${v.error}`);

    // Cálculo de la manta
    const data = await calcMantaPayroll(manta);
    if (!data) return fail(404, "Manta no encontrada");

    // Resolver contactEmail de cada marinero (la lista de marineros viene de calcMantaPayroll
    // pero ahí no está el contactEmail — lo cargamos de la BD).
    const sailorIds = data.marineros.map((m: any) => m.sailorId);
    const sailors = await prisma.sailor.findMany({
      where: { id: { in: sailorIds } },
      select: { id: true, name: true, contactEmail: true }
    });
    const contactById = new Map(sailors.map(s => [s.id, s.contactEmail ?? null]));

    const sent: Array<{ sailorId: string; name: string; email: string; messageId: string }> = [];
    const skipped: Array<{ sailorId: string; name: string; reason: string }> = [];
    const failed: Array<{ sailorId: string; name: string; email?: string; error: string }> = [];

    for (const m of data.marineros as any[]) {
      // Filtro opcional
      if (onlySailorIds && !onlySailorIds.includes(m.sailorId)) continue;

      const email = contactById.get(m.sailorId) ?? null;
      if (!email) {
        skipped.push({ sailorId: m.sailorId, name: m.name, reason: "Sin email de contacto" });
        continue;
      }

      try {
        const pdf = await generatePersonalPdf(manta, m.sailorId);
        if (!pdf) {
          failed.push({ sailorId: m.sailorId, name: m.name, email, error: "No se pudo generar el PDF" });
          continue;
        }
        const subject = `Nómina Itsas Lagunak — Manta nº ${manta}`;
        const text = [
          `Hola ${m.name},`,
          ``,
          `Adjunto te envío tu nómina de la manta nº ${manta}.`,
          `Período: ${data.periodFrom ?? "?"} → ${data.periodTo ?? "?"}`,
          ``,
          `Tu líquido a percibir: ${pdf.liquidoAPercibir.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`,
          ``,
          `Si tienes cualquier duda, ponte en contacto conmigo.`,
          ``,
          `Un saludo,`,
          `Itsas Lagunak`
        ].join("\n");
        const info = await sendEmail({
          to: email,
          subject,
          text,
          attachments: [{ filename: pdf.filename, content: pdf.buffer, contentType: "application/pdf" }]
        });
        sent.push({ sailorId: m.sailorId, name: m.name, email, messageId: info.messageId });
      } catch (e: any) {
        failed.push({ sailorId: m.sailorId, name: m.name, email, error: e?.message ?? String(e) });
      }
    }

    await audit({
      userId: session.sub, entity: "MantaInfo", entityId: manta,
      action: "UPDATE", field: "sendPersonalPdfs",
      newValue: { sent: sent.length, skipped: skipped.length, failed: failed.length }
    });

    return ok({
      manta,
      total: data.marineros.length,
      sent, skipped, failed,
      summary: {
        ok: sent.length,
        skipped: skipped.length,
        failed: failed.length
      }
    });
  } catch (e) { return handle(e); }
}
