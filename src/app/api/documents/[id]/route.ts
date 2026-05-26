import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { documentsRepo } from "@/lib/repositories/documents";
import { requireSession, requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const doc = await documentsRepo.get(params.id);
    if (!doc) return fail(404, "Documento no encontrado");
    return ok(doc);
  } catch (e) { return handle(e); }
}

/**
 * DELETE /api/documents/[id]
 *   Borra un documento y sus datos derivados (Invoice + InvoiceLines, o Expense + ExpenseLines).
 *   Si las líneas de captura están enlazadas a NominaDay, primero hay que desvincular o
 *   borrar esas asignaciones (la cascada de Prisma se encarga de InvoiceLine → Invoice).
 *
 *   Sólo ADMIN/OPERATOR. Devuelve 409 si el documento está VERIFIED y forma parte de
 *   una manta validada (para evitar borrar nóminas ya cerradas accidentalmente).
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const force = req.nextUrl.searchParams.get("force") === "true";

    const doc = await prisma.document.findUnique({
      where: { id: params.id },
      include: {
        invoice: { include: { lines: { select: { id: true } } } },
        expense: { include: { lines: { select: { id: true } } } }
      }
    });
    if (!doc) return fail(404, "Documento no encontrado");

    // Comprobación de seguridad: ¿hay líneas asignadas a una manta VALIDADA?
    if (!force && doc.invoice) {
      // Buscar NominaDays cuyas fechas+puerto coincidan con líneas de esta factura
      // y que tengan manta asignada Y validada.
      const lineDates = await prisma.invoiceLine.findMany({
        where: { invoiceId: doc.invoice.id },
        select: { lineDate: true }
      });
      const datesUTC = Array.from(new Set(
        lineDates
          .map(l => l.lineDate ? new Date(l.lineDate).toISOString().slice(0, 10) : null)
          .filter(Boolean) as string[]
      ));
      if (datesUTC.length > 0 && doc.invoice.portId) {
        const nominaDays = await prisma.nominaDay.findMany({
          where: {
            portId: doc.invoice.portId,
            manta: { not: null },
            date: { in: datesUTC.map(d => new Date(d + "T00:00:00.000Z")) }
          },
          select: { manta: true }
        });
        const mantaIds = Array.from(new Set(nominaDays.map(nd => nd.manta!).filter(Boolean)));
        if (mantaIds.length > 0) {
          const validatedMantas = await prisma.mantaInfo.findMany({
            where: { manta: { in: mantaIds }, validatedAt: { not: null } },
            select: { manta: true }
          });
          if (validatedMantas.length > 0) {
            return fail(
              409,
              `No se puede borrar: las líneas están en mantas YA VALIDADAS (${validatedMantas.map(v => v.manta).join(", ")}). ` +
              `Desvalida las mantas afectadas primero, o llama al endpoint con ?force=true.`
            );
          }
        }
      }
    }

    // Borrado en cascada: Document tiene relaciones con Invoice y Expense que a su vez
    // tienen líneas. Las cascadas declaradas en el schema deberían ocuparse, pero por
    // seguridad lo hacemos explícito.
    await prisma.$transaction(async (tx) => {
      if (doc.invoice) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: doc.invoice.id } });
        await tx.invoice.delete({ where: { id: doc.invoice.id } });
      }
      if (doc.expense) {
        await tx.expenseLine.deleteMany({ where: { expenseId: doc.expense.id } });
        await tx.expense.delete({ where: { id: doc.expense.id } });
      }
      await tx.document.delete({ where: { id: doc.id } });
    });

    await audit({
      userId: s.sub, entity: "Document", entityId: params.id,
      action: "DELETE",
      newValue: { filename: doc.filename, kind: doc.kind, force }
    });
    return ok({ deleted: true });
  } catch (e: any) {
    if (e?.code === "P2025") return fail(404, "No existe");
    return handle(e);
  }
}
