"use client";
import { useState } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

type Tab = "periodos" | "reglas" | "ss" | "fiscal";

export default function ConfiguracionClient() {
  const [tab, setTab] = useState<Tab>("periodos");

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {([ ["periodos","Períodos"], ["reglas","Reglas reparto"], ["ss","Seguridad Social"], ["fiscal","Fiscal"] ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "periodos" && <PeriodosPanel />}
      {tab === "reglas"   && <ReglasPanel />}
      {tab === "ss"       && <SSPanel />}
      {tab === "fiscal"   && <FiscalPanel />}
    </div>
  );
}

/* ── PERÍODOS ── */
function PeriodosPanel() {
  const { toasts, toast, remove } = useToast();
  const { data, loading, refetch } = useFetch<unknown>("/api/nominas/periodos");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "", notes: "" });

  const list = Array.isArray(data) ? data : [];

  const STATUS_LABELS: Record<string, string> = { ABIERTO: "Abierto", CERRADO: "Cerrado", BLOQUEADO: "Bloqueado" };
  const STATUS_V: Record<string, "success"|"default"|"danger"> = { ABIERTO: "success", CERRADO: "default", BLOQUEADO: "danger" };

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/nominas/periodos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast("Período creado", "success");
      refetch();
      setOpen(false);
      setForm({ name: "", startDate: "", endDate: "", notes: "" });
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Períodos de liquidación</h3>
          <Button size="sm" onClick={() => setOpen(true)}>+ Nuevo período</Button>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-100">
            <tr>{["Nombre","Inicio","Fin","Estado"].map(h=><th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(list as { id:string; name:string; startDate:string; endDate:string; status:string }[]).map(p => (
              <tr key={p.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 font-medium text-slate-700">{p.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{formatDate(p.startDate)}</td>
                <td className="px-4 py-2.5 text-slate-500">{formatDate(p.endDate)}</td>
                <td className="px-4 py-2.5"><Badge variant={STATUS_V[p.status] ?? "default"}>{STATUS_LABELS[p.status] ?? p.status}</Badge></td>
              </tr>
            ))}
            {!list.length && !loading && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">Sin períodos</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo período"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSave} loading={saving}>Crear</Button></>}>
        <div className="space-y-3">
          {[["Nombre","text","name"],["Fecha inicio","date","startDate"],["Fecha fin","date","endDate"],["Notas","text","notes"]].map(([label,type,key])=>(
            <div key={key}>
              <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
              <input type={type} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500"
                value={form[key as keyof typeof form]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} />
            </div>
          ))}
        </div>
      </Modal>
      <ToastContainer toasts={toasts} onRemove={remove} />
    </Card>
  );
}

