"use client";
import { useEffect, useMemo, useState } from "react";

type EqRow = {
  id: string;
  rawName: string;
  scope: "GLOBAL" | "PORT";
  portId: string | null;
  speciesId: string;
  notes: string | null;
  port?: any;
  species?: any;
};

export default function EquivalencesPage() {
  const [ports, setPorts] = useState<any[]>([]);
  const [species, setSpecies] = useState<any[]>([]);
  const [eqs, setEqs] = useState<EqRow[]>([]);
  const [filterPort, setFilterPort] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const [form, setForm] = useState({ rawName: "", scope: "GLOBAL", portId: "", speciesId: "", notes: "" });
  const [msg, setMsg] = useState<string | null>(null);

  // Borradores en memoria: por cada fila con cambios pendientes guardamos los
  // valores nuevos hasta que el usuario pulsa Guardar. Al refrescar la lista
  // volvemos a partir del valor de la BD.
  const [drafts, setDrafts] = useState<Record<string, Partial<EqRow> & { speciesInput?: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  /** Estado visible por fila: "saved" (verde unos segundos), "error" (rojo persistente) */
  const [rowStatus, setRowStatus] = useState<Record<string, { kind: "saved" | "error"; msg?: string }>>({});
  function setStatus(id: string, st: { kind: "saved" | "error"; msg?: string } | null) {
    setRowStatus(prev => {
      const n = { ...prev };
      if (st) n[id] = st; else delete n[id];
      return n;
    });
    if (st?.kind === "saved") {
      setTimeout(() => setRowStatus(prev => {
        if (prev[id]?.kind !== "saved") return prev;
        const n = { ...prev }; delete n[id]; return n;
      }), 3000);
    }
  }

  // Sugeridor automático de equivalencias basado en lo que ya hay en InvoiceLine.rawSpeciesName
  type Suggestion = {
    rawName: string;
    rawNameNormalized: string;
    occurrences: number;
    portIds: string[];
    portNames: string[];
    speciesId: string | null;
    speciesCode: string | null;
    speciesCommonName: string | null;
    confidence: "HIGH" | "MEDIUM" | "LOW" | null;
    reason: string | null;
  };
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggSelected, setSuggSelected] = useState<Record<string, boolean>>({});
  // Por cada sugerencia el usuario puede ajustar la especie destino (si la propuesta no le convence)
  // y el alcance (GLOBAL o PORT con un puerto específico).
  const [suggOverrides, setSuggOverrides] = useState<Record<string, { speciesId?: string; scope?: "GLOBAL" | "PORT"; portId?: string }>>({});
  const [acceptingSuggestions, setAcceptingSuggestions] = useState(false);
  const [suggMsg, setSuggMsg] = useState<string | null>(null);

  async function loadSuggestions() {
    setLoadingSuggestions(true);
    setSuggMsg(null);
    try {
      const r = await fetch("/api/equivalences/suggestions");
      const j = await r.json();
      const list: Suggestion[] = j?.data?.suggestions ?? [];
      setSuggestions(list);
      // Pre-selecciona todas las HIGH (las MEDIUM/LOW las marca el usuario).
      const sel: Record<string, boolean> = {};
      for (const s of list) {
        if (s.confidence === "HIGH" && s.speciesId) sel[s.rawNameNormalized] = true;
      }
      setSuggSelected(sel);
      setSuggOverrides({});
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function toggleSuggSelected(key: string, on: boolean) {
    setSuggSelected(prev => ({ ...prev, [key]: on }));
  }
  function setOverride(key: string, patch: { speciesId?: string; scope?: "GLOBAL" | "PORT"; portId?: string }) {
    setSuggOverrides(prev => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...patch } }));
  }
  function selectAllByConfidence(level: "HIGH" | "MEDIUM" | "LOW") {
    if (!suggestions) return;
    setSuggSelected(prev => {
      const next = { ...prev };
      for (const s of suggestions) {
        if (s.confidence === level && s.speciesId) next[s.rawNameNormalized] = true;
      }
      return next;
    });
  }
  function clearAllSuggSelection() { setSuggSelected({}); }

  async function acceptSelectedSuggestions() {
    if (!suggestions) return;
    const items: Array<{ rawName: string; speciesId: string; scope: "GLOBAL" | "PORT"; portId?: string | null }> = [];
    for (const s of suggestions) {
      if (!suggSelected[s.rawNameNormalized]) continue;
      const ov = suggOverrides[s.rawNameNormalized] ?? {};
      const speciesId = ov.speciesId ?? s.speciesId;
      if (!speciesId) continue;
      const scope: "GLOBAL" | "PORT" = ov.scope ?? "GLOBAL";
      const portId = scope === "PORT" ? (ov.portId ?? (s.portIds[0] ?? null)) : null;
      items.push({ rawName: s.rawName, speciesId, scope, portId });
    }
    if (items.length === 0) { setSuggMsg("No hay nada seleccionado para aceptar."); return; }

    setAcceptingSuggestions(true);
    try {
      const r = await fetch("/api/equivalences/suggestions/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      const j = await r.json();
      if (!r.ok) { setSuggMsg(j?.error ?? "Error aceptando sugerencias"); return; }
      const d = j.data;
      setSuggMsg(`✅ ${d.created} creadas, ${d.updated} actualizadas, ${d.linesResolved} líneas resueltas.`);
      await loadSuggestions();
      await refresh();
    } finally {
      setAcceptingSuggestions(false);
    }
  }

  // Formulario inline para crear una especie nueva sin salir de esta página
  const [showNewSpecies, setShowNewSpecies] = useState(false);
  const [newSp, setNewSp] = useState({ code: "", commonName: "", scientificName: "" });
  const [newSpMsg, setNewSpMsg] = useState<string | null>(null);

  async function refresh() {
    const url = filterPort ? `/api/equivalences?portId=${filterPort}` : "/api/equivalences";
    setEqs((await (await fetch(url)).json()).data);
    setDrafts({});
  }
  async function reloadSpecies() {
    const r = await (await fetch("/api/species")).json();
    setSpecies(r.data);
  }
  useEffect(() => {
    Promise.all([fetch("/api/ports"), fetch("/api/species")]).then(rs => Promise.all(rs.map(r => r.json())))
      .then(([p, s]) => { setPorts(p.data); setSpecies(s.data); });
  }, []);
  useEffect(() => { refresh(); }, [filterPort]);

  async function save() {
    setMsg(null);
    if (!form.rawName.trim()) { setMsg("Pon la denominación tal como aparece en el PDF."); return; }
    if (!form.speciesId) { setMsg("Selecciona una especie normalizada (o créala con el botón +)."); return; }
    const payload: any = { ...form };
    if (payload.scope === "GLOBAL") payload.portId = null;
    const r = await fetch("/api/equivalences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) { setMsg(j?.error ?? "Error"); return; }
    setForm({ rawName: "", scope: "GLOBAL", portId: "", speciesId: "", notes: "" });
    refresh();
  }

  async function saveNewSpecies() {
    setNewSpMsg(null);
    if (!newSp.code.trim() || !newSp.commonName.trim()) {
      setNewSpMsg("Código y nombre común son obligatorios.");
      return;
    }
    const r = await fetch("/api/species", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: newSp.code.trim().toUpperCase(),
        commonName: newSp.commonName.trim(),
        scientificName: newSp.scientificName.trim() || null,
        active: true
      })
    });
    const j = await r.json();
    if (!r.ok) { setNewSpMsg(j?.error ?? "Error"); return; }
    await reloadSpecies();
    setForm(f => ({ ...f, speciesId: j.data.id }));
    setNewSp({ code: "", commonName: "", scientificName: "" });
    setShowNewSpecies(false);
  }

  async function remove(id: string) {
    if (!confirm("¿Desactivar equivalencia?")) return;
    await fetch(`/api/equivalences/${id}`, { method: "DELETE" });
    refresh();
  }

  /** Marca la fila con cambios locales pendientes. */
  function setDraft(id: string, patch: Partial<EqRow> & { speciesInput?: string }) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  /** ¿Hay cambios pendientes en la fila id? */
  function isDirty(id: string) { return !!drafts[id] && Object.keys(drafts[id]).length > 0; }

  /** Descarta el borrador y vuelve al valor guardado en BD. */
  function discardDraft(id: string) {
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  /**
   * Persiste los cambios pendientes de una fila. Construimos el objeto
   * actualizado directamente — con la especie/puerto resueltos antes del PATCH —
   * para que la UI refleje el cambio sin depender del estado `species`/`ports`
   * (que se actualizan con retraso por la asincronía de React).
   */
  async function saveRow(eq: EqRow) {
    const draft = drafts[eq.id];
    if (!draft) return;
    setSavingId(eq.id);
    setStatus(eq.id, null);

    try {
      const patch: any = {};
      if ("rawName" in draft) patch.rawName = draft.rawName;
      if ("scope" in draft) patch.scope = draft.scope;
      if ("portId" in draft) patch.portId = draft.portId ?? null;
      if ("notes" in draft) patch.notes = draft.notes ?? null;

      // Si el usuario tecleó una especie, resolvemos (o creamos) server-side
      // y nos quedamos con el objeto completo — así podemos pintar la fila
      // con el nombre nuevo sin esperar al estado `species`.
      let newSpeciesObj: any = null;
      if (draft.speciesInput !== undefined) {
        newSpeciesObj = await findOrCreateSpeciesByName(draft.speciesInput);
        if (!newSpeciesObj) {
          setStatus(eq.id, { kind: "error", msg: "No se pudo resolver la especie." });
          return;
        }
        patch.speciesId = newSpeciesObj.id;
      }

      if (Object.keys(patch).length === 0) { discardDraft(eq.id); return; }

      console.log("[equivalences] PATCH", eq.id, patch);
      const r = await fetch(`/api/equivalences/${eq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        cache: "no-store"
      });
      const j = await r.json();
      console.log("[equivalences] respuesta", r.status, j);

      if (!r.ok) {
        setStatus(eq.id, { kind: "error", msg: j?.error ?? `Error ${r.status}` });
        return;
      }

      // Construimos la fila resultante combinando: la fila original + lo que
      // devolvió el PATCH (id, rawName, scope, portId, speciesId, notes, active)
      // + el objeto species si se resolvió + el objeto port si cambió.
      const updatedEq: EqRow = { ...eq, ...j.data };
      if (newSpeciesObj) updatedEq.species = newSpeciesObj;
      if ("portId" in patch) {
        updatedEq.port = patch.portId
          ? (ports.find(p => p.id === patch.portId) ?? null)
          : null;
      }
      setEqs(prev => prev.map(x => x.id === eq.id ? updatedEq : x));
      discardDraft(eq.id);
      setStatus(eq.id, { kind: "saved" });
    } catch (err: any) {
      console.error("[equivalences] error inesperado", err);
      setStatus(eq.id, { kind: "error", msg: err?.message ?? "Error inesperado" });
    } finally {
      setSavingId(null);
    }
  }

  /**
   * Resuelve un texto libre → especie vía un endpoint del servidor, que
   * atómicamente busca por nombre o código y, si no existe, crea la especie
   * con un código auto-generado libre. Devuelve el objeto completo
   * { id, code, commonName, ... } para que el cliente pueda actualizar la UI
   * sin esperar a que React propague el nuevo estado de `species`.
   */
  async function findOrCreateSpeciesByName(rawText: string): Promise<any | null> {
    const text = rawText.trim();
    if (!text) return null;
    const r = await fetch("/api/species/find-or-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: text })
    });
    const j = await r.json();
    if (!r.ok) {
      alert(j?.error ?? "No se pudo resolver la especie.");
      return null;
    }
    await reloadSpecies();           // refresca el datalist
    return j.data;                   // { id, code, commonName, scientificName, active }
  }

  /** Filtro cliente por búsqueda libre. */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eqs;
    return eqs.filter(e =>
      (e.rawName ?? "").toLowerCase().includes(q) ||
      (e.species?.commonName ?? "").toLowerCase().includes(q) ||
      (e.species?.code ?? "").toLowerCase().includes(q) ||
      (e.port?.name ?? "").toLowerCase().includes(q) ||
      (e.notes ?? "").toLowerCase().includes(q)
    );
  }, [eqs, search]);

  async function resolveMissing() {
    if (!confirm("Aplicar las equivalencias actuales a todas las líneas con especie vacía. ¿Continuar?")) return;
    const r = await fetch("/api/species/resolve-missing", { method: "POST" });
    const j = await r.json();
    if (!r.ok) { alert(j?.error ?? "Error"); return; }
    alert(`Líneas examinadas: ${j.data.scanned}. Resueltas: ${j.data.resolved}.`);
  }

  // Aviso al salir de la página con cambios sin guardar
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (Object.keys(drafts).length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [drafts]);

  return (
    <div className="space-y-6">
      <datalist id="species-list">
        {species.map(s => (
          <option key={s.id} value={`${s.commonName} (${s.code})`} />
        ))}
      </datalist>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Maestro de equivalencias de especies</h1>
        <button className="btn-ghost" onClick={resolveMissing} title="Aplica el maestro actual a las líneas que aún no tienen especie asignada">
          Re-resolver líneas existentes
        </button>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Nueva equivalencia</h2>
        <div className="grid grid-cols-5 gap-3">
          <label className="block col-span-2"><span className="label">Denominación original (PDF)</span>
            <input className="input" value={form.rawName} onChange={e => setForm({ ...form, rawName: e.target.value })} placeholder="ej. VERDEL MAC, ANTXOA 44, BOCARTE" /></label>
          <label className="block"><span className="label">Alcance</span>
            <select className="input" value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}>
              <option value="GLOBAL">Global</option><option value="PORT">Puerto</option>
            </select>
          </label>
          <label className="block"><span className="label">Puerto</span>
            <select className="input" disabled={form.scope === "GLOBAL"} value={form.portId} onChange={e => setForm({ ...form, portId: e.target.value })}>
              <option value="">—</option>{ports.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Especie normalizada</span>
            <div className="flex gap-1">
              <select className="input" value={form.speciesId} onChange={e => setForm({ ...form, speciesId: e.target.value })}>
                <option value="">— Selecciona —</option>
                {species.map(s => <option key={s.id} value={s.id}>{s.commonName} ({s.code})</option>)}
              </select>
              <button
                type="button"
                title="Crear una especie nueva"
                className="btn-ghost px-2"
                onClick={() => setShowNewSpecies(v => !v)}
              >+</button>
            </div>
          </label>
          <label className="block col-span-4"><span className="label">Notas</span>
            <input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="self-end"><button className="btn-primary w-full justify-center" onClick={save}>Guardar</button></div>
        </div>
        {msg && <div className="text-sm text-rose-600 mt-2">{msg}</div>}

        {showNewSpecies && (
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-md">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Crear nueva especie</h3>
              <button className="text-slate-500 text-xs" onClick={() => setShowNewSpecies(false)}>Cancelar</button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <label className="block">
                <span className="label">Código FAO / interno</span>
                <input className="input" value={newSp.code} onChange={e => setNewSp({ ...newSp, code: e.target.value })} placeholder="p. ej. MEG" />
              </label>
              <label className="block col-span-2">
                <span className="label">Nombre común</span>
                <input className="input" value={newSp.commonName} onChange={e => setNewSp({ ...newSp, commonName: e.target.value })} placeholder="p. ej. Gallo" />
              </label>
              <label className="block">
                <span className="label">Nombre científico (opcional)</span>
                <input className="input" value={newSp.scientificName} onChange={e => setNewSp({ ...newSp, scientificName: e.target.value })} placeholder="Lepidorhombus whiffiagonis" />
              </label>
            </div>
            {newSpMsg && <div className="text-sm text-rose-600 mt-2">{newSpMsg}</div>}
            <div className="flex gap-2 mt-3">
              <button className="btn-primary" onClick={saveNewSpecies}>Crear y seleccionar</button>
            </div>
          </div>
        )}
      </div>

      {/* PANEL DE SUGERENCIAS AUTOMÁTICAS */}
      <div className="card border-blue-200 bg-blue-50/40">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">🪄 Sugeridor automático</h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl">
              Mira las facturas ya importadas (<i>InvoiceLine.rawSpeciesName</i>) y propone una equivalencia
              para los nombres que aún no la tienen, basándose en (1) equivalencias que ya hayas creado
              y (2) el maestro de especies. Acepta las que quieras y se crearán de golpe.
            </p>
          </div>
          <button
            className="btn-ghost"
            onClick={loadSuggestions}
            disabled={loadingSuggestions}
          >
            {loadingSuggestions ? "Analizando…" : suggestions ? "🔄 Recalcular" : "🪄 Generar sugerencias"}
          </button>
        </div>

        {suggMsg && (
          <div className="text-sm bg-emerald-50 border border-emerald-200 rounded p-2 mb-3">{suggMsg}</div>
        )}

        {suggestions !== null && suggestions.length === 0 && (
          <div className="text-sm text-slate-600 italic">
            🎉 No hay nombres sin equivalencia: todas tus líneas ya están cubiertas.
          </div>
        )}

        {suggestions !== null && suggestions.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
              <span className="text-slate-600">{suggestions.length} sin equivalencia. Aceptar:</span>
              <button className="btn-ghost text-xs" onClick={() => selectAllByConfidence("HIGH")}>
                ✓ Todas las de alta confianza ({suggestions.filter(s => s.confidence === "HIGH").length})
              </button>
              <button className="btn-ghost text-xs" onClick={() => selectAllByConfidence("MEDIUM")}>
                + Media ({suggestions.filter(s => s.confidence === "MEDIUM").length})
              </button>
              <button className="btn-ghost text-xs" onClick={() => selectAllByConfidence("LOW")}>
                + Baja ({suggestions.filter(s => s.confidence === "LOW").length})
              </button>
              <button className="btn-ghost text-xs" onClick={clearAllSuggSelection}>Deseleccionar todo</button>
              <span className="ml-auto font-medium text-blue-800">
                {Object.values(suggSelected).filter(Boolean).length} seleccionada{Object.values(suggSelected).filter(Boolean).length === 1 ? "" : "s"}
              </span>
              <button
                className="btn-primary"
                onClick={acceptSelectedSuggestions}
                disabled={acceptingSuggestions || Object.values(suggSelected).filter(Boolean).length === 0}
              >
                {acceptingSuggestions ? "Guardando…" : "Aceptar seleccionadas"}
              </button>
            </div>

            <div className="overflow-auto max-h-[480px] border border-slate-200 rounded-md bg-white">
              <table className="table text-sm">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr>
                    <th className="w-8"></th>
                    <th>Texto en factura</th>
                    <th>Puertos</th>
                    <th className="text-right">Apariciones</th>
                    <th>Sugerencia</th>
                    <th>Confianza</th>
                    <th>Alcance</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map(s => {
                    const key = s.rawNameNormalized;
                    const ov = suggOverrides[key] ?? {};
                    const selectedSpeciesId = ov.speciesId ?? s.speciesId ?? "";
                    const scope = ov.scope ?? "GLOBAL";
                    const portId = ov.portId ?? (s.portIds[0] ?? "");
                    const conf = s.confidence;
                    const confColor = conf === "HIGH" ? "bg-emerald-100 text-emerald-800"
                                    : conf === "MEDIUM" ? "bg-amber-100 text-amber-800"
                                    : conf === "LOW" ? "bg-rose-100 text-rose-800"
                                    : "bg-slate-100 text-slate-600";
                    const canAccept = !!selectedSpeciesId;
                    return (
                      <tr key={key} className={suggSelected[key] ? "bg-blue-50" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!!suggSelected[key]}
                            onChange={e => toggleSuggSelected(key, e.target.checked)}
                            disabled={!canAccept}
                            title={canAccept ? "" : "Elige una especie primero"}
                          />
                        </td>
                        <td className="font-mono text-xs">{s.rawName}</td>
                        <td className="text-xs text-slate-600">{s.portNames.join(", ") || "—"}</td>
                        <td className="text-right tabular-nums">{s.occurrences}</td>
                        <td>
                          <select
                            className="input text-xs"
                            value={selectedSpeciesId}
                            onChange={e => setOverride(key, { speciesId: e.target.value })}
                          >
                            <option value="">— Sin sugerencia —</option>
                            {species.map(sp => (
                              <option key={sp.id} value={sp.id}>{sp.commonName} ({sp.code})</option>
                            ))}
                          </select>
                          {s.reason && (
                            <div className="text-[10px] text-slate-500 mt-1 italic">{s.reason}</div>
                          )}
                        </td>
                        <td>
                          {conf
                            ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${confColor}`}>{conf}</span>
                            : <span className="text-xs text-slate-400 italic">sin propuesta</span>}
                        </td>
                        <td>
                          <select
                            className="input text-xs mb-1"
                            value={scope}
                            onChange={e => setOverride(key, { scope: e.target.value as "GLOBAL" | "PORT" })}
                          >
                            <option value="GLOBAL">Global</option>
                            <option value="PORT">Solo puerto</option>
                          </select>
                          {scope === "PORT" && (
                            <select
                              className="input text-xs"
                              value={portId}
                              onChange={e => setOverride(key, { portId: e.target.value })}
                            >
                              {s.portIds.length === 0 && <option value="">— sin puerto —</option>}
                              {s.portIds.map(pid => {
                                const p = ports.find((pp: any) => pp.id === pid);
                                return <option key={pid} value={pid}>{p?.name ?? pid}</option>;
                              })}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-slate-500 mt-2 italic">
              💡 Las de <b>alta confianza</b> coinciden con una equivalencia existente o con el nombre exacto de una especie.
              Las de <b>media</b> son muy parecidas (1-2 caracteres de diferencia o una contiene a la otra).
              Las de <b>baja</b> son aproximaciones — verifica antes de aceptarlas.
            </div>
          </>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-3 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="label mb-0 whitespace-nowrap">Puerto:</span>
            <select className="input max-w-xs" value={filterPort} onChange={e => setFilterPort(e.target.value)}>
              <option value="">Todos</option>{ports.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 flex-1 min-w-[240px]">
            <span className="label mb-0 whitespace-nowrap">Buscar:</span>
            <input
              className="input"
              type="search"
              placeholder="denominación, especie, código, notas..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
          <span className="text-xs text-slate-500">{filtered.length} de {eqs.length}</span>
          {Object.keys(drafts).length > 0 && (
            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded">
              {Object.keys(drafts).length} fila(s) con cambios sin guardar
            </span>
          )}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Denominación original</th>
              <th>Alcance</th>
              <th>Puerto</th>
              <th>Especie normalizada</th>
              <th>Notas</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => {
              const d = drafts[e.id] ?? {};
              const dirty = isDirty(e.id);
              const scope = (d.scope ?? e.scope) as string;
              const portId = "portId" in d ? d.portId : e.portId;
              const rawName = d.rawName ?? e.rawName;
              const notes = "notes" in d ? (d.notes ?? "") : (e.notes ?? "");
              const speciesLabel = d.speciesInput ?? (e.species ? `${e.species.commonName} (${e.species.code})` : "");

              return (
                <tr key={e.id} className={dirty ? "bg-amber-50/60" : ""}>
                  <td>
                    <input
                      className="input font-mono"
                      value={rawName}
                      onChange={ev => setDraft(e.id, { rawName: ev.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      value={scope}
                      onChange={ev => setDraft(e.id, { scope: ev.target.value as any, ...(ev.target.value === "GLOBAL" ? { portId: null } : {}) })}
                    >
                      <option value="GLOBAL">GLOBAL</option>
                      <option value="PORT">PORT</option>
                    </select>
                  </td>
                  <td>
                    <select
                      className="input"
                      disabled={scope === "GLOBAL"}
                      value={portId ?? ""}
                      onChange={ev => setDraft(e.id, { portId: ev.target.value || null })}
                    >
                      <option value="">—</option>
                      {ports.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      list="species-list"
                      value={speciesLabel}
                      placeholder="Escribe o elige una especie"
                      title="Escribe el nombre. Si no existe, se creará al guardar."
                      onChange={ev => setDraft(e.id, { speciesInput: ev.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={notes ?? ""}
                      placeholder="—"
                      onChange={ev => setDraft(e.id, { notes: ev.target.value })}
                    />
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        {dirty && (
                          <>
                            <button
                              className="btn-primary text-xs px-2 py-1"
                              disabled={savingId === e.id}
                              onClick={() => saveRow(e)}
                            >{savingId === e.id ? "Guardando..." : "Guardar"}</button>
                            <button
                              className="btn-ghost text-xs px-2 py-1"
                              onClick={() => discardDraft(e.id)}
                            >Cancelar</button>
                          </>
                        )}
                        {!dirty && (
                          <button className="text-rose-600 text-sm" onClick={() => remove(e.id)}>Desactivar</button>
                        )}
                      </div>
                      {rowStatus[e.id] && (
                        <span
                          className={rowStatus[e.id].kind === "saved"
                            ? "text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded"
                            : "text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded"
                          }
                          title={rowStatus[e.id].msg ?? ""}
                        >
                          {rowStatus[e.id].kind === "saved"
                            ? "Guardado ✓"
                            : `Error: ${rowStatus[e.id].msg ?? "desconocido"}`}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr><td colSpan={6} className="text-center py-4 text-slate-500">
                {eqs.length ? "Ningún resultado con esos filtros" : "Sin equivalencias"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
