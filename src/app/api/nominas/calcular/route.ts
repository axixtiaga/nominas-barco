import { NextRequest } from "next/server";
import { requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { payrollRunSchema } from "@/lib/validations";
import { buildCalcInput, calculatePayroll } from "@/lib/calc-engine/payroll";
import { createAuditLog } from "@/lib/audit";
import prisma from "@/lib/db";
import { d } from "@/lib/decimal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();

  const body = await req.json();
  const parsed = payrollRunSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const { periodId, boatId, notes } = parsed.data;

  // Check period is open
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) return apiError("Período no encontrado", 404);
  if (period.status === "BLOQUEADO") return apiError("El período está bloqueado y no se puede recalcular");

  try {
    // Build inputs from DB
    const input = await buildCalcInput(periodId, boatId);

    // Run calculation engine
    const result = calculatePayroll(input);

    // Persist the payroll run in a transaction
    const run = await prisma.$transaction(async (tx: typeof prisma) => {
      // Delete previous draft run for same period+boat (allow recalculation)
      await tx.payrollRun.deleteMany({
        where: { periodId, boatId, status: "BORRADOR" },
      });

      const run = await tx.payrollRun.create({
        data: {
          periodId,
          boatId,
          runByUserId: session.id,
          status: "BORRADOR",
          totalCapturas: result.totalCapturas,
          monteMayor:    result.monteMayor,
          totalGastos:   result.totalGastos,
          baseRepartible:result.baseRepartible,
          ownerShare:    result.ownerShare,
          crewShare:     result.crewShare,
          totalBruto:    result.totalBruto,
          totalSS:       result.totalSsEmployee,
          totalIRPF:     result.totalIRPF,
          totalNeto:     result.totalNeto,
          rulesSnapshot: result.rulesApplied as object,
          inputSnapshot: input as object,
          notes: notes || null,
          items: {
            create: result.crewResults.map((cr) => ({
              crewMemberId:   cr.crewMemberId,
              baseParts:      cr.baseParts,
              brutoPescador:  cr.brutoPescador,
              ssEmployee:     cr.ssEmployee,
              ssEmployer:     cr.ssEmployer,
              irpfPercent:    cr.irpfPercent,
              irpfAmount:     cr.irpfAmount,
              otherDeductions:cr.otherDeductions,
              netoPescador:   cr.netoPescador,
              calculationDetail: cr.detail as object,
            })),
          },
        },
        include: {
          items: { include: { crewMember: { include: { category: true } } } },
          period: true,
          boat:   true,
        },
      });

      return run;
    });

    await createAuditLog({
      userId: session.id,
      action: "CALCULATE",
      entity: "PayrollRun",
      entityId: run.id,
      newValues: { periodId, boatId, totalNeto: result.totalNeto, warnings: result.warnings },
    });

    return apiSuccess({ run, warnings: result.warnings }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error en el cálculo";
    return apiError(msg, 422);
  }
}
