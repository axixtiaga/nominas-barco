"use client";
import { cn } from "@/lib/utils";
import { Spinner, EmptyState } from "@/components/ui";
import { Button } from "@/components/ui/button";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Column<T = any> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => React.ReactNode;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DataTableProps<T = any> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  meta?: PaginationMeta;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  keyField?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns, data, loading, meta, onPageChange, onRowClick,
  emptyTitle = "Sin resultados", emptyDescription, emptyAction, keyField = "id",
}: DataTableProps<T>) {
  if (loading) return <div className="flex items-center justify-center py-16"><Spinner /></div>;
  if (!data.length) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {columns.map((col) => (
                <th key={col.key} className={cn("px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider",
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left", col.width)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, idx) => (
              <tr key={String(row[keyField] ?? idx)} onClick={() => onRowClick?.(row)}
                className={cn("transition-colors duration-100", onRowClick ? "cursor-pointer hover:bg-ocean-50/50" : "hover:bg-slate-50/50")}>
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-3 text-slate-700",
                    col.align === "right" ? "text-right font-mono" : col.align === "center" ? "text-center" : "")}>
                    {col.render ? col.render(row) : String(row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} de {meta.total}
          </p>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={!meta.hasPrev} onClick={() => onPageChange?.(meta.page - 1)}>← Ant.</Button>
            <span className="px-2 py-1 text-xs text-slate-600">{meta.page} / {meta.totalPages}</span>
            <Button variant="ghost" size="sm" disabled={!meta.hasNext} onClick={() => onPageChange?.(meta.page + 1)}>Sig. →</Button>
          </div>
        </div>
      )}
    </div>
  );
}
