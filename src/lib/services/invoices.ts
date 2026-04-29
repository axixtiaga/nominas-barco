import { prisma } from "../prisma";
import { audit, auditDiff } from "../audit";
import { DocumentStatus, Prisma, EquivalenceScope } from "@prisma/client";
import { invoiceUpdateSchema } from "../zod/schemas";
import { z } from "zod";
import { moveToRevisado } from "./archive";
import { normalizeRawName } from "./species-normalizer";

export async function updateInvoice(
  id: string,
  payload: z.infer<typeof invoiceUpdateSchema>,
  userId: string
) {
  const before = await prisma.invoice.findUnique({ where: { id }, include: { lines: true } });
  if (!before) throw new Error("Factura no encontrada");

  const totalsCheck = sumLines(payload.lines);
  const subtotal = payload.subtotal || totalsCheck.subtotal;
  const taxes = payload.taxes || totalsCheck.taxes;
  const total = payload.total || (subtotal + taxes + payload.fees + payload.other);

  const updated = await prisma.$transaction(async tx => {
    // Borra líneas antiguas y reemplaza (sencillo, auditable)
    await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
    const inv = await tx.invoice.update({
      where: { id },
      data: {
        invoiceNumber: payload.invoiceNumber ?? null,
        issueDate: payload.issueDate ? new Date(payload.issueDate) : null,
        portId: payload.portId ?? null,
        boatId: payload.boatId ?? null,
        supplierId: payload.supplierId ?? null,
        currency: payload.currency,
        kind: payload.kind,
        subtotal, taxes, fees: payload.fees, other: payload.other, total,
        notes: payload.notes ?? null,
        status: payload.verify ? DocumentStatus.VERIFIED : DocumentStatus.DRAFT,
        verifiedAt: payload.verify ? new Date() : null,
        verifiedById: payload.verify ? userId : null,
        lines: {
          create: payload.lines.map(l => ({
            lineNo: l.lineNo,
            lineDate: l.lineDate ? new Date(l.lineDate) : null,
            rawSpeciesName: l.rawSpeciesName,
            speciesId: l.speciesId ?? null,
            description: l.description ?? null,
            kilos: new Prisma.Decimal(l.kilos),
            pricePerKg: new Prisma.Decimal(l.pricePerKg),
            amount: new Prisma.Decimal(l.amount),
            vatRate: new Prisma.Decimal(l.vatRate ?? 0),
            vatAmount: new Prisma.Decimal(l.vatAmount ?? 0),
            notes: l.notes ?? null
          }))
        }
      },
      include: { lines: true }
    });

    await tx.document.update({
      where: { id: inv.documentId },
      data: { status: payload.verify ? DocumentStatus.VERIFIED : DocumentStatus.DRAFT }
    });
    return inv;
  });

  // Audit: diff a nivel de cabecera
  const strip = (x: any) => ({
    invoiceNumber: x.invoiceNumber, issueDate: x.issueDate, portId: x.portId, boatId: x.boatId, supplierId: x.supplierId,
    subtotal: Number(x.subtotal), taxes: Number(x.taxes), fees: Number(x.fees), other: Number(x.other), total: Number(x.total),
    status: x.status, notes: x.notes
  });
  await auditDiff({ userId, entity: "Invoice", entityId: id, before: strip(before), after: strip(updated) });

  // ── Aprendizaje automático de equivalencias ────────────────────────
  // Para cada línea con speciesId asignado a mano, registramos/actualizamos
  // la equivalencia y la aplicamos al resto de líneas de cualquier factura
  // con la misma denominación cruda. Alcance: PORT si la factura tiene puerto,
  // GLOBAL si no.
  try {
    await learnEquivalencesFromInvoice({
      invoiceLines: updated.lines,
      portId: updated.portId ?? null,
      userId
    });
  } catch (e) {
    console.error("[equivalences] aprendizaje automático falló:", e);
  }

  // Al verificar, movemos el PDF original a la subcarpeta "revisado/" del Dropbox
  // (si vino del watcher y sigue accesible). El fallo al mover NO bloquea la verificación.
  let archiveResult: { moved: boolean; destination?: string | null; reason?: string } = { moved: false };
  if (payload.verify) {
    await audit({ userId, entity: "Invoice", entityId: id, action: "VERIFY" });
    try {
      const doc = await prisma.document.findUnique({ where: { id: updated.documentId } });
      if (!doc?.originalPath) {
        archiveResult = { moved: false, reason: "El documento no tiene ruta original (importación anterior o manual)." };
      } else {
        const moved = await moveToRevisado(doc.originalPath);
        if (moved) {
          await prisma.document.update({ where: { id: doc.id }, data: { archivedPath: moved } });
          await audit({
            userId, entity: "Document", entityId: doc.id, action: "UPDATE",
            field: "archivedPath", oldValue: null, newValue: moved
          });
          archiveResult = { moved: true, destination: moved };
        } else {
          archiveResult = { moved: false, reason: "No se pudo mover (archivo ausente, ya archivado o WATCH_FOLDER no definida)." };
        }
      }
    } catch (e: any) {
      console.error("[archive] No se pudo mover el PDF a revisado/:", e);
      archiveResult = { moved: false, reason: e?.message ?? "Error moviendo el fichero." };
    }
  }

  return { ...updated, archive: archiveResult } as any;
}

