import chokidar, { FSWatcher } from "chokidar";
import fs from "node:fs/promises";
import path from "node:path";
import { importPdf } from "./import-document";
import { importSsExcel } from "./import-ss-excel";

export type DocumentKindForWatcher = "CAPTURA" | "GASTO" | "SS";

export type WatcherConfig = {
  /** Carpeta vigilada para Capturas (PDFs de cofradías). */
  folder: string;
  /** Carpeta opcional vigilada para Gastos (facturas de gastos de cofradías + proveedores varios). */
  gastosFolder?: string;
  /** Carpeta opcional vigilada para Seguridad Social (Excels mensuales). */
  ssFolder?: string;
  recursive: boolean;
  portHintFromSubfolder: boolean;
  stabilityMs: number;
};

export type WatcherState = {
  running: boolean;
  config: WatcherConfig | null;
  startedAt: Date | null;
  lastEvent: { at: Date; kind: "added" | "imported" | "duplicated" | "failed"; file: string; message?: string; folderKind?: DocumentKindForWatcher } | null;
  counters: { picked: number; imported: number; duplicated: number; failed: number };
};

export const state: WatcherState = {
  running: false,
  config: null,
  startedAt: null,
  lastEvent: null,
  counters: { picked: 0, imported: 0, duplicated: 0, failed: 0 }
};

let watchers: FSWatcher[] = [];

export function readWatcherConfig(): WatcherConfig {
  return {
    folder: process.env.WATCH_FOLDER ?? "",
    gastosFolder: process.env.GASTOS_FOLDER || undefined,
    ssFolder: process.env.SS_FOLDER || undefined,
    recursive: (process.env.WATCH_RECURSIVE ?? "true").toLowerCase() === "true",
    portHintFromSubfolder: (process.env.WATCH_PORT_HINT_FROM_SUBFOLDER ?? "true").toLowerCase() === "true",
    stabilityMs: Number(process.env.WATCH_STABILITY_MS ?? 1500)
  };
}

export function isUnderRevisado(file: string): boolean {
  const parts = file.split(/[\\\/]+/);
  return parts.some(p => p.toLowerCase() === "revisado");
}

/** Deriva un portHint solo aplicable a la carpeta de Capturas (subcarpeta == puerto). */
export function portHintFor(file: string, baseFolder: string, enabled: boolean): string | null {
  if (!enabled) return null;
  try {
    const rel = path.relative(baseFolder, file);
    const parts = rel.split(path.sep).filter(Boolean);
    if (parts.length < 2) return null;
    return parts[0];
  } catch { return null; }
}

async function processFile(file: string, baseFolder: string, kind: DocumentKindForWatcher, cfg: WatcherConfig) {
  // Tipos de fichero permitidos según el destino
  const lower = file.toLowerCase();
  if (kind === "SS") {
    if (!(lower.endsWith(".xlsx") || lower.endsWith(".xls"))) return;
  } else {
    if (!lower.endsWith(".pdf")) return;
  }
  if (isUnderRevisado(file)) return;
  state.counters.picked++;
  state.lastEvent = { at: new Date(), kind: "added", file, folderKind: kind };

  try {
    const buf = await fs.readFile(file);
    if (kind === "SS") {
      // Excel mensual de Seguridad Social
      const res = await importSsExcel({
        buffer: buf,
        filename: path.basename(file),
        userId: null
      });
      if (!res.ok) {
        state.counters.failed++;
        state.lastEvent = { at: new Date(), kind: "failed", file, folderKind: kind, message: res.error ?? "Error" };
        console.error(`[watcher:SS] ${res.error}`);
        return;
      }
      state.counters.imported++;
      const s = res.summary!;
      state.lastEvent = {
        at: new Date(), kind: "imported", file, folderKind: kind,
        message: `mes=${res.month} importadas=${s.imported} actualizadas=${s.updated} sin_match=${s.skipped}`
      };
      return;
    }

    // PDF (Capturas / Gastos)
    const portHint = kind === "CAPTURA" ? portHintFor(file, baseFolder, cfg.portHintFromSubfolder) : null;
    const res = await importPdf({
      filename: path.basename(file),
      buffer: buf,
      uploaderId: null,
      portHint,
      kind,
      source: "watcher",
      originalPath: file
    });
    if (res.duplicated) {
      state.counters.duplicated++;
      state.lastEvent = { at: new Date(), kind: "duplicated", file, folderKind: kind, message: "Ya existente (sha256)" };
    } else {
      state.counters.imported++;
      state.lastEvent = { at: new Date(), kind: "imported", file, folderKind: kind, message: `docId=${res.document.id}` };
    }
  } catch (e) {
    state.counters.failed++;
    const msg = e instanceof Error ? e.message : String(e);
    state.lastEvent = { at: new Date(), kind: "failed", file, folderKind: kind, message: msg };
    console.error(`[watcher:${kind}] error procesando`, file, msg);
  }
}

