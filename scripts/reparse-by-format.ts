/**
 * Re-parsea en bloque las facturas DRAFT (capturas) y/o gastos DRAFT.
 *
 * Por seguridad, NO toca registros VERIFIED ni REJECTED — solo DRAFT —
 * para no perder ediciones manuales del usuario.
 *
 * Uso:
 *   npx tsx scripts/reparse-by-format.ts                    # re-parsea TODO lo que sea DRAFT (capturas y gastos)
 *   npx tsx scripts/reparse-by-format.ts capturas           # solo capturas DRAFT
 *   npx tsx scripts/reparse-by-format.ts gastos             # solo gastos DRAFT
 *   npx tsx scripts/reparse-by-format.ts santona-delpuerto  # solo capturas con ese parserKey
 */
import "dotenv/config";
import fs from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { importPdf } from "../src/lib/services/import-document";
import { DocumentStatus } from "@prisma/client";

const CAPTURA_PARSER_KEYS = [
  "santona-delpuerto",
  "laredo-sanmartin",
  "ondarroa-kalaredeuna",
  "getaria-elkano",
  "hondarribia-sanpedro",
  "bermeo-sanpedro"
];

async function main() {
  const argv = process.argv.slice(2).map(a => a.toLowerCase());

  let doCapturas = true;
  let doGastos = true;
  let parserKeysFilter: string[] | null = null;

  if (argv.includes("capturas")) { doGastos = false; }
  else if (argv.includes("gastos")) { doCapturas = false; }
  else if (argv.length > 0) {
    // Lista explícita de parserKeys (todos para CAPTURAS)
    parserKeysFilter = argv;
    doGastos = false;
  }

  console.log(`── Re-parseo masivo ──────────────────────`);
  console.log(`Capturas: ${doCapturas ? (parserKeysFilter ?? CAPTURA_PARSER_KEYS).join(", ") : "no"}`);
  console.log(`Gastos:   ${doGastos ? "sí (todos los DRAFT)" : "no"}`);
  console.log(`Solo afecta a registros en estado DRAFT.`);
  console.log(`──────────────────────────────────────────`);

  let okCount = 0, skipCount = 0, failCount = 0;

  // 1) CAPTURAS
  if (doCapturas) {
    const docs = await prisma.document.findMany({
      where: {
        kind: "CAPTURA",
        format: { parserKey: { in: parserKeysFilter ?? CAPTURA_PARSER_KEYS } },
        invoice: { status: DocumentStatus.DRAFT }
      },
      include: { invoice: { select: { invoiceNumber: true } }, format: { select: { parserKey: true } } },
      orderBy: { createdAt: "asc" }
    });
    console.log(`\nDocumentos CAPTURA candidatos: ${docs.length}\n`);
    for (const doc of docs) {
      const label = `[${doc.format?.parserKey}] ${doc.invoice?.invoiceNumber ?? "(sin nº)"} — ${doc.filename}`;
      try {
        const buf = await fs.readFile(doc.storagePath).catch(() => null);
        if (!buf) { console.log(`  ✗ ${label}  →  PDF no localizable`); skipCount++; continue; }
        await prisma.$transaction([
          prisma.invoice.deleteMany({ where: { documentId: doc.id } }),
          prisma.document.delete({ where: { id: doc.id } })
        ]);
        const res = await importPdf({
          filename: doc.filename, buffer: buf, uploaderId: null,
          kind: "CAPTURA",
          originalPath: doc.originalPath ?? null, source: "reparse-bulk-cli"
        });
        console.log(`  ✓ ${label}  →  nuevo doc ${res.document.id}`);
        okCount++;
      } catch (e) {
        console.log(`  ✗ ${label}  →  ${e instanceof Error ? e.message : String(e)}`);
        failCount++;
      }
    }
  }

  // 2) GASTOS
  if (doGastos) {
    const docs = await prisma.document.findMany({
      where: { kind: "GASTO", expense: { status: DocumentStatus.DRAFT } },
      include: { expense: { select: { expenseNumber: true, supplier: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" }
    });
    console.log(`\nDocumentos GASTO candidatos: ${docs.length}\n`);
    for (const doc of docs) {
      const label = `[gasto] ${doc.expense?.expenseNumber ?? "(sin nº)"} ${doc.expense?.supplier?.name ?? ""} — ${doc.filename}`;
      try {
        const buf = await fs.readFile(doc.storagePath).catch(() => null);
        if (!buf) { console.log(`  ✗ ${label}  →  PDF no localizable`); skipCount++; continue; }
        await prisma.$transaction([
          prisma.expense.deleteMany({ where: { documentId: doc.id } }),
          prisma.document.delete({ where: { id: doc.id } })
        ]);
        const res = await importPdf({
          filename: doc.filename, buffer: buf, uploaderId: null,
          kind: "GASTO",
          originalPath: doc.originalPath ?? null, source: "reparse-bulk-cli"
        });
        console.log(`  ✓ ${label}  →  nuevo doc ${res.document.id}`);
        okCount++;
      } catch (e) {
        console.log(`  ✗ ${label}  →  ${e instanceof Error ? e.message : String(e)}`);
        failCount++;
      }
    }
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Re-parseados OK: ${okCount}`);
  console.log(`Saltados (PDF no localizable): ${skipCount}`);
  console.log(`Fallidos: ${failCount}`);
  console.log(`──────────────────────────────────────────`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
