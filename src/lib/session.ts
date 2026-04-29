import { cookies } from "next/headers";
import { COOKIE_NAME, verifyToken, JwtPayload } from "./auth";

export async function getSession(): Promise<JwtPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifyToken(token);
}

export async function requireSession(): Promise<JwtPayload> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "No autenticado");
  return s;
}

export async function requireRole(roles: JwtPayload["role"][]): Promise<JwtPayload> {
  const s = await requireSession();
  if (!roles.includes(s.role)) throw new HttpError(403, "Rol insuficiente");
  return s;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
