/**
 * Diagnóstico de los documentos que hay en la base de datos LOCAL.
 * Muestra totales por año, tipo y estado, para entender qué hay y qué falta.
 *
 * Ejecutar:
 *   npm run check:docs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("── Estado de los documentos en BASE DE DATOS LOCAL ─────────");

  const total = await prisma.document.count();
  console.log(`Total de documentos en la BD: ${total}`);
  console.log("");

  // Por estado
  const byStatus = await prisma.document.groupBy({
    by: ["status"],
    _count: { _all: true }
  });
  console.log("Por estado:");
  for (const r of byStatus) console.log(`  ${r.status.padEnd(10)} ${r._count._all}`);
  console.log("");

  // Por tipo
  const byKind = await prisma.document.groupBy({
    by: ["kind"],
    _count: { _all: true }
  });
  console.log("Por tipo:");
  for (const r of byKind) console.log(`  ${r.kind.padEnd(10)} ${r._count._all}`);
  console.log("");

  // Por año (de issueDate del invoice/expense)
  const invByYear: any[] = await prisma.$queryRawUnsafe(`
    SELECT EXTRACT(YEAR FROM "issueDate")::int AS year, status,
           COUNT(*)::int AS n
    FROM "Invoice"
    WHERE "issueDate" IS NOT NULL
    GROUP BY year, status
    ORDER BY year DESC, status
  `);
  console.log("Facturas (CAPTURAS) por año + estado:");
  for (const r of invByYear) console.log(`  ${r.year}   ${String(r.status).padEnd(10)} ${r.n}`);
  console.log("");

  const expByYear: any[] = await prisma.$queryRawUnsafe(`
    SELECT EXTRACT(YEAR FROM "issueDate")::int AS year, status,
           COUNT(*)::int AS n
    FROM "Expense"
    WHERE "issueDate" IS NOT NULL
    GROUP BY year, status
    ORDER BY year DESC, status
  `);
  console.log("Gastos por año + estado:");
  for (const r of expByYear) console.log(`  ${r.year}   ${String(r.status).padEnd(10)} ${r.n}`);
  console.log("");

  // Algunos documentos verificados de muestra (los 5 más recientes)
  const sampleVerified = await prisma.document.findMany({
    where: { status: "VERIFIED" },
    take: 5,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, filename: true, kind: true, status: true,
      invoice: { select: { issueDate: true, invoiceNumber: true, total: true, port: { select: { name: true } } } },
      expense: { select: { issueDate: true, expenseNumber: true, totalAmount: true } }
    }
  });
  console.log("Últimos 5 documentos VERIFICADOS (si los hay):");
  if (!sampleVerified.length) console.log("  (ninguno)");
  for (const d of sampleVerified) {
    const inv = d.invoice;
    const exp = d.expense;
    if (inv) {
      const fecha = inv.issueDate ? new Date(inv.issueDate).toISOString().slice(0, 10) : "?";
      console.log(`  [${d.kind}] ${d.filename} | ${inv.invoiceNumber ?? "?"} | ${fecha} | ${inv.port?.name ?? "?"} | ${Number(inv.total ?? 0).toFixed(2)} €`);
    } else if (exp) {
      const fecha = exp.issueDate ? new Date(exp.issueDate).toISOString().slice(0, 10) : "?";
      console.log(`  [${d.kind}] ${d.filename} | ${exp.expenseNumber ?? "?"} | ${fecha} | ${Number(exp.totalAmount ?? 0).toFixed(2)} €`);
    }
  }
  console.log("─────────────────────────────────────────────────────────");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
