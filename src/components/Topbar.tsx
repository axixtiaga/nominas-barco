"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function Topbar() {
  const [me, setMe] = useState<{ name: string; email: string; role: string } | null>(null);
  const router = useRouter();
  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(j => setMe(j.data)).catch(() => {}); }, []);
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login"); router.refresh();
  }
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <div className="text-sm text-slate-500">Sesión activa</div>
      <div className="flex items-center gap-3 text-sm">
        {me ? <span className="text-slate-700">{me.name} · <span className="text-slate-500">{me.role}</span></span> : null}
        <button className="btn-ghost" onClick={logout}>Salir</button>
      </div>
    </header>
  );
}
