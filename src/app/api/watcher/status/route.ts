import { ok, handle } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { readPersistedState, readWatcherConfig } from "@/lib/services/folder-watcher";

export async function GET() {
  try {
    await requireSession();
    const cfg = readWatcherConfig();
    const persisted = await readPersistedState();
    return ok({
      config: cfg,
      runtime: persisted ?? { running: false, counters: { picked: 0, imported: 0, duplicated: 0, failed: 0 }, lastEvent: null, startedAt: null }
    });
  } catch (e) { return handle(e); }
}
