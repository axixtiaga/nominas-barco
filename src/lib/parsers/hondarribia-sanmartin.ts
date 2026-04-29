import { ParserHandler, ParsedInvoice, ParsedInvoiceLine } from "./base";
import { parseNumberES, round2 } from "../money";

/**
 * Parser del formato usado por la Cofradía de Pescadores Ntra. Sra. San Martín (Hondarribia).
 *
 * Formato identificado a partir del PDF "FACTURA PESCA SUBASTADA" — Serie E, p.ej. "E26/55".
 * En el texto plano las columnas aparecen fusionadas:
 *   <codComprador>   <NOMBRE COMPRADOR><importe><precio><kilos>
 *   /
 *   <ESPECIE>
 * Los importes van en formato español (punto miles, coma decimal).
 * Las líneas se agrupan por "Totales para el dia DD/M".
 *
 * Reglas configurables (formatConfig.config en DocumentFormat):
 *   - signatures: lista de substrings que identifican el formato
 *   - defaultVatRate: IVA por defecto (ej. 10) si no se puede inferir por línea
 *
 * Lo que NO suponemos (queda para revisión manual o parámetros adicionales):
 *   - Código oficial FAO de la especie (ANE, HKE…) — eso lo resuelve species-normalizer.
 *   - Desglose exacto de gastos/IVA por línea (el PDF sólo los reporta a nivel factura).
 */
export const hondarribiaSanMartinParser: ParserHandler = {
  key: "hondarribia-sanmartin",
  label: "Hondarribia · Cofradía San Martín",
  matches(ctx) {
    const t = ctx.rawText.toUpperCase();
    const sigs = (ctx.formatConfig?.signatures as string[] | undefined) ?? [
      "SAN MARTIN", "HONDARRIBIA"
    ];
    const hit = sigs.filter(s => t.includes(s.toUpperCase())).length;
    return hit >= 2 || /FACTURA\s+PESCA\s+SUBASTADA/i.test(ctx.rawText);
  },
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;
    const defaultVat = Number((ctx.formatConfig?.defaultVatRate as number | undefined) ?? 10);

    // Cabecera
    const invoiceNumber = firstMatch(text, [
      /\b([A-Z]\d{2}\/\d{1,6})\b/,                 // E26/55
      /Factura\s*n[ºo°]?\s*[:\s]*([A-Z0-9\/\-]+)/i
    ]);
    const issueDate = parseDate(firstMatch(text, [
      /(\d{2}\/\d{2}\/\d{4})/
    ]));

    // Proveedor / puerto fijos para este formato
    const supplierName = /COFRAD[ÍI]A\s+DE\s+PESCADORES\s+NTRA\.\s*SAN\s+MARTIN/i.test(text)
      ? "COFRADÍA DE PESCADORES NTRA. SAN MARTIN"
      : null;
    const supplierTaxId = firstMatch(text, [/CIF:\s*([A-Z]\d{8})/i]);
    const portName = /HONDARRIBIA/i.test(text) ? "Hondarribia" : null;

    // Barco
    const boatName = /ITSAS\s+LAGUNAK/i.test(text) ? "ITSAS LAGUNAK" : null;

    // Totales a nivel factura
    const subtotal = parseNumberES(firstMatch(text, [/Base\s+Imponible[:\s]*([\d\.\,]+)/i])) || 0;
    const taxes = parseNumberES(firstMatch(text, [/I\.?V\.?A\.?\s*\n?\s*[\d\.,]*\s*([\d\.,]+)/i,
                                                  /I\.?V\.?A\.?\s*\n?\s*10[\.,]00([\d\.,]+)/i])) || 0;
    // Gastos (si aparecen desglosados en el bloque INFORMACION)
    const gastosBase = parseNumberES(firstMatch(text, [/GASTOS\s*([\d\.\,]+)\s*[\d\.\,]+/i])) || 0;
    const total = parseNumberES(firstMatch(text, [/Total\s+Factura[:\s]*([\d\.\,]+)/i])) || 0;

    // Líneas: agrupadas por "Totales para el dia DD/M"
    const lines = parseLines(text, issueDate, defaultVat);

    return {
      invoiceNumber,
      issueDate,
      portName,
      boatName,
      supplierName,
      supplierTaxId,
      currency: "EUR",
      subtotal: subtotal || lines.reduce((a, l) => a + l.amount, 0),
      taxes,
      fees: gastosBase,
      other: 0,
      total,
      notes: null,
      lines,
      meta: { formatKey: "hondarribia-sanmartin" }
    };
  }
};

