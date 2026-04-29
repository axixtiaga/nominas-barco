// Utilidades compartidas por los parsers de facturas bilingües del País Vasco
// (Itsasontziko Faktura). Getaria, Ondarroa, Hondarribia-San Pedro comparten
// estructura de tabla y lógica de consolidación por (día, especie).

import { ParsedInvoiceLine } from "./base";
import { parseNumberES, round2 } from "../money";

/**
 * Consolida un array de líneas crudas agrupando por (fecha, especie).
 * Suma kilos e importes, recalcula precio medio ponderado, concatena descripciones.
 * Uso: cualquier parser que haya extraído líneas individuales por comprador puede
 * pasarlas aquí para que el usuario vea 1 fila por (día, especie) en lugar de N.
 */
export function consolidateLines(lines: ParsedInvoiceLine[]): ParsedInvoiceLine[] {
  type Agg = {
    date: string | null;
    species: string;
    kilos: number;
    amount: number;
    vatRate: number;
    vatAmount: number;
    descriptions: Set<string>;
  };
  const grouped = new Map<string, Agg>();
  for (const l of lines) {
    const key = `${l.lineDate ?? "null"}|${l.rawSpeciesName}`;
    const g = grouped.get(key) ?? {
      date: l.lineDate ?? null,
      species: l.rawSpeciesName,
      kilos: 0,
      amount: 0,
      vatRate: l.vatRate ?? 0,
      vatAmount: 0,
      descriptions: new Set<string>()
    };
    g.kilos += l.kilos;
    g.amount += l.amount;
    g.vatAmount += l.vatAmount ?? 0;
    if (l.description) g.descriptions.add(l.description);
    grouped.set(key, g);
  }
  const out: ParsedInvoiceLine[] = [];
  for (const g of grouped.values()) {
    const avgPrice = g.kilos > 0 ? round2(g.amount / g.kilos) : 0;
    out.push({
      lineNo: 0,
      lineDate: g.date,
      rawSpeciesName: g.species,
      description: null,
      kilos: round2(g.kilos),
      pricePerKg: avgPrice,
      amount: round2(g.amount),
      vatRate: g.vatRate,
      vatAmount: round2(g.vatAmount)
    });
  }
  out.sort((a, b) => {
    const dc = (a.lineDate || "").localeCompare(b.lineDate || "");
    if (dc !== 0) return dc;
    return a.rawSpeciesName.localeCompare(b.rawSpeciesName);
  });
  return out.map((l, i) => ({ ...l, lineNo: i + 1 }));
}

type RawRow = {
  pos: number;
  buyerCode: string;
  kilos: number;
  price: number;
  amount: number;
  species: string;
};

/**
 * Extrae líneas de facturas "ITSASONTZIKO FAKTURA / FACTURA DE BARCO"
 * (Getaria, Ondarroa, Hondarribia San Pedro) y las consolida por (fecha, especie).
 *
 * Estructura del texto extraído (aprox.):
 *   <codComprador 4d><importe X,XX><precio X,XXX><kilos X,XXX>
 *   <ESPECIE>
 *   <fecha-ISO?>              ← la fecha aparece UNA vez por día, no por línea
 *   <siguiente línea...>
 *
 * La consolidación agrupa todas las líneas del mismo día y misma especie en una
 * sola, sumando kilos e importes y recalculando el precio medio ponderado.
 */