/* ── REGLAS DE REPARTO ── */
function ReglasPanel() {
  const { toasts, toast, remove } = useToast();
  const { data, loading, refetch } = useFetch<unknown>("/api/maestros/reglas");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", ownerPercent: 50, crewPercent: 50, method: "PORCENTAJE_FIJO", deductExpensesFrom: "MONTE_MAYOR", notes: "" });

  const list = Array.isArray(data) ? data : [];

  async function handleSave() {
    if (Math.abs(form.ownerPercent + form.crewPercent - 100) > 0.01) {
      toast("Armador + Tripulación debe sumar 100%", "warning"); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/maestros/reglas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast("Regla creada", "success");
      refetch(); setOpen(false);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Reglas de reparto armador/tripulación</h3>
            <p className="text-xs text-amber-600 mt-0.5">⚠ Verificar porcentajes con el convenio colectivo aplicable antes de calcular</p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>+ Nueva regla</Button>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-100">
            <tr>{["Nombre","Armador %","Tripulación %","Método","Activa"].map(h=><th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(list as { id:string; name:string; ownerPercent:number; crewPercent:number; method:string; active:boolean }[]).map(r => (
              <tr key={r.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 font-medium text-slate-700">{r.name}</td>
                <td className="px-4 py-2.5 font-mono text-slate-600">{Number(r.ownerPercent).toFixed(2)}%</td>
                <td className="px-4 py-2.5 font-mono text-slate-600">{Number(r.crewPercent).toFixed(2)}%</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{r.method}</td>
                <td className="px-4 py-2.5"><Badge variant={r.active ? "success" : "default"}>{r.active ? "Sí" : "No"}</Badge></td>
              </tr>
            ))}
            {!list.length && !loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">Sin reglas. Crea una antes de calcular.</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva regla de reparto"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSave} loading={saving}>Guardar</Button></>}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
            <input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Armador (%)</label>
              <input type="number" step="0.01" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 font-mono"
                value={form.ownerPercent} onChange={e=>{ const v=parseFloat(e.target.value)||0; setForm(f=>({...f,ownerPercent:v,crewPercent:100-v})); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tripulación (%)</label>
              <input type="number" step="0.01" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 font-mono"
                value={form.crewPercent} onChange={e=>{ const v=parseFloat(e.target.value)||0; setForm(f=>({...f,crewPercent:v,ownerPercent:100-v})); }} />
            </div>
          </div>
          <div className={`text-xs font-medium rounded px-3 py-2 ${Math.abs(form.ownerPercent+form.crewPercent-100)<0.01 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            Suma: {(form.ownerPercent+form.crewPercent).toFixed(2)}% {Math.abs(form.ownerPercent+form.crewPercent-100)<0.01 ? "✓" : "— debe ser 100%"}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notas / justificación</label>
            <textarea rows={2} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 resize-none"
              value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Referencia al convenio, fecha de revisión…" />
          </div>
        </div>
      </Modal>
      <ToastContainer toasts={toasts} onRemove={remove} />
    </Card>
  );
}

/* ── SS ── */
function SSPanel() {
  const { toasts, toast, remove } = useToast();
  const { data, refetch } = useFetch<unknown>("/api/maestros/parametros-ss");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", employeePercent: 6.4, employerPercent: 23.6, baseType: "TOTAL_CAPTURAS", description: "", validFrom: "" });

  const list = Array.isArray(data) ? data : [];

  async function handleSave() {
    setSaving(true);
    try {
      const body = { ...form, employeePercent: form.employeePercent / 100, employerPercent: form.employerPercent / 100 };
      const res = await fetch("/api/maestros/parametros-ss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast("Parámetro SS creado", "success");
      refetch(); setOpen(false);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Parámetros de Seguridad Social</h3>
            <p className="text-xs text-amber-600 mt-0.5">⚠ Verificar tasas con Tesorería SS Marítima (REASS) antes de usar</p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>+ Añadir</Button>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-100">
            <tr>{["Nombre","Empleado %","Empleador %","Base","Desde"].map(h=><th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(list as { id:string; name:string; employeePercent:number; employerPercent:number; baseType:string; validFrom:string }[]).map(s => (
              <tr key={s.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 font-medium text-slate-700">{s.name}</td>
                <td className="px-4 py-2.5 font-mono text-slate-600">{(Number(s.employeePercent)*100).toFixed(2)}%</td>
                <td className="px-4 py-2.5 font-mono text-slate-600">{(Number(s.employerPercent)*100).toFixed(2)}%</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{s.baseType}</td>
                <td className="px-4 py-2.5 text-slate-500">{formatDate(s.validFrom)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo parámetro SS"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSave} loading={saving}>Guardar</Button></>}>
        <div className="space-y-3">
          {[["Nombre","text","name"],["Código","text","code"],["Vigente desde","date","validFrom"]].map(([label,type,key])=>(
            <div key={key}>
              <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
              <input type={type} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500"
                value={form[key as keyof typeof form] as string} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            {[["Empleado (%)", "employeePercent"],["Empleador (%)", "employerPercent"]].map(([label,key])=>(
              <div key={key}>
                <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
                <input type="number" step="0.01" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 font-mono"
                  value={form[key as keyof typeof form] as number} onChange={e=>setForm(f=>({...f,[key]:parseFloat(e.target.value)||0}))} />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Descripción / referencia legal</label>
            <textarea rows={2} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 resize-none"
              value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} />
          </div>
        </div>
      </Modal>
      <ToastContainer toasts={toasts} onRemove={remove} />
    </Card>
  );
}

/* ── FISCAL ── */
function FiscalPanel() {
  return (
    <Card>
      <CardHeader><h3 className="text-sm font-semibold text-slate-700">Parámetros fiscales</h3></CardHeader>
      <CardBody>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 space-y-2">
          <p className="font-bold">⚠ Parámetros pendientes de parametrización</p>
          <p>Los siguientes parámetros fiscales están inicializados con valores orientativos y deben verificarse con asesoría antes de usarlos en cálculos reales:</p>
          <ul className="list-disc ml-4 space-y-1 text-xs">
            <li><strong>IRPF mínimo sector pesca</strong> — retención mínima aplicable. Verificar con Agencia Tributaria y convenio.</li>
            <li><strong>IRPF por marinero</strong> — se configura individualmente en el perfil de cada tripulante.</li>
            <li><strong>Base de cálculo SS</strong> — definida en parámetros SS. Actualmente: Total Capturas proporcional. Verificar con Tesorería SS Marítima.</li>
            <li><strong>Deducción gastos de navegación</strong> — pendiente de añadir si aplica al régimen.</li>
          </ul>
          <p className="text-xs mt-2">Para modificar el IRPF de cada marinero: ve a <strong>Maestros → Tripulantes → Editar marinero</strong>.</p>
        </div>
      </CardBody>
    </Card>
  );
}
