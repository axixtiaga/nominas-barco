import { ExpenseParserHandler, ParsedExpense, ParsedExpenseLine } from "./base";
import { parseNumberES } from "../money";

/**
 * Parser de "FACTURA DE GASTOS Y SERVICIOS" de la Cofradía Ntra. Sra. del Puerto (Santoña).
 *
 * Identificadores: CIF V39023569 + leyenda "FACTURA DE GASTOS Y SERVICIOS".
 * Número de factura serie F (p.ej. "F26 / 461").
 *
 * El cuerpo lista conceptos vinculados a varios albaranes de la temporada
 * (Cuota Voluntaria, Palets, Alquiler caja plástico). Aquí solo extraemos
 * los totales — el concepto detallado va al campo `concept` como resumen.
 */
export const santonaGastosParser: ExpenseParserHandler = {
  key: "santona-gastos",
  label: "Santoña · Gastos cofradía (serie F)",
  matches(ctx) {
    const t = ctx.rawText;
    return /\bV39023569\b/.test(t)
      && /FACTURA\s+DE\s+GASTOS\s+Y\s+SERVICIOS/i.test(t);
  },
  parse(ctx): ParsedExpense {
    const t = ctx.rawText;

    // Número de factura. En el texto que extrae pdf-parse el formato aparece pegado:
    //   "F2646123/04/2026"  →  F + año(2) + número(N) + fecha(10).
    // Usamos lookahead para la fecha y separamos año/número.
    let expenseNumber: string | null = null;
    const fNum = t.match(/\bF(\d{2,6})(?=\d{2}\/\d{2}\/\d{4})/);
    if (fNum) {
      const all = fNum[1];
      const year = all.slice(0, 2);
      const num = all.slice(2);
      expenseNumber = num ? `F${year}/${num}` : `F${all}`;
    } else {
      // Fallback al formato con espacios/barra explícita
      const alt = t.match(/\b(F\d{2}\s*\/\s*\d+)\b/i);
      if (alt) expenseNumber = alt[1].replace(/\s+/g, "");
    }

    const issueDate = parseDate(firstMatch(t, [/(\d{2}\/\d{2}\/\d{4})/]));

    // En este PDF las columnas se extraen pegadas (pdf-parse): "2.216,08465,38Totales:".
    // Estrategia robusta:
    //   1) Captura "<base><iva>Totales:" — los dos números pegados antes de la palabra Totales.
    //   2) Tipo de IVA: "%21,00" (signo % delante).
    //   3) Total = base + iva (calculado).
    let baseAmount = 0, vatRate = 21, vatAmount = 0, totalAmount = 0;

    const totalsBlock = t.match(/(\d[\d\.]*,\d{2})(\d[\d\.]*,\d{2})\s*Totales:/);
    if (totalsBlock) {
      baseAmount = parseNumberES(totalsBlock[1]);
      vatAmount = parseNumberES(totalsBlock[2]);
    } else {
      // Fallback: a veces puede no estar el "Totales:" pero sí "Base Imponible...TOTAL\n...\n<base><iva>"
      // Buscamos los dos primeros números pegados que aparezcan tras "Base Imponible".
      const after = t.split(/Base\s+Imponible/i)[1] ?? "";
      const stuck = after.match(/(\d[\d\.]*,\d{2})(\d[\d\.]*,\d{2})/);
      if (stuck) {
        baseAmount = parseNumberES(stuck[1]);
        vatAmount = parseNumberES(stuck[2]);
      }
    }

    // Tipo de IVA: "%21,00" — el % aparece DELANTE del número en la zona de totales.
    // Evita falsos positivos con "(2,50%)" del cuerpo (% detrás), que es la cuota voluntaria.
    const rateMatch = t.match(/%\s*(\d{1,2}[,.]\d{2})/);
    if (rateMatch) {
      vatRate = parseNumberES(rateMatch[1]);
    }

    // Total: idealmente el campo "Total Albarán" o el primer número aislado tras los totales.
    // Más fiable: lo calculamos como base + iva (en facturas con un solo tramo de IVA).
    const computed = Math.round((baseAmount + vatAmount) * 100) / 100;
    if (computed > 0) {
      totalAmount = computed;
    } else {
      // Intento etiqueta: "Total Albarán . . .  10.592,08" o similar.
      totalAmount = parseNumberES(firstMatch(t, [
        /Total\s+Factura[^\d]*([\d\.]+,\d{2})/i,
        /Total\s+Albar[áa]n[^\d]*([\d\.]+,\d{2})/i
      ]) ?? "0");
    }

    // Concepto-resumen: cogemos las primeras 1-3 líneas tras "Resumen conceptos"
    let concept = "Cuota voluntaria + palets + cajas plástico (varios albaranes)";
    const resumen = t.match(/Resumen\s+conceptos[\s\S]{0,400}/i);
    if (resumen) {
      const conceptos = Array.from(resumen[0].matchAll(/\b(Palets|ALQUILER\s+CAJA\s+PLASTICO|Cuota\s+Voluntaria)\b/gi)).map(m => m[1]);
      const uniq = Array.from(new Set(conceptos.map(s => s.toLowerCase())));
      if (uniq.length) concept = uniq.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" + ");
    }

    // Extraer líneas de detalle: cada concepto dentro de cada bloque "Albarán D26/XXX del DD/MM/YYYY"
    const lines = parseLineDetails(t);

    return {
      expenseNumber,
      issueDate,
      supplierName: "COFRADÍA DE PESCADORES NTRA. SRA. DEL PUERTO",
      supplierTaxId: "V39023569",
      portName: "Santoña",
      concept,
      category: "COFRADIA",
      baseAmount,
      vatRate,
      vatAmount,
      totalAmount,
      currency: "EUR",
      lines,
      meta: { formatKey: "santona-gastos" }
    };
  }
};

