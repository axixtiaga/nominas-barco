"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Credenciales incorrectas");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Panel izquierdo — decorativo */}
      <div className="hidden lg:flex lg:w-1/2 ocean-gradient flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-white">Nóminas del Barco</p>
            <p className="text-xs text-white/60">Gestión pesquera</p>
          </div>
        </div>
        <div>
          <h2 className="text-4xl font-bold text-white leading-tight tracking-tight">
            Gestión completa<br />de tu flota
          </h2>
          <p className="mt-4 text-white/70 text-base max-w-sm leading-relaxed">
            Facturas, liquidaciones, nóminas y dashboard en una sola plataforma.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { label: "Capturas", desc: "Importa y organiza" },
              { label: "Nóminas",  desc: "Cálculo auditado" },
              { label: "Gastos",   desc: "Control total" },
              { label: "Exportar", desc: "PDF, Excel, CSV" },
            ].map((f) => (
              <div key={f.label} className="bg-white/10 rounded-lg p-4">
                <p className="text-white font-semibold text-sm">{f.label}</p>
                <p className="text-white/60 text-xs mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-white/40 text-xs">© 2024 Nóminas del Barco</p>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-ocean-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-800">Nóminas del Barco</p>
          </div>

          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-slate-500">Accede con tu cuenta de usuario</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                required
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 focus:border-transparent hover:border-slate-300 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-ocean-500 focus:border-transparent hover:border-slate-300 transition-colors"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2.5">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-ocean-600 text-white text-sm font-semibold rounded-md hover:bg-ocean-700 active:bg-ocean-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                  </svg>
                  Entrando...
                </>
              ) : "Entrar"}
            </button>
          </form>

          <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-2">Usuarios de prueba</p>
            <div className="space-y-1">
              {[
                { email: "admin@nominas-barco.com", pass: "admin1234", role: "Admin" },
                { email: "oficina@nominas-barco.com", pass: "oficina1234", role: "Oficina" },
              ].map((u) => (
                <div key={u.email} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-700 font-mono">{u.email}</p>
                    <p className="text-[10px] text-slate-400">{u.pass} · {u.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEmail(u.email); setPassword(u.pass); }}
                    className="text-[10px] text-ocean-600 hover:text-ocean-800 font-medium px-2 py-1 rounded hover:bg-ocean-50"
                  >
                    Usar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
