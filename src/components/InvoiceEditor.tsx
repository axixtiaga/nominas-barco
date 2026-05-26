"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Opt = { id: string; name?: string; code?: string; commonName?: string };
type Line = {
  id?: string; lineNo: number; lineDate: string | null;
  rawSpeciesName: string; speciesId: string | null;
  description: string | null; kilos: number; pricePerKg: number; amount: number;
  vatRate: number; vatAmount: number; notes: string | null;
};

export function InvoiceEditor({ invoice, document }: { invoice: any; document: any }) {
  const router = useRouter();
  const [ports, setPorts] = useState<Opt[]>([]);
  const [boats, setBoats] = useState<Opt[]>([]);
  const [suppliers, setSuppliers] = useState<Opt[]>([]);
  const [species, setSpecies] = useState<Opt[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() => ({
    invoiceNumber: invoice?.invoiceNumber ?? "",
    issueDate: invoice?.issueDate ? invoice.issueDate.slice(0, 10) : "",
    portId: invoice?.portId ?? null,
    boatId: invoice?.boatId ?? null,
    supplierId: invoice?.supplierId ?? null,
    currency: invoice?.currency ?? "EUR",
    kind: invoice?.kind ?? "CAPTURA",
    subtotal: Number(invoice?.subtotal ?? 0),
    taxes: Number(invoice?.taxes ?? 0),
    fees: Number(invoice?.fees ?? 0),
    other: Number(invoice?.other ?? 0),
    total: Number(invoice?.total ?? 0),
    notes: invoice?.notes ?? ""
  }));
  const [lines, setLines] = useState<Line[]>(() => (invoice?.lines ?? []).map((l: any) => {
    const amount = Number(l.amount);
    // Política: IVA 10% siempre. Si la línea viene con 0 (parseo antiguo) y
    // tiene importe, la normalizamos al mostrar — al guardar queda persistido.
    const storedRate = Number(l.vatRate);
    const vatRate = storedRate > 0 ? storedRate : (amount > 0 ? 10 : 0);
    const vatAmount = round2(amount * (vatRate / 100));
    return {
      id: l.id, lineNo: l.lineNo,
      lineDate: l.lineDate ? l.lineDate.slice(0, 10) : null,
      rawSpeciesName: l.rawSpeciesName,
      speciesId: l.speciesId ?? null,
      description: l.description ?? "",
      kilos: Number(l.kilos), pricePerKg: Number(l.pricePerKg), amount,
      vatRate, vatAmount,
      notes: l.notes ?? ""
    };
  }));

  useEffect(() => {
    Promise.all([fetch("/api/ports"), fetch("/api/boats"), fetch("/api/suppliers"), fetch("/api/species")])
      .then(rs => Promise.all(rs.map(r => r.json())))
      .then(([p, b, s, sp]) => {
        setPorts(p.data); setBoats(b.data); setSuppliers(s.data); setSpecies(sp.data);
      });
  }, []);

  const sumAmount = useMemo(() => lines.reduce((a, l) => a + (Number(l.amount) || 0), 0), [lines]);
  const sumKilos  = useMemo(() => lines.reduce((a, l) => a + (Number(l.kilos)  || 0), 0), [lines]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function addLine() {
    setLines(prev => [...prev, {
      lineNo: prev.length + 1, lineDate: form.issueDate || null,
      rawSpeciesName: "", speciesId: null, description: "",
      kilos: 0, pricePerKg: 0, amount: 0,
      vatRate: 10,       // política por defecto
      vatAmount: 0,
      notes: ""
    }]);
  }
  function removeLine(i: number) { setLines(prev => prev.filter((_, idx) => idx !== i)); }

  async function save(verify: boolean) {
    setSaving(true); setMsg(null);
    const body = {
      ...form, verify, lines: lines.map((l, i) => ({
        ...l, lineNo: i + 1,
        lineDate: l.lineDate || null,
        description: l.description || null,
        notes: l.notes || null
      }))
    };
    const r = await fetch(`/api/invoices/${invoice.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setSaving(false);
    if (!r.ok) { setMsg(j?.error ?? "Error"); return; }

    if (verify) {
      const archive = j.data?.archive;
      if (archive?.moved) {
        const shortDest = archive.destination?.split(/[\\\/]+/).slice(-2).join("/");
        setMsg(`✓ Factura verificada. Archivo movido a ${shortDest}.`);
        setTimeout(() => router.push("/documents?tab=CAPTURA"), 1200);
      } else {
        // NO redirigimos: dejamos al usuario ver el motivo y actuar.
        setMsg(
          `✓ Factura verificada, pero el PDF NO se movió a "revisado/". ` +
          `Motivo: ${archive?.reason ?? "desconocido"}`
        );
        router.refresh();
      }
    } else {
      setMsg("Borrador guardado.");
      router.refresh();
    }
  }

  async function reparse() {
    if (!confirm("Reimportar con el parser actual? (borra edición en curso)")) return;
    const r = await fetch(`/api/documents/${document.id}/reparse`, { method: "POST" });
    const j = await r.json();
    if (!r.ok) { setMsg(j?.error ?? "Error"); return; }
    router.push(`/documents/${j.data.document.id}`); router.refresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      {/* Datalist compartido por todas las celdas de especie */}
      <datalist id="species-list-editor">
        {species.map(s => (
          <option key={s.id} value={`${s.commonName} (${s.code})`} />
        ))}
      </datalist>

      <div className="space-y-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Cabecera</h2>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Nº factura"><input className="input" value={form.invoiceNumber ?? ""} onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} /></Field>
            <Field label="Fecha"><input className="input" type="date" value={form.issueDate ?? ""} onChange={e => setForm({ ...form, issueDate: e.target.value })} /></Field>
            <Field label="Moneda"><input className="input" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} /></Field>
            <Field label="Puerto"><Select opts={ports} value={form.portId} onChange={v => setForm({ ...form, portId: v })} /></Field>
            <Field label="Barco"><Select opts={boats} value={form.boatId} onChange={v => setForm({ ...form, boatId: v })} /></Field>
            <Field label="Proveedor"><Select opts={suppliers} value={form.supplierId} onChange={v => setForm({ ...form, supplierId: v })} /></Field>
            <Field label="Tipo">
              <select className="input" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as any })}>
                <option value="CAPTURA">Captura</option>
                <option value="OTHER">Otro</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Líneas</h2>
            <button className="btn-ghost" onClick={addLine}>+ Añadir línea</button>
          </div>
          <div className="overflow-auto">
            <table className="table min-w-[900px]">
              <thead>
                <tr>
                  <th>#</th><th>Fecha</th><th>Especie (PDF)</th><th>Especie normalizada</th>
                  <th>Descripción</th>
                  <th className="text-center">Kilos</th>
                  <th className="text-center">€/Kg</th>
                  <th className="text-center">Importe</th>
                  <th className="text-center">IVA %</th>
                  <th className="text-center">IVA €</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><input className="input" type="date" value={l.lineDate ?? ""} onChange={e => updateLine(i, { lineDate: e.target.value })} /></td>
                    <td><input className="input w-44" value={l.rawSpeciesName} onChange={e => updateLine(i, { rawSpeciesName: e.target.value })} /></td>
                    <td>
                      <SpeciesCombo
                        species={species}
                        value={l.speciesId}
                        onChange={v => updateLine(i, { speciesId: v })}
                        onReloadSpecies={async () => {
                          const r = await fetch("/api/species");
                          const j = await r.json();
                          setSpecies(j.data);
                        }}
                      />
                    </td>
                    <td><input className="input w-52" value={l.description ?? ""} onChange={e => updateLine(i, { description: e.target.value })} /></td>
                    <td><NumInput value={l.kilos} decimals={2} onChange={v => updateLine(i, { kilos: v, amount: round2(v * l.pricePerKg) })} /></td>
                    <td><NumInput value={l.pricePerKg} decimals={3} onChange={v => updateLine(i, { pricePerKg: v, amount: round2(l.kilos * v) })} /></td>
                    <td><NumInput value={l.amount} decimals={2} onChange={v => updateLine(i, { amount: v, vatAmount: round2(v * (l.vatRate / 100)) })} /></td>
                    <td><NumInput value={l.vatRate} decimals={2} onChange={v => updateLine(i, { vatRate: v, vatAmount: round2(l.amount * (v / 100)) })} /></td>
                    <td><NumInput value={l.vatAmount} decimals={2} onChange={v => updateLine(i, { vatAmount: v })} /></td>
                    <td><button className="text-rose-600 text-sm" onClick={() => removeLine(i)}>Quitar</button></td>
                  </tr>
                ))}
                {!lines.length && <tr><td colSpan={11} className="text-center py-4 text-slate-500">Sin líneas</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-right text-sm text-slate-500">
            Suma líneas — kilos: <b>{fmtNum(sumKilos, 2)} kg</b>
            {" · "}
            importe: <b>{fmtNum(sumAmount, 2)} €</b>
          </div>
        </div>

        <div className="card">
          <label className="label">Notas</label>
          <textarea className="input min-h-[90px]" value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      <aside className="space-y-3">
        <div className="card">
          <h2 className="font-semibold mb-3">Totales</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Subtotal"><NumInput value={form.subtotal} onChange={v => setForm({ ...form, subtotal: v })} /></Field>
            <Field label="Impuestos"><NumInput value={form.taxes} onChange={v => setForm({ ...form, taxes: v })} /></Field>
            <Field label="Tasas"><NumInput value={form.fees} onChange={v => setForm({ ...form, fees: v })} /></Field>
            <Field label="Otros"><NumInput value={form.other} onChange={v => setForm({ ...form, other: v })} /></Field>
          </div>
          <div className="mt-3">
            <Field label="Total factura"><NumInput value={form.total} onChange={v => setForm({ ...form, total: v })} /></Field>
          </div>
          {/* Totales calculados desde las líneas: útiles para cotejar con el PDF. */}
          <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>Kilos (suma líneas)</span>
              <b>{fmtNum(sumKilos, 2)} kg</b>
            </div>
            <div className="flex items-center justify-between">
              <span>Importe (suma líneas)</span>
              <b>{fmtNum(sumAmount, 2)} €</b>
            </div>
          </div>
        </div>

        <button disabled={saving} className="btn-primary w-full justify-center" onClick={() => save(true)}>{saving ? "Guardando..." : "Guardar y verificar"}</button>
        <button disabled={saving} className="btn-ghost w-full justify-center" onClick={() => save(false)}>Guardar borrador</button>
        <button className="btn-ghost w-full justify-center" onClick={reparse}>Volver a parsear PDF</button>

        {msg && (
          <div
            className={
              msg.includes("NO se movió") || msg.includes("Error")
                ? "text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2"
                : msg.startsWith("✓") || msg.includes("verificada") || msg.includes("guardado")
                ? "text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md p-2"
                : "text-sm text-slate-600"
            }
          >
            {msg}
          </div>
        )}

        <details className="card text-xs">
          <summary className="cursor-pointer">Ver datos crudos del parser</summary>
          <pre className="overflow-auto max-h-96 mt-2">{JSON.stringify(document?.rawParsed, null, 2)}</pre>
        </details>

        <details className="card text-xs">
          <summary className="cursor-pointer">Ver texto extraído del PDF</summary>
          <pre className="overflow-auto max-h-96 mt-2 whitespace-pre-wrap">
            {document?.rawText ?? "(sin texto)"}
          </pre>
        </details>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}
function Select({ opts, value, onChange, labelKey = "name" }: { opts: Opt[]; value: string | null; onChange: (v: string | null) => void; labelKey?: keyof Opt }) {
  return (
    <select className="input" value={value ?? ""} onChange={e => onChange(e.target.value || null)}>
      <option value="">—</option>
      {opts.map(o => <option key={o.id} value={o.id}>{(o as any)[labelKey] ?? o.name ?? o.code}</option>)}
    </select>
  );
}
/**
 * Input numérico con formato español siempre visible (miles con punto,
 * decimales con coma, 2 decimales fijos por defecto).
 *
 * Mientras el usuario escribe (focused) se muestra el valor "en bruto" para no
 * estorbar la edición. Al salir (blur) se parsea y vuelve a formatear.
 */
function NumInput({
  value, onChange, decimals = 2
}: { value: number; onChange: (v: number) => void; step?: string; decimals?: number }) {
  const [text, setText] = useState<string>(fmtNum(value, decimals));
  const [focused, setFocused] = useState(false);

  // Si el valor del padre cambia y el usuario no está editando, sincroniza.
  useEffect(() => {
    if (!focused) setText(fmtNum(value, decimals));
  }, [value, decimals, focused]);

  return (
    <input
      className="input w-28 text-center tabular-nums"
      type="text"
      inputMode="decimal"
      value={text}
      onChange={e => setText(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const n = parseNumberES(text);
        onChange(n);
        setText(fmtNum(n, decimals));
      }}
    />
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Formato ES-ES: 14526.6 → "14.526,60". */
function fmtNum(n: number, decimals = 2): string {
  const v = Number(n) || 0;
  return v.toLocaleString("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true
  });
}

/** Parser tolerante: acepta "14.526,60" (ES), "14526.60" (EN) y "14526,60". */
function parseNumberES(s: string): number {
  if (!s) return 0;
  let cleaned = s.trim().replace(/\s+/g, "").replace(/€/g, "");
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".");
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Input combobox de especie con autocompletado. Si se escribe un nombre que no
 * existe en el catálogo, se crea al vuelo vía /api/species/find-or-create.
 */
function SpeciesCombo({
  species, value, onChange, onReloadSpecies
}: {
  species: Opt[];
  value: string | null;
  onChange: (id: string | null) => void;
  onReloadSpecies: () => Promise<void>;
}) {
  const current = species.find(s => s.id === value);
  const currentLabel = current ? `${current.commonName} (${current.code})` : "";
  const [text, setText] = useState(currentLabel);
  const [busy, setBusy] = useState(false);

  // Sincroniza el texto cuando cambia la prop value o se recarga el catálogo
  useEffect(() => { setText(currentLabel); /* eslint-disable-next-line */ }, [value, species.length]);

  async function commit(raw: string) {
    const t = raw.trim();
    if (!t) { onChange(null); return; }
    if (t === currentLabel.trim()) return;

    // Intento 1: match exacto por "Nombre (CÓDIGO)" o por nombre
    const codeM = t.match(/\(([A-Z0-9]{2,8})\)\s*$/);
    const plain = t.replace(/\s*\([A-Z0-9]{2,8}\)\s*$/, "").trim().toLowerCase();
    const localMatch =
      (codeM && species.find(s => s.code === codeM[1])) ||
      species.find(s => (s.commonName ?? "").toLowerCase() === plain);
    if (localMatch) { onChange(localMatch.id); return; }

    // Intento 2: delegar al servidor (que busca y crea si hace falta)
    setBusy(true);
    try {
      const r = await fetch("/api/species/find-or-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: t })
      });
      const j = await r.json();
      if (!r.ok) { alert(j?.error ?? "No se pudo resolver la especie."); return; }
      await onReloadSpecies();
      onChange(j.data.id);
    } finally { setBusy(false); }
  }

  return (
    <input
      className="input w-48"
      list="species-list-editor"
      value={text}
      placeholder={busy ? "Creando..." : "Escribe o elige una especie"}
      onChange={e => setText(e.target.value)}
      onBlur={e => commit(e.target.value)}
      disabled={busy}
    />
  );
}
