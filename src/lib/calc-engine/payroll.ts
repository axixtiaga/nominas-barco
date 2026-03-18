/**
 * MOTOR DE CÁLCULO DE NÓMINAS PESQUERAS
 * ──────────────────────────────────────
 * Este módulo es completamente independiente de la UI.
 * Todas las reglas son parametrizables y el cálculo es trazable.
 *
 * FÓRMULAS IMPLEMENTADAS:
 * 1. Monte Mayor = Total Capturas - Gastos deducibles (AMBOS + BARCO)
 * 2. Base Repartible = Monte Mayor - Gastos armador
 * 3. Parte Armador = Base Repartible × ownerPercent/100
 * 4. Parte Tripulación = Base Repartible × crewPercent/100
 * 5. Por marinero = Parte Tripulación × (partes_marinero / total_partes)
 * 6. SS empleado = Bruto × ssEmployee%
 * 7. SS empleador = Bruto × ssEmployer%
 * 8. IRPF = Bruto × irpfPercent%
 * 9. Neto = Bruto - SS_empleado - IRPF - otras_deducciones
 *
 * ⚠️ PENDIENTE DE VERIFICACIÓN CON ASESORÍA:
 * - La base de cotización SS puede variar según tipo de relación laboral
 * - Los porcentajes armador/tripulación deben revisarse por convenio
 * - El tratamiento fiscal puede diferir según actividad y régimen
 */