function sumLines(lines: { kilos: number; pricePerKg: number; amount: number; vatRate?: number; vatAmount?: number }[]) {
  const subtotal = lines.reduce((a, l) => a + (l.amount ?? 0), 0);
  const taxes = lines.reduce((a, l) => a + (l.vatAmount ?? 0), 0);
  return { subtotal, taxes };
}

/**
 * Aprende equivalencias del trabajo manual del usuario.
 *
 * Para cada par (rawSpeciesName, speciesId) no nulo detectado en las líneas
 * de la factura, garantiza que exista una SpeciesEquivalence activa con ese
 * mapeo. A continuación aplica la equivalencia a TODAS las líneas de otras
 * facturas con la misma denominación cruda que todavía no tengan especie.
 *
 * Alcance:
 *   - Si la factura tiene puerto → equivalencia PORT (puerto-específica).
 *   - Si la factura NO tiene puerto → equivalencia GLOBAL.
 */
async function learnEquivalencesFromInvoice(params: {
  invoiceLines: { rawSpeciesName: string; speciesId: string | null }[];
  portId: string | null;
  userId: string;
}) {
  const { invoiceLines, portId, userId } = params;

  // Deduplica pares (nombre normalizado, speciesId)
  const pairs = new Map<string, { rawName: string; speciesId: string }>();
  for (const l of invoiceLines) {
    if (!l.speciesId || !l.rawSpeciesName) continue;
    const key = normalizeRawName(l.rawSpeciesName);
    if (!key) continue;
    pairs.set(`${key}|${l.speciesId}`, { rawName: key, speciesId: l.speciesId });
  }

  for (const { rawName, speciesId } of pairs.values()) {
    // ¿Existe ya una equivalencia activa que mapea rawName a este species?
    const existingPort = portId
      ? await prisma.speciesEquivalence.findFirst({ where: { rawName, portId, active: true } })
      : null;
    const existingGlobal = await prisma.speciesEquivalence.findFirst({
      where: { rawName, portId: null, active: true }
    });

    // Si alguna ya apunta correctamente, no hace falta tocar nada.
    const alreadyMatches =
      (existingPort?.speciesId === speciesId) ||
      (!existingPort && existingGlobal?.speciesId === speciesId);
    if (alreadyMatches) continue;

    // Upsert manual (Prisma no soporta null en clave compuesta única)
    if (portId) {
      if (existingPort) {
        await prisma.speciesEquivalence.update({
          where: { id: existingPort.id },
          data: { speciesId, active: true, scope: EquivalenceScope.PORT }
        });
      } else {
        await prisma.speciesEquivalence.create({
          data: { rawName, portId, speciesId, scope: EquivalenceScope.PORT, active: true, notes: "Aprendida automáticamente" }
        });
      }
    } else {
      if (existingGlobal) {
        await prisma.speciesEquivalence.update({
          where: { id: existingGlobal.id },
          data: { speciesId, active: true, scope: EquivalenceScope.GLOBAL }
        });
      } else {
        await prisma.speciesEquivalence.create({
          data: { rawName, portId: null, speciesId, scope: EquivalenceScope.GLOBAL, active: true, notes: "Aprendida automáticamente" }
        });
      }
    }

    await audit({
      userId, entity: "SpeciesEquivalence", entityId: "auto-learn",
      action: "CREATE", field: "auto",
      newValue: { rawName, speciesId, scope: portId ? "PORT" : "GLOBAL" }
    });

    // Aplica la equivalencia a líneas existentes sin especie resuelta.
    // Solo tocamos las que tienen la misma denominación cruda normalizada.
    // Evitamos sobrescribir asignaciones manuales previas (por eso: where speciesId=null).
    const updated = await prisma.invoiceLine.updateMany({
      where: {
        speciesId: null,
        rawSpeciesName: { in: variantsOf(rawName) },
        ...(portId ? { invoice: { portId } } : {})
      },
      data: { speciesId }
    });
    if (updated.count > 0) {
      await audit({
        userId, entity: "InvoiceLine", entityId: "bulk-apply",
        action: "UPDATE", field: "speciesId",
        newValue: { rawName, speciesId, affected: updated.count }
      });
    }
  }
}

/**
 * Devuelve las variantes textuales que pueden corresponder a `normalizedRawName`
 * en la BD. Como normalizamos quitando tildes y uppercaseando, muchas líneas
 * ya estarán guardadas con ese mismo texto; pero si alguna se guardó con tildes
 * o minúsculas por accidente, las incluimos también.
 */
function variantsOf(normalizedRawName: string): string[] {
  const v = new Set<string>([normalizedRawName]);
  v.add(normalizedRawName.toLowerCase());
  v.add(capitalize(normalizedRawName.toLowerCase()));
  return [...v];
}
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
