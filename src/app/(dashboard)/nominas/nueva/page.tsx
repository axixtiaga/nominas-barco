import { Topbar } from "@/components/layout/topbar";
import CalcularClient from "./calcular-client";

export const metadata = { title: "Calcular liquidación" };

export default function NuevaNominaPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Calcular liquidación" subtitle="Selecciona período y barco para ejecutar el motor de cálculo" />
      <CalcularClient />
    </div>
  );
}
