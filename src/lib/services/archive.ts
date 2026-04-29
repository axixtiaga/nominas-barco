import fs from "node:fs/promises";
import path from "node:path";

/**
 * Mueve un PDF desde su ubicación original (Dropbox) a la subcarpeta "revisado/",
 * preservando la ruta relativa dentro de la carpeta vigilada.
 *
 *   .../Capturas Txanteles/EMBFAC_xxx.pdf           →  .../Capturas Txanteles/revisado/EMBFAC_xxx.pdf
 *   .../Capturas Txanteles/Hondarribia/yyy.pdf      →  .../Capturas Txanteles/revisado/Hondarribia/yyy.pdf
 *
 * Reglas:
 *   - Si no hay WATCH_FOLDER, o el originalPath no está dentro, se aborta (no-op).
 *   - Si el fichero ya no existe, se ignora (pudo moverlo el usuario).
 *   - Si existe un fichero con el mismo nombre en destino, se añade un sufijo _N.
 *
 * Devuelve la ruta de destino final (o null si no se pudo mover).
 */
export async function moveToRevisado(originalPath: string | null): Promise<string | null> {
  if (!originalPath) return null;
  const candidates = [process.env.WATCH_FOLDER, process.env.GASTOS_FOLDER].filter(Boolean) as string[];

  // 1) Intento principal: ¿la originalPath está dentro de alguna de las carpetas vigiladas
  //    Y existe físicamente el archivo? Es lo habitual cuando nada se ha movido fuera.
  let watchFolder: string | null = null;
  let relative = "";
  let actualSourcePath = originalPath;

  for (const f of candidates) {
    const rel = path.relative(f, originalPath);
    if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
      watchFolder = f;
      relative = rel;
      break;
    }
  }

  // Si la originalPath no está dentro de las carpetas o el archivo ya no existe ahí
  // (típico: el usuario movió la carpeta de Dropbox a otra ruta), buscamos el archivo
  // por NOMBRE en las carpetas actuales.
  const originalExists = await exists(originalPath);
  if (!watchFolder || !originalExists) {
    const basename = path.basename(originalPath);
    for (const f of candidates) {
      const found = await findFileByName(f, basename);
      if (found) {
        watchFolder = f;
        relative = path.relative(f, found);
        actualSourcePath = found;
        break;
      }
    }
  }

  if (!watchFolder) return null;

  // Ya está en revisado: no-op.
  if (/(^|[\\\/])revisado[\\\/]/i.test(relative)) return actualSourcePath;

  // Comprueba existencia del origen real.
  try { await fs.access(actualSourcePath); } catch { return null; }

  const destBase = path.join(watchFolder, "revisado", relative);
  const destDir = path.dirname(destBase);
  await fs.mkdir(destDir, { recursive: true });

  let finalDest = destBase;
  let suffix = 1;
  while (await exists(finalDest)) {
    const ext = path.extname(destBase);
    const base = path.basename(destBase, ext);
    finalDest = path.join(destDir, `${base}_${suffix}${ext}`);
    suffix++;
    if (suffix > 100) return null;                 // safeguard
  }

  // Reintenta hasta 3 veces con pausa — útil cuando Dropbox está sincronizando
  // el fichero y Windows lo tiene momentáneamente bloqueado (EBUSY / EPERM).
  let lastErr: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fs.rename(actualSourcePath, finalDest);
      return finalDest;
    } catch (e: any) {
      lastErr = e;
      if (e?.code !== "EBUSY" && e?.code !== "EPERM" && e?.code !== "EACCES") throw e;
      await new Promise(r => setTimeout(r, attempt * 500));
    }
  }
  throw lastErr;
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

/** Busca recursivamente un archivo por nombre dentro de una carpeta, ignorando `revisado/`. */
async function findFileByName(folder: string, basename: string, depth: number = 5): Promise<string | null> {
  if (depth < 0) return null;
  let entries: any[] = [];
  try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) {
      if (e.name.toLowerCase() === "revisado") continue;
      const sub = await findFileByName(path.join(folder, e.name), basename, depth - 1);
      if (sub) return sub;
    } else if (e.isFile() && e.name === basename) {
      return path.join(folder, e.name);
    }
  }
  return null;
}
