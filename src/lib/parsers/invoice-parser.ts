/**
 * PARSER DE FACTURAS
 * ──────────────────
 * Parsers disponibles:
 *  - CSV: funcional
 *  - PDF: extracción básica + detector formato cofradía vasca
 *  - Imagen: placeholder (conectar OCR)
 *  - Excel: básico
 */

export interface ParsedInvoiceData {
  invoiceNumber?: string;
  invoiceDate?: string;
  portName?: string;
  supplierName?: string;
  boatName?: string;
  subtotal?: number;
  taxAmount?: number;
  feesAmount?: number;
  totalAmount?: number;
  observations?: string;
  lines: ParsedInvoiceLine[];
  parseConfidence: number;
  parseWarnings: string[];
}

export interface ParsedInvoiceLine {
  speciesName?: string;
  kilos?: number;
  pricePerKilo?: number;
  lineAmount?: number;
  quality?: string;
}

// ── Helpers numéricos ──────────────────────────────────────────────────────────

function parseNum(s: string): number {
  if (!s) return 0;
  // Formato español: 1.234,56 -> 1234.56
  const cleaned = s.trim().replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function parseDate(s: string): string | undefined {
  // Acepta dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd
  const dmy = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const ymd = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  return undefined;
}

// ── Detector formato cofradía vasca / española ────────────────────────────────
//
// Formato detectado:
//   COMPRADOR  ESPECIE (calidad)  KILOS  PRECIO  IMPORTE
//   con totales TOTAL DIA / TOTAL PESCA al final
//   y cabecera con Numero / Data/Fecha / Kodea / I.F.K.

function parseCofradiaFormat(text: string): ParsedInvoiceData | null {
  // Detectar si es formato cofradía: tiene "FACTURA DE BARCO" o "ITSASONTZIKO FAKTURA"
  const isCofradiaFormat =
    /FACTURA DE BARCO|ITSASONTZIKO FAKTURA|TOTAL DIA|TOTAL PESCA|TOTAL FACTURA EUROS/i.test(text);

  if (!isCofradiaFormat) return null;

  const warnings: string[] = [];

  // Número de factura — patrón FP0601084/26-00002 o similar
  const numMatch = text.match(/(?:Numero|Zenbakia)[^\w\n]*([\w\/\-]+\/\d{2}-\d{5})/i)
    || text.match(/(FP\d+\/\d{2}-\d{5})/i)
    || text.match(/(?:Numero|Número)\s+([\w\/\-]+)/i);
  const invoiceNumber = numMatch?.[1]?.trim();

  // Fecha — buscar patrón de fecha en el texto
  const dateMatch = text.match(/(\d{2}-\d{2}-\d{4})/);
  const invoiceDate = dateMatch ? parseDate(dateMatch[1]) : undefined;

  // Puerto/Cofradía — buscar nombre de cofradía
  const portMatch = text.match(/KOFRADIA|COFRADIA|LONXA|LONJA|COFRAD[IÍ]A[\s\S]{0,60}/i);
  const portName = portMatch ? portMatch[0].trim().substring(0, 40) : undefined;

  // Proveedor/Emisor — segunda empresa mencionada (el barco o CB)
  const providerMatch = text.match(/([A-ZÁÉÍÓÚÑ\s]+(?:C\.B\.|S\.L\.|S\.A\.|KOFRADIA)[^\n]*)/);
  const supplierName = providerMatch?.[1]?.trim();

  // Total factura
  const totalFacturaMatch = text.match(/TOTAL FACTURA EUROS[\s\S]{0,20}?([\d.,]+)/i)
    || text.match(/TOTAL INGRESADO CUENTA[\s\n]+([\d.,]+)/i)
    || text.match(/KONTUAN INGRESATUA[\s\S]{0,30}?([\d.,]+)/i);
  const totalAmount = totalFacturaMatch ? parseNum(totalFacturaMatch[1]) : undefined;

  // Base imponible y IVA
  const baseMatch = text.match(/Base Imponible[\s\S]{0,10}?([\d.,]+)/i)
    || text.match(/Zerga Oinarra[\s\S]{0,30}?([\d.,]+)/i);
  const subtotal = baseMatch ? parseNum(baseMatch[1]) : undefined;

  const ivaMatch = text.match(/(?:B\.E\.Z\.|I\.V\.A\.)\s+([\d.,]+)(?!\s*%)/i);
  const taxAmount = ivaMatch ? parseNum(ivaMatch[1]) : undefined;

  // Gastos
  const gastosMatch = text.match(/GASTOS[\s\S]{0,10}?([\d.,]+)/i);
  const feesAmount = gastosMatch ? parseNum(gastosMatch[1]) : undefined;

  // ── Líneas de captura ──────────────────────────────────────────────────────
  // Formato: EMPRESA  ESPECIE (calidad)  KILOS  PRECIO  IMPORTE
  // Ejemplo: PESCALVAREZ S.L. ANCHOA (30-50 1.300,00 1,340 1.742,00
  //          granos)
  // Las líneas tienen empresa + especie + kilos + precio + importe

  const lines: ParsedInvoiceLine[] = [];

  // Estrategia: buscar bloques con números que parezcan kilos/precio/importe
  // Patrón: texto_empresa ESPECIE ... NUM_KILOS NUM_PRECIO NUM_IMPORTE
  const linePattern = /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s\.]+?)\s+(ANCHOA|MERLUZA|ATÚN|BONITO|VERDEL|CABALLA|SARDINA|BOCARTE|TXITXARRO|HEGALUZE|BESUGO|RAPE|CIGALA|GAMBA|LANGOSTINO|PULPO|CALAMAR|SEPIA|CHICHARRO|[A-ZÁÉÍÓÚÑ]{4,}(?:\s+\([^)]+\))?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/gi;

  let m: RegExpExecArray | null;
  while ((m = linePattern.exec(text)) !== null) {
    const empresa = m[1].trim();
    const especie = m[2].trim();
    const kilos   = parseNum(m[3]);
    const precio  = parseNum(m[4]);
    const importe = parseNum(m[5]);

    // Filtrar líneas que no son capturas (totales, etc.)
    if (kilos > 0 && precio > 0 && importe > 0 && !empresa.match(/TOTAL|GUZTIRA/i)) {
      lines.push({
        speciesName:  especie,
        kilos,
        pricePerKilo: precio,
        lineAmount:   importe,
        quality:      empresa.length < 60 ? empresa : undefined,
      });
    }
  }

  // Si no encontró líneas con el patrón de especie conocida, intentar patrón numérico
  if (lines.length === 0) {
    // Buscar filas con 3 números consecutivos (kilos, precio, importe)
    const numericPattern = /([A-ZÁÉÍÓÚÑ][^\n]{5,40}?)\s+([\d]{1,4}[.,]\d{2,3})\s+([\d.,]+)\s+([\d.,]+)/g;
    while ((m = numericPattern.exec(text)) !== null) {
      const texto  = m[1].trim();
      const kilos  = parseNum(m[2]);
      const precio = parseNum(m[3]);
      const importe= parseNum(m[4]);

      if (kilos > 10 && precio > 0.1 && precio < 50 && importe > 0
          && !texto.match(/TOTAL|GUZTIRA|BASE|FACTURA|GASTOS|PESCA$/i)) {
        lines.push({
          speciesName:  "Anchoa", // Default para cofradía ancho
          kilos,
          pricePerKilo: precio,
          lineAmount:   importe,
          quality:      texto.length < 60 ? texto : undefined,
        });
      }
    }
  }

  if (lines.length === 0) {
    warnings.push("No se detectaron líneas automáticamente. Revisa y rellena manualmente.");
  }

  const confidence = lines.length > 0 ? 0.85 : 0.4;

  return {
    invoiceNumber,
    invoiceDate,
    portName,
    supplierName,
    subtotal,
    taxAmount,
    feesAmount,
    totalAmount,
    lines,
    parseConfidence: confidence,
    parseWarnings: warnings,
  };
}

