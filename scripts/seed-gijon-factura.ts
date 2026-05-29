/**
 * Registra el formato GIJON_FACTURA en la base de datos para que el
 * clasificador llame al parser "gijon-factura" cuando reconoce ese formato.
 *
 * Para Lonja Gijón Musel hay TRES tipos distintos de PDF (mismo emisor):
 *   1. "LISTA DE COMPRAS"  → parser gijon-lonja      (captura)
 *   2. "FACTURA" + "Importe Subasta"  → parser gijon-factura (captura)  ← este
 *   3. "FACTURA" + "Total Suministros" → parser gijon-gastos  (gasto)
 *
 * Ejecutar UNA SOLA VEZ con:
 *   npm run seed:gijon-factura
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("── Seed de Gijón factura FP ─────────────────");

  // Reutilizamos el puerto Gijón ya existente del seed anterior.
  const port = await prisma.port.findUnique({ where: { code: "GIJON" } });
  if (!port) {
    console.error("❌ No se encuentra el puerto GIJON. Ejecuta antes 'npm run seed:gijon'.");
    process.exit(1);
  }
  console.log(`✓ Puerto: ${port.name} (${port.code})`);

  // Crear el DocumentFormat. Las "signatures" tienen que estar TODAS presentes
  // en el texto del PDF para que el clasificador escoja este formato.
  const format = await prisma.documentFormat.upsert({
    where: { code: "GIJON_FACTURA" },
    update: {
      name: "Gijón · Lonja Gijón Musel (factura de pesca FP)",
      portId: port.id,
      parserKey: "gijon-factura",
      active: true,
      config: {
        signatures: [
          "LONJA GIJÓN MUSEL",
          "Importe Subasta"
        ],
        defaultVatRate: 10
      }
    },
    create: {
      code: "GIJON_FACTURA",
      name: "Gijón · Lonja Gijón Musel (factura de pesca FP)",
      portId: port.id,
      parserKey: "gijon-factura",
      active: true,
      config: {
        signatures: [
          "LONJA GIJÓN MUSEL",
          "Importe Subasta"
        ],
        defaultVatRate: 10
      }
    }
  });
  console.log(`✓ DocumentFormat: ${format.name} (parserKey=${format.parserKey})`);

  console.log("─────────────────────────────────");
  console.log("✅ Listo. Ya puedes importar/reparsear facturas FP de Lonja Gijón.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
