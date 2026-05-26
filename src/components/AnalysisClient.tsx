"use client";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer
} from "recharts";

const DIM_META: Record<string, { title: string; subtitle: string; primaryKey: string; label: string }> = {
  species:  { title: "Análisis por especie",        subtitle: "Especie normalizada",    primaryKey: "commonName", label: "Especie" },
  port:     { title: "Análisis por puerto",         subtitle: "Distribución por puerto", primaryKey: "portName",   label: "Puerto" },
  supplier: { title: "Análisis por proveedor",      subtitle: "Distribución por cofradía", primaryKey: "name",     label: "Proveedor" },
  daily:    { title: "Capturas por día",            subtitle: "Evolución diaria",        primaryKey: "day",        label: "Día" },
  weekly:   { title: "Capturas por semana",         subtitle: "Evolución semanal (lunes-domingo)", primaryKey: "label", label: "Semana" },
  monthly:  { title: "Capturas por mes",            subtitle: "Evolución mensual",       primaryKey: "month",      label: "Mes" }
};

const COLORS = ["#2563eb", "#0891b2", "#16a34a", "#ea580c", "#db2777", "#9333ea", "#ca8a04", "#059669", "#dc2626", "#475569"];

export function AnalysisClient({ dim, ports, species }: {
  dim: string;
  ports: { id: string; name: string }[];
  species: { id: string; commonName: string }[];
}) {
  const meta = DIM_META[dim];
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [portId, setPortId] = useState<string>("");
  const [speciesId, setSpeciesId] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (portId) p.set("portId", portId);
    if (speciesId) p.set("speciesId", speciesId);
    const r = await fetch(`/api/analysis/${dim}?${p.toString()}`);
    const j = await r.json();
    setData(j.data);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dim, from, to, portId, speciesId]);

  const kpis = data?.kpis;
  const rows = data?.breakdown ?? [];

  // Top 10 by amount (for a more readable chart)
  const top = useMemo(() => rows.slice(0, 10), [rows]);

  if (!meta) return <div>Dimensión desconocida</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{meta.title}</h1>
        <p className="text-sm text-slate-500">{meta.subtitle} · <span className="italic">solo facturas verificadas</span></p>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="label">Desde</span>
            <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Hasta</span>
            <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Puerto</span>
            <select className="input" value={portId} onChange={e => setPortId(e.target.value)}>
              <option value="">Todos</option>
              {ports.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Especie</span>
            <select className="input" value={speciesId} onChange={e => setSpeciesId(e.target.value)}>
              <option value="">Todas</option>
              {species.map(s => <option key={s.id} value={s.id}>{s.commonName}</option>)}
            </select>
          </label>
        </div>
        {loading && <div className="text-xs text-slate-500 mt-2">Recalculando...</div>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Facturas" value={kpis?.invoices ?? 0} />
        <Kpi label="Líneas" value={kpis?.lines ?? 0} />
        <Kpi label="Kilos" value={fmtKg(kpis?.kilos)} />
        <Kpi label="Importe" value={fmtEur(kpis?.amount)} />
        <Kpi label="€/Kg medio" value={fmtNum(kpis?.avgPrice, 3)} />
      </div>

      {/* Gráficos según dimensión */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Chart primario: barras */}
        <div className="card">
          <h2 className="font-semibold mb-3">
            {dim === "daily" || dim === "weekly" || dim === "monthly" ? "Kilos e importe por periodo" : `Top 10 por importe · ${meta.label}`}
          </h2>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              {dim === "daily" || dim === "weekly" || dim === "monthly" ? (
                <LineChart data={dim === "daily" ? [...rows].reverse() : rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey={meta.primaryKey} />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip formatter={(v: any, n: string) => n === "kilos" ? `${fmtKg(v)}` : `${fmtEur(v)}`} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="kilos" name="Kilos" stroke={COLORS[0]} strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="amount" name="Importe €" stroke={COLORS[3]} strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <BarChart data={top}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey={meta.primaryKey} angle={-20} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip formatter={(v: any) => fmtEur(v)} />
                  <Bar dataKey="amount" name="Importe €" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart secundario: tarta (distribución %) */}
        <div className="card">
          <h2 className="font-semibold mb-3">Distribución (por importe)</h2>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={top}
                  dataKey="amount"
                  nameKey={meta.primaryKey}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={110}
                  paddingAngle={2}
                  label={(entry: any) => entry[meta.primaryKey]}
                >
                  {top.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtEur(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabla detallada */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 font-semibold">Detalle</div>
        <div className="overflow-auto">
          <table className="table min-w-full">
            <thead>
              <tr>
                <th>{meta.label}</th>
                {(dim === "daily") && <th>Puerto</th>}
                {(dim === "weekly") && <th>Periodo</th>}
                <th className="text-center">Kilos</th>
                <th className="text-center">Importe</th>
                {(dim === "species" || dim === "port" || dim === "supplier") && <th className="text-center">Facturas</th>}
                {dim === "species" && <th className="text-center">€/Kg medio</th>}
                {dim === "monthly" && <th className="text-center">Facturas</th>}
                {dim === "weekly" && <th className="text-center">Facturas</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r[meta.primaryKey] ?? "—"}</td>
                  {dim === "daily" && <td>{r.portName ?? "—"}</td>}
                  {dim === "weekly" && <td className="text-slate-600">{r.weekStart} – {r.weekEnd}</td>}
                  <td className="text-center tabular-nums">{fmtKg(r.kilos)}</td>
                  <td className="text-center tabular-nums">{fmtEur(r.amount)}</td>
                  {(dim === "species" || dim === "port" || dim === "supplier") && <td className="text-center tabular-nums">{r.invoices ?? "—"}</td>}
                  {dim === "species" && <td className="text-center tabular-nums">{fmtNum(r.avgPrice, 3)}</td>}
                  {dim === "monthly" && <td className="text-center tabular-nums">{r.invoices ?? "—"}</td>}
                  {dim === "weekly" && <td className="text-center tabular-nums">{r.invoices ?? "—"}</td>}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="text-center py-6 text-slate-500">Sin datos con esos filtros</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

/**
 * Formateadores ES-ES manuales — no dependen de Intl/full-icu en el runtime
 * (en Windows a veces Node no tiene los datos de locale completos y los
 * separadores de miles no se aplican). Así garantizamos "1.999,60" siempre.
 */
function fmtNumES(n: any, decimals = 2): string {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  const fixed = Math.abs(v).toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart ? `${sign}${grouped},${decPart}` : `${sign}${grouped}`;
}
const fmtEur = (n: any) => `${fmtNumES(n, 2)} €`;
const fmtKg = (n: any) => `${fmtNumES(n, 2)} kg`;
const fmtNum = (n: any, d = 2) => fmtNumES(n, d);
