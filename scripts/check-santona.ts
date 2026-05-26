/**
 * Diagnóstico: muestra todas las facturas VERIFIED de Santoña y el total real
 * en la base de datos. Útil cuando el panel no se actualiza tras borrar.
 *
 * Ejecutar:
 *   npx tsx scripts/check-santona.ts
 *   o:  npm run check:santona
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const port = await prisma.port.findFirst({
    where: { OR: [{ name: { contains: "Santoña" } }, { code: "SANTONA" }] }
  });
  if (!port) {
    console.log("❌ No se encuentra el puerto de Santoña en la BD");
    return;
  }
  console.log(`Puerto: ${port.name} (code=${port.code}, id=${port.id})`);

  const invoices = await prisma.invoice.findMany({
    where: { portId: port.id, status: "VERIFIED" },
    select: {
      id: true, invoiceNumber: true, issueDate: true,
      subtotal: true, taxes: true, total: true,
      document: { select: { filename: true } }
    },
    orderBy: { issueDate: "asc" }
  });

  console.log(`\nFacturas VERIFIED en Santoña: ${invoices.length}`);
  console.log("─".repeat(110));
  let sumSubtotal = 0, sumTotal = 0;
  for (const inv of invoices) {
    const sub = Number(inv.subtotal ?? 0);
    const tot = Number(inv.total ?? 0);
    sumSubtotal += sub;
    sumTotal += tot;
    const fecha = inv.issueDate ? new Date(inv.issueDate).toISOString().slice(0, 10) : "(sin fecha)";
    const num = (inv.invoiceNumber ?? "—").padEnd(20, " ");
    const fname = (inv.document?.filename ?? "—").padEnd(40, " ");
    console.log(`${fecha}  ${num}  ${fname}  sub=${sub.toFixed(2).padStart(12)}  total=${tot.toFixed(2).padStart(12)}`);
  }
  console.log("─".repeat(110));
  console.log(`TOTAL subtotal (sin IVA): ${sumSubtotal.toFixed(2)} €`);
  console.log(`TOTAL con IVA:            ${sumTotal.toFixed(2)} €`);

  // ¿Hay facturas DRAFT que tal vez vea el usuario por error?
  const draftCount = await prisma.invoice.count({
    where: { portId: port.id, status: { not: "VERIFIED" } }
  });
  if (draftCount > 0) {
    console.log(`\n⚠ También hay ${draftCount} facturas DRAFT/otras (no cuentan en el panel).`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