async function startSingleWatcher(folder: string, kind: DocumentKindForWatcher, cfg: WatcherConfig, queue: { current: Promise<void> }) {
  const stat = await fs.stat(folder).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    console.warn(`[watcher:${kind}] carpeta no existe o no es dir, salto: ${folder}`);
    return;
  }
  const w = chokidar.watch(folder, {
    ignoreInitial: false,
    depth: cfg.recursive ? undefined : 0,
    awaitWriteFinish: { stabilityThreshold: cfg.stabilityMs, pollInterval: 200 },
    ignored: [
      /(^|[\/\\])\../,
      /[\\\/]revisado([\\\/]|$)/i
    ]
  });
  const enqueue = (file: string) => {
    queue.current = queue.current.then(() => processFile(file, folder, kind, cfg).catch(() => {}));
  };
  w.on("add", file => enqueue(file));
  w.on("error", (err: any) => {
    const code = err?.code;
    if (code === "EPERM" || code === "EBUSY" || code === "ENOENT") return;
    console.error(`[watcher:${kind}] error`, err);
  });
  watchers.push(w);
  console.log(`[watcher:${kind}] vigilando ${folder} (recursive=${cfg.recursive})`);
}

export async function startWatcher(cfg: WatcherConfig = readWatcherConfig()): Promise<WatcherState> {
  if (state.running) return state;
  if (!cfg.folder) throw new Error("WATCH_FOLDER no está definido en .env");

  // Cola serializada compartida entre las dos carpetas para evitar carreras.
  const queue = { current: Promise.resolve() };

  await startSingleWatcher(cfg.folder, "CAPTURA", cfg, queue);
  if (cfg.gastosFolder) {
    await startSingleWatcher(cfg.gastosFolder, "GASTO", cfg, queue);
  } else {
    console.log("[watcher] GASTOS_FOLDER no configurada — no se vigila la carpeta de gastos");
  }
  if (cfg.ssFolder) {
    await startSingleWatcher(cfg.ssFolder, "SS", cfg, queue);
  } else {
    console.log("[watcher] SS_FOLDER no configurada — no se vigila la carpeta de Seguridad Social");
  }

  state.running = true;
  state.config = cfg;
  state.startedAt = new Date();
  return state;
}

export async function stopWatcher() {
  for (const w of watchers) {
    try { await w.close(); } catch {}
  }
  watchers = [];
  state.running = false;
}

/** Escaneo manual único: procesa todos los ficheros relevantes de las carpetas. */
export async function scanOnce(cfg: WatcherConfig = readWatcherConfig()) {
  const tasks: Array<{ folder: string; kind: DocumentKindForWatcher; exts: string[] }> = [
    { folder: cfg.folder, kind: "CAPTURA", exts: [".pdf"] }
  ];
  if (cfg.gastosFolder) tasks.push({ folder: cfg.gastosFolder, kind: "GASTO", exts: [".pdf"] });
  if (cfg.ssFolder)     tasks.push({ folder: cfg.ssFolder,     kind: "SS",    exts: [".xlsx", ".xls"] });

  let total = 0;
  for (const t of tasks) {
    const files: string[] = [];
    async function walk(dir: string, depth: number) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory() && cfg.recursive && depth > 0) await walk(full, depth - 1);
        else if (e.isFile() && t.exts.some(ext => e.name.toLowerCase().endsWith(ext))) files.push(full);
      }
    }
    try { await walk(t.folder, cfg.recursive ? 10 : 0); } catch {}
    for (const f of files) await processFile(f, t.folder, t.kind, cfg);
    total += files.length;
  }
  return { scanned: total, counters: { ...state.counters } };
}

const STATE_FILE = path.resolve(process.cwd(), ".watch-state.json");
export async function persistState() {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}
export async function readPersistedState(): Promise<WatcherState | null> {
  try { return JSON.parse(await fs.readFile(STATE_FILE, "utf8")); } catch { return null; }
}
