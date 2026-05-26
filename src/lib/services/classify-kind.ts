import { resolveParser } from "../parsers/classifier";
import { expenseRegistry } from "../expense-parsers";

export type ClassifiedKind = "CAPTURA" | "GASTO" | "UNKNOWN";

export type KindClassification = {
  kind: ClassifiedKind;
  confidence: "high" | "medium" | "low";
  reason: string;
  signals: {
    captureParserKey: string | null;
    captureLines: number;
    expenseParserKey: string | null;
    captureKeywordHits: number;
    gastoKeywordHits: number;
  };
};

// Palabras clave típicas de una venta de pescado (captura / ingreso).
const CAPTURE_KEYWORDS = [
  "POLIZA PESCA SUBASTADA", "PESCA SUBASTADA", "LISTA DE COMPRAS",
  "NOTA DE VENTA", "SUBASTA", "LONJA", "RULA", "VENTA EN PRIMERA",
  "FACTURACION POR EL DESTINATARIO", "FACTURACIÓN POR EL DESTINATARIO",
  "EMBARCACION", "EMBARCACIÓN", "MAREA"
];

// Palabras clave típicas de un gasto (combustible, hielo, víveres, suministros…).
const GASTO_KEYWORDS = [
  "FACTURA DE GASTOS Y SERVICIOS", "GASOIL", "GASOLEO", "GASÓLEO",
  "COMBUSTIBLE", "CARBURANTE", "HIELO", "VIVERES", "VÍVERES",
  "SUMINISTRO", "SUMINISTROS", "APAREJOS", "REDES", "ADITIVO",
  "LUBRICANTE", "ACEITE", "REPUESTO", "ALQUILER", "CUOTA",
  "PALET", "CAJA PLASTICO", "CAJA PLÁSTICO", "MANTENIMIENTO",
  "REPARACION", "REPARACIÓN", "ELECTRICIDAD", "TELEFONO", "TELÉFONO"
];

function countKeywordHits(upperText: string, keywords: string[]): number {
  let hits = 0;
  for (const k of keywords) {
    if (upperText.includes(k)) hits++;
  }
  return hits;
}

/**
 * Clasifica un PDF como CAPTURA o GASTO mirando su CONTENIDO (no la carpeta).
 *
 * Estrategia (de más fiable a menos):
 *   1. Si un parser de captura extrae líneas de pescado válidas (especie+kilos+precio
 *      que cuadran) → CAPTURA con alta confianza. Un gasto nunca produce esas líneas.
 *   2. Si NO hay líneas de captura pero un parser de gasto específico reconoce el
 *      documento (firma concreta: CIF de proveedor, "FACTURA DE GASTOS Y SERVICIOS"…)
 *      → GASTO con alta confianza.
 *   3. Si ninguno de los dos es concluyente, se usa un conteo de palabras clave para
 *      dar una estimación (confianza media) o se devuelve UNKNOWN (baja).
 *
 * UNKNOWN significa "no estoy seguro": quien llama debe dejarlo pendiente de revisar
 * o usar la pista de la carpeta de origen.
 */
export async function classifyKind(rawText: string): Promise<KindClassification> {
  const upper = (rawText ?? "").toUpperCase();

  // ── 1) ¿Un parser de captura extrae líneas de pescado válidas? ──────────
  let captureParserKey: string | null = null;
  let captureLines = 0;
  try {
    const { handler, config } = await resolveParser(rawText);
    if (handler && handler.key !== "generic") {
      captureParserKey = handler.key;
      try {
        const parsed = handler.parse({ rawText, formatConfig: config, portHint: null });
        captureLines = Array.isArray(parsed?.lines) ? parsed.lines.length : 0;
      } catch { /* parse falló: 0 líneas */ }
    }
  } catch { /* sin parser de captura */ }

  // ── 2) ¿Coincide un parser de gasto específico (no el genérico)? ─────────
  let expenseParserKey: string | null = null;
  for (const p of expenseRegistry) {
    if (p.key === "generic-gasto") continue;
    try {
      if (p.matches({ rawText })) { expenseParserKey = p.key; break; }
    } catch { /* ignorar parser que peta en matches */ }
  }

  // ── 3) Conteo de palabras clave ─────────────────────────────────────────
  const captureKeywordHits = countKeywordHits(upper, CAPTURE_KEYWORDS);
  const gastoKeywordHits = countKeywordHits(upper, GASTO_KEYWORDS);

  const signals = {
    captureParserKey,
    captureLines,
    expenseParserKey,
    captureKeywordHits,
    gastoKeywordHits
  };

  // ── Reglas de decisión ──────────────────────────────────────────────────

  // (a) Líneas de pescado válidas → es una captura, casi seguro.
  if (captureLines > 0) {
    return {
      kind: "CAPTURA",
      confidence: "high",
      reason: `El parser "${captureParserKey}" extrajo ${captureLines} línea(s) de pescado válidas.`,
      signals
    };
  }

  // (b) Sin líneas de captura, pero un parser de gasto específico reconoce el doc.
  if (expenseParserKey) {
    return {
      kind: "GASTO",
      confidence: "high",
      reason: `Reconocido por el parser de gastos "${expenseParserKey}" y sin líneas de captura.`,
      signals
    };
  }

  // (c) Estimación por palabras clave si hay diferencia clara (≥2 de margen).
  if (gastoKeywordHits >= 2 && gastoKeywordHits > captureKeywordHits + 1) {
    return {
      kind: "GASTO",
      confidence: "medium",
      reason: `Palabras clave de gasto (${gastoKeywordHits}) superan a las de captura (${captureKeywordHits}).`,
      signals
    };
  }
  if (captureKeywordHits >= 2 && captureKeywordHits > gastoKeywordHits + 1) {
    return {
      kind: "CAPTURA",
      confidence: "medium",
      reason: `Palabras clave de captura (${captureKeywordHits}) superan a las de gasto (${gastoKeywordHits}).`,
      signals
    };
  }

  // (d) No concluyente.
  return {
    kind: "UNKNOWN",
    confidence: "low",
    reason: "No se pudo determinar con seguridad si es captura o gasto.",
    signals
  };
}
