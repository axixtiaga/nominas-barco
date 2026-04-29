/**
 * Parser del Excel mensual de Seguridad Social.
 *
 * Versión 2: detección AUTOMÁTICA de columnas leyendo las cabeceras del Excel,
 * en vez de asumir posiciones fijas. Funciona con formatos típicos donde la
 * cabecera contiene textos como "DNI", "NOMBRE", "SEG.SOCIAL", "Total Coste S.S",
 * etc.
 *
 * Estructura típica detectada:
 *   - Filas 1-N: títulos (Centro, Empresa, periodo)
 *   - Fila cabecera: "Centro | Empresa | Pertenece | NOMBRE | DNI | Periodo | Total Devengo | 25% Otros Gtos. | 3% AC IT+IMS | 3,5% IT+IMS* | 6% del Deducir | Total Liquido en C.C. emp. | Coste Acc. Empr. | Total Coste S.S | SEG.SOCIAL | Total Coste | Base C. Comunes | Base Accidentes"
 *   - Filas datos: una por marinero
 *   - Última(s) fila(s): totales ("Total niveros", "Suma:", etc.)
 *
 * El dato principal a importar es la columna marcada como "SEG.SOCIAL" (en el
 * Excel del usuario es la columna O, pero el parser ya no depende de eso).
 */

import ExcelJS from "exceljs";

export type ParsedSsRow = {
  rowNumber: number;
  dni: string | null;
  name: string;
  amount: number;
  totalCost: number | null;
  employerPart: number | null;
  employeePart: number | null;
};

export type SsParseResult = {
  rows: ParsedSsRow[];
  headerRow: number | null;
  detectedColumns: {
    name: number | null;
    dni: number | null;
    amount: number | null;       // columna marcada como "SEG.SOCIAL"
    totalCost: number | null;    // "Total Coste S.S"
    employerPart: number | null; // "Coste Acc. Empr." / "Coste Empresa"
    employeePart: number | null; // "Total Liquido en C.C. emp." / "Cuota obrera"
  };
  warnings: string[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function norm(s: any): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
}

function cellText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return (v as any).richText.map((r: any) => r.text).join("");
    if ("text" in v) return String((v as any).text);
    if ("result" in v) return cellText((v as any).result);
    if ("formula" in v && "result" in v) return String((v as any).result ?? "");
  }
  return String(v);
}

/**
 * Convierte el valor de una celda en número.
 * Cuidado con dos formatos posibles:
 *   - Número JS nativo (ExcelJS lo da así para celdas numéricas): 281.05  →  281.05
 *   - String en formato español: "281,05" o "1.234,56"  →  281.05 / 1234.56
 *   - String en formato inglés: "281.05" o "1,234.56"  →  281.05 / 1234.56
 *
 * Regla: si la cadena tiene COMA, es formato español (puntos = miles, coma = decimal).
 *        Si NO tiene coma, los puntos son decimales (formato inglés / número JS serializado).
 *        Si es un number nativo, se devuelve tal cual (sin tocar dígitos).
 */
