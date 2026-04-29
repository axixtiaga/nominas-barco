import { ok, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";

/**
 * GET /api/smtp/diag
 *   Diagnóstico: muestra qué variables de entorno SMTP está leyendo el servidor.
 *   La contraseña se enmascara para no exponerla en la respuesta.
 *   Útil para depurar problemas de configuración.
 */
export async function GET() {
  try {
    await requireRole(["ADMIN", "OPERATOR"]);
    const pass = process.env.SMTP_PASS;
    const user = process.env.SMTP_USER;
    return ok({
      SMTP_HOST: process.env.SMTP_HOST ?? "(no definido)",
      SMTP_PORT: process.env.SMTP_PORT ?? "(no definido)",
      SMTP_SECURE: process.env.SMTP_SECURE ?? "(no definido)",
      SMTP_USER: user ?? "(no definido)",
      SMTP_USER_length: user ? user.length : 0,
      SMTP_USER_has_whitespace: user ? /\s/.test(user) : false,
      SMTP_USER_trim_equals: user ? user === user.trim() : true,
      SMTP_PASS_length: pass ? pass.length : 0,
      SMTP_PASS_has_spaces: pass ? /\s/.test(pass) : false,
      SMTP_PASS_first2_last2: pass && pass.length >= 4 ? `${pass.slice(0, 2)}***${pass.slice(-2)}` : "(vacío)",
      SMTP_PASS_only_lowercase_letters: pass ? /^[a-z]+$/.test(pass) : false,
      SMTP_FROM: process.env.SMTP_FROM ?? "(no definido)",
      SMTP_FROM_NAME: process.env.SMTP_FROM_NAME ?? "(no definido)"
    });
  } catch (e) { return handle(e); }
}