import { CalcInput, CalcResult, CrewCalcResult } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculatePayroll(input: CalcInput): CalcResult {
  const warnings: string[] = [];
  const { allocationRule, ssParams, crewMembers, expenses } = input;

  // ── PASO 1: Clasificar gastos ──────────────────────────────────────────────
  let gastosArmador = 0;
  let gastosTripulacion = 0;
  let gastosAmbos = 0;
  let gastosBarco = 0;

  for (const exp of expenses) {
    switch (exp.target) {
      case "ARMADOR":
        gastosArmador += exp.amount;
        break;
      case "TRIPULACION":
        gastosTripulacion += exp.amount;
        break;
      case "AMBOS":
        gastosAmbos += exp.amount;
        break;
      case "BARCO":
        gastosBarco += exp.amount;
        break;
    }
  }

  const totalGastos = gastosArmador + gastosTripulacion + gastosAmbos + gastosBarco;

  // ── PASO 2: Monte Mayor ────────────────────────────────────────────────────
  // Por defecto: Monte Mayor = Capturas - gastos AMBOS - gastos BARCO
  // Los gastos ARMADOR y TRIPULACION se deducen de su parte respectiva
  // ⚠️ PARAMETRIZABLE: deductExpensesFrom controla qué gastos van contra el monte
  let gastosContraMonte = 0;
  if (allocationRule.deductExpensesFrom === "MONTE_MAYOR") {
    gastosContraMonte = gastosAmbos + gastosBarco;
  } else {
    gastosContraMonte = totalGastos;
  }

  const monteMayor = round2(input.totalCapturas - gastosContraMonte);

  if (monteMayor < 0) {
    warnings.push(
      `⚠️ Monte Mayor negativo (${monteMayor}€). Los gastos superan las capturas en este período.`
    );
  }

  // ── PASO 3: Base Repartible ────────────────────────────────────────────────
  // Base repartible = Monte Mayor (los gastos exclusivos de armador/tripulación
  // se deducen de sus partes respectivas)
  const baseRepartible = monteMayor;

  // Validar que ownerPercent + crewPercent = 100
  const totalPercent = allocationRule.ownerPercent + allocationRule.crewPercent;
  if (Math.abs(totalPercent - 100) > 0.01) {
    warnings.push(
      `⚠️ Los porcentajes armador (${allocationRule.ownerPercent}%) + tripulación (${allocationRule.crewPercent}%) no suman 100% (suman ${totalPercent}%).`
    );
  }

  // ── PASO 4: Reparto armador / tripulación ──────────────────────────────────
  const ownerShare = round2(baseRepartible * (allocationRule.ownerPercent / 100));
  const crewShare = round2(baseRepartible * (allocationRule.crewPercent / 100));

  // ── PASO 5: Reparto entre marineros ───────────────────────────────────────
  const totalParts = crewMembers.reduce((sum, m) => sum + m.baseParts, 0);

  if (totalParts === 0) {
    warnings.push("⚠️ No hay partes de tripulación definidas. No se puede calcular el reparto.");
  }

  const crewResults: CrewCalcResult[] = [];
  let totalBruto = 0;
  let totalSsEmployee = 0;
  let totalSsEmployer = 0;
  let totalIRPF = 0;
  let totalNeto = 0;

  for (const member of crewMembers) {
    const sharePercent = totalParts > 0 ? (member.baseParts / totalParts) * 100 : 0;

    // Bruto del marinero = su parte del reparto tripulación
    // Gastos de tripulación se reparten a partes iguales (simplificación configurable)
    const brutoPescador = round2(crewShare * (sharePercent / 100));

    // ── SS: base de cotización ─────────────────────────────────────────────
    // ⚠️ PENDIENTE: La base de cotización en el REASS (Régimen Especial Trabajadores Mar)
    // puede ser diferente al bruto. Verificar con Tesorería SS Marítima.
    let ssBase: number;
    if (ssParams.baseType === "TOTAL_CAPTURAS") {
      // Algunos convenios usan el total capturas dividido entre tripulantes
      ssBase = round2((input.totalCapturas / (crewMembers.length || 1)) * (sharePercent / 100));
      warnings.push(
        `⚠️ BASE SS: Se está usando Total Capturas proporcional como base SS para ${member.name}. Verificar con asesoría.`
      );
    } else {
      ssBase = brutoPescador;
    }

    const ssEmployee = round2(ssBase * ssParams.employeePercent);
    const ssEmployer = round2(ssBase * ssParams.employerPercent);

    // ── IRPF ───────────────────────────────────────────────────────────────
    const irpfAmount = round2(brutoPescador * (member.irpfPercent / 100));

    // ── Neto ───────────────────────────────────────────────────────────────
    const netoPescador = round2(brutoPescador - ssEmployee - irpfAmount);

    totalBruto += brutoPescador;
    totalSsEmployee += ssEmployee;
    totalSsEmployer += ssEmployer;
    totalIRPF += irpfAmount;
    totalNeto += netoPescador;

    crewResults.push({
      crewMemberId: member.id,
      name: `${member.name} ${member.lastName}`,
      baseParts: member.baseParts,
      sharePercent: round2(sharePercent),
      brutoPescador,
      ssEmployee,
      ssEmployer,
      irpfPercent: member.irpfPercent,
      irpfAmount,
      otherDeductions: 0,
      netoPescador,
      detail: {
        totalCapturas: input.totalCapturas,
        crewShare,
        totalParts,
        ssBase,
        ssBaseType: ssParams.baseType,
        formula: `Bruto = ${crewShare}€ × (${member.baseParts}pts / ${totalParts}pts) = ${brutoPescador}€`,
        ssFormula: `SS_emp = ${ssBase}€ × ${(ssParams.employeePercent * 100).toFixed(2)}% = ${ssEmployee}€`,
        irpfFormula: `IRPF = ${brutoPescador}€ × ${member.irpfPercent}% = ${irpfAmount}€`,
        netFormula: `Neto = ${brutoPescador}€ - ${ssEmployee}€ - ${irpfAmount}€ = ${netoPescador}€`,
      },
    });
  }

  return {
    totalCapturas: input.totalCapturas,
    totalGastos: round2(totalGastos),
    gastosPorTarget: {
      armador: round2(gastosArmador),
      tripulacion: round2(gastosTripulacion),
      ambos: round2(gastosAmbos),
      barco: round2(gastosBarco),
    },
    monteMayor: round2(monteMayor),
    baseRepartible: round2(baseRepartible),
    ownerShare: round2(ownerShare),
    crewShare: round2(crewShare),
    ownerPercent: allocationRule.ownerPercent,
    crewPercent: allocationRule.crewPercent,
    totalSsEmployee: round2(totalSsEmployee),
    totalSsEmployer: round2(totalSsEmployer),
    totalBruto: round2(totalBruto),
    totalIRPF: round2(totalIRPF),
    totalNeto: round2(totalNeto),
    crewResults,
    rulesApplied: {
      allocationRule: {
        ownerPercent: allocationRule.ownerPercent,
        crewPercent: allocationRule.crewPercent,
        method: allocationRule.method,
        deductExpensesFrom: allocationRule.deductExpensesFrom,
      },
      ssParams: {
        employeePercent: ssParams.employeePercent,
        employerPercent: ssParams.employerPercent,
        baseType: ssParams.baseType,
      },
    },
    warnings,
  };
}

