/**
 * Script independiente que arranca el watcher de la carpeta de Dropbox.
 * Ejecutar con: npm run watch
 * Diseñado para correr como proceso separado de `npm run dev`.
 */
import "dotenv/config";
import { startWatcher, state, persistState, readWatcherConfig } from "../src/lib/services/folder-watcher";

async function main() {
  const cfg = readWatcherConfig();
  console.log("── Watcher de Itsas Lagunak ─────────────");
  console.log("Capturas (PDFs):       ", cfg.folder);
  console.log("Gastos (PDFs):         ", cfg.gastosFolder ?? "(no configurada)");
  console.log("Seg. Social (Excel):   ", cfg.ssFolder ?? "(no configurada)");
  console.log("Recursivo:", cfg.recursive);
  console.log("portHint desde subcarpeta:", cfg.portHintFromSubfolder);
  console.log("Estabilidad (ms):", cfg.stabilityMs);
  console.log("─────────────────────────────────────────");

  await startWatcher(cfg);

  // Persiste estado cada 3s para que la UI (API) pueda leerlo
  setInterval(() => { persistState().catch(() => {}); }, 3000);

  // Log periódico
  setInterval(() => {
    const c = state.counters;
    process.stdout.write(`\r[${new Date().toISOString()}] picked=${c.picked} imported=${c.imported} dup=${c.duplicated} failed=${c.failed}    `);
  }, 5000);
}

main().catch(e => { console.error(e); process.exit(1); });

process.on("SIGINT", () => { console.log("\n[watcher] deteniendo..."); process.exit(0); });
process.on("SIGTERM", () => process.exit(0));
