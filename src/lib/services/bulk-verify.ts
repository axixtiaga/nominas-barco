import { prisma } from "../prisma";
import { DocumentKind, DocumentStatus } from "@prisma/client";
import { audit } from "../audit";
import { moveToRevisado } from "./archive";

/**
 * Validación MASIVA de documentos pendientes.
 *
 * Recorre los documentos en estado DRAFT que pasen los filtros (tipo, año,
 * puerto) y, para CADA uno, comprueba que sus datos clave están completos. Si
 * pasan la comprobación los pone en VERIFIED (incluyendo Invoice/Expense). Si
 * NO pasan, los deja como están y reporta por qué se han omitido.
 *
 * Devuelve un resumen detallado para que el usuario sepa qué se ha verificado,
 * qué se ha omitido (con razones) y qué ha fallado.
 *
 * Soporta dryRun: con dryRun=true NO modifica nada, solo predice cuántos
 * pasarían el filtro (útil para mostrar un "vas a verificar N documentos,
 * ¿confirmas?" antes de aplicar).
 */

export type BulkVerifyFilters = {
  kind?: "CAPTURA" | "GASTO";
  year?: number;
  portId?: string;
  dryRun?: boolean;
};

export type BulkVerifyItem = { id: string; filename: string };
export type BulkVerifySkipped = BulkVerifyItem & { reasons: string[] };
export type BulkVerifyFailed = BulkVerifyItem & { error: string };

export type BulkVerifyResult = {
  total: number;
  verified: BulkVerifyItem[];
  skipped: BulkVerifySkipped[];
  failed: BulkVerifyFailed[];
  dryRun: boolean;
};

