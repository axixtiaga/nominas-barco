import { Topbar } from "@/components/layout/topbar";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import GastosClient from "./gastos-client";

export const metadata = { title: "Gastos" };

export default function GastosPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Gastos"
        subtitle="Registro de gastos por período y barco"
        actions={
          <Link href="/gastos/nuevo">
            <Button size="sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Añadir gasto
            </Button>
          </Link>
        }
      />
      <GastosClient />
    </div>
  );
}
