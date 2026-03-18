/**
 * auth-edge.ts — Solo verificación JWT con jose.
 * Importado ÚNICAMENTE por middleware.ts (Edge Runtime).
 * NO importar bcryptjs ni @prisma/client aquí.
 */
import { jwtVerify } from "jose";
import { UserRole } from "@/lib/types";

export interface EdgeAuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-in-production-32chars"
);

export async function verifyTokenEdge(token: string): Promise<EdgeAuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as EdgeAuthUser;
  } catch {
    return null;
  }
}
