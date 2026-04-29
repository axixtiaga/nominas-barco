"use client";
import { useEffect, useMemo, useState } from "react";

type Sailor = {
  id: string;
  dni: string | null;
  name: string;
  role: string;
  cotizacionType: string | null;
  parts: number;
  irpfRate: number;
  ssRateLow: number;
  ssRateHigh: number;
  active: boolean;
  joinedAt: string | null;
  leftAt: string | null;
  notes: string | null;
  userId: string | null;        // si tiene cuenta de acceso al sistema
  userEmail: string | null;     // email de la cuenta asociada (si existe)
  contactEmail: string | null;  // email REAL del marinero (Gmail, etc.) — para envíos
};

const ROLES = ["PATRON", "MOTORISTA", "CONTRAMAESTRE", "MARINERO", "GRUMETE", "ARMADOR", "OTRO"];
const COTIZACIONES = ["", "TECNICO", "MARINERO"];

export default function SailorsPage() {
  const [rows, setRows] = useState<Sailor[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [edits, setEdits] = useState<Record<string, Partial<Sailor>>>({});
  const [msg, setMsg] = useState<string | null>(null);

  // Formulario para nuevo marinero
  const [newSailor, setNewSailor] = useState({
    name: "", role: "MARINERO", parts: "1.00", irpfRate: "15.00"
  });

  async function refresh() {
    setLoading(true);
    const params = new URLSearchParams();
    if (showAll) params.set("all", "true");
    const r = await fetch(`/api/sailors?${params.toString()}`);
    const j = await r.json();
    setRows(Array.isArray(j.data) ? j.data.map((s: any) => ({ ...s, parts: Number(s.parts), irpfRate: Number(s.irpfRate), ssRateLow: Number(s.ssRateLow), ssRateHigh: Number(s.ssRateHigh) })) : []);
    setEdits({});
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [showAll]);

  function setEdit(id: string, patch: Partial<Sailor>) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function saveOne(id: string) {
    const e = edits[id];
    if (!e) return;
    const r = await fetch(`/api/sailors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(e)
    });
    if (!r.ok) { const j = await r.json(); setMsg(j?.error ?? "Error"); return; }
    refresh();
  }

  async function saveAll() {
    const ids = Object.keys(edits);
    if (!ids.length) return;
    let ok = 0;
    for (const id of ids) {
      const e = edits[id];
      const r = await fetch(`/api/sailors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e)
      });
      if (r.ok) ok++;
    }
    setMsg(`Guardados ${ok} marinero${ok === 1 ? "" : "s"}.`);
    refresh();
  }

  async function deactivate(id: string, name: string) {
    if (!confirm(`¿Marcar a ${name} como inactivo? Quedará en histórico pero no aparecerá en nuevas nóminas.`)) return;
    const r = await fetch(`/api/sailors/${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json(); setMsg(j?.error ?? "Error"); return; }
    refresh();
  }

  async function createNew() {
    if (!newSailor.name.trim()) { setMsg("Falta el nombre del marinero"); return; }
    const r = await fetch(`/api/sailors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newSailor.name.trim(),
        role: newSailor.role,
        parts: parseFloat(newSailor.parts.replace(",", ".")) || 1,
        irpfRate: parseFloat(newSailor.irpfRate.replace(",", ".")) || 15
      })
    });
    if (!r.ok) { const j = await r.json(); setMsg(j?.error ?? "Error"); return; }
    setMsg(`Marinero "${newSailor.name}" creado.`);
    setNewSailor({ name: "", role: "MARINERO", parts: "1.00", irpfRate: "15.00" });
    refresh();
  }

  const totalParts = useMemo(() => {
    return rows.filter(r => r.active).reduce((a, r) => {
      const e = edits[r.id];
      const p = e?.parts !== undefined ? Number(e.parts) : Number(r.parts);
      return a + (Number.isFinite(p) ? p : 0);
    }, 0);
  }, [rows, edits]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Marineros y armadores</h1>
          <p className="text-sm text-slate-600 mt-1">
            Configura quién recibe parte de la <b>manta</b>, sus <b>partes</b> (proporción del reparto) y
            su <b>% IRPF</b>. Los marineros marcados como inactivos quedan en el histórico pero no entran
            en nuevas nóminas.
          </p>
        </div>
        {Object.keys(edits).length > 0 && (
          <button className="btn-primary" onClick={saveAll}>
            Guardar {Object.keys(edits).length} cambio{Object.keys(edits).length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {msg && <div className="card bg-emerald-50 border-emerald-200 text-sm text-emerald-800">{msg}</div>}

      <div className="card flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          <span>Mostrar también inactivos</span>
        </label>
        <div className="text-slate-600">
          <b>{rows.filter(r => r.active).length}</b> activos · Total partes activas: <b>{totalParts.toFixed(2).replace(".", ",")}</b>
        </div>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>DNI</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Cotización</th>
              <th className="text-right">Partes</th>
              <th className="text-right">% IRPF</th>
              <th>Email contacto</th>
              <th className="text-center">Activo</th>
              <th>Cuenta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
              const e = edits[s.id] ?? {};
              const dirty = Object.keys(e).length > 0;
              const value = (k: keyof Sailor) => (e as any)[k] !== undefined ? (e as any)[k] : (s as any)[k];
              return (
                <tr key={s.id} className={!s.active ? "opacity-50 bg-slate-50" : ""}>
                  <td>
                    <input className="input text-xs font-mono w-28" placeholder="—" value={value("dni") ?? ""}
                      onChange={ev => setEdit(s.id, { dni: ev.target.value || null })} />
                  </td>
                  <td>
                    <input className="input text-sm" value={value("name") ?? ""}
                      onChange={ev => setEdit(s.id, { name: ev.target.value })} />
                  </td>
                  <td>
                    <select className="input text-sm" value={value("role")}
                      onChange={ev => setEdit(s.id, { role: ev.target.value })}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="input text-sm" value={value("cotizacionType") ?? ""}
                      onChange={ev => setEdit(s.id, { cotizacionType: ev.target.value || null })}>
                      {COTIZACIONES.map(c => <option key={c} value={c}>{c || "—"}</option>)}
                    </select>
                  </td>
                  <td>
                    <input className="input text-sm text-right tabular-nums w-20" value={value("parts")}
                      onChange={ev => setEdit(s.id, { parts: Number(ev.target.value.replace(",", ".")) || 0 })} />
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <input className="input text-sm text-right tabular-nums w-20" value={value("irpfRate")}
                        onChange={ev => setEdit(s.id, { irpfRate: Number(ev.target.value.replace(",", ".")) || 0 })} />
                      <span className="text-slate-500">%</span>
                    </div>
                  </td>
                  <td>
                    <input className="input text-xs w-48" type="email" placeholder="ej. nombre@gmail.com"
                      value={value("contactEmail") ?? ""}
                      onChange={ev => setEdit(s.id, { contactEmail: ev.target.value || null })} />
                  </td>
                  <td className="text-center">
                    <input type="checkbox" checked={!!value("active")}
                      onChange={ev => setEdit(s.id, { active: ev.target.checked })} />
                  </td>
                  <td className="text-xs">
                    <UserAccountCell sailor={s} onChanged={refresh} />
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    {dirty && <button className="btn-primary text-xs py-0.5 px-2 mr-1" onClick={() => saveOne(s.id)}>Guardar</button>}
                    {s.active && <button className="text-rose-600 hover:underline" onClick={() => deactivate(s.id, s.name)}>Desactivar</button>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && !loading && (
              <tr><td colSpan={10} className="text-center py-8 text-slate-500">
                Sin marineros. Añade el primero usando el formulario de abajo o ejecuta <code>npm run seed:sailors</code>.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Formulario: nuevo marinero */}
      <div className="card space-y-3">
        <h2 className="text-lg font-medium">Añadir marinero</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <Field label="Nombre">
            <input className="input" value={newSailor.name} onChange={e => setNewSailor(p => ({ ...p, name: e.target.value }))} />
          </Field>
          <Field label="Rol">
            <select className="input" value={newSailor.role} onChange={e => setNewSailor(p => ({ ...p, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Partes">
            <input className="input text-right tabular-nums" value={newSailor.parts} onChange={e => setNewSailor(p => ({ ...p, parts: e.target.value }))} />
          </Field>
          <Field label="% IRPF">
            <input className="input text-right tabular-nums" value={newSailor.irpfRate} onChange={e => setNewSailor(p => ({ ...p, irpfRate: e.target.value }))} />
          </Field>
          <button className="btn-primary justify-center" onClick={createNew}>+ Crear marinero</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

/**
 * Celda con el estado de la cuenta de usuario del marinero y los botones para
 * crearla / resetearla / borrarla. Solo el ADMIN debería ver utilidad real aquí
 * (la API rechaza otros roles), pero no escondemos los botones para mantener la
 * UI simple.
 */
function UserAccountCell({ sailor, onChanged }: { sailor: Sailor; onChanged: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createAccount() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/sailors/${sailor.id}/user-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      const j = await r.json();
      if (!r.ok) { setErr(j?.error ?? "Error"); return; }
      alert(`Cuenta creada para ${sailor.name}.\nEmail: ${email}\nContraseña: ${password}\n\nApúntala y entrégasela al marinero.`);
      setShowForm(false); setEmail(""); setPassword("");
      onChanged();
    } finally { setBusy(false); }
  }
  async function resetPassword() {
    const np = prompt(`Nueva contraseña para ${sailor.name}:`);
    if (!np || np.length < 6) { if (np) alert("Mínimo 6 caracteres."); return; }
    const r = await fetch(`/api/sailors/${sailor.id}/user-account`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: np })
    });
    const j = await r.json();
    if (!r.ok) { alert(j?.error ?? "Error"); return; }
    alert(`Contraseña actualizada para ${sailor.name}.\nNueva contraseña: ${np}`);
  }
  async function deleteAccount() {
    if (!confirm(`¿Borrar la cuenta de acceso de ${sailor.name}?\n(El marinero seguirá existiendo, pero no podrá acceder a la app.)`)) return;
    const r = await fetch(`/api/sailors/${sailor.id}/user-account`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) { alert(j?.error ?? "Error"); return; }
    onChanged();
  }

  if (sailor.userId) {
    const email = sailor.userEmail ?? "";
    return (
      <div className="space-y-1 whitespace-nowrap">
        <div className="text-emerald-700 font-medium">✓ Tiene cuenta</div>
        {email && (
          <div className="text-xs">
            <a
              href={`mailto:${encodeURIComponent(email)}`}
              className="text-blue-600 hover:underline"
              title={`Escribir a ${email}`}
            >
              📧 {email}
            </a>
          </div>
        )}
        <div className="flex gap-2">
          <button className="text-xs text-blue-600 hover:underline" onClick={resetPassword}>🔑 Resetear</button>
          <button className="text-xs text-rose-600 hover:underline" onClick={deleteAccount}>🗑 Borrar</button>
        </div>
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="whitespace-nowrap">
        <span className="text-slate-400 mr-2">Sin cuenta</span>
        <button className="text-xs text-blue-600 hover:underline"
                onClick={() => { setShowForm(true); setEmail(suggestedEmail(sailor.name)); setPassword(suggestedPassword()); }}>
          + Crear
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1 min-w-[200px]">
      <input className="input text-xs" type="email" placeholder="email"
             value={email} onChange={e => setEmail(e.target.value)} />
      <input className="input text-xs" type="text" placeholder="contraseña (min 6)"
             value={password} onChange={e => setPassword(e.target.value)} />
      {err && <div className="text-xs text-rose-600">{err}</div>}
      <div className="flex gap-1">
        <button className="btn-primary text-xs py-0.5 px-2" onClick={createAccount} disabled={busy}>
          {busy ? "..." : "Crear"}
        </button>
        <button className="btn-ghost text-xs" onClick={() => { setShowForm(false); setErr(null); }}>Cancelar</button>
      </div>
    </div>
  );
}

/** Sugerencia de email a partir del nombre: "Asier Sistiaga" → "asier.sistiaga@itsaslagunak.local" */
function suggestedEmail(name: string): string {
  const slug = name.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim().replace(/\s+/g, ".");
  return `${slug}@itsaslagunak.local`;
}
/** Genera una contraseña inicial corta y memorable (8 caracteres alfanuméricos). */
function suggestedPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let p = "";
  for (let i = 0; i < 8; i++) p += alphabet[Math.floor(Math.random() * alphabet.length)];
  return p;
}
