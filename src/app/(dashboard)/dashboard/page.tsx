import { Topbar } from "@/components/layout/topbar";
import DashboardClient from "./dashboard-client";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Dashboard"
        subtitle="Resumen de actividad de la flota"
      />
      <DashboardClient />
    </div>
  );
}
