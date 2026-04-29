import { ok, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { scanOnce, readWatcherConfig } from "@/lib/services/folder-watcher";
import { audit } from "@/lib/audit";

/**
 * Dispara un escaneo único de la carpeta configurada (bajo petición del usuario).
 * Útil cuando el proceso `npm run watch` no está corriendo pero se quiere
 * procesar los PDFs presentes en la carpeta.
 */
export async function POST() {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const cfg = readWatcherConfig();
    const res = await scanOnce(cfg);
    await audit({ userId: s.sub, entity: "Watcher", entityId: "manual-scan", action: "REPARSE", newValue: { folder: cfg.folder, ...res } });
    return ok(res);
  } catch (e) { return handle(e); }
}
