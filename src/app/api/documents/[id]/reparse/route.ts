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
    const doc = await prisma.document.findUnique({ where: { id: params.id } });
    if (!doc) return fail(404, "Documento no encontrado");

    // Borramos la invoice previa para reimportar en limpio
    await prisma.invoice.deleteMany({ where: { documentId: doc.id } });
    await prisma.document.delete({ where: { id: doc.id } });

    const buf = await fs.readFile(doc.storagePath);
    // Preserva la ruta original del Dropbox si el documento venía del watcher,
    // para que al verificar pueda archivarse en la subcarpeta "revisado/".
    const res = await importPdf({
      filename: doc.filename,
      buffer: buf,
      uploaderId: s.sub,
      originalPath: doc.originalPath ?? null,
      source: "reparse"
    });
    await audit({ userId: s.sub, entity: "Document", entityId: res.document.id, action: "REPARSE", newValue: { previous: doc.id } });
    return ok(res);
  } catch (e) { return handle(e); }
}
