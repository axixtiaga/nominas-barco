"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReparseButton({ documentId }: { documentId: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function reparse() {
    if (!confirm("¿Volver a parsear este documento con el parser actual? Se reemplazará la extracción.")) return;
    setLoading(true); setMsg(null);
    const r = await fetch(`/api/documents/${documentId}/reparse`, { method: "POST" });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) { setMsg(j?.error ?? "Error"); return; }
    // La ruta cambia porque el reparseo genera un Document nuevo (dedupe por sha256 → mismo id no siempre)
    if (j.data?.document?.id) router.push(`/documents/${j.data.document.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn-ghost" onClick={reparse} disabled={loading}>
        {loading ? "Reparseando..." : "Volver a parsear"}
      </button>
      {msg && <span className="text-xs text-rose-600">{msg}</span>}
    </div>
  );
}
