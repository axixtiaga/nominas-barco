"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFetch } from "@/hooks/use-fetch";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, Spinner, Card, CardHeader, CardBody } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/ui/toast";

interface InvoiceLine {
  id: string;
  speciesName: string | null;
  kilos: number;
  pricePerKilo: number;
  lineAmount: number;
  quality?: string | null;
  species?: { id: string; name: string } | null;
}

interface InvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  subtotal: number;
  taxAmount: number;
  feesAmount: number;
  totalAmount: number;
  observations: string | null;
  reviewed: boolean;
  reviewedAt: string | null;
  port?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;
  boat?: { id: string; name: string } | null;
  lines: InvoiceLine[];
  document?: { id: string; filename: string; status: string } | null;
}

export default function FacturaDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { toasts, toast, remove } = useToast();
  const { data: invoice, loading, refetch } = useFetch<InvoiceDetail>(`/api/facturas/${id}`);
  const [saving,    setSaving]    = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [editData,  setEditData]  = useState<Partial<InvoiceDetail> | null>(null);

  useEffect(() => {
    if (invoice && !editData) {
      setEditData({
        invoiceNumber: invoice.invoiceNumber ?? "",
        invoiceDate:   invoice.invoiceDate?.slice(0, 10) ?? "",
        subtotal:      invoice.subtotal,
        taxAmount:     invoice.taxAmount,
        feesAmount:    invoice.feesAmount,
        totalAmount:   invoice.totalAmount,
        observations:  invoice.observations ?? "",
      });
    }
  }, [invoice]);

  if (loading) return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;
  if (!invoice) return <div className="p-6 text-slate-500">Factura no encontrada</div>;

  const totalKilos = invoice.lines.reduce((s, l) => s + Number(l.kilos), 0);

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        ...editData,
        invoiceDate:  editData?.invoiceDate,
        portId:       invoice!.port?.id       || undefined,
        supplierId:   invoice!.supplier?.id   || undefined,
        boatId:       invoice!.boat?.id       || undefined,
        subtotal:     Number(editData?.subtotal     ?? invoice!.subtotal),
        taxAmount:    Number(editData?.taxAmount    ?? invoice!.taxAmount),
        feesAmount:   Number(editData?.feesAmount   ?? invoice!.feesAmount),
        totalAmount:  Number(editData?.totalAmount  ?? invoice!.totalAmount),
        discountAmount: 0,
        lines: invoice!.lines.map((l) => ({
          speciesId:    l.species?.id || undefined,
          speciesName:  l.speciesName || undefined,
          kilos:        Number(l.kilos),
          pricePerKilo: Number(l.pricePerKilo),
          lineAmount:   Number(l.lineAmount),
          quality:      l.quality || undefined,
        })),
      };
      const res = await fetch(`/api/facturas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast("Factura guardada correctamente", "success");
      refetch();
    } catch (e: unknown) {
      toast((e as Error).message || "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleReview() {
    setReviewing(true);
    try {
      const res = await fetch(`/api/facturas/${id}/review`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast("Factura marcada como revisada", "success");
      refetch();
    } catch (e: unknown) {
      toast((e as Error).message || "Error", "error");
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
            ← Volver
          </button>
          <span className="text-slate-300">|</span>
          <h2 className="text-sm font-semibold text-slate-700">{invoice.invoiceNumber || "Sin número"}</h2>
          <Badge variant={invoice.reviewed ? "success" : "warning"}>
            {invoice.reviewed ? "Revisada" : "Pendiente revisión"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleSave} loading={saving}>Guardar cambios</Button>
          {!invoice.reviewed && (
            <Button size="sm" onClick={handleReview} loading={reviewing}>
              ✓ Marcar revisada
            </Button>
          )}
        </div>
      </div>

      {/* Document info */}
      {invoice.document && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3 text-sm">
          <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-amber-800">
            Documento importado: <strong>{invoice.document.filename}</strong>
            {" — "}Estado extracción: <strong>{invoice.document.status}</strong>
            {" — "}Revisa y corrige los datos extraídos antes de validar.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Datos cabecera */}
        <Card className="lg:col-span-2">
          <CardHeader><h3 className="text-sm font-semibold text-slate-700">Datos de cabecera</h3></CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Nº Factura",    field: "invoiceNumber",  type: "text" },
                { label: "Fecha",         field: "invoiceDate",    type: "date" },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
                  <input
                    type={type}
                    value={String(editData?.[field as keyof typeof editData] ?? "")}
                    onChange={(e) => setEditData((p) => ({ ...p, [field]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Puerto</label>
                <p className="px-3 py-2 text-sm bg-slate-50 rounded-md text-slate-700">{invoice.port?.name ?? "—"}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Proveedor / Lonja</label>
                <p className="px-3 py-2 text-sm bg-slate-50 rounded-md text-slate-700">{invoice.supplier?.name ?? "—"}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Barco</label>
                <p className="px-3 py-2 text-sm bg-slate-50 rounded-md text-slate-700">{invoice.boat?.name ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  value={String(editData?.observations ?? "")}
                  onChange={(e) => setEditData((p) => ({ ...p, observations: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 resize-none"
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Totales */}
        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-slate-700">Importes</h3></CardHeader>
          <CardBody>
            <div className="space-y-3">
              {[
                { label: "Subtotal",    field: "subtotal" },
                { label: "Impuestos",   field: "taxAmount" },
                { label: "Tasas",       field: "feesAmount" },
              ].map(({ label, field }) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={String(editData?.[field as keyof typeof editData] ?? 0)}
                    onChange={(e) => setEditData((p) => ({ ...p, [field]: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 font-mono"
                  />
                </div>
              ))}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Total factura</span>
                  <span className="text-lg font-bold text-ocean-700">{formatCurrency(invoice.totalAmount)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>Total kilos</span>
                  <span className="font-mono">{totalKilos.toFixed(3)} kg</span>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Líneas de captura */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Líneas de captura</h3>
            <span className="text-xs text-slate-400">{invoice.lines.length} línea(s)</span>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-100">
              <tr>
                {["Especie","Kilos","Precio/kg","Importe","Calidad"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invoice.lines.map((line) => (
                <tr key={line.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">
                    {line.species?.name || line.speciesName || <span className="text-slate-400 italic">Sin especie</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">{Number(line.kilos).toFixed(3)}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">{formatCurrency(Number(line.pricePerKilo))}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-700">{formatCurrency(Number(line.lineAmount))}</td>
                  <td className="px-4 py-2.5 text-slate-500">{line.quality || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200">
              <tr>
                <td className="px-4 py-3 font-bold text-slate-700">TOTAL</td>
                <td className="px-4 py-3 font-mono font-bold text-slate-700">{totalKilos.toFixed(3)} kg</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                  {totalKilos > 0 ? `${formatCurrency(Number(invoice.totalAmount) / totalKilos)}/kg` : "—"}
                </td>
                <td className="px-4 py-3 font-mono font-bold text-ocean-700">{formatCurrency(Number(invoice.totalAmount))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <ToastContainer toasts={toasts} onRemove={remove} />
    </div>
  );
}
