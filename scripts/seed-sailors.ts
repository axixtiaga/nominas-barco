/**
 * Carga inicial de la tripulación de Itsas Lagunak desde el Excel "Marineros y partes".
 *
 * Es idempotente: si un marinero ya existe (por DNI), actualiza sus campos.
 * Si no tiene DNI (armadores y patrón), busca por nombre (case-insensitive).
 *
 * Uso:
 *   npx tsx scripts/seed-sailors.ts
 *     o
 *   npm run seed:sailors
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

type SailorSeed = {
  dni: string | null;
  name: string;
  role: "MARINERO" | "ARMADOR" | "PATRON";
  cotizacionType: string | null;
  parts: number;
  irpfRate: number;
};

const SAILORS: SailorSeed[] = [
  // 13 marineros con DNI
  { dni: "15258271W", name: "RAFAEL CARLOS ORTIZ MOREDA",      role: "MARINERO", cotizacionType: "TECNICO",   parts: 1.00, irpfRate: 23 },
  { dni: "15259941Q", name: "GORKA MARQUES ARESTIN",           role: "MARINERO", cotizacionType: "TECNICO",   parts: 1.00, irpfRate: 23 },
  { dni: "34095962A", name: "JOSE MANUEL FRANCO ARGIBAY",      role: "MARINERO", cotizacionType: "TECNICO",   parts: 1.00, irpfRate: 23 },
  { dni: "15250372S", name: "SANTIAGO VAZQUEZ ALONSO",         role: "MARINERO", cotizacionType: "TECNICO",   parts: 1.00, irpfRate: 23 },
  { dni: "44550692Z", name: "IKER CHAPARTEGUI AROCENA",        role: "MARINERO", cotizacionType: "TECNICO",   parts: 1.00, irpfRate: 23 },
  { dni: "78915246S", name: "JAVIER PEREZ MORENO",             role: "MARINERO", cotizacionType: "MARINERO",  parts: 1.00, irpfRate: 23 },
  { dni: "44570809Y", name: "BITTOR LARRARTE VICENTE",         role: "MARINERO", cotizacionType: "MARINERO",  parts: 1.00, irpfRate: 23 },
  { dni: "44574893L", name: "RUBEN ALBURQUEQUE MOGOLLON",      role: "MARINERO", cotizacionType: "MARINERO",  parts: 1.00, irpfRate: 23 },
  { dni: "49576253Y", name: "BEÑAT YARZA ISUSKIZA",            role: "MARINERO", cotizacionType: "MARINERO",  parts: 1.00, irpfRate: 23 },
  { dni: "51282173Q", name: "LUAR AMUNARRIZ IRIDOY",           role: "MARINERO", cotizacionType: "MARINERO",  parts: 1.00, irpfRate: 23 },
  { dni: "72836288A", name: "ENEKO BASTERRETXEA LLOVES",       role: "MARINERO", cotizacionType: "MARINERO",  parts: 1.00, irpfRate: 23 },
  { dni: "Y4368550J", name: "ROBERT EMANUEL ALB",              role: "MARINERO", cotizacionType: "MARINERO",  parts: 1.00, irpfRate: 23 },
  { dni: "15078079K", name: "MIKEL ZABALA ANASAGASTI",         role: "MARINERO", cotizacionType: "MARINERO",  parts: 1.00, irpfRate: 23 },

  // Armadores (sin DNI explícito en el Excel)
  { dni: null, name: "PABLO ETXEBESTE LARRUSKAIN",   role: "ARMADOR", cotizacionType: null, parts: 1.22, irpfRate: 0 },
  { dni: null, name: "OSCAR ETXEBESTE LARRUSCAIN",   role: "ARMADOR", cotizacionType: null, parts: 1.22, irpfRate: 0 },

  // Patrón (sin DNI explícito en el Excel)
  { dni: null, name: "BEÑARDO SISTIAGA SEGURADO",    role: "PATRON",  cotizacionType: null, parts: 1.56, irpfRate: 0 }
];

async function main() {
  console.log(`── Seed Sailors ──────────────────────────────`);
  console.log(`Marineros/armadores a sembrar: ${SAILORS.length}`);
  console.log(`──────────────────────────────────────────────`);

  let created = 0, updated = 0;

  for (const s of SAILORS) {
    let existing = null;
    if (s.dni) {
      existing = await prisma.sailor.findUnique({ where: { dni: s.dni } });
    } else {
      existing = await prisma.sailor.findFirst({ where: { name: { equals: s.name, mode: "insensitive" } } });
    }

    const data = {
      dni: s.dni,
      name: s.name,
      role: s.role,
      cotizacionType: s.cotizacionType,
      parts: s.parts,
      irpfRate: s.irpfRate,
      active: true
    };

    if (existing) {
      await prisma.sailor.update({ where: { id: existing.id }, data });
      console.log(`  ↻ Actualizado: ${s.name.padEnd(38)}  ${s.role.padEnd(9)} partes=${s.parts.toFixed(2).padStart(5)}  IRPF=${s.irpfRate}%`);
      updated++;
    } else {
      await prisma.sailor.create({ data });
      console.log(`  ✓ Creado:      ${s.name.padEnd(38)}  ${s.role.padEnd(9)} partes=${s.parts.toFixed(2).padStart(5)}  IRPF=${s.irpfRate}%`);
      created++;
    }
  }

  const total = SAILORS.reduce((a, s) => a + s.parts, 0);
  console.log(`\n──────────────────────────────────────────────`);
  console.log(`Marineros creados:     ${created}`);
  console.log(`Marineros actualizados: ${updated}`);
  console.log(`Σ partes activas:      ${total.toFixed(2)}`);
  console.log(`──────────────────────────────────────────────`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
