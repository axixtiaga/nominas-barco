import { prisma } from "../prisma";
import { normalizeRawName } from "./species-normalizer";

/**
 * Sugeridor automático de equivalencias.
 *
 * Estrategia:
 *   1) Saca todos los rawSpeciesName distintos de InvoiceLine que NO tienen
 *      ya una equivalencia (ni global ni del puerto donde aparecen).
 *   2) Para cada raw name, intenta encajarlo:
 *      a) Contra otras equivalencias EXISTENTES (las que el usuario ya creó):
 *         si hay una con el mismo rawName normalizado en otro puerto, o muy
 *         parecido (Levenshtein ≤ 2), reusa su speciesId. Esto es lo más
 *         fiable porque ya está validado por el usuario.
 *      b) Contra Species.commonName, scientificName y code (normalizados).
 *   3) Devuelve cada sugerencia con un nivel de confianza HIGH / MEDIUM / LOW
 *      y la "razón" para que el usuario entienda por qué se le propone.
 *
 * Niveles de confianza:
 *   HIGH   — coincidencia exacta (rawName ya mapeado en otra equivalencia, o
 *            coincide con commonName/scientificName/code de una especie).
 *   MEDIUM — una cadena contiene a la otra (≥ 4 caracteres) o Levenshtein ≤ 2.
 *   LOW    — Levenshtein 3..4 (probable pero hay que verificar).
 */

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type Suggestion = {
  rawName: string;             // tal y como aparece en InvoiceLine.rawSpeciesName (caso original más frecuente)
  rawNameNormalized: string;   // normalizado (upper, sin acentos)
  occurrences: number;         // cuántas líneas usan este rawName
  portIds: string[];           // puertos donde aparece (para sugerir scope=PORT si es de uno solo)
  portNames: string[];         // nombres legibles de esos puertos
  speciesId: string | null;
  speciesCode: string | null;
  speciesCommonName: string | null;
  confidence: Confidence | null;   // null si no hubo sugerencia
  reason: string | null;
};

/** Devuelve las sugerencias para todas las líneas sin equivalencia. */
export async function generateSuggestions(): Promise<Suggestion[]> {
  // 1) Cargo el corpus base: especies y equivalencias existentes
  const [species, eqs, lines] = await Promise.all([
    prisma.species.findMany({
      where: { active: true },
      select: { id: true, code: true, commonName: true, scientificName: true }
    }),
    prisma.speciesEquivalence.findMany({
      where: { active: true },
      select: { rawName: true, speciesId: true, portId: true }
    }),
    prisma.invoiceLine.findMany({
      select: {
        rawSpeciesName: true,
        invoice: { select: { portId: true, port: { select: { name: true } } } }
      }
    })
  ]);

  // 2) Index de equivalencias por rawName normalizado → speciesId
  const eqByRaw = new Map<string, string>();
  for (const e of eqs) {
    if (!eqByRaw.has(e.rawName)) eqByRaw.set(e.rawName, e.speciesId);
  }
  const knownRawNames = Array.from(eqByRaw.keys());

  // 3) Index de especies por commonName/scientificName/code normalizados
  type SpeciesIndexEntry = { id: string; code: string; commonName: string; key: string; field: string };
  const speciesIndex: SpeciesIndexEntry[] = [];
  for (const sp of species) {
    speciesIndex.push({ id: sp.id, code: sp.code, commonName: sp.commonName, key: normalizeRawName(sp.commonName), field: "commonName" });
    if (sp.scientificName) speciesIndex.push({ id: sp.id, code: sp.code, commonName: sp.commonName, key: normalizeRawName(sp.scientificName), field: "scientificName" });
    speciesIndex.push({ id: sp.id, code: sp.code, commonName: sp.commonName, key: normalizeRawName(sp.code), field: "code" });
  }
  const speciesById = new Map(species.map(sp => [sp.id, sp]));

  // 4) Agrupo las líneas: rawNameNormalizado → { rawNameOriginal+, count, portIds }
  type Acc = {
    rawName: string;                // primer caso original visto (más legible que el normalizado)
    occurrences: number;
    portIds: Set<string>;
    portNames: Set<string>;
    hasEquivalence: boolean;        // si ya está mapeado para alguno de sus puertos
  };
  const grouped = new Map<string, Acc>();
  for (const ln of lines) {
    const key = normalizeRawName(ln.rawSpeciesName);
    if (!key) continue;
    const portId = ln.invoice?.portId ?? null;
    const portName = ln.invoice?.port?.name ?? "";
    const cur = grouped.get(key);
    if (cur) {
      cur.occurrences++;
      if (portId) cur.portIds.add(portId);
      if (portName) cur.portNames.add(portName);
    } else {
      grouped.set(key, {
        rawName: ln.rawSpeciesName.trim(),
        occurrences: 1,
        portIds: portId ? new Set([portId]) : new Set(),
        portNames: portName ? new Set([portName]) : new Set(),
        hasEquivalence: false
      });
    }
  }

  // 5) Marca cuáles ya tienen equivalencia (consultando si existe alguna que cubra el rawName)
  //    Una raw queda "cubierta" si hay una equivalencia GLOBAL o una de uno de sus puertos.
  const eqByPair = new Map<string, string>(); // `${raw}|${portId ?? "GLOBAL"}` → speciesId
  for (const e of eqs) {
    eqByPair.set(`${e.rawName}|${e.portId ?? "GLOBAL"}`, e.speciesId);
  }
  for (const [key, acc] of grouped.entries()) {
    if (eqByPair.has(`${key}|GLOBAL`)) { acc.hasEquivalence = true; continue; }
    let allCovered = acc.portIds.size > 0;
    for (const pid of acc.portIds) {
      if (!eqByPair.has(`${key}|${pid}`)) { allCovered = false; break; }
    }
    if (allCovered && acc.portIds.size > 0) acc.hasEquivalence = true;
  }

  // 6) Para los que NO tienen equivalencia, genera sugerencia
  const suggestions: Suggestion[] = [];
  for (const [normalizedKey, acc] of grouped.entries()) {
    if (acc.hasEquivalence) continue;
    const sug = matchAgainstCorpus(normalizedKey, eqByRaw, knownRawNames, speciesIndex, speciesById);
    suggestions.push({
      rawName: acc.rawName,
      rawNameNormalized: normalizedKey,
      occurrences: acc.occurrences,
      portIds: Array.from(acc.portIds),
      portNames: Array.from(acc.portNames),
      speciesId: sug?.speciesId ?? null,
      speciesCode: sug?.speciesCode ?? null,
      speciesCommonName: sug?.speciesCommonName ?? null,
      confidence: sug?.confidence ?? null,
      reason: sug?.reason ?? null
    });
  }

  // 7) Ordena: primero las de mayor confianza, luego por nº de ocurrencias
  const order: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  suggestions.sort((a, b) => {
    const oa = a.confidence ? order[a.confidence] : 0;
    const ob = b.confidence ? order[b.confidence] : 0;
    if (ob !== oa) return ob - oa;
    return b.occurrences - a.occurrences;
  });

  return suggestions;
}

