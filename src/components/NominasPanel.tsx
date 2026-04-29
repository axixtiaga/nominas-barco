"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from "recharts";

type Manta = {
  manta: string;
  periodFrom: string | null;
  periodTo: string | null;
  totalIngresos: number;
  totalGastos: number;
  liquidoMonteMayor: number;
  liquidoBruto: number;
  importePorParte: number;
  totalLiquidoAPercibir: number;
  totalIrpfRetenido: number;
};
type SailorAgg = { sailorId: string; name: string; role: string; partsCount: number; totalImporteManta: number; totalIrpf: number; totalLiquido: number };
type MonthAgg = { month: string; mantas: number; totalIngresos: number; totalGastos: number; totalLiquidoBruto: number; totalLiquidoAPercibir: number };

type PayrollData = {
  mantas: Manta[];
  bySailor: SailorAgg[];
  byMonth: MonthAgg[];
  totalMantas: number;
  availableMantas: string[];
  availableMonths: string[];
  filters: { manta: string; month: string };
};

export function NominasPanel() {
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterManta, setFilterManta] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterManta) params.set("manta", filterManta);
    if (filterMonth) params.set("month", filterMonth);
    const qs = params.toString();
    fetch(`/api/dashboard/payroll${qs ? "?" + qs : ""}`)
      .then(r => r.json())
      .then(j => setData(j.data))
      .finally(() => setLoading(false));
  }, [filterManta, filterMonth]);

  function clearFilters() {
    setFilterManta("");
    setFilterMonth("");
  }

  const totalLiquidoAcum = useMemo(
    () => data?.mantas.reduce((a, m) => a + m.totalLiquidoAPercibir, 0) ?? 0,
    [data]
  );

  if (!data) return <div className="text-sm text-slate-500">Cargando datos de nóminas...</div>;

  const hasFilters = !!(filterManta || filterMonth);
  const noMantasGlobally = (data.availableMantas?.length ?? 0) === 0;

  if (noMantasGlobally) {
    return (
      <div className="card text-center py-10">
        <div className="text-4xl mb-2">📋</div>
        <div className="text-lg font-medium">Sin mantas confeccionadas todavía</div>
        <div className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
          Para que aparezcan datos aquí, asigna una <b>manta</b> a las jornadas en
          <Link className="text-blue-600 underline mx-1" href="/nominas">Nóminas</Link>
          y crea tus marineros en
          <Link className="text-blue-600 underline mx-1" href="/sailors">Marineros</Link>.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Filtrar por manta</label>
          <select
            className="border border-slate-300 rounded px-2 py-1.5 text-sm min-w-[160px]"
            value={filterManta}
            onChange={e => setFilterManta(e.target.value)}
          >
            <option value="">Todas las mantas</option>
            {data.availableMantas.map(m => (
              <option key={m} value={m}>Manta {m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Filtrar por mes (validación)</label>
          <select
            className="border border-slate-300 rounded px-2 py-1.5 text-sm min-w-[160px]"
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
          >
            <option value="">Todos los meses</option>
            {data.availableMonths.map(m => (
              <option key={m} value={m}>{formatMonthLabel(m)}</option>
            ))}
          </select>
          <div className="text-[11px] text-slate-500 mt-1">Solo mantas con fecha de validación en ese mes</div>
        </div>
        {hasFilters && (
          <button
            className="text-xs text-blue-600 hover:underline mb-1"
            onClick={clearFilters}
          >
            Limpiar filtros
          </button>
        )}
        {loading && <span className="text-xs text-slate-500 mb-1">Actualizando…</span>}
      </div>

      {data.totalMantas === 0 && hasFilters && (
        <div className="card text-center py-8 text-sm text-slate-600">
          No hay mantas que coincidan con los filtros seleccionados.
          <div className="text-xs text-slate-500 mt-1">
            (Recuerda que el filtro por mes solo muestra mantas <b>validadas</b> en ese mes.)
          </div>
        </div>
      )}

      {data.totalMantas > 0 && (<>
      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Mantas confeccionadas" value={String(data.totalMantas)} />
        <Kpi label="Marineros con cobro" value={String(data.bySailor.length)} />
        <Kpi label="Σ líquido a percibir (todas las mantas)" value={fmtEur(totalLiquidoAcum)} highlight />
        <Kpi label="Σ IRPF retenido" value={fmtEur(data.mantas.reduce((a, m) => a + m.totalIrpfRetenido, 0))} />
      </div>

      {/* Gráfica: liquido bruto por mes */}
      {data.byMonth.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3">Líquido a percibir por mes</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.byMonth.map(m => ({ name: m.month, "Líquido a percibir": m.totalLiquidoAPercibir, "Ingresos": m.totalIngresos }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtEurShort(v)} />
              <Tooltip formatter={(v: any) => fmtEur(v)} />
              <Legend />
              <Bar dataKey="Ingresos" fill="#94a3b8" />
              <Bar dataKey="Líquido a percibir" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla mantas */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold">Histórico de mantas</h3>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Manta</th>
              <th>Período</th>
              <th className="text-right">Ingresos</th>
              <th className="text-right">Gastos</th>
              <th className="text-right">Líquido MM</th>
              <th className="text-right">Líquido bruto</th>
              <th className="text-right">€/parte</th>
              <th className="text-right">Σ líquido</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.mantas.map(m => (
              <tr key={m.manta}>
                <td className="font-medium">Manta {m.manta}</td>
                <td className="text-xs text-slate-600">{periodLabel(m.periodFrom, m.periodTo)}</td>
                <td className="text-right tabular-nums">{fmtEur(m.totalIngresos)}</td>
                <td className="text-right tabular-nums">{fmtEur(m.totalGastos)}</td>
                <td className="text-right tabular-nums">{fmtEur(m.liquidoMonteMayor)}</td>
                <td className="text-right tabular-nums">{fmtEur(m.liquidoBruto)}</td>
                <td className="text-right tabular-nums font-semibold">{fmtEur(m.importePorParte)}</td>
                <td className="text-right tabular-nums text-emerald-700 font-semibold">{fmtEur(m.totalLiquidoAPercibir)}</td>
                <td><Link className="text-xs text-blue-600 hover:underline" href={`/nominas/manta/${encodeURIComponent(m.manta)}`}>Ver →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabla por marinero */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold">Resumen por marinero (todas las mantas)</h3>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Marinero</th>
              <th>Rol</th>
              <th className="text-right">Mantas cobradas</th>
              <th className="text-right">Importe bruto manta</th>
              <th className="text-right">IRPF retenido</th>
              <th className="text-right">Líquido percibido</th>
            </tr>
          </thead>
          <tbody>
            {data.bySailor.map(s => (
              <tr key={s.sailorId}>
                <td className="font-medium">{s.name}</td>
                <td className="text-xs text-slate-600">{s.role}</td>
                <td className="text-right tabular-nums">{s.partsCount}</td>
                <td className="text-right tabular-nums">{fmtEur(s.totalImporteManta)}</td>
                <td className="text-right tabular-nums">−{fmtEur(s.totalIrpf)}</td>
                <td className="text-right tabular-nums font-semibold text-emerald-700">{fmtEur(s.totalLiquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  );
}

function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) return yyyymm;
  const d = new Date(Date.UTC(y, m - 1, 1));
  const label = d.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Kpi({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? "border-emerald-300 bg-emerald-50" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${highlight ? "text-emerald-800" : ""}`}>{value}</div>
    </div>
  );
}

function fmtEur(n: any) {
  return (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtEurShort(n: any) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k €`;
  return `${v.toFixed(0)} €`;
}
function periodLabel(from: string | null, to: string | null): string {
  if (!from || !to) return "—";
  return `${formatDateShort(from)} → ${formatDateShort(to)}`;
}
function formatDateShort(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}
