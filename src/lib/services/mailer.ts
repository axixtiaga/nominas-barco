/**
 * Servicio de envío de correo electrónico vía SMTP (nodemailer).
 *
 * Configuración por variables de entorno (.env):
 *   SMTP_HOST     — servidor SMTP. Por defecto: smtp.office365.com
 *   SMTP_PORT     — puerto. Por defecto: 587 (STARTTLS)
 *   SMTP_SECURE   — "true" para SSL/TLS directo (puerto 465); "false" para STARTTLS (587)
 *   SMTP_USER     — email/usuario para autenticarse (ej. tucuenta@outlook.com)
 *   SMTP_PASS     — contraseña o app password
 *   SMTP_FROM     — remitente que aparece en los correos. Por defecto: SMTP_USER
 *   SMTP_FROM_NAME — nombre legible del remitente. Por defecto: "Itsas Lagunak"
 *
 * Para Outlook personal (outlook.com / hotmail.com / live.com):
 *   SMTP_HOST=smtp-mail.outlook.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=false
 *
 * Para Office 365 corporativo:
 *   SMTP_HOST=smtp.office365.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=false
 *   (Puede requerir habilitar SMTP AUTH en el tenant: PowerShell
 *    Set-CASMailbox -Identity <user> -SmtpClientAuthenticationDisabled $false)
 */

// Importación dinámica de nodemailer para que la app arranque aunque no esté
// instalado todavía. Si el usuario no ha hecho `npm install nodemailer`, dará
// un error claro solo cuando intente enviar un email.
type Transporter = any;

let cachedTransporter: Transporter | null = null;
let nodemailerLib: any = null;

async function getNodemailer() {
  if (nodemailerLib) return nodemailerLib;
  try {
    nodemailerLib = await import("nodemailer");
    return nodemailerLib;
  } catch (e) {
    throw new Error(
      'Falta el paquete "nodemailer". Ejecuta:\n  npm install nodemailer @types/nodemailer'
    );
  }
}

async function getTransporter(): Promise<Transporter> {
  if (cachedTransporter) return cachedTransporter;
  const nm = await getNodemailer();

  const host = process.env.SMTP_HOST ?? "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const secure = (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error(
      "Configuración SMTP incompleta. Define SMTP_USER y SMTP_PASS en .env\n" +
      "Para Outlook personal usa también:\n" +
      "  SMTP_HOST=smtp-mail.outlook.com\n  SMTP_PORT=587\n  SMTP_SECURE=false"
    );
  }

  cachedTransporter = nm.createTransport({
    host, port, secure,
    auth: { user, pass },
    // Office 365 / Outlook a veces piden TLS minimum 1.2
    tls: { ciphers: "TLSv1.2" }
  });
  return cachedTransporter;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
  const transporter = await getTransporter();
  const fromUser = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
  const fromName = process.env.SMTP_FROM_NAME ?? "Itsas Lagunak";
  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromUser}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments
  });
  return { messageId: info.messageId };
}

/**
 * Verifica que la configuración SMTP es correcta sin enviar nada.
 * Útil para un endpoint de "test connection" en la UI.
 */
export async function verifySmtp(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const transporter = await getTransporter();
    await transporter.verify();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
