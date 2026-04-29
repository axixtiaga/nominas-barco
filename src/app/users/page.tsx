"use client";
import { useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER" | "MARINERO";
  active: boolean;
  createdAt: string;
  sailor: { id: string; name: string } | null;
};

const ROLE_LABELS: Record<string, { label: string; help: string; color: string }> = {
  ADMIN:    { label: "Administrador", help: "Acceso total. Puede crear usuarios, validar mantas, hacer backups.",        color: "bg-rose-100 text-rose-800" },
  OPERATOR: { label: "Operador",      help: "Puede editar datos (gastos, mantas, marineros) pero no gestionar usuarios.", color: "bg-blue-100 text-blue-800" },
  VIEWER:   { label: "Solo lectura",  help: "Solo puede ver datos. Ideal para armadores que quieren consultar pero no modificar.", color: "bg-emerald-100 text-emerald-800" },
  MARINERO: { label: "Marinero",      help: "Acceso restringido a sus propias nóminas (gestionado desde Marineros).",     color: "bg-slate-100 text-slate-800" }
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Formulario nuevo usuario
  const [form, setForm] = useState({ email: "", name: "", role: "VIEWER", password: "" });
  const [creating, setCreating] = useState(false);

  // Borradores de edición por fila: { [userId]: { name?, email? } }
  const [drafts, setDrafts] = useState<Record<string, { name?: string; email?: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/users");
      const j = await r.json();
      if (!r.ok) {
        setError(j?.error ?? "No tienes permisos para ver esta sección.");
        return;
      }
      setUsers(j?.data ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!form.email || !form.name || !form.password) {
      setMsg({ kind: "err", text: "Rellena email, nombre y contraseña." });
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const j = await r.json();
      if (!r.ok) { setMsg({ kind: "err", text: j?.error ?? "Error" }); return; }
      setMsg({ kind: "ok", text: `✅ Usuario "${form.name}" creado. Email: ${form.email} · Contraseña: ${form.password}` });
      setForm({ email: "", name: "", role: "VIEWER", password: "" });
      refresh();
    } finally {
      setCreating(false);
    }
  }

  function patchDraft(id: string, patch: { name?: string; email?: string }) {
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  }
  function discardDraft(id: string) {
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
  }
  function isDirty(id: string) {
    const d = drafts[id];
    if (!d) return false;
    return Object.keys(d).length > 0;
  }
  async function saveRowEdits(u: User) {
    const d = drafts[u.id];
    if (!d) return;
    setSavingId(u.id);
    try {
      const body: any = {};
      if (d.name !== undefined && d.name.trim() !== u.name) body.name = d.name.trim();
      if (d.email !== undefined && d.email.trim().toLowerCase() !== u.email) body.email = d.email.trim().toLowerCase();
      if (Object.keys(body).length === 0) { discardDraft(u.id); return; }
      const r = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!r.ok) { setMsg({ kind: "err", text: j?.error ?? "Error" }); return; }
      setMsg({ kind: "ok", text: `Datos de "${u.name}" actualizados.` });
      discardDraft(u.id);
      refresh();
    } finally {
      setSavingId(null);
    }
  }

  async function changeRole(u: User, newRole: string) {
    if (!confirm(`¿Cambiar el rol de "${u.name}" a ${ROLE_LABELS[newRole].label}?`)) return;
    const r = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole })
    });
    const j = await r.json();
    if (!r.ok) { setMsg({ kind: "err", text: j?.error ?? "Error" }); return; }
    setMsg({ kind: "ok", text: `Rol actualizado.` });
    refresh();
  }
  async function toggleActive(u: User) {
    const next = !u.active;
    const r = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next })
    });
    const j = await r.json();
    if (!r.ok) { setMsg({ kind: "err", text: j?.error ?? "Error" }); return; }
    setMsg({ kind: "ok", text: next ? "Usuario activado." : "Usuario desactivado." });
    refresh();
  }
  async function resetPassword(u: User) {
    const np = prompt(`Nueva contraseña para "${u.name}":`);
    if (!np) return;
    if (np.length < 6) { alert("Mínimo 6 caracteres"); return; }
    const r = await fetch(`/api/users/${u.id}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: np })
    });
    const j = await r.json();
    if (!r.ok) { setMsg({ kind: "err", text: j?.error ?? "Error" }); return; }
    setMsg({ kind: "ok", text: `Contraseña actualizada para "${u.name}". Nueva contraseña: ${np}` });
  }
  async function deleteUser(u: User) {
    if (!confirm(`¿Borrar usuario "${u.name}" (${u.email})? Esta acción no se puede deshacer.`)) return;
    const r = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) { setMsg({ kind: "err", text: j?.error ?? "Error" }); return; }
    setMsg({ kind: "ok", text: "Usuario borrado." });
    refresh();
  }

  function suggestPassword() {
    const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
    let p = "";
    for (let i = 0; i < 8; i++) p += alphabet[Math.floor(Math.random() * alphabet.length)];
    setForm({ ...form, password: p });
  }

  if (error) {
    return (
      <div className="card text-rose-700 bg-rose-50 border-rose-200">
        <div className="font-semibold">Acceso restringido</div>
        <div className="text-sm mt-1">{error}</div>
      </div>
    );
  }

  // Separar marineros (no editables aquí) del resto
  const regular = users.filter(u => u.role !== "MARINERO");
  const marineros = users.filter(u => u.role === "MARINERO");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usuarios de la aplicación</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Gestión de usuarios con acceso a la app. Los marineros con cuenta propia (acceso restringido a sus nóminas)
          se administran desde <a className="text-blue-600 underline" href="/sailors">Maestros → Marineros</a>.
        </p>
      </div>

      {msg && (
        <div className={`card text-sm flex items-center justify-between ${msg.kind === "ok" ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
          <span>{msg.text}</span>
          <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {/* Formulario nuevo usuario */}
      <form className="card space-y-3" onSubmit={createUser}>
        <h2 className="font-semibold">Crear nuevo usuario</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <Field label="Nombre completo">
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ej. Bernardo Sistiaga" />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="ej. armador2@itsaslagunak.local" />
          </Field>
          <Field label="Rol">
            <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="VIEWER">Solo lectura (armadores)</option>
              <option value="OPERATOR">Operador</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </Field>
          <Field label="Contraseña">
            <div className="flex gap-1">
              <input className="input flex-1" type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="mín. 6 caracteres" />
              <button type="button" className="btn-ghost text-xs" onClick={suggestPassword} title="Generar contraseña aleatoria">🎲</button>
            </div>
          </Field>
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? "Creando..." : "+ Crear"}
          </button>
        </div>
        <div className="text-[11px] text-slate-500 italic">
          💡 Para los <b>otros 3 armadores</b>, elige el rol <b>"Solo lectura"</b>: podrán ver todo (capturas, mantas, nóminas, gastos, reportes, SS) pero no podrán modificar nada.
        </div>
      </form>

      {/* Tabla usuarios regulares */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold">Usuarios con acceso completo / restringido</h2>
        </div>
        {loading && <div className="p-6 text-sm text-slate-500 text-center">Cargando…</div>}
        {!loading && regular.length === 0 && (
          <div className="p-6 text-sm text-slate-500 italic text-center">No hay usuarios todavía.</div>
        )}
        {regular.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th className="text-center">Activo</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {regular.map(u => {
                const d = drafts[u.id] ?? {};
                const dirty = isDirty(u.id);
                const nameVal = d.name !== undefined ? d.name : u.name;
                const emailVal = d.email !== undefined ? d.email : u.email;
                return (
                <tr key={u.id} className={!u.active ? "opacity-50 bg-slate-50" : dirty ? "bg-amber-50" : ""}>
                  <td>
                    <input
                      className="input text-sm font-medium"
                      value={nameVal}
                      onChange={e => patchDraft(u.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs"
                      type="email"
                      value={emailVal}
                      onChange={e => patchDraft(u.id, { email: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className={`text-xs rounded px-2 py-1 border-0 ${ROLE_LABELS[u.role].color}`}
                      value={u.role}
                      onChange={e => changeRole(u, e.target.value)}
                      title={ROLE_LABELS[u.role].help}
                    >
                      <option value="ADMIN">Administrador</option>
                      <option value="OPERATOR">Operador</option>
                      <option value="VIEWER">Solo lectura</option>
                    </select>
                  </td>
                  <td className="text-center">
                    <input type="checkbox" checked={u.active} onChange={() => toggleActive(u)} />
                  </td>
                  <td className="text-right text-xs space-x-2 whitespace-nowrap">
                    {dirty && (
                      <>
                        <button
                          className="btn-primary text-xs py-0.5 px-2"
                          onClick={() => saveRowEdits(u)}
                          disabled={savingId === u.id}
                        >
                          {savingId === u.id ? "Guardando…" : "💾 Guardar"}
                        </button>
                        <button className="text-slate-500 hover:underline" onClick={() => discardDraft(u.id)}>Cancelar</button>
                      </>
                    )}
                    <button className="text-blue-600 hover:underline" onClick={() => resetPassword(u)}>🔑 Contraseña</button>
                    <button className="text-rose-600 hover:underline" onClick={() => deleteUser(u)}>🗑 Borrar</button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Tabla usuarios MARINERO (informativos, gestionados en Marineros) */}
      {marineros.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="font-semibold">Marineros con acceso a la app</h2>
            <p className="text-xs text-slate-500 mt-1">Estos usuarios se gestionan desde <a className="text-blue-600 underline" href="/sailors">Maestros → Marineros</a>.</p>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Marinero</th>
                <th>Email login</th>
                <th className="text-center">Activo</th>
              </tr>
            </thead>
            <tbody>
              {marineros.map(u => (
                <tr key={u.id} className="text-slate-600">
                  <td className="font-medium">{u.name}</td>
                  <td className="text-xs">{u.email}</td>
                  <td className="text-center">{u.active ? "✓" : "✗"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Explicación de roles */}
      <div className="card text-xs text-slate-700 bg-slate-50 space-y-2">
        <div className="font-semibold text-slate-800">ℹ️ ¿Qué puede hacer cada rol?</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <span className={`inline-block px-2 py-0.5 rounded text-xs ${ROLE_LABELS.ADMIN.color}`}>Administrador</span>
            <p className="mt-1">{ROLE_LABELS.ADMIN.help}</p>
          </div>
          <div>
            <span className={`inline-block px-2 py-0.5 rounded text-xs ${ROLE_LABELS.OPERATOR.color}`}>Operador</span>
            <p className="mt-1">{ROLE_LABELS.OPERATOR.help}</p>
          </div>
          <div>
            <span className={`inline-block px-2 py-0.5 rounded text-xs ${ROLE_LABELS.VIEWER.color}`}>Solo lectura</span>
            <p className="mt-1">{ROLE_LABELS.VIEWER.help}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="block text-sm">
      <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
