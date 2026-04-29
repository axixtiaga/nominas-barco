/**
 * Servicio de backup de la base de datos PostgreSQL.
 *
 * Usa pg_dump.exe (parte de la instalación de PostgreSQL) para crear una copia
 * comprimida de toda la base de datos. La copia se guarda en BACKUP_FOLDER con
 * un nombre que incluye la fecha y hora: capturas-YYYY-MM-DD-HHMMSS.dump
 *
 * Configuración (.env):
 *   BACKUP_FOLDER          — carpeta donde guardar las copias
 *   BACKUP_RETENTION_DAYS  — días de retención (por defecto 30)
 *   PG_DUMP_PATH           — ruta de pg_dump.exe (autodetecta si no está)
 *   DATABASE_URL           — conexión a la BD (ya configurada para Prisma)
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export type BackupConfig = {
  folder: string;
  retentionDays: number;
  pgDumpPath: string;
  database: { host: string; port: number; user: string; password: string; name: string };
};

export type BackupResult = {
  ok: boolean;
  filename?: string;
  fullPath?: string;
  sizeBytes?: number;
  durationMs?: number;
  error?: string;
  rotatedDeleted?: number;
};

export type BackupFileInfo = {
  filename: string;
  fullPath: string;
  sizeBytes: number;
  createdAt: Date;
  ageDays: number;
};

/** Lee la configuración del .env, autodetectando pg_dump si hace falta o si la ruta configurada no existe. */
export async function readBackupConfig(): Promise<BackupConfig> {
  const folder = process.env.BACKUP_FOLDER ?? "";
  const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS ?? "30", 10);
  // Si está definido PG_DUMP_PATH, lo usamos solo si el fichero existe;
  // si no existe, hacemos fallback al autodetector. Esto evita que un PG_DUMP_PATH
  // mal configurado impida usar una versión de Postgres correctamente instalada.
  let pgDumpPath = process.env.PG_DUMP_PATH || "";
  if (pgDumpPath) {
    try { await fs.access(pgDumpPath); } catch { pgDumpPath = ""; }
  }
  if (!pgDumpPath) pgDumpPath = await findPgDump();
  const db = parseDatabaseUrl(process.env.DATABASE_URL ?? "");
  return { folder, retentionDays, pgDumpPath, database: db };
}

/**
 * Busca pg_dump.exe en rutas típicas de instalación de PostgreSQL en Windows.
 * Maneja también versiones tipo "17.2" (con número de revisión).
 */
async function findPgDump(): Promise<string> {
  const baseDirs = [
    "C:\\Program Files\\PostgreSQL",
    "C:\\Program Files (x86)\\PostgreSQL",
    "C:\\PostgreSQL"
  ];
  const candidates: string[] = [];
  for (const base of baseDirs) {
    try {
      const entries = await fs.readdir(base, { withFileTypes: true });
      // Ordena por nombre desc para que las versiones más altas vayan primero
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const d of dirs) {
        candidates.push(`${base}\\${d}\\bin\\pg_dump.exe`);
      }
    } catch {}
  }
  for (const c of candidates) {
    try { await fs.access(c); return c; } catch {}
  }
  // Último recurso: que esté en el PATH del sistema
  return "pg_dump";
}

/** Parsea DATABASE_URL del estilo postgresql://user:pass@host:port/dbname?... */
function parseDatabaseUrl(url: string) {
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:\/]+):(\d+)\/([^?]+)/);
  if (!m) {
    return { host: "localhost", port: 5432, user: "postgres", password: "", name: "capturas" };
  }
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(m[2]),
    host: m[3],
    port: parseInt(m[4], 10),
    name: decodeURIComponent(m[5])
  };
}

/** Crea un timestamp YYYY-MM-DD-HHMMSS para nombrar el fichero. */
function timestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    "-",
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join("").replace(/(\d{4})(\d{2})(\d{2})-(\d{6})/, "$1-$2-$3-$4");
}

/**
 * Ejecuta un backup de la base de datos. Devuelve metadata del fichero creado
 * y, opcionalmente, el número de backups antiguos eliminados por la rotación.
 */
export async function runBackup(cfg: BackupConfig = null as any): Promise<BackupResult> {
  if (!cfg) cfg = await readBackupConfig();
  if (!cfg.folder) return { ok: false, error: "BACKUP_FOLDER no configurado en .env" };

  // Asegurar carpeta
  try { await fs.mkdir(cfg.folder, { recursive: true }); } catch (e: any) {
    return { ok: false, error: `No se puede crear/acceder a la carpeta de backup: ${e?.message}` };
  }

  const filename = `capturas-${timestamp()}.dump`;
  const fullPath = path.join(cfg.folder, filename);

  const args = [
    `--host=${cfg.database.host}`,
    `--port=${cfg.database.port}`,
    `--username=${cfg.database.user}`,
    `--dbname=${cfg.database.name}`,
    "--format=custom",
    "--compress=9",
    `--file=${fullPath}`
  ];

  const env = { ...process.env, PGPASSWORD: cfg.database.password };
  const start = Date.now();

  return await new Promise<BackupResult>(resolve => {
    const proc = spawn(cfg.pgDumpPath, args, { env, windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", d => { stderr += d.toString(); });
    proc.on("error", err => {
      resolve({ ok: false, error: `No se pudo ejecutar pg_dump: ${err.message}. ¿Está bien la ruta PG_DUMP_PATH?` });
    });
    proc.on("close", async code => {
      if (code !== 0) {
        resolve({ ok: false, error: `pg_dump falló (código ${code}). Detalle:\n${stderr.slice(0, 500)}` });
        return;
      }
      try {
        const stat = await fs.stat(fullPath);
        const rotated = await rotateOldBackups(cfg);
        resolve({
          ok: true, filename, fullPath,
          sizeBytes: stat.size,
          durationMs: Date.now() - start,
          rotatedDeleted: rotated
        });
      } catch (e: any) {
        resolve({ ok: false, error: `Backup terminó pero el fichero no existe: ${e?.message}` });
      }
    });
  });
}

/** Borra los backups con más de cfg.retentionDays días. Devuelve cuántos se borraron. */
export async function rotateOldBackups(cfg: BackupConfig): Promise<number> {
  if (!cfg.folder || cfg.retentionDays <= 0) return 0;
  const cutoff = Date.now() - cfg.retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  try {
    const entries = await fs.readdir(cfg.folder, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!/^capturas-.*\.dump$/.test(e.name)) continue;
      const full = path.join(cfg.folder, e.name);
      try {
        const stat = await fs.stat(full);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(full);
          deleted++;
        }
      } catch {}
    }
  } catch {}
  return deleted;
}

/** Lista los backups existentes en la carpeta, ordenados por fecha desc. */
export async function listBackups(cfg: BackupConfig = null as any): Promise<BackupFileInfo[]> {
  if (!cfg) cfg = await readBackupConfig();
  if (!cfg.folder) return [];
  try { await fs.access(cfg.folder); } catch { return []; }
  const entries = await fs.readdir(cfg.folder, { withFileTypes: true });
  const now = Date.now();
  const files: BackupFileInfo[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/^capturas-.*\.dump$/.test(e.name)) continue;
    const full = path.join(cfg.folder, e.name);
    try {
      const stat = await fs.stat(full);
      files.push({
        filename: e.name,
        fullPath: full,
        sizeBytes: stat.size,
        createdAt: stat.mtime,
        ageDays: Math.floor((now - stat.mtimeMs) / (24 * 60 * 60 * 1000))
      });
    } catch {}
  }
  files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return files;
}