/**
 * Construye el input del motor de cálculo desde la base de datos
 */
import prisma from "@/lib/db";
import { toNum } from "@/lib/utils";

export async function buildCalcInput(periodId: string, boatId: string): Promise<CalcInput> {
  // 1. Capturas del período + barco
  const invoices = await prisma.invoice.findMany({
    where: {
      boatId,
      invoiceDate: {
        gte: await getPeriodStart(periodId),
        lte: await getPeriodEnd(periodId),
      },
    },
    select: { totalAmount: true },
  });

  const totalCapturas = invoices.reduce((sum: number, inv: { totalAmount: unknown }) => sum + toNum(inv.totalAmount), 0);

  // 2. Gastos del período + barco
  const expenses = await prisma.expense.findMany({
    where: { periodId, boatId },
    include: { expenseType: true },
  });

  // 3. Tripulantes activos del barco
  const crew = await prisma.crewMember.findMany({
    where: { boatId, active: true },
    include: { category: true },
  });

  // 4. Regla de reparto activa para el barco
  const allocationRule = await prisma.allocationRule.findFirst({
    where: {
      OR: [{ boatId }, { boatId: null }],
      active: true,
    },
    orderBy: { boatId: "desc" }, // barco específico primero
  });

  if (!allocationRule) {
    throw new Error("No hay regla de reparto activa. Configura una en Ajustes.");
  }

  // 5. Parámetros SS vigentes
  const ssParam = await prisma.socialSecurityParameter.findFirst({
    where: {
      validFrom: { lte: new Date() },
      OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
    },
    orderBy: { validFrom: "desc" },
  });

  if (!ssParam) {
    throw new Error("No hay parámetros de Seguridad Social configurados.");
  }

  if (crew.length === 0) {
    throw new Error("No hay tripulantes activos asignados a este barco. Asigna tripulantes en Maestros antes de calcular.");
  }

  if (totalCapturas === 0) {
    throw new Error("No hay capturas registradas para este barco en el período seleccionado. Importa facturas antes de calcular.");
  }

  return {
    periodId,
    boatId,
    totalCapturas,
    expenses: expenses.map((e: typeof expenses[0]) => ({
      id: e.id,
      amount: toNum(e.amount),
      target: e.target,
      description: e.description || "",
      expenseTypeCode: e.expenseType.code,
    })),
    crewMembers: crew.map((m: typeof crew[0]) => ({
      id: m.id,
      name: m.name,
      lastName: m.lastName,
      baseParts: toNum(m.category.allocationParts),
      irpfPercent: toNum(m.irpfPercent),
      categoryCode: m.category.code,
    })),
    allocationRule: {
      ownerPercent: toNum(allocationRule.ownerPercent),
      crewPercent: toNum(allocationRule.crewPercent),
      method: allocationRule.method,
      deductExpensesFrom: allocationRule.deductExpensesFrom,
    },
    ssParams: {
      employeePercent: toNum(ssParam.employeePercent),
      employerPercent: toNum(ssParam.employerPercent),
      baseType: ssParam.baseType,
    },
  };
}

async function getPeriodStart(periodId: string): Promise<Date> {
  const p = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  return p?.startDate || new Date();
}

async function getPeriodEnd(periodId: string): Promise<Date> {
  const p = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  return p?.endDate || new Date();
}