/** Busca el mejor match para `key` contra equivalencias existentes y especies. */
function matchAgainstCorpus(
  key: string,
  eqByRaw: Map<string, string>,
  knownRawNames: string[],
  speciesIndex: Array<{ id: string; code: string; commonName: string; key: string; field: string }>,
  speciesById: Map<string, { id: string; code: string; commonName: string }>
): { speciesId: string; speciesCode: string; speciesCommonName: string; confidence: Confidence; reason: string } | null {

  // a) Match exacto contra equivalencia existente (HIGH)
  const direct = eqByRaw.get(key);
  if (direct) {
    const sp = speciesById.get(direct);
    if (sp) return {
      speciesId: sp.id, speciesCode: sp.code, speciesCommonName: sp.commonName,
      confidence: "HIGH", reason: `Coincide exacto con equivalencia ya creada para "${key}"`
    };
  }

  // b) Match exacto contra commonName / scientificName / code de Species (HIGH)
  const directSpecies = speciesIndex.find(s => s.key === key);
  if (directSpecies) {
    return {
      speciesId: directSpecies.id, speciesCode: directSpecies.code, speciesCommonName: directSpecies.commonName,
      confidence: "HIGH", reason: `Coincide con ${directSpecies.field} "${directSpecies.key}" de la especie`
    };
  }

  // c) Substring (≥4 chars) o Levenshtein ≤ 2 contra equivalencias existentes (MEDIUM)
  let best: { speciesId: string; speciesCode: string; speciesCommonName: string; conf: Confidence; reason: string; score: number } | null = null;
  for (const known of knownRawNames) {
    if (key === known) continue; // ya cubierto por (a)
    const reason = compareKeys(key, known);
    if (!reason) continue;
    const sp = speciesById.get(eqByRaw.get(known)!);
    if (!sp) continue;
    const cand = {
      speciesId: sp.id, speciesCode: sp.code, speciesCommonName: sp.commonName,
      conf: reason.confidence, reason: `${reason.text} (vs equivalencia "${known}")`,
      score: reason.score
    };
    if (!best || cand.score > best.score) best = cand;
  }

  // d) Substring/Levenshtein contra Species (puede mejorar a (c))
  for (const s of speciesIndex) {
    if (s.key === key) continue;
    const reason = compareKeys(key, s.key);
    if (!reason) continue;
    const cand = {
      speciesId: s.id, speciesCode: s.code, speciesCommonName: s.commonName,
      conf: reason.confidence, reason: `${reason.text} (vs ${s.field} "${s.key}")`,
      score: reason.score
    };
    if (!best || cand.score > best.score) best = cand;
  }

  if (best) {
    return {
      speciesId: best.speciesId,
      speciesCode: best.speciesCode,
      speciesCommonName: best.speciesCommonName,
      confidence: best.conf,
      reason: best.reason
    };
  }
  return null;
}

/**
 * Compara dos claves normalizadas y devuelve confianza + score (mayor = mejor)
 * o null si no hay match razonable.
 *
 * Reglas:
 *   - substring de ≥ 4 caracteres → MEDIUM, score 80
 *   - Levenshtein ≤ 2             → MEDIUM, score 70 + (longitud común / 10)
 *   - Levenshtein 3..4            → LOW,    score 50 + (longitud común / 10)
 */
function compareKeys(a: string, b: string): { confidence: Confidence; text: string; score: number } | null {
  const minLen = Math.min(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);

  // Substring (≥ 4 chars)
  if (minLen >= 4) {
    if (a.includes(b) || b.includes(a)) {
      return { confidence: "MEDIUM", text: `Una contiene a la otra`, score: 80 + minLen };
    }
  }
  // Si la diferencia de longitudes es enorme, no merece la pena calcular Levenshtein
  if (maxLen - minLen > 4) return null;
  // Levenshtein
  const dist = levenshtein(a, b);
  if (dist <= 2 && minLen >= 3) {
    return { confidence: "MEDIUM", text: `Distancia ${dist} (muy parecidos)`, score: 70 + minLen - dist };
  }
  if (dist <= 4 && minLen >= 4) {
    return { confidence: "LOW", text: `Distancia ${dist} (parecidos)`, score: 50 + minLen - dist };
  }
  return null;
}

/** Levenshtein clásico (DP). Suficientemente rápido para nombres cortos. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,         // insert
        prev[j] + 1,             // delete
        prev[j - 1] + cost       // substitute
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
