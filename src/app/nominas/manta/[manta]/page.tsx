"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Payroll = any;

const CATEGORIES = [
  "HIELO_PRODUCIDO", "HIELO", "CAJAS", "PALETS", "APAREJOS",
  "PAN", "AGUA", "CARNE", "MOVISTAR", "TELEFONIA", "COMBUSTIBLE",
  "TRANSPORTE", "MANTENIMIENTO", "VIVERES", "COFRADIA", "OTRO"
];

// Descripción por defecto que se autorrellena al elegir una categoría.
// El usuario puede sobrescribirla.
const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  HIELO_PRODUCIDO: "Hielo producido",
  HIELO: "Hielo (compra)",
  CAJAS: "Cajas",
  PALETS: "Palets",
  APAREJOS: "Aparejos",
  PAN: "Pan",
  AGUA: "Agua",
  CARNE: "Carne",
  MOVISTAR: "Movistar",
  TELEFONIA: "Telefonía",
  COMBUSTIBLE: "Combustible",
  TRANSPORTE: "Transporte",
  MANTENIMIENTO: "Mantenimiento",
  VIVERES: "Víveres",
  COFRADIA: "Cofradía",
  OTRO: ""
};

// Valores por defecto SOLO para HIELO_PRODUCIDO (cálculo automático horas × kg/h × €/Tn).
const HIELO_DEFAULT_KG_PER_HOUR = 290;
const HIELO_DEFAULT_PRICE_PER_TN = 0.05;

// Roles que se ocultan en la versión "marineros" (mismo criterio que el PDF).
const HIDDEN_ROLES_FOR_MARINEROS = new Set(["ARMADOR", "PATRON"]);

