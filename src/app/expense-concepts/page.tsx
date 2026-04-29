"use client";
import { useEffect, useMemo, useState } from "react";

type MatchField = "SUPPLIER" | "DESCRIPTION" | "ANY";
type Row = {
  id: string;
  matchText: string;
  matchField: MatchField;
  concept: string;
  category: string;
  priority: number;
  notes: string | null;
};

// Mismas categorías que en el resto de la app (ver schema.prisma → ExpenseCategory).
const CATEGORIES = [
  "COFRADIA", "COMBUSTIBLE", "HIELO", "VIVERES", "TELEFONIA", "TRANSPORTE",
  "MANTENIMIENTO", "HIELO_PRODUCIDO", "CAJAS", "PALETS", "APAREJOS",
  "PAN", "AGUA", "CARNE", "MOVISTAR", "OTRO"
];

const MATCH_FIELDS: { value: MatchField; label: string; help: string }[] = [
  { value: "SUPPLIER", label: "Proveedor", help: "Busca el texto en el nombre del proveedor de la factura" },
  { value: "DESCRIPTION", label: "Descripción", help: "Busca el texto en la descripción de la línea" },
  { value: "ANY", label: "Cualquiera", help: "Busca en proveedor o descripción (lo que coincida primero)" }
];

// Ejemplos predefinidos para el botón "Cargar ejemplos".
const EXAMPLES: Omit<Row, "id">[] = [
  { matchText: "URANZU", matchField: "SUPPLIER", concept: "Uranzu", category: "VIVERES", priority: 100, notes: "Víveres y suministros generales" },
  { matchText: "SUMIPESCA", matchField: "SUPPLIER", concept: "Agua", category: "AGUA", priority: 100, notes: "Agua y bebidas" },
  { matchText: "MOVISTAR", matchField: "SUPPLIER", concept: "Movistar", category: "MOVISTAR", priority: 100, notes: "Telefonía móvil" },
  { matchText: "PAN", matchField: "DESCRIPTION", concept: "Pan", category: "PAN", priority: 80, notes: null },
  { matchText: "AUTOBUS", matchField: "DESCRIPTION", concept: "Autobús", category: "TRANSPORTE", priority: 80, notes: null },
  { matchText: "GASOIL", matchField: "DESCRIPTION", concept: "Gasoil", category: "COMBUSTIBLE", priority: 80, notes: null },
  { matchText: "CAJAS", matchField: "DESCRIPTION", concept: "Cajas plástico", category: "CAJAS", priority: 60, notes: null },
  { matchText: "PALETS", matchField: "DESCRIPTION", concept: "Palets", category: "PALETS", priority: 60, notes: null }
];

