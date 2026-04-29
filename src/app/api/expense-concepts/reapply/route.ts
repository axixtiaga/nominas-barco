import { NextRequest } from "next/server";
import { ok, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { applyExpenseConceptRules } from "@/lib/services/apply-expense-concepts";

/**
 * POST /api/expense-concepts/reapply
 *   Reaplica las reglas de "Conceptos de gasto" sobre todos los Expense ya importados.
 *   Útil cuando el usuario añade reglas nuevas y quiere que afecten a los gastos
 *   ya cargados (sin tener que reimportar los PDFs).
 *
 *   Solo modifica:
 *     - Expense.category y Expense.concept de la cabecera (si una regla casa).
 *     - ExpenseLine.description (si una regla casa con la descripción de la línea
 *       o con el proveedor): se sustituye por el "concepto bonito" de la regla y
 *       se guarda la descripción original en notes para trazabilidad.
 *
 *   NO toca importes, fechas, IRPF, ni asignaciones a manta.
 */
export async function POST(_req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);

    const expenses = await prisma.expense.findMany({
      include: {
        supplier: true,
        lines: { orderBy: { lineNo: "asc" } }
      }
    });

    let touchedExpenses = 0;
    let touchedLines = 0;

    for (const exp of expenses) {
      const apply = await applyExpenseConceptRules({
        category: exp.category as unknown as string,
        concept: exp.concept,
        supplierName: exp.supplier?.name ?? null,
        lines: exp.lines.map(l => ({ description: l.description }))
      });

      // ¿Cambia la cabecera?
      const newCategory = apply.category as any;
      const newConcept = apply.concept ?? null;
      const headerChanged =
        (newCategory && newCategory !== exp.category) ||
        (newConcept !== null && newConcept !== exp.concept);

      if (headerChanged) {
        await prisma.expense.update({
          where: { id: exp.id },
          data: {
            ...(newCategory && newCategory !== exp.category ? { category: newCategory } : {}),
            ...(newConcept !== null && newConcept !== exp.concept ? { concept: newConcept } : {})
          }
        });
        touchedExpenses++;
      }

      // ¿Cambia alguna línea?
      for (let i = 0; i < exp.lines.length; i++) {
        const orig = exp.lines[i];
        const ruleHit = apply.perLine[i];
        if (!ruleHit?.ruleConcept) continue;
        if (ruleHit.ruleConcept === orig.description) continue;
        const traceNote = orig.notes && orig.notes.startsWith("[regla]")
          ? `[regla] ${ruleHit.ruleConcept} | original: ${orig.description}`
          : `[regla] ${ruleHit.ruleConcept} | original: ${orig.description}`;
        await prisma.expenseLine.update({
          where: { id: orig.id },
          data: { description: ruleHit.ruleConcept, notes: traceNote }
        });
        touchedLines++;
      }
    }

    await audit({
      userId: s.sub, entity: "Expense", entityId: "bulk",
      action: "UPDATE",
      newValue: { reapplyExpenseConcepts: true, touchedExpenses, touchedLines, scanned: expenses.length }
    });

    return ok({ scanned: expenses.length, touchedExpenses, touchedLines });
  } catch (e) { return handle(e); }
}