function toNumber(v: any): number {
  if (v == null) return 0;
  // Desempaquetar objetos de ExcelJS (formula con result, richText, text)
  if (typeof v === "object" && v !== null) {
    if ("result" in v) v = (v as any).result;
    else if ("richText" in v) v = (v as any).richText.map((r: any) => r.text).join("");
    else if ("text" in v) v = (v as any).text;
  }
  if (v == null) return 0;
  // Si tras desempaquetar es un número nativo, devolverlo SIN tocar (este era el bug:
  // antes pasábamos 281.05 a String, eliminábamos el punto y nos quedaba 28105).
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/[€\s]/g, "");
  if (!s) return 0;
  let cleaned: string;
  if (s.includes(",")) {
    // Formato español: 1.234,56 → quitar puntos (miles) y cambiar coma por punto.
    cleaned = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Sin coma: el punto (si existe) es decimal. Lo dejamos tal cual.
    cleaned = s;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function looksLikeDni(s: string): boolean {
  const u = s.replace(/\s/g, "").toUpperCase();
  return /^\d{7,8}[A-Z]$/.test(u) || /^[XYZ]\d{7,8}[A-Z]$/.test(u);
}

function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (t.length < 4) return false;
  if (/^\d/.test(t)) return false;     // empieza por número, no es nombre
  const words = t.split(/\s+/).filter(w => /^[A-ZÁÉÍÓÚÑa-záéíóúñ'-]+$/.test(w));
  return words.length >= 2;
}

/**
 * Detecta a qué tipo de campo corresponde cada cabecera.
 * Devuelve null si no es ninguno conocido.
 */
function classifyHeader(text: string): keyof SsParseResult["detectedColumns"] | null {
  const t = norm(text);
  if (!t) return null;

  // Amount principal (columna O en el Excel del usuario)
  if (/^SEG\.?\s*SOCIAL$/.test(t) || t === "SEGURIDAD SOCIAL") return "amount";

  // DNI / NIF
  if (/^DNI$|^NIF$|^N\.I\.F\.$|^DOC IDENT/.test(t)) return "dni";

  // Nombre
  if (/NOMBRE|APELLIDO|TRABAJADOR/.test(t) && !/EMPRESA/.test(t)) return "name";

  // Total Coste S.S (lo que cuesta en total a la empresa)
  if (/TOTAL\s+COSTE\s+S\.?\s*S\.?$/.test(t)) return "totalCost";

  // Coste empresa / accidentes empresa
  if (/COSTE\s+(ACC\.?\s*)?EMPR/.test(t) || /CUOTA\s+EMPRESA/.test(t)) return "employerPart";

  // Líquido del trabajador / cuota obrera
  if (/LIQUIDO\s+EN\s+C\.?\s*C\.?\s+EMP/.test(t) || /CUOTA\s+OBRER/.test(t) || /CUOTA\s+TRABAJ/.test(t)) return "employeePart";

  return null;
}

// ── Parser principal ───────────────────────────────────────────────────────

export async function parseSsExcel(buffer: Buffer | ArrayBuffer): Promise<SsParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) {
    return {
      rows: [], headerRow: null,
      detectedColumns: { name: null, dni: null, amount: null, totalCost: null, employerPart: null, employeePart: null },
      warnings: ["El Excel no tiene hojas"]
    };
  }

  const warnings: string[] = [];
  const detected: SsParseResult["detectedColumns"] = {
    name: null, dni: null, amount: null,
    totalCost: null, employerPart: null, employeePart: null
  };

  // 1) Buscar la fila de cabecera. Recorre las primeras 30 filas y la fila que
  //    más cabeceras conocidas tenga gana.
  let headerRow: number | null = null;
  let bestMatchCount = 0;
  const maxScan = Math.min(ws.rowCount, 30);
  const maxCol = Math.min(ws.columnCount, 30);

  for (let r = 1; r <= maxScan; r++) {
    let matchCount = 0;
    const tempDetected: SsParseResult["detectedColumns"] = {
      name: null, dni: null, amount: null,
      totalCost: null, employerPart: null, employeePart: null
    };
    for (let c = 1; c <= maxCol; c++) {
      const txt = cellText(ws.getCell(r, c).value);
      const cls = classifyHeader(txt);
      if (cls) {
        matchCount++;
        if (tempDetected[cls] == null) tempDetected[cls] = c;
      }
    }
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      headerRow = r;
      Object.assign(detected, tempDetected);
    }
  }

  if (headerRow == null) {
    warnings.push("No se detectó cabecera. Las columnas de DNI/Nombre/Importe se buscarán por contenido en cada fila.");
  } else {
    // Aviso si no se encontró la columna de importe principal (SEG.SOCIAL)
    if (detected.amount == null) {
      warnings.push("No se detectó la columna SEG.SOCIAL en la cabecera. Se intentará usar otras columnas similares.");
      // Fallback: si hay totalCost, usar esa
      if (detected.totalCost) detected.amount = detected.totalCost;
    }
  }

  // 2) Recorrer filas de datos
  const dataStart = (headerRow ?? 0) + 1;
  const rows: ParsedSsRow[] = [];

  for (let r = dataStart; r <= ws.rowCount; r++) {
    // Si las columnas vienen detectadas, usarlas. Si no, hacer búsqueda libre.
    let dni: string | null = null;
    let name = "";

    if (detected.dni) {
      const v = cellText(ws.getCell(r, detected.dni).value).trim().toUpperCase().replace(/\s/g, "");
      if (looksLikeDni(v)) dni = v;
    }
    if (detected.name) {
      const v = cellText(ws.getCell(r, detected.name).value).trim();
      if (v.length >= 4) name = v;
    }

    // Búsqueda libre (fallback) en las primeras 8 columnas
    if (!dni || !name) {
      for (let c = 1; c <= 8; c++) {
        const val = cellText(ws.getCell(r, c).value).trim();
        if (!val) continue;
        if (!dni && looksLikeDni(val)) { dni = val.toUpperCase().replace(/\s/g, ""); continue; }
        if (!name && looksLikeName(val) && !/^ITSAS\b/i.test(val)) {
          name = val;   // evita coger "ITSAS LAGUNAK" (nombre de empresa) como nombre
        }
      }
    }
    // Si SIGUE sin haber nombre, intentar combinar celdas adyacentes con UNA palabra
    // cada una (formato típico: NOMBRE | APELLIDO1 | APELLIDO2 en columnas separadas).
    if (!name) {
      const parts: string[] = [];
      for (let c = 1; c <= 8; c++) {
        const val = cellText(ws.getCell(r, c).value).trim();
        if (!val) continue;
        // Solo palabras de letras (no códigos, no DNIs, no números)
        if (/^[A-ZÁÉÍÓÚÑa-záéíóúñ'-]{2,}$/.test(val)) parts.push(val);
        if (parts.length >= 4) break;   // evita absorber demasiadas
      }
      if (parts.length >= 2) name = parts.join(" ");
    }

    if (!dni && !name) continue;        // fila vacía

    // Saltar filas-resumen ("Total niveros", "Suma:", etc.)
    if (/^(TOTAL|SUMA|RESUMEN)/i.test(name)) continue;

    // Importe principal: usa la columna detectada como SEG.SOCIAL
    const amount = detected.amount
      ? toNumber(ws.getCell(r, detected.amount).value)
      : 0;

    // Si no hay importe y no hay DNI/nombre claro, saltar
    if (amount === 0 && !name) continue;

    const totalCost = detected.totalCost ? toNumber(ws.getCell(r, detected.totalCost).value) || null : null;
    const employerPart = detected.employerPart ? toNumber(ws.getCell(r, detected.employerPart).value) || null : null;
    const employeePart = detected.employeePart ? toNumber(ws.getCell(r, detected.employeePart).value) || null : null;

    rows.push({
      rowNumber: r, dni, name, amount,
      totalCost, employerPart, employeePart
    });
  }

  if (rows.length === 0) {
    warnings.push("No se detectaron filas con datos de marineros.");
  }

  return { rows, headerRow, detectedColumns: detected, warnings };
}

// ── Match con maestro de marineros ─────────────────────────────────────────

export type SsRowMatched = ParsedSsRow & {
  matchedSailorId: string | null;
  matchScore: number;
  matchReason: string;
};

export function matchRowsToSailors(
  rows: ParsedSsRow[],
  sailors: Array<{ id: string; name: string; dni: string | null }>
): SsRowMatched[] {
  const byDni = new Map<string, { id: string; name: string }>();
  for (const s of sailors) {
    if (s.dni) byDni.set(norm(s.dni).replace(/\s/g, ""), { id: s.id, name: s.name });
  }
  const byNameNormalized = new Map<string, { id: string; name: string }>();
  for (const s of sailors) {
    byNameNormalized.set(norm(s.name), { id: s.id, name: s.name });
  }

  return rows.map(r => {
    if (r.dni) {
      const m = byDni.get(norm(r.dni).replace(/\s/g, ""));
      if (m) return { ...r, matchedSailorId: m.id, matchScore: 100, matchReason: `DNI exacto: ${r.dni}` };
    }
    const n = norm(r.name);
    const exact = byNameNormalized.get(n);
    if (exact) return { ...r, matchedSailorId: exact.id, matchScore: 90, matchReason: "Nombre exacto" };

    // Match por palabras clave
    const words = n.split(/\s+/).filter(w => w.length >= 3);
    let bestId: string | null = null;
    let bestScore = 0;
    let bestName = "";
    for (const s of sailors) {
      const sn = norm(s.name);
      const swords = sn.split(/\s+/).filter(w => w.length >= 3);
      const common = words.filter(w => swords.includes(w)).length;
      const score = common * 20;
      if (score > bestScore) { bestScore = score; bestId = s.id; bestName = s.name; }
    }
    if (bestScore >= 40) {
      return { ...r, matchedSailorId: bestId, matchScore: bestScore, matchReason: `Coincidencia parcial con "${bestName}"` };
    }
    return { ...r, matchedSailorId: null, matchScore: 0, matchReason: "Sin coincidencia" };
  });
}

/** Intenta extraer YYYY-MM del nombre de un fichero. */
export function inferMonthFromFilename(filename: string): string | null {
  if (!filename) return null;
  const lower = filename.toLowerCase();

  const m1 = lower.match(/(20\d{2})[\s_\-\.]?(0[1-9]|1[0-2])/);
  if (m1) return `${m1[1]}-${m1[2]}`;

  const m2 = lower.match(/(0[1-9]|1[0-2])[\s_\-\.]?(20\d{2})/);
  if (m2) return `${m2[2]}-${m2[1]}`;

  const months: Record<string, string> = {
    enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
    julio: "07", agosto: "08", septiembre: "09", setiembre: "09",
    octubre: "10", noviembre: "11", diciembre: "12"
  };
  const m3 = lower.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)[\s_\-\.]+(20\d{2})/);
  if (m3) return `${m3[2]}-${months[m3[1]]}`;
  const m4 = lower.match(/(20\d{2})[\s_\-\.]+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/);
  if (m4) return `${m4[1]}-${months[m4[2]]}`;

  // Fallback: busca solo el mes
  const mAlone = lower.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/);
  if (mAlone) return `${new Date().getFullYear()}-${months[mAlone[1]]}`;

  return null;
}
