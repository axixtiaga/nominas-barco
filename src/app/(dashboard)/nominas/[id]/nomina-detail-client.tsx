"use client";
import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useFetch } from "@/hooks/use-fetch";
import { formatCurrency, formatDate, formatDatetime, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, Spinner, Card, CardHeader, CardBody } from "@/components/ui";
import { ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/ui/toast";

interface PayrollItem {
  id: string;
  baseParts: number;
  brutoPescador: number;
  ssEmployee: number;
  ssEmployer: number;
  irpfPercent: number;
  irpfAmount: number;
  otherDeductions: number;
  netoPescador: number;
  manualAdjustment: number;
  adjustmentNote: string | null;
  calculationDetail: Record<string, string>;
  crewMember: {
    name: string;
    lastName: string;
    taxId: string | null;
    category: { name: string; code: string };
  };
}

interface PayrollRun {
  id: string;
  status: string;
  totalCapturas: number;
  monteMayor: number;
  totalGastos: number;
  baseRepartible: number;
  ownerShare: number;
  crewShare: number;
  totalBruto: number;
  totalSS: number;
  totalIRPF: number;
  totalNeto: number;
  calculatedAt: string;
  validatedAt: string | null;
  closedAt: string | null;
  notes: string | null;
  rulesSnapshot: { allocationRule?: { ownerPercent: number; crewPercent: number }; warnings?: string[] };
  period: { name: string; startDate: string; endDate: string };
  boat: { name: string; registration: string };
  runByUser: { name: string; email: string };
  items: PayrollItem[];
}

const STATUS_MAP: Record<string, { label: string; v: "default" | "info" | "success" | "ocean" }> = {
  BORRADOR: { label: "Borrador",  v: "default" },
  VALIDADA: { label: "Validada",  v: "info"    },
  CERRADA:  { label: "Cerrada",   v: "success" },
  PAGADA:   { label: "Pagada",    v: "ocean"   },
};

export default function NominaDetailClient({ id }: { id: string }) {
  const router  = useRouter();
  const { toasts, toast, remove } = useToast();
  const { data: run, loading, refetch } = useFetch<PayrollRun>(`/api/nominas/${id}`);

  const [confirmAction, setConfirmAction] = useState<"validar" | "cerrar" | null>(null);
  const [actioning, setActioning] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  if (loading) return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;
  if (!run)    return <div className="p-6 text-slate-500">Liquidación no encontrada</div>;

  const totalParts = run.items.reduce((s, i) => s + Number(i.baseParts), 0);
  const isEditable = run.status === "BORRADOR" || run.status === "VALIDADA";
  const statusInfo = STATUS_MAP[run.status] ?? { label: run.status, v: "default" as const };
  const warnings   = run.rulesSnapshot?.warnings ?? [];

  async function handleAction(action: "validar" | "cerrar") {
    setActioning(true);
    try {
      const res  = await fetch(`/api/nominas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(action === "validar" ? "Nómina validada" : "Período cerrado correctamente", "success");
      refetch();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setActioning(false);
      setConfirmAction(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Header actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">← Volver</button>
          <span className="text-slate-300">|</span>
          <h2 className="text-sm font-semibold text-slate-700">{run.period.name} — {run.boat.name}</h2>
          <Badge variant={statusInfo.v}>{statusInfo.label}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Exports */}
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/export/csv?type=nominas&runId=${id}`, "_blank")}>↓ CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/export/excel?type=nominas&runId=${id}`, "_blank")}>↓ Excel</Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/export/pdf?runId=${id}`, "_blank")}>↓ PDF</Button>
          {/* State transitions */}
          {run.status === "BORRADOR" && (
            <Button size="sm" onClick={() => setConfirmAction("validar")}>✓ Validar</Button>
          )}
          {run.status === "VALIDADA" && (
            <Button variant="destructive" size="sm" onClick={() => setConfirmAction("cerrar")}>🔒 Cerrar período</Button>
          )}
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-1">
          <p className="text-xs font-bold text-amber-800">⚠ Avisos de parametrización pendientes:</p>
          {warnings.map((w, i) => <p key={i} className="text-xs text-amber-700 ml-3">• {w}</p>)}
        </div>
      )}

      {/* Meta + Fechas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-slate-700">Información de la liquidación</h3></CardHeader>
          <CardBody>
            <dl className="space-y-2.5 text-sm">
              {[
                ["Período",        run.period.name],
                ["Fechas",         `${formatDate(run.period.startDate)} – ${formatDate(run.period.endDate)}`],
                ["Barco",          `${run.boat.name} (${run.boat.registration})`],
                ["Calculado por",  run.runByUser.name],
                ["Calculado el",   formatDatetime(run.calculatedAt)],
                ["Validado el",    run.validatedAt ? formatDatetime(run.validatedAt) : "—"],
                ["Cerrado el",     run.closedAt    ? formatDatetime(run.closedAt)    : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-medium text-slate-700 text-right">{v}</dd>
                </div>
              ))}
              {run.notes && (
                <div className="pt-2 border-t border-slate-100">
                  <dt className="text-slate-500 text-xs">Notas</dt>
                  <dd className="text-slate-700 text-xs mt-1">{run.notes}</dd>
                </div>
              )}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-slate-700">Resumen económico</h3></CardHeader>
          <CardBody>
            <dl className="space-y-2 text-sm">
              {[
                ["Total capturas",    run.totalCapturas,    "slate"],
                ["Total gastos",      run.totalGastos,      "red"],
                ["Monte Mayor",       run.monteMayor,       "slate"],
                ["Base repartible",   run.baseRepartible,   "slate"],
              ].map(([k, v, c]) => (
                <div key={k as string} className="flex justify-between">
                  <dt className="text-slate-500">{k as string}</dt>
                  <dd className={`font-mono font-semibold ${c === "red" ? "text-red-600" : "text-slate-700"}`}>{formatCurrency(v as number)}</dd>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Parte armador ({run.rulesSnapshot?.allocationRule?.ownerPercent ?? "?"}%)</dt>
                  <dd className="font-mono font-semibold text-slate-700">{formatCurrency(run.ownerShare)}</dd>
                </div>
                <div className="flex justify-between mt-1">
                  <dt className="text-slate-500">Parte tripulación ({run.rulesSnapshot?.allocationRule?.crewPercent ?? "?"}%)</dt>
                  <dd className="font-mono font-semibold text-ocean-700">{formatCurrency(run.crewShare)}</dd>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                {[
                  ["Bruto total", run.totalBruto],
                  ["SS empleado", run.totalSS],
                  ["IRPF total",  run.totalIRPF],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between text-xs">
                    <dt className="text-slate-400">{k as string}</dt>
                    <dd className="font-mono text-slate-600">{formatCurrency(v as number)}</dd>
                  </div>
                ))}
                <div className="flex justify-between pt-1 border-t border-slate-100">
                  <dt className="font-bold text-slate-700">NETO TOTAL</dt>
                  <dd className="font-mono font-bold text-xl text-ocean-700">{formatCurrency(run.totalNeto)}</dd>
                </div>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>

      {/* Detalle por marinero */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Detalle por marinero</h3>
            <span className="text-xs text-slate-400">{run.items.length} marinero(s) · {totalParts} partes totales</span>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-100">
              <tr>
                {["Marinero","Categoría","Partes","%","Bruto","SS emp.","SS arm.","IRPF","Neto",""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {run.items.map((item) => {
                const pct = totalParts > 0 ? ((Number(item.baseParts) / totalParts) * 100).toFixed(1) : "0";
                const expanded = expandedItem === item.id;
                return (
                  <Fragment key={item.id}>
                    <tr className="hover:bg-slate-50/50">
                      <td className="px-3 py-3 font-medium text-slate-700">
                        {item.crewMember.name} {item.crewMember.lastName}
                        {item.crewMember.taxId && <span className="block text-xs text-slate-400">{item.crewMember.taxId}</span>}
                      </td>
                      <td className="px-3 py-3 text-slate-500 text-xs">{item.crewMember.category.name}</td>
                      <td className="px-3 py-3 font-mono text-slate-500">{item.baseParts}</td>
                      <td className="px-3 py-3 font-mono text-slate-500">{pct}%</td>
                      <td className="px-3 py-3 font-mono text-slate-700">{formatCurrency(item.brutoPescador)}</td>
                      <td className="px-3 py-3 font-mono text-xs text-red-500">−{formatCurrency(item.ssEmployee)}</td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-400">{formatCurrency(item.ssEmployer)}</td>
                      <td className="px-3 py-3 font-mono text-xs text-red-500">
                        −{formatCurrency(item.irpfAmount)}
                        <span className="text-slate-400 ml-1">({formatPercent(item.irpfPercent)})</span>
                      </td>
                      <td className="px-3 py-3 font-mono font-bold text-ocean-700">{formatCurrency(item.netoPescador)}</td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => setExpandedItem(expanded ? null : item.id)}
                          className="text-xs text-ocean-600 hover:text-ocean-800 font-medium"
                        >
                          {expanded ? "▲" : "▼"} Fórmula
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${item.id}-detail`} className="bg-slate-50">
                        <td colSpan={10} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-3 text-xs font-mono text-slate-600">
                            {Object.entries(item.calculationDetail).map(([k, v]) => (
                              <div key={k}>
                                <span className="text-slate-400 font-sans">{k}: </span>
                                <span>{String(v)}</span>
                              </div>
                            ))}
                          </div>
                          {item.manualAdjustment !== 0 && (
                            <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">
                              ⚠ Ajuste manual: {formatCurrency(item.manualAdjustment)} — {item.adjustmentNote}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-ocean-900 text-white">
              <tr>
                <td className="px-3 py-3 font-bold text-sm" colSpan={4}>TOTALES</td>
                <td className="px-3 py-3 font-mono font-bold">{formatCurrency(run.totalBruto)}</td>
                <td className="px-3 py-3 font-mono font-bold text-red-300">−{formatCurrency(run.totalSS)}</td>
                <td className="px-3 py-3 font-mono text-ocean-300 text-xs">{formatCurrency(run.items.reduce((s, i) => s + Number(i.ssEmployer), 0))}</td>
                <td className="px-3 py-3 font-mono font-bold text-red-300">−{formatCurrency(run.totalIRPF)}</td>
                <td className="px-3 py-3 font-mono font-bold text-xl">{formatCurrency(run.totalNeto)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Confirmaciones */}
      <ConfirmModal
        open={confirmAction === "validar"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => handleAction("validar")}
        loading={actioning}
        title="Validar liquidación"
        message="Marcarás esta liquidación como validada. Podrás seguir exportando pero no calcular hasta recalcular manualmente."
      />
      <ConfirmModal
        open={confirmAction === "cerrar"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => handleAction("cerrar")}
        loading={actioning}
        title="Cerrar período"
        message="⚠ Esta acción cerrará el período y bloqueará el recálculo. Solo hazlo cuando los datos sean definitivos."
      />

      <ToastContainer toasts={toasts} onRemove={remove} />
    </div>
  );
}
