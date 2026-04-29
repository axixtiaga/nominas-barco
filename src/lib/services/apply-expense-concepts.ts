import { prisma } from "../prisma";

/**
 * Aplica las reglas del maestro "Conceptos de gasto" (modelo ExpenseConcept) a un
 * gasto recién parseado. Mira cada regla por orden de `priority` desc y, en cuanto
 * encuentra una que case, aplica su `concept` y `category`.
 *
 * Esta capa va DESPUÉS del parser y ANTES de guardar en BD, así los 5 parsers de
 * gastos (santona, hondarribia-sanpedro, uranzu, sumipesca, generic) se benefician
 * sin tener que tocarlos uno por uno.
 *
 * Estrategia:
 *   - Para la cabecera del Expense (concept + category): mira proveedor y, si nada
 *     casa, mira el campo `concept` actual. Lo que encuentre primero gana.
 *   - Para cada línea: mira la descripción de esa línea. Si casa una regla,
 *     reescribe la `description` con el concepto bonito de la regla.
 *
 * No fuerza nada si no hay reglas que casen — el parser sigue mandando.
 */

type ExpenseConceptLite = {
  id: string;
  matchText: string;     // ya está en mayúsculas/sin acentos en BD si así lo guardó el usuario, pero por si acaso lo normalizamos
  matchField: "SUPPLIER" | "DESCRIPTION" | "ANY";
  concept: string;
  category: string;
  priority: number;
};

type ApplyInput = {
  /** Categoría que ya determinó el parser (puede ser sobrescrita por una regla). */
  category?: string;
  /** Texto del concepto que determinó el parser (puede ser sobrescrito). */
  concept?: string | null;
  /** Nombre del proveedor extraído del PDF (URANZU, SUMIPESCA, MOVISTAR…). */
  supplierName?: string | null;
  /** Líneas de detalle si las hay; cada una se inspecciona individualmente. */
  lines?: Array<{ description?: string | null }>;
};

type ApplyOutput = {
  category?: string;
  concept?: string | null;
  appliedRules: { ruleId: string; matchText: string; concept: string; category: string; appliedTo: "HEADER" | "LINE"; lineIndex?: number }[];
  /** Para cada línea: la nueva descripción y categoría/concepto sugeridos (la línea solo guarda description y, si quieres, los notes). */
  perLine: Array<{ description?: string | null; ruleConcept?: string | null; ruleCategory?: string | null }>;
};

const norm = (s: any) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Devuelve la primera regla que casa con el texto dado, mirando el campo indicado. */
function matchRule(text: string, rules: ExpenseConceptLite[], allowedFields: Array<"SUPPLIER" | "DESCRIPTION" | "ANY">): ExpenseConceptLite | null {
  if (!text) return null;
  const t = norm(text);
  for (const r of rules) {
    if (!allowedFields.includes(r.matchField)) continue;
    const needle = norm(r.matchText);
    if (!needle) continue;
    if (t.includes(needle)) return r;
  }
  return null;
}

/**
 * Carga las reglas (cacheadas durante 1 conversación de import — pero como el watcher
 * es proceso largo, conviene refrescar). Se ordenan por priority desc.
 */
async function loadRules(): Promise<ExpenseConceptLite[]> {
  const items = await prisma.expenseConcept.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
  });
  return items.map(i => ({
    id: i.id,
    matchText: i.matchText,
    matchField: i.matchField as any,
    concept: i.concept,
    category: i.category as unknown as string,
    priority: i.priority
  }));
}

/**
 * Punto de entrada principal. Recibe lo que el parser produjo y devuelve la versión
 * "enriquecida" con concepto/categoría según las reglas. NO toca BD; el llamante
 * decide qué guardar.
 */
export async function applyExpenseConceptRules(input: ApplyInput): Promise<ApplyOutput> {
  const rules = await loadRules();
  const out: ApplyOutput = {
    category: input.category,
    concept: input.concept ?? null,
    appliedRules: [],
    perLine: (input.lines ?? []).map(l => ({ description: l.description ?? null }))
  };
  if (rules.length === 0) return out;

  // ── Cabecera ─────────────────────────────────────────────────────────────
  // 1) Buscar por proveedor (SUPPLIER y ANY)
  const headerSupplierRule = matchRule(input.supplierName ?? "", rules, ["SUPPLIER", "ANY"]);
  // 2) Si no hay match por proveedor, intentar por el `concept` del parser (DESCRIPTION y ANY)
  const headerConceptRule = headerSupplierRule
    ? null
    : matchRule(input.concept ?? "", rules, ["DESCRIPTION", "ANY"]);
  const headerRule = headerSupplierRule ?? headerConceptRule;
  if (headerRule) {
    out.category = headerRule.category;
    out.concept = headerRule.concept;
    out.appliedRules.push({
      ruleId: headerRule.id, matchText: headerRule.matchText,
      concept: headerRule.concept, category: headerRule.category,
      appliedTo: "HEADER"
    });
  }

  // ── Líneas ───────────────────────────────────────────────────────────────
  if (input.lines && input.lines.length > 0) {
    input.lines.forEach((line, idx) => {
      const desc = line.description ?? "";
      // Una línea puede casar reglas de SUPPLIER (heredadas del proveedor) o DESCRIPTION/ANY (texto propio)
      const lineRule = matchRule(desc, rules, ["DESCRIPTION", "ANY"])
        ?? matchRule(input.supplierName ?? "", rules, ["SUPPLIER", "ANY"]);
      if (lineRule) {
        // Sobrescribe la descripción con el concepto bonito (preserva el original como nota más adelante)
        out.perLine[idx] = {
          description: lineRule.concept,
          ruleConcept: lineRule.concept,
          ruleCategory: lineRule.category
        };
        out.appliedRules.push({
          ruleId: lineRule.id, matchText: lineRule.matchText,
          concept: lineRule.concept, category: lineRule.category,
          appliedTo: "LINE", lineIndex: idx
        });
      }
    });
  }

  return out;
}
