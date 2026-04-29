"use client";
import { useEffect, useMemo, useState } from "react";

type Row = {
  key: string;                       // "YYYY-MM-DD|portId"
  date: string | null;
  portId: string | null;
  portName: string | null;
  invoiceNumbers: string[];
  manta: string | null;
  paid: boolean;
  totalPesca: number;
  portRate: number;
  impuestoPuerto: number;
  subtotal: number;
  kofradiaHnd: number;
  federacion: number;
  opegui: number;
  gastosDia: number;
  montemayor: number;
  ss35: number;
  ss40: number;
  gastosBreakdown: { source: string; description: string; amount: number }[];
};

type Totals = {
  totalPesca: number; impuestoPuerto: number; subtotal: number;
  kofradiaHnd: number; federacion: number; opegui: number;
  gastosDia: number; montemayor: number; ss35: number; ss40: number;
};

type SortKey =
  | "date" | "portName" | "invoiceNumbers" | "totalPesca" | "portRate" | "impuestoPuerto"
  | "subtotal" | "kofradiaHnd" | "federacion" | "opegui" | "gastosDia"
  | "montemayor" | "ss35" | "ss40" | "manta" | "paid";
type SortDir = "asc" | "desc";

export default function NominasPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<Record<string, { manta?: string; paid?: boolean }>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const [filterMode, setFilterMode] = useState<"con-manta" | "sin-manta" | "todas">("con-manta");
  const [filterPaid, setFilterPaid] = useState<"todas" | "cobrado" | "pendiente">("todas");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [groupByManta, setGroupByManta] = useState<boolean>(true);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  /** Refresca los datos. Si keepEdits=true, mantiene los cambios pendientes
   *  del usuario en memoria (útil al guardar una sola fila — no perder lo
   *  que estabas editando en otras filas). */
  async function refresh(keepEdits = false) {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to)   params.set("to", to);
    if (filterMode === "con-manta") params.set("withMantaOnly", "true");
    else params.set("withMantaOnly", "false");
    if (filterPaid !== "todas") params.set("paid", filterPaid === "cobrado" ? "true" : "false");

    const r = await fetch(`/api/nominas?${params.toString()}`);
    const j = await r.json();
    let data: Row[] = j.data?.rows ?? [];
    if (filterMode === "sin-manta") data = data.filter(r => !r.manta);
    setRows(data);
    setTotals(j.data?.totals ?? null);
    if (!keepEdits) setEdit({});
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [filterMode, filterPaid, from, to]);

  function setRowEdit(key: string, patch: { manta?: string; paid?: boolean }) {
    setEdit(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function saveOne(row: Row) {
    const e = edit[row.key];
    if (!e) return false;
    const r = await fetch(`/api/nominas/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: row.date,
        portId: row.portId,
        manta: e.manta !== undefined ? e.manta : row.manta,
        paid: e.paid !== undefined ? e.paid : row.paid
      })
    });
    if (!r.ok) { const j = await r.json(); setMsg(j?.error ?? "Error guardando"); return false; }
    return true;
  }

  /** Guarda solo una fila — preserva los cambios en otras filas. */
  async function saveRow(row: Row) {
    const okSaved = await saveOne(row);
    if (!okSaved) return;
    // Quita esta fila del edit pero deja los demás cambios intactos
    setEdit(prev => { const next = { ...prev }; delete next[row.key]; return next; });
    refresh(true);
  }

  /** Guarda TODAS las filas con cambios pendientes en una sola tanda. */
  async function saveAll() {
    const dirtyKeys = Object.keys(edit);
    if (!dirtyKeys.length) return;
    const dirtyRows = rows.filter(r => dirtyKeys.includes(r.key));
    let okCount = 0, failCount = 0;
    for (const row of dirtyRows) {
      const ok = await saveOne(row);
      if (ok) okCount++; else failCount++;
    }
    setMsg(`Guardadas ${okCount} jornada${okCount === 1 ? "" : "s"}${failCount ? ` · ${failCount} fallaron` : ""}.`);
    setEdit({});
    refresh();
  }

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = (a as any)[sortKey];
      const vb = (b as any)[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const byManta = useMemo(() => {
    if (!groupByManta) return [["__flat__", sortedRows]] as [string, Row[]][];
    const groups: Record<string, Row[]> = {};
    for (const r of sortedRows) {
      const k = r.manta ?? "(sin manta)";
      if (!groups[k]) groups[k] = [];
      groups[k].push(r);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [sortedRows, groupByManta]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Nóminas — Asignación de descargas</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Cálculo del montemayor por <b>día y puerto</b> (no por factura). Cada fila es una jornada de trabajo.
            Asigna una <b>manta</b> a cada día que quieras incluir en la nómina y márcalo como <b>cobrado</b> cuando se pague.
            Solo entran días con datos de capturas <b>verificadas</b>.
          </p>
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-4 text-sm">
        <Field label="Mostrar">
          <select className="input" value={filterMode} onChange={e => setFilterMode(e.target.value as any)}>
            <option value="con-manta">Solo con manta asignada</option>
            <option value="sin-manta">Solo sin manta (pendientes)</option>
            <option value="todas">Todas las jornadas</option>
          </select>
        </Field>
        <Field label="Estado">
          <select className="input" value={filterPaid} onChange={e => setFilterPaid(e.target.value as any)}>
            <option value="todas">Cobradas + pendientes</option>
            <option value="cobrado">Solo cobradas</option>
            <option value="pendiente">Solo pendientes</option>
          </select>
        </Field>
        <Field label="Desde">
          <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
        </Field>
        <button className="btn-ghost" onClick={() => { setFrom(""); setTo(""); setFilterMode("con-manta"); setFilterPaid("todas"); }}>
          Reiniciar filtros
        </button>
      </div>

      {msg && <div className="card bg-rose-50 border-rose-200 text-sm text-rose-700">{msg}</div>}

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Jornadas (día×puerto)" value={String(rows.length)} />
          <Kpi label="Total pesca" value={fmtEur(totals.totalPesca)} />
          <Kpi label="Σ Impuestos puerto" value={fmtEur(totals.impuestoPuerto)} />
          <Kpi label="Σ Gastos día" value={fmtEur(totals.gastosDia)} />
          <Kpi label="Σ MONTEMAYOR" value={fmtEur(totals.montemayor)} highlight />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={groupByManta} onChange={e => setGroupByManta(e.target.checked)} />
            <span>Agrupar por manta</span>
          </label>
          <span className="text-xs text-slate-500">Pulsa cualquier cabecera de columna para ordenar.</span>
        </div>
        {Object.keys(edit).length > 0 && (
          <button className="btn-primary" onClick={saveAll}>
            Guardar {Object.keys(edit).length} cambio{Object.keys(edit).length === 1 ? "" : "s"} pendiente{Object.keys(edit).length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="table text-xs">
          <thead>
            <tr>
              <Th k="date"           label="Día"            sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="portName"       label="Puerto"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="invoiceNumbers" label="Capturas"       sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="totalPesca"     label="Total pesca"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="portRate"       label="% imp. puerto"  sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="impuestoPuerto" label="Imp. puerto"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="subtotal"       label="Subtotal"       sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="kofradiaHnd"    label="3% Kofradía"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="federacion"     label="0,1% Fed."      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="opegui"         label="0,4% Opegui"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="gastosDia"      label="Gastos"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right title="Suma de gastos imputados a esta jornada" />
              <Th k="montemayor"     label="Montemayor"     sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="ss35"           label="SS 3,5%"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="ss40"           label="SS 4%"           sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="manta"          label="Manta"          sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="paid"           label="Cobrado"        sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} center />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {byManta.map(([mantaKey, group]) => (
              <RowsByManta key={mantaKey} mantaKey={mantaKey} rows={group} edit={edit} setRowEdit={setRowEdit} saveRow={saveRow} grouped={groupByManta} />
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={17} className="text-center py-10 text-slate-500">
                Sin datos. Comprueba que tienes capturas <b>verificadas</b> con líneas que tengan fecha y, si tienes filtro "con manta", que les hayas asignado una.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  k, label, sortKey, sortDir, onClick, right, center, title
}: {
  k: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  right?: boolean;
  center?: boolean;
  title?: string;
}) {
  const active = sortKey === k;
  const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  const align = right ? "text-right" : center ? "text-center" : "";
  return (
    <th
      onClick={() => onClick(k)}
      className={`cursor-pointer select-none hover:text-slate-900 ${align} ${active ? "text-slate-900" : ""}`}
      title={title ?? "Clic para ordenar"}
    >
      {label}<span className="text-blue-600">{arrow}</span>
    </th>
  );
}

function RowsByManta({ mantaKey, rows, edit, setRowEdit, saveRow, grouped }: any) {
  const groupTotal = rows.reduce((a: number, r: Row) => a + r.montemayor, 0);
  const hasManta = mantaKey && mantaKey !== "(sin manta)" && mantaKey !== "__flat__";
  return (
    <>
      {grouped && (
        <tr className="bg-slate-100">
          <td colSpan={17} className="py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-medium text-slate-700">
                Manta <b className="text-base">{mantaKey}</b> · {rows.length} jornada{rows.length === 1 ? "" : "s"} · Suma montemayor: <b>{fmtEur(groupTotal)}</b>
              </div>
              {hasManta && (
                <a
                  href={`/nominas/manta/${encodeURIComponent(mantaKey)}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition"
                  title={`Ir a la confección de la manta ${mantaKey}`}
                >
                  <span aria-hidden>📋</span>
                  Confeccionar nómina
                  <span aria-hidden>→</span>
                </a>
              )}
            </div>
          </td>
        </tr>
      )}
      {rows.map((r: Row) => {
        const e = edit[r.key] ?? {};
        const dirty = e.manta !== undefined || e.paid !== undefined;
        const capturasLabel = r.invoiceNumbers.length
          ? r.invoiceNumbers.join(" + ")
          : "(s/n)";
        return (
          <tr key={r.key} className={r.paid ? "bg-emerald-50/50" : ""}>
            <td className="whitespace-nowrap">{r.date ? new Date(r.date).toLocaleDateString("es-ES") : "—"}</td>
            <td>{r.portName ?? "—"}</td>
            <td className="font-mono text-[11px]" title={capturasLabel}>
              {capturasLabel.length > 25 ? capturasLabel.slice(0, 22) + "…" : capturasLabel}
            </td>
            <td className="text-right tabular-nums">{fmtEur(r.totalPesca)}</td>
            <td className="text-right tabular-nums text-slate-500">{r.portRate.toFixed(2).replace(".", ",")}%</td>
            <td className="text-right tabular-nums">{fmtEur(r.impuestoPuerto)}</td>
            <td className="text-right tabular-nums">{fmtEur(r.subtotal)}</td>
            <td className="text-right tabular-nums">{fmtEur(r.kofradiaHnd)}</td>
            <td className="text-right tabular-nums">{fmtEur(r.federacion)}</td>
            <td className="text-right tabular-nums">{fmtEur(r.opegui)}</td>
            <td className="text-right tabular-nums" title={r.gastosBreakdown.map(g => `${g.description}: ${fmtEur(g.amount)}`).join("\n") || "Sin gastos imputados"}>
              {fmtEur(r.gastosDia)}
            </td>
            <td className="text-right tabular-nums font-bold">{fmtEur(r.montemayor)}</td>
            <td className="text-right tabular-nums text-slate-600">{fmtEur(r.ss35)}</td>
            <td className="text-right tabular-nums text-slate-600">{fmtEur(r.ss40)}</td>
            <td>
              <input
                className="input text-xs py-1 w-16"
                placeholder="—"
                value={e.manta !== undefined ? e.manta : (r.manta ?? "")}
                onChange={ev => setRowEdit(r.key, { manta: ev.target.value })}
              />
            </td>
            <td className="text-center">
              <input
                type="checkbox"
                checked={e.paid !== undefined ? e.paid : r.paid}
                onChange={ev => setRowEdit(r.key, { paid: ev.target.checked })}
              />
            </td>
            <td>
              {dirty && <button className="btn-primary text-xs py-0.5 px-2" onClick={() => saveRow(r)}>Guardar</button>}
            </td>
          </tr>
        );
      })}
    </>
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

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? "border-emerald-300 bg-emerald-50" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${highlight ? "text-emerald-800" : ""}`}>{value}</div>
    </div>
  );
}

function fmtEur(n: any) {
  return (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
