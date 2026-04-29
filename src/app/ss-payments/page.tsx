"use client";
import { useEffect, useMemo, useState } from "react";

type Payment = {
  id: string;
  sailorId: string;
  sailorName: string;
  sailorRole: string;
  sailorNameRaw: string;
  sailorDniRaw: string | null;
  month: string;
  amount: number;
  totalCost: number | null;
  employerPart: number | null;
  employeePart: number | null;
  sourceFile: string | null;
  importedAt: string;
};

type ComparativaMonth = {
  month: string;
  totalPagado: number;
  totalRetenido35: number;
  totalRetenido40: number;
  diferencia35: number;
  diferencia40: number;
  mantasCount: number;
};

export default function SsPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Comparativa
  const [comparativa, setComparativa] = useState<ComparativaMonth[]>([]);

  // Importación
  const [file, setFile] = useState<File | null>(null);
  const [importMonth, setImportMonth] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  // Preview (para depurar formato del Excel)
  const [preview, setPreview] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState(false);

  async function doPreview() {
    if (!file) { setMsg("Selecciona un fichero Excel."); return; }
    setPreviewing(true);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/ss-payments/preview", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { setMsg(j?.error ?? "Error en la vista previa"); return; }
      setPreview(j.data);
    } finally {
      setPreviewing(false);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const url = filterMonth ? `/api/ss-payments?month=${filterMonth}` : "/api/ss-payments";
      const r = await fetch(url);
      const j = await r.json();
      setPayments(j?.data?.payments ?? []);
      setAvailableMonths(j?.data?.availableMonths ?? []);
    } finally {
      setLoading(false);
    }
  }
  async function refreshComparativa() {
    const r = await fetch("/api/ss-payments/comparativa");
    const j = await r.json();
    setComparativa(j?.data?.months ?? []);
  }

  useEffect(() => { refresh(); }, [filterMonth]);
  useEffect(() => { refreshComparativa(); }, [payments.length]);

  async function doImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setMsg("Selecciona un fichero Excel."); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (importMonth) fd.append("month", importMonth);
      const r = await fetch("/api/ss-payments/import", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { setMsg(j?.error ?? "Error importando"); return; }
      setImportResult(j.data);
      setMsg(`✅ ${j.data.summary.imported} nuevos, ${j.data.summary.updated} actualizados, ${j.data.summary.skipped} sin matchear.`);
      setFile(null);
      // Reset input file
      const input = document.getElementById("ss-file-input") as HTMLInputElement | null;
      if (input) input.value = "";
      refresh();
    } finally {
      setImporting(false);
    }
  }

  async function deletePayment(id: string, sailorName: string, month: string) {
    if (!confirm(`¿Borrar el pago de SS de ${sailorName} (${month})?`)) return;
    const r = await fetch(`/api/ss-payments/${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json(); setMsg(j?.error ?? "Error"); return; }
    refresh();
  }

  async function resetAll() {
    if (!confirm("⚠️ Esto va a BORRAR TODOS los pagos de Seguridad Social registrados.\n\nÚsalo si tras una importación los datos están mal y quieres empezar de cero.\n\n¿Continuar?")) return;
    const r = await fetch("/api/ss-payments/reset", { method: "POST" });
    const j = await r.json();
    if (!r.ok) { setMsg(j?.error ?? "Error"); return; }
    setMsg(`🗑 Borrados ${j.data.deleted} registros. Ahora puedes volver a importar el fichero.`);
    refresh();
    refreshComparativa();
  }

  const totals = useMemo(() => {
    const total = payments.reduce((a, p) => a + p.amount, 0);
    return { count: payments.length, total };
  }, [payments]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Seguridad Social</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Importa el Excel mensual de pagos de Seguridad Social y compáralo con
          lo retenido a la tripulación en las mantas (3,5% y 4%).
          Los ficheros suelen estar en{" "}
          <code className="bg-slate-100 px-1 rounded text-[11px]">
            C:\Users\User\Dropbox\Itsas Lagunak\Cuentas 2026\Seguridad Social
          </code>.
          La columna <b>O</b> del Excel se importa como importe principal.
        </p>
      </div>

      {msg && (
        <div className="card text-sm bg-emerald-50 border-emerald-200 flex items-center justify-between">
          <span>{msg}</span>
          <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {/* IMPORTACIÓN */}
      <form className="card space-y-3" onSubmit={doImport}>
        <h2 className="font-semibold">Importar Excel mensual</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="block text-sm">
            <span className="block text-xs text-slate-500 mb-1">Fichero Excel (.xlsx)</span>
            <input
              id="ss-file-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-xs text-slate-500 mb-1">Mes (opcional, formato YYYY-MM)</span>
            <input
              type="text"
              placeholder="ej. 2026-04"
              value={importMonth}
              onChange={e => setImportMonth(e.target.value)}
              className="input text-sm"
            />
            <span className="text-[10px] text-slate-400 italic">Si no lo pones, se intenta inferir del nombre del fichero.</span>
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" disabled={previewing || !file} onClick={doPreview}>
              {previewing ? "Analizando..." : "🔍 Vista previa"}
            </button>
            <button type="submit" className="btn-primary" disabled={importing || !file}>
              {importing ? "Importando..." : "Importar"}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 italic">
          💡 Pulsa <b>"Vista previa"</b> primero si es un formato nuevo — te muestra la estructura del Excel sin guardar nada.
        </p>
      </form>

      {/* VISTA PREVIA (estructura cruda del Excel) */}
      {preview && (
        <div className="card text-xs space-y-2 max-h-[500px] overflow-auto bg-slate-50">
          <div className="font-semibold text-sm sticky top-0 bg-slate-50 pb-2 border-b border-slate-200">
            Vista previa: {preview.filename}
            <button className="float-right text-rose-600 underline" onClick={() => setPreview(null)}>cerrar</button>
          </div>
          <div>
            Hojas: {preview.sheets.map((s: any) => `${s.name} (${s.rowCount} filas × ${s.columnCount} cols)`).join(", ")}
          </div>
          <div>Hoja principal: <b>{preview.mainSheet}</b> — {preview.mainRowCount} filas × {preview.mainColumnCount} columnas</div>
          <div className="overflow-x-auto">
            <table className="text-[10px] border-collapse w-full">
              <thead>
                <tr>
                  <th className="border border-slate-300 px-1 py-0.5 bg-slate-200">#</th>
                  {["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T"].map(c =>
                    <th key={c} className={`border border-slate-300 px-1 py-0.5 ${c === "O" ? "bg-amber-200" : "bg-slate-200"}`}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {preview.first30Rows.map((row: any) => (
                  <tr key={row.row}>
                    <td className="border border-slate-300 px-1 font-mono">{row.row}</td>
                    {["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T"].map(c =>
                      <td key={c} className={`border border-slate-300 px-1 ${c === "O" ? "bg-amber-50 font-semibold" : ""}`}>{row.cells[c] ?? ""}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="italic text-[10px] text-slate-500">La columna O está marcada en amarillo. Si no está donde se espera el dato, dímelo.</p>
        </div>
      )}

      {/* RESUMEN DE LA IMPORTACIÓN */}
      {importResult && (
        <div className="card text-sm bg-blue-50 border-blue-200 space-y-2">
          <div className="font-semibold">Resultado de la importación: {importResult.filename} (mes {importResult.month})</div>
          <div className="text-xs space-y-1">
            <div>Filas detectadas: {importResult.summary.totalRows}</div>
            <div className="text-emerald-700">✅ Importadas (nuevas): {importResult.summary.imported}</div>
            <div className="text-blue-700">🔄 Actualizadas: {importResult.summary.updated}</div>
            <div className="text-amber-700">⚠️ Sin matchear: {importResult.summary.skipped}</div>
          </div>
          {importResult.skipped?.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-amber-700">Ver filas no matcheadas ({importResult.skipped.length})</summary>
              <ul className="ml-5 mt-1 list-disc">
                {importResult.skipped.map((sk: any, i: number) => (
                  <li key={i}>Fila {sk.row}: {sk.name} {sk.dni ? `(${sk.dni})` : ""} — {sk.amount.toLocaleString("es-ES")} € — <i>{sk.reason}</i></li>
                ))}
              </ul>
              <p className="text-[10px] mt-1 text-slate-500 italic">
                Para resolverlas: añade el DNI o ajusta el nombre en el maestro de marineros, y vuelve a importar.
              </p>
            </details>
          )}
          <button className="text-xs text-slate-500 underline" onClick={() => setImportResult(null)}>Cerrar</button>
        </div>
      )}

      {/* COMPARATIVA MENSUAL */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold">Comparativa mensual: SS pagada vs retenida en mantas</h2>
        </div>
        {comparativa.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 italic text-center">
            Sin datos todavía. Importa un Excel mensual para empezar.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Mantas</th>
                <th className="text-right">Retenido 3,5%</th>
                <th className="text-right">Retenido 4%</th>
                <th className="text-right">Pagado a SS</th>
                <th className="text-right">Δ vs 3,5%</th>
                <th className="text-right">Δ vs 4%</th>
              </tr>
            </thead>
            <tbody>
              {comparativa.map(m => (
                <tr key={m.month}>
                  <td className="font-medium">{formatMonth(m.month)}</td>
                  <td className="text-right tabular-nums">{m.mantasCount}</td>
                  <td className="text-right tabular-nums">{fmtEur(m.totalRetenido35)}</td>
                  <td className="text-right tabular-nums">{fmtEur(m.totalRetenido40)}</td>
                  <td className="text-right tabular-nums font-semibold">{fmtEur(m.totalPagado)}</td>
                  <td className={`text-right tabular-nums ${m.diferencia35 > 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmtEur(m.diferencia35)}</td>
                  <td className={`text-right tabular-nums ${m.diferencia40 > 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmtEur(m.diferencia40)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="px-4 py-2 text-[11px] text-slate-500 italic border-t border-slate-200">
          <b>Δ positivo</b> (rojo) = la empresa paga más a la SS que lo retenido en mantas.{" "}
          <b>Δ negativo</b> (verde) = se ha retenido más de lo que se ha pagado.
        </div>
      </div>

      {/* LISTADO DE PAGOS */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold flex-1">Pagos registrados</h2>
          <label className="text-xs">
            <span className="text-slate-500 mr-1">Filtrar mes:</span>
            <select className="input text-xs" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
              <option value="">Todos</option>
              {availableMonths.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </select>
          </label>
          <span className="text-xs text-slate-500">{totals.count} registro{totals.count === 1 ? "" : "s"} · Σ {fmtEur(totals.total)}</span>
          {payments.length > 0 && (
            <button className="text-xs text-rose-600 hover:underline ml-auto" onClick={resetAll} title="Borrar TODOS los pagos">
              🗑 Borrar todo
            </button>
          )}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Marinero</th>
              <th>Rol</th>
              <th>DNI (Excel)</th>
              <th className="text-right">Importe</th>
              <th>Origen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Cargando…</td></tr>}
            {!loading && payments.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-500 italic">Sin pagos registrados.</td></tr>
            )}
            {payments.map(p => (
              <tr key={p.id}>
                <td>{formatMonth(p.month)}</td>
                <td className="font-medium">{p.sailorName}</td>
                <td className="text-xs text-slate-600">{p.sailorRole}</td>
                <td className="text-xs font-mono">{p.sailorDniRaw ?? "—"}</td>
                <td className="text-right tabular-nums">{fmtEur(p.amount)}</td>
                <td className="text-xs text-slate-500">{p.sourceFile ?? "—"}</td>
                <td>
                  <button className="text-xs text-rose-600 hover:underline" onClick={() => deletePayment(p.id, p.sailorName, p.month)}>
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtEur(n: any) {
  return (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatMonth(m: string) {
  const [y, mm] = m.split("-").map(Number);
  if (!y || !mm) return m;
  const d = new Date(Date.UTC(y, mm - 1, 1));
  const label = d.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
