import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { UserRole } from "@/lib/types";
export { UserRole };

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-in-production-32chars"
);

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export async function createToken(user: AuthUser): Promise<string> {
  return await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getSessionFromRequest(req: NextRequest): Promise<AuthUser | null> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function login(email: string, password: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return { id: user.id, email: user.email, name: user.name, role: user.role as UserRole };
}

export function canWrite(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.OFICINA;
}

export function isAdmin(role: UserRole): boolean {
  return role === UserRole.ADMIN;
}

export async function requireAuth(req: NextRequest): Promise<AuthUser> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireWrite(req: NextRequest): Promise<AuthUser> {
  const session = await requireAuth(req);
  if (!canWrite(session.role)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}
