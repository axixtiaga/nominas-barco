"use client";
import { useState } from "react";
import { useList } from "@/hooks/use-fetch";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DataTable, Column } from "@/components/tables/data-table";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/ui/toast";

interface Expense {
  id: string;
  amount: number;
  date: string;
  target: string;
  description: string | null;
  expenseType: { name: string; code: string };
  period?: { name: string } | null;
  boat?: { name: string } | null;
}

const TARGET_LABELS: Record<string, string> = { ARMADOR:"Armador", TRIPULACION:"Tripulación", AMBOS:"Ambos", BARCO:"Barco" };
const TARGET_VARIANTS: Record<string, "default"|"info"|"ocean"|"warning"|"success"> = { ARMADOR:"info", TRIPULACION:"ocean", AMBOS:"warning", BARCO:"default" };

export default function GastosClient() {
  const { toasts, toast, remove } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, setPage, refetch } = useList<Expense>("/api/gastos");

  const columns: Column<Expense & Record<string, unknown>>[] = [
    { key: "date",        header: "Fecha",      render: (r) => formatDate(r.date) },
    { key: "expenseType", header: "Tipo",        render: (r) => <span className="font-medium">{r.expenseType.name}</span> },
    { key: "description", header: "Descripción", render: (r) => <span className="text-slate-500 text-xs">{r.description || "—"}</span> },
    { key: "target",      header: "Imputable a", render: (r) => <Badge variant={TARGET_VARIANTS[r.target] ?? "default"}>{TARGET_LABELS[r.target] ?? r.target}</Badge> },
    { key: "period",      header: "Período",     render: (r) => r.period?.name ?? "—" },
    { key: "boat",        header: "Barco",       render: (r) => r.boat?.name ?? "—" },
    { key: "amount",      header: "Importe",     align: "right", render: (r) => <span className="font-mono font-semibold">{formatCurrency(r.amount)}</span> },
    {
      key: "actions", header: "",
      render: (r) => (
        <button onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }} className="text-slate-300 hover:text-red-500 transition-colors p-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      ),
    },
  ];

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/gastos/${deleteId}`, { method: "DELETE" });
      toast("Gasto eliminado", "success");
      refetch();
    } catch {
      toast("Error al eliminar", "error");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => window.open("/api/export/csv?type=gastos", "_blank")}>↓ CSV</Button>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <DataTable
          columns={columns}
          data={(data?.items ?? []) as (Expense & Record<string, unknown>)[]}
          loading={loading}
          meta={data?.meta}
          onPageChange={setPage}
          emptyTitle="Sin gastos"
          emptyDescription="Añade gastos para calcular el reparto correctamente"
        />
      </div>
      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar gasto"
        message="¿Seguro que quieres eliminar este gasto? Esta acción no se puede deshacer."
      />
      <ToastContainer toasts={toasts} onRemove={remove} />
    </div>
  );
}
