import { ok, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { verifySmtp } from "@/lib/services/mailer";

/**
 * GET /api/smtp/verify
 *   Verifica la configuración SMTP sin enviar nada. Útil como botón "test connection"
 *   antes de lanzar un envío masivo.
 */
export async function GET() {
  try {
    await requireRole(["ADMIN", "OPERATOR"]);
    const result = await verifySmtp();
    return ok(result);
  } catch (e) { return handle(e); }
}
