import { NextRequest } from "next/server";
import { ok, fail, handle } from "@/lib/http";
import { requireRole } from "@/lib/session";
import { importSsExcel } from "@/lib/services/import-ss-excel";

/**
 * POST /api/ss-payments/import
 *   Importa un Excel de Seguridad Social mensual.
 *   multipart/form-data con `file` (Excel) y `month` opcional (YYYY-MM).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(["ADMIN", "OPERATOR"]);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const monthHint = (formData.get("month") as string | null) ?? undefined;
    if (!file) return fail(400, "Falta el fichero (campo 'file')");

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name ?? "";

    const result = await importSsExcel({ buffer, filename, monthHint, userId: session.sub });
    if (!result.ok) return fail(400, result.error ?? "Error importando");

    return ok({
      filename,
      month: result.month,
      headerRow: result.headerRow,
      detectedColumns: result.detectedColumns,
      warnings: result.warnings,
      summary: result.summary,
      skipped: result.skipped
    });
  } catch (e) { return handle(e); }
}

export const config = { api: { bodyParser: false } } as any;
