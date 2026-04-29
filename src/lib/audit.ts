import { prisma } from "./prisma";

export async function audit(params: {
  userId?: string | null;
  entity: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "VERIFY" | "REPARSE" | "UPLOAD" | "REJECT";
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  // Si el userId no corresponde a un usuario real (cookie obsoleta tras un reset),
  // lo registramos como anónimo en vez de petar con un FK violation.
  let safeUserId: string | null = params.userId ?? null;
  if (safeUserId) {
    const u = await prisma.user.findUnique({ where: { id: safeUserId }, select: { id: true } });
    if (!u) safeUserId = null;
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: safeUserId,
        entity: params.entity,
        entityId: params.entityId,
        action: params.action,
        field: params.field ?? null,
        oldValue: params.oldValue === undefined ? null : (params.oldValue as any),
        newValue: params.newValue === undefined ? null : (params.newValue as any)
      }
    });
  } catch (e) {
    // La auditoría no debe bloquear nunca el flujo principal.
    console.warn("[audit] skipped:", e instanceof Error ? e.message : e);
  }
}

/** Compara dos objetos y registra un AuditLog por cada campo modificado. */
export async function auditDiff(params: {
  userId?: string | null;
  entity: string;
  entityId: string;
  before: Record<string, any>;
  after: Record<string, any>;
}) {
  const keys = new Set([...Object.keys(params.before ?? {}), ...Object.keys(params.after ?? {})]);
  for (const k of keys) {
    const a = params.before?.[k];
    const b = params.after?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      await audit({
        userId: params.userId,
        entity: params.entity,
        entityId: params.entityId,
        action: "UPDATE",
        field: k,
        oldValue: a,
        newValue: b
      });
    }
  }
}
