import { Topbar } from "@/components/layout/topbar";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import NominasClient from "./nominas-client";

export const metadata = { title: "Liquidaciones" };

export default function NominasPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Liquidaciones y nóminas"
        subtitle="Cálculo y gestión de liquidaciones por período y barco"
        actions={
          <Link href="/nominas/nueva">
            <Button size="sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Calcular nómina
            </Button>
          </Link>
        }
      />
      <NominasClient />
    </div>
  );
}