// ── Parser CSV ─────────────────────────────────────────────────────────────────

export async function parseCsv(content: string): Promise<ParsedInvoiceData> {
  const warnings: string[] = [];
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length < 2) return emptyResult(["CSV vacío o sin datos"]);

  const headers = lines[0].split(/[,;]/).map((h) => h.toLowerCase().trim());
  const dataLines: ParsedInvoiceLine[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;]/);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = cols[idx]?.trim() || ""));

    const kilos   = parseNum(obj["kilos"] || obj["kg"] || obj["cantidad"] || "0");
    const precio  = parseNum(obj["precio"] || obj["precio_kilo"] || obj["precio/kg"] || "0");
    const importe = parseNum(obj["importe"] || obj["total"] || obj["precio_total"] || "0");
    const especie = obj["especie"] || obj["producto"] || "";

    if (especie || kilos > 0) {
      dataLines.push({
        speciesName:  especie || undefined,
        kilos:        kilos   || undefined,
        pricePerKilo: precio  || undefined,
        lineAmount:   importe || (kilos * precio) || undefined,
        quality:      obj["calidad"] || obj["quality"] || undefined,
      });
    }
  }

  if (dataLines.length === 0) {
    warnings.push("No se encontraron líneas. Revisa los nombres de columnas.");
  }

  const total = dataLines.reduce((s, l) => s + (l.lineAmount || 0), 0);

  return {
    lines: dataLines,
    subtotal:      total || undefined,
    totalAmount:   total || undefined,
    parseConfidence: dataLines.length > 0 ? 0.7 : 0.2,
    parseWarnings: warnings,
  };
}

