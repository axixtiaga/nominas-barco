/**
 * Script CLI de backup. Ejecuta un backup de la base de datos y rota los
 * antiguos. Pensado para usarse:
 *   - Manualmente: `npm run backup`
 *   - Desde una tarea programada de Windows (cada noche a las 3:00 AM)
 *
 * Sale con código 0 si todo va bien, 1 si hubo error.
 */
import "dotenv/config";
import { runBackup, readBackupConfig } from "../src/lib/services/backup";

async function main() {
  const cfg = await readBackupConfig();
  console.log("── Backup de Itsas Lagunak ──────────────");
  console.log("Carpeta destino:    ", cfg.folder || "(no configurada)");
  console.log("Días de retención:  ", cfg.retentionDays);
  console.log("pg_dump:            ", cfg.pgDumpPath);
  console.log("Base de datos:      ", `${cfg.database.user}@${cfg.database.host}:${cfg.database.port}/${cfg.database.name}`);
  console.log("─────────────────────────────────────────");

  const t0 = Date.now();
  const r = await runBackup(cfg);
  if (!r.ok) {
    console.error("❌ Backup FALLÓ:", r.error);
    process.exit(1);
  }
  const sizeMb = ((r.sizeBytes ?? 0) / (1024 * 1024)).toFixed(2);
  const seconds = ((r.durationMs ?? 0) / 1000).toFixed(1);
  console.log(`✅ Backup OK: ${r.filename} (${sizeMb} MB) en ${seconds}s`);
  if (r.rotatedDeleted && r.rotatedDeleted > 0) {
    console.log(`🗑  Rotación: borrados ${r.rotatedDeleted} backups antiguos (>${cfg.retentionDays} días).`);
  }
  console.log(`Duración total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
