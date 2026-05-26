import { ParserHandler, ParsedInvoice, ParsedInvoiceLine } from "./base";
import { parseNumberES, round2 } from "../money";
import { consolidateLines } from "./_basque-shared";

/**
 * Parser del formato "LISTA DE COMPRAS" usado por LONJA GIJÓN MUSEL S.A.
 *
 * Datos identificativos del emisor:
 *   CIF: A33831934
 *   Ubicación: Muelle del Rendiello - El Musel, 33290 Gijón (Asturias)
 *
 * El documento es un ticket/listado de las compras hechas por compradores
 * en la subasta. Una línea de detalle puede haber sido comprada por varios
 * compradores en envases distintos.
 *
 * IMPORTANTE — el orden de los campos en el TEXTO EXTRAÍDO con pdf-parse
 * NO coincide con el visual del PDF. Tras varias pruebas, la estructura
 * real que llega al parser es:
 *
 *   "<codEsp> <kilos> <nLinea> <precio> <importe>-<ESPECIE>-<COMPRADOR><fecha?> <codComp>KG<envase>"
 *
 * Ejemplo (sin fecha — líneas posteriores del bloque):
 *   "1015    366,00   7.301     2,75       1.006,50-ANCHOA  MSC-QUIQUE 1    777KGCILLERO PEQUEÑA: 40+PL"
 *
 * Ejemplo (con fecha — primera línea del bloque del día):
 *   "  114    592,00   7.327     3,30       1.953,60-CABALLA-OROL07/05/2026    262"
 *   (en este caso "KG..." aparece en la línea siguiente, separado)
 *
 * Verificación matemática: kilos × precio = importe.
 *   592 × 3,30 = 1.953,60 ✓
 *   76  × 0,32 = 24,32     ✓
 *   366 × 2,75 = 1.006,50 ✓
 *
 * Líneas que se ignoran:
 *   - Cabeceras ("BERNARDO SISTIAGA", "PROVEEDOR", "Página", "FECHA", etc.)
 *   - Subtotales por especie ("SUBTOTAL ANCHOA MSC ...")
 *   - Total general ("TOTALES . . .")
 *   - Lotes IDM ("LOTE: ...IDM: ...")
 *   - Texto legal del pie del documento.
 */
export const gijonLonjaParser: ParserHandler = {
  key: "gijon-lonja",
  label: "Gijón · Lonja Gijón Musel",
  matches(ctx) {
    const t = ctx.rawText.toUpperCase();
    const sigs = (ctx.formatConfig?.signatures as string[] | undefined) ?? [
      "LONJA GIJÓN", "LONJA GIJON", "EL MUSEL", "A33831934", "RENDIELLO"
    ];
    const hit = sigs.filter(s => t.includes(s.toUpperCase())).length;
    return hit >= 2 || /\bA33831934\b/.test(ctx.rawText);
  },
  parse(ctx): ParsedInvoice {
    const text = ctx.rawText;
    const defaultVat = Number((ctx.formatConfig?.defaultVatRate as number | undefined) ?? 0);

    // Nº lista de compras: "LISTA DE COMPRAS 377/0705"
    const invoiceNumber = firstMatch(text, [
      /LISTA\s+DE\s+COMPRAS\s+([\d\/\-]+)/i,
      /N[º°]?\s*([\d]+\/[\d]+)/i
    ]);

    // Fecha de descarga: "FECHA DESCARGA :  07/05/2026"
    const issueDate = parseDate(firstMatch(text, [
      /FECHA\s+DESCARGA\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i
    ]));

    const supplierName = "LONJA GIJÓN MUSEL S.A.";
    const supplierTaxId = "A33831934";
    const portName = "Gijón";
    const boatName = /IT[SX]AS\s+LAGUNAK/i.test(text) ? "ITSAS LAGUNAK" : null;

    const rawLines = parseLines(text, issueDate, defaultVat);
    const lines = consolidateLines(rawLines);

    const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0));
    const total = subtotal;

    return {
      invoiceNumber,
      issueDate,
      portName,
      boatName,
      supplierName,
      supplierTaxId,
      currency: "EUR",
      subtotal,
      taxes: 0,
      fees: 0,
      other: 0,
      total,
      notes: null,
      lines,
      meta: { formatKey: "gijon-lonja", documentKind: "LISTA_COMPRAS" }
    };
  }
};

/* ───────── helpers ───────── */

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

