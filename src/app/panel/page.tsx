"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GastosPanel } from "@/components/GastosPanel";
import { NominasPanel } from "@/components/NominasPanel";

type Tab = "ingresos" | "gastos" | "nominas";

export default function PanelPage() {
  const [data, setData] = useState<any>(null);
  const [daily, setDaily] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("ingresos");

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(j => setData(j.data));
    fetch("/api/analysis/daily").then(r => r.json()).then(j => setDaily(j.data?.breakdown ?? []));
  }, []);

  if (!data) return <div>Cargando panel...</div>;
  const kpi = data.kpis;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Panel de control</h1>
          <p className="text-xs text-slate-500 mt-1">
            Solo incluye facturas <b>verificadas</b>. Las pendientes aparecen en
            <a href="/documents" className="text-blue-600 hover:underline"> Documentos</a>.
          </p>
        </div>
        {tab === "ingresos" && (
          <div className="flex gap-2 text-sm">
            <a className="btn-ghost" href="/api/export/csv">CSV</a>
            <a className="btn-ghost" href="/api/export/xlsx">Excel</a>
            <a className="btn-ghost" href="/api/export/pdf">PDF</a>
          </div>
        )}
      </div>

      {/* Pestañas: Ingresos / Gastos / Nóminas */}
      <div className="border-b border-slate-200 flex gap-1">
        <TabButton active={tab === "ingresos"} onClick={() => setTab("ingresos")} icon="🐟" label="Ingresos" />
        <TabButton active={tab === "gastos"}   onClick={() => setTab("gastos")}   icon="💶" label="Gastos" />
        <TabButton active={tab === "nominas"}  onClick={() => setTab("nominas")}  icon="📋" label="Nóminas" />
      </div>

      {tab === "ingresos" && <IngresosPanel data={data} daily={daily} kpi={kpi} />}
      {tab === "gastos"   && <GastosPanel />}
      {tab === "nominas"  && <NominasPanel />}
    </div>
  );
}

function IngresosPanel({ data, daily, kpi }: { data: any; daily: any[]; kpi: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiLink href="/analysis/monthly" label="Facturas"        value={kpi.totalInvoices} />
        <KpiLink href="/analysis/species" label="Base imponible"  value={fmtEur(kpi.income)} />
        <KpiLink href="/analysis/species" label="IVA"             value={fmtEur(kpi.taxes)} />
        <KpiLink href="/analysis/monthly" label="Total facturado" value={fmtEur(kpi.total)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <PanelLink href="/analysis/daily" title="Capturas por día (últimos)">
          <SimpleTable rows={daily.slice(0, 10)} cols={[
            { k: "day", l: "Fecha" },
            { k: "portName", l: "Puerto" },
            { k: "kilos", l: "Kilos", fmt: fmtKg, right: true },
            { k: "amount", l: "Importe", fmt: fmtEur, right: true }
          ]} />
        </PanelLink>

        <PanelLink href="/analysis/species" title="Capturas por especie normalizada">
          <SimpleTable rows={data.bySpecies.slice(0, 10)} cols={[
            { k: "commonName", l: "Especie" },
            { k: "kilos", l: "Kilos", fmt: fmtKg, right: true },
            { k: "amount", l: "Importe", fmt: fmtEur, right: true },
            { k: "avgPrice", l: "€/Kg", fmt: (n: any) => fmtNum(n, 3), right: true }
          ]} />
        </PanelLink>

        <PanelLink href="/analysis/port" title="Por puerto">
          <SimpleTable rows={data.byPort} cols={[
            { k: "portName", l: "Puerto" },
            { k: "invoices", l: "Facturas", right: true },
            { k: "total", l: "Total", fmt: fmtEur, right: true }
          ]} />
        </PanelLink>

        <PanelLink href="/analysis/supplier" title="Por proveedor">
          <SimpleTable rows={data.bySupplier.slice(0, 10)} cols={[
            { k: "supplierName", l: "Proveedor" },
            { k: "invoices", l: "Facturas", right: true },
            { k: "total", l: "Total", fmt: fmtEur, right: true }
          ]} />
        </PanelLink>

        <PanelLink href="/analysis/monthly" title="Evolución mensual">
          <SimpleTable rows={data.byMonth} cols={[
            { k: "month", l: "Mes" },
            { k: "invoices", l: "Facturas", right: true },
            { k: "total", l: "Total", fmt: fmtEur, right: true }
          ]} />
        </PanelLink>

        <PanelLink href="/analysis/species" title="Denominaciones del PDF sin normalizar">
          <SimpleTable rows={data.byRawSpecies.slice(0, 10)} cols={[
            { k: "rawName", l: "Denom. original" },
            { k: "kilos", l: "Kilos", fmt: fmtKg, right: true },
            { k: "amount", l: "Importe", fmt: fmtEur, right: true }
          ]} />
        </PanelLink>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 -mb-px text-sm border-b-2 transition ${active ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"}`}
    >
      <span className="mr-2">{icon}</span>{label}
    </button>
  );
}

function KpiBox({ label, value, subtitle, highlight }: { label: string; value: any; subtitle?: string; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? "border-emerald-300 bg-emerald-50" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${highlight ? "text-emerald-800" : ""}`}>{value}</div>
      {subtitle && <div className="text-[11px] text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function KpiLink({ href, label, value }: { href: string; label: string; value: any }) {
  return (
    <Link href={href} className="card hover:ring-2 hover:ring-blue-300 transition">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      <div className="text-[11px] text-blue-600 mt-2">Abrir análisis →</div>
    </Link>
  );
}

function PanelLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="card block hover:ring-2 hover:ring-blue-300 transition">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-xs text-blue-600">Ver análisis →</span>
      </div>
      {children}
    </Link>
  );
}

function SimpleTable({ rows, cols }: { rows: any[]; cols: { k: string; l: string; fmt?: (v: any) => any; right?: boolean }[] }) {
  if (!rows?.length) return <div className="text-sm text-slate-500">Sin datos</div>;
  const thCls = (c: { right?: boolean }) => c.right ? "text-center" : "";
  const tdCls = (c: { right?: boolean }) => c.right ? "text-center tabular-nums" : "";
  return (
    <table className="table">
      <thead><tr>{cols.map(c => <th key={c.k} className={thCls(c)}>{c.l}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i}>{cols.map(c => (
          <td key={c.k} className={tdCls(c)}>
            {c.fmt ? c.fmt(r[c.k]) : (r[c.k] ?? "—")}
          </td>
        ))}</tr>
      ))}</tbody>
    </table>
  );
}

function fmtNumES(n: any, decimals = 2): string {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  const fixed = Math.abs(v).toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart ? `${sign}${grouped},${decPart}` : `${sign}${grouped}`;
}
const fmtEur = (n: any) => `${fmtNumES(n, 2)} €`;
const fmtKg = (n: any) => `${fmtNumES(n, 2)} kg`;
const fmtNum = (n: any, d = 2) => fmtNumES(n, d);
