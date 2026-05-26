/**
 * Diagnóstico de auto-clasificación CAPTURA/GASTO.
 *
 * Lee un PDF, extrae su texto y muestra qué decidiría el clasificador
 * (sin importar nada a la base de datos).
 *
 * Uso:
 *   npx tsx scripts/classify-pdf.ts "C:\\ruta\\al\\archivo.pdf"
 *   o:  npm run classify -- "C:\\ruta\\al\\archivo.pdf"
 */
import "dotenv/config";
import fs from "node:fs/promises";
import { extractPdfText } from "../src/lib/parsers/pdf-text";
import { classifyKind } from "../src/lib/services/classify-kind";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npx tsx scripts/classify-pdf.ts \"ruta\\al\\archivo.pdf\"");
    process.exit(1);
  }

  const buf = await fs.readFile(file);
  const text = await extractPdfText(buf);
  const result = await classifyKind(text);

  console.log("── Clasificación ─────────────────────────────");
  console.log(`Archivo:     ${file}`);
  console.log(`TIPO:        ${result.kind}`);
  console.log(`Confianza:   ${result.confidence}`);
  console.log(`Motivo:      ${result.reason}`);
  console.log("── Señales ───────────────────────────────────");
  console.log(`Parser captura:        ${result.signals.captureParserKey ?? "(ninguno)"}`);
  console.log(`Líneas captura:        ${result.signals.captureLines}`);
  console.log(`Parser gasto:          ${result.signals.expenseParserKey ?? "(ninguno)"}`);
  console.log(`Palabras clave captura: ${result.signals.captureKeywordHits}`);
  console.log(`Palabras clave gasto:   ${result.signals.gastoKeywordHits}`);
  console.log("──────────────────────────────────────────────");
}

main().catch(e => { console.error(e); process.exit(1); });
