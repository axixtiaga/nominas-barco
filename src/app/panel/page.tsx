"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { GastosPanel } from "@/components/GastosPanel";
import { NominasPanel } from "@/components/NominasPanel";

type Tab = "ingresos" | "gastos" | "nominas";

export default function PanelPage() {
  const [data, setData] = useState<any>(null);
  const [daily, setDaily] = useState<any[]>([]);
  const [weekly, setWeekly] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("ingresos");
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Forzamos no-cache + un parámetro `?t=timestamp` para que ni el navegador
  // ni ningún proxy puedan servirnos una respuesta vieja.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    const t = Date.now();
    const opts: RequestInit = { cache: "no-store", headers: { "Cache-Control": "no-cache" } };
    try {
      const [d, dd, ww] = await Promise.all([
        fetch(`/api/dashboard?_t=${t}`, opts).then(r => r.json()),
        fetch(`/api/analysis/daily?_t=${t}`, opts).then(r => r.json()),
        fetch(`/api/analysis/weekly?_t=${t}`, opts).then(r => r.json())
      ]);
      setData(d.data);
      setDaily(dd.data?.breakdown ?? []);
      setWeekly(ww.data?.breakdown ?? []);
      setLoadedAt(new Date());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Re-fetch cuando el usuario vuelve a la pestaña del navegador (típico
    // después de borrar algo en /documents y volver al panel).
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  if (!data) return <div>Cargando panel...</div>;
  const kpi = data.kpis;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Panel de control</h1>
          <p className="text-xs text-slate-500 mt-1">
            Solo incluye facturas <b>verificadas</b>. Las pendientes aparecen en
            <a href="/documents" className="text-blue-600 hover:underline"> Documentos</a>.
            {" "}Todos los importes se muestran <b>sin IVA</b> (base imponible).
          </p>
          {loadedAt && (
            <p className="text-[11px] text-slate-400 mt-1">
              Actualizado: {loadedAt.toLocaleTimeString("es-ES")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="btn-ghost shrink-0"
          title="Volver a leer los datos de la base"
        >{refreshing ? "Cargando..." : "🔄 Actualizar"}</button>
      </div>

      {/* Pestañas: Ingresos / Gastos / Nóminas */}
      <div className="border-b border-slate-200 flex gap-1">
        <TabButton active={tab === "ingresos"} onClick={() => setTab("ingresos")} icon="🐟" label="Ingresos" />
        <TabButton active={tab === "gastos"}   onClick={() => setTab("gastos")}   icon="💶" label="Gastos" />
        <TabButton active={tab === "nominas"}  onClick={() => setTab("nominas")}  icon="📋" label="Nóminas" />
      </div>

      {tab === "ingresos" && <IngresosPanel data={data} daily={daily} weekly={weekly} kpi={kpi} />}
      {tab === "gastos"   && <GastosPanel />}
      {tab === "nominas"  && <NominasPanel />}
    </div>
  );
}

function IngresosPanel({ data, daily, weekly, kpi }: { data: any; daily: any[]; weekly: any[]; kpi: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiLink href="/analysis/monthly" label="Facturas"                   value={kpi.totalInvoices} />
        <KpiLink href="/analysis/species" label="Importe (sin IVA)"          value={fmtEur(kpi.income)} />
        <KpiLink href="/analysis/monthly" label="Promedio factura (sin IVA)" value={fmtEur(kpi.avgSubtotal ?? 0)} />
      </div>

      {/* Panel de descargas — exportar todas las capturas verificadas */}
      <div className="card bg-slate-50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">Descargar capturas</h2>
            <p className="text-xs text-slate-500 mt-1">
              Exporta todas las facturas verificadas en el formato que prefieras.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="btn-primary" href="/api/export/xlsx">
              <span>📊</span><span>Descargar Excel</span>
            </a>
            <a className="btn-ghost" href="/api/export/csv">
              <span>📋</span><span>Descargar CSV</span>
            </a>
            <a className="btn-ghost" href="/api/export/pdf">
              <span>📄</span><span>Descargar PDF</span>
            </a>
          </div>
        </div>
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

        <PanelLink href="/analysis/weekly" title="Capturas por semana (últimas)">
          <SimpleTable rows={[...weekly].reverse().slice(0, 10)} cols={[
            { k: "label", l: "Semana" },
            { k: "invoices", l: "Facturas", right: true },
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

        <PanelLink href="/analysis/port" title="Por puerto (sin IVA)">
          <SimpleTable rows={data.byPort} cols={[
            { k: "portName", l: "Puerto" },
            { k: "invoices", l: "Facturas", right: true },
            { k: "subtotal", l: "Importe", fmt: fmtEur, right: true }
          ]} />
        </PanelLink>

        <PanelLink href="/analysis/supplier" title="Por proveedor (sin IVA)">
          <SimpleTable rows={data.bySupplier.slice(0, 10)} cols={[
            { k: "supplierName", l: "Proveedor" },
            { k: "invoices", l: "Facturas", right: true },
            { k: "subtotal", l: "Importe", fmt: fmtEur, right: true }
          ]} />
        </PanelLink>

        <PanelLink href="/analysis/monthly" title="Evolución mensual (sin IVA)">
          <SimpleTable rows={data.byMonth} cols={[
            { k: "month", l: "Mes" },
            { k: "invoices", l: "Facturas", right: true },
            { k: "subtotal", l: "Importe", fmt: fmtEur, right: true }
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
  // Ordenación in-memory: clic en la cabecera alterna asc/desc; segundo clic
  // en la misma columna invierte; clic en columna distinta resetea a desc.
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  if (!rows?.length) return <div className="text-sm text-slate-500">Sin datos</div>;

  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        // Si ambos son números (o parseables), comparar numéricamente
        const na = Number(va);
        const nb = Number(vb);
        const bothNumeric = Number.isFinite(na) && Number.isFinite(nb);
        let cmp: number;
        if (bothNumeric) {
          cmp = na - nb;
        } else {
          cmp = String(va ?? "").localeCompare(String(vb ?? ""), "es");
        }
        return sortDir === "asc" ? cmp : -cmp;
      })
    : rows;

  const thCls = (c: { right?: boolean }) =>
    `cursor-pointer select-none hover:text-blue-700 whitespace-nowrap ${c.right ? "text-center" : ""}`;
  const tdCls = (c: { right?: boolean }) => `whitespace-nowrap ${c.right ? "text-center tabular-nums" : ""}`;

  function onHeaderClick(e: React.MouseEvent, key: string) {
    // Evitar que el clic se propague al <Link> envolvente (PanelLink).
    e.preventDefault();
    e.stopPropagation();
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortIndicator(key: string) {
    if (sortKey !== key) return <span className="text-slate-300 ml-1">↕</span>;
    return <span className="text-blue-600 ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  return (
    <div className="overflow-x-auto">
    <table className="table">
      <thead>
        <tr>
          {cols.map(c => (
            <th
              key={c.k}
              className={thCls(c)}
              onClick={e => onHeaderClick(e, c.k)}
              title="Pulsa para ordenar"
            >
              {c.l}{sortIndicator(c.k)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{sortedRows.map((r, i) => (
        <tr key={i}>{cols.map(c => (
          <td key={c.k} className={tdCls(c)}>
            {c.fmt ? c.fmt(r[c.k]) : (r[c.k] ?? "—")}
          </td>
        ))}</tr>
      ))}</tbody>
    </table>
    </div>
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

