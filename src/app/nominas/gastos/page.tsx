"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Expense = {
  id: string;
  expenseNumber: string | null;
  issueDate: string | null;
  serviceDate: string | null;
  manta: string | null;
  concept: string | null;
  category: string;
  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
  status: string;
  supplier: { name: string } | null;
  port: { name: string } | null;
  document: { id: string; filename: string } | null;
};

type SortKey = "issueDate" | "expenseNumber" | "supplier" | "category" | "totalAmount" | "manta";
type SortDir = "asc" | "desc";

export default function NominasGastosPage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [mantas, setMantas] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Filtros
  const [filterMode, setFilterMode] = useState<"todas" | "con-manta" | "sin-manta">("todas");
  const [filterStatus, setFilterStatus] = useState<"VERIFIED" | "DRAFT" | "ALL">("VERIFIED");
  const [filterManta, setFilterManta] = useState<string>("");

  // Orden
  const [sortKey, setSortKey] = useState<SortKey>("issueDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function refresh() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus && filterStatus !== "ALL") params.set("status", filterStatus);
    const r = await fetch(`/api/expenses?${params.toString()}`);
    const j = await r.json();
    setRows((Array.isArray(j.data) ? j.data : []).map((e: any) => ({
      ...e,
      baseAmount: Number(e.baseAmount),
      vatAmount: Number(e.vatAmount),
      totalAmount: Number(e.totalAmount)
    })));
    setEdits({});
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [filterStatus]);

  // Mantas existentes (de jornadas)
  useEffect(() => {
    fetch("/api/nominas?withMantaOnly=true").then(r => r.json()).then(j => {
      const all = (j.data?.rows ?? []).map((r: any) => r.manta).filter(Boolean);
      setMantas(Array.from(new Set(all)).sort());
    });
  }, []);

  function setRowManta(id: string, manta: string) {
    setEdits(prev => ({ ...prev, [id]: manta }));
  }

  async function saveOne(id: string) {
    const m = edits[id];
    if (m === undefined) return false;
    const r = await fetch(`/api/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manta: m || null })
    });
    if (!r.ok) { const j = await r.json(); setMsg(j?.error ?? "Error"); return false; }
    return true;
  }

  async function saveAll() {
    const ids = Object.keys(edits);
    if (!ids.length) return;
    let ok = 0;
    for (const id of ids) {
      if (await saveOne(id)) ok++;
    }
    setMsg(`Guardadas ${ok} asignación${ok === 1 ? "" : "es"} de manta.`);
    refresh();
  }

  async function saveJustOne(id: string) {
    const ok = await saveOne(id);
    if (ok) {
      // Quita esa fila del edit y refresca
      setEdits(prev => { const next = { ...prev }; delete next[id]; return next; });
      refresh();
    }
  }

  // Filtrado por manta y modo
  const filtered = useMemo(() => {
    let arr = rows;
    if (filterMode === "con-manta") arr = arr.filter(r => r.manta);
    if (filterMode === "sin-manta") arr = arr.filter(r => !r.manta);
    if (filterManta) arr = arr.filter(r => r.manta === filterManta);
    return arr;
  }, [rows, filterMode, filterManta]);

  // Orden
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: any, vb: any;
      switch (sortKey) {
        case "supplier":   va = a.supplier?.name ?? ""; vb = b.supplier?.name ?? ""; break;
        case "totalAmount": va = a.totalAmount; vb = b.totalAmount; break;
        default: va = (a as any)[sortKey] ?? ""; vb = (b as any)[sortKey] ?? "";
      }
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  // Agrupación por manta para mostrar subtotales
  const byManta = useMemo(() => {
    const groups: Record<string, Expense[]> = {};
    for (const r of sorted) {
      const k = r.manta ?? "(sin manta)";
      if (!groups[k]) groups[k] = [];
      groups[k].push(r);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [sorted]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Asignación de gastos a mantas</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Asigna cada gasto a una manta concreta. Las asignaciones manuales tienen
            prioridad sobre la heurística automática (vinculación por captura o por mismo día/puerto).
          </p>
        </div>
        <Link href="/nominas" className="btn-ghost">← Volver a Nóminas</Link>
      </div>

      {msg && <div className="card bg-emerald-50 border-emerald-200 text-sm text-emerald-800">{msg}</div>}

      {/* Filtros */}
      <div className="card flex flex-wrap items-end gap-4 text-sm">
        <Field label="Mostrar">
          <select className="input" value={filterMode} onChange={e => setFilterMode(e.target.value as any)}>
            <option value="todas">Todos los gastos</option>
            <option value="sin-manta">Solo sin asignar</option>
            <option value="con-manta">Solo con manta asignada</option>
          </select>
        </Field>
        <Field label="Estado">
          <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
            <option value="VERIFIED">Verificados</option>
            <option value="DRAFT">Pendientes</option>
            <option value="ALL">Todos</option>
          </select>
        </Field>
        <Field label="Filtrar manta concreta">
          <select className="input" value={filterManta} onChange={e => setFilterManta(e.target.value)}>
            <option value="">— Todas —</option>
            {mantas.map(m => <option key={m} value={m}>Manta {m}</option>)}
          </select>
        </Field>
        <button className="btn-ghost" onClick={() => { setFilterMode("todas"); setFilterStatus("VERIFIED"); setFilterManta(""); }}>
          Reiniciar filtros
        </button>
        <div className="ml-auto">
          {Object.keys(edits).length > 0 && (
            <button className="btn-primary" onClick={saveAll}>
              Guardar {Object.keys(edits).length} asignación{Object.keys(edits).length === 1 ? "" : "es"}
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-x-auto">
        <table className="table text-sm">
          <thead>
            <tr>
              <Th k="issueDate"     label="Fecha"      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="expenseNumber" label="Nº"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="supplier"      label="Proveedor"  sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th>Concepto</th>
              <Th k="category"      label="Categoría"  sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="totalAmount"   label="Total"      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="manta"         label="Manta"      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {byManta.map(([mantaKey, group]) => {
              const groupTotal = group.reduce((a, r) => a + r.totalAmount, 0);
              return (
                <>
                  <tr key={`group-${mantaKey}`} className="bg-slate-100">
                    <td colSpan={8} className="font-medium text-slate-700 text-xs">
                      Manta <b>{mantaKey}</b> · {group.length} gasto{group.length === 1 ? "" : "s"} · Σ total: <b>{fmtEur(groupTotal)}</b>
                      {mantaKey !== "(sin manta)" && (
                        <Link href={`/nominas/manta/${encodeURIComponent(mantaKey)}`} className="ml-3 text-blue-600 hover:underline font-normal">
                          Confeccionar nómina →
                        </Link>
                      )}
                    </td>
                  </tr>
                  {group.map(r => {
                    const editedManta = edits[r.id];
                    const currentManta = editedManta !== undefined ? editedManta : (r.manta ?? "");
                    const dirty = editedManta !== undefined && editedManta !== (r.manta ?? "");
                    return (
                      <tr key={r.id}>
                        <td className="text-xs whitespace-nowrap">{r.issueDate ? new Date(r.issueDate).toLocaleDateString("es-ES") : "—"}</td>
                        <td className="font-mono text-xs">{r.expenseNumber ?? "—"}</td>
                        <td>{r.supplier?.name ?? <span className="text-slate-400">{r.document?.filename ?? "—"}</span>}</td>
                        <td className="text-xs text-slate-600 max-w-[280px] truncate" title={r.concept ?? ""}>{r.concept ?? "—"}</td>
                        <td className="text-xs">{r.category}</td>
                        <td className="text-right tabular-nums font-medium">{fmtEur(r.totalAmount)}</td>
                        <td>
                          <input
                            list="mantas-list"
                            className="input text-xs w-20 py-0.5"
                            placeholder="—"
                            value={currentManta}
                            onChange={e => setRowManta(r.id, e.target.value)}
                          />
                        </td>
                        <td>
                          {dirty && <button className="btn-primary text-xs py-0.5 px-2 mr-1" onClick={() => saveJustOne(r.id)}>Guardar</button>}
                          <Link className="text-xs text-blue-600 hover:underline" href={`/documents/${r.document?.id}`}>Editar →</Link>
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
            {!sorted.length && !loading && (
              <tr><td colSpan={8} className="text-center py-8 text-slate-500">
                Sin gastos con esos filtros.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* datalist con las mantas existentes para el autocompletar */}
      <datalist id="mantas-list">
        {mantas.map(m => <option key={m} value={m} />)}
      </datalist>
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Th({ k, label, sortKey, sortDir, onClick, right }: any) {
  const active = sortKey === k;
  const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      onClick={() => onClick(k)}
      className={`cursor-pointer select-none hover:text-slate-900 ${right ? "text-right" : ""} ${active ? "text-slate-900" : ""}`}
    >
      {label}<span className="text-blue-600">{arrow}</span>
    </th>
  );
}

function fmtEur(n: any) {
  return (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as any);
}
