"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useList } from "@/hooks/use-fetch";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DataTable, Column } from "@/components/tables/data-table";
import { Badge } from "@/components/ui";
import { ConfirmModal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface Invoice {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  totalAmount: number;
  reviewed: boolean;
  port?: { name: string } | null;
  supplier?: { name: string } | null;
  boat?: { name: string } | null;
  lines: { kilos: number }[];
}

export default function FacturasClient() {
  const router  = useRouter();
  const [search, setSearch]   = useState("");
  const [boatId, setBoatId]   = useState("");
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, setPage, page, refetch } = useList<Invoice>("/api/facturas", {
    q: search || undefined,
    boatId: boatId || undefined,
  });

  const totalKilos = (inv: Invoice) => inv.lines?.reduce((s, l) => s + Number(l.kilos), 0) ?? 0;

  const columns: Column<Invoice & Record<string, unknown>>[] = [
    {
      key: "invoiceNumber",
      header: "Nº Factura",
      render: (r) => (
        <span className="font-medium text-ocean-700">{r.invoiceNumber || <span className="text-slate-400 italic text-xs">Sin número</span>}</span>
      ),
    },
    { key: "invoiceDate", header: "Fecha", render: (r) => formatDate(r.invoiceDate) },
    { key: "port",        header: "Puerto",    render: (r) => r.port?.name ?? "—" },
    { key: "supplier",    header: "Lonja",     render: (r) => r.supplier?.name ?? "—" },
    { key: "boat",        header: "Barco",     render: (r) => r.boat?.name ?? "—" },
    { key: "kilos",       header: "Kilos",     align: "right", render: (r) => <span className="font-mono">{totalKilos(r).toFixed(1)} kg</span> },
    { key: "totalAmount", header: "Total",     align: "right", render: (r) => <span className="font-mono font-semibold">{formatCurrency(r.totalAmount)}</span> },
    {
      key: "reviewed",
      header: "Estado",
      render: (r) => (
        <Badge variant={r.reviewed ? "success" : "warning"}>
          {r.reviewed ? "Revisada" : "Pendiente"}
        </Badge>
      ),
    },
    {
      key: "actions", header: "",
      render: (r) => (
        <button onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }}
          className="text-slate-300 hover:text-red-500 transition-colors p-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      ),
    },
  ];

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/facturas/${deleteId}`, { method: "DELETE" });
      refetch();
    } catch { /* ignore */ }
    finally { setDeleting(false); setDeleteId(null); }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Filtros */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por número, barco, lonja…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setSearch(""); setBoatId(""); setPage(1); refetch(); }}
        >
          Limpiar
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open("/api/export/csv?type=facturas", "_blank")}>
            ↓ CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open("/api/export/excel?type=facturas", "_blank")}>
            ↓ Excel
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <DataTable
          columns={columns}
          data={(data?.items ?? []) as (Invoice & Record<string, unknown>)[]}
          loading={loading}
          meta={data?.meta}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/facturas/${row.id}`)}
          emptyTitle="Sin facturas"
          emptyDescription="Importa tu primera factura usando el botón superior"
        />
      </div>
      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar factura"
        message="¿Seguro que quieres eliminar esta factura? Esta acción no se puede deshacer."
      />
    </div>
  );
}
