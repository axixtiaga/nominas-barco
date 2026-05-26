"use client";
import { useEffect, useState } from "react";

type MonthlyReport = any;
type AnnualReport = any;

export default function ReportsPage() {
  const [tab, setTab] = useState<"monthly" | "annual">("monthly");

  // Mensual
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState<string>(defaultMonth);
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  // Anual
  const [year, setYear] = useState<number>(now.getFullYear());
  const [annual, setAnnual] = useState<AnnualReport | null>(null);
  const [loadingAnnual, setLoadingAnnual] = useState(false);

  async function loadMonthly() {
    setLoadingMonthly(true);
    try {
      const r = await fetch(`/api/reports/monthly?month=${month}`);
      const j = await r.json();
      setMonthly(j?.data ?? null);
    } finally {
      setLoadingMonthly(false);
    }
  }
  async function loadAnnual() {
    setLoadingAnnual(true);
    try {
      const r = await fetch(`/api/reports/annual?year=${year}`);
      const j = await r.json();
      setAnnual(j?.data ?? null);
    } finally {
      setLoadingAnnual(false);
    }
  }

  useEffect(() => { if (tab === "monthly") loadMonthly(); }, [month, tab]);
  useEffect(() => { if (tab === "annual") loadAnnual(); }, [year, tab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reportes</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Resúmenes mensuales y anuales para entregar a la asesoría. Todos exportables a Excel.
          La hoja "Por marinero (Modelo 190)" del reporte anual te sirve para preparar el certificado de retenciones.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          className={`px-4 py-2 text-sm font-medium ${tab === "monthly" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-600 hover:text-slate-900"}`}
          onClick={() => setTab("monthly")}
        >📅 Mensual</button>
        <button
          className={`px-4 py-2 text-sm font-medium ${tab === "annual" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-600 hover:text-slate-900"}`}
          onClick={() => setTab("annual")}
        >📆 Anual</button>
      </div>

      {tab === "monthly" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Mes</span>
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="input"
              />
            </label>
            <a
              className="btn-primary"
              href={`/api/reports/monthly/excel?month=${month}`}
              target="_blank"
              rel="noreferrer"
            >📥 Descargar Excel</a>
          </div>

          {loadingMonthly && <div className="text-sm text-slate-500">Cargando…</div>}
          {monthly && <MonthlyView report={monthly} />}
        </div>
      )}

      {tab === "annual" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Año</span>
              <input
                type="number"
                value={year}
                onChange={e => setYear(parseInt(e.target.value) || now.getFullYear())}
                min={2020} max={2100}
                className="input w-28"
              />
            </label>
            <a
              className="btn-primary"
              href={`/api/reports/annual/excel?year=${year}`}
              target="_blank"
              rel="noreferrer"
            >📥 Descargar Excel anual</a>
          </div>

          {loadingAnnual && <div className="text-sm text-slate-500">Cargando…</div>}
          {annual && <AnnualView report={annual} />}
        </div>
      )}
    </div>
  );
}

