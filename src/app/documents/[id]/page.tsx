import { notFound } from "next/navigation";
import { documentsRepo } from "@/lib/repositories/documents";
import { InvoiceEditor } from "@/components/InvoiceEditor";
import { ExpenseEditor } from "@/components/ExpenseEditor";
import { ReparseButton } from "@/components/ReparseButton";

export default async function DocumentReviewPage({ params }: { params: { id: string } }) {
  const doc = await documentsRepo.get(params.id);
  if (!doc) return notFound();

  const isGasto = doc.kind === "GASTO";

  // Título y subtítulo según tipo
  const title = isGasto
    ? `Revisar gasto ${doc.expense?.expenseNumber ?? doc.id.slice(-8)}`
    : `Revisar factura ${doc.invoice?.invoiceNumber ?? doc.id.slice(-8)}`;

  const subtitle = isGasto
    ? `Estado actual: ${doc.expense?.status ?? doc.status} · Proveedor: ${doc.expense?.supplier?.name ?? "—"} · Categoría: ${doc.expense?.category ?? "—"}`
    : `Estado actual: ${doc.invoice?.status ?? doc.status} · Formato: ${doc.format?.name ?? "—"} · Puerto: ${doc.format?.port?.name ?? "—"}`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <div className="text-sm text-slate-500">{subtitle}</div>
        </div>
        {!isGasto && <ReparseButton documentId={doc.id} />}
      </div>

      {isGasto ? (
        doc.expense ? (
          <ExpenseEditor expense={JSON.parse(JSON.stringify(doc.expense))} document={JSON.parse(JSON.stringify(doc))} />
        ) : (
          <FallbackError doc={doc} />
        )
      ) : doc.invoice ? (
        <InvoiceEditor invoice={JSON.parse(JSON.stringify(doc.invoice))} document={JSON.parse(JSON.stringify(doc))} />
      ) : (
        <FallbackError doc={doc} />
      )}
    </div>
  );
}

function FallbackError({ doc }: { doc: any }) {
  return (
    <div className="card">
      <p className="text-sm text-slate-600 mb-2">
        El documento no se pudo procesar. Probablemente el parser falló o el estado ha quedado huérfano.
        Pulsa <b>"Volver a parsear"</b> para reintentar con la versión actual del parser.
      </p>
      <p className="text-sm font-medium mt-3">Error del último intento:</p>
      <pre className="text-xs bg-slate-50 p-3 rounded mt-1 overflow-auto">{doc.parseError ?? "Sin información"}</pre>
      {doc.rawText && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-slate-500">Ver texto extraído del PDF</summary>
          <pre className="overflow-auto max-h-96 mt-2 whitespace-pre-wrap">{doc.rawText.slice(0, 3000)}</pre>
        </details>
      )}
    </div>
  );
}
