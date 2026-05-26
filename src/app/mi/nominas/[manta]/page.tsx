"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Resp = {
  manta: string;
  periodFrom: string | null;
  periodTo: string | null;
  validatedAt: string | null;
  totalIngresos: number;
  totalGastos: number;
  liquidoMonteMayor: number;
  participacionTripulacion: number;
  ssTripulacion: number;
  liquidoBruto: number;
  totalPartes: number;
  importePorParte: number;
  ingresosPorPuerto: { portName: string; total: number }[];
  gastosResumen: { category: string; concept: string; amount: number; count: number }[];
  mio: {
    sailorId: string;
    name: string;
    role: string;
    parts: number;
    importeManta: number;
    irpfRate: number;
    irpfImporte: number;
    liquidoAPercibir: number;
  };
};

export default function MiMantaDetallePage() {
  const params = useParams<{ manta: string }>();
  const mantaId = decodeURIComponent(params.manta);
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/mi/nominas/${encodeURIComponent(mantaId)}`)
      .then(r => r.json())
      .then(j => { if (!j.ok && j.error) setErr(j.error); else setData(j.data); })
      .catch(e => setErr(String(e)));
  }, [mantaId]);

  if (err) return <div className="card text-rose-700 bg-rose-50 border-rose-200 text-sm">{err}</div>;
  if (!data) return <div className="text-sm text-slate-500">Cargando…</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <Link href="/mi/nominas" className="text-sm text-blue-600 hover:underline">← Volver a mis nóminas</Link>
          <h1 className="text-2xl font-semibold mt-2">Manta {data.manta}</h1>
          <p className="text-sm text-slate-600 mt-1">
            Período: <b>{periodLabel(data.periodFrom, data.periodTo)}</b>
            {data.validatedAt && (
              <span className="ml-3 text-emerald-700">✓ Validada el {new Date(data.validatedAt).toLocaleString("es-ES")}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <a
            className="btn-primary"
            href={`/api/mi/nominas/${encodeURIComponent(mantaId)}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >📄 Descargar PDF</a>
          <button
            className="btn-ghost"
            onClick={() => window.print()}
          >🖨️ Imprimir</button>
        </div>
      </div>

      {/* Mi resultado, lo más visible */}
      <div className="card border-emerald-300 bg-emerald-50">
        <div className="text-xs uppercase tracking-wide text-emerald-800">Tu líquido a percibir</div>
        <div className="text-4xl font-bold text-emerald-800 mt-1">{fmtEur(data.mio.liquidoAPercibir)}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
          <Mini label="Tu rol" value={data.mio.role} />
          <Mini label="Tus partes" value={data.mio.parts.toFixed(2).replace(".", ",")} />
          <Mini label="Importe bruto" value={fmtEur(data.mio.importeManta)} />
          <Mini label={`IRPF (${data.mio.irpfRate.toFixed(2).replace(".", ",")}%)`} value={`−${fmtEur(data.mio.irpfImporte)}`} />
        </div>
      </div>

      {/* Cómo se ha calculado — vista resumida del barco */}
      <div className="card">
        <h2 className="font-semibold mb-3">Cómo se ha calculado</h2>
        <table className="table">
          <tbody>
            <tr>
              <td>Total ingresos por pesca</td>
              <td className="text-right tabular-nums">{fmtEur(data.totalIngresos)}</td>
            </tr>
            {data.ingresosPorPuerto.map((p, i) => (
              <tr key={i} className="text-xs text-slate-500">
                <td>&nbsp;&nbsp;&nbsp;· {p.portName}</td>
                <td className="text-right tabular-nums">{fmtEur(p.total)}</td>
              </tr>
            ))}
            <tr>
              <td>Total gastos "Monte Mayor"</td>
              <td className="text-right tabular-nums">−{fmtEur(data.totalGastos)}</td>
            </tr>
            <tr className="border-t border-slate-300 font-semibold">
              <td>Líquido Monte Mayor</td>
              <td className="text-right tabular-nums">{fmtEur(data.liquidoMonteMayor)}</td>
            </tr>
            <tr>
              <td>Participación tripulación (50%)</td>
              <td className="text-right tabular-nums">{fmtEur(data.participacionTripulacion)}</td>
            </tr>
            <tr>
              <td>SS 3,5% parte tripulación</td>
              <td className="text-right tabular-nums">−{fmtEur(data.ssTripulacion)}</td>
            </tr>
            <tr className="border-t border-slate-300 font-bold">
              <td>Líquido bruto a repartir</td>
              <td className="text-right tabular-nums">{fmtEur(data.liquidoBruto)}</td>
            </tr>
            <tr>
              <td>Repartido entre {data.totalPartes} partes</td>
              <td className="text-right tabular-nums font-semibold">{fmtEur(data.importePorParte)} <span className="text-xs text-slate-500">/ parte</span></td>
            </tr>
            <tr className="border-t-2 border-emerald-400 bg-emerald-50">
              <td className="font-semibold">Tu importe ({data.mio.parts.toFixed(2).replace(".", ",")} partes)</td>
              <td className="text-right tabular-nums font-bold">{fmtEur(data.mio.importeManta)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Detalle de gastos resumido */}
      {data.gastosResumen.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="font-semibold">Detalle de gastos</h2>
            <p className="text-xs text-slate-600">Gastos del barco que se descuentan antes del reparto.</p>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Concepto</th>
                <th className="text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {data.gastosResumen.map((g, i) => (
                <tr key={i}>
                  <td className="text-xs text-slate-600">{g.category}</td>
                  <td>{g.concept}{g.count > 1 ? ` ×${g.count}` : ""}</td>
                  <td className="text-right tabular-nums">{fmtEur(g.amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 font-semibold">
                <td colSpan={2}>TOTAL GASTOS</td>
                <td className="text-right tabular-nums">{fmtEur(data.totalGastos)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-slate-500 italic text-center">
        Solo se muestran tus datos personales. El reparto a otros marineros es confidencial.
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-emerald-700">{label}</div>
      <div className="text-base font-semibold text-emerald-900">{value}</div>
    </div>
  );
}
function fmtEur(n: any) {
  return (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as any);
}
function periodLabel(from: string | null, to: string | null) {
  if (!from || !to) return "—";
  const fmt = (iso: string) => new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-ES");
  return `${fmt(from)} → ${fmt(to)}`;
}
