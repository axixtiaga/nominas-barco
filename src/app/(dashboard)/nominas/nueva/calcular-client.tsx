"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFetch } from "@/hooks/use-fetch";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, Spinner } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/ui/toast";

interface CalcResult {
  run: { id: string; totalCapturas: number; monteMayor: number; totalGastos: number; baseRepartible: number; ownerShare: number; crewShare: number; totalBruto: number; totalSS: number; totalIRPF: number; totalNeto: number; items: { crewMember: { name: string; lastName: string }; brutoPescador: number; ssEmployee: number; irpfAmount: number; netoPescador: number; baseParts: number }[] };
  warnings: string[];
}

export default function CalcularClient() {
  const router  = useRouter();
  const { toasts, toast, remove } = useToast();

  const [periodId, setPeriodId] = useState("");
  const [boatId,   setBoatId]   = useState("");
  const [notes,    setNotes]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<CalcResult | null>(null);

  const { data: periods } = useFetch<unknown>("/api/nominas/periodos");
  const { data: boats }   = useFetch<{ items: { id: string; name: string }[]; meta: { total: number } }>("/api/maestros/barcos?limit=100");

  const periodsList = Array.isArray(periods) ? periods : [];
  const boatsList   = boats?.items ?? [];

  async function handleCalc() {
    if (!periodId || !boatId) { toast("Selecciona período y barco", "warning"); return; }
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch("/api/nominas/calcular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, boatId, notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error en el cálculo");
      setResult(json.data);
      if (json.data.warnings?.length) {
        json.data.warnings.forEach((w: string) => toast(w, "warning"));
      } else {
        toast("Cálculo completado correctamente", "success");
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoToDetail() {
    if (result?.run?.id) router.push(`/nominas/${result.run.id}`);
  }

  const r = result?.run;
  const totalParts = r?.items.reduce((s, i) => s + Number(i.baseParts), 0) ?? 0;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Selector */}
      <Card className="max-w-2xl">
        <CardHeader><h3 className="text-sm font-semibold text-slate-700">Parámetros del cálculo</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Período *</label>
              <select
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500"
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
              >
                <option value="">— Seleccionar período —</option>
                {(periodsList as { id: string; name: string }[]).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Barco *</label>
              <select
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500"
                value={boatId}
                onChange={(e) => setBoatId(e.target.value)}
              >
                <option value="">— Seleccionar barco —</option>
                {boatsList.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Notas (opcional)</label>
              <input
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500"
                placeholder="Observaciones sobre este cálculo…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button onClick={handleCalc} loading={loading} size="lg">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Ejecutar cálculo
            </Button>
            {loading && <span className="text-sm text-slate-500">Procesando…</span>}
          </div>
          <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-600">El motor de cálculo:</p>
            <p>• Suma todas las facturas del período y barco seleccionados</p>
            <p>• Deduce los gastos según su imputación (Monte Mayor)</p>
            <p>• Aplica el reparto armador/tripulación configurado</p>
            <p>• Reparte entre marineros según sus partes de categoría</p>
            <p>• Aplica SS y retención IRPF individual por marinero</p>
            <p>• Guarda el cálculo completo con trazabilidad total</p>
          </div>
        </CardBody>
      </Card>

      {/* Resultado */}
      {r && (
        <div className="space-y-5 max-w-5xl">
          {/* Warnings */}
          {result?.warnings && result.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-1.5">
              <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                Avisos de parametrización — revisa antes de validar
              </p>
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 ml-5">{w}</p>
              ))}
            </div>
          )}

          {/* Resumen económico */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total capturas",    value: r.totalCapturas,   color: "ocean" },
              { label: "Gastos deducidos",  value: r.totalGastos,     color: "amber" },
              { label: "Monte Mayor",       value: r.monteMayor,      color: "slate" },
              { label: "Base repartible",   value: r.baseRepartible,  color: "ocean" },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl border p-4 ${color === "ocean" ? "bg-ocean-50 border-ocean-100" : color === "amber" ? "bg-amber-50 border-amber-100" : "bg-slate-50 border-slate-200"}`}>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(value)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Parte armador</p>
                <p className="text-lg font-bold text-slate-700">{formatCurrency(r.ownerShare)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Parte tripulación</p>
                <p className="text-lg font-bold text-ocean-700">{formatCurrency(r.crewShare)}</p>
              </div>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Total bruto tripulación</p>
                <p className="text-lg font-bold text-slate-700">{formatCurrency(r.totalBruto)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Total neto tripulación</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(r.totalNeto)}</p>
              </div>
            </div>
          </div>

          {/* Detalle por marinero */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Detalle por marinero</h3>
                <span className="text-xs text-slate-400">{r.items.length} marinero(s) · {totalParts} partes totales</span>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-y border-slate-100">
                  <tr>
                    {["Marinero","Partes","%","Bruto","SS emp.","IRPF","Neto"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {r.items.map((item, i) => {
                    const pct = totalParts > 0 ? (Number(item.baseParts) / totalParts * 100).toFixed(1) : "0";
                    return (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-700">{item.crewMember.name} {item.crewMember.lastName}</td>
                        <td className="px-4 py-3 font-mono text-slate-500">{item.baseParts}</td>
                        <td className="px-4 py-3 font-mono text-slate-500">{pct}%</td>
                        <td className="px-4 py-3 font-mono text-slate-700">{formatCurrency(item.brutoPescador)}</td>
                        <td className="px-4 py-3 font-mono text-red-600 text-xs">−{formatCurrency(item.ssEmployee)}</td>
                        <td className="px-4 py-3 font-mono text-red-600 text-xs">−{formatCurrency(item.irpfAmount)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-ocean-700">{formatCurrency(item.netoPescador)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-3 font-bold text-slate-700" colSpan={3}>TOTAL</td>
                    <td className="px-4 py-3 font-mono font-bold">{formatCurrency(r.totalBruto)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-red-600">−{formatCurrency(r.totalSS)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-red-600">−{formatCurrency(r.totalIRPF)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-ocean-700 text-base">{formatCurrency(r.totalNeto)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={handleCalc} loading={loading}>Recalcular</Button>
            <Button onClick={handleGoToDetail}>
              Ver detalle completo →
            </Button>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onRemove={remove} />
    </div>
  );
}
