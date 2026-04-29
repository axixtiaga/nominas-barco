import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import { ok, fail, handle } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { importPdf } from "@/lib/services/import-document";
import { audit } from "@/lib/audit";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole(["ADMIN", "OPERATOR"]);
    const expense = await prisma.expense.findUnique({
      where: { id: params.id },
      include: { document: true }
    });
    if (!expense) return fail(404, "Gasto no encontrado");

    const doc = expense.document;
    // Borra expense + documento previos
    await prisma.expense.delete({ where: { id: expense.id } });
    await prisma.document.delete({ where: { id: doc.id } });

    const buf = await fs.readFile(doc.storagePath);
    const res = await importPdf({
      filename: doc.filename,
      buffer: buf,
      uploaderId: s.sub,
      kind: "GASTO",
      originalPath: doc.originalPath ?? null,
      source: "reparse"
    });
    await audit({ userId: s.sub, entity: "Expense", entityId: (res as any).expenseId ?? res.document.id, action: "REPARSE", newValue: { previousDoc: doc.id, previousExpense: expense.id } });
    return ok(res);
  } catch (e) { return handle(e); }
}
