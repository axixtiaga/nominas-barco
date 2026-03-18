import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireWrite } from "@/lib/auth";
import { apiSuccess, apiError, apiUnauthorized } from "@/lib/utils";
import { parseDocument } from "@/lib/parsers/invoice-parser";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = process.env.UPLOAD_DIR 
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "uploads");
  
export async function POST(req: NextRequest) {
  const session = await requireWrite(req).catch(() => null);
  if (!session) return apiUnauthorized();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return apiError("No se recibió ningún archivo");

    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_SIZE) return apiError("Archivo demasiado grande (máx. 20MB)");

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

    await mkdir(UPLOAD_DIR, { recursive: true });
    const storagePath = path.join(UPLOAD_DIR, filename);
    await writeFile(storagePath, buffer);

    // Parse the document
    const parsedData = await parseDocument(buffer, file.type || "application/octet-stream");

    // Save document record
    const doc = await prisma.document.create({
      data: {
        filename,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizBytes: file.size,
        storagePath,
        status: parsedData.parseConfidence > 0.4 ? "PROCESADO" : "PENDIENTE",
        extractedData: parsedData as object,
        uploadedById: session.id,
      },
    });

    return apiSuccess({ document: doc, parsed: parsedData }, 201);
  } catch (err) {
    console.error("Upload error:", err);
    return apiError("Error al procesar el archivo");
  }
}
