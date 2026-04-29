"use client";
import { useEffect, useMemo, useState } from "react";

type Species = {
  id: string;
  code: string;
  commonName: string;
  scientificName: string | null;
  active: boolean;
};

export default function SpeciesPage() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Partial<Species>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [status, setStatusMap] = useState<Record<string, { kind: "saved" | "error"; msg?: string }>>({});

  async function reload() {
    const r = await fetch("/api/species", { cache: "no-store" });
    setSpecies((await r.json()).data);
    setDrafts({});
  }
  useEffect(() => { reload(); }, []);

  function setDraft(id: string, patch: Partial<Species>) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }
  function discardDraft(id: string) {
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
  }
  function setStatus(id: string, st: { kind: "saved" | "error"; msg?: string } | null) {
    setStatusMap(prev => {
      const n = { ...prev };
      if (st) n[id] = st; else delete n[id];
      return n;
    });
    if (st?.kind === "saved") {
      setTimeout(() => setStatusMap(prev => {
        if (prev[id]?.kind !== "saved") return prev;
        const n = { ...prev }; delete n[id]; return n;
      }), 3000);
    }
  }

  async function saveRow(sp: Species) {
    const draft = drafts[sp.id];
    if (!draft) return;
    setSavingId(sp.id);
    setStatus(sp.id, null);
    try {
      const r = await fetch(`/api/species/${sp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
        cache: "no-store"
      });
      const j = await r.json();
      if (!r.ok) { setStatus(sp.id, { kind: "error", msg: j?.error ?? `Error ${r.status}` }); return; }
      setSpecies(prev => prev.map(x => x.id === sp.id ? ({ ...x, ...j.data }) : x));
      discardDraft(sp.id);
      setStatus(sp.id, { kind: "saved" });
    } finally { setSavingId(null); }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return species.filter(s =>
      !q ||
      (s.commonName ?? "").toLowerCase().includes(q) ||
      (s.code ?? "").toLowerCase().includes(q) ||
      (s.scientificName ?? "").toLowerCase().includes(q)
    );
  }, [species, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Maestro de especies</h1>
        <a href="/equivalences" className="text-sm text-blue-600 hover:underline">Ir a equivalencias →</a>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-3 border-b border-slate-200 flex items-center gap-3">
          <input
            className="input max-w-md"
            type="search"
            placeholder="Buscar especie por nombre, código o científico..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="text-xs text-slate-500">{filtered.length} de {species.length}</span>
          {Object.keys(drafts).length > 0 && (
            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded">
              {Object.keys(drafts).length} fila(s) con cambios sin guardar
            </span>
          )}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre común</th>
              <th>Nombre científico</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(sp => {
              const d = drafts[sp.id] ?? {};
              const dirty = Object.keys(d).length > 0;
              const code = d.code ?? sp.code;
              const name = d.commonName ?? sp.commonName;
              const sci = d.scientificName ?? sp.scientificName ?? "";

              return (
                <tr key={sp.id} className={dirty ? "bg-amber-50/60" : ""}>
                  <td>
                    <input
                      className="input w-24 font-mono uppercase"
                      value={code}
                      onChange={ev => setDraft(sp.id, { code: ev.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={name}
                      onChange={ev => setDraft(sp.id, { commonName: ev.target.value })}
                      placeholder="p. ej. Breca"
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={sci}
                      onChange={ev => setDraft(sp.id, { scientificName: ev.target.value })}
                      placeholder="p. ej. Pagellus erythrinus"
                    />
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        {dirty && (
                          <>
                            <button
                              className="btn-primary text-xs px-2 py-1"
                              disabled={savingId === sp.id}
                              onClick={() => saveRow(sp)}
                            >{savingId === sp.id ? "Guardando..." : "Guardar"}</button>
                            <button className="btn-ghost text-xs px-2 py-1" onClick={() => discardDraft(sp.id)}>Cancelar</button>
                          </>
                        )}
                      </div>
                      {status[sp.id] && (
                        <span
                          className={status[sp.id].kind === "saved"
                            ? "text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded"
                            : "text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded"}
                        >
                          {status[sp.id].kind === "saved"
                            ? "Guardado ✓"
                            : `Error: ${status[sp.id].msg ?? "desconocido"}`}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr><td colSpan={4} className="text-center py-4 text-slate-500">Sin especies</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
