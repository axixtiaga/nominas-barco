/**
 * Crea/actualiza la tabla PortTaxRate con los % de impuesto por puerto que usa
 * Itsas Lagunak para calcular el subtotal del montemayor.
 *
 * Si el puerto no existe en la tabla Port, lo crea (con código basado en su nombre).
 * Si ya hay un PortTaxRate para ese puerto, actualiza el rate (idempotente).
 *
 * Uso:
 *   npx tsx scripts/seed-port-tax-rates.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

type Row = { name: string; rate: number; province?: string };

// Tabla pasada por Asier:
const RATES: Row[] = [
  { name: "Ondarroa",                    rate: 3.0,  province: "Bizkaia" },
  { name: "Santoña",                     rate: 2.5,  province: "Cantabria" },
  { name: "Bermeo",                      rate: 3.5,  province: "Bizkaia" },
  { name: "Getaria",                     rate: 2.5,  province: "Gipuzkoa" },
  { name: "Laredo",                      rate: 3.0,  province: "Cantabria" },
  { name: "Gijón",                       rate: 3.5,  province: "Asturias" },
  { name: "Avilés",                      rate: 3.0,  province: "Asturias" },
  { name: "A Coruña",                    rate: 4.0,  province: "A Coruña" },
  { name: "Pasaia",                      rate: 3.0,  province: "Gipuzkoa" },
  { name: "Burela",                      rate: 3.0,  province: "Lugo" },
  { name: "Camariñas",                   rate: 3.5,  province: "A Coruña" },
  { name: "Cillero",                     rate: 3.0,  province: "Lugo" },
  { name: "Colindres",                   rate: 3.5,  province: "Cantabria" },
  { name: "Comillas",                    rate: 3.5,  province: "Cantabria" },
  { name: "Lastres",                     rate: 4.5,  province: "Asturias" },
  { name: "Ribeira",                     rate: 4.0,  province: "A Coruña" },
  { name: "San Vicente de la Barquera",  rate: 3.5,  province: "Cantabria" },
  { name: "Santander",                   rate: 3.0,  province: "Cantabria" },
  // Hondarribia es el puerto base — IVA 0% (no se aplica % de descarga, solo el cofradía Hondarribia + federación + opegui)
  { name: "Hondarribia",                 rate: 0.0,  province: "Gipuzkoa" }
];

function makeCode(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, "_").slice(0, 16);
}

async function main() {
  console.log(`── Seed PortTaxRate ──────────────────────`);
  console.log(`Puertos a sembrar/actualizar: ${RATES.length}`);
  console.log(`──────────────────────────────────────────`);

  let created = 0, updated = 0;

  for (const r of RATES) {
    // Buscar puerto por nombre (case-insensitive)
    let port = await prisma.port.findFirst({
      where: { name: { equals: r.name, mode: "insensitive" } }
    });

    if (!port) {
      port = await prisma.port.create({
        data: {
          code: makeCode(r.name),
          name: r.name,
          province: r.province ?? null,
          country: "ES"
        }
      });
      console.log(`  + Puerto creado:    ${r.name.padEnd(32)}  (code=${port.code})`);
    }

    // Upsert tax rate
    const existing = await prisma.portTaxRate.findUnique({ where: { portId: port.id } });
    if (existing) {
      await prisma.portTaxRate.update({
        where: { portId: port.id },
        data: { rate: r.rate, active: true }
      });
      console.log(`  ↻ Actualizado:     ${r.name.padEnd(32)}  ${r.rate.toFixed(2).padStart(5)} %`);
      updated++;
    } else {
      await prisma.portTaxRate.create({
        data: { portId: port.id, rate: r.rate, active: true }
      });
      console.log(`  ✓ Creado tax rate: ${r.name.padEnd(32)}  ${r.rate.toFixed(2).padStart(5)} %`);
      created++;
    }
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Tax rates creados:     ${created}`);
  console.log(`Tax rates actualizados: ${updated}`);
  console.log(`──────────────────────────────────────────`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
