"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Expense = any;

type SortKey = "issueDate" | "expenseNumber" | "supplierName" | "category" | "concept" | "baseAmount" | "vatAmount" | "totalAmount" | "status";
type SortDir = "asc" | "desc";

const CATEGORIES = ["", "COFRADIA", "COMBUSTIBLE", "HIELO", "VIVERES", "TELEFONIA", "TRANSPORTE", "MANTENIMIENTO", "OTRO"];

export default function ExpensesAnalysisPage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState<string>("");
  const [supplier, setSupplier] = useState<string>("");
  const [status, setStatus] = useState<string>("VERIFIED");
  const [search, setSearch] = useState("");

  // Orden
  const [sortKey, setSortKey] = useState<SortKey>("issueDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function refresh() {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const r = await fetch(`/api/expenses?${params.toString()}`);
    const j = await r.json();
    setRows(Array.isArray(j.data) ? j.data : []);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [status]);

  // Filtrado en cliente para los filtros adicionales
  const filtered = useMemo(() => {
    let arr = rows;
    if (from) arr = arr.filter(r => r.issueDate && r.issueDate.slice(0, 10) >= from);
    if (to)   arr = arr.filter(r => r.issueDate && r.issueDate.slice(0, 10) <= to);
    if (category) arr = arr.filter(r => r.category === category);
    if (supplier) arr = arr.filter(r => (r.supplier?.name ?? "").toLowerCase().includes(supplier.toLowerCase()));
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter(r =>
        (r.expenseNumber ?? "").toLowerCase().includes(s) ||
        (r.concept ?? "").toLowerCase().includes(s) ||
        (r.supplier?.name ?? "").toLowerCase().includes(s) ||
        (r.document?.filename ?? "").toLowerCase().includes(s)
      );
    }
    return arr;
  }, [rows, from, to, category, supplier, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: any, vb: any;
      switch (sortKey) {
        case "issueDate":     va = a.issueDate ?? ""; vb = b.issueDate ?? ""; break;
        case "supplierName":  va = a.supplier?.name ?? ""; vb = b.supplier?.name ?? ""; break;
        case "baseAmount":    va = Number(a.baseAmount); vb = Number(b.baseAmount); break;
        case "vatAmount":     va = Number(a.vatAmount); vb = Number(b.vatAmount); break;
        case "totalAmount":   va = Number(a.totalAmount); vb = Number(b.totalAmount); break;
        default:              va = (a as any)[sortKey] ?? ""; vb = (b as any)[sortKey] ?? "";
      }
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  // Total agregado de lo filtrado
  const total = sorted.reduce((a, r) => a + Number(r.totalAmount || 0), 0);

  return (
    <div className="space-y-4">
      <Link href="/panel" className="text-sm text-blue-600 hover:underline">← Volver al panel</Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Análisis detallado de Gastos</h1>
          <p className="text-xs text-slate-500 mt-1">
            Lista completa de gastos. Filtra, ordena y exporta.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="card grid grid-cols-1 md:grid-cols-6 gap-3 text-sm items-end">
        <Field label="Estado">
          <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="VERIFIED">Verificados</option>
            <option value="DRAFT">Pendientes</option>
            <option value="">Todos</option>
          </select>
        </Field>
        <Field label="Categoría">
          <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c || "Todas"}</option>)}
          </select>
        </Field>
        <Field label="Desde">
          <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
        </Field>
        <Field label="Proveedor">
          <input className="input" placeholder="Filtrar por nombre" value={supplier} onChange={e => setSupplier(e.target.value)} />
        </Field>
        <Field label="Búsqueda libre">
          <input className="input" placeholder="Nº, concepto, archivo..." value={search} onChange={e => setSearch(e.target.value)} />
        </Field>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi label="Resultados visibles" value={String(sorted.length)} />
        <Kpi label="Total en filtro" value={fmtEur(total)} highlight />
        <button className="btn-ghost text-sm" onClick={() => { setFrom(""); setTo(""); setCategory(""); setSupplier(""); setSearch(""); setStatus("VERIFIED"); }}>
          Limpiar filtros
        </button>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-x-auto">
        <table className="table text-sm">
          <thead>
            <tr>
              <Th k="issueDate"     label="Fecha"      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="expenseNumber" label="Nº"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="supplierName"  label="Proveedor"  sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="concept"       label="Concepto"   sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="category"      label="Categoría"  sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <Th k="baseAmount"    label="Base"       sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="vatAmount"     label="IVA"        sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="totalAmount"   label="Total"      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
              <Th k="status"        label="Estado"     sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{r.issueDate ? new Date(r.issueDate).toLocaleDateString("es-ES") : "—"}</td>
                <td className="font-mono text-xs">{r.expenseNumber ?? "—"}</td>
                <td className="text-sm">{r.supplier?.name ?? <span className="text-slate-400">—</span>}</td>
                <td className="text-xs text-slate-600 max-w-[280px] truncate" title={r.concept ?? ""}>{r.concept ?? "—"}</td>
                <td className="text-xs">{r.category ?? "—"}</td>
                <td className="text-right tabular-nums">{fmtEur(r.baseAmount)}</td>
                <td className="text-right tabular-nums">{fmtEur(r.vatAmount)}</td>
                <td className="text-right tabular-nums font-medium">{fmtEur(r.totalAmount)}</td>
                <td className="text-xs">{r.status}</td>
                <td><Link className="text-xs text-blue-600 hover:underline" href={`/documents/${r.document?.id ?? r.documentId}`}>Abrir →</Link></td>
              </tr>
            ))}
            {!sorted.length && !loading && (
              <tr><td colSpan={10} className="text-center py-8 text-slate-500">
                Sin resultados con esos filtros.
              </td></tr>
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={7} className="text-right text-xs uppercase tracking-wide text-slate-500">Total filtrado:</td>
                <td className="text-right tabular-nums font-bold">{fmtEur(total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
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

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? "border-emerald-300 bg-emerald-50" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${highlight ? "text-emerald-800" : ""}`}>{value}</div>
    </div>
  );
}

function Th({ k, label, sortKey, sortDir, onClick, right, center }: any) {
  const active = sortKey === k;
  const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  const align = right ? "text-right" : center ? "text-center" : "";
  return (
    <th
      onClick={() => onClick(k)}
      className={`cursor-pointer select-none hover:text-slate-900 ${align} ${active ? "text-slate-900" : ""}`}
    >
      {label}<span className="text-blue-600">{arrow}</span>
    </th>
  );
}

function fmtEur(n: any) {
  return (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
