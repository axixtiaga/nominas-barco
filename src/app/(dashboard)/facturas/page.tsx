import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import FacturasClient from "./facturas-client";

export const metadata = { title: "Facturas" };

export default function FacturasPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Facturas de captura"
        subtitle="Gestión de facturas importadas desde lonjas y puertos"
        actions={
          <Link href="/facturas/nueva">
            <Button size="sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importar factura
            </Button>
          </Link>
        }
      />
      <FacturasClient />
    </div>
  );
}
