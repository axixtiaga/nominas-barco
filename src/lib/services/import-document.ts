import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../prisma";
import { extractPdfText } from "../parsers/pdf-text";
import { resolveParser } from "../parsers/classifier";
import { resolveMany } from "./species-normalizer";
import { audit } from "../audit";
import { mastersRepo } from "../repositories/masters";
import { resolveExpenseParser } from "../expense-parsers";
import { applyExpenseConceptRules } from "./apply-expense-concepts";
import { classifyKind } from "./classify-kind";
import { DocumentKind, DocumentStatus } from "@prisma/client";

const STORAGE_ROOT = path.resolve(process.cwd(), "storage");

export async function importPdf(params: {
  filename: string;
  buffer: Buffer;
  uploaderId?: string | null;
  /** Pista opcional del puerto (ej. nombre de la subcarpeta del watcher). Solo aplica a CAPTURA. */
  portHint?: string | null;
  /** Tipo de documento: CAPTURA (parsea factura de pesca) o GASTO (parsea factura de gastos).
   *  Si autoDetectKind=true, este valor pasa a ser solo una PISTA por defecto. */
  kind?: "CAPTURA" | "GASTO";
  /** Si es true, se ignora la carpeta y se decide CAPTURA/GASTO según el CONTENIDO del PDF.
   *  Solo si el clasificador no está seguro (UNKNOWN) se respeta `kind` como fallback. */
  autoDetectKind?: boolean;
  /** Origen del documento: upload, watcher, reparse... (informativo). */
  source?: string;
  /** Ruta completa del archivo en su ubicación original (Dropbox); la usa
   *  el servicio de verificación para moverlo a revisado/ al validar la factura. */
  originalPath?: string | null;
}) {
  const { filename, buffer, portHint, source, originalPath } = params;
  let kind: DocumentKind = (params.kind ?? "CAPTURA") as DocumentKind;
  const folderHintKind = kind;   // lo que sugería la carpeta de origen
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  let uploaderId: string | null = null;
  if (params.uploaderId) {
    const u = await prisma.user.findUnique({ where: { id: params.uploaderId }, select: { id: true } });
    uploaderId = u ? u.id : null;
  }

  const existing = await prisma.document.findUnique({ where: { sha256 } });
  if (existing) return { document: existing, duplicated: true };

  await fs.mkdir(STORAGE_ROOT, { recursive: true });
  const storagePath = path.join(STORAGE_ROOT, `${sha256}.pdf`);
  await fs.writeFile(storagePath, buffer);

  let rawText = "";
  let parseError: string | null = null;
  try {
    rawText = await extractPdfText(buffer);
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
  }

  // ── Auto-clasificación CAPTURA/GASTO por contenido ──────────────────────
  // Si se solicita, miramos el contenido del PDF para decidir el tipo, en lugar
  // de fiarnos solo de la carpeta de origen. Si el clasificador no está seguro
  // (UNKNOWN), respetamos la pista de la carpeta.
  let kindClassification: Awaited<ReturnType<typeof classifyKind>> | null = null;
  if (params.autoDetectKind && rawText) {
    try {
      kindClassification = await classifyKind(rawText);
      if (kindClassification.kind !== "UNKNOWN") {
        kind = kindClassification.kind as DocumentKind;
      }
    } catch { /* si falla la clasificación, seguimos con la pista de la carpeta */ }
  }

  // Para CAPTURA, intenta parsear con los parsers de capturas.
  // Para GASTO, los parsers de gastos llegan en Fase 3; de momento solo guardamos el documento.
  const tryParse = kind === "CAPTURA" && !!rawText;
  const { handler, formatId, config } = tryParse
    ? await resolveParser(rawText)
    : { handler: null as any, formatId: null, config: {} };

  let parsed: any = null;
  if (handler && rawText) {
    try {
      parsed = handler.parse({ rawText, formatConfig: config, portHint: portHint ?? null });
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
  }

  const document = await prisma.document.create({
    data: {
      filename,
      storagePath,
      originalPath: originalPath ?? null,
      sha256,
      sizeBytes: buffer.byteLength,
      kind,
      uploaderId: uploaderId ?? null,
      formatId: formatId ?? undefined,
      rawText: rawText || null,
      rawParsed: parsed ?? undefined,
      parseError,
      // Para GASTO sin parser todavía: status DRAFT (pendiente de revisar manualmente).
      // Para CAPTURA sin parser: FAILED.
      status: parsed ? DocumentStatus.PARSED : (kind === "GASTO" ? DocumentStatus.DRAFT : DocumentStatus.FAILED)
    }
  });
  await audit({ userId: uploaderId, entity: "Document", entityId: document.id, action: "UPLOAD", newValue: {
    filename, sha256, kind, formatId, source: source ?? "upload", portHint: portHint ?? null,
    autoClassified: kindClassification ? {
      detected: kindClassification.kind,
      confidence: kindClassification.confidence,
      reason: kindClassification.reason,
      folderHint: folderHintKind,
      overrodeFolder: kindClassification.kind !== "UNKNOWN" && kindClassification.kind !== folderHintKind
    } : null
  } });

  // Si hay parser y es captura, materializa la Invoice + lines.
  if (parsed && kind === "CAPTURA") {
    const resolvedPortName = parsed.portName ?? portHint ?? null;
    const port = resolvedPortName
      ? await prisma.port.findFirst({
          where: {
            OR: [
              { name: { equals: resolvedPortName, mode: "insensitive" } },
              { code: { equals: resolvedPortName.toUpperCase().slice(0, 10) } }
            ]
          }
        })
      : null;
    const boat = parsed.boatName
      ? await prisma.boat.findFirst({ where: { name: { equals: parsed.boatName, mode: "insensitive" } } })
      : null;
    const supplier = parsed.supplierName
      ? await mastersRepo.suppliers.findOrCreateByName(parsed.supplierName, parsed.supplierTaxId ?? null)
      : null;

    const nameMap = await resolveMany(parsed.lines.map((l: any) => l.rawSpeciesName), port?.id ?? null);

    const invoice = await prisma.invoice.create({
      data: {
        documentId: document.id,
        invoiceNumber: parsed.invoiceNumber ?? null,
        issueDate: toDateOrNull(parsed.issueDate),
        portId: port?.id ?? null,
        boatId: boat?.id ?? null,
        supplierId: supplier?.id ?? null,
        currency: parsed.currency ?? "EUR",
        subtotal: parsed.subtotal ?? 0,
        taxes: parsed.taxes ?? 0,
        fees: parsed.fees ?? 0,
        other: parsed.other ?? 0,
        total: parsed.total ?? 0,
        notes: parsed.notes ?? null,
        status: DocumentStatus.DRAFT,
        lines: {
          create: (parsed.lines as any[]).map((l, i) => ({
            lineNo: l.lineNo ?? i + 1,
            lineDate: toDateOrNull(l.lineDate),
            rawSpeciesName: l.rawSpeciesName || "(sin especie)",
            speciesId: nameMap.get(normalize(l.rawSpeciesName || "")) ?? null,
            description: l.description ?? null,
            kilos: l.kilos ?? 0,
            pricePerKg: l.pricePerKg ?? 0,
            amount: l.amount ?? 0,
            vatRate: l.vatRate ?? 0,
            vatAmount: l.vatAmount ?? 0,
            notes: l.notes ?? null
          }))
        }
      }
    });

    await prisma.document.update({ where: { id: document.id }, data: { status: DocumentStatus.DRAFT } });
    await audit({ userId: uploaderId, entity: "Invoice", entityId: invoice.id, action: "CREATE", newValue: { via: "import" } });
    return { document, invoiceId: invoice.id, duplicated: false };
  }

  // Para GASTO: aplicar el parser de gastos correspondiente y materializar Expense
  if (kind === "GASTO") {
    let parsedExpense: any = null;
    let expenseError: string | null = null;
    if (rawText) {
      try {
        const handler = resolveExpenseParser(rawText);
        parsedExpense = handler.parse({ rawText });
        // Guardamos el meta del parser elegido en rawParsed para trazabilidad
        await prisma.document.update({
          where: { id: document.id },
          data: { rawParsed: parsedExpense, status: DocumentStatus.DRAFT }
        });
      } catch (e) {
        expenseError = e instanceof Error ? e.message : String(e);
        await prisma.document.update({
          where: { id: document.id },
          data: { parseError: expenseError, status: DocumentStatus.DRAFT }
        });
      }
    }

    // Resolver/crear el proveedor a partir del CIF/nombre extraído
    let supplier = null as any;
    if (parsedExpense?.supplierName || parsedExpense?.supplierTaxId) {
      supplier = await mastersRepo.suppliers.findOrCreateByName(
        parsedExpense.supplierName ?? parsedExpense.supplierTaxId,
        parsedExpense.supplierTaxId ?? null
      );
    }

    // Resolver el puerto (si el parser lo identificó, p.ej. para gastos de cofradía)
    let port = null as any;
    if (parsedExpense?.portName) {
      port = await prisma.port.findFirst({
        where: {
          OR: [
            { name: { equals: parsedExpense.portName, mode: "insensitive" } },
            { code: { equals: parsedExpense.portName.toUpperCase().slice(0, 10) } }
          ]
        }
      });
    }

    // ── Aplicar reglas del maestro "Conceptos de gasto" ────────────────────
    // Esto sobrescribe la categoría/concepto y, opcionalmente, la descripción de
    // cada línea según las reglas que el usuario haya creado en
    // /expense-concepts. Si no hay reglas que casen, se respeta lo del parser.
    const conceptApply = await applyExpenseConceptRules({
      category: parsedExpense?.category,
      concept: parsedExpense?.concept,
      supplierName: parsedExpense?.supplierName ?? supplier?.name ?? null,
      lines: parsedExpense?.lines ?? []
    });

    const finalCategory = (conceptApply.category ?? parsedExpense?.category ?? "OTRO") as any;
    const finalConcept = conceptApply.concept ?? parsedExpense?.concept ?? null;

    const expense = await prisma.expense.create({
      data: {
        documentId: document.id,
        expenseNumber: parsedExpense?.expenseNumber ?? null,
        issueDate: toDateOrNull(parsedExpense?.issueDate),
        serviceDate: toDateOrNull(parsedExpense?.serviceDate),
        supplierId: supplier?.id ?? null,
        portId: port?.id ?? null,
        concept: finalConcept,
        category: finalCategory,
        baseAmount: parsedExpense?.baseAmount ?? 0,
        vatRate: parsedExpense?.vatRate ?? 0,
        vatAmount: parsedExpense?.vatAmount ?? 0,
        totalAmount: parsedExpense?.totalAmount ?? 0,
        currency: parsedExpense?.currency ?? "EUR",
        notes: parsedExpense?.notes ?? null,
        status: DocumentStatus.DRAFT,
        // Líneas de detalle (si el parser las extrajo, p.ej. Santoña gastos).
        // Si una regla ha casado para una línea, se usa la descripción "bonita"
        // de la regla y se conserva la original en notes para trazabilidad.
        lines: parsedExpense?.lines && Array.isArray(parsedExpense.lines)
          ? {
              create: (parsedExpense.lines as any[]).map((l, i) => {
                const ruleHit = conceptApply.perLine[i];
                const overriddenDesc = ruleHit?.ruleConcept ?? null;
                const finalDesc = overriddenDesc ?? (l.description ?? "");
                const traceNote = overriddenDesc && l.description && overriddenDesc !== l.description
                  ? `[regla] ${overriddenDesc} | original: ${l.description}`
                  : null;
                return {
                  lineNo: l.lineNo ?? i + 1,
                  lineDate: toDateOrNull(l.lineDate),
                  conceptCode: l.conceptCode ?? null,
                  description: finalDesc,
                  reference: l.reference ?? null,
                  quantity: l.quantity ?? 0,
                  unitPrice: l.unitPrice ?? 0,
                  amount: l.amount ?? 0,
                  includeInMontemayor: l.includeInMontemayor !== false,   // por defecto true
                  notes: traceNote ?? l.notes ?? null
                };
              })
            }
          : undefined
      }
    });
    await audit({
      userId: uploaderId, entity: "Expense", entityId: expense.id, action: "CREATE",
      newValue: {
        via: "import",
        parserKey: parsedExpense?.meta?.formatKey ?? null,
        lines: parsedExpense?.lines?.length ?? 0,
        appliedRules: conceptApply.appliedRules.length,
        ruleIds: conceptApply.appliedRules.map(r => r.ruleId)
      }
    });
    return { document, expenseId: expense.id, duplicated: false };
  }

  return { document, duplicated: false };
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

function toDateOrNull(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(v as any);
  return isNaN(d.getTime()) ? null : d;
}
