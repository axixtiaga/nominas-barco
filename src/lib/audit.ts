import prisma from "@/lib/db";

export async function createAuditLog({
  userId,
  action,
  entity,
  entityId,
  oldValues,
  newValues,
  ipAddress,
}: {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        oldValues: oldValues as object,
        newValues: newValues as object,
        ipAddress,
      },
    });
  } catch {
    // Audit log failures should not break the main flow
    console.error("Failed to write audit log");
  }
}
