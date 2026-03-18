"use client";
import { useState } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Spinner } from "@/components/ui";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/ui/toast";

type Tab = "barcos" | "tripulantes" | "puertos" | "proveedores" | "especies" | "categorias";

export default function MaestrosClient() {
  const [tab, setTab] = useState<Tab>("barcos");
  const tabs: [Tab, string][] = [
    ["barcos",      "Barcos"],
    ["tripulantes", "Tripulantes"],
    ["categorias",  "Categorías"],
    ["puertos",     "Puertos"],
    ["proveedores", "Proveedores"],
    ["especies",    "Especies"],
  ];
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 flex-wrap">
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "barcos"      && <BarcosPanel />}
      {tab === "tripulantes" && <TripulantesPanel />}
      {tab === "categorias"  && <CategoriasPanel />}
      {tab === "puertos"     && <PuertosPanel />}
      {tab === "proveedores" && <ProveedoresPanel />}
      {tab === "especies"    && <EspeciesPanel />}
    </div>
  );
}

/* ── helpers ── */
function Field({ label, value, onChange, type="text", required=false }: { label:string; value:string; onChange:(v:string)=>void; type?:string; required?:boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}{required && " *"}</label>
      <input type={type} required={required}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500"
        value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   BARCOS
══════════════════════════════════════════════════════ */
function BarcosPanel() {
  const { toasts, toast, remove } = useToast();
  const { data, loading, refetch } = useFetch<{ items: { id:string;name:string;registration:string;flag:string|null;boatType:string|null;active:boolean }[] }>("/api/maestros/barcos?limit=50");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"", registration:"", flag:"España", boatType:"", notes:"" });
  const items = data?.items ?? [];
  const f = (k: keyof typeof form) => (v: string) => setForm(p=>({...p,[k]:v}));

  async function handleSave() {
    setSaving(true);
    try {
      const url = editId ? `/api/maestros/barcos/${editId}` : "/api/maestros/barcos";
      const res = await fetch(url, { method: editId?"PUT":"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(form) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(editId ? "Barco actualizado" : "Barco creado", "success");
      refetch(); setOpen(false); setEditId(null);
      setForm({ name:"", registration:"", flag:"España", boatType:"", notes:"" });
    } catch (e:unknown) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try { await fetch(`/api/maestros/barcos/${deleteId}`, { method:"DELETE" }); toast("Barco desactivado","success"); refetch(); }
    catch { toast("Error","error"); }
    finally { setDeleteId(null); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Barcos</h3>
          <Button size="sm" onClick={() => { setEditId(null); setForm({ name:"",registration:"",flag:"España",boatType:"",notes:"" }); setOpen(true); }}>+ Nuevo</Button>
        </div>
      </CardHeader>
      {loading ? <div className="p-8 flex justify-center"><Spinner /></div> : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-100">
            <tr>{["Nombre","Matrícula","Pabellón","Tipo",""].map(h=><th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map(b => (
              <tr key={b.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 font-medium">{b.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{b.registration}</td>
                <td className="px-4 py-2.5 text-slate-500">{b.flag||"—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{b.boatType||"—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-2">
                    <button onClick={()=>{ setEditId(b.id); setForm({name:b.name,registration:b.registration,flag:b.flag||"España",boatType:b.boatType||"",notes:""}); setOpen(true); }} className="text-xs text-ocean-600 hover:text-ocean-800 font-medium">Editar</button>
                    <button onClick={()=>setDeleteId(b.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">Sin barcos</td></tr>}
          </tbody>
        </table>
      )}
      <Modal open={open} onClose={()=>setOpen(false)} title={editId?"Editar barco":"Nuevo barco"}
        footer={<><Button variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={handleSave} loading={saving}>Guardar</Button></>}>
        <div className="space-y-3">
          <Field label="Nombre" value={form.name} onChange={f("name")} required />
          <Field label="Matrícula" value={form.registration} onChange={f("registration")} required />
          <Field label="Pabellón" value={form.flag} onChange={f("flag")} />
          <Field label="Tipo de embarcación" value={form.boatType} onChange={f("boatType")} />
          <Field label="Notas" value={form.notes} onChange={f("notes")} />
        </div>
      </Modal>
      <ConfirmModal open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={handleDelete} title="Desactivar barco" message="El barco quedará inactivo pero sus datos se conservan." />
      <ToastContainer toasts={toasts} onRemove={remove} />
    </Card>
  );
}

/* ══════════════════════════════════════════════════════
   TRIPULANTES
══════════════════════════════════════════════════════ */
function TripulantesPanel() {
  const { toasts, toast, remove } = useToast();
  const { data, loading, refetch } = useFetch<{ items: { id:string;name:string;lastName:string;taxId:string|null;irpfPercent:number;category:{name:string};boat:{name:string}|null }[] }>("/api/maestros/tripulantes?limit=50");
  const { data: cats } = useFetch<{ id:string;name:string }[]>("/api/maestros/categorias");
  const { data: boats } = useFetch<{ items:{id:string;name:string}[] }>("/api/maestros/barcos?limit=100");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"",lastName:"",taxId:"",categoryId:"",boatId:"",irpfPercent:"9",phone:"",email:"",joinDate:"" });
  const items = data?.items ?? [];
  const catList = Array.isArray(cats) ? cats : [];
  const boatList = boats?.items ?? [];
  const f = (k:keyof typeof form) => (v:string) => setForm(p=>({...p,[k]:v}));

  async function handleSave() {
    setSaving(true);
    try {
      const url = editId ? `/api/maestros/tripulantes/${editId}` : "/api/maestros/tripulantes";
      const body = { ...form, irpfPercent: parseFloat(form.irpfPercent)||0, email: form.email||undefined, boatId: form.boatId||undefined, taxId: form.taxId||undefined };
      const res = await fetch(url, { method: editId?"PUT":"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(editId ? "Tripulante actualizado" : "Tripulante creado", "success");
      refetch(); setOpen(false); setEditId(null);
    } catch (e:unknown) { toast((e as Error).message,"error"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try { await fetch(`/api/maestros/tripulantes/${deleteId}`, { method:"DELETE" }); toast("Tripulante desactivado","success"); refetch(); }
    catch { toast("Error","error"); }
    finally { setDeleteId(null); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Tripulantes</h3>
          <Button size="sm" onClick={()=>{ setEditId(null); setForm({name:"",lastName:"",taxId:"",categoryId:"",boatId:"",irpfPercent:"9",phone:"",email:"",joinDate:""}); setOpen(true); }}>+ Nuevo</Button>
        </div>
      </CardHeader>
      {loading ? <div className="p-8 flex justify-center"><Spinner /></div> : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-100">
            <tr>{["Nombre","DNI","Categoría","Barco","IRPF %",""].map(h=><th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map(m=>(
              <tr key={m.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 font-medium">{m.name} {m.lastName}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{m.taxId||"—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{m.category.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{m.boat?.name||"—"}</td>
                <td className="px-4 py-2.5 font-mono">{Number(m.irpfPercent).toFixed(0)}%</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-2">
                    <button onClick={()=>{ setEditId(m.id); setForm({name:m.name,lastName:m.lastName,taxId:m.taxId||"",categoryId:"",boatId:"",irpfPercent:String(Number(m.irpfPercent)),phone:"",email:"",joinDate:""}); setOpen(true); }} className="text-xs text-ocean-600 hover:text-ocean-800 font-medium">Editar</button>
                    <button onClick={()=>setDeleteId(m.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">Sin tripulantes</td></tr>}
          </tbody>
        </table>
      )}
      <Modal open={open} onClose={()=>setOpen(false)} title={editId?"Editar tripulante":"Nuevo tripulante"}
        footer={<><Button variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={handleSave} loading={saving}>Guardar</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" value={form.name} onChange={f("name")} required />
          <Field label="Apellidos" value={form.lastName} onChange={f("lastName")} required />
          <Field label="DNI/NIF" value={form.taxId} onChange={f("taxId")} />
          <Field label="IRPF (%)" value={form.irpfPercent} onChange={f("irpfPercent")} type="number" />
          <Field label="Teléfono" value={form.phone} onChange={f("phone")} />
          <Field label="Email" value={form.email} onChange={f("email")} type="email" />
          <Field label="Fecha alta" value={form.joinDate} onChange={f("joinDate")} type="date" />
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Categoría *</label>
            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.categoryId} onChange={e=>setForm(p=>({...p,categoryId:e.target.value}))}>
              <option value="">— Seleccionar —</option>
              {catList.map((c:{id:string;name:string})=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Barco</label>
            <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.boatId} onChange={e=>setForm(p=>({...p,boatId:e.target.value}))}>
              <option value="">— Sin barco —</option>
              {boatList.map((b:{id:string;name:string})=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-amber-600">⚠ Verificar retención IRPF con asesoría fiscal</p>
          </div>
        </div>
      </Modal>
      <ConfirmModal open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={handleDelete} title="Desactivar tripulante" message="El tripulante quedará inactivo pero sus nóminas se conservan." />
      <ToastContainer toasts={toasts} onRemove={remove} />
    </Card>
  );
}

/* ══════════════════════════════════════════════════════
   CATEGORÍAS
══════════════════════════════════════════════════════ */
function CategoriasPanel() {
  const { toasts, toast, remove } = useToast();
  const { data, loading, refetch } = useFetch<{ id:string;name:string;code:string;allocationParts:number;socialSecurityGroup:string|null }[]>("/api/maestros/categorias");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"", code:"", allocationParts:"1", socialSecurityGroup:"", notes:"" });
  const items = Array.isArray(data) ? data : [];
  const f = (k:keyof typeof form) => (v:string) => setForm(p=>({...p,[k]:v}));

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/maestros/categorias", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ ...form, allocationParts: parseFloat(form.allocationParts)||1 }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast("Categoría creada","success"); refetch(); setOpen(false);
      setForm({ name:"",code:"",allocationParts:"1",socialSecurityGroup:"",notes:"" });
    } catch (e:unknown) { toast((e as Error).message,"error"); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Categorías de tripulantes</h3>
          <Button size="sm" onClick={()=>setOpen(true)}>+ Nueva</Button>
        </div>
      </CardHeader>
      <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
        ⚠ Las partes de reparto determinan cómo se divide la liquidación entre tripulantes. Patrón=2, Maquinista=1.5, Marinero=1, Peón=0.75 son valores habituales — verifica con tu convenio.
      </div>
      {loading ? <div className="p-8 flex justify-center"><Spinner /></div> : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-100">
            <tr>{["Nombre","Código","Partes reparto","Grupo SS"].map(h=><th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map(c=>(
              <tr key={c.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 font-medium">{c.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{c.code}</td>
                <td className="px-4 py-2.5 font-mono">{Number(c.allocationParts).toFixed(2)}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.socialSecurityGroup||"—"}</td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">Sin categorías</td></tr>}
          </tbody>
        </table>
      )}
      <Modal open={open} onClose={()=>setOpen(false)} title="Nueva categoría"
        footer={<><Button variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={handleSave} loading={saving}>Guardar</Button></>}>
        <div className="space-y-3">
          <Field label="Nombre" value={form.name} onChange={f("name")} required />
          <Field label="Código (ej: PATRON)" value={form.code} onChange={f("code")} required />
          <Field label="Partes de reparto" value={form.allocationParts} onChange={f("allocationParts")} type="number" />
          <Field label="Grupo Seguridad Social" value={form.socialSecurityGroup} onChange={f("socialSecurityGroup")} />
          <Field label="Notas" value={form.notes} onChange={f("notes")} />
        </div>
      </Modal>
      <ToastContainer toasts={toasts} onRemove={remove} />
    </Card>
  );
}

/* ══════════════════════════════════════════════════════
   PUERTOS
══════════════════════════════════════════════════════ */
function PuertosPanel() {
  const { toasts, toast, remove } = useToast();
  const { data, loading, refetch } = useFetch<{ items:{id:string;name:string;code:string|null;province:string|null;country:string}[] }>("/api/maestros/puertos?limit=50");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"", code:"", province:"", country:"España" });
  const items = data?.items ?? [];
  const f = (k:keyof typeof form) => (v:string) => setForm(p=>({...p,[k]:v}));

  async function handleSave() {
    setSaving(true);
    try {
      const url = editId ? `/api/maestros/puertos/${editId}` : "/api/maestros/puertos";
      const res = await fetch(url, { method: editId?"PUT":"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(form) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(editId?"Puerto actualizado":"Puerto creado","success"); refetch(); setOpen(false); setEditId(null);
      setForm({ name:"",code:"",province:"",country:"España" });
    } catch (e:unknown) { toast((e as Error).message,"error"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try { await fetch(`/api/maestros/puertos/${deleteId}`, { method:"DELETE" }); toast("Puerto eliminado","success"); refetch(); }
    catch { toast("Error","error"); }
    finally { setDeleteId(null); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Puertos</h3>
          <Button size="sm" onClick={()=>{ setEditId(null); setForm({name:"",code:"",province:"",country:"España"}); setOpen(true); }}>+ Nuevo</Button>
        </div>
      </CardHeader>
      {loading ? <div className="p-8 flex justify-center"><Spinner /></div> : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-100">
            <tr>{["Nombre","Código","Provincia","País",""].map(h=><th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map(p=>(
              <tr key={p.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 font-medium">{p.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{p.code||"—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{p.province||"—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{p.country}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-2">
                    <button onClick={()=>{ setEditId(p.id); setForm({name:p.name,code:p.code||"",province:p.province||"",country:p.country}); setOpen(true); }} className="text-xs text-ocean-600 hover:text-ocean-800 font-medium">Editar</button>
                    <button onClick={()=>setDeleteId(p.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">Sin puertos</td></tr>}
          </tbody>
        </table>
      )}
      <Modal open={open} onClose={()=>setOpen(false)} title={editId?"Editar puerto":"Nuevo puerto"}
        footer={<><Button variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={handleSave} loading={saving}>Guardar</Button></>}>
        <div className="space-y-3">
          <Field label="Nombre" value={form.name} onChange={f("name")} required />
          <Field label="Código" value={form.code} onChange={f("code")} />
          <Field label="Provincia" value={form.province} onChange={f("province")} />
          <Field label="País" value={form.country} onChange={f("country")} />
        </div>
      </Modal>
      <ConfirmModal open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={handleDelete} title="Eliminar puerto" message="¿Seguro que quieres eliminar este puerto?" />
      <ToastContainer toasts={toasts} onRemove={remove} />
    </Card>
  );
}

/* ══════════════════════════════════════════════════════
   PROVEEDORES
══════════════════════════════════════════════════════ */
function ProveedoresPanel() {
  const { toasts, toast, remove } = useToast();
  const { data, loading, refetch } = useFetch<{ items:{id:string;name:string;taxId:string|null;address:string|null;phone:string|null;email:string|null}[] }>("/api/maestros/proveedores?limit=50");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"", taxId:"", address:"", phone:"", email:"", notes:"" });
  const items = data?.items ?? [];
  const f = (k:keyof typeof form) => (v:string) => setForm(p=>({...p,[k]:v}));

  async function handleSave() {
    setSaving(true);
    try {
      const url = editId ? `/api/maestros/proveedores/${editId}` : "/api/maestros/proveedores";
      const res = await fetch(url, { method: editId?"PUT":"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ ...form, taxId: form.taxId||undefined, email: form.email||undefined }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(editId?"Proveedor actualizado":"Proveedor creado","success"); refetch(); setOpen(false); setEditId(null);
      setForm({ name:"",taxId:"",address:"",phone:"",email:"",notes:"" });
    } catch (e:unknown) { toast((e as Error).message,"error"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try { await fetch(`/api/maestros/proveedores/${deleteId}`, { method:"DELETE" }); toast("Proveedor eliminado","success"); refetch(); }
    catch { toast("Error","error"); }
    finally { setDeleteId(null); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Proveedores / Lonjas / Cofradías</h3>
          <Button size="sm" onClick={()=>{ setEditId(null); setForm({name:"",taxId:"",address:"",phone:"",email:"",notes:""}); setOpen(true); }}>+ Nuevo</Button>
        </div>
      </CardHeader>
      {loading ? <div className="p-8 flex justify-center"><Spinner /></div> : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-100">
            <tr>{["Nombre","CIF/NIF","Dirección","Teléfono",""].map(h=><th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map(p=>(
              <tr key={p.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 font-medium">{p.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{p.taxId||"—"}</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{p.address||"—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{p.phone||"—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-2">
                    <button onClick={()=>{ setEditId(p.id); setForm({name:p.name,taxId:p.taxId||"",address:p.address||"",phone:p.phone||"",email:p.email||"",notes:""}); setOpen(true); }} className="text-xs text-ocean-600 hover:text-ocean-800 font-medium">Editar</button>
                    <button onClick={()=>setDeleteId(p.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">Sin proveedores</td></tr>}
          </tbody>
        </table>
      )}
      <Modal open={open} onClose={()=>setOpen(false)} title={editId?"Editar proveedor":"Nuevo proveedor / lonja"}
        footer={<><Button variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={handleSave} loading={saving}>Guardar</Button></>}>
        <div className="space-y-3">
          <Field label="Nombre" value={form.name} onChange={f("name")} required />
          <Field label="CIF / NIF" value={form.taxId} onChange={f("taxId")} />
          <Field label="Dirección" value={form.address} onChange={f("address")} />
          <Field label="Teléfono" value={form.phone} onChange={f("phone")} />
          <Field label="Email" value={form.email} onChange={f("email")} type="email" />
          <Field label="Notas" value={form.notes} onChange={f("notes")} />
        </div>
      </Modal>
      <ConfirmModal open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={handleDelete} title="Eliminar proveedor" message="¿Seguro que quieres eliminar este proveedor?" />
      <ToastContainer toasts={toasts} onRemove={remove} />
    </Card>
  );
}

/* ══════════════════════════════════════════════════════
   ESPECIES
══════════════════════════════════════════════════════ */
function EspeciesPanel() {
  const { toasts, toast, remove } = useToast();
  const { data, loading, refetch } = useFetch<{ items:{id:string;name:string;scientificName:string|null;code:string|null;category:string|null}[] }>("/api/maestros/especies?limit=50");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"", scientificName:"", code:"", category:"" });
  const items = data?.items ?? [];
  const f = (k:keyof typeof form) => (v:string) => setForm(p=>({...p,[k]:v}));

  async function handleSave() {
    setSaving(true);
    try {
      const url = editId ? `/api/maestros/especies/${editId}` : "/api/maestros/especies";
      const res = await fetch(url, { method: editId?"PUT":"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ ...form, scientificName: form.scientificName||undefined, code: form.code||undefined, category: form.category||undefined }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(editId?"Especie actualizada":"Especie creada","success"); refetch(); setOpen(false); setEditId(null);
      setForm({ name:"",scientificName:"",code:"",category:"" });
    } catch (e:unknown) { toast((e as Error).message,"error"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try { await fetch(`/api/maestros/especies/${deleteId}`, { method:"DELETE" }); toast("Especie eliminada","success"); refetch(); }
    catch { toast("Error","error"); }
    finally { setDeleteId(null); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Especies</h3>
          <Button size="sm" onClick={()=>{ setEditId(null); setForm({name:"",scientificName:"",code:"",category:""}); setOpen(true); }}>+ Nueva</Button>
        </div>
      </CardHeader>
      {loading ? <div className="p-8 flex justify-center"><Spinner /></div> : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y border-slate-100">
            <tr>{["Nombre","Nombre científico","Código","Categoría",""].map(h=><th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map(e=>(
              <tr key={e.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 font-medium">{e.name}</td>
                <td className="px-4 py-2.5 text-slate-400 italic text-xs">{e.scientificName||"—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{e.code||"—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{e.category||"—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-2">
                    <button onClick={()=>{ setEditId(e.id); setForm({name:e.name,scientificName:e.scientificName||"",code:e.code||"",category:e.category||""}); setOpen(true); }} className="text-xs text-ocean-600 hover:text-ocean-800 font-medium">Editar</button>
                    <button onClick={()=>setDeleteId(e.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">Sin especies</td></tr>}
          </tbody>
        </table>
      )}
      <Modal open={open} onClose={()=>setOpen(false)} title={editId?"Editar especie":"Nueva especie"}
        footer={<><Button variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={handleSave} loading={saving}>Guardar</Button></>}>
        <div className="space-y-3">
          <Field label="Nombre común" value={form.name} onChange={f("name")} required />
          <Field label="Nombre científico" value={form.scientificName} onChange={f("scientificName")} />
          <Field label="Código FAO" value={form.code} onChange={f("code")} />
          <Field label="Categoría (Demersal, Pelágico...)" value={form.category} onChange={f("category")} />
        </div>
      </Modal>
      <ConfirmModal open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={handleDelete} title="Eliminar especie" message="¿Seguro que quieres eliminar esta especie?" />
      <ToastContainer toasts={toasts} onRemove={remove} />
    </Card>
  );
}
