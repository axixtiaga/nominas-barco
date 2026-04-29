import { prisma } from "../prisma";
import { ParserHandler, ParserContext } from "./base";
import { registry } from "./index";

/**
 * Dado el texto de un PDF, decide qué parser usar.
 * Reglas de resolución:
 * 1) Si un DocumentFormat activo tiene signatures en su config y todas están presentes → se elige.
 * 2) En caso contrario, se recorre el registry y se usa el primer parser cuyo matches() devuelva true.
 * 3) El parser "generic" es siempre el último recurso (matches siempre true).
 */
export async function resolveParser(rawText: string): Promise<{ handler: ParserHandler; formatId: string | null; config: Record<string, unknown> }> {
  const formats = await prisma.documentFormat.findMany({ where: { active: true } });
  const upper = rawText.toUpperCase();

  // 1) por signatures configuradas
  for (const f of formats) {
    const cfg = (f.config as any) ?? {};
    const sigs: string[] | undefined = cfg.signatures;
    if (sigs && sigs.length) {
      const hit = sigs.every(s => upper.includes(String(s).toUpperCase()));
      if (hit) {
        const handler = registry[f.parserKey] ?? registry["generic"];
        return { handler, formatId: f.id, config: cfg };
      }
    }
  }

  // 2) matches() del propio parser
  for (const f of formats) {
    const handler = registry[f.parserKey];
    if (!handler || handler.key === "generic") continue;
    const ctx: ParserContext = { rawText, formatConfig: (f.config as any) ?? {} };
    if (handler.matches(ctx)) return { handler, formatId: f.id, config: ctx.formatConfig ?? {} };
  }

  // 3) genérico
  const generic = formats.find(f => f.parserKey === "generic");
  return { handler: registry["generic"], formatId: generic?.id ?? null, config: {} };
}
