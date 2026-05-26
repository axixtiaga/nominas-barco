/**
 * Script de seed para el nuevo puerto Avilés (Nueva Rula de Avilés, S.A.).
 *
 * Crea (o actualiza si ya existían):
 *   1. Puerto "Avilés" en el maestro de Ports.
 *   2. PortTaxRate por defecto (2,5%, ajustable luego desde la app).
 *   3. DocumentFormat para el parser "aviles-rula" — sin esto el clasificador
 *      no usa el parser nuevo aunque esté registrado en el código.
 *
 * Datos del emisor:
 *   CIF: A74242512
 *   NUEVA RULA DE AVILES, S.A.
 *   Avda. Conde de Guadalhorce s/n, 33400 Avilés (Asturias)
 *   Tlf.: 985 56 44 33
 *
 * Ejecutar UNA SOLA VEZ con:
 *   npm run seed:aviles
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("── Seed de Avilés (Nueva Rula) ─────────────────");

  // 1) Puerto
  const port = await prisma.port.upsert({
    where: { code: "AVILES" },
    update: { name: "Avilés", province: "Asturias", country: "ES" },
    create: { code: "AVILES", name: "Avilés", province: "Asturias", country: "ES" }
  });
  console.log(`✓ Puerto: ${port.name} (${port.code}) id=${port.id}`);

  // 2) PortTaxRate por defecto (2,5%, ajustable desde la app)
  const taxRate = await prisma.portTaxRate.upsert({
    where: { portId: port.id },
    update: {},   // si ya existe, no lo tocamos
    create: { portId: port.id, rate: 2.5, notes: "Tasa por defecto, ajustar si es necesario", active: true }
  });
  console.log(`✓ PortTaxRate: ${Number(taxRate.rate)}% (id=${taxRate.id})`);

  // 3) DocumentFormat
  const format = await prisma.documentFormat.upsert({
    where: { code: "AVILES_RULA" },
    update: {
      name: "Avilés · Nueva Rula de Avilés",
      portId: port.id,
      parserKey: "aviles-rula",
      active: true,
      config: {
        signatures: [
          "NUEVA RULA DE AVILES",
          "RULA DE AVILES",
          "RULA DE AVILÉS",
          "A74242512",
          "ruladeaviles.es",
          "pescadodeconfianza",
          "33400 AVILES",
          "985 56 44 33"
        ],
        defaultVatRate: 10
      }
    },
    create: {
      code: "AVILES_RULA",
      name: "Avilés · Nueva Rula de Avilés",
      portId: port.id,
      parserKey: "aviles-rula",
      active: true,
      config: {
        signatures: [
          "NUEVA RULA DE AVILES",
          "RULA DE AVILES",
          "RULA DE AVILÉS",
          "A74242512",
          "ruladeaviles.es",
          "pescadodeconfianza",
          "33400 AVILES",
          "985 56 44 33"
        ],
        defaultVatRate: 10
      }
    }
  });
  console.log(`✓ DocumentFormat: ${format.name} (parserKey=${format.parserKey})`);

  console.log("─────────────────────────────────");
  console.log("✅ Listo. Ya puedes importar PDFs de la Rula de Avilés.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
