/**
 * Script de seed para el nuevo puerto San Vicente de la Barquera.
 *
 * Crea (o actualiza si ya existían):
 *   1. Puerto "San Vicente de la Barquera" en el maestro de Ports.
 *   2. PortTaxRate con un % por defecto (modificable luego desde
 *      Maestros → Impuestos por puerto). Por defecto 2,5%.
 *   3. DocumentFormat para el parser "sanvicente-cofradia" — sin esto el
 *      clasificador no usa el parser nuevo aunque esté registrado en el código.
 *
 * Datos del emisor:
 *   CIF: G39024567
 *   Cofradía Pescadores de San Vicente
 *   Puerto Pesquero s/n, 39540 San Vicente de la Barquera (Cantabria)
 *   Tlfn.: 942711508
 *
 * Ejecutar UNA SOLA VEZ con:
 *   npx tsx scripts/seed-sanvicente.ts
 *   o:   npm run seed:sanvicente
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("── Seed de San Vicente de la Barquera ─────────────────");

  // 1) Puerto
  const port = await prisma.port.upsert({
    where: { code: "SANVICENTE" },
    update: { name: "San Vicente de la Barquera", province: "Cantabria", country: "ES" },
    create: { code: "SANVICENTE", name: "San Vicente de la Barquera", province: "Cantabria", country: "ES" }
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
    where: { code: "SANVICENTE_COFRADIA" },
    update: {
      name: "San Vicente de la Barquera · Cofradía Pescadores",
      portId: port.id,
      parserKey: "sanvicente-cofradia",
      active: true,
      config: {
        signatures: [
          "SAN VICENTE",
          "BARQUERA",
          "POLIZA PESCA SUBASTADA",
          "COFRADIA PESCADORES DE SAN VICENTE",
          "G39024567",
          "942711508"
        ],
        defaultVatRate: 10
      }
    },
    create: {
      code: "SANVICENTE_COFRADIA",
      name: "San Vicente de la Barquera · Cofradía Pescadores",
      portId: port.id,
      parserKey: "sanvicente-cofradia",
      active: true,
      config: {
        signatures: [
          "SAN VICENTE",
          "BARQUERA",
          "POLIZA PESCA SUBASTADA",
          "COFRADIA PESCADORES DE SAN VICENTE",
          "G39024567",
          "942711508"
        ],
        defaultVatRate: 10
      }
    }
  });
  console.log(`✓ DocumentFormat: ${format.name} (parserKey=${format.parserKey})`);

  console.log("─────────────────────────────────");
  console.log("✅ Listo. Ya puedes importar PDFs de la Cofradía de San Vicente.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
