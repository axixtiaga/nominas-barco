"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Expense = any;
type Line = any;

export function ExpenseEditor({ expense: initial, document: doc }: { expense: Expense; document: any }) {
  const router = useRouter();
  const [e, setE] = useState<Expense>(() => {
    // El % IVA solo puede ser 10 o 21. Si el parser dejó otro valor (p.ej. el
    // tipo efectivo de un IVA mixto), por defecto lo ponemos a 21%.
    const r = Number(initial.vatRate) || 0;
    const vatRate = (r === 10 || r === 21) ? r : 21;
    return { ...initial, vatRate };
  });
  const [lines, setLines] = useState<Line[]>(() => (initial.lines ?? []).map((l: any) => ({ ...l })));
  const [supplierName, setSupplierName] = useState(initial.supplier?.name ?? "");
  const [supplierTaxId, setSupplierTaxId] = useState(initial.supplier?.taxId ?? "");
  const [ports, setPorts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [mantas, setMantas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ports").then(r => r.json()).then(j => setPorts(j.data ?? []));
    // Capturas del mismo día (para vincular el gasto a una descarga concreta)
    if (e.issueDate) {
      const d = e.issueDate.slice(0, 10);
      fetch(`/api/invoices?date=${d}`).then(r => r.json()).then(j => setInvoices(Array.isArray(j.data) ? j.data : []));
    }
  }, [e.issueDate]);

  // Lista de mantas existentes (extraída de las jornadas con manta asignada)
  useEffect(() => {
    fetch("/api/nominas?withMantaOnly=true").then(r => r.json()).then(j => {
      const all = (j.data?.rows ?? []).map((r: any) => r.manta).filter(Boolean);
      setMantas(Array.from(new Set(all)).sort());
    });
  }, []);

  // Total a descontar del montemayor (suma de líneas con includeInMontemayor=true)
  const computableTotal = lines.reduce((a, l) => a + (l.includeInMontemayor !== false ? Number(l.amount) || 0 : 0), 0);

  // El % IVA solo admite 10 o 21 (por defecto 21). Estas derivadas controlan el desplegable.
  const currentRate = Number(e.vatRate) || 0;
  const ivaIsStandard = currentRate === 10 || currentRate === 21;
  const ivaSelectValue = ivaIsStandard ? String(currentRate) : "21";

  // Cuando hay líneas, los Importes totales se calculan AUTOMÁTICAMENTE a partir
  // de las líneas marcadas y del % IVA: base = suma marcadas, IVA = base × %, total = base + IVA.
  // (Si no hay líneas, los importes se editan a mano como antes.)
  useEffect(() => {
    if (lines.length === 0) return;
    const base = Math.round(computableTotal * 100) / 100;
    const rate = Number(e.vatRate) || 0;
    const vat = Math.round(base * rate) / 100;
    const total = Math.round((base + vat) * 100) / 100;
    setE((prev: any) => {
      if (Number(prev.baseAmount) === base && Number(prev.vatAmount) === vat && Number(prev.totalAmount) === total) return prev;
      return { ...prev, baseAmount: base, vatAmount: vat, totalAmount: total };
    });
  }, [computableTotal, e.vatRate, lines.length]);

  function set(field: keyof Expense, value: any) { setE((prev: any) => ({ ...prev, [field]: value })); }

  // Auto-recalcular IVA si cambia base o tipo
  function setBase(v: string) {
    const base = parseFloat(v.replace(",", ".")) || 0;
    const rate = parseFloat(String(e.vatRate ?? 0)) || 0;
    const vat = Math.round(base * rate) / 100;
    setE((prev: any) => ({ ...prev, baseAmount: base, vatAmount: vat, totalAmount: Math.round((base + vat) * 100) / 100 }));
  }
  function setRate(v: string) {
    const rate = parseFloat(v.replace(",", ".")) || 0;
    const base = parseFloat(String(e.baseAmount ?? 0)) || 0;
    const vat = Math.round(base * rate) / 100;
    setE((prev: any) => ({ ...prev, vatRate: rate, vatAmount: vat, totalAmount: Math.round((base + vat) * 100) / 100 }));
  }
  function setVat(v: string) {
    const vat = parseFloat(v.replace(",", ".")) || 0;
    const base = parseFloat(String(e.baseAmount ?? 0)) || 0;
    setE((prev: any) => ({ ...prev, vatAmount: vat, totalAmount: Math.round((base + vat) * 100) / 100 }));
  }
  function setTotal(v: string) {
    const total = parseFloat(v.replace(",", ".")) || 0;
    setE((prev: any) => ({ ...prev, totalAmount: total }));
  }

  async function save(verify: boolean) {
    setSaving(true); setMsg(null);
    const body = {
      expenseNumber: e.expenseNumber,
      issueDate: e.issueDate,
      serviceDate: e.serviceDate,
      supplierName, supplierTaxId,
      portId: e.portId,
      invoiceId: e.invoiceId,
      manta: e.manta,
      concept: e.concept,
      category: e.category,
      baseAmount: Number(e.baseAmount) || 0,
      vatRate: Number(e.vatRate) || 0,
      vatAmount: Number(e.vatAmount) || 0,
      totalAmount: Number(e.totalAmount) || 0,
      notes: e.notes,
      lines: lines.map((l, i) => ({
        lineNo: l.lineNo ?? i + 1,
        lineDate: l.lineDate,
        conceptCode: l.conceptCode,
        description: l.description,
        reference: l.reference,
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        amount: Number(l.amount) || 0,
        includeInMontemayor: l.includeInMontemayor !== false,
        linkedInvoiceId: l.linkedInvoiceId || null,
        manta: l.manta || null,
        notes: l.notes
      })),
      verify
    };
    const r = await fetch(`/api/expenses/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok) { setMsg(j?.error ?? "Error guardando"); return; }

    if (verify) {
      const archive = j.data?.archive;
      if (archive?.moved) {
        const shortDest = archive.destination?.split(/[\\\/]+/).slice(-2).join("/");
        setMsg(`✓ Gasto verificado. Archivo movido a ${shortDest}.`);
        // Volver a la lista de gastos pendientes (mismo comportamiento que en Facturas).
        setTimeout(() => router.push("/documents?tab=GASTO"), 1200);
      } else {
        // Si no se pudo mover, NO redirigimos: dejamos al usuario ver el motivo.
        setMsg(`✓ Gasto verificado, pero el PDF NO se movió a "revisado/". Motivo: ${archive?.reason ?? "desconocido"}`);
        router.refresh();
      }
    } else {
      setMsg("Borrador guardado.");
      router.refresh();
    }
  }

  function updateLine(idx: number, field: string, value: any) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }
  function toggleLineInclude(idx: number) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, includeInMontemayor: l.includeInMontemayor === false } : l));
  }
  function addLine() {
    setLines(prev => [...prev, {
      lineNo: prev.length + 1,
      lineDate: e.issueDate ?? null,
      conceptCode: "",
      description: "",
      reference: "",
      quantity: 0, unitPrice: 0, amount: 0,
      includeInMontemayor: true,
      linkedInvoiceId: null
    }]);
  }
  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx));
  }

  async function reparse() {
    if (!confirm("¿Volver a parsear este PDF de gasto con el parser actual? Se sobrescribirán los datos extraídos automáticamente.")) return;
    const r = await fetch(`/api/expenses/${e.id}/reparse`, { method: "POST" });
    const j = await r.json();
    if (!r.ok) { alert(j?.error ?? "Error"); return; }
    // Al reparsear se crea un documento NUEVO (otro id). Volvemos a la pantalla
    // de revisión de ese documento para ver el resultado, en vez de a la lista.
    const newDocId = j?.data?.document?.id;
    if (newDocId) {
      router.push(`/documents/${newDocId}`);
      router.refresh();
    } else {
      router.push(`/documents?tab=GASTO`);
    }
  }

  // Lista completa de categorías — debe coincidir con el enum ExpenseCategory del schema.
  const cats = [
    "COFRADIA", "COMBUSTIBLE", "HIELO", "VIVERES", "TELEFONIA", "TRANSPORTE",
    "MANTENIMIENTO", "HIELO_PRODUCIDO", "CAJAS", "PALETS", "APAREJOS",
    "PAN", "AGUA", "CARNE", "MOVISTAR", "OTRO"
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-4">
        <div className="card space-y-4">
          <h2 className="text-lg font-medium">Datos del gasto</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Nº factura">
              <input className="input" value={e.expenseNumber ?? ""} onChange={ev => set("expenseNumber", ev.target.value)} />
            </Field>
            <Field label="Fecha factura">
              <input type="date" className="input" value={e.issueDate ? e.issueDate.slice(0, 10) : ""} onChange={ev => set("issueDate", ev.target.value)} />
            </Field>
            <Field label="Fecha servicio">
              <input type="date" className="input" value={e.serviceDate ? e.serviceDate.slice(0, 10) : ""} onChange={ev => set("serviceDate", ev.target.value)} />
            </Field>

            <Field label="Proveedor">
              <input className="input" value={supplierName} onChange={ev => setSupplierName(ev.target.value)} placeholder="Nombre del proveedor" />
            </Field>
            <Field label="CIF / NIF">
              <input className="input" value={supplierTaxId} onChange={ev => setSupplierTaxId(ev.target.value)} placeholder="A12345678" />
            </Field>
            <Field label="Categoría">
              <select className="input" value={e.category ?? "OTRO"} onChange={ev => set("category", ev.target.value)}>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            <Field label="Puerto (si aplica)" className="md:col-span-1">
              <select className="input" value={e.portId ?? ""} onChange={ev => set("portId", ev.target.value || null)}>
                <option value="">— Sin puerto —</option>
                {ports.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Asignar a manta (opcional)" className="md:col-span-1">
              <select className="input" value={e.manta ?? ""} onChange={ev => set("manta", ev.target.value || null)}>
                <option value="">— Sin asignar (auto) —</option>
                {mantas.map(m => <option key={m} value={m}>Manta {m}</option>)}
              </select>
            </Field>
            <Field label="Vincular a captura del día (opcional)" className="md:col-span-1">
              <select className="input" value={e.invoiceId ?? ""} onChange={ev => set("invoiceId", ev.target.value || null)}>
                <option value="">— Sin vincular —</option>
                {invoices.map((inv: any) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber ?? "(sin nº)"} · {inv.port?.name ?? "?"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Concepto" className="md:col-span-3">
              <input className="input" value={e.concept ?? ""} onChange={ev => set("concept", ev.target.value)} placeholder="Descripción libre" />
            </Field>

            <Field label="Notas" className="md:col-span-3">
              <textarea className="input" rows={2} value={e.notes ?? ""} onChange={ev => set("notes", ev.target.value)} />
            </Field>
          </div>
        </div>

        <div className="card space-y-3">
          <h2 className="text-lg font-medium">Importes totales</h2>
          {lines.length > 0 && (
            <p className="text-xs text-slate-500 -mt-1">
              Se calculan automáticamente a partir de las <b>líneas marcadas</b> ({fmtEur(computableTotal)}) y del <b>% IVA</b>.
              Marca/desmarca líneas o cambia el % IVA y la base, el IVA y el total se actualizan solos.
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Base imponible">
              <input
                className={`input text-right tabular-nums ${lines.length > 0 ? "bg-slate-100 text-slate-600" : ""}`}
                value={fmt(e.baseAmount)}
                onChange={ev => setBase(ev.target.value)}
                readOnly={lines.length > 0}
                title={lines.length > 0 ? "Calculado automáticamente desde las líneas marcadas" : undefined}
              />
            </Field>
            <Field label="% IVA">
              <select className="input text-right tabular-nums" value={ivaSelectValue} onChange={ev => setRate(ev.target.value)}>
                <option value="21">21,00 %</option>
                <option value="10">10,00 %</option>
              </select>
            </Field>
            <Field label="IVA €">
              <input
                className={`input text-right tabular-nums ${lines.length > 0 ? "bg-slate-100 text-slate-600" : ""}`}
                value={fmt(e.vatAmount)}
                onChange={ev => setVat(ev.target.value)}
                readOnly={lines.length > 0}
                title={lines.length > 0 ? "Calculado automáticamente (base × % IVA)" : undefined}
              />
            </Field>
            <Field label="Total">
              <input
                className={`input text-right tabular-nums font-semibold ${lines.length > 0 ? "bg-slate-100 text-slate-700" : ""}`}
                value={fmt(e.totalAmount)}
                onChange={ev => setTotal(ev.target.value)}
                readOnly={lines.length > 0}
                title={lines.length > 0 ? "Calculado automáticamente (base + IVA)" : undefined}
              />
            </Field>
          </div>
        </div>

        {/* Tabla de líneas (desglose de conceptos). Solo aparece si hay líneas. */}
        {(lines.length > 0 || true) && (
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">Líneas / desglose</h2>
                <div className="text-xs text-slate-500 mt-0.5">
                  Marca/desmarca <b>"Cuenta"</b> para indicar si esa línea se descuenta del montemayor.
                  Las marcadas con ✗ no se restarán al calcular la nómina.
                </div>
              </div>
              <button type="button" className="btn-ghost text-xs" onClick={addLine}>+ Añadir línea</button>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th className="text-center">Cuenta</th>
                  <th>Fecha</th>
                  <th>Cód.</th>
                  <th>Descripción</th>
                  <th>Ref. albarán</th>
                  <th className="text-right">Cantidad</th>
                  <th className="text-right">Precio €</th>
                  <th className="text-right">Importe €</th>
                  <th>Vincular captura</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const inc = l.includeInMontemayor !== false;
                  return (
                    <tr key={idx} className={inc ? "" : "opacity-50 bg-slate-50"}>
                      <td className="text-center">
                        <input type="checkbox" checked={inc} onChange={() => toggleLineInclude(idx)} title="Incluir en cálculo de montemayor" />
                      </td>
                      <td><input type="date" className="input text-xs py-1" value={l.lineDate ? String(l.lineDate).slice(0, 10) : ""} onChange={ev => updateLine(idx, "lineDate", ev.target.value)} /></td>
                      <td><input className="input text-xs py-1 w-20" value={l.conceptCode ?? ""} onChange={ev => updateLine(idx, "conceptCode", ev.target.value)} /></td>
                      <td><input className="input text-xs py-1" value={l.description ?? ""} onChange={ev => updateLine(idx, "description", ev.target.value)} /></td>
                      <td><input className="input text-xs py-1 w-40" value={l.reference ?? ""} onChange={ev => updateLine(idx, "reference", ev.target.value)} /></td>
                      <td><input className="input text-xs py-1 w-24 text-right tabular-nums" value={fmt(l.quantity)} onChange={ev => updateLine(idx, "quantity", parseFloat(ev.target.value.replace(",", ".")) || 0)} /></td>
                      <td><input className="input text-xs py-1 w-24 text-right tabular-nums" value={fmt(l.unitPrice)} onChange={ev => updateLine(idx, "unitPrice", parseFloat(ev.target.value.replace(",", ".")) || 0)} /></td>
                      <td><input className="input text-xs py-1 w-28 text-right tabular-nums font-medium" value={fmt(l.amount)} onChange={ev => updateLine(idx, "amount", parseFloat(ev.target.value.replace(",", ".")) || 0)} /></td>
                      <td>
                        <select className="input text-xs py-1" value={l.linkedInvoiceId ?? ""} onChange={ev => updateLine(idx, "linkedInvoiceId", ev.target.value || null)}>
                          <option value="">—</option>
                          {invoices.map((inv: any) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.invoiceNumber ?? "(sin nº)"} · {inv.port?.name ?? "?"}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td><button type="button" className="text-xs text-rose-600 hover:underline" onClick={() => removeLine(idx)}>quitar</button></td>
                    </tr>
                  );
                })}
                {!lines.length && <tr><td colSpan={10} className="text-center py-4 text-slate-500 text-sm">Sin líneas. Pulsa "Añadir línea" para crear una.</td></tr>}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={7} className="text-right text-xs uppercase tracking-wide text-slate-500">Total a descontar del montemayor:</td>
                    <td className="text-right tabular-nums font-bold text-emerald-700">{fmtEur(computableTotal)}</td>
                    <td colSpan={2} className="text-xs text-slate-500">{lines.filter(l => l.includeInMontemayor !== false).length} de {lines.length} líneas cuentan</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <aside className="space-y-3">
        <div className="card space-y-2">
          <button disabled={saving} className="btn-primary w-full justify-center" onClick={() => save(true)}>{saving ? "Guardando..." : "Guardar y verificar"}</button>
          <button disabled={saving} className="btn-ghost w-full justify-center" onClick={() => save(false)}>Guardar borrador</button>
          <button className="btn-ghost w-full justify-center" onClick={reparse}>Volver a parsear PDF</button>
          {msg && <div className="text-sm text-emerald-700">{msg}</div>}
        </div>
        <div className="card text-xs text-slate-600 space-y-1">
          <div><b>Archivo:</b> <span className="font-mono break-all">{doc.filename}</span></div>
          <div><b>Estado:</b> {e.status}</div>
          {doc.parseError && <div className="text-rose-600"><b>Error parseo:</b> {doc.parseError}</div>}
        </div>
        {doc.rawText && (
          <details className="card text-xs">
            <summary className="cursor-pointer text-slate-500">Ver texto extraído del PDF</summary>
            <pre className="overflow-auto max-h-64 mt-2 whitespace-pre-wrap">{doc.rawText.slice(0, 3000)}</pre>
          </details>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: any; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function fmt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false });
}
function fmtEur(v: any) {
  const n = Number(v) || 0;
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as any);
}