export default function MantaConfeccionPage() {
  const params = useParams<{ manta: string }>();
  const mantaId = decodeURIComponent(params.manta);
  const [data, setData] = useState<Payroll | null>(null);
  const [manualGastos, setManualGastos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  // Audiencia para impresión: "armadores" muestra todo, "marineros" oculta
  // las filas de ARMADOR y PATRON. Solo afecta a la vista en el navegador
  // mientras dura la impresión.
  const [printAudience, setPrintAudience] = useState<"armadores" | "marineros">("armadores");

  // Progreso de la descarga masiva de PDFs personales (uno por marinero).
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current?: string } | null>(null);
  // Estado del envío masivo por email
  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailReport, setEmailReport] = useState<any | null>(null);

  // Lanza window.print() tras aplicar la audiencia (esperando a que React repinte).
  function printVersion(audience: "armadores" | "marineros") {
    setPrintAudience(audience);
    setTimeout(() => {
      window.print();
      // Restablece a la versión completa tras imprimir.
      setTimeout(() => setPrintAudience("armadores"), 200);
    }, 60);
  }
  const [newManual, setNewManual] = useState({
    category: "HIELO_PRODUCIDO",
    description: "Hielo producido",
    hours: "",
    kgPerHour: String(HIELO_DEFAULT_KG_PER_HOUR).replace(".", ","),
    pricePerTn: String(HIELO_DEFAULT_PRICE_PER_TN).replace(".", ","),
    amount: ""
  });

  // Cálculo automático del importe en tiempo real (preview en el formulario).
  // Fórmula: horas × kg/hora × precio  (multiplicación directa, sin dividir entre 1000).
  // Ejemplo: 10h × 290 kg/h × 0,05 = 145,00 €  (la etiqueta "€/Tn" del Excel original
  // es engañosa: el cálculo se hace directo sobre los kg).
  const previewImporte = (() => {
    const h = parseFloat(newManual.hours.replace(",", ".")) || 0;
    const k = parseFloat(newManual.kgPerHour.replace(",", ".")) || 0;
    const p = parseFloat(newManual.pricePerTn.replace(",", ".")) || 0;
    if (h && k && p) return Math.round((h * k * p) * 100) / 100;
    const direct = parseFloat(newManual.amount.replace(",", ".")) || 0;
    return direct;
  })();

  // Cambia la categoría:
  //  - Autorellena la descripción con el valor por defecto correspondiente.
  //  - Si es HIELO_PRODUCIDO: rellena kg/hora y €/Tn por defecto, vacía el importe directo.
  //  - Si es OTRA cosa: vacía hours/kgPerHour/pricePerTn (no aplican).
  function changeCategory(cat: string) {
    if (cat === "HIELO_PRODUCIDO") {
      setNewManual({
        category: cat,
        description: DEFAULT_DESCRIPTIONS[cat] ?? "",
        hours: "",
        kgPerHour: String(HIELO_DEFAULT_KG_PER_HOUR).replace(".", ","),
        pricePerTn: String(HIELO_DEFAULT_PRICE_PER_TN).replace(".", ","),
        amount: ""
      });
    } else {
      setNewManual({
        category: cat,
        description: DEFAULT_DESCRIPTIONS[cat] ?? "",
        hours: "",
        kgPerHour: "",
        pricePerTn: "",
        amount: ""
      });
    }
  }

  async function refresh() {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      fetch(`/api/nominas/manta/${encodeURIComponent(mantaId)}`),
      fetch(`/api/nominas/manta/${encodeURIComponent(mantaId)}/manual-gastos`)
    ]);
    const j1 = await r1.json();
    const j2 = await r2.json();
    setData(j1.data);
    setManualGastos(Array.isArray(j2.data) ? j2.data : []);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [mantaId]);

  async function addManual() {
    const body: any = {
      category: newManual.category,
      description: newManual.description.trim() || "Gasto manual"
    };
    if (newManual.hours)      body.hours = parseFloat(newManual.hours.replace(",", "."));
    if (newManual.kgPerHour)  body.kgPerHour = parseFloat(newManual.kgPerHour.replace(",", "."));
    if (newManual.pricePerTn) body.pricePerTn = parseFloat(newManual.pricePerTn.replace(",", "."));
    if (newManual.amount)     body.amount = parseFloat(newManual.amount.replace(",", "."));

    const r = await fetch(`/api/nominas/manta/${encodeURIComponent(mantaId)}/manual-gastos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) { const j = await r.json(); alert(j?.error ?? "Error"); return; }
    setNewManual({ category: "HIELO_PRODUCIDO", description: "Hielo producido", hours: "", kgPerHour: "", pricePerTn: "", amount: "" });
    setShowManualForm(false);
    refresh();
  }

  async function deleteManual(id: string) {
    if (!confirm("¿Borrar este gasto manual de la manta?")) return;
    const r = await fetch(`/api/nominas/manta/${encodeURIComponent(mantaId)}/manual-gastos/${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json(); alert(j?.error ?? "Error"); return; }
    refresh();
  }

  if (loading || !data) return <div className="p-6 text-slate-500">Cargando confección de la manta {mantaId}...</div>;

  const periodLabel = data.periodFrom && data.periodTo
    ? `del ${formatDate(data.periodFrom)} al ${formatDate(data.periodTo)}`
    : "(sin jornadas)";

  return (
    <div className="space-y-6">
      <Link href="/nominas" className="text-sm text-blue-600 hover:underline">← Volver a Nóminas</Link>

      <div className="card text-center space-y-1">
        <h1 className="text-2xl font-semibold">Manta nº <b>{mantaId}</b></h1>
        <p className="text-sm text-slate-600">MANTA CORRESPONDIENTE A LOS PERIODOS COMPRENDIDOS ENTRE</p>
        <p className="text-base font-medium">EL <b>{formatDate(data.periodFrom)}</b> AL <b>{formatDate(data.periodTo)}</b></p>
      </div>

      {/* INGRESOS */}
      <Section title="INGRESOS">
        <table className="table">
          <tbody>
            {data.ingresosPorPuerto.map((p: any) => (
              <tr key={p.portId ?? p.portName}>
                <td>Pesca líquida "Monte Mayor" en <b>{p.portName.toUpperCase()}</b></td>
                <td className="text-right tabular-nums">{fmtEur(p.total)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 font-bold bg-slate-50">
              <td>TOTAL INGRESOS</td>
              <td className="text-right tabular-nums">{fmtEur(data.totalIngresos)}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* GASTOS */}
      <Section title="GASTOS">
        {data.gastosLineas.length > 0 ? (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Concepto</th>
                  <th>Proveedor</th>
                  <th className="text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {data.gastosLineas.map((g: any, i: number) => (
                  <tr key={i}>
                    <td className="text-xs whitespace-nowrap">{g.date ? formatDate(g.date) : "—"}</td>
                    <td className="text-xs"><Badge text={g.category} /></td>
                    <td className="text-sm">{g.description}</td>
                    <td className="text-xs text-slate-600">{g.supplier ?? "—"}</td>
                    <td className="text-right tabular-nums">{fmtEur(g.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 font-bold bg-slate-50">
                  <td colSpan={4}>TOTAL GASTOS "MONTE MAYOR"</td>
                  <td className="text-right tabular-nums">{fmtEur(data.totalGastos)}</td>
                </tr>
              </tbody>
            </table>

            {/* Resumen por categoría */}
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-2 text-slate-600">Resumen por categoría</h3>
              <table className="table text-xs">
                <tbody>
                  {data.gastosPorCategoria.map((c: any) => (
                    <tr key={c.category}>
                      <td><Badge text={c.category} /></td>
                      <td className="text-right tabular-nums">{fmtEur(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500 italic">Sin gastos imputados a esta manta.</p>
        )}
      </Section>

      {/* GASTOS MANUALES (añadidos a esta manta) */}
      <Section title="GASTOS MANUALES DE ESTA MANTA">
        {manualGastos.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Descripción</th>
                <th className="text-right">Horas</th>
                <th className="text-right">Kg/Hora</th>
                <th className="text-right">Kg</th>
                <th className="text-right">€/Tn</th>
                <th className="text-right">Importe</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {manualGastos.map(g => {
                const kg = (g.hours && g.kgPerHour) ? Number(g.hours) * Number(g.kgPerHour) : null;
                return (
                  <tr key={g.id}>
                    <td><Badge text={g.category} /></td>
                    <td className="text-sm">{g.description}</td>
                    <td className="text-right tabular-nums">{g.hours != null ? Number(g.hours).toFixed(2).replace(".", ",") : "—"}</td>
                    <td className="text-right tabular-nums">{g.kgPerHour != null ? Number(g.kgPerHour).toFixed(2).replace(".", ",") : "—"}</td>
                    <td className="text-right tabular-nums">{kg != null ? kg.toLocaleString("es-ES", { maximumFractionDigits: 0 }) : "—"}</td>
                    <td className="text-right tabular-nums">{g.pricePerTn != null ? Number(g.pricePerTn).toFixed(4).replace(".", ",") : "—"}</td>
                    <td className="text-right tabular-nums font-medium">{fmtEur(g.amount)}</td>
                    <td><button className="text-xs text-rose-600 hover:underline" onClick={() => deleteManual(g.id)}>Borrar</button></td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-slate-300 font-bold bg-slate-50">
                <td colSpan={6}>TOTAL GASTOS MANUALES</td>
                <td className="text-right tabular-nums">{fmtEur(manualGastos.reduce((a, g) => a + Number(g.amount), 0))}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500 italic">Sin gastos manuales en esta manta.</p>
        )}

        {!showManualForm ? (
          <div className="mt-3">
            <button className="btn-ghost" onClick={() => setShowManualForm(true)}>+ Añadir gasto manual a esta manta</button>
          </div>
        ) : (
          <div className="mt-3 card border-blue-200 bg-blue-50 space-y-3">
            <h3 className="font-medium text-sm">Nuevo gasto manual</h3>

            {/* Selector de categoría siempre visible */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <Field label="Categoría">
                <select className="input" value={newManual.category} onChange={e => changeCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Descripción" className="md:col-span-2">
                <input className="input" value={newManual.description} onChange={e => setNewManual(p => ({ ...p, description: e.target.value }))} />
              </Field>
            </div>

            {newManual.category === "HIELO_PRODUCIDO" ? (
              /* MODO HIELO PRODUCIDO: cálculo automático horas × kg/hora × €/Tn */
              <div className="space-y-2">
                <p className="text-xs text-slate-600">
                  Cálculo automático: <b>Horas × Kg/Hora × €/Tn</b>. Los valores por defecto son
                  <b> {HIELO_DEFAULT_KG_PER_HOUR} kg/h</b> y <b>{String(HIELO_DEFAULT_PRICE_PER_TN).replace(".", ",")} €/Tn</b> (editables).
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm items-end">
                  <Field label="Horas">
                    <input className="input text-right tabular-nums" placeholder="10,00" value={newManual.hours} onChange={e => setNewManual(p => ({ ...p, hours: e.target.value }))} />
                  </Field>
                  <Field label="Kg/Hora">
                    <input className="input text-right tabular-nums" value={newManual.kgPerHour} onChange={e => setNewManual(p => ({ ...p, kgPerHour: e.target.value }))} />
                  </Field>
                  <Field label="€/Tn">
                    <input className="input text-right tabular-nums" value={newManual.pricePerTn} onChange={e => setNewManual(p => ({ ...p, pricePerTn: e.target.value }))} />
                  </Field>
                  <div className="flex flex-col items-end justify-end">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Importe calculado</span>
                    <span className="text-2xl font-bold text-emerald-700 tabular-nums">{fmtEur(previewImporte)}</span>
                  </div>
                </div>
              </div>
            ) : (
              /* MODO RESTO DE CATEGORÍAS: solo importe directo */
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm items-end">
                <Field label="Importe (€)">
                  <input
                    className="input text-right tabular-nums text-lg"
                    placeholder="0,00"
                    value={newManual.amount}
                    onChange={e => setNewManual(p => ({ ...p, amount: e.target.value }))}
                  />
                </Field>
                <div className="md:col-span-2 flex flex-col items-end justify-end">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Importe que se descontará</span>
                  <span className="text-2xl font-bold text-emerald-700 tabular-nums">{fmtEur(previewImporte)}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-slate-200">
              <button className="btn-primary" onClick={addManual} disabled={previewImporte <= 0}>+ Añadir</button>
              <button className="btn-ghost" onClick={() => setShowManualForm(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </Section>

      {/* CÁLCULO MONTE MAYOR */}
      <Section title="LÍQUIDO MONTE MAYOR">
        <table className="table">
          <tbody>
            <tr><td>Total ingresos</td><td className="text-right tabular-nums">{fmtEur(data.totalIngresos)}</td></tr>
            <tr><td>− Total gastos "Monte Mayor"</td><td className="text-right tabular-nums">−{fmtEur(data.totalGastos)}</td></tr>
            <tr className="border-t-2 border-slate-300 font-bold text-lg">
              <td>LÍQUIDO MONTE MAYOR</td>
              <td className="text-right tabular-nums text-emerald-700">{fmtEur(data.liquidoMonteMayor)}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* CÁLCULO REPARTO TRIPULACIÓN */}
      <Section title="REPARTO TRIPULACIÓN">
        <table className="table">
          <tbody>
            <tr><td>Participación Tripulación 50%</td><td className="text-right tabular-nums">{fmtEur(data.participacionTripulacion)}</td></tr>
            <tr><td>Participación 3,5% Seguridad Social, parte tripulación</td><td className="text-right tabular-nums">−{fmtEur(data.ssTripulacion)}</td></tr>
            <tr className="border-t-2 border-slate-300 font-bold text-lg">
              <td>LÍQUIDO BRUTO</td>
              <td className="text-right tabular-nums text-emerald-700">{fmtEur(data.liquidoBruto)}</td>
            </tr>
            <tr className="text-sm text-slate-600">
              <td>{fmtEur(data.liquidoBruto)} entre <b>{data.totalPartes}</b> partes, resulta la "MANTA" a</td>
              <td className="text-right tabular-nums font-semibold">{fmtEur(data.importePorParte)}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* DESGLOSE POR MARINERO */}
      <Section title={printAudience === "marineros" ? "LÍQUIDO POR MARINERO (TRIPULACIÓN)" : "LÍQUIDO POR MARINERO"}>
        {data.marineros.length > 0 ? (() => {
          const visibleMarineros = printAudience === "marineros"
            ? data.marineros.filter((m: any) => !HIDDEN_ROLES_FOR_MARINEROS.has(String(m.role).toUpperCase()))
            : data.marineros;
          const sumPartes = visibleMarineros.reduce((a: number, m: any) => a + (m.parts || 0), 0);
          const sumImporte = visibleMarineros.reduce((a: number, m: any) => a + (m.importeManta || 0), 0);
          const sumIrpf = visibleMarineros.reduce((a: number, m: any) => a + (m.irpfImporte || 0), 0);
          const sumLiquido = visibleMarineros.reduce((a: number, m: any) => a + (m.liquidoAPercibir || 0), 0);
          return (
          <table className="table">
            <thead>
              <tr>
                <th>Marinero</th>
                <th>Rol</th>
                <th className="text-right">Partes</th>
                <th className="text-right">Importe manta</th>
                <th className="text-right">% IRPF</th>
                <th className="text-right">IRPF</th>
                <th className="text-right">Líquido a percibir</th>
              </tr>
            </thead>
            <tbody>
              {visibleMarineros.map((m: any) => (
                <tr key={m.sailorId}>
                  <td className="font-medium">{m.name}</td>
                  <td className="text-xs text-slate-600">{m.role}</td>
                  <td className="text-right tabular-nums">{m.parts.toFixed(2).replace(".", ",")}</td>
                  <td className="text-right tabular-nums">{fmtEur(m.importeManta)}</td>
                  <td className="text-right tabular-nums text-slate-500">{m.irpfRate.toFixed(2).replace(".", ",")}%</td>
                  <td className="text-right tabular-nums">−{fmtEur(m.irpfImporte)}</td>
                  <td className="text-right tabular-nums font-bold text-emerald-700">{fmtEur(m.liquidoAPercibir)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 font-bold bg-slate-50">
                <td colSpan={2}>TOTAL ({visibleMarineros.length} {printAudience === "marineros" ? "personas" : "marineros"})</td>
                <td className="text-right tabular-nums">{sumPartes.toFixed(2).replace(".", ",")}</td>
                <td className="text-right tabular-nums">{fmtEur(sumImporte)}</td>
                <td></td>
                <td className="text-right tabular-nums">−{fmtEur(sumIrpf)}</td>
                <td className="text-right tabular-nums text-emerald-700">{fmtEur(sumLiquido)}</td>
              </tr>
            </tbody>
          </table>
          );
        })() : (
          <p className="text-sm text-slate-500 italic">
            Sin marineros activos. Añade marineros desde la sección <Link className="text-blue-600 underline" href="/sailors">Marineros</Link> para que el reparto se calcule.
          </p>
        )}
      </Section>

      <div className="text-xs text-slate-500 text-center">
        Generado por la app · Hondarribia, a {new Date().toLocaleDateString("es-ES")}
      </div>

      <div className="card print:hidden space-y-3">
        <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Exportar / Imprimir</div>

        <div>
          <div className="text-xs text-slate-600 mb-1">Versión <b>completa</b> (con armadores y patrón) — para uso interno:</div>
          <div className="flex flex-wrap gap-2">
            <a className="btn-primary"
               href={`/api/nominas/manta/${encodeURIComponent(mantaId)}/pdf?audience=armadores`}
               target="_blank">📄 PDF completo</a>
            <button className="btn-ghost" onClick={() => printVersion("armadores")}>🖨️ Imprimir completo</button>
            <button className="btn-ghost" onClick={() => sendByEmailWithPdf(data, mantaId, "armadores")}>✉️ Email completo</button>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="text-xs text-slate-600 mb-1">Versión <b>marineros</b> (oculta filas de armadores y patrón) — para entregar a la tripulación:</div>
          <div className="flex flex-wrap gap-2">
            <a className="btn-primary"
               href={`/api/nominas/manta/${encodeURIComponent(mantaId)}/pdf?audience=marineros`}
               target="_blank">📄 PDF marineros</a>
            <button className="btn-ghost" onClick={() => printVersion("marineros")}>🖨️ Imprimir marineros</button>
            <button className="btn-ghost" onClick={() => sendByEmailWithPdf(data, mantaId, "marineros")}>✉️ Email marineros</button>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 italic">
            ℹ️ Por seguridad, los navegadores no permiten que un enlace de email adjunte ficheros automáticamente.
            Al pulsar "Email" se descargará el PDF a tu carpeta <b>Descargas</b> y se abrirá tu cliente de correo —
            solo tienes que <b>arrastrarlo</b> al mensaje (o usar el botón "Adjuntar" del correo) antes de enviarlo.
          </div>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="text-xs text-slate-600 mb-1">PDFs <b>personales</b> — uno por marinero, con sus datos individuales:</div>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              className="btn-primary"
              onClick={() => downloadPersonalPdfs(data, mantaId, setBulkProgress)}
              disabled={bulkProgress !== null || sendingEmails}
            >
              📥 Descargar PDFs personales ({data.marineros.length})
            </button>
            <button
              className="btn-primary bg-violet-600 hover:bg-violet-700"
              onClick={() => sendPersonalPdfsByEmail(mantaId, setSendingEmails, setEmailReport)}
              disabled={bulkProgress !== null || sendingEmails}
              title="Envía a cada marinero su PDF personal a su email de contacto"
            >
              {sendingEmails ? "📧 Enviando…" : `📧 Enviar PDFs personales por email`}
            </button>
            {bulkProgress && (
              <span className="text-xs text-slate-600">
                {bulkProgress.done}/{bulkProgress.total} {bulkProgress.current ? `· ${bulkProgress.current}` : ""}
              </span>
            )}
          </div>
          {emailReport && (
            <div className="mt-2 text-xs space-y-1 bg-slate-50 border border-slate-200 rounded p-3">
              <div className="font-semibold">Resultado del envío:</div>
              <div className="text-emerald-700">✅ Enviados: {emailReport.summary.ok}</div>
              {emailReport.summary.skipped > 0 && (
                <div className="text-amber-700">
                  ⚠️ Saltados (sin email): {emailReport.summary.skipped}
                  <ul className="list-disc ml-5 mt-0.5">
                    {emailReport.skipped.map((sk: any) => (
                      <li key={sk.sailorId}>{sk.name} — {sk.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {emailReport.summary.failed > 0 && (
                <div className="text-rose-700">
                  ❌ Errores: {emailReport.summary.failed}
                  <ul className="list-disc ml-5 mt-0.5">
                    {emailReport.failed.map((f: any) => (
                      <li key={f.sailorId}>{f.name} ({f.email ?? "—"}) — {f.error}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button className="text-slate-500 underline text-[10px] mt-1" onClick={() => setEmailReport(null)}>cerrar</button>
            </div>
          )}
          <div className="text-[11px] text-slate-500 mt-2 italic">
            <b>Descargar</b>: PDFs van a tu carpeta Descargas para entregar a mano.<br/>
            <b>Enviar por email</b>: cada marinero con <i>email de contacto</i> definido en el maestro recibe el PDF en su correo.
            Los que no tengan email se listarán como "saltados" en el resumen.
          </div>
        </div>

        <div className="border-t border-slate-200 pt-3 flex flex-wrap gap-2">
          {!data.validatedAt ? (
            <button className="btn-primary bg-emerald-600 hover:bg-emerald-700" onClick={() => validate(mantaId, true, refresh)}>
              ✓ Validar / cerrar manta
            </button>
          ) : (
            <button className="btn-ghost text-amber-700" onClick={() => validate(mantaId, false, refresh)}>
              ⤺ Desvalidar (devolver a borrador)
            </button>
          )}
        </div>
      </div>

      {data.validatedAt && (
        <div className="card bg-emerald-50 border-emerald-200 text-sm text-emerald-800 text-center print:hidden">
          ✓ Manta validada el <b>{new Date(data.validatedAt).toLocaleString("es-ES")}</b>
        </div>
      )}
    </div>
  );
}

/**
 * Descarga uno por uno los PDFs personales de todos los marineros de la manta.
 * Va informando del progreso al componente padre vía setProgress.
 *
 * Implementación: por cada marinero hace fetch al endpoint con ?sailorId=X,
 * recibe el blob y lo descarga al disco. Pone una pausa de 250ms entre cada
 * uno para que el navegador no se queje de "demasiadas descargas a la vez".
 */
async function downloadPersonalPdfs(
  data: any,
  manta: string,
  setProgress: (p: { done: number; total: number; current?: string } | null) => void
) {
  const marineros = (data?.marineros ?? []) as any[];
  if (marineros.length === 0) { alert("No hay marineros en esta manta."); return; }
  if (!confirm(`Se van a descargar ${marineros.length} PDFs personales (uno por marinero) en tu carpeta Descargas. ¿Continuar?`)) return;

  const total = marineros.length;
  let done = 0;
  let errors = 0;

  setProgress({ done: 0, total, current: marineros[0]?.name });

  for (const m of marineros) {
    setProgress({ done, total, current: m.name });
    try {
      const url = `/api/mi/nominas/${encodeURIComponent(manta)}/pdf?sailorId=${encodeURIComponent(m.sailorId)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const safeName = String(m.name).replace(/[^a-zA-Z0-9]/g, "_");
      a.download = `Mi-Nomina-Manta-${manta}-${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (e) {
      console.error(`Error descargando PDF de ${m.name}:`, e);
      errors++;
    }
    done++;
    setProgress({ done, total, current: m.name });
    // Pausa breve entre descargas para evitar el bloqueo del navegador "demasiados ficheros a la vez"
    await new Promise(r => setTimeout(r, 300));
  }

  setProgress(null);
  if (errors > 0) {
    alert(`Descarga completada: ${done - errors} OK, ${errors} con error. Mira la consola del navegador para detalles.`);
  } else {
    alert(`✅ Descargados ${done} PDFs personales en tu carpeta Descargas.`);
  }
}

/**
 * Llama al endpoint del servidor que envía a cada marinero (con email de contacto)
 * su PDF personal por correo. Devuelve un resumen detallado: enviados / saltados / fallidos.
 */
async function sendPersonalPdfsByEmail(
  manta: string,
  setBusy: (v: boolean) => void,
  setReport: (r: any) => void
) {
  if (!confirm("Se enviará por email a cada marinero (con email de contacto definido) su PDF personal de esta manta.\n\nPuede tardar varios segundos. ¿Continuar?")) return;
  setBusy(true);
  setReport(null);
  try {
    // 1) Verificar SMTP primero (mensaje de error claro si no está configurado)
    const verify = await fetch("/api/smtp/verify");
    const vj = await verify.json();
    if (!verify.ok || !vj?.data?.ok) {
      const err = vj?.data?.error ?? vj?.error ?? "SMTP no configurado";
      alert(`No se puede enviar: ${err}\n\nRevisa el archivo .env (SMTP_HOST, SMTP_USER, SMTP_PASS).`);
      return;
    }
    // 2) Lanzar el envío
    const r = await fetch(`/api/nominas/manta/${encodeURIComponent(manta)}/send-personal-pdfs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const j = await r.json();
    if (!r.ok) { alert(j?.error ?? "Error en el envío"); return; }
    setReport(j.data);
  } catch (e: any) {
    alert("Error: " + (e?.message ?? String(e)));
  } finally {
    setBusy(false);
  }
}

async function validate(manta: string, validate: boolean, refresh: () => void) {
  const verb = validate ? "validar" : "desvalidar";
  if (!confirm(`¿${verb.charAt(0).toUpperCase() + verb.slice(1)} esta manta?`)) return;
  const r = await fetch(`/api/nominas/manta/${encodeURIComponent(manta)}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ validate })
  });
  if (!r.ok) { const j = await r.json(); alert(j?.error ?? "Error"); return; }
  refresh();
}

/**
 * Descarga el PDF al disco (carpeta Descargas) y luego abre el cliente de correo.
 * Por seguridad, los navegadores no permiten adjuntar ficheros a un mailto:, así
 * que el flujo es: 1) descargar el PDF, 2) abrir el correo, 3) el usuario arrastra
 * el fichero descargado al mensaje.
 */
async function sendByEmailWithPdf(data: any, manta: string, audience: "armadores" | "marineros" = "armadores") {
  const filenameSuffix = audience === "marineros" ? "-marineros" : "";
  const filename = `Nomina-Manta-${manta}${filenameSuffix}.pdf`;
  const pdfUrl = `/api/nominas/manta/${encodeURIComponent(manta)}/pdf?audience=${audience}`;

  // 1) Descarga el PDF al disco con el nombre adecuado
  try {
    const r = await fetch(pdfUrl);
    if (!r.ok) throw new Error("No se pudo descargar el PDF");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e: any) {
    alert("Error al descargar el PDF: " + (e?.message ?? "desconocido"));
    return;
  }

  // 2) Abre el cliente de correo con el cuerpo prerellenado
  const versionLabel = audience === "marineros" ? " (versión marineros)" : "";
  const subject = encodeURIComponent(`Nómina Itsas Lagunak — Manta nº ${manta}${versionLabel}`);
  const lines = [
    `MANTA Nº ${manta}${versionLabel}`,
    `Período: ${data.periodFrom ?? "?"} → ${data.periodTo ?? "?"}`,
    ``,
    `Total ingresos: ${data.totalIngresos.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`,
    `Total gastos: ${data.totalGastos.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`,
    `Líquido Monte Mayor: ${data.liquidoMonteMayor.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`,
    `Líquido bruto (50%): ${data.liquidoBruto.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`,
    `Importe por parte: ${data.importePorParte.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`,
    ``,
    `>>> ADJUNTA el fichero "${filename}" que se acaba de descargar a tu carpeta Descargas. <<<`,
    `(Los navegadores no permiten adjuntarlo automáticamente: arrástralo al mensaje o usa el botón "Adjuntar".)`,
    ``,
    `— Itsas Lagunak`
  ];
  const body = encodeURIComponent(lines.join("\n"));

  // Pequeño retardo para que la descarga se inicie antes de cambiar de ventana
  setTimeout(() => {
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, 300);
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="card">
      <h2 className="text-base font-semibold border-b border-slate-200 pb-2 mb-3 italic">{title}</h2>
      {children}
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 border border-slate-200 text-slate-700">{text}</span>;
}

function Field({ label, children, className }: { label: string; children: any; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function fmtEur(n: any) {
  return (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" });
}
