import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { mastersRepo } from "@/lib/repositories/masters";
import { moveToRevisado } from "@/lib/services/archive";
import { DocumentStatus } from "@prisma/client";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireRole(["ADMIN", "OPERATOR", "VIEWER"]);
    const expense = await prisma.expense.findUnique({
      where: { id: params.id },
      include: {
        document: true,
        supplier: true,
        port: true,
        invoice: { select: { id: true, invoiceNumber: true, issueDate: true, port: { select: { name: true } } } },
        lines: {
          orderBy: { lineNo: "asc" },
          include: { linkedInvoice: { select: { id: true, invoiceNumber: true, issueDate: true, port: { select: { name: true } } } } }
        }
      }
    });
    if (!expense) return fail(404, "Gasto no encontrado");
    return ok(expense);
  } catch (e) { return handle(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();

    // Acepta cambios parciales sobre los campos editables del gasto.
    // El cliente puede mandar supplierName + supplierTaxId para crear/actualizar el proveedor.
    let supplierId: string | null | undefined = body.supplierId;
    if (body.supplierName) {
      const sup = await mastersRepo.suppliers.findOrCreateByName(body.supplierName, body.supplierTaxId ?? null);
      supplierId = sup?.id ?? null;
    }

    const data: any = {};
    if (body.expenseNumber !== undefined) data.expenseNumber = body.expenseNumber;
    if (body.issueDate !== undefined)     data.issueDate = body.issueDate ? new Date(body.issueDate) : null;
    if (body.serviceDate !== undefined)   data.serviceDate = body.serviceDate ? new Date(body.serviceDate) : null;
    if (supplierId !== undefined)         data.supplierId = supplierId;
    if (body.portId !== undefined)        data.portId = body.portId || null;
    if (body.invoiceId !== undefined)     data.invoiceId = body.invoiceId || null;
    if (body.manta !== undefined)         data.manta = body.manta || null;
    if (body.concept !== undefined)       data.concept = body.concept;
    if (body.category !== undefined)      data.category = body.category;
    if (body.baseAmount !== undefined)    data.baseAmount = body.baseAmount;
    if (body.vatRate !== undefined)       data.vatRate = body.vatRate;
    if (body.vatAmount !== undefined)     data.vatAmount = body.vatAmount;
    if (body.totalAmount !== undefined)   data.totalAmount = body.totalAmount;
    if (body.notes !== undefined)         data.notes = body.notes;

    // Si se manda verify=true, marcar como VERIFIED
    if (body.verify === true) {
      data.status = DocumentStatus.VERIFIED;
      data.verifiedAt = new Date();
      data.verifiedById = s.sub;
    } else if (body.verify === false) {
      data.status = DocumentStatus.DRAFT;
      data.verifiedAt = null;
      data.verifiedById = null;
    }

    const expense = await prisma.expense.update({ where: { id: params.id }, data });

    // Si se mandan líneas, reemplaza el set entero (delete-then-create) para mantener
    // simplicidad y trazabilidad (el cliente envía la versión final completa).
    if (Array.isArray(body.lines)) {
      await prisma.expenseLine.deleteMany({ where: { expenseId: expense.id } });
      if (body.lines.length > 0) {
        await prisma.expenseLine.createMany({
          data: body.lines.map((l: any, i: number) => ({
            expenseId: expense.id,
            lineNo: l.lineNo ?? i + 1,
            lineDate: l.lineDate ? new Date(l.lineDate) : null,
            conceptCode: l.conceptCode ?? null,
            description: l.description ?? "",
            reference: l.reference ?? null,
            quantity: Number(l.quantity) || 0,
            unitPrice: Number(l.unitPrice) || 0,
            amount: Number(l.amount) || 0,
            includeInMontemayor: l.includeInMontemayor !== false,
            linkedInvoiceId: l.linkedInvoiceId || null,
            manta: l.manta || null,
            notes: l.notes ?? null
          }))
        });
      }
    }

    // Sincroniza también el estado del Document
    if (data.status) {
      await prisma.document.update({ where: { id: expense.documentId }, data: { status: data.status } });
    }

    // Al verificar, mover el PDF original a la subcarpeta "revisado/" del Dropbox
    // (lo mismo que se hace para Capturas). El fallo al mover NO bloquea la verificación.
    let archiveResult: { moved: boolean; destination?: string | null; reason?: string } = { moved: false };
    if (body.verify === true) {
      try {
        const doc = await prisma.document.findUnique({ where: { id: expense.documentId } });
        if (!doc?.originalPath) {
          archiveResult = { moved: false, reason: "El documento no tiene ruta original (importación manual)." };
        } else {
          const moved = await moveToRevisado(doc.originalPath);
          if (moved) {
            await prisma.document.update({ where: { id: doc.id }, data: { archivedPath: moved } });
            await audit({
              userId: s.sub, entity: "Document", entityId: doc.id, action: "UPDATE",
              field: "archivedPath", oldValue: null, newValue: moved
            });
            archiveResult = { moved: true, destination: moved };
          } else {
            archiveResult = { moved: false, reason: "No se pudo mover (archivo ausente o ya archivado)." };
          }
        }
      } catch (e: any) {
        console.error("[archive] No se pudo mover el PDF de gasto a revisado/:", e);
        archiveResult = { moved: false, reason: e?.message ?? "Error moviendo el fichero." };
      }
    }

    await audit({ userId: s.sub, entity: "Expense", entityId: expense.id, action: "UPDATE", newValue: data });
    return ok({ ...expense, archive: archiveResult });
  } catch (e) { return handle(e); }
}
