"use client";
import { useEffect, useState } from "react";

export default function FormatsPage() {
  const [ports, setPorts] = useState<any[]>([]);
  const [formats, setFormats] = useState<any[]>([]);
  const [form, setForm] = useState({ code: "", name: "", portId: "", parserKey: "generic", description: "", active: true, config: "{}" });
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() { setFormats((await (await fetch("/api/formats")).json()).data); }
  useEffect(() => { fetch("/api/ports").then(r => r.json()).then(j => setPorts(j.data)); refresh(); }, []);

  async function save() {
    setMsg(null);
    let config: any = {}; try { config = JSON.parse(form.config || "{}"); } catch { setMsg("JSON inválido en config"); return; }
    const payload = { ...form, portId: form.portId || null, config };
    const r = await fetch("/api/formats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) { setMsg(j?.error ?? "Error"); return; }
    setForm({ code: "", name: "", portId: "", parserKey: "generic", description: "", active: true, config: "{}" });
    refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Formatos documentales</h1>

      <div className="card">
        <h2 className="font-semibold mb-3">Nuevo / actualizar formato</h2>
        <p className="text-xs text-slate-500 mb-3">
          <b>parserKey</b> debe coincidir con un parser registrado en código: <code>generic</code> o <code>hondarribia-sanmartin</code>.
          Para dar de alta un puerto nuevo necesitas: 1) añadir el parser en <code>src/lib/parsers/</code> y registrarlo, 2) crear aquí el formato con sus <b>signatures</b> (en <code>config</code>).
        </p>
        <div className="grid grid-cols-4 gap-3">
          <label className="block"><span className="label">Código</span>
            <input className="input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="HOND_SANMARTIN" /></label>
          <label className="block col-span-2"><span className="label">Nombre</span>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block"><span className="label">Parser key</span>
            <input className="input" value={form.parserKey} onChange={e => setForm({ ...form, parserKey: e.target.value })} /></label>
          <label className="block"><span className="label">Puerto</span>
            <select className="input" value={form.portId} onChange={e => setForm({ ...form, portId: e.target.value })}>
              <option value="">—</option>{ports.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block col-span-3"><span className="label">Descripción</span>
            <input className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
          <label className="block col-span-4"><span className="label">Config JSON (signatures, defaultVatRate...)</span>
            <textarea className="input min-h-[90px] font-mono text-xs" value={form.config} onChange={e => setForm({ ...form, config: e.target.value })} /></label>
        </div>
        <div className="mt-3"><button className="btn-primary" onClick={save}>Guardar</button></div>
        {msg && <div className="text-sm text-rose-600 mt-2">{msg}</div>}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="table">
          <thead><tr><th>Código</th><th>Nombre</th><th>Puerto</th><th>Parser</th><th>Activo</th></tr></thead>
          <tbody>
            {formats.map(f => (
              <tr key={f.id}>
                <td className="font-mono">{f.code}</td><td>{f.name}</td><td>{f.port?.name ?? "—"}</td>
                <td>{f.parserKey}</td><td>{f.active ? "Sí" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
