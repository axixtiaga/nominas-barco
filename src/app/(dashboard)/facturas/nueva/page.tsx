import { Topbar } from "@/components/layout/topbar";
import ImportarFacturaClient from "./importar-client";

export const metadata = { title: "Importar factura" };

export default function NuevaFacturaPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Importar factura" subtitle="Sube un PDF, imagen, Excel o CSV para extraer los datos" />
      <ImportarFacturaClient />
    </div>
  );
}
