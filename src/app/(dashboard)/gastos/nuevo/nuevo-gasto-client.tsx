"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFetch } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/ui/toast";

export default function NuevoGastoClient() {
  const router = useRouter();
  const { toasts, toast, remove } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    expenseTypeId: "", periodId: "", boatId: "", crewMemberId: "",
    amount: "", target: "AMBOS", description: "",
    date: new Date().toISOString().slice(0, 10), receiptRef: "",
  });

  const { data: types }   = useFetch<unknown>("/api/maestros/tipos-gasto");
  const { data: periods } = useFetch<unknown>("/api/nominas/periodos");
  const { data: boats }   = useFetch<{ items: { id: string; name: string }[]; meta: { total: number } }>("/api/maestros/barcos?limit=100");
  const { data: crew }    = useFetch<{ items: { id: string; name: string; lastName: string }[]; meta: { total: number } }>("/api/maestros/tripulantes?limit=100");

  const typesList   = Array.isArray(types)   ? types   : [];
  const periodsList = Array.isArray(periods) ? periods : [];
  const boatsList   = boats?.items   ?? [];
  const crewList    = crew?.items    ?? [];

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm(f=>({...f,[k]:e.target.value}));

  async function handleSave() {
    if (!form.expenseTypeId || !form.amount || !form.date) {
      toast("Tipo, importe y fecha son obligatorios", "warning"); return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        amount:       parseFloat(form.amount),
        periodId:     form.periodId     || undefined,
        boatId:       form.boatId       || undefined,
        crewMemberId: form.crewMemberId || undefined,
      };
      const res = await fetch("/api/gastos", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast("Gasto registrado", "success");
      setTimeout(() => router.push("/gastos"), 600);
    } catch (e: unknown) {
      toast((e as Error).message || "Error", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 flex justify-center">
      <div className="w-full max-w-2xl space-y-5">
        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-slate-700">Datos del gasto</h3></CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Tipo de gasto *</label>
                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.expenseTypeId} onChange={field("expenseTypeId")}>
                  <option value="">— Seleccionar —</option>
                  {(typesList as {id:string;name:string}[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Fecha *</label>
                <input type="date" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.date} onChange={field("date")} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Importe (€) *</label>
                <input type="number" step="0.01" placeholder="0.00" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 font-mono" value={form.amount} onChange={field("amount")} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Imputable a *</label>
                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.target} onChange={field("target")}>
                  <option value="ARMADOR">Armador</option>
                  <option value="TRIPULACION">Tripulación</option>
                  <option value="AMBOS">Ambos (descuenta del monte)</option>
                  <option value="BARCO">Barco</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Período</label>
                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.periodId} onChange={field("periodId")}>
                  <option value="">— Sin período —</option>
                  {(periodsList as {id:string;name:string}[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Barco</label>
                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.boatId} onChange={field("boatId")}>
                  <option value="">— Sin barco —</option>
                  {boatsList.map((b:{id:string;name:string})=><option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Marinero (si aplica)</label>
                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.crewMemberId} onChange={field("crewMemberId")}>
                  <option value="">— Sin marinero —</option>
                  {crewList.map((c:{id:string;name:string;lastName:string})=><option key={c.id} value={c.id}>{c.name} {c.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Referencia / Albarán</label>
                <input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" placeholder="Ref. factura…" value={form.receiptRef} onChange={field("receiptRef")} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Descripción</label>
                <textarea rows={2} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 resize-none" value={form.description} onChange={field("description")} placeholder="Descripción del gasto…" />
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.back()}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Registrar gasto</Button>
        </div>
        <ToastContainer toasts={toasts} onRemove={remove} />
      </div>
    </div>
  );
}
