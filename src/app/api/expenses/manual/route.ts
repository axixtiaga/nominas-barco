import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { mastersRepo } from "@/lib/repositories/masters";
import crypto from "node:crypto";

/**
 * POST /api/expenses/manual
 *   Crea un gasto introducido a mano (sin subir PDF). Genera un Document
 *   "ficticio" + Expense + opcionalmente líneas de detalle, todo en una
 *   misma transacción. El documento queda en estado DRAFT para que el
 *   usuario pueda validarlo desde la pantalla de Revisar, igual que un
 *   gasto importado.
 *
 *   Body:
 *   {
 *     filename?: string,                    // descripción corta del gasto (opcional)
 *     expenseNumber?: string,
 *     issueDate?: string (ISO yyyy-mm-dd),
 *     serviceDate?: string (ISO),
 *     supplierName?: string,
 *     supplierTaxId?: string,
 *     portName?: string,                    // resuelve a Port por nombre o código
 *     concept?: string,
 *     category?: "COFRADIA"|"COMBUSTIBLE"|"HIELO"|...
 *     baseAmount: number,
 *     vatRate?: number,                     // p.ej. 10
 *     vatAmount?: number,
 *     totalAmount: number,
 *     currency?: string,                    // EUR por defecto
 *     notes?: string,
 *     lines?: Array<{
 *       description: string,
 *       quantity?: number,
 *       unitPrice?: number,
 *       amount: number,
 *       includeInMontemayor?: boolean,
 *       notes?: string
 *     }>
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const body = await req.json();

    const totalAmount = Number(body?.totalAmount ?? 0);
    const baseAmount = Number(body?.baseAmount ?? 0);
    if (!Number.isFinite(totalAmount) || totalAmount < 0) return fail(400, "totalAmount inválido");
    if (!Number.isFinite(baseAmount) || baseAmount < 0)  return fail(400, "baseAmount inválido");

    // 1) Generar identificador único para el "documento" ficticio
    const now = new Date();
    const uniq = crypto.randomBytes(16).toString("hex");
    const fakeSha = `manual-${uniq}`;
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const baseFilename = (body?.filename as string)?.trim()
      || (body?.supplierName as string)?.trim()
      || (body?.concept as string)?.trim()
      || "Gasto manual";
    const cleanFilename = `${baseFilename.replace(/[\\\/]+/g, "-").slice(0, 80)} (${ts}).manual`;

    // 2) Resolver proveedor (crear si no existe)
    let supplierId: string | null = null;
    if (body.supplierName || body.supplierTaxId) {
      const sup = await mastersRepo.suppliers.findOrCreateByName(
        body.supplierName ?? body.supplierTaxId,
        body.supplierTaxId ?? null
      );
      supplierId = sup?.id ?? null;
    }

    // 3) Resolver puerto si lo indican
    let portId: string | null = null;
    if (body.portName) {
      const port = await prisma.port.findFirst({
        where: {
          OR: [
            { name: { equals: String(body.portName), mode: "insensitive" } },
            { code:  { equals: String(body.portName).toUpperCase().slice(0, 16) } }
          ]
        }
      });
      portId = port?.id ?? null;
    }

    // 4) Crear Document + Expense + Lines en una transacción
    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          filename: cleanFilename,
          storagePath: `[manual]/${uniq}`,
          mime: "application/x-manual",
          sha256: fakeSha,
          sizeBytes: 0,
          kind: "GASTO" as any,
          status: "DRAFT" as any,
          uploaderId: s.sub,
          rawText: null,
          rawParsed: { manual: true, createdBy: s.sub, createdAt: now.toISOString() }
        }
      });

      const expense = await tx.expense.create({
        data: {
          documentId: doc.id,
          expenseNumber: body.expenseNumber ?? null,
          issueDate: body.issueDate ? new Date(body.issueDate) : null,
          serviceDate: body.serviceDate ? new Date(body.serviceDate) : null,
          supplierId,
          portId,
          concept: body.concept ?? null,
          category: (body.category ?? "OTRO") as any,
          baseAmount,
          vatRate: Number(body.vatRate ?? 0),
          vatAmount: Number(body.vatAmount ?? 0),
          totalAmount,
          currency: body.currency ?? "EUR",
          notes: body.notes ?? null,
          status: "DRAFT" as any,
          lines: Array.isArray(body.lines) && body.lines.length > 0
            ? {
                create: body.lines.map((l: any, i: number) => ({
                  lineNo: i + 1,
                  description: String(l.description ?? "").trim(),
                  quantity: Number(l.quantity ?? 0),
                  unitPrice: Number(l.unitPrice ?? 0),
                  amount: Number(l.amount ?? 0),
                  includeInMontemayor: l.includeInMontemayor !== false,
                  notes: l.notes ?? null
                }))
              }
            : undefined
        }
      });

      return { doc, expense };
    });

    await audit({
      userId: s.sub, entity: "Expense", entityId: result.expense.id,
      action: "CREATE",
      newValue: {
        source: "manual", filename: cleanFilename,
        totalAmount, category: body.category, supplier: body.supplierName
      }
    });

    return ok({
      documentId: result.doc.id,
      expenseId: result.expense.id,
      filename: cleanFilename
    }, 201);
  } catch (e) { return handle(e); }
}