export default function ExpenseConceptsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Partial<Row>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newRow, setNewRow] = useState({
    matchText: "", matchField: "SUPPLIER" as MatchField,
    concept: "", category: "OTRO", priority: "100", notes: ""
  });

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/expense-concepts");
      const j = await r.json();
      setRows(Array.isArray(j.data) ? j.data : []);
      setDrafts({});
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  function patchDraft(id: string, patch: Partial<Row>) {
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  }
  function discardDraft(id: string) {
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
  }
  async function saveRow(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      const r = await fetch(`/api/expense-concepts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      const j = await r.json();
      if (!r.ok) { setMsg(j?.error ?? "Error guardando"); return; }
      setMsg("Regla actualizada.");
      await refresh();
    } finally {
      setSavingId(null);
    }
  }
  async function deleteRow(id: string, matchText: string) {
    if (!confirm(`¿Borrar la regla "${matchText}"?`)) return;
    const r = await fetch(`/api/expense-concepts/${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json(); setMsg(j?.error ?? "Error borrando"); return; }
    setMsg("Regla borrada.");
    refresh();
  }

  async function addRow() {
    if (!newRow.matchText.trim()) { setMsg("Texto a buscar requerido."); return; }
    if (!newRow.concept.trim()) { setMsg("Concepto requerido."); return; }
    const r = await fetch("/api/expense-concepts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newRow,
        priority: parseInt(newRow.priority) || 100
      })
    });
    const j = await r.json();
    if (!r.ok) { setMsg(j?.error ?? "Error creando regla"); return; }
    setMsg(`Regla "${newRow.matchText}" creada.`);
    setNewRow({ matchText: "", matchField: "SUPPLIER", concept: "", category: "OTRO", priority: "100", notes: "" });
    refresh();
  }

  async function loadExamples() {
    if (!confirm(`Se crearán ${EXAMPLES.length} reglas de ejemplo. Las que ya existan se ignorarán. ¿Continuar?`)) return;
    let added = 0, skipped = 0;
    for (const ex of EXAMPLES) {
      const r = await fetch("/api/expense-concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ex)
      });
      if (r.ok) added++;
      else if (r.status === 409) skipped++;
    }
    setMsg(`Reglas de ejemplo: ${added} añadidas, ${skipped} ya existían.`);
    refresh();
  }

  const [reapplying, setReapplying] = useState(false);
  async function reapplyToExisting() {
    if (!confirm("Reaplicar las reglas a TODOS los gastos ya importados?\n\nSe sobrescribirán categoría, concepto y descripción de las líneas en los gastos donde casa una regla. La descripción original se conserva en notas.")) return;
    setReapplying(true);
    try {
      const r = await fetch("/api/expense-concepts/reapply", { method: "POST" });
      const j = await r.json();
      if (!r.ok) { setMsg(j?.error ?? "Error reaplicando"); return; }
      setMsg(`✅ ${j.data.touchedExpenses} gastos y ${j.data.touchedLines} líneas actualizadas (de ${j.data.scanned} gastos).`);
    } finally {
      setReapplying(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.matchText.toLowerCase().includes(q) ||
      r.concept.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      (r.notes ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Conceptos de gasto</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-4xl">
          Reglas que dicen "<b>cuando aparezca este texto en una factura, asígnale este concepto y esta categoría</b>".
          Por ejemplo: si el proveedor contiene <b>URANZU</b> → concepto <b>Uranzu</b>, categoría <b>VIVERES</b>;
          si contiene <b>SUMIPESCA</b> → concepto <b>Agua</b>, categoría <b>AGUA</b>;
          si la descripción contiene <b>MOVISTAR</b> → concepto <b>Movistar</b>, categoría <b>MOVISTAR</b>.
          La búsqueda no distingue mayúsculas/minúsculas. Si varias reglas coinciden, gana la de mayor <b>prioridad</b>.
        </p>
      </div>

      {msg && (
        <div className="card text-sm bg-emerald-50 border-emerald-200 flex items-center justify-between">
          <span>{msg}</span>
          <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {/* Crear regla nueva */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Añadir nueva regla</h2>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 text-sm items-end">
          <Field label="Buscar en">
            <select className="input" value={newRow.matchField}
                    onChange={e => setNewRow({ ...newRow, matchField: e.target.value as MatchField })}>
              {MATCH_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Texto a buscar">
            <input className="input" placeholder="ej. URANZU"
                   value={newRow.matchText}
                   onChange={e => setNewRow({ ...newRow, matchText: e.target.value })} />
          </Field>
          <Field label="Concepto resultante">
            <input className="input" placeholder="ej. Uranzu"
                   value={newRow.concept}
                   onChange={e => setNewRow({ ...newRow, concept: e.target.value })} />
          </Field>
          <Field label="Categoría">
            <select className="input" value={newRow.category}
                    onChange={e => setNewRow({ ...newRow, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Prioridad">
            <input className="input" type="number" value={newRow.priority}
                   onChange={e => setNewRow({ ...newRow, priority: e.target.value })} />
          </Field>
          <button className="btn-primary" onClick={addRow}>+ Añadir</button>
        </div>
        <Field label="Notas (opcional)">
          <input className="input" placeholder="ej. Víveres y suministros generales"
                 value={newRow.notes}
                 onChange={e => setNewRow({ ...newRow, notes: e.target.value })} />
        </Field>
      </div>

      {/* Filtro + ejemplos */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="🔍 Buscar regla..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="text-sm text-slate-600">{filtered.length} regla{filtered.length === 1 ? "" : "s"}</span>
        {rows.length === 0 && (
          <button className="btn-ghost text-sm" onClick={loadExamples}>📚 Cargar reglas de ejemplo</button>
        )}
        {rows.length > 0 && (
          <button
            className="btn-ghost text-sm ml-auto"
            onClick={reapplyToExisting}
            disabled={reapplying}
            title="Aplica las reglas a los gastos ya importados (sin reimportar PDFs)"
          >
            {reapplying ? "Reaplicando…" : "🔁 Reaplicar reglas a gastos existentes"}
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Buscar en</th>
              <th>Texto a buscar</th>
              <th>→ Concepto</th>
              <th>Categoría</th>
              <th className="text-right">Prioridad</th>
              <th>Notas</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={7} className="text-center py-6 text-slate-500">Cargando…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-6 text-slate-500">
                  {rows.length === 0
                    ? "No hay reglas todavía. Crea una con el formulario de arriba o pulsa 'Cargar reglas de ejemplo'."
                    : "Ninguna regla coincide con la búsqueda."}
                </td>
              </tr>
            )}
            {filtered.map(r => {
              const d = drafts[r.id] ?? {};
              const dirty = Object.keys(d).length > 0;
              const v = (k: keyof Row) => d[k] !== undefined ? d[k] : (r as any)[k];
              return (
                <tr key={r.id} className={dirty ? "bg-amber-50" : ""}>
                  <td>
                    <select className="input"
                            value={v("matchField") as string}
                            onChange={e => patchDraft(r.id, { matchField: e.target.value as MatchField })}>
                      {MATCH_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <input className="input"
                           value={v("matchText") as string}
                           onChange={e => patchDraft(r.id, { matchText: e.target.value })} />
                  </td>
                  <td>
                    <input className="input"
                           value={v("concept") as string}
                           onChange={e => patchDraft(r.id, { concept: e.target.value })} />
                  </td>
                  <td>
                    <select className="input"
                            value={v("category") as string}
                            onChange={e => patchDraft(r.id, { category: e.target.value })}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="text-right">
                    <input className="input text-right w-20"
                           type="number"
                           value={v("priority") as number}
                           onChange={e => patchDraft(r.id, { priority: parseInt(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <input className="input"
                           value={(v("notes") as string) ?? ""}
                           onChange={e => patchDraft(r.id, { notes: e.target.value })} />
                  </td>
                  <td className="text-right space-x-1 whitespace-nowrap">
                    {dirty && (
                      <>
                        <button className="btn-primary text-xs" onClick={() => saveRow(r.id)} disabled={savingId === r.id}>
                          {savingId === r.id ? "Guardando…" : "Guardar"}
                        </button>
                        <button className="btn-ghost text-xs" onClick={() => discardDraft(r.id)}>Cancelar</button>
                      </>
                    )}
                    <button className="text-xs text-rose-600 hover:underline" onClick={() => deleteRow(r.id, r.matchText)}>
                      🗑 Borrar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="block text-xs">
      <span className="block text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
