import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/zod/schemas";
import { comparePassword, signToken, COOKIE_NAME } from "@/lib/auth";
import { ok, fail, handle } from "@/lib/http";

export async function POST(req: NextRequest) {
  try {
    const body = loginSchema.parse(await req.json());
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { sailor: { select: { id: true } } }
    });
    if (!user || !user.active) return fail(401, "Credenciales inválidas");
    const good = await comparePassword(body.password, user.passwordHash);
    if (!good) return fail(401, "Credenciales inválidas");

    const token = await signToken({
      sub: user.id, email: user.email, role: user.role, name: user.name,
      sailorId: user.sailor?.id ?? null
    });
    const res = ok({ email: user.email, name: user.name, role: user.role, sailorId: user.sailor?.id ?? null });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8
    });
    return res;
  } catch (e) { return handle(e); }
}
