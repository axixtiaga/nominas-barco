import { Topbar } from "@/components/layout/topbar";
import MaestrosClient from "./maestros-client";

export const metadata = { title: "Maestros" };

export default function MaestrosPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Maestros" subtitle="CRUD de barcos, puertos, tripulantes, especies y proveedores" />
      <MaestrosClient />
    </div>
  );
}
