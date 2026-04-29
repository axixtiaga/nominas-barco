import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/api/auth/login", "/_next", "/favicon.ico"];

// Rutas permitidas para usuarios con role=MARINERO. Todo lo demás se redirige
// a /mi/nominas. Las APIs propias del marinero también están en /api/mi/*.
const MARINERO_ALLOWED_PREFIXES = [
  "/mi",
  "/api/mi",
  "/api/auth/me",
  "/api/auth/logout"
];

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-please-change-32chars!!");

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get("capturas_session")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Restricciones por rol
  try {
    const { payload } = await jwtVerify(token, secret());
    const role = (payload as any)?.role;

    // MARINERO: solo puede entrar a su zona personal /mi/*
    if (role === "MARINERO") {
      const allowed = MARINERO_ALLOWED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
      if (!allowed) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ ok: false, error: "Acceso restringido a tu zona personal" }, { status: 403 });
        }
        const url = req.nextUrl.clone();
        url.pathname = "/mi/nominas";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }

    // /users (UI de gestión de usuarios) y /api/users solo para ADMIN.
    // Los endpoints de la API ya filtran con requireRole; aquí solo evitamos
    // que la página /users se renderice y muestre un error de "Acceso restringido"
    // a OPERATOR / VIEWER intencionadamente.
    if (role !== "ADMIN" && (pathname === "/users" || pathname.startsWith("/users/") || pathname.startsWith("/api/users"))) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ ok: false, error: "Solo el administrador puede gestionar usuarios" }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  } catch {
    // Token inválido — deja que la API lo gestione devolviendo 401
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
