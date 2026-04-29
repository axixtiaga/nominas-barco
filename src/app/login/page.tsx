"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@capturas.local");
  const [password, setPassword] = useState("admin1234");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Error");
      // MARINERO siempre va a su zona, ignora el ?next= (que normalmente sería para admin).
      // Para los demás roles, respeta el ?next= o vuelve a /
      const role = j?.data?.role;
      const next = role === "MARINERO" ? "/mi/nominas" : (sp.get("next") ?? "/");
      router.push(next); router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* Lado izquierdo: imagen del barco con logo superpuesto */}
      <div className="relative hidden lg:block bg-slate-900 overflow-hidden">
        <img
          src="/barco-itsas-lagunak.jpg"
          alt="ITSAS LAGUNAK en alta mar"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Degradado oscuro en la parte inferior para que destaque el texto */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/30 to-transparent" />

        <div className="relative z-10 h-full flex flex-col justify-between p-10 text-white">
          {/* Logo arriba a la izquierda */}
          <img
            src="/logo-itsas-lagunak.png"
            alt="Logo"
            className="w-40 bg-white/95 rounded-lg p-2 shadow-lg"
          />

          {/* Nombre del barco en grande, parte inferior */}
          <div>
            <h1 className="text-5xl xl:text-7xl font-extrabold tracking-tight leading-none">
              ITSAS<br />LAGUNAK
            </h1>
            <p className="mt-3 text-lg text-slate-200">3ª SS-1-2-05 · Puerto base: Hondarribia</p>
            <p className="mt-1 text-sm text-slate-300">Gestión de capturas pesqueras — Cantábrico</p>
          </div>
        </div>
      </div>

      {/* Lado derecho: formulario de login */}
      <div className="flex items-center justify-center bg-slate-100 p-6">
        <form onSubmit={submit} className="w-full max-w-sm card">
          {/* En móvil mostramos el logo aquí arriba, ya que la imagen izquierda está oculta */}
          <div className="lg:hidden flex flex-col items-center mb-4">
            <img src="/logo-itsas-lagunak.png" alt="Itsas Lagunak" className="w-24 mb-2" />
            <div className="text-xl font-bold">ITSAS LAGUNAK</div>
          </div>

          <h1 className="text-xl font-semibold mb-1">Iniciar sesión</h1>
          <p className="text-sm text-slate-500 mb-4">Accede al panel de capturas.</p>

          <div className="mb-3">
            <label className="label">Email</label>
            <input
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="username"
            />
          </div>
          <div className="mb-4">
            <label className="label">Contraseña</label>
            <input
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          {err && <div className="text-sm text-rose-600 mb-2">{err}</div>}

          <button
            disabled={loading}
            className="btn-primary w-full justify-center"
          >{loading ? "Entrando..." : "Entrar"}</button>

          <p className="text-xs text-slate-500 mt-3">
            Admin por defecto: admin@capturas.local / admin1234
          </p>
        </form>
      </div>
    </div>
  );
}
