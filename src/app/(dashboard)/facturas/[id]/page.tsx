import { Topbar } from "@/components/layout/topbar";
import FacturaDetailClient from "./factura-detail-client";

export const metadata = { title: "Detalle de factura" };

export default async function FacturaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Detalle de factura" subtitle="Revisión y edición de datos extraídos" />
      <FacturaDetailClient id={id} />
    </div>
  );
}
