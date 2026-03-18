import { PrismaClient } from "@prisma/client";
import { UserRole, ExpenseTarget, AllocationMethod } from "../src/lib/types";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── USUARIOS ──────────────────────────────────────────────────────────────
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@nominas-barco.com" },
    update: {},
    create: {
      email: "admin@nominas-barco.com",
      name: "Administrador",
      passwordHash: await bcrypt.hash("admin1234", 10),
      role: UserRole.ADMIN,
    },
  });

  const oficinaUser = await prisma.user.upsert({
    where: { email: "oficina@nominas-barco.com" },
    update: {},
    create: {
      email: "oficina@nominas-barco.com",
      name: "María García",
      passwordHash: await bcrypt.hash("oficina1234", 10),
      role: UserRole.OFICINA,
    },
  });

  console.log("✅ Usuarios creados");

  // ── PUERTOS ───────────────────────────────────────────────────────────────
  const puertos = await Promise.all([
    prisma.port.upsert({
      where: { code: "VIG" },
      update: {},
      create: { name: "Vigo", code: "VIG", province: "Pontevedra" },
    }),
    prisma.port.upsert({
      where: { code: "COR" },
      update: {},
      create: { name: "A Coruña", code: "COR", province: "A Coruña" },
    }),
    prisma.port.upsert({
      where: { code: "MAR" },
      update: {},
      create: { name: "Marín", code: "MAR", province: "Pontevedra" },
    }),
    prisma.port.upsert({
      where: { code: "BUR" },
      update: {},
      create: { name: "Burela", code: "BUR", province: "Lugo" },
    }),
  ]);

  console.log("✅ Puertos creados");

  // ── BARCOS ────────────────────────────────────────────────────────────────
  const barcos = await Promise.all([
    prisma.boat.upsert({
      where: { registration: "3VIG-1-23-01" },
      update: {},
      create: {
        name: "Mar de Fisterra",
        registration: "3VIG-1-23-01",
        flag: "España",
        boatType: "Arrastre",
        tonGt: 142.5,
      },
    }),
    prisma.boat.upsert({
      where: { registration: "3VIG-1-18-05" },
      update: {},
      create: {
        name: "Santa María del Mar",
        registration: "3VIG-1-18-05",
        flag: "España",
        boatType: "Palangre",
        tonGt: 89.3,
      },
    }),
  ]);

  console.log("✅ Barcos creados");

  // ── PROVEEDORES / LONJAS ──────────────────────────────────────────────────
  const proveedores = await Promise.all([
    prisma.supplier.upsert({
      where: { taxId: "A36123456" },
      update: {},
      create: {
        name: "Lonja de Vigo S.A.",
        taxId: "A36123456",
        portId: puertos[0].id,
      },
    }),
    prisma.supplier.upsert({
      where: { taxId: "A15987654" },
      update: {},
      create: {
        name: "Mercado de A Coruña",
        taxId: "A15987654",
        portId: puertos[1].id,
      },
    }),
  ]);

  console.log("✅ Proveedores creados");

  // ── ESPECIES ──────────────────────────────────────────────────────────────
  const especies = await Promise.all([
    prisma.species.upsert({
      where: { code: "MER" },
      update: {},
      create: { name: "Merluza", scientificName: "Merluccius merluccius", code: "MER", category: "Demersal" },
    }),
    prisma.species.upsert({
      where: { code: "RAP" },
      update: {},
      create: { name: "Rape", scientificName: "Lophius piscatorius", code: "RAP", category: "Demersal" },
    }),
    prisma.species.upsert({
      where: { code: "CIG" },
      update: {},
      create: { name: "Cigala", scientificName: "Nephrops norvegicus", code: "CIG", category: "Crustáceo" },
    }),
    prisma.species.upsert({
      where: { code: "GAL" },
      update: {},
      create: { name: "Gallo", scientificName: "Lepidorhombus whiffiagonis", code: "GAL", category: "Demersal" },
    }),
    prisma.species.upsert({
      where: { code: "PUL" },
      update: {},
      create: { name: "Pulpo", scientificName: "Octopus vulgaris", code: "PUL", category: "Cefalópodo" },
    }),
  ]);

  console.log("✅ Especies creadas");

  // ── CATEGORÍAS DE TRIPULANTES ─────────────────────────────────────────────
  const categorias = await Promise.all([
    prisma.crewCategory.upsert({
      where: { code: "PATRON" },
      update: {},
      create: {
        name: "Patrón de Pesca",
        code: "PATRON",
        allocationParts: 2.0,
        socialSecurityGroup: "Grupo I",
        notes: "2 partes completas en el reparto",
      },
    }),
    prisma.crewCategory.upsert({
      where: { code: "MAQUINISTA" },
      update: {},
      create: {
        name: "Maquinista",
        code: "MAQUINISTA",
        allocationParts: 1.5,
        socialSecurityGroup: "Grupo II",
        notes: "1.5 partes en el reparto",
      },
    }),
    prisma.crewCategory.upsert({
      where: { code: "MARINERO" },
      update: {},
      create: {
        name: "Marinero",
        code: "MARINERO",
        allocationParts: 1.0,
        socialSecurityGroup: "Grupo III",
        notes: "1 parte completa en el reparto",
      },
    }),
    prisma.crewCategory.upsert({
      where: { code: "PEON" },
      update: {},
      create: {
        name: "Peón",
        code: "PEON",
        allocationParts: 0.75,
        socialSecurityGroup: "Grupo IV",
        notes: "0.75 partes en el reparto",
      },
    }),
  ]);

  console.log("✅ Categorías de tripulantes creadas");

  // ── TRIPULANTES ───────────────────────────────────────────────────────────
  const tripulantes = await Promise.all([
    prisma.crewMember.upsert({
      where: { taxId: "36123456A" },
      update: {},
      create: {
        name: "José",
        lastName: "Fernández López",
        taxId: "36123456A",
        categoryId: categorias[0].id,
        boatId: barcos[0].id,
        irpfPercent: 15,
        joinDate: new Date("2015-03-01"),
      },
    }),
    prisma.crewMember.upsert({
      where: { taxId: "36234567B" },
      update: {},
      create: {
        name: "Manuel",
        lastName: "González Pérez",
        taxId: "36234567B",
        categoryId: categorias[1].id,
        boatId: barcos[0].id,
        irpfPercent: 12,
        joinDate: new Date("2018-06-15"),
      },
    }),
    prisma.crewMember.upsert({
      where: { taxId: "36345678C" },
      update: {},
      create: {
        name: "Antonio",
        lastName: "Martínez Silva",
        taxId: "36345678C",
        categoryId: categorias[2].id,
        boatId: barcos[0].id,
        irpfPercent: 9,
        joinDate: new Date("2020-01-10"),
      },
    }),
    prisma.crewMember.upsert({
      where: { taxId: "36456789D" },
      update: {},
      create: {
        name: "Carlos",
        lastName: "Rodríguez Vázquez",
        taxId: "36456789D",
        categoryId: categorias[2].id,
        boatId: barcos[0].id,
        irpfPercent: 9,
        joinDate: new Date("2021-09-01"),
      },
    }),
    prisma.crewMember.upsert({
      where: { taxId: "36567890E" },
      update: {},
      create: {
        name: "Francisco",
        lastName: "López Díaz",
        taxId: "36567890E",
        categoryId: categorias[3].id,
        boatId: barcos[0].id,
        irpfPercent: 7,
        joinDate: new Date("2022-11-15"),
      },
    }),
  ]);

  console.log("✅ Tripulantes creados");

  // ── TIPOS DE GASTO ────────────────────────────────────────────────────────
  const tiposGasto = await Promise.all([
    prisma.expenseType.upsert({
      where: { code: "SS" },
      update: {},
      create: { name: "Seguridad Social", code: "SS", target: ExpenseTarget.AMBOS },
    }),
    prisma.expenseType.upsert({
      where: { code: "COMBUSTIBLE" },
      update: {},
      create: { name: "Combustible / Gasoil", code: "COMBUSTIBLE", target: ExpenseTarget.BARCO },
    }),
    prisma.expenseType.upsert({
      where: { code: "HIELO" },
      update: {},
      create: { name: "Hielo", code: "HIELO", target: ExpenseTarget.BARCO },
    }),
    prisma.expenseType.upsert({
      where: { code: "VIVERES" },
      update: {},
      create: { name: "Víveres", code: "VIVERES", target: ExpenseTarget.AMBOS },
    }),
    prisma.expenseType.upsert({
      where: { code: "PUERTO" },
      update: {},
      create: { name: "Tasas Puerto", code: "PUERTO", target: ExpenseTarget.ARMADOR },
    }),
    prisma.expenseType.upsert({
      where: { code: "MANTENIMIENTO" },
      update: {},
      create: { name: "Mantenimiento / Reparaciones", code: "MANTENIMIENTO", target: ExpenseTarget.ARMADOR },
    }),
    prisma.expenseType.upsert({
      where: { code: "COMISIONES" },
      update: {},
      create: { name: "Comisiones Lonja", code: "COMISIONES", target: ExpenseTarget.AMBOS },
    }),
    prisma.expenseType.upsert({
      where: { code: "OTROS" },
      update: {},
      create: { name: "Otros Gastos", code: "OTROS", target: ExpenseTarget.AMBOS },
    }),
  ]);

  console.log("✅ Tipos de gasto creados");

  // ── REGLAS DE REPARTO ─────────────────────────────────────────────────────
  await prisma.allocationRule.upsert({
    where: { id: "default-allocation-rule" },
    update: {},
    create: {
      id: "default-allocation-rule",
      name: "Reparto Estándar Arrastre",
      boatId: barcos[0].id,
      ownerPercent: 50,
      crewPercent: 50,
      method: AllocationMethod.PORCENTAJE_FIJO,
      deductExpensesFrom: "MONTE_MAYOR",
      notes:
        "⚠️ PENDIENTE DE PARAMETRIZAR: Los porcentajes armador/tripulación deben revisarse según el convenio colectivo aplicable. El 50/50 es un valor de ejemplo.",
    },
  });

  console.log("✅ Reglas de reparto creadas");

  // ── PARÁMETROS SS ─────────────────────────────────────────────────────────
  await prisma.socialSecurityParameter.upsert({
    where: { code: "MARITIMA_GENERAL" },
    update: {},
    create: {
      code: "MARITIMA_GENERAL",
      name: "SS Marítima General",
      employeePercent: 0.064,
      employerPercent: 0.236,
      baseType: "TOTAL_CAPTURAS",
      description:
        "⚠️ PENDIENTE: Verificar tasas actuales con la Tesorería General de la Seguridad Social Marítima. Los porcentajes indicados son orientativos.",
      validFrom: new Date("2024-01-01"),
    },
  });

  console.log("✅ Parámetros SS creados");

  // ── PARÁMETROS FISCALES ───────────────────────────────────────────────────
  await prisma.taxParameter.upsert({
    where: { code: "IRPF_MIN_PESCA" },
    update: {},
    create: {
      code: "IRPF_MIN_PESCA",
      name: "IRPF mínimo sector pesca",
      value: 2,
      description:
        "⚠️ PENDIENTE: Confirmar retención mínima IRPF aplicable al sector pesquero en Galicia. Verificar con asesoría fiscal.",
      validFrom: new Date("2024-01-01"),
    },
  });

  console.log("✅ Parámetros fiscales creados");

  // ── PERÍODOS ──────────────────────────────────────────────────────────────
  const periodo = await prisma.payrollPeriod.upsert({
    where: { id: "periodo-oct-2024" },
    update: {},
    create: {
      id: "periodo-oct-2024",
      name: "Octubre 2024",
      startDate: new Date("2024-10-01"),
      endDate: new Date("2024-10-31"),
    },
  });

  const periodo2 = await prisma.payrollPeriod.upsert({
    where: { id: "periodo-nov-2024" },
    update: {},
    create: {
      id: "periodo-nov-2024",
      name: "Noviembre 2024",
      startDate: new Date("2024-11-01"),
      endDate: new Date("2024-11-30"),
    },
  });

  console.log("✅ Períodos creados");

  // ── FACTURAS DE EJEMPLO ───────────────────────────────────────────────────
  const factura1 = await prisma.invoice.create({
    data: {
      invoiceNumber: "LVG-2024-10-001",
      invoiceDate: new Date("2024-10-05"),
      portId: puertos[0].id,
      supplierId: proveedores[0].id,
      boatId: barcos[0].id,
      subtotal: 8520.0,
      taxAmount: 0,
      feesAmount: 85.2,
      totalAmount: 8434.8,
      reviewed: true,
      observations: "Primera marea de octubre",
      lines: {
        create: [
          {
            speciesId: especies[0].id,
            speciesName: "Merluza",
            kilos: 850.5,
            pricePerKilo: 6.8,
            lineAmount: 5783.4,
          },
          {
            speciesId: especies[1].id,
            speciesName: "Rape",
            kilos: 210.0,
            pricePerKilo: 8.5,
            lineAmount: 1785.0,
          },
          {
            speciesId: especies[3].id,
            speciesName: "Gallo",
            kilos: 125.0,
            pricePerKilo: 3.6,
            lineAmount: 450.0,
          },
        ],
      },
    },
  });

  const factura2 = await prisma.invoice.create({
    data: {
      invoiceNumber: "LVG-2024-10-002",
      invoiceDate: new Date("2024-10-14"),
      portId: puertos[0].id,
      supplierId: proveedores[0].id,
      boatId: barcos[0].id,
      subtotal: 11240.0,
      taxAmount: 0,
      feesAmount: 112.4,
      totalAmount: 11127.6,
      reviewed: true,
      observations: "Segunda marea de octubre",
      lines: {
        create: [
          {
            speciesId: especies[0].id,
            speciesName: "Merluza",
            kilos: 1200.0,
            pricePerKilo: 7.2,
            lineAmount: 8640.0,
          },
          {
            speciesId: especies[2].id,
            speciesName: "Cigala",
            kilos: 180.0,
            pricePerKilo: 14.0,
            lineAmount: 2520.0,
          },
        ],
      },
    },
  });

  console.log("✅ Facturas de ejemplo creadas");

  // ── GASTOS DE EJEMPLO ─────────────────────────────────────────────────────
  await prisma.expense.createMany({
    data: [
      {
        expenseTypeId: tiposGasto[1].id,
        periodId: periodo.id,
        boatId: barcos[0].id,
        amount: 2850.0,
        target: ExpenseTarget.BARCO,
        description: "Gasoil marea 1 y 2 octubre",
        date: new Date("2024-10-31"),
      },
      {
        expenseTypeId: tiposGasto[2].id,
        periodId: periodo.id,
        boatId: barcos[0].id,
        amount: 320.0,
        target: ExpenseTarget.BARCO,
        description: "Hielo mareas octubre",
        date: new Date("2024-10-31"),
      },
      {
        expenseTypeId: tiposGasto[3].id,
        periodId: periodo.id,
        boatId: barcos[0].id,
        amount: 280.0,
        target: ExpenseTarget.AMBOS,
        description: "Víveres tripulación octubre",
        date: new Date("2024-10-31"),
      },
      {
        expenseTypeId: tiposGasto[6].id,
        periodId: periodo.id,
        boatId: barcos[0].id,
        amount: 197.63,
        target: ExpenseTarget.AMBOS,
        description: "Comisión lonja Vigo 1%",
        date: new Date("2024-10-31"),
      },
    ],
  });

  console.log("✅ Gastos de ejemplo creados");
  console.log("\n🎉 Seed completado!");
  console.log("\n📋 CREDENCIALES:");
  console.log("   Admin:   admin@nominas-barco.com / admin1234");
  console.log("   Oficina: oficina@nominas-barco.com / oficina1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
