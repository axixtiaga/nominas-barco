import { Topbar } from "@/components/layout/topbar";
import ConfiguracionClient from "./configuracion-client";

export const metadata = { title: "Configuración" };

export default function ConfiguracionPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Configuración de parámetros" subtitle="Reglas de reparto, Seguridad Social, períodos y parámetros fiscales" />
      <ConfiguracionClient />
    </div>
  );
}
