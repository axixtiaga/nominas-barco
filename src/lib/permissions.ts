import { UserRole } from "@/lib/types";
import { AuthUser } from "./auth";

export type Action = "read" | "write" | "delete" | "admin";

const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  [UserRole.ADMIN]: ["read", "write", "delete", "admin"],
  [UserRole.OFICINA]: ["read", "write"],
  [UserRole.LECTURA]: ["read"],
};

export function can(user: AuthUser, action: Action): boolean {
  return ROLE_PERMISSIONS[user.role]?.includes(action) ?? false;
}

export function requirePermission(user: AuthUser, action: Action): void {
  if (!can(user, action)) {
    throw new Error("FORBIDDEN");
  }
}
