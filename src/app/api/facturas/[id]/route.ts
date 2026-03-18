import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { invoiceSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;

  const item = await prisma.invoice.findUnique({
    where: { id },
    include: {
      port: true,
      supplier: true,
      boat: true,
      lines: { include: { species: true } },
      document: true,
    },
  });
  if (!item) return apiError("No encontrado", 404);
  return apiSuccess(item);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;

  const body = await req.json();
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message);

  const old = await prisma.invoice.findUnique({ where: { id } });
  if (!old) return apiError("No encontrado", 404);

  const { lines, ...invoiceData } = parsed.data;

  const updated = await prisma.$transaction// eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (tx: any) => {

    await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
    return (return tx.invoice.update({
```

Guarda con `Ctrl+S`. Luego en la terminal:
```
git add src/app/api/facturas
git commit -m "fix typescript transaction type"
git push origin master

      where: { id },
      data: {
        ...invoiceData,
        invoiceDate: new Date(invoiceData.invoiceDate),
        lines: { create: lines },
      },
      include: { lines: { include: { species: true } }, port: true, supplier: true, boat: true },
    });
  });

  await createAuditLog({ userId: session.id, action: "UPDATE", entity: "Invoice", entityId: id, oldValues: { totalAmount: old.totalAmount }, newValues: { totalAmount: updated.totalAmount } });
  return apiSuccess(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();
  const { id } = await params;

  const old = await prisma.invoice.findUnique({ where: { id } });
  if (!old) return apiError("No encontrado", 404);

  await prisma.invoice.delete({ where: { id } });
  await createAuditLog({ userId: session.id, action: "DELETE", entity: "Invoice", entityId: id });
  return apiSuccess({ ok: true });
}
