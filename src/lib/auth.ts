import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-please-change-32chars!!");

export type JwtPayload = {
  sub: string;
  email: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER" | "MARINERO";
  name: string;
  /** Si role=MARINERO, id del Sailor asociado (para filtrar mantas visibles) */
  sailorId?: string | null;
};

export async function signToken(p: JwtPayload): Promise<string> {
  return await new SignJWT(p as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as JwtPayload;
  } catch { return null; }
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const comparePassword = (p: string, hash: string) => bcrypt.compare(p, hash);

export const COOKIE_NAME = "capturas_session";