export async function bulkVerifyDocuments(
  filters: BulkVerifyFilters,
  userId: string
): Promise<BulkVerifyResult> {
  // Cargamos los DRAFT con todos los datos que necesitamos para validar.
  const docs = await prisma.document.findMany({
    where: {
      status: DocumentStatus.DRAFT,
      ...(filters.kind ? { kind: filters.kind as DocumentKind } : {})
    },
    include: {
      invoice: { include: { lines: true, port: true, supplier: true } },
      expense: { include: { lines: true, supplier: true, port: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  // Filtrado por año y puerto (sobre fecha del invoice/expense, sin SQL extra).
  const inScope = docs.filter(d => {
    const iso = d.invoice?.issueDate ?? d.expense?.issueDate;
    if (filters.year != null) {
      if (!iso) return false;
      if (new Date(iso).getFullYear() !== filters.year) return false;
    }
    if (filters.portId) {
      const pId = d.invoice?.portId ?? d.expense?.portId;
      if (pId !== filters.portId) return false;
    }
    return true;
  });

  const verified: BulkVerifyItem[] = [];
  const skipped: BulkVerifySkipped[] = [];
  const failed: BulkVerifyFailed[] = [];

  for (const d of inScope) {
    const reasons = validateDocForVerify(d);
    if (reasons.length > 0) {
      skipped.push({ id: d.id, filename: d.filename, reasons });
      continue;
    }
    if (filters.dryRun) {
      verified.push({ id: d.id, filename: d.filename });
      continue;
    }
    try {
      await applyVerification(d, userId);
      verified.push({ id: d.id, filename: d.filename });
    } catch (e: any) {
      failed.push({ id: d.id, filename: d.filename, error: e?.message ?? "Error" });
    }
  }

  return {
    total: inScope.length,
    verified, skipped, failed,
    dryRun: !!filters.dryRun
  };
}

/** Comprueba los datos imprescindibles de un documento para poder verificarlo. */
function validateDocForVerify(d: any): string[] {
  const reasons: string[] = [];
  if (d.parseError) reasons.push("El parser dejó un error sin resolver.");

  if (d.kind === "CAPTURA") {
    if (!d.invoice) { reasons.push("Sin factura asociada."); return reasons; }
    const inv = d.invoice;
    if (!inv.issueDate) reasons.push("Falta la fecha de la factura.");
    if (!inv.portId) reasons.push("Falta el puerto.");
    if (!inv.supplierId) reasons.push("Falta el proveedor.");
    if (!inv.lines || inv.lines.length === 0) reasons.push("Sin líneas de detalle.");
    if (inv.lines && inv.lines.length > 0) {
      for (let i = 0; i < inv.lines.length; i++) {
        const l = inv.lines[i];
        const ln = l.lineNo ?? i + 1;
        if (!l.rawSpeciesName || !String(l.rawSpeciesName).trim()) {
          reasons.push(`Línea ${ln}: sin nombre de especie.`);
        }
        const kilos = Number(l.kilos);
        const amount = Number(l.amount);
        if (!Number.isFinite(kilos) || kilos <= 0) reasons.push(`Línea ${ln}: kilos = 0.`);
        if (!Number.isFinite(amount) || amount <= 0) reasons.push(`Línea ${ln}: importe = 0.`);
      }
    }
    // Comprobación matemática: suma de líneas ≈ subtotal (tolerancia 1€).
    if (inv.lines?.length) {
      const sumLines = inv.lines.reduce((a: number, l: any) => a + Number(l.amount), 0);
      const subtotal = Number(inv.subtotal);
      if (Number.isFinite(subtotal) && Math.abs(sumLines - subtotal) > 1) {
        reasons.push(`Las líneas suman ${sumLines.toFixed(2)} € pero el subtotal indica ${subtotal.toFixed(2)} €.`);
      }
    }
  } else if (d.kind === "GASTO") {
    if (!d.expense) { reasons.push("Sin gasto asociado."); return reasons; }
    const exp = d.expense;
    if (!exp.issueDate) reasons.push("Falta la fecha.");
    if (!exp.supplierId) reasons.push("Falta el proveedor.");
    const tot = Number(exp.totalAmount ?? 0);
    const base = Number(exp.baseAmount ?? 0);
    if (tot <= 0 && base <= 0) reasons.push("Sin importe (base y total a 0).");
  } else {
    reasons.push(`Tipo de documento no soportado para verificación masiva: ${d.kind}.`);
  }

  return reasons;
}

/** Aplica la verificación: actualiza Invoice/Expense + Document + intenta archivar. */
async function applyVerification(d: any, userId: string): Promise<void> {
  const verifiedAt = new Date();

  await prisma.$transaction(async tx => {
    if (d.kind === "CAPTURA" && d.invoice) {
      await tx.invoice.update({
        where: { id: d.invoice.id },
        data: {
          status: DocumentStatus.VERIFIED,
          verifiedAt,
          verifiedById: userId
        }
      });
    } else if (d.kind === "GASTO" && d.expense) {
      await tx.expense.update({
        where: { id: d.expense.id },
        data: {
          status: DocumentStatus.VERIFIED,
          verifiedAt,
          verifiedById: userId
        }
      });
    }
    await tx.document.update({
      where: { id: d.id },
      data: { status: DocumentStatus.VERIFIED }
    });
  });

  const entity = d.kind === "CAPTURA" ? "Invoice" : "Expense";
  const entityId = d.invoice?.id ?? d.expense?.id ?? d.id;
  await audit({
    userId, entity, entityId, action: "VERIFY",
    newValue: { via: "bulk-verify", documentId: d.id }
  });

  // Archivar el PDF (mover a revisado/) si vino del watcher. Si falla NO
  // bloquea la verificación.
  if (d.originalPath) {
    try {
      const moved = await moveToRevisado(d.originalPath);
      if (moved) {
        await prisma.document.update({
          where: { id: d.id },
          data: { archivedPath: moved }
        });
      }
    } catch (e) {
      console.error("[bulk-verify] archive fallo para", d.filename, e);
    }
  }
}
