import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { documentsRepo } from "@/lib/repositories/documents";
import { requireSession } from "@/lib/session";
import { importPdf } from "@/lib/services/import-document";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const kind = req.nextUrl.searchParams.get("kind") ?? undefined;
    return ok(await documentsRepo.list({ status, kind }));
  } catch (e) { return handle(e); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(400, "Archivo requerido en campo 'file'");
    if (file.type && file.type !== "application/pdf") return fail(400, "Solo PDFs");

    const buf = Buffer.from(await file.arrayBuffer());
    const result = await importPdf({ filename: file.name, buffer: buf, uploaderId: s.sub });
    return ok(result, 201);
  } catch (e) { return handle(e); }
}
