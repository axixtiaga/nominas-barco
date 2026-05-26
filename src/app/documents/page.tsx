"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type SortKey = "issueDate" | "createdAt" | "portName" | "invoiceNumber" | "total" | "status";
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
          {tab === "GASTO" && (
            <button
              className="btn-primary bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setShowManualForm(v => !v)}
              title="Añadir un gasto sin PDF (a mano)"
            >
              {showManualForm ? "Cerrar formulario" : "+ Gasto manual"}
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
