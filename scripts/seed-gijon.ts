/**
 * Script de seed para el nuevo puerto Gijón.
 *
 * Crea (o actualiza si ya existían):
 *   1. Puerto "Gijón" en el maestro de Ports.
 *   2. PortTaxRate para Gijón con un % por defecto (modificable luego desde
 *      Maestros → Impuestos por puerto). Por defecto 2,5% como Santoña.
 *   3. DocumentFormat para el parser "gijon-lonja" — sin esto el clasificador
 *      no usa el parser nuevo aunque esté registrado en el código.
 *
 * Ejecutar UNA SOLA VEZ con:
 *   npx tsx scripts/seed-gijon.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("── Seed de Gijón ─────────────────");

  // 1) Puerto
  const port = await prisma.port.upsert({
    where: { code: "GIJON" },
    update: { name: "Gijón", province: "Asturias", country: "ES" },
    create: { code: "GIJON", name: "Gijón", province: "Asturias", country: "ES" }
  });
  console.log(`✓ Puerto: ${port.name} (${port.code}) id=${port.id}`);

  // 2) PortTaxRate por defecto (2,5%, ajustable desde la app después)
  const taxRate = await prisma.portTaxRate.upsert({
    where: { portId: port.id },
    update: {},   // si ya existe, no lo tocamos para no pisar el valor del usuario
    create: { portId: port.id, rate: 2.5, notes: "Tasa por defecto, ajustar si es necesario", active: true }
  });
  console.log(`✓ PortTaxRate: ${Number(taxRate.rate)}% (id=${taxRate.id})`);

  // 3) DocumentFormat
  const format = await prisma.documentFormat.upsert({
    where: { code: "GIJON_LONJA" },
    update: {
      name: "Gijón · Lonja Gijón Musel",
      portId: port.id,
      parserKey: "gijon-lonja",
      active: true,
      config: {
        signatures: ["LONJA GIJÓN", "LONJA GIJON", "EL MUSEL", "A33831934", "RENDIELLO"],
        defaultVatRate: 0
      }
    },
    create: {
      code: "GIJON_LONJA",
      name: "Gijón · Lonja Gijón Musel",
      portId: port.id,
      parserKey: "gijon-lonja",
      active: true,
      config: {
        signatures: ["LONJA GIJÓN", "LONJA GIJON", "EL MUSEL", "A33831934", "RENDIELLO"],
        defaultVatRate: 0
      }
    }
  });
  console.log(`✓ DocumentFormat: ${format.name} (parserKey=${format.parserKey})`);

  console.log("─────────────────────────────────");
  console.log("✅ Listo. Ya puedes importar PDFs de Lonja Gijón.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
