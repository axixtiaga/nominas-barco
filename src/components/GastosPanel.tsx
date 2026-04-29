"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";

type ExpenseStats = {
  kpis: {
    verifiedTotal: number;
    verifiedBase: number;
    verifiedVat: number;
    verifiedCount: number;
    draftCount: number;
    failedCount: number;
    computableTotal: number;
  };
  byCategory: { category: string; count: number; total: number }[];
  bySupplier: { supplierId: string | null; supplierName: string; count: number; total: number }[];
  byMonth: { month: string; count: number; total: number }[];
  byDay: { day: string; count: number; total: number }[];
};

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#a855f7", "#64748b"];

export function GastosPanel() {
  const [data, setData] = useState<ExpenseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Orden de tablas
  const [catSort, setCatSort] = useState<{ k: string; dir: "asc" | "desc" }>({ k: "total", dir: "desc" });
  const [supSort, setSupSort] = useState<{ k: string; dir: "asc" | "desc" }>({ k: "total", dir: "desc" });

  async function refresh() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const r = await fetch(`/api/dashboard/expenses?${params.toString()}`);
    const j = await r.json();
    setData(j.data);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [from, to]);

  function sortBy<T>(arr: T[], key: string, dir: "asc" | "desc"): T[] {
    return [...arr].sort((a: any, b: any) => {
      const va = a[key], vb = b[key];
      if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
      return dir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  // IMPORTANTE: los hooks (useMemo) deben llamarse SIEMPRE en el mismo orden
  // y antes de cualquier return condicional. Por eso usamos data?.X ?? [].
  const sortedCat = useMemo(() => sortBy(data?.byCategory ?? [], catSort.k, catSort.dir), [data, catSort]);
  const sortedSup = useMemo(() => sortBy(data?.bySupplier ?? [], supSort.k, supSort.dir), [data, supSort]);

  if (!data) return <div className="text-sm text-slate-500">Cargando datos de gastos...</div>;

  // Datos para gráficas
  const monthlyChart = data.byMonth.map(m => ({
    name: m.month,
    Total: m.total,
    Facturas: m.count
  }));
  const dailyChart = data.byDay.slice(-30).map(d => ({  // últimos 30 días con datos
    name: d.day.slice(5),  // MM-DD
    Total: d.total
  }));
  const categoryPie = data.byCategory.map((c, i) => ({
    name: c.category,
    value: c.total,
    color: COLORS[i % COLORS.length]
  }));

  return (
    <div className="space-y-6">
      {/* Filtros + acciones */}
      <div className="card flex flex-wrap items-end justify-between gap-4 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Desde">
            <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
          </Field>
          <button className="btn-ghost" onClick={() => { setFrom(""); setTo(""); }}>Quitar filtros</button>
          {(from || to) && <span className="text-xs text-slate-500">Filtrando por rango de fechas</span>}
        </div>
        <Link href="/analysis/expenses" className="btn-primary">
          Ver análisis detallado →
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiBox label="Gastos verificados" value={fmtEur(data.kpis.verifiedTotal)} subtitle={`${data.kpis.verifiedCount} factura${data.kpis.verifiedCount === 1 ? "" : "s"}`} />
        <KpiBox label="Base imponible" value={fmtEur(data.kpis.verifiedBase)} />
        <KpiBox label="IVA" value={fmtEur(data.kpis.verifiedVat)} />
        <KpiBox label="Total → montemayor" value={fmtEur(data.kpis.computableTotal)} subtitle="Líneas marcadas para descontar" highlight />
      </div>

      {data.kpis.draftCount > 0 && (
        <Link href="/documents" className="block card border-amber-300 bg-amber-50 hover:ring-2 hover:ring-amber-300 transition">
          <div className="text-sm text-amber-800">
            ⚠️ Tienes <b>{data.kpis.draftCount}</b> gasto{data.kpis.draftCount === 1 ? "" : "s"} pendiente{data.kpis.draftCount === 1 ? "" : "s"} de revisar.
            <span className="text-amber-700 ml-1 underline">Revisar ahora →</span>
          </div>
        </Link>
      )}

      {/* Gráficas — fila 1 */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Evolución mensual */}
        <div className="card">
          <h3 className="font-semibold mb-3">Evolución mensual</h3>
          {monthlyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtEurShort(v)} />
                <Tooltip formatter={(v: any) => fmtEur(v)} />
                <Bar dataKey="Total" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-sm text-slate-500 py-8 text-center">Sin datos en el rango.</div>}
        </div>

        {/* Distribución por categoría */}
        <div className="card">
          <h3 className="font-semibold mb-3">Distribución por categoría</h3>
          {categoryPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={categoryPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => `${e.name}: ${pct(e.percent)}`}>
                  {categoryPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtEur(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="text-sm text-slate-500 py-8 text-center">Sin datos en el rango.</div>}
        </div>
      </div>

      {/* Gráfica de evolución diaria */}
      {dailyChart.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3">Evolución diaria (últimos 30 días con gastos)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtEurShort(v)} />
              <Tooltip formatter={(v: any) => fmtEur(v)} />
              <Line type="monotone" dataKey="Total" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tablas ordenables */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Por categoría</h3>
            <Link href="/analysis/expenses?groupBy=category" className="text-xs text-blue-600 hover:underline">Ver detalle →</Link>
          </div>
          <SortableTable
            rows={sortedCat}
            sort={catSort}
            setSort={setCatSort}
            cols={[
              { k: "category", l: "Categoría" },
              { k: "count", l: "Nº", right: true },
              { k: "total", l: "Total", fmt: fmtEur, right: true }
            ]}
          />
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Top proveedores</h3>
            <Link href="/analysis/expenses?groupBy=supplier" className="text-xs text-blue-600 hover:underline">Ver detalle →</Link>
          </div>
          <SortableTable
            rows={sortedSup.slice(0, 15)}
            sort={supSort}
            setSort={setSupSort}
            cols={[
              { k: "supplierName", l: "Proveedor" },
              { k: "count", l: "Nº", right: true },
              { k: "total", l: "Total", fmt: fmtEur, right: true }
            ]}
          />
        </div>
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

function KpiBox({ label, value, subtitle, highlight }: { label: string; value: any; subtitle?: string; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? "border-emerald-300 bg-emerald-50" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${highlight ? "text-emerald-800" : ""}`}>{value}</div>
      {subtitle && <div className="text-[11px] text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function SortableTable({
  rows, cols, sort, setSort
}: {
  rows: any[];
  cols: { k: string; l: string; fmt?: (v: any) => any; right?: boolean }[];
  sort: { k: string; dir: "asc" | "desc" };
  setSort: (s: { k: string; dir: "asc" | "desc" }) => void;
}) {
  if (!rows?.length) return <div className="text-sm text-slate-500">Sin datos</div>;
  function toggleSort(k: string) {
    if (sort.k === k) setSort({ k, dir: sort.dir === "asc" ? "desc" : "asc" });
    else setSort({ k, dir: "desc" });
  }
  return (
    <table className="table">
      <thead>
        <tr>
          {cols.map(c => {
            const active = sort.k === c.k;
            const arrow = active ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
            return (
              <th
                key={c.k}
                className={`cursor-pointer select-none hover:text-slate-900 ${c.right ? "text-center" : ""} ${active ? "text-slate-900" : ""}`}
                onClick={() => toggleSort(c.k)}
              >
                {c.l}<span className="text-blue-600">{arrow}</span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {cols.map(c => (
              <td key={c.k} className={c.right ? "text-center tabular-nums" : ""}>
                {c.fmt ? c.fmt(r[c.k]) : (r[c.k] ?? "—")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmtNumES(n: any, decimals = 2): string {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  const fixed = Math.abs(v).toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart ? `${sign}${grouped},${decPart}` : `${sign}${grouped}`;
}
const fmtEur = (n: any) => `${fmtNumES(n, 2)} €`;
const fmtEurShort = (n: any) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k €`;
  return `${v.toFixed(0)} €`;
};
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
