"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type SortKey = "issueDate" | "downloadDate" | "createdAt" | "portName" | "invoiceNumber" | "total" | "status";
type SortDir = "asc" | "desc";
type Tab = "CAPTURA" | "GASTO";

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [watcher, setWatcher] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Pestaña activa: lee de ?tab= en la URL para que al volver desde "Guardar y verificar"
  // se abra la pestaña correcta (Gastos vs Capturas). Si no hay parámetro, por defecto Capturas.
  const initialTab: Tab = (searchParams?.get("tab") === "GASTO") ? "GASTO" : "CAPTURA";
  const [tab, setTab] = useState<Tab>(initialTab);

  // Orden actual (por defecto, fecha de factura descendente)
  const [sortKey, setSortKey] = useState<SortKey>("issueDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Filtro por estado: "ALL" | "DRAFT" | "VERIFIED" | "FAILED" | "PARSED"
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  // Filtro por año (ej. "2025", "2026") y por puerto (id). "ALL" = sin filtrar.
  // Se persisten en sessionStorage para que al volver del editor de un documento
  // (Guardar/Verificar) la pantalla quede como antes, con los filtros aplicados.
  const FILTERS_KEY = "documents:filters:v1";
  const [yearFilter, setYearFilter] = useState<string>("ALL");
  const [portFilter, setPortFilter] = useState<string>("ALL");
  const [filtersRestored, setFiltersRestored] = useState(false);

  // Validación masiva (verificar todos los pendientes con datos completos).
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStage, setBulkStage] = useState<"idle" | "preview" | "running" | "done">("idle");
  const [bulkResult, setBulkResult] = useState<any>(null);

  // Formulario de "gasto manual" (entrada sin PDF)
  const [showManualForm, setShowManualForm] = useState(false);

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

  // Restaurar filtros guardados al cargar (una vez).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.status) setStatusFilter(String(saved.status));
        if (saved?.year)   setYearFilter(String(saved.year));
        if (saved?.port)   setPortFilter(String(saved.port));
      }
    } catch { /* ignorar */ }
    setFiltersRestored(true);
  }, []);

  // Guardar filtros cuando cambien (solo después de haber restaurado).
  useEffect(() => {
    if (!filtersRestored) return;
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify({
        status: statusFilter, year: yearFilter, port: portFilter
      }));
    } catch { /* ignorar */ }
  }, [statusFilter, yearFilter, portFilter, filtersRestored]);

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
      case "downloadDate":  return downloadDateMs(d);
      case "createdAt":     return new Date(d.createdAt).getTime();
      case "portName":      return d.invoice?.port?.name?.toLowerCase() ?? "";
      case "invoiceNumber": return d.invoice?.invoiceNumber ?? "";
      case "total":         return d.invoice ? Number(d.invoice.total) : 0;
      case "status":        return d.status ?? "";
    }
  }

  /** Devuelve el timestamp más temprano entre las lineDate del documento, o null. */
  function downloadDateMs(d: any): number | null {
    const lines = d.invoice?.lines ?? d.expense?.lines ?? [];
    const ts = lines.map((l: any) => l.lineDate ? new Date(l.lineDate).getTime() : null).filter((x: any) => x != null);
    if (!ts.length) return null;
    return Math.min(...ts);
  }

  /** Renderiza la fecha de descarga: una fecha si todas las líneas son del mismo día,
   *  un rango "DD/MM/YYYY – DD/MM/YYYY" si son días distintos, o "—" si no hay. */
  function renderDownloadDate(d: any): string {
    const lines = d.invoice?.lines ?? d.expense?.lines ?? [];
    const ts = lines.map((l: any) => l.lineDate ? new Date(l.lineDate).getTime() : null).filter((x: any) => x != null) as number[];
    if (!ts.length) return "—";
    const min = Math.min(...ts), max = Math.max(...ts);
    const fmt = (n: number) => new Date(n).toLocaleDateString("es-ES");
    if (min === max) return fmt(min);
    return `${fmt(min)} – ${fmt(max)}`;
  }

  // Helpers para extraer año / puerto de un documento (capturas o gastos).
  const docYear = (d: any): number | null => {
    const iso = d.invoice?.issueDate ?? d.expense?.issueDate;
    return iso ? new Date(iso).getFullYear() : null;
  };
  const docPortId = (d: any): string | null =>
    d.invoice?.port?.id ?? d.expense?.port?.id ?? null;

  // Años presentes en los documentos (para el desplegable, descendente).
  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const d of docs) { const y = docYear(d); if (y) ys.add(y); }
    return Array.from(ys).sort((a, b) => b - a);
  }, [docs]);

  // Puertos presentes en los documentos (para el desplegable, alfabético).
  const availablePorts = useMemo(() => {
    const ps = new Map<string, string>();
    for (const d of docs) {
      const p = d.invoice?.port ?? d.expense?.port;
      if (p?.id) ps.set(p.id, p.name);
    }
    return Array.from(ps.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [docs]);

  // Si el año/puerto guardado ya no aparece en los datos actuales (por ejemplo
  // tras cambiar de pestaña), lo limpiamos automáticamente para no dejar un
  // filtro "fantasma" invisible.
  useEffect(() => {
    if (!filtersRestored || docs.length === 0) return;
    if (yearFilter !== "ALL" && !availableYears.includes(Number(yearFilter))) {
      setYearFilter("ALL");
    }
    if (portFilter !== "ALL" && !availablePorts.some(p => p.id === portFilter)) {
      setPortFilter("ALL");
    }
  }, [docs.length, availableYears, availablePorts, yearFilter, portFilter, filtersRestored]);

  // Aplicamos primero los filtros por año y puerto (los chips de estado deben
  // contar SOLO lo que pasa esos filtros, para que los números sean coherentes
  // con lo que el usuario va a ver).
  const docsFiltered = useMemo(() => {
    return docs.filter(d => {
      if (yearFilter !== "ALL" && docYear(d) !== Number(yearFilter)) return false;
      if (portFilter !== "ALL" && docPortId(d) !== portFilter) return false;
      return true;
    });
  }, [docs, yearFilter, portFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: docsFiltered.length, DRAFT: 0, VERIFIED: 0, FAILED: 0, PARSED: 0, UPLOADED: 0, REJECTED: 0 };
    for (const d of docsFiltered) if (c[d.status] !== undefined) c[d.status]++;
    return c;
  }, [docsFiltered]);

  const sorted = useMemo(() => {
    const arr = statusFilter === "ALL" ? [...docsFiltered] : docsFiltered.filter(d => d.status === statusFilter);
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
  }, [docsFiltered, sortKey, sortDir, statusFilter]);

  /* ──────── Validación masiva ──────── */
  function bulkBody(dryRun: boolean) {
    return {
      kind: tab,
      year: yearFilter !== "ALL" ? Number(yearFilter) : undefined,
      portId: portFilter !== "ALL" ? portFilter : undefined,
      dryRun
    };
  }
  async function openBulkVerify() {
    setBulkOpen(true);
    setBulkStage("running");
    setBulkResult(null);
    try {
      const r = await fetch("/api/documents/bulk-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bulkBody(true))
      });
      const j = await r.json();
      if (!r.ok) { alert(j?.error ?? "Error en previsualización"); setBulkOpen(false); return; }
      setBulkResult(j.data);
      setBulkStage("preview");
    } catch (e: any) {
      alert(e?.message ?? "Error");
      setBulkOpen(false);
    }
  }
  async function applyBulkVerify() {
    setBulkStage("running");
    try {
      const r = await fetch("/api/documents/bulk-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bulkBody(false))
      });
      const j = await r.json();
      if (!r.ok) { alert(j?.error ?? "Error verificando"); setBulkStage("preview"); return; }
      setBulkResult(j.data);
      setBulkStage("done");
      refresh();
    } catch (e: any) {
      alert(e?.message ?? "Error");
      setBulkStage("preview");
    }
  }
  function closeBulkVerify() {
    setBulkOpen(false);
    setBulkStage("idle");
    setBulkResult(null);
  }

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
          {tab === "GASTO" && (
            <button
              className="btn-primary bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setShowManualForm(v => !v)}
              title="Añadir un gasto sin PDF (a mano)"
            >
              {showManualForm ? "Cerrar formulario" : "+ Gasto manual"}
            </button>
          )}
          {counts.DRAFT > 0 && (
            <button
              className="btn-ghost border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={openBulkVerify}
              title="Verifica de golpe todos los pendientes del filtro actual que tengan datos completos"
            >
              ✓ Verificar pendientes ({counts.DRAFT})
            </button>
          )}
          <button className="btn-ghost" onClick={scanNow} disabled={scanning}>{scanning ? "Escaneando..." : "Escanear carpetas ahora"}</button>
          <label className="btn-primary cursor-pointer">
            {loading ? "Importando..." : "Importar PDF"}
            <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={upload} />
          </label>
        </div>
      </div>

      {tab === "GASTO" && showManualForm && (
        <ManualExpenseForm onSaved={() => { setShowManualForm(false); refresh(); }} onCancel={() => setShowManualForm(false)} />
      )}

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

            {(availableYears.length > 0 || availablePorts.length > 0) && (
              <div className="ml-2 flex flex-wrap items-center gap-2 border-l border-slate-300 pl-3">
                <span className="text-xs uppercase tracking-wide text-slate-500">Año:</span>
                <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                  <option value="ALL">Todos</option>
                  {availableYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                <span className="text-xs uppercase tracking-wide text-slate-500 ml-2">Puerto:</span>
                <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={portFilter} onChange={e => setPortFilter(e.target.value)}>
                  <option value="ALL">Todos</option>
                  {availablePorts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {(yearFilter !== "ALL" || portFilter !== "ALL") && (
                  <button
                    className="text-xs text-slate-500 hover:text-rose-700 ml-1"
                    onClick={() => { setYearFilter("ALL"); setPortFilter("ALL"); }}
                    title="Quitar filtros de año y puerto"
                  >✕ limpiar</button>
                )}
              </div>
            )}
          </div>

          <GastosTab docs={sorted} refresh={refresh} />
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

            {(availableYears.length > 0 || availablePorts.length > 0) && (
              <div className="ml-2 flex flex-wrap items-center gap-2 border-l border-slate-300 pl-3">
                <span className="text-xs uppercase tracking-wide text-slate-500">Año:</span>
                <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                  <option value="ALL">Todos</option>
                  {availableYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                <span className="text-xs uppercase tracking-wide text-slate-500 ml-2">Puerto:</span>
                <select className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={portFilter} onChange={e => setPortFilter(e.target.value)}>
                  <option value="ALL">Todos</option>
                  {availablePorts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {(yearFilter !== "ALL" || portFilter !== "ALL") && (
                  <button
                    className="text-xs text-slate-500 hover:text-rose-700 ml-1"
                    onClick={() => { setYearFilter("ALL"); setPortFilter("ALL"); }}
                    title="Quitar filtros de año y puerto"
                  >✕ limpiar</button>
                )}
              </div>
            )}
          </div>

          <div className="card p-0 overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <Th k="issueDate"     label="Fecha factura"  sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <Th k="downloadDate"  label="F. descarga"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
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
                    <td className="whitespace-nowrap">{renderDownloadDate(d)}</td>
                    <td className="text-xs text-slate-500">{new Date(d.createdAt).toLocaleDateString("es-ES")}</td>
                    <td className="font-mono text-xs">{d.filename}</td>
                    <td>{d.format?.name ?? "—"}</td>
                    <td>{d.invoice?.port?.name ?? "—"}</td>
                    <td>{d.invoice?.invoiceNumber ?? "—"}</td>
                    <td className="text-center tabular-nums">{d.invoice ? fmtEur(d.invoice.total) : "—"}</td>
                    <td><StatusBadge s={d.status} /></td>
                    <td className="whitespace-nowrap">
                      <Link className="btn-ghost mr-1" href={`/documents/${d.id}`}>Revisar</Link>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded font-medium"
                        onClick={() => deleteDoc(d.id, d.filename, refresh)}
                        title="Borrar este documento (y sus datos)"
                      >🗑 Borrar</button>
                    </td>
                  </tr>
                ))}
                {!sorted.length && <tr><td colSpan={10} className="text-center py-6 text-slate-500">Sin documentos. Importa un PDF o activa el watcher.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal de validación masiva */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-lg">Verificar pendientes en lote</h2>
              <button className="text-slate-400 hover:text-slate-700 text-xl leading-none" onClick={closeBulkVerify} disabled={bulkStage === "running"}>×</button>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1">
              {bulkStage === "running" && (
                <div className="text-center py-10 text-slate-600">
                  <div className="text-2xl mb-2">⏳</div>
                  <div>Procesando, espera unos segundos…</div>
                </div>
              )}

              {bulkResult && bulkStage !== "running" && (
                <div className="space-y-4 text-sm">
                  <div className="text-slate-700">
                    Filtros aplicados — <b>Tipo:</b> {tab === "CAPTURA" ? "Capturas" : "Gastos"}
                    {yearFilter !== "ALL" && <> · <b>Año:</b> {yearFilter}</>}
                    {portFilter !== "ALL" && <> · <b>Puerto:</b> {availablePorts.find(p => p.id === portFilter)?.name ?? portFilter}</>}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                      <div className="text-xs uppercase tracking-wide text-emerald-700">{bulkStage === "done" ? "Verificados" : "A verificar"}</div>
                      <div className="text-2xl font-semibold text-emerald-800 mt-1">{bulkResult.verified.length}</div>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                      <div className="text-xs uppercase tracking-wide text-amber-700">Se omiten</div>
                      <div className="text-2xl font-semibold text-amber-800 mt-1">{bulkResult.skipped.length}</div>
                    </div>
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center">
                      <div className="text-xs uppercase tracking-wide text-rose-700">Fallaron</div>
                      <div className="text-2xl font-semibold text-rose-800 mt-1">{bulkResult.failed.length}</div>
                    </div>
                  </div>

                  {bulkStage === "preview" && (
                    <div className="text-slate-700 bg-blue-50 border border-blue-200 rounded p-3">
                      Esta es una <b>previsualización</b>. Si pulsas <b>Confirmar y verificar</b> marcaré como verificados los {bulkResult.verified.length} de arriba.
                      Los {bulkResult.skipped.length} omitidos se quedan como pendientes para que los revises tú.
                    </div>
                  )}

                  {bulkStage === "done" && (
                    <div className="text-slate-700 bg-emerald-50 border border-emerald-200 rounded p-3">
                      ✓ Listo. {bulkResult.verified.length} documentos han pasado a verificado.
                      {bulkResult.skipped.length > 0 && <> {bulkResult.skipped.length} se han quedado pendientes (mira abajo el motivo).</>}
                    </div>
                  )}

                  {bulkResult.skipped.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-slate-700 mb-2">Omitidos y por qué:</h3>
                      <div className="border border-slate-200 rounded max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <tbody>
                            {bulkResult.skipped.map((s: any) => (
                              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                                <td className="px-3 py-2 font-mono align-top whitespace-nowrap">{s.filename}</td>
                                <td className="px-3 py-2 text-amber-700 align-top">{s.reasons.join(" · ")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {bulkResult.failed.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-rose-700 mb-2">Errores:</h3>
                      <div className="border border-rose-200 rounded max-h-32 overflow-y-auto">
                        <table className="w-full text-xs">
                          <tbody>
                            {bulkResult.failed.map((f: any) => (
                              <tr key={f.id} className="border-b border-rose-100 last:border-0">
                                <td className="px-3 py-2 font-mono align-top whitespace-nowrap">{f.filename}</td>
                                <td className="px-3 py-2 text-rose-700 align-top">{f.error}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              {bulkStage === "preview" && (
                <>
                  <button className="btn-ghost" onClick={closeBulkVerify}>Cancelar</button>
                  <button
                    className="btn-primary bg-emerald-600 hover:bg-emerald-700"
                    onClick={applyBulkVerify}
                    disabled={!bulkResult || bulkResult.verified.length === 0}
                  >
                    Confirmar y verificar ({bulkResult?.verified.length ?? 0})
                  </button>
                </>
              )}
              {bulkStage === "done" && (
                <button className="btn-primary" onClick={closeBulkVerify}>Cerrar</button>
              )}
            </div>
          </div>
        </div>
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
  useGrouping: "always",
  minimumFractionDigits: 2, maximumFractionDigits: 2
} as any);

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
function GastosTab({ docs, refresh }: { docs: any[]; refresh: () => void }) {
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
                  <td className="whitespace-nowrap">
                    <Link className="btn-ghost mr-1" href={`/documents/${d.id}`}>Revisar</Link>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded font-medium"
                      onClick={() => deleteDoc(d.id, d.filename, refresh)}
                      title="Borrar este documento (y sus líneas)"
                    >🗑 Borrar</button>
                  </td>
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

/**
 * Borra un documento (con confirmación).
 * Si el endpoint devuelve 409 (manta validada), pregunta al usuario si quiere
 * forzar el borrado y reintenta con ?force=true.
 */
async function deleteDoc(id: string, filename: string, refresh: () => void) {
  if (!confirm(`¿Borrar el documento "${filename}"?\n\nSe eliminarán también todas sus líneas (capturas o gastos). Esta acción no se puede deshacer.`)) return;

  let r: Response;
  try {
    r = await fetch(`/api/documents/${id}`, { method: "DELETE" });
  } catch (e: any) {
    alert(`Error de conexión al borrar: ${e?.message ?? String(e)}`);
    return;
  }

  // Conflicto por manta validada → ofrece forzar
  if (r.status === 409) {
    let conflictMsg = "Conflicto";
    try { const cj = await r.json(); conflictMsg = cj?.error ?? conflictMsg; } catch {}
    if (!confirm(`⚠️ ${conflictMsg}\n\n¿Forzar el borrado de todas formas? Esto puede dejar mantas validadas con datos incompletos.`)) return;
    try {
      r = await fetch(`/api/documents/${id}?force=true`, { method: "DELETE" });
    } catch (e: any) {
      alert(`Error de conexión al forzar borrado: ${e?.message ?? String(e)}`);
      return;
    }
  }

  // Cualquier otro error
  if (!r.ok) {
    let errMsg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      if (j?.error) errMsg = j.error;
    } catch {
      try { errMsg = await r.text(); } catch {}
    }
    alert(`No se pudo borrar el documento.\n\n${errMsg}\n\nSi el problema persiste, manda esta info a Asier.`);
    return;
  }

  refresh();
}

/**
 * Formulario para crear un Gasto manualmente (sin PDF).
 * Tras guardar, el gasto queda en estado DRAFT y el usuario puede ir a
 * "Revisar" para validarlo.
 */
function ManualExpenseForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    supplierName: "",
    supplierTaxId: "",
    issueDate: today,
    serviceDate: "",
    expenseNumber: "",
    concept: "",
    category: "OTRO",
    portName: "",
    baseAmount: "",
    vatRate: "10",
    vatAmount: "",
    totalAmount: "",
    notes: ""
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ports, setPorts] = useState<{ id: string; name: string; code: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; taxId: string | null }[]>([]);

  useEffect(() => {
    fetch("/api/ports").then(r => r.json()).then(j => setPorts(j?.data ?? []));
    fetch("/api/suppliers").then(r => r.json()).then(j => setSuppliers(j?.data ?? []));
  }, []);

  // Cuando el usuario elige (o escribe) un proveedor que ya existe, autorrellena el CIF.
  function onSupplierNameChange(value: string) {
    const next = { ...form, supplierName: value };
    const normalized = value.trim().toLowerCase();
    if (normalized.length >= 3) {
      const match = suppliers.find(s => s.name.trim().toLowerCase() === normalized);
      if (match && match.taxId && !form.supplierTaxId) {
        next.supplierTaxId = match.taxId;
      }
    }
    setForm(next);
  }

  // Auto-calcular IVA y total cuando se cambia la base
  function recalc(field: string, value: string) {
    const next = { ...form, [field]: value };
    const base = parseFloat((field === "baseAmount" ? value : next.baseAmount).replace(",", "."));
    const rate = parseFloat((field === "vatRate" ? value : next.vatRate).replace(",", "."));
    if (Number.isFinite(base) && Number.isFinite(rate) && rate >= 0) {
      const vat = Math.round(base * rate) / 100;
      const total = Math.round((base + vat) * 100) / 100;
      next.vatAmount = vat.toFixed(2);
      next.totalAmount = total.toFixed(2);
    }
    setForm(next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const baseAmount = parseFloat(String(form.baseAmount).replace(",", "."));
    const totalAmount = parseFloat(String(form.totalAmount).replace(",", "."));
    if (!Number.isFinite(baseAmount) || baseAmount < 0) { setErr("Importe base obligatorio."); return; }
    if (!Number.isFinite(totalAmount) || totalAmount < 0) { setErr("Importe total obligatorio."); return; }
    if (!form.supplierName.trim()) { setErr("Proveedor obligatorio."); return; }

    setSaving(true);
    try {
      const r = await fetch("/api/expenses/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: form.supplierName.trim(),
          supplierTaxId: form.supplierTaxId.trim() || null,
          issueDate: form.issueDate || null,
          serviceDate: form.serviceDate || null,
          expenseNumber: form.expenseNumber.trim() || null,
          concept: form.concept.trim() || null,
          category: form.category,
          portName: form.portName.trim() || null,
          baseAmount,
          vatRate: parseFloat(String(form.vatRate).replace(",", ".")) || 0,
          vatAmount: parseFloat(String(form.vatAmount).replace(",", ".")) || 0,
          totalAmount,
          notes: form.notes.trim() || null
        })
      });
      const j = await r.json();
      if (!r.ok) { setErr(j?.error ?? "Error guardando"); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const CATEGORIES = [
    "COFRADIA", "COMBUSTIBLE", "HIELO", "VIVERES", "TELEFONIA", "TRANSPORTE",
    "MANTENIMIENTO", "HIELO_PRODUCIDO", "CAJAS", "PALETS", "APAREJOS",
    "PAN", "AGUA", "CARNE", "MOVISTAR", "OTRO"
  ];

  return (
    <form className="card border-emerald-300 bg-emerald-50/40 space-y-4" onSubmit={save}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-emerald-900">➕ Nuevo gasto manual</h2>
        <button type="button" className="text-xs text-slate-500 hover:text-slate-700" onClick={onCancel}>× Cancelar</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <ManualField label="Proveedor *" required>
          <input
            className="input"
            value={form.supplierName}
            onChange={e => onSupplierNameChange(e.target.value)}
            placeholder="ej. AGROCOMERCIAL URANZU S.L."
            list="manual-suppliers-list"
            autoComplete="off"
          />
          <datalist id="manual-suppliers-list">
            {suppliers.map(s => (
              <option key={s.id} value={s.name}>
                {s.taxId ? `${s.taxId}` : ""}
              </option>
            ))}
          </datalist>
          {suppliers.length > 0 && (
            <span className="text-[10px] text-slate-500 italic">
              💡 Empieza a escribir y aparecerán sugerencias ({suppliers.length} proveedores registrados)
            </span>
          )}
        </ManualField>
        <ManualField label="CIF / NIF del proveedor">
          <input className="input" value={form.supplierTaxId} onChange={e => setForm({ ...form, supplierTaxId: e.target.value })} placeholder="ej. B20123456" />
        </ManualField>
        <ManualField label="Nº de factura">
          <input className="input" value={form.expenseNumber} onChange={e => setForm({ ...form, expenseNumber: e.target.value })} placeholder="ej. F-2026-0042" />
        </ManualField>
        <ManualField label="Fecha emisión">
          <input className="input" type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} />
        </ManualField>

        <ManualField label="Fecha servicio (opcional)">
          <input className="input" type="date" value={form.serviceDate} onChange={e => setForm({ ...form, serviceDate: e.target.value })} />
        </ManualField>
        <ManualField label="Categoría">
          <select className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </ManualField>
        <ManualField label="Puerto / cofradía (opcional)">
          <select className="input" value={form.portName} onChange={e => setForm({ ...form, portName: e.target.value })}>
            <option value="">— Sin puerto —</option>
            {ports.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </ManualField>
        <ManualField label="Concepto">
          <input className="input" value={form.concept} onChange={e => setForm({ ...form, concept: e.target.value })} placeholder="ej. Víveres, alquiler cajas, gasoil…" />
        </ManualField>

        <ManualField label="Base imponible *" required>
          <input className="input text-right tabular-nums" value={form.baseAmount} onChange={e => recalc("baseAmount", e.target.value)} placeholder="0,00" />
        </ManualField>
        <ManualField label="% IVA">
          <input className="input text-right tabular-nums" value={form.vatRate} onChange={e => recalc("vatRate", e.target.value)} placeholder="10" />
        </ManualField>
        <ManualField label="Cuota IVA">
          <input className="input text-right tabular-nums" value={form.vatAmount} onChange={e => setForm({ ...form, vatAmount: e.target.value })} placeholder="0,00" />
        </ManualField>
        <ManualField label="Total *" required>
          <input className="input text-right tabular-nums font-semibold" value={form.totalAmount} onChange={e => setForm({ ...form, totalAmount: e.target.value })} placeholder="0,00" />
        </ManualField>
      </div>

      <ManualField label="Notas (opcional)">
        <input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </ManualField>

      {err && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{err}</div>}

      <div className="flex gap-2 items-center">
        <button type="submit" className="btn-primary bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
          {saving ? "Guardando..." : "💾 Crear gasto"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <span className="text-[11px] text-slate-500 italic ml-auto">
          Tras guardar, podrás validarlo desde el botón "Revisar" igual que un PDF importado.
        </span>
      </div>
    </form>
  );
}

function ManualField({ label, required, children }: { label: string; required?: boolean; children: any }) {
  return (
    <label className="block text-sm">
      <span className={`block text-xs uppercase tracking-wide mb-1 ${required ? "text-emerald-900 font-semibold" : "text-slate-500"}`}>{label}</span>
      {children}
    </label>
  );
}

function CategoryBadge({ c }: { c?: string }) {
  if (!c) return <span className="text-slate-400">—</span>;
  const colors: Record<string, string> = {
    COFRADIA:         "bg-indigo-100 text-indigo-800 border-indigo-200",
    COMBUSTIBLE:      "bg-orange-100 text-orange-800 border-orange-200",
    HIELO:            "bg-sky-100 text-sky-800 border-sky-200",
    HIELO_PRODUCIDO:  "bg-cyan-100 text-cyan-800 border-cyan-200",
    VIVERES:          "bg-lime-100 text-lime-800 border-lime-200",
    TELEFONIA:        "bg-violet-100 text-violet-800 border-violet-200",
    MOVISTAR:         "bg-purple-100 text-purple-800 border-purple-200",
    TRANSPORTE:       "bg-yellow-100 text-yellow-800 border-yellow-200",
    MANTENIMIENTO:    "bg-amber-100 text-amber-800 border-amber-200",
    CAJAS:            "bg-stone-100 text-stone-800 border-stone-200",
    PALETS:           "bg-stone-100 text-stone-800 border-stone-200",
    APAREJOS:         "bg-teal-100 text-teal-800 border-teal-200",
    PAN:              "bg-yellow-100 text-yellow-800 border-yellow-200",
    AGUA:             "bg-blue-100 text-blue-800 border-blue-200",
    CARNE:            "bg-red-100 text-red-800 border-red-200",
    OTRO:             "bg-slate-100 text-slate-700 border-slate-200"
  };
  const cls = colors[c] ?? colors.OTRO;
  return <span className={`px-2 py-0.5 rounded-full border text-xs ${cls}`}>{c}</span>;
}
