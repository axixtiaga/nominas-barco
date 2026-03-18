import { Topbar } from "@/components/layout/topbar";
import NominaDetailClient from "./nomina-detail-client";

export const metadata = { title: "Detalle de liquidación" };

export default async function NominaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Detalle de liquidación" subtitle="Trazabilidad completa del cálculo" />
      <NominaDetailClient id={id} />
    </div>
  );
}