function MonthlyView({ report }: { report: any }) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{report.monthLabel}</h2>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Mantas" value={String(report.totals.mantas)} />
        <Kpi label="Ingresos" value={fmtEur(report.totals.ingresos)} />
        <Kpi label="Gastos" value={fmtEur(report.totals.gastos)} />
        <Kpi label="Líquido percibido" value={fmtEur(report.totals.liquidoAPercibir)} highlight />
        <Kpi label="IRPF retenido" value={fmtEur(report.totals.irpfRetenido)} />
        <Kpi label="SS retenida" value={fmtEur(report.ss.retenido)} />
        <Kpi label="SS pagada" value={fmtEur(report.ss.pagado)} />
        <Kpi label="Δ SS (pagada−retenida)" value={fmtEur(report.ss.diferencia)} />
      </div>

      {/* Tabla por marinero */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold">Por marinero</h3>
        </div>
        {report.bySailor.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 italic text-center">Sin datos en este mes.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>DNI</th><th>Nombre</th><th>Rol</th>
                <th className="text-right">Mantas</th>
                <th className="text-right">Bruto</th>
                <th className="text-right">% IRPF</th>
                <th className="text-right">IRPF</th>
                <th className="text-right">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {report.bySailor.map((s: any) => (
                <tr key={s.sailorId}>
                  <td className="text-xs font-mono">{s.dni ?? "—"}</td>
                  <td className="font-medium">{s.name}</td>
                  <td className="text-xs text-slate-600">{s.role}</td>
                  <td className="text-right tabular-nums">{s.mantasCount}</td>
                  <td className="text-right tabular-nums">{fmtEur(s.importeBruto)}</td>
                  <td className="text-right tabular-nums text-slate-500">{s.irpfRate.toFixed(2)}%</td>
                  <td className="text-right tabular-nums">−{fmtEur(s.irpfRetenido)}</td>
                  <td className="text-right tabular-nums font-semibold text-emerald-700">{fmtEur(s.liquidoPercibido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Tabla mantas */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold">Mantas del mes</h3>
        </div>
        {report.mantas.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 italic text-center">Sin mantas en este mes.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Manta</th><th>Período</th>
                <th className="text-right">Ingresos</th>
                <th className="text-right">Gastos</th>
                <th className="text-right">Líquido bruto</th>
                <th className="text-right">IRPF</th>
                <th className="text-right">Líquido percibido</th>
              </tr>
            </thead>
            <tbody>
              {report.mantas.map((m: any) => (
                <tr key={m.manta}>
                  <td className="font-medium">Manta {m.manta}</td>
                  <td className="text-xs text-slate-600">{m.periodFrom} → {m.periodTo}</td>
                  <td className="text-right tabular-nums">{fmtEur(m.totalIngresos)}</td>
                  <td className="text-right tabular-nums">{fmtEur(m.totalGastos)}</td>
                  <td className="text-right tabular-nums">{fmtEur(m.liquidoBruto)}</td>
                  <td className="text-right tabular-nums">−{fmtEur(m.totalIrpfRetenido)}</td>
                  <td className="text-right tabular-nums font-semibold">{fmtEur(m.totalLiquidoAPercibir)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Gastos por categoría */}
      {report.expensesByCategory.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="font-semibold">Gastos por categoría</h3>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th className="text-right">Líneas</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {report.expensesByCategory.map((g: any) => (
                <tr key={g.category}>
                  <td>{g.category}</td>
                  <td className="text-right tabular-nums">{g.count}</td>
                  <td className="text-right tabular-nums">{fmtEur(g.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AnnualView({ report }: { report: any }) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Año {report.year}</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Mantas anuales" value={String(report.totals.mantas)} />
        <Kpi label="Ingresos" value={fmtEur(report.totals.ingresos)} />
        <Kpi label="Gastos" value={fmtEur(report.totals.gastos)} />
        <Kpi label="Líquido percibido" value={fmtEur(report.totals.liquidoAPercibir)} highlight />
        <Kpi label="IRPF retenido total" value={fmtEur(report.totals.irpfRetenido)} />
        <Kpi label="SS retenida (anual)" value={fmtEur(report.totals.ssTripulacion)} />
        <Kpi label="SS pagada (anual)" value={fmtEur(report.totals.ssPagado)} />
        <Kpi label="Δ SS" value={fmtEur(report.totals.ssPagado - report.totals.ssTripulacion)} />
      </div>

      {/* Mes a mes */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold">Mes a mes</h3>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="text-right">Mantas</th>
              <th className="text-right">Ingresos</th>
              <th className="text-right">Gastos</th>
              <th className="text-right">Líquido bruto</th>
              <th className="text-right">IRPF</th>
              <th className="text-right">Líquido</th>
              <th className="text-right">SS retenida</th>
              <th className="text-right">SS pagada</th>
            </tr>
          </thead>
          <tbody>
            {report.months.map((m: any) => (
              <tr key={m.month} className={m.mantas === 0 ? "opacity-50" : ""}>
                <td>{m.label}</td>
                <td className="text-right tabular-nums">{m.mantas}</td>
                <td className="text-right tabular-nums">{fmtEur(m.ingresos)}</td>
                <td className="text-right tabular-nums">{fmtEur(m.gastos)}</td>
                <td className="text-right tabular-nums">{fmtEur(m.liquidoBruto)}</td>
                <td className="text-right tabular-nums">−{fmtEur(m.irpfRetenido)}</td>
                <td className="text-right tabular-nums font-semibold">{fmtEur(m.liquidoAPercibir)}</td>
                <td className="text-right tabular-nums">{fmtEur(m.ssRetenido)}</td>
                <td className="text-right tabular-nums">{fmtEur(m.ssPagado)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-amber-50 font-semibold">
              <td>TOTAL ANUAL</td>
              <td className="text-right tabular-nums">{report.totals.mantas}</td>
              <td className="text-right tabular-nums">{fmtEur(report.totals.ingresos)}</td>
              <td className="text-right tabular-nums">{fmtEur(report.totals.gastos)}</td>
              <td className="text-right tabular-nums">{fmtEur(report.totals.liquidoBruto)}</td>
              <td className="text-right tabular-nums">−{fmtEur(report.totals.irpfRetenido)}</td>
              <td className="text-right tabular-nums">{fmtEur(report.totals.liquidoAPercibir)}</td>
              <td className="text-right tabular-nums">{fmtEur(report.totals.ssTripulacion)}</td>
              <td className="text-right tabular-nums">{fmtEur(report.totals.ssPagado)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Por marinero */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold">Por marinero (datos para Modelo 190)</h3>
          <p className="text-xs text-slate-500 mt-1">DNI, nombre, percepciones íntegras y retenciones — formato listo para la asesoría.</p>
        </div>
        {report.bySailor.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 italic text-center">Sin datos.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>DNI</th><th>Nombre</th><th>Rol</th>
                <th className="text-right">Mantas</th>
                <th className="text-right">Percepciones</th>
                <th className="text-right">% IRPF</th>
                <th className="text-right">Retenciones</th>
                <th className="text-right">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {report.bySailor.map((s: any) => (
                <tr key={s.sailorId}>
                  <td className="text-xs font-mono">{s.dni ?? "—"}</td>
                  <td className="font-medium">{s.name}</td>
                  <td className="text-xs text-slate-600">{s.role}</td>
                  <td className="text-right tabular-nums">{s.mantasCount}</td>
                  <td className="text-right tabular-nums">{fmtEur(s.importeBruto)}</td>
                  <td className="text-right tabular-nums text-slate-500">{s.irpfRate.toFixed(2)}%</td>
                  <td className="text-right tabular-nums">−{fmtEur(s.irpfRetenido)}</td>
                  <td className="text-right tabular-nums font-semibold text-emerald-700">{fmtEur(s.liquidoPercibido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
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
  return (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as any);
}
