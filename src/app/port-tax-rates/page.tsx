"use client";
import { useEffect, useState } from "react";

type Row = {
  id: string;
  code: string;
  name: string;
  province: string | null;
  rate: number | null;
  taxRateId: string | null;
};

export default function PortTaxRatesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});  // portId → rate string
  const [newPort, setNewPort] = useState<{ name: string; province: string; rate: string }>({ name: "", province: "", rate: "" });

  async function refresh() {
    setLoading(true);
    const r = await fetch("/api/port-tax-rates");
    const j = await r.json();
    setRows(Array.isArray(j.data) ? j.data : []);
    setEditing({});
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function saveRow(portId: string) {
    const value = editing[portId];
    if (value === undefined) return;
    const rate = parseFloat(String(value).replace(",", "."));
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setMsg("Tipo no válido. Tiene que ser un número entre 0 y 100 (ej. 3,50).");
      return;
    }
    setMsg(null);
    const r = await fetch(`/api/port-tax-rates/${portId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rate })
    });
    if (!r.ok) { const j = await r.json(); setMsg(j?.error ?? "Error guardando"); return; }
    setMsg("Guardado.");
    refresh();
  }

  async function addNewPort() {
    if (!newPort.name.trim()) { setMsg("Nombre del puerto requerido."); return; }
    const rate = parseFloat(newPort.rate.replace(",", ".")) || 0;
    const r = await fetch("/api/port-tax-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newPort.name.trim(),
        province: newPort.province.trim() || null,
        rate
      })
    });
    const j = await r.json();
    if (!r.ok) { setMsg(j?.error ?? "Error creando puerto"); return; }
    setMsg(`Puerto "${newPort.name}" creado.`);
    setNewPort({ name: "", province: "", rate: "" });
    refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Impuestos por puerto de descarga</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Tabla de % de impuesto que aplica cada puerto al total de pesca antes de calcular el subtotal del montemayor.
          Edita el valor en la columna "Tipo %" y pulsa <b>Guardar</b>. Los puertos sin % asignado se calcularán como 0.
        </p>
      </div>

      {msg && <div className="card text-sm bg-emerald-50 border-emerald-200">{msg}</div>}

      {/* Tabla principal */}
      <div className="card p-0 overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Puerto</th>
              <th>Provincia</th>
              <th>Código interno</th>
              <th className="text-center w-44">Tipo %</th>
              <th className="w-28"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isEditing = editing[r.id] !== undefined;
              const displayValue = isEditing
                ? editing[r.id]
                : (r.rate != null ? r.rate.toFixed(2).replace(".", ",") : "");
              return (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-sm text-slate-600">{r.province ?? "—"}</td>
                  <td className="font-mono text-xs text-slate-500">{r.code}</td>
                  <td>
                    <div className="flex items-center justify-center gap-2">
                      <input
                        className="input text-right tabular-nums w-20"
                        placeholder="0,00"
                        value={displayValue}
                        onChange={ev => setEditing(prev => ({ ...prev, [r.id]: ev.target.value }))}
                      />
                      <span className="text-slate-500">%</span>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={isEditing ? "btn-primary text-xs" : "btn-ghost text-xs"}
                      onClick={() => saveRow(r.id)}
                      disabled={!isEditing}
                    >
                      {isEditing ? "Guardar" : "—"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && !loading && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-500">
                Sin puertos. Ejecuta <code>npm run seed:port-taxes</code> para cargar la lista inicial.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Formulario para añadir puerto nuevo */}
      <div className="card space-y-3">
        <h2 className="text-lg font-medium">Añadir puerto nuevo</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Nombre</span>
            <input className="input" placeholder="Ej. Avilés" value={newPort.name} onChange={ev => setNewPort(p => ({ ...p, name: ev.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Provincia</span>
            <input className="input" placeholder="Ej. Asturias" value={newPort.province} onChange={ev => setNewPort(p => ({ ...p, province: ev.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Tipo %</span>
            <input className="input text-right tabular-nums" placeholder="3,00" value={newPort.rate} onChange={ev => setNewPort(p => ({ ...p, rate: ev.target.value }))} />
          </label>
          <button type="button" className="btn-primary justify-center" onClick={addNewPort}>+ Crear puerto</button>
        </div>
      </div>
    </div>
  );
}
