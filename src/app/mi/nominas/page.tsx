"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Manta = {
  manta: string;
  periodFrom: string | null;
  periodTo: string | null;
  validatedAt: string | null;
  totalIngresos: number;
  totalGastos: number;
  liquidoMonteMayor: number;
  liquidoBruto: number;
  importePorParte: number;
  mias: {
    parts: number;
    importeManta: number;
    irpfRate: number;
    irpfImporte: number;
    liquidoAPercibir: number;
  } | null;
};
type Data = {
  sailor: { id: string; name: string; role: string; parts: number; irpfRate: number };
  mantas: Manta[];
  totals: { mantasCount: number; totalImporte: number; totalIrpf: number; totalLiquido: number };
};

export default function MisNominasPage() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mi/nominas")
      .then(r => r.json())
      .then(j => {
        if (!j.ok && j.error) setErr(j.error);
        else setData(j.data);
      })
      .catch(e => setErr(String(e)));
  }, []);

  // Agregado por año
  const byYear = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, { year: string; mantas: number; importe: number; irpf: number; liquido: number }>();
    for (const mt of data.mantas) {
      const year = (mt.periodTo ?? mt.periodFrom ?? "").slice(0, 4) || "—";
      const cur = m.get(year) ?? { year, mantas: 0, importe: 0, irpf: 0, liquido: 0 };
      cur.mantas++;
      cur.importe += mt.mias?.importeManta ?? 0;
      cur.irpf += mt.mias?.irpfImporte ?? 0;
      cur.liquido += mt.mias?.liquidoAPercibir ?? 0;
      m.set(year, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.year.localeCompare(a.year));
  }, [data]);

  if (err) {
    return (
      <div className="card text-rose-700 bg-rose-50 border-rose-200">
        <div className="font-semibold mb-1">No se pueden mostrar tus nóminas</div>
        <div className="text-sm">{err}</div>
      </div>
    );
  }
  if (!data) return <div className="text-sm text-slate-500">Cargando…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mis nóminas — {data.sailor.name}</h1>
        <p className="text-sm text-slate-600 mt-1">
          Rol: <b>{data.sailor.role}</b> · Partes: {data.sailor.parts.toFixed(2).replace(".", ",")} · IRPF: {data.sailor.irpfRate.toFixed(2).replace(".", ",")}%
        </p>
      </div>

      {/* KPIs personales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Mantas cobradas" value={String(data.totals.mantasCount)} />
        <Kpi label="Importe bruto manta" value={fmtEur(data.totals.totalImporte)} />
        <Kpi label="IRPF retenido" value={`−${fmtEur(data.totals.totalIrpf)}`} />
        <Kpi label="Líquido percibido" value={fmtEur(data.totals.totalLiquido)} highlight />
      </div>

      {/* Resumen por año */}
      {byYear.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="font-semibold">Resumen anual</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Año</th>
                <th className="text-right">Mantas</th>
                <th className="text-right">Importe bruto</th>
                <th className="text-right">IRPF retenido</th>
                <th className="text-right">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {byYear.map(y => (
                <tr key={y.year}>
                  <td className="font-semibold">{y.year}</td>
                  <td className="text-right tabular-nums">{y.mantas}</td>
                  <td className="text-right tabular-nums">{fmtEur(y.importe)}</td>
                  <td className="text-right tabular-nums">−{fmtEur(y.irpf)}</td>
                  <td className="text-right tabular-nums font-semibold text-emerald-700">{fmtEur(y.liquido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Listado de mantas */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold">Tus mantas</h2>
        </div>
        {data.mantas.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 italic text-center">
            No apareces en ninguna manta todavía.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Manta</th>
                <th>Período</th>
                <th>Estado</th>
                <th className="text-right">€/parte</th>
                <th className="text-right">Tu importe</th>
                <th className="text-right">Tu IRPF</th>
                <th className="text-right">Tu líquido</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.mantas.map(m => (
                <tr key={m.manta}>
                  <td className="font-semibold">Manta {m.manta}</td>
                  <td className="text-xs text-slate-600">{periodLabel(m.periodFrom, m.periodTo)}</td>
                  <td className="text-xs">
                    {m.validatedAt
                      ? <span className="text-emerald-700">✓ Validada</span>
                      : <span className="text-amber-700">Borrador</span>}
                  </td>
                  <td className="text-right tabular-nums">{fmtEur(m.importePorParte)}</td>
                  <td className="text-right tabular-nums">{fmtEur(m.mias?.importeManta ?? 0)}</td>
                  <td className="text-right tabular-nums">−{fmtEur(m.mias?.irpfImporte ?? 0)}</td>
                  <td className="text-right tabular-nums font-semibold text-emerald-700">{fmtEur(m.mias?.liquidoAPercibir ?? 0)}</td>
                  <td>
                    <Link className="text-xs text-blue-600 hover:underline" href={`/mi/nominas/${encodeURIComponent(m.manta)}`}>
                      Ver detalle →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-slate-500 italic text-center">
        Solo se muestran tus datos personales. El detalle de los demás miembros de la tripulación es confidencial.
      </div>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
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
function periodLabel(from: string | null, to: string | null) {
  if (!from || !to) return "—";
  return `${formatDateShort(from)} → ${formatDateShort(to)}`;
}
function formatDateShort(iso: string) {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