/* ───────── helpers ───────── */

function firstMatch(text: string, regexes: RegExp[]): string | null {
  for (const re of regexes) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
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

/**
 * Extrae líneas de la factura.
 * Usa bloques delimitados por "Totales para el dia DD/M".
 * Dentro de cada bloque busca patrones del tipo:
 *   <codComprador>   <NOMBRE><importe><precio><kilos>
 *   /
 *   <ESPECIE>
 */
function parseLines(text: string, issueDateISO: string | null, defaultVatRate: number): ParsedInvoiceLine[] {
  const lines: ParsedInvoiceLine[] = [];
  // Extrae día del bloque: "Totales para el dia 31/3"
  const blocks = splitBlocks(text);
  let lineNo = 0;

  for (const block of blocks) {
    const dateISO = resolveBlockDate(block.day, issueDateISO);
    // Buscamos ocurrencias tipo: "198   PESCADOS OROL16.961,584,8203.519,00"
    // seguidas de un salto, "/" opcional, y nombre de especie.
    // IMPORTANTE: precio siempre tiene 3 decimales (p.ej. "4,820"). Si se permitieran
    // 2-4 decimales, el regex greedy se comería un dígito del campo kilos.
    const re = /(\d{1,4})\s{2,}([A-ZÁÉÍÓÚÑ\. ]+?)([\d\.]+,\d{2})\s*([\d\.]*,\d{3})\s*([\d\.]+,\d{2})(?:\s*\n\s*\/\s*\n\s*([A-ZÁÉÍÓÚÑ0-9 \/\-]+))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block.text)) !== null) {
      const [, buyerCode, buyerName, amountStr, priceStr, kilosStr, speciesRaw] = m;
      const amount = parseNumberES(amountStr);
      const price = parseNumberES(priceStr);
      const kilos = parseNumberES(kilosStr);
      const vatAmount = round2(amount * (defaultVatRate / 100));
      const rawSpecies = (speciesRaw ?? "").trim().replace(/\s+/g, " ").toUpperCase();

      // Descarta coincidencias espurias: sin especie o sin cantidades útiles.
      if (!rawSpecies) continue;
      if (kilos <= 0 && amount <= 0) continue;

      lines.push({
        lineNo: ++lineNo,
        lineDate: dateISO,
        rawSpeciesName: rawSpecies,
        description: `${buyerCode} - ${buyerName.trim()}`,
        kilos, pricePerKg: price, amount,
        vatRate: defaultVatRate,
        vatAmount
      });
    }
  }

  return lines;
}

function splitBlocks(text: string): { day: string | null; text: string }[] {
  // Divide por "Totales para el dia X/Y" y asigna ese día a todo lo anterior del bloque.
  const parts = text.split(/Totales\s+para\s+el\s+dia\s+([0-9]{1,2}\/[0-9]{1,2})/i);
  const out: { day: string | null; text: string }[] = [];
  if (parts.length <= 1) return [{ day: null, text }];
  let i = 0;
  let current = parts[0];
  while (i + 1 < parts.length) {
    const day = parts[i + 1];
    out.push({ day, text: current });
    current = parts[i + 2] ?? "";
    i += 2;
  }
  return out;
}

function resolveBlockDate(day: string | null, invoiceDate: string | null): string | null {
  if (!day) return invoiceDate;
  const [d, mo] = day.split("/").map(s => s.trim());
  // Asumimos el año de la fecha de la factura (si existe), si no null.
  if (!invoiceDate) return null;
  const yyyy = invoiceDate.slice(0, 4);
  return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