// ── Parser PDF ─────────────────────────────────────────────────────────────────

export async function parsePdf(buffer: Buffer): Promise<ParsedInvoiceData> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await pdfParse(buffer as any);
    const text = data.text;

    // Intentar primero el parser de cofradía
    const cofradiaResult = parseCofradiaFormat(text);
    if (cofradiaResult) {
      if (!cofradiaResult.parseWarnings.some(w => w.includes("básica"))) {
        cofradiaResult.parseWarnings.unshift("Formato cofradía detectado. Revisa las líneas extraídas.");
      }
      return cofradiaResult;
    }

    // Fallback al parser genérico
    return extractFromTextGeneric(text, [
      "⚠️ Extracción PDF básica: revisa y corrige los datos manualmente.",
    ]);
  } catch {
    return emptyResult([
      "Error al leer el PDF. El archivo puede estar protegido o ser un escaneo.",
    ]);
  }
}

function extractFromTextGeneric(text: string, warnings: string[]): ParsedInvoiceData {
  const lines_: ParsedInvoiceLine[] = [];

  const invoiceNumMatch = text.match(/(?:factura|albarán)[^\d]*(\w+-?\d+[-/]\d+)/i);
  const invoiceNumber = invoiceNumMatch?.[1];

  const dateMatch = text.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  let invoiceDate: string | undefined;
  if (dateMatch) {
    invoiceDate = `${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
  }

  const totalMatch = text.match(/(?:total|importe total)[^\d]*([\d.,]+)/i);
  const totalAmount = totalMatch ? parseNum(totalMatch[1]) : undefined;

  const linePattern = /([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+)\s+([\d.,]+)\s*kg?\s*([\d.,]+)\s*€?\s*([\d.,]+)/gi;
  let match;
  while ((match = linePattern.exec(text)) !== null) {
    const kilos   = parseNum(match[2]);
    const precio  = parseNum(match[3]);
    const importe = parseNum(match[4]);
    if (kilos > 0 && precio > 0) {
      lines_.push({
        speciesName:  match[1].trim(),
        kilos,
        pricePerKilo: precio,
        lineAmount:   importe || kilos * precio,
      });
    }
  }

  if (lines_.length === 0) {
    warnings.push("No se detectaron líneas de captura. Introdúcelas manualmente.");
  }

  return {
    invoiceNumber,
    invoiceDate,
    totalAmount,
    lines: lines_,
    parseConfidence: lines_.length > 0 ? 0.5 : 0.2,
    parseWarnings: warnings,
  };
}

// ── Parser imagen ──────────────────────────────────────────────────────────────

export async function parseImage(_buffer: Buffer): Promise<ParsedInvoiceData> {
  return emptyResult([
    "⚠️ Extracción desde imagen no disponible en esta versión.",
    "Para activar OCR, conecta Google Vision API o AWS Textract en variables de entorno.",
    "Introduce los datos manualmente usando el formulario de revisión.",
  ]);
}

// ── Parser Excel ───────────────────────────────────────────────────────────────

export async function parseExcel(buffer: Buffer): Promise<ParsedInvoiceData> {
  const warnings: string[] = ["Extracción desde Excel básica: revisa los datos."];
  try {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) return emptyResult(["Excel sin hojas"]);

    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell((cell) => cells.push(String(cell.value || "")));
      rows.push(cells);
    });

    if (rows.length < 2) return emptyResult(["Excel sin datos"]);

    const csvLike = rows.map((r) => r.join(";")).join("\n");
    const result = await parseCsv(csvLike);
    result.parseWarnings = [...warnings, ...result.parseWarnings];
    return result;
  } catch {
    return emptyResult(["Error al leer Excel. El archivo puede estar dañado."]);
  }
}

// ── Dispatcher ─────────────────────────────────────────────────────────────────

export async function parseDocument(
  buffer: Buffer,
  mimeType: string
): Promise<ParsedInvoiceData> {
  if (mimeType === "text/csv" || mimeType === "text/plain") {
    return parseCsv(buffer.toString("utf-8"));
  }
  if (mimeType === "application/pdf") {
    return parsePdf(buffer);
  }
  if (mimeType.startsWith("image/")) {
    return parseImage(buffer);
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    return parseExcel(buffer);
  }
  return emptyResult([`Tipo de archivo no soportado: ${mimeType}`]);
}

function emptyResult(warnings: string[]): ParsedInvoiceData {
  return { lines: [], parseConfidence: 0, parseWarnings: warnings };
}
