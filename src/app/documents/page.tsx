"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type SortKey = "issueDate" | "createdAt" | "portName" | "invoiceNumber" | "total" | "status";
type SortDir = "asc" | "desc";
type Tab = "CAPTURA" | "GASTO";

export default function DocumentsPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [watcher, setWatcher] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Pestaña activa: Capturas (lo de siempre) o Gastos (Fase 2 — pendiente)
  const [tab, setTab] = useState<Tab>("CAPTURA");

  // Orden actual (por defecto, fecha de factura descendente)
  const [sortKey, setSortKey] = useState<SortKey>("issueDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Filtro por estado: "ALL" | "DRAFT" | "VERIFIED" | "FAILED" | "PARSED"
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  async function refresh() {
    const qs = `?kind=${tab}`;
    const [docsR, watchR] = await Promise.all([fetch(`/api/documents${qs}`), fetch("/api/watcher/status")]);
    const docsJson = await docsR.json();
    setDocs(Array.isArray(docsJson?.data) ? docsJson.data : []);
    setWatcher((await watchR.json()).data);
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [tab]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setLoading(true); setMsg(null);
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/documents", { method: "POST", body: fd });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) { setMsg(j?.error ?? "Error"); return; }
    setMsg(j.data.duplicated ? "Documento duplicado (sha256 ya existente)" : "Importado correctamente");
    if (input.current) input.current.value = "";
    refresh();
  }

  async function normalizeVat() {
    if (!confirm("Va a fijar IVA 10% en todas las líneas de factura existentes y recalcular los impuestos. ¿Continuar?")) return;
    const r = await fetch("/api/invoice-lines/normalize-vat", { method: "POST" });
    const j = await r.json();
    if (!r.ok) { alert(j?.error ?? "Error"); return; }
    alert(`Líneas actualizadas: ${j.data.linesUpdated}. Facturas recalculadas: ${j.data.invoicesUpdated}.`);
    refresh();
  }

  async function scanNow() {
    setScanning(true); setMsg(null);
    const r = await fetch("/api/watcher/scan", { method: "POST" });
    const j = await r.json();
    setScanning(false);
    setMsg(r.ok ? `Escaneo manual: ${j.data.scanned} PDFs revisados.` : (j?.error ?? "Error"));
    refresh();
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  function valueFor(d: any, k: SortKey): any {
    switch (k) {
      case "issueDate":     return d.invoice?.issueDate ? new Date(d.invoice.issueDate).getTime() : null;
      case "createdAt":     return new Date(d.createdAt).getTime();
      case "portName":      return d.invoice?.port?.name?.toLowerCase() ?? "";
      case "invoiceNumber": return d.invoice?.invoiceNumber ?? "";
      case "total":         return d.invoice ? Number(d.invoice.total) : 0;
      case "status":        return d.status ?? "";
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: docs.length, DRAFT: 0, VERIFIED: 0, FAILED: 0, PARSED: 0, UPLOADED: 0, REJECTED: 0 };
    for (const d of docs) if (c[d.status] !== undefined) c[d.status]++;
    return c;
  }, [docs]);

  const sorted = useMemo(() => {
    const arr = statusFilter === "ALL" ? [...docs] : docs.filter(d => d.status === statusFilter);
    arr.sort((a, b) => {
      const va = valueFor(a, sortKey);
      const vb = valueFor(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [docs, sortKey, sortDir, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Documentos</h1>
        <div className="flex items-center gap-2">
          {tab === "CAPTURA" && (
            <button className="btn-ghost" onClick={normalizeVat} title="Aplica IVA 10% a todas las líneas existentes">
              Recalcular IVA 10%
            </button>
          )}
          <button className="btn-ghost" onClick={scanNow} disabled={scanning}>{scanning ? "Escaneando..." : "Escanear carpetas ahora"}</button>
          <label className="btn-primary cursor-pointer">
            {loading ? "Importando..." : "Importar PDF"}
            <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={upload} />
          </label>
        </div>
      </div>

      {/* Pestañas: Capturas vs Gastos */}
      <div className="border-b border-slate-200 flex gap-1">
        <TabButton active={tab === "CAPTURA"} onClick={() => setTab("CAPTURA")} icon="🐟" label="Capturas" />
        <TabButton active={tab === "GASTO"}  onClick={() => setTab("GASTO")}  icon="💶" label="Gastos" />
      </div>

      {tab === "GASTO" ? (
        <>
          <WatcherBanner w={watcher} />

          {msg && <div className="text-sm text-slate-600">{msg}</div>}

          {/* Mismos chips de filtro por estado que en Capturas */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs uppercase tracking-wide text-slate-500 mr-1">Mostrar:</span>
            <StatusChip label="Todos" count={counts.ALL} active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")} />
            <StatusChip label="Pendientes" icon="✎" count={counts.DRAFT} active={statusFilter === "DRAFT"}
              activeColor="bg-amber-100 text-amber-800 border-amber-300"
              onClick={() => setStatusFilter("DRAFT")} />
            <StatusChip label="Verificados" icon="✓" count={counts.VERIFIED} active={statusFilter === "VERIFIED"}
              activeColor="bg-emerald-100 text-emerald-800 border-emerald-300"
              onClick={() => setStatusFilter("VERIFIED")} />
            <StatusChip label="Con errores" icon="!" count={counts.FAILED} active={statusFilter === "FAILED"}
              activeColor="bg-rose-100 text-rose-800 border-rose-300"
              onClick={() => setStatusFilter("FAILED")} />
          </div>

          <GastosTab docs={sorted} />
        </>
      ) : (
        <>
          <WatcherBanner w={watcher} />

          {msg && <div className="text-sm text-slate-600">{msg}</div>}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs uppercase tracking-wide text-slate-500 mr-1">Mostrar:</span>
            <StatusChip label="Todos" count={counts.ALL} active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")} />
            <StatusChip label="Pendientes" icon="✎" count={counts.DRAFT} active={statusFilter === "DRAFT"}
              activeColor="bg-amber-100 text-amber-800 border-amber-300"
              onClick={() => setStatusFilter("DRAFT")} />
            <StatusChip label="Verificados" icon="✓" count={counts.VERIFIED} active={statusFilter === "VERIFIED"}
              activeColor="bg-emerald-100 text-emerald-800 border-emerald-300"
              onClick={() => setStatusFilter("VERIFIED")} />
            <StatusChip label="Con errores" icon="!" count={counts.FAILED} active={statusFilter === "FAILED"}
              activeColor="bg-rose-100 text-rose-800 border-rose-300"
              onClick={() => setStatusFilter("FAILED")} />
            {counts.PARSED > 0 && (
              <StatusChip label="Parseados" icon="·" count={counts.PARSED} active={statusFilter === "PARSED"}
                activeColor="bg-sky-100 text-sky-800 border-sky-300"
                onClick={() => setStatusFilter("PARSED")} />
            )}
          </div>

          <div className="card p-0 overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <Th k="issueDate"     label="Fecha factura"  sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <Th k="createdAt"     label="Importado"      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <th>Archivo</th>
                  <th>Formato</th>
                  <Th k="portName"      label="Puerto"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <Th k="invoiceNumber" label="Nº factura"     sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <Th k="total"         label="Total"          sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} centerAlign />
                  <Th k="status"        label="Estado"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(d => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.invoice?.issueDate ? new Date(d.invoice.issueDate).toLocaleDateString("es-ES") : "—"}</td>
                    <td className="text-xs text-slate-500">{new Date(d.createdAt).toLocaleDateString("es-ES")}</td>
                    <td className="font-mono text-xs">{d.filename}</td>
                    <td>{d.format?.name ?? "—"}</td>
                    <td>{d.invoice?.port?.name ?? "—"}</td>
                    <td>{d.invoice?.invoiceNumber ?? "—"}</td>
                    <td className="text-center tabular-nums">{d.invoice ? fmtEur(d.invoice.total) : "—"}</td>
                    <td><StatusBadge s={d.status} /></td>
                    <td><Link className="btn-ghost" href={`/documents/${d.id}`}>Revisar</Link></td>
                  </tr>
                ))}
                {!sorted.length && <tr><td colSpan={9} className="text-center py-6 text-slate-500">Sin documentos. Importa un PDF o activa el watcher.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Th({
  k, label, sortKey, sortDir, onClick, centerAlign
}: {
  k: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  centerAlign?: boolean;
}) {
  const active = sortKey === k;
  const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      onClick={() => onClick(k)}
      className={`cursor-pointer select-none hover:text-slate-900 ${centerAlign ? "text-center" : ""} ${active ? "text-slate-900" : ""}`}
      title="Clic para ordenar"
    >
      {label}<span className="text-blue-600">{arrow}</span>
    </th>
  );
}

function WatcherBanner({ w }: { w: any }) {
  if (!w) return null;
  const running = w.runtime?.running;
  const c = w.counters ?? w.runtime?.counters ?? { picked: 0, imported: 0, duplicated: 0, failed: 0 };
  const last = w.runtime?.lastEvent;
  return (
    <div className={`card flex items-start gap-4 ${running ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="mt-1">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`}></span>
      </div>
      <div className="flex-1 text-sm">
        <div><b>{running ? "Watcher activo" : "Watcher no está corriendo"}</b> · {w.config?.folder || "(sin WATCH_FOLDER)"} {w.config?.recursive ? "(recursivo)" : ""}</div>
        <div className="text-slate-600">
          Detectados: {c.picked} · Importados: {c.imported} · Duplicados: {c.duplicated} · Fallos: {c.failed}
          {last ? ` · Último: ${last.kind} — ${last.file}${last.message ? " (" + last.message + ")" : ""}` : ""}
        </div>
        {!running && <div className="text-xs text-slate-500 mt-1">Para activarlo lanza en otro terminal: <code>npm run watch</code></div>}
      </div>
    </div>
  );
}

const fmtEur = (n: any) => (Number(n) || 0).toLocaleString("es-ES", {
  style: "currency", currency: "EUR",
  useGrouping: true,
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, { cls: string; icon: string; label: string }> = {
    VERIFIED: { cls: "badge-verified", icon: "✓", label: "Verificado" },
    DRAFT:    { cls: "badge-draft",    icon: "✎", label: "Pendiente" },
    PARSED:   { cls: "badge-parsed",   icon: "·", label: "Parseado" },
    FAILED:   { cls: "badge-failed",   icon: "!", label: "Error" },
    UPLOADED: { cls: "badge",          icon: "↑", label: "Subido" },
    REJECTED: { cls: "badge-failed",   icon: "✕", label: "Rechazado" }
  };
  const entry = map[s] ?? { cls: "badge", icon: "", label: s };
  return (
    <span className={entry.cls} title={entry.label}>
      <span className="mr-1">{entry.icon}</span>{entry.label}
    </span>
  );
}

function StatusChip({
  label, count, active, onClick, icon, activeColor
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: string;
  activeColor?: string;
}) {
  const base = "px-3 py-1 rounded-full border text-sm transition";
  const activeCls = activeColor ?? "bg-slate-100 text-slate-900 border-slate-400";
  const inactiveCls = "bg-white text-slate-600 border-slate-200 hover:bg-slate-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${active ? activeCls : inactiveCls}`}
    >
      {icon && <span className="mr-1">{icon}</span>}
      {label}
      <span className="ml-2 text-xs opacity-70">{count}</span>
    </button>
  );
}

/** Pestaña visual estilo "tabs" arriba de la tabla. */
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 -mb-px text-sm border-b-2 transition ${active ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"}`}
    >
      <span className="mr-2">{icon}</span>{label}
    </button>
  );
}

/** Pestaña de Gastos: lista los gastos extraídos. El banner y los chips los pone el padre. */
function GastosTab({ docs }: { docs: any[] }) {
  // Total acumulado de gastos visibles (tras filtro por estado)
  const total = docs.reduce((a, d) => a + Number(d.expense?.totalAmount ?? 0), 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <div>{docs.length} gasto{docs.length === 1 ? "" : "s"} · Total: <b>{fmtEur(total)}</b></div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Nº</th>
              <th>Proveedor</th>
              <th>Concepto</th>
              <th>Categoría</th>
              <th className="text-right">Base</th>
              <th className="text-right">IVA</th>
              <th className="text-right">Total</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docs.map(d => {
              const ex = d.expense ?? {};
              return (
                <tr key={d.id}>
                  <td className="text-xs">{ex.issueDate ? new Date(ex.issueDate).toLocaleDateString("es-ES") : <span className="text-slate-400">—</span>}</td>
                  <td className="text-xs font-mono">{ex.expenseNumber ?? <span className="text-slate-400">—</span>}</td>
                  <td className="text-sm">{ex.supplier?.name ?? <span className="text-slate-400">{d.filename}</span>}</td>
                  <td className="text-xs text-slate-600 max-w-[300px] truncate" title={ex.concept ?? ""}>{ex.concept ?? "—"}</td>
                  <td className="text-xs"><CategoryBadge c={ex.category} /></td>
                  <td className="text-right tabular-nums text-sm">{ex.baseAmount != null ? fmtEur(ex.baseAmount) : "—"}</td>
                  <td className="text-right tabular-nums text-sm">{ex.vatAmount != null ? fmtEur(ex.vatAmount) : "—"}</td>
                  <td className="text-right tabular-nums text-sm font-medium">{ex.totalAmount != null ? fmtEur(ex.totalAmount) : "—"}</td>
                  <td><StatusBadge s={ex.status ?? d.status} /></td>
                  <td><Link className="btn-ghost" href={`/documents/${d.id}`}>Revisar</Link></td>
                </tr>
              );
            })}
            {!docs.length && <tr><td colSpan={10} className="text-center py-6 text-slate-500">Sin gastos importados todavía. Deja PDFs en <code>Dropbox\Itsas Lagunak\Gastos Txanteles</code> o pulsa Importar PDF.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryBadge({ c }: { c?: string }) {
  if (!c) return <span className="text-slate-400">—</span>;
  const colors: Record<string, string> = {
    COFRADIA:      "bg-indigo-100 text-indigo-800 border-indigo-200",
    COMBUSTIBLE:   "bg-orange-100 text-orange-800 border-orange-200",
    HIELO:         "bg-sky-100 text-sky-800 border-sky-200",
    VIVERES:       "bg-lime-100 text-lime-800 border-lime-200",
    TELEFONIA:     "bg-violet-100 text-violet-800 border-violet-200",
    TRANSPORTE:    "bg-yellow-100 text-yellow-800 border-yellow-200",
    MANTENIMIENTO: "bg-amber-100 text-amber-800 border-amber-200",
    OTRO:          "bg-slate-100 text-slate-700 border-slate-200"
  };
  const cls = colors[c] ?? colors.OTRO;
  return <span className={`px-2 py-0.5 rounded-full border text-xs ${cls}`}>{c}</span>;
}
