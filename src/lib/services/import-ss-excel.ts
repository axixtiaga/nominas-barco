import { prisma } from "../prisma";
import { parseSsExcel, matchRowsToSailors, inferMonthFromFilename } from "./ss-excel-parser";
import { audit } from "../audit";

/**
 * Importa un Excel de Seguridad Social a partir de un buffer y un nombre de fichero.
 * Reutiliza la lógica del endpoint /api/ss-payments/import pero sin depender de
 * Next.js — para que pueda usarlo el watcher (proceso aparte de la app web).
 *
 * Devuelve un resumen con cuántas filas se importaron, actualizaron y saltaron.
 */
export async function importSsExcel(input: {
  buffer: Buffer;
  filename: string;
  /** Mes opcional (YYYY-MM). Si no se pasa, se intenta inferir del nombre. */
  monthHint?: string;
  /** Id de usuario que dispara la importación (puede ser null para watcher). */
  userId?: string | null;
}) {
  const { rows, headerRow, detectedColumns, warnings } = await parseSsExcel(input.buffer);
  if (rows.length === 0) {
    return { ok: false, error: `No se detectaron filas. ${warnings.join(" | ")}`, summary: null, headerRow, detectedColumns, warnings };
  }

  const month = input.monthHint
    ?? inferMonthFromFilename(input.filename)
    ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { ok: false, error: `Mes inválido: "${month}". Debe ser YYYY-MM.`, summary: null, headerRow, detectedColumns, warnings };
  }

  const sailors = await prisma.sailor.findMany({ select: { id: true, name: true, dni: true } });
  const matched = matchRowsToSailors(rows, sailors);

  let imported = 0, updated = 0, skipped = 0;
  const skippedDetail: Array<{ row: number; name: string; dni: string | null; reason: string }> = [];

  for (const r of matched) {
    if (!r.matchedSailorId) {
      skipped++;
      skippedDetail.push({ row: r.rowNumber, name: r.name, dni: r.dni, reason: r.matchReason });
      continue;
    }
    const existing = await prisma.ssPayment.findUnique({
      where: { sailorId_month: { sailorId: r.matchedSailorId, month } }
    });
    if (existing) {
      await prisma.ssPayment.update({
        where: { id: existing.id },
        data: {
          amount: r.amount,
          totalCost: r.totalCost,
          employerPart: r.employerPart,
          employeePart: r.employeePart,
          sailorNameRaw: r.name,
          sailorDniRaw: r.dni,
          sourceFile: input.filename,
          importedBy: input.userId ?? null
        }
      });
      updated++;
    } else {
      await prisma.ssPayment.create({
        data: {
          sailorId: r.matchedSailorId,
          sailorNameRaw: r.name,
          sailorDniRaw: r.dni,
          month,
          amount: r.amount,
          totalCost: r.totalCost,
          employerPart: r.employerPart,
          employeePart: r.employeePart,
          sourceFile: input.filename,
          importedBy: input.userId ?? null
        }
      });
      imported++;
    }
  }

  await audit({
    userId: input.userId ?? null, entity: "SsPayment", entityId: "bulk",
    action: "CREATE", field: "import",
    newValue: {
      filename: input.filename, month, source: "watcher",
      imported, updated, skipped
    }
  });

  return {
    ok: true,
    summary: { totalRows: rows.length, imported, updated, skipped },
    skipped: skippedDetail,
    month, headerRow, detectedColumns, warnings
  };
}
