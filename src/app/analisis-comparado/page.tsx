"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid
} from "recharts";

type Metric = "amount" | "kilos" | "avgPrice";

const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: "amount", label: "Importe (€)", unit: "€" },
  { key: "kilos", label: "Kilos", unit: "kg" },
  { key: "avgPrice", label: "Precio medio (€/kg)", unit: "€/kg" }
];

const MONTH_NAMES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

export default function AnalisisComparadoPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [portId, setPortId] = useState<string>("");
  const [speciesId, setSpeciesId] = useState<string>("");
  const [refDate, setRefDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [metric, setMetric] = useState<Metric>("amount");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (refDate) params.set("refDate", refDate);
    if (portId) params.set("portId", portId);
    if (speciesId) params.set("speciesId", speciesId);
    fetch(`/api/yoy?${params.toString()}`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => { setData(j.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [refDate, portId, speciesId]);

  useEffect(() => { load(); }, [load]);

  // Los desplegables de Puerto y Especie usan los datos del propio YoY, que
  // solo trae los que TIENEN datos en los dos años comparados. Así no aparecen
  // opciones vacías que no llevarían a ningún sitio.
  const ports = data?.availablePorts ?? [];
  const species = data?.availableSpecies ?? [];

  // Si el puerto/especie seleccionado ya no aparece en los disponibles (porque
  // ha cambiado la fecha de referencia y los años comparados son otros), lo
  // limpiamos para que no quede un filtro "fantasma" invisible.
  useEffect(() => {
    if (!data) return;
    if (portId && !ports.some((p: any) => p.id === portId)) setPortId("");
    if (speciesId && !species.some((s: any) => s.id === speciesId)) setSpeciesId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading || !data) {
    return <div className="p-8 text-slate-500">Calculando análisis comparado...</div>;
  }

  const { kpis, daily, monthly, bySpecies, byPort, meta } = data;

  return (
    <div className="space-y-6">
      {/* Cabecera + filtros */}
      <div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Análisis comparado</h1>
            <p className="text-xs text-slate-500 mt-1">
              Comparativo a tiempo constante: <b>{meta.thisYear}</b> vs <b>{meta.lastYear}</b> hasta
              el mismo día del año (día {meta.dayOfYear}).
              Importes sin IVA (base imponible). Solo facturas verificadas.
            </p>
          </div>
          <button onClick={load} className="btn-ghost text-sm" title="Recalcular">🔄 Actualizar</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 card">
          <Field label="Fecha de referencia">
            <input type="date" className="input" value={refDate} onChange={e => setRefDate(e.target.value)} />
          </Field>
          <Field label="Puerto (todos por defecto)">
            <select className="input" value={portId} onChange={e => setPortId(e.target.value)}>
              <option value="">— Todos —</option>
              {ports.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Especie (todas por defecto)">
            <select className="input" value={speciesId} onChange={e => setSpeciesId(e.target.value)}>
              <option value="">— Todas —</option>
              {species.map((s: any) => <option key={s.id} value={s.id}>{s.commonName}</option>)}
            </select>
          </Field>
          <Field label="Métrica">
            <select className="input" value={metric} onChange={e => setMetric(e.target.value as Metric)}>
              {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Bloque 1 — KPIs comparativos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiYoy label="Importe acumulado" thisVal={kpis.this.amount} lastVal={kpis.last.amount} fmt={fmtEur} />
        <KpiYoy label="Kilos acumulados"   thisVal={kpis.this.kilos} lastVal={kpis.last.kilos} fmt={fmtKg} />
        <KpiYoy label="Precio medio €/kg"  thisVal={kpis.this.avgPrice} lastVal={kpis.last.avgPrice} fmt={(n: number) => fmtNum(n, 3) + " €"} />
        <KpiYoy label="Nº de descargas"    thisVal={kpis.this.invoices} lastVal={kpis.last.invoices} fmt={(n: number) => String(n)} />
      </div>

      {/* Bloque 2 — Curva acumulada */}
      <div className="card">
        <h2 className="font-semibold mb-1">Evolución acumulada — {METRICS.find(m => m.key === metric)?.label}</h2>
        <p className="text-xs text-slate-500 mb-3">
          Cada línea es el acumulado del año desde el 1 de enero. La línea de <b>{meta.thisYear}</b> se corta en el día actual; la de <b>{meta.lastYear}</b> recorre todo el año.
        </p>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={daily} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" tickFormatter={dayToMonthLabel} interval={29} />
              <YAxis tickFormatter={(v) => compactNumber(v)} />
              <Tooltip
                labelFormatter={(d: any) => `Día ${d} (${dayToFullLabel(d)})`}
                formatter={(value: any, name: string) => {
                  const v = Number(value);
                  const fmtV = metric === "amount" ? fmtEur(v) : metric === "kilos" ? fmtKg(v) : fmtNum(v, 3) + " €/kg";
                  return [fmtV, name];
                }}
              />
              <Legend />
              <Line
                type="monotone" dot={false} strokeWidth={2.5}
                stroke="#2563eb" name={`${meta.thisYear} (acumulado)`}
                dataKey={metric === "avgPrice" ? avgPriceCum("this") : (metric === "amount" ? "thisCumAmount" : "thisCumKilos")}
              />
              <Line
                type="monotone" dot={false} strokeWidth={2} strokeDasharray="6 4"
                stroke="#94a3b8" name={`${meta.lastYear} (acumulado)`}
                dataKey={metric === "avgPrice" ? avgPriceCum("last") : (metric === "amount" ? "lastCumAmount" : "lastCumKilos")}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bloque 3 — Comparativa mensual */}
      <div className="card">
        <h2 className="font-semibold mb-1">Comparativa por mes — {METRICS.find(m => m.key === metric)?.label}</h2>
        <p className="text-xs text-slate-500 mb-3">
          Cada par de barras compara el mes en {meta.lastYear} (gris) vs {meta.thisYear} (azul).
        </p>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart
              data={monthly.map((m: any) => ({
                month: MONTH_NAMES[m.month - 1],
                this: monthlyMetricValue(m, metric, "this"),
                last: monthlyMetricValue(m, metric, "last")
              }))}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v) => compactNumber(v)} />
              <Tooltip formatter={(value: any) => {
                const v = Number(value);
                return metric === "amount" ? fmtEur(v) : metric === "kilos" ? fmtKg(v) : fmtNum(v, 3) + " €/kg";
              }} />
              <Legend />
              <Bar dataKey="last" fill="#94a3b8" name={String(meta.lastYear)} />
              <Bar dataKey="this" fill="#2563eb" name={String(meta.thisYear)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bloque 4 — Tablas YoY */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="font-semibold">Por especie ({meta.lastYear} vs {meta.thisYear})</h2>
            <p className="text-xs text-slate-500 mt-0.5">Hasta el mismo día del año en ambos. Pulsa la cabecera para ordenar.</p>
          </div>
          <YoyTable rows={bySpecies} thisYear={meta.thisYear} lastYear={meta.lastYear} labelCol="Especie" />
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="font-semibold">Por puerto ({meta.lastYear} vs {meta.thisYear})</h2>
            <p className="text-xs text-slate-500 mt-0.5">Hasta el mismo día del año en ambos. Pulsa la cabecera para ordenar.</p>
          </div>
          <YoyTable rows={byPort} thisYear={meta.thisYear} lastYear={meta.lastYear} labelCol="Puerto" />
        </div>
      </div>
    </div>
  );
}

/* ─────────── Componentes auxiliares ─────────── */

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function KpiYoy({ label, thisVal, lastVal, fmt }: { label: string; thisVal: number; lastVal: number; fmt: (n: number) => string }) {
  const delta = lastVal > 0 ? ((thisVal - lastVal) / lastVal) * 100 : (thisVal > 0 ? 100 : 0);
  const positive = delta >= 0;
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{fmt(thisVal)}</div>
      <div className="text-[11px] text-slate-500 mt-1">
        Año anterior al mismo día: <b className="tabular-nums">{fmt(lastVal)}</b>
      </div>
      <div className={`text-sm font-semibold mt-1 ${positive ? "text-emerald-700" : "text-rose-700"}`}>
        {positive ? "▲" : "▼"} {fmtPct(Math.abs(delta))} vs año anterior
      </div>
    </div>
  );
}

function YoyTable({ rows, thisYear, lastYear, labelCol }:
  { rows: any[]; thisYear: number; lastYear: number; labelCol: string }) {
  const [sortKey, setSortKey] = useState<string>("thisAmount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // useMemo SIEMPRE antes de cualquier return (regla de hooks de React).
  const sorted = useMemo(() => {
    if (!rows?.length) return [];
    return [...rows].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      const na = Number(va), nb = Number(vb);
      const bothNum = Number.isFinite(na) && Number.isFinite(nb);
      const cmp = bothNum ? (na - nb) : String(va ?? "").localeCompare(String(vb ?? ""), "es");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  if (!rows?.length) return <div className="p-4 text-sm text-slate-500">Sin datos</div>;

  const onSort = (k: string) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };
  const ind = (k: string) => sortKey === k
    ? <span className="text-blue-600 ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
    : <span className="text-slate-300 ml-1">↕</span>;

  return (
    <div className="overflow-x-auto">
      <table className="table text-sm">
        <thead>
          <tr>
            <th className="cursor-pointer whitespace-nowrap" onClick={() => onSort("label")}>{labelCol}{ind("label")}</th>
            <th className="text-right cursor-pointer whitespace-nowrap" onClick={() => onSort("lastKilos")}>Kilos {lastYear}{ind("lastKilos")}</th>
            <th className="text-right cursor-pointer whitespace-nowrap" onClick={() => onSort("thisKilos")}>Kilos {thisYear}{ind("thisKilos")}</th>
            <th className="text-right cursor-pointer whitespace-nowrap" onClick={() => onSort("_kilosDelta")}>Δ kg</th>
            <th className="text-right cursor-pointer whitespace-nowrap" onClick={() => onSort("lastAmount")}>€ {lastYear}{ind("lastAmount")}</th>
            <th className="text-right cursor-pointer whitespace-nowrap" onClick={() => onSort("thisAmount")}>€ {thisYear}{ind("thisAmount")}</th>
            <th className="text-right cursor-pointer whitespace-nowrap" onClick={() => onSort("_amountDelta")}>Δ €</th>
            <th className="text-right cursor-pointer whitespace-nowrap" onClick={() => onSort("lastAvgPrice")}>€/kg {lastYear}{ind("lastAvgPrice")}</th>
            <th className="text-right cursor-pointer whitespace-nowrap" onClick={() => onSort("thisAvgPrice")}>€/kg {thisYear}{ind("thisAvgPrice")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => {
            const dK = pctDelta(r.thisKilos, r.lastKilos);
            const dA = pctDelta(r.thisAmount, r.lastAmount);
            return (
              <tr key={r.key}>
                <td className="whitespace-nowrap">{r.label}</td>
                <td className="text-right tabular-nums whitespace-nowrap">{fmtKg(r.lastKilos)}</td>
                <td className="text-right tabular-nums whitespace-nowrap">{fmtKg(r.thisKilos)}</td>
                <td className={`text-right tabular-nums whitespace-nowrap font-medium ${dK.cls}`}>{dK.label}</td>
                <td className="text-right tabular-nums whitespace-nowrap">{fmtEur(r.lastAmount)}</td>
                <td className="text-right tabular-nums whitespace-nowrap">{fmtEur(r.thisAmount)}</td>
                <td className={`text-right tabular-nums whitespace-nowrap font-medium ${dA.cls}`}>{dA.label}</td>
                <td className="text-right tabular-nums whitespace-nowrap">{fmtNum(r.lastAvgPrice, 3)}</td>
                <td className="text-right tabular-nums whitespace-nowrap">{fmtNum(r.thisAvgPrice, 3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────── Utilidades ─────────── */

function monthlyMetricValue(m: any, metric: Metric, side: "this" | "last"): number {
  if (metric === "amount") return side === "this" ? m.thisAmount : m.lastAmount;
  if (metric === "kilos") return side === "this" ? m.thisKilos : m.lastKilos;
  // avgPrice
  const a = side === "this" ? m.thisAmount : m.lastAmount;
  const k = side === "this" ? m.thisKilos : m.lastKilos;
  return k > 0 ? a / k : 0;
}

/** dataKey "virtual" para la curva avgPrice (calculada en el render desde this/last cum). */
function avgPriceCum(side: "this" | "last") {
  return (row: any) => {
    const a = side === "this" ? row.thisCumAmount : row.lastCumAmount;
    const k = side === "this" ? row.thisCumKilos : row.lastCumKilos;
    return k > 0 ? a / k : 0;
  };
}

function pctDelta(now: number, prev: number): { label: string; cls: string } {
  if (prev <= 0 && now <= 0) return { label: "—", cls: "text-slate-400" };
  if (prev <= 0) return { label: "+∞", cls: "text-emerald-700" };
  const d = ((now - prev) / prev) * 100;
  const sign = d >= 0 ? "+" : "";
  const cls = d >= 0 ? "text-emerald-700" : "text-rose-700";
  return { label: `${sign}${fmtPct(d)}`, cls };
}

function dayToMonthLabel(d: number): string {
  // Convierte día del año a una etiqueta tipo "Ene 1", "Feb 1"...
  const date = new Date(2024, 0, d);   // 2024 es bisiesto: cubre 366
  return MONTH_NAMES[date.getMonth()] + " " + date.getDate();
}

function dayToFullLabel(d: number): string {
  const date = new Date(2024, 0, d);
  return date.getDate() + " " + MONTH_NAMES[date.getMonth()];
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
const fmtKg = (n: any) => `${fmtNumES(n, 2)} kg`;
const fmtNum = (n: any, d = 2) => fmtNumES(n, d);
const fmtPct = (n: number) => `${fmtNumES(n, 1)}%`;
function compactNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}
