import { prisma } from "../prisma";

/** Normaliza un nombre crudo de especie para comparar: upper, sin dobles espacios, sin acentos. */
export function normalizeRawName(raw: string): string {
  return raw
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resuelve una denominación cruda → speciesId aplicando equivalencias.
 * Prioridad: equivalencia específica del puerto > equivalencia GLOBAL.
 * Devuelve null si no hay equivalencia: el usuario la creará manualmente.
 */
export async function resolveSpeciesId(rawName: string, portId: string | null): Promise<string | null> {
  const key = normalizeRawName(rawName);
  if (!key) return null;

  if (portId) {
    const specific = await prisma.speciesEquivalence.findFirst({
      where: { rawName: key, portId, active: true }
    });
    if (specific) return specific.speciesId;
  }
  const global = await prisma.speciesEquivalence.findFirst({
    where: { rawName: key, portId: null, active: true }
  });
  return global?.speciesId ?? null;
}

/** Resuelve en batch (útil para importar muchas líneas sin N+1 excesivo). */
export async function resolveMany(
  rawNames: string[], portId: string | null
): Promise<Map<string, string | null>> {
  const keys = Array.from(new Set(rawNames.map(normalizeRawName).filter(Boolean)));
  const where = portId
    ? { active: true, OR: [{ portId, rawName: { in: keys } }, { portId: null, rawName: { in: keys } }] }
    : { active: true, portId: null, rawName: { in: keys } };
  const eqs = await prisma.speciesEquivalence.findMany({ where });
  const out = new Map<string, string | null>();
  for (const k of keys) {
    const specific = eqs.find(e => e.rawName === k && e.portId === portId);
    const global = eqs.find(e => e.rawName === k && e.portId === null);
    out.set(k, specific?.speciesId ?? global?.speciesId ?? null);
  }
  return out;
}
