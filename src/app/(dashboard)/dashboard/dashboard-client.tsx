"use client";
import { useState } from "react";
import Link from "next/link";
import { useFetch } from "@/hooks/use-fetch";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { Spinner, Badge } from "@/components/ui";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface DashboardStats {
  totalCapturas: number;
  totalInvoices: number;
  totalKilos: number;
  totalExpenses: number;
  costPerKilo: number;
  netIncome: number;
  speciesSummary: { name: string; kilos: number; amount: number; priceAvg: number }[];
  expensesByTarget: { target: string; amount: number }[];
  latestRun: { id: string; status: string; totalNeto: number; totalBruto: number; period: string; boat: string; calculatedAt: string } | null;
  recentInvoices: { id: string; invoiceNumber: string | null; invoiceDate: string; totalAmount: number; port?: string; boat?: string }[];
}

const PIE_COLORS = ["#0369A1","#0ea5e9","#38bdf8","#7dd3fc","#bae6fd"];

function KPI({ label, value, sub, color = "ocean" }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    ocean: "from-ocean-50 to-white border-ocean-100",
    green: "from-green-50 to-white border-green-100",
    amber: "from-amber-50 to-white border-amber-100",
    slate: "from-slate-50 to-white border-slate-100",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-5`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-800 tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function DashboardClient() {
  const [periodId, setPeriodId] = useState("");
  const [boatId,   setBoatId]   = useState("");

  const sp = new URLSearchParams();
  if (periodId) sp.set("periodId", periodId);
  if (boatId)   sp.set("boatId",   boatId);
  const { data: stats, loading } = useFetch<DashboardStats>(`/api/dashboard/stats?${sp.toString()}`, [periodId, boatId]);
  const { data: periods } = useFetch<{ id: string; name: string }[]>("/api/nominas/periodos");
  const { data: boats }   = useFetch<{ items: { id: string; name: string }[]; meta: { total: number } }>("/api/maestros/barcos?limit=50");

  const periodsList = Array.isArray(periods) ? periods : [];
  const boatsList   = boats?.items ?? [];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const s = stats;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          className="text-sm border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ocean-500 bg-white"
        >
          <option value="">Todos los períodos</option>
          {Array.isArray(periodsList) && periodsList.map((p: { id: string; name: string }) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={boatId}
          onChange={(e) => setBoatId(e.target.value)}
          className="text-sm border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ocean-500 bg-white"
        >
          <option value="">Todos los barcos</option>
          {boatsList.map((b: { id: string; name: string }) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Total capturas"   value={formatCurrency(s?.totalCapturas ?? 0)} sub={`${s?.totalInvoices ?? 0} facturas`} color="ocean" />
        <KPI label="Kilos totales"    value={formatNumber(s?.totalKilos ?? 0, 0) + " kg"} sub={`Coste: ${formatCurrency(s?.costPerKilo ?? 0)}/kg`} color="ocean" />
        <KPI label="Total gastos"     value={formatCurrency(s?.totalExpenses ?? 0)} color="amber" />
        <KPI label="Resultado neto"   value={formatCurrency(s?.netIncome ?? 0)} sub="Capturas − Gastos" color={s?.netIncome ?? 0 >= 0 ? "green" : "amber"} />
      </div>

      {/* Última liquidación */}
      {s?.latestRun && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Última liquidación</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{s.latestRun.period} — {s.latestRun.boat}</p>
            <p className="text-xs text-slate-400 mt-0.5">Calculada: {formatDate(s.latestRun.calculatedAt)}</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-slate-500">Bruto</p>
              <p className="text-sm font-semibold text-slate-700">{formatCurrency(s.latestRun.totalBruto)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Neto</p>
              <p className="text-lg font-bold text-ocean-700">{formatCurrency(s.latestRun.totalNeto)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <PayrollStatusBadge status={s.latestRun.status} />
              <Link href={`/nominas/${s.latestRun.id}`} className="text-xs text-ocean-600 hover:text-ocean-800 font-medium">Ver →</Link>
            </div>
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Bar chart: capturas por especie */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Capturas por especie (€)</h3>
          {s?.speciesSummary && s.speciesSummary.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={s.speciesSummary.slice(0, 8)} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="amount" fill="#0369A1" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">Sin datos</div>
          )}
        </div>

        {/* Pie: gastos por destino */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Gastos por imputación</h3>
          {s?.expensesByTarget && s.expensesByTarget.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={180}>
                <PieChart>
                  <Pie data={s.expensesByTarget} dataKey="amount" nameKey="target" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                    {s.expensesByTarget.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {s.expensesByTarget.map((e, i) => (
                  <div key={e.target} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-600">{e.target}</span>
                    </div>
                    <span className="font-mono font-medium text-slate-700">{formatCurrency(e.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">Sin gastos registrados</div>
          )}
        </div>
      </div>

      {/* Tabla especies */}
      {s?.speciesSummary && s.speciesSummary.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Detalle por especie</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Especie","Kilos","Importe","Precio medio/kg"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {s.speciesSummary.map((sp) => (
                <tr key={sp.name} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{sp.name}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-mono">{formatNumber(sp.kilos, 1)} kg</td>
                  <td className="px-4 py-2.5 text-slate-600 font-mono">{formatCurrency(sp.amount)}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-mono">{formatCurrency(sp.priceAvg)}/kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Facturas recientes */}
      {s?.recentInvoices && s.recentInvoices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Facturas recientes</h3>
            <Link href="/facturas" className="text-xs text-ocean-600 hover:text-ocean-800 font-medium">Ver todas →</Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Número","Fecha","Puerto","Barco","Total"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {s.recentInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/facturas/${inv.id}`} className="text-ocean-600 hover:text-ocean-800 font-medium">
                      {inv.invoiceNumber || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{formatDate(inv.invoiceDate)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{inv.port || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{inv.boat || "—"}</td>
                  <td className="px-4 py-2.5 font-mono font-medium text-slate-700">{formatCurrency(inv.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PayrollStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default"|"info"|"success"|"warning"|"danger"|"ocean" }> = {
    BORRADOR:  { label: "Borrador",  variant: "default" },
    VALIDADA:  { label: "Validada",  variant: "info" },
    CERRADA:   { label: "Cerrada",   variant: "success" },
    PAGADA:    { label: "Pagada",    variant: "ocean" },
  };
  const s = map[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
