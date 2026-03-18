"use client";
import { useRouter } from "next/navigation";
import { useList } from "@/hooks/use-fetch";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DataTable, Column } from "@/components/tables/data-table";
import { Badge } from "@/components/ui";

interface PayrollRun {
  id: string;
  status: string;
  totalCapturas: number;
  totalNeto: number;
  totalBruto: number;
  calculatedAt: string;
  period: { name: string };
  boat: { name: string };
  runByUser: { name: string };
  items: { id: string }[];
}

const STATUS: Record<string, { label:string; v:"default"|"info"|"success"|"ocean"|"warning" }> = {
  BORRADOR: { label:"Borrador",  v:"default" },
  VALIDADA: { label:"Validada",  v:"info"    },
  CERRADA:  { label:"Cerrada",   v:"success" },
  PAGADA:   { label:"Pagada",    v:"ocean"   },
};

export default function NominasClient() {
  const router = useRouter();
  const { data, loading, setPage } = useList<PayrollRun>("/api/nominas");

  const columns: Column<PayrollRun & Record<string, unknown>>[] = [
    { key:"period",         header:"Período",    render:(r)=><span className="font-medium">{r.period.name}</span> },
    { key:"boat",           header:"Barco",      render:(r)=>r.boat.name },
    { key:"calculatedAt",   header:"Calculado",  render:(r)=>formatDate(r.calculatedAt) },
    { key:"marineros",      header:"Marineros",  render:(r)=><span className="font-mono">{r.items.length}</span> },
    { key:"totalCapturas",  header:"Capturas",   align:"right", render:(r)=><span className="font-mono">{formatCurrency(r.totalCapturas)}</span> },
    { key:"totalBruto",     header:"Bruto",      align:"right", render:(r)=><span className="font-mono">{formatCurrency(r.totalBruto)}</span> },
    { key:"totalNeto",      header:"Neto",       align:"right", render:(r)=><span className="font-mono font-bold text-ocean-700">{formatCurrency(r.totalNeto)}</span> },
    {
      key:"status", header:"Estado",
      render:(r) => {
        const s = STATUS[r.status] ?? { label:r.status, v:"default" as const };
        return <Badge variant={s.v}>{s.label}</Badge>;
      },
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <DataTable
          columns={columns}
          data={(data?.items ?? []) as (PayrollRun & Record<string, unknown>)[]}
          loading={loading}
          meta={data?.meta}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/nominas/${row.id}`)}
          emptyTitle="Sin liquidaciones"
          emptyDescription="Calcula tu primera nómina usando el botón superior"
        />
      </div>
    </div>
  );
}
