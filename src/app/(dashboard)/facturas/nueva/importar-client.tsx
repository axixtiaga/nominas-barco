"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFetch } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/ui/toast";

interface ParsedLine { speciesName?: string; kilos?: number; pricePerKilo?: number; lineAmount?: number }
interface ParsedData {
  invoiceNumber?: string; invoiceDate?: string; portName?: string;
  supplierName?: string; boatName?: string; subtotal?: number;
  taxAmount?: number; feesAmount?: number; totalAmount?: number;
  observations?: string; lines: ParsedLine[]; parseConfidence: number; parseWarnings: string[];
}
interface UploadResult { document: { id: string; filename: string }; parsed: ParsedData }

type LineField = keyof ParsedLine;

export default function ImportarFacturaClient() {
  const router  = useRouter();
  const { toasts, toast, remove } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step,       setStep]       = useState<"upload"|"review"|"save">("upload");
  const [uploading,  setUploading]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [docId,      setDocId]      = useState<string | null>(null);
  const [parsed,     setParsed]     = useState<ParsedData | null>(null);
  const [form,       setForm]       = useState({ invoiceNumber:"", invoiceDate:"", portId:"", supplierId:"", boatId:"", subtotal:0, taxAmount:0, feesAmount:0, totalAmount:0, observations:"" });
  const [lines,      setLines]      = useState<ParsedLine[]>([]);

  const { data: portsData }     = useFetch<{ items: { id: string; name: string }[]; meta: { total: number } }>("/api/maestros/puertos?limit=100");
  const { data: suppliersData } = useFetch<{ items: { id: string; name: string }[]; meta: { total: number } }>("/api/maestros/proveedores?limit=100");
  const { data: boatsData }     = useFetch<{ items: { id: string; name: string }[]; meta: { total: number } }>("/api/maestros/barcos?limit=100");

  const portsList     = portsData?.items ?? [];
  const suppliersList = suppliersData?.items ?? [];
  const boatsList     = boatsData?.items ?? [];

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/facturas/upload", { method: "POST", body: fd });
      const json: { data: UploadResult } = await res.json();
      if (!res.ok) throw new Error((json as unknown as { error: string }).error);

      const { document, parsed: p } = json.data;
      setDocId(document.id);
      setParsed(p);
      setForm((f) => ({
        ...f,
        invoiceNumber: p.invoiceNumber ?? "",
        invoiceDate:   p.invoiceDate   ?? new Date().toISOString().slice(0,10),
        subtotal:      p.subtotal      ?? 0,
        taxAmount:     p.taxAmount     ?? 0,
        feesAmount:    p.feesAmount    ?? 0,
        totalAmount:   p.totalAmount   ?? 0,
        observations:  p.observations  ?? "",
      }));
      setLines(p.lines.length ? p.lines : [{ speciesName:"", kilos:0, pricePerKilo:0, lineAmount:0 }]);
      setStep("review");
    } catch (e: unknown) {
      toast((e as Error).message || "Error al subir el archivo", "error");
    } finally {
      setUploading(false);
    }
  }

  function updateLine(i: number, field: LineField, value: string | number) {
    setLines((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: field === "speciesName" ? value : Number(value) };
      if (field === "kilos" || field === "pricePerKilo") {
        next[i].lineAmount = (next[i].kilos ?? 0) * (next[i].pricePerKilo ?? 0);
      }
      return next;
    });
  }

  function addLine() { setLines((p) => [...p, { speciesName:"", kilos:0, pricePerKilo:0, lineAmount:0 }]); }
  function removeLine(i: number) { setLines((p) => p.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    if (!lines.length || lines.every((l) => !l.kilos)) {
      toast("Añade al menos una línea de captura con kilos", "warning"); return;
    }
    setSaving(true);
    try {
      const total = form.totalAmount || lines.reduce((s, l) => s + (l.lineAmount ?? 0), 0);
      const body = {
        ...form,
        subtotal:    form.subtotal    || lines.reduce((s,l) => s+(l.lineAmount??0), 0),
        totalAmount: total,
        lines: lines.filter((l) => l.kilos && l.kilos > 0).map((l) => ({
          speciesName:  l.speciesName  || null,
          kilos:        l.kilos        ?? 0,
          pricePerKilo: l.pricePerKilo ?? 0,
          lineAmount:   l.lineAmount   ?? 0,
        })),
      };
      const res = await fetch("/api/facturas", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast("Factura guardada", "success");
      setTimeout(() => router.push(`/facturas/${json.data.id}`), 800);
    } catch (e: unknown) {
      toast((e as Error).message || "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  // ── STEP 1: Upload ──
  if (step === "upload") {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader><h3 className="text-sm font-semibold text-slate-700">Subir documento</h3></CardHeader>
          <CardBody className="space-y-4">
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center hover:border-ocean-300 hover:bg-ocean-50/30 transition-colors cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
              onClick={() => fileRef.current?.click()}
            >
              <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <p className="text-sm font-medium text-slate-600">Arrastra aquí o haz clic para seleccionar</p>
              <p className="text-xs text-slate-400 mt-1">PDF, imagen, Excel (.xlsx), CSV — máx. 20 MB</p>
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </div>
            {uploading && (
              <div className="flex items-center justify-center gap-2 text-sm text-ocean-600">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
                Extrayendo datos del documento…
              </div>
            )}
            <div className="pt-2 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-400 mb-2">¿O prefieres introducir los datos manualmente?</p>
              <Button variant="ghost" size="sm" onClick={() => { setLines([{ speciesName:"", kilos:0, pricePerKilo:0, lineAmount:0 }]); setStep("review"); }}>
                Introducir manualmente
              </Button>
            </div>
          </CardBody>
        </Card>
        <ToastContainer toasts={toasts} onRemove={remove} />
      </div>
    );
  }

  // ── STEP 2: Review / manual ──
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {(parsed?.parseWarnings?.length ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-800">⚠ Avisos de extracción automática:</p>
          {(parsed?.parseWarnings ?? []).map((w, i) => <p key={i} className="text-xs text-amber-700">• {w}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader><h3 className="text-sm font-semibold text-slate-700">Datos de cabecera</h3></CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Nº Factura</label>
                <input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.invoiceNumber} onChange={(e)=>setForm(f=>({...f,invoiceNumber:e.target.value}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Fecha</label>
                <input type="date" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.invoiceDate} onChange={(e)=>setForm(f=>({...f,invoiceDate:e.target.value}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Puerto</label>
                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.portId} onChange={(e)=>setForm(f=>({...f,portId:e.target.value}))}>
                  <option value="">— Seleccionar —</option>
                  {portsList.map((p:{id:string;name:string})=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Proveedor / Lonja</label>
                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.supplierId} onChange={(e)=>setForm(f=>({...f,supplierId:e.target.value}))}>
                  <option value="">— Seleccionar —</option>
                  {suppliersList.map((s:{id:string;name:string})=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Barco</label>
                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.boatId} onChange={(e)=>setForm(f=>({...f,boatId:e.target.value}))}>
                  <option value="">— Seleccionar —</option>
                  {boatsList.map((b:{id:string;name:string})=><option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Observaciones</label>
                <input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500" value={form.observations} onChange={(e)=>setForm(f=>({...f,observations:e.target.value}))} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-slate-700">Importes</h3></CardHeader>
          <CardBody className="space-y-3">
            {([["Subtotal","subtotal"],["Impuestos","taxAmount"],["Tasas","feesAmount"],["Total factura","totalAmount"]] as [string,keyof typeof form][]).map(([label,field])=>(
              <div key={field}>
                <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
                <input type="number" step="0.01" className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 font-mono ${field==="totalAmount"?"border-ocean-300 font-bold":"border-slate-200"}`} value={form[field] as number} onChange={(e)=>setForm(f=>({...f,[field]:parseFloat(e.target.value)||0}))} />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Líneas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Líneas de captura</h3>
            <Button variant="outline" size="sm" onClick={addLine}>+ Añadir línea</Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-100">
              <tr>
                {["Especie","Kilos","Precio/kg","Importe",""].map(h=><th key={h} className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {lines.map((line, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <input className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-ocean-500" value={line.speciesName||""} onChange={(e)=>updateLine(i,"speciesName",e.target.value)} placeholder="Especie…" />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <input type="number" step="0.001" className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-ocean-500 font-mono" value={line.kilos||""} onChange={(e)=>updateLine(i,"kilos",e.target.value)} placeholder="0.000" />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <input type="number" step="0.0001" className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-ocean-500 font-mono" value={line.pricePerKilo||""} onChange={(e)=>updateLine(i,"pricePerKilo",e.target.value)} placeholder="0.00" />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <input type="number" step="0.01" className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-ocean-500 font-mono font-semibold" value={line.lineAmount||""} onChange={(e)=>updateLine(i,"lineAmount",e.target.value)} placeholder="0.00" />
                  </td>
                  <td className="px-3 py-2 w-10">
                    <button onClick={()=>removeLine(i)} className="text-slate-300 hover:text-red-500 transition-colors">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between text-sm">
          <span className="text-slate-500">Total líneas: {lines.reduce((s,l)=>s+(l.kilos??0),0).toFixed(3)} kg</span>
          <span className="font-semibold text-slate-700">Importe líneas: {new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(lines.reduce((s,l)=>s+(l.lineAmount??0),0))}</span>
        </div>
      </Card>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={() => setStep("upload")}>← Volver</Button>
        <Button onClick={handleSave} loading={saving} size="lg">Guardar factura</Button>
      </div>
      <ToastContainer toasts={toasts} onRemove={remove} />
    </div>
  );
}