export function parseAndConsolidateBasqueLines(
  text: string,
  invoiceDateISO: string | null,
  defaultVatRate: number
): ParsedInvoiceLine[] {
  const rawRows: RawRow[] = [];

  // Patrón 1: línea completa con importe, precio y kilos (pescado subastado con precio).
  const fullRe = /(?:^|\n)\s*(\d{4})([\d\.]+,\d{2})([\d\.]+,\d{3})([\d\.]+,\d{3})\s*\n([A-Za-zÁÉÍÓÚÑáéíóúñ][^\n\d]+)/g;
  let m: RegExpExecArray | null;
  while ((m = fullRe.exec(text)) !== null) {
    const [, buyerCode, amountStr, priceStr, kilosStr, speciesRaw] = m;
    const species = speciesRaw.replace(/\s+/g, " ").trim().toUpperCase();
    if (!species) continue;
    rawRows.push({
      pos: m.index,
      buyerCode,
      amount: parseNumberES(amountStr),
      price: parseNumberES(priceStr),
      kilos: parseNumberES(kilosStr),
      species
    });
  }

  // Patrón 2: línea sin precio ni importe (típico de sardina en capturas donde
  // no llega a subastarse; solo aparece el peso). El regex requiere kilos
  // con 3 decimales para no pillar partes de la línea completa por error.
  const kilosOnlyRe = /(?:^|\n)\s*(\d{4})([\d\.]+,\d{3})\s*\n([A-Za-zÁÉÍÓÚÑáéíóúñ][^\n\d]+)/g;
  while ((m = kilosOnlyRe.exec(text)) !== null) {
    // Si ya se capturó una línea completa en esta posición, saltar.
    if (rawRows.some(r => Math.abs(r.pos - (m as RegExpExecArray).index) < 30)) continue;
    const [, buyerCode, kilosStr, speciesRaw] = m;
    const species = speciesRaw.replace(/\s+/g, " ").trim().toUpperCase();
    if (!species) continue;
    rawRows.push({
      pos: m.index,
      buyerCode,
      amount: 0,
      price: 0,
      kilos: parseNumberES(kilosStr),
      species
    });
  }

  // Marcadores de fecha YYYY-MM-DD presentes en el texto (uno por día típicamente).
  const dateMarkers: { pos: number; date: string }[] = [];
  for (const dm of text.matchAll(/(\d{4}-\d{2}-\d{2})/g)) {
    dateMarkers.push({ pos: dm.index!, date: dm[1] });
  }

  /** Busca la fecha más próxima al row (por posición absoluta en el texto). */
  const dateFor = (pos: number): string | null => {
    if (dateMarkers.length === 0) return invoiceDateISO;
    let best: string | null = null;
    let bestDist = Infinity;
    for (const { pos: dp, date } of dateMarkers) {
      const dist = Math.abs(dp - pos);
      if (dist < bestDist) {
        best = date;
        bestDist = dist;
      }
    }
    return best ?? invoiceDateISO;
  };

  rawRows.sort((a, b) => a.pos - b.pos);

  // Consolidación por (fecha, especie)
  type Agg = { kilos: number; amount: number; date: string | null; species: string; buyers: Set<string> };
  const grouped = new Map<string, Agg>();
  for (const r of rawRows) {
    const date = dateFor(r.pos);
    const key = `${date ?? "null"}|${r.species}`;
    const g = grouped.get(key) ?? { kilos: 0, amount: 0, date, species: r.species, buyers: new Set<string>() };
    g.kilos += r.kilos;
    g.amount += r.amount;
    g.buyers.add(r.buyerCode);
    grouped.set(key, g);
  }

  const lines: ParsedInvoiceLine[] = [];
  for (const g of grouped.values()) {
    if (g.kilos <= 0 && g.amount <= 0) continue;
    const avgPrice = g.kilos > 0 ? round2(g.amount / g.kilos) : 0;
    const vatAmount = round2(g.amount * (defaultVatRate / 100));
    lines.push({
      lineNo: 0,                                            // se renumera al final
      lineDate: g.date,
      rawSpeciesName: g.species,
      description: null,
      kilos: round2(g.kilos),
      pricePerKg: avgPrice,
      amount: round2(g.amount),
      vatRate: defaultVatRate,
      vatAmount
    });
  }

  lines.sort((a, b) => {
    const dc = (a.lineDate || "").localeCompare(b.lineDate || "");
    if (dc !== 0) return dc;
    return a.rawSpeciesName.localeCompare(b.rawSpeciesName);
  });
  return lines.map((l, i) => ({ ...l, lineNo: i + 1 }));
}
