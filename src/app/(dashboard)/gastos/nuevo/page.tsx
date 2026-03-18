import { Topbar } from "@/components/layout/topbar";
import NuevoGastoClient from "./nuevo-gasto-client";

export const metadata = { title: "Añadir gasto" };

export default function NuevoGastoPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Añadir gasto" subtitle="Registra un gasto e imputálo al período o barco correspondiente" />
      <NuevoGastoClient />
    </div>
  );
}
