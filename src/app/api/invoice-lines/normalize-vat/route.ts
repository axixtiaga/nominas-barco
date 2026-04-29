import { ok, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

/**
 * Recalcula IVA al 10% en TODAS las líneas de factura existentes.
 * También actualiza el campo `taxes` de cada invoice para que refleje
 * la suma de vatAmount de sus líneas. Idempotente.
 */
export async function POST() {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);

    // 1) Fija vatRate = 10 y vatAmount = amount * 0.10 en cada línea.
    const updateLines = await prisma.$executeRawUnsafe(`
      UPDATE "InvoiceLine"
         SET "vatRate" = 10,
             "vatAmount" = ROUND("amount" * 0.10, 2)
    `);

    // 2) Recalcula el campo taxes de cada factura como SUM(vatAmount de sus líneas).
    const updateInvoices = await prisma.$executeRawUnsafe(`
      UPDATE "Invoice" i
         SET "taxes" = COALESCE(sums.t, 0)
        FROM (
          SELECT "invoiceId", SUM("vatAmount") AS t
            FROM "InvoiceLine"
           GROUP BY "invoiceId"
        ) sums
       WHERE sums."invoiceId" = i.id
    `);

    await audit({
      userId: s.sub, entity: "InvoiceLine", entityId: "bulk-vat",
      action: "UPDATE", field: "vatRate",
      newValue: { rate: 10, linesTouched: Number(updateLines), invoicesTouched: Number(updateInvoices) }
    });

    return ok({ linesUpdated: Number(updateLines), invoicesUpdated: Number(updateInvoices) });
  } catch (e) { return handle(e); }
}