/**
 * Parsea las líneas de detalle del cuerpo. Cada bloque tiene cabecera
 *   "Albarán D26/XXX del DD/MM/YYYY"
 * y debajo varios conceptos del tipo
 *   <importe><precio><código>   <descripción> (B26-XXX)<cantidad>
 *
 * Por defecto, las líneas con código 99.010 (Cuota Voluntaria 2,5%) se marcan
 * `includeInMontemayor=false` porque ese descuento ya se aplica directamente sobre
 * la captura cuando se calcula el montemayor (no debe contarse dos veces). El usuario
 * puede cambiar esto manualmente desde el editor.
 */
function parseLineDetails(text: string): ParsedExpenseLine[] {
  const out: ParsedExpenseLine[] = [];
  let lineNo = 0;

  // Capturar cada bloque de albarán
  const blockRe = /Albar[áa]n\s+(D26\/\d+)\s+del\s+(\d{2}\/\d{2}\/\d{4})([\s\S]*?)(?=Albar[áa]n\s+D26\/|Resumen\s+conceptos|$)/gi;
  let bm: RegExpExecArray | null;
  while ((bm = blockRe.exec(text)) !== null) {
    const albaranRef = bm[1];
    const dateStr = bm[2];
    const blockBody = bm[3];
    const lineDate = parseDate(dateStr);

    // Cada concepto: importe(2dec) + precio(3dec) + código + descripción(B26-XXX) + cantidad(2dec) al final
    const lineRe = /(\d[\d\.]*,\d{2})(\d[\d\.]*,\d{3})(\d{1,3}(?:\.\d{3})?)\s+(.+?)\s*\(B26-(\d+)\)\s*(\d[\d\.]*,\d{2})/g;
    let lm: RegExpExecArray | null;
    while ((lm = lineRe.exec(blockBody)) !== null) {
      const amount = parseNumberES(lm[1]);
      const unitPrice = parseNumberES(lm[2]);
      const code = lm[3];
      const description = lm[4].trim().replace(/\s+/g, " ");
      const reference = `B26-${lm[5]}`;
      const quantity = parseNumberES(lm[6]);

      // Heurística de inclusión: la Cuota Voluntaria (código 99.010) ya se descuenta
      // directamente al calcular el montemayor desde la captura, no debe contarse
      // de nuevo aquí. Palets y Alquiler de Cajas Plástico SÍ son gastos reales.
      const includeInMontemayor = !/^99\.?010$/.test(code);

      out.push({
        lineNo: ++lineNo,
        lineDate,
        conceptCode: code,
        description,
        reference: `${albaranRef} → ${reference}`,
        quantity,
        unitPrice,
        amount,
        includeInMontemayor
      });
    }
  }

  return out;
}

function firstMatch(text: string, regexes: RegExp[]): string | null {
  for (const re of regexes) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
    if (m && !m[1] && m[0]) return m[0].trim();
  }
  return null;
}
function parseDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const yyyy = y.length === 2 ? (Number(y) > 70 ? "19" + y : "20" + y) : y;
  return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