/**
 * Extrae las líneas de detalle.
 *
 * Algoritmo (línea a línea del texto):
 *   1) Match del prefijo estructurado:
 *        ^\s*(codEsp)\s+(kilos)\s+(nLinea)\s+(precio)\s+(importe)(.*)$
 *      donde:
 *        codEsp es 3-5 dígitos
 *        kilos:  ej. "592,00" (siempre 2 decimales)
 *        nLinea: ej. "7.327" (puede llevar . como separador de miles)
 *        precio: ej. "3,30" (2 decimales)
 *        importe ej. "1.953,60" (2 decimales)
 *   2) El resto (`tail`) tiene formato `-ESPECIE-COMPRADOR[fecha?] codComp[KG envase]`.
 *      Se parsea separando por guiones y extrayendo la fecha opcional.
 *   3) La fecha solo aparece en la primera línea de cada bloque del día.
 *      Si no aparece en una línea, se hereda la del bloque actual.
 *
 * Líneas que NO matcheen el prefijo estructurado se ignoran (subtotales,
 * cabeceras, lotes IDM, texto legal, etc.).
 */
function parseLines(
  text: string,
  invoiceDateISO: string | null,
  defaultVatRate: number
): ParsedInvoiceLine[] {
  const out: ParsedInvoiceLine[] = [];
  const lines = text.split(/\r?\n/);

  // Prefijo estructurado: codEsp, kilos, nLinea, precio, importe, resto
  const prefixRe = /^\s*(\d{3,5})\s+([\d\.]+,\d{2})\s+([\d\.]+)\s+(\d+,\d{2})\s+([\d\.]+,\d{2})(.*)$/;

  // Para extraer comprador + código del trozo final (después de quitar fecha si la había)
  // "OROL    262" o "QUIQUE 1    777" → buyer="OROL"/"QUIQUE 1", code="262"/"777"
  // Acepta opcional "KG..." al final que se ignora.
  const buyerRe = /^(.+?)\s+(\d{2,5})(?:KG.*|\s*$)/;

  let currentDate: string | null = invoiceDateISO;

  for (const rawLine of lines) {
    const m = rawLine.match(prefixRe);
    if (!m) continue;

    const [, speciesCode, kilosStr, lineNoStr, priceStr, amountStr, tail] = m;
    void speciesCode;
    void lineNoStr;

    // tail debería empezar por "-"
    if (!tail || !tail.startsWith("-")) continue;
    const afterFirstDash = tail.substring(1);
    const secondDashIdx = afterFirstDash.indexOf("-");
    if (secondDashIdx < 0) continue;

    // Especie: lo que va entre el primer "-" y el segundo "-"
    const speciesRaw = afterFirstDash.substring(0, secondDashIdx);
    const speciesName = speciesRaw.replace(/\s+/g, " ").trim().toUpperCase();
    if (!speciesName) continue;

    // Lo que queda después del segundo "-": comprador, fecha?, código comprador, [KG envase]
    let buyerPart = afterFirstDash.substring(secondDashIdx + 1);

    // Si hay fecha "dd/mm/yyyy" embebida (solo en la primera línea del bloque),
    // la extraemos y actualizamos el "current date" para las líneas siguientes.
    const dateMatch = buyerPart.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch) {
      const parsed = parseDate(dateMatch[1]);
      if (parsed) currentDate = parsed;
      buyerPart = buyerPart.replace(dateMatch[1], "");
    }

    // Sacar nombre comprador + código
    const buyerMatch = buyerPart.match(buyerRe);
    if (!buyerMatch) continue;
    const buyerName = buyerMatch[1].replace(/\s+/g, " ").trim();
    const buyerCode = buyerMatch[2];

    const kilos = parseNumberES(kilosStr);
    const price = parseNumberES(priceStr);
    const amount = parseNumberES(amountStr);
    if (kilos <= 0 && amount <= 0) continue;

    // Sanity check matemático: kilos × precio ≈ importe (tolerancia 0.05€)
    const expected = kilos * price;
    if (Math.abs(expected - amount) > Math.max(0.05, amount * 0.001)) {
      // Si el cuadre falla mucho, la línea probablemente NO sea de detalle (ej. subtotal mal interpretado).
      continue;
    }

    const description = buyerCode ? `${buyerCode}-${buyerName}` : buyerName;
    const vatAmount = round2(amount * (defaultVatRate / 100));

    out.push({
      lineNo: out.length + 1,
      lineDate: currentDate,
      rawSpeciesName: speciesName,
      description,
      kilos: round2(kilos),
      pricePerKg: round2(price),
      amount: round2(amount),
      vatRate: defaultVatRate,
      vatAmount
    });
  }

  return out;
}
