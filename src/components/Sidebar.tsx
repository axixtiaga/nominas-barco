"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type NavItem = { href: string; label: string };
type NavGroup = { label: string; children: NavItem[] };
type NavEntry = NavItem | NavGroup;

const NOMINAS_CHILDREN: NavItem[] = [
  { href: "/nominas", label: "Asignación de descargas" },
  { href: "/nominas/gastos", label: "Asignar gastos a mantas" },
  { href: "/ss-payments", label: "Seguridad Social" }
];

const MAESTROS_CHILDREN: NavItem[] = [
  { href: "/sailors", label: "Marineros" },
  { href: "/equivalences", label: "Equivalencias" },
  { href: "/species", label: "Especies" },
  { href: "/port-tax-rates", label: "Impuestos por puerto" },
  { href: "/expense-concepts", label: "Conceptos de gasto" },
  { href: "/formats", label: "Formatos documentales" },
  { href: "/backups", label: "Backups" }
];

// Hijos solo accesibles a ADMIN (los VIEWER/OPERATOR no los ven en el sidebar).
const ADMIN_ONLY_HREFS = new Set(["/users"]);

const MAESTROS_CHILDREN_ADMIN: NavItem[] = [
  ...MAESTROS_CHILDREN,
  { href: "/users", label: "Usuarios" }
];

// Navegación para usuarios admin/operator/viewer (acceso completo a lectura)
function buildNavFull(role: string | undefined): NavEntry[] {
  const isAdmin = role === "ADMIN";
  return [
    { href: "/", label: "Inicio" },
    { href: "/panel", label: "Panel de control" },
    { href: "/analisis-comparado", label: "Análisis comparado" },
    { href: "/documents", label: "Documentos" },
    { label: "Nóminas", children: NOMINAS_CHILDREN },
    { href: "/reports", label: "Reportes" },
    { label: "Maestros", children: isAdmin ? MAESTROS_CHILDREN_ADMIN : MAESTROS_CHILDREN }
  ];
}

// Navegación para usuarios MARINERO (acceso restringido a sus propias nóminas)
const NAV_MARINERO: NavEntry[] = [
  { href: "/mi/nominas", label: "Mis nóminas" }
];

function isGroup(n: NavEntry): n is NavGroup {
  return (n as NavGroup).children !== undefined;
}

/**
 * Devuelve true si el path actual coincide con la ruta exacta del item, o es un
 * "descendiente" de ella. La excepción es /nominas, que NO debe activarse para
 * subrutas como /nominas/gastos (porque /nominas/gastos tiene su propio item).
 */
function isItemActive(path: string | null, href: string, siblings: NavItem[] = []): boolean {
  if (!path) return false;
  if (path === href) return true;
  // Si una ruta hermana tiene un href más específico que coincide con el path,
  // entonces este item NO está activo (la hermana más específica gana).
  const moreSpecificSibling = siblings.find(s => s.href !== href && s.href.startsWith(href + "/") && (path === s.href || path.startsWith(s.href + "/")));
  if (moreSpecificSibling) return false;
  return path.startsWith(href + "/");
}

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<{ name: string; email: string; role: string; sailorId?: string | null } | null>(null);

  // Selecciona la navegación según el rol del usuario.
  // Mientras carga la sesión, no enseña ningún menú (evita "flash" del menú completo
  // antes de saber si es marinero).
  const NAV: NavEntry[] = me?.role === "MARINERO" ? NAV_MARINERO : buildNavFull(me?.role);

  // Estado de despliegue por grupo (nombre del grupo → abierto/cerrado).
  // Se inicializa abierto si alguno de sus hijos coincide con la ruta actual.
  const groupKey = (g: NavGroup) => g.label;
  const initialOpen = useMemo(() => {
    const set = new Set<string>();
    for (const n of NAV) {
      if (isGroup(n) && n.children.some(c => isItemActive(path, c.href, n.children))) {
        set.add(groupKey(n));
      }
    }
    return set;
  }, [path, me?.role]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(initialOpen);

  // Si la ruta cambia y algún grupo tiene un hijo activo, asegúrate de tenerlo abierto.
  useEffect(() => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      for (const n of NAV) {
        if (isGroup(n) && n.children.some(c => isItemActive(path, c.href, n.children))) {
          next.add(groupKey(n));
        }
      }
      return next;
    });
  }, [path, me?.role]);

  function toggleGroup(label: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(j => setMe(j.data))
      .catch(() => { });
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="bg-slate-900 text-slate-100 p-4 sticky top-0 h-screen flex flex-col">
      {/* Cabecera con logo */}
      <div className="mb-6 px-2">
        <img
          src="/logo-itsas-lagunak.png"
          alt="Itsas Lagunak"
          className="w-full max-w-[180px] mx-auto mb-3 bg-white rounded-md p-2"
        />
        <div className="text-center">
          <div className="text-xl font-bold tracking-wide text-white">ITSAS LAGUNAK</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mt-1">Capturas · SS-1</div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex flex-col gap-1">
        {NAV.map(n => {
          if (isGroup(n)) {
            const groupActive = n.children.some(c => isItemActive(path, c.href, n.children));
            const open = openGroups.has(groupKey(n));
            return (
              <div key={n.label} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleGroup(groupKey(n))}
                  className={`px-3 py-2 rounded-md text-sm flex items-center justify-between text-left ${groupActive ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800"}`}
                >
                  <span>{n.label}</span>
                  <span className={`text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                </button>
                {open && (
                  <div className="ml-3 mt-1 flex flex-col gap-1 border-l border-slate-700 pl-2">
                    {n.children.map(c => {
                      const active = isItemActive(path, c.href, n.children);
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          className={`px-3 py-1.5 rounded-md text-sm ${active ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800"}`}
                        >{c.label}</Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          const active = path === n.href || (n.href !== "/" && path?.startsWith(n.href));
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-2 rounded-md text-sm ${active ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800"}`}
            >{n.label}</Link>
          );
        })}
      </nav>

      {/* Pie con info de sesión */}
      <div className="mt-auto pt-4 border-t border-slate-800">
        {me ? (
          <div className="px-3 space-y-2">
            <div className="text-xs text-slate-400">Sesión activa</div>
            <div className="text-sm text-white truncate" title={me.email}>{me.name}</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-400">{me.role}</div>
            <button
              onClick={logout}
              className="w-full mt-2 px-3 py-2 rounded-md text-xs bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-200 transition"
            >
              Cerrar sesión
            </button>
          </div>
        ) : (
          <div className="px-3 text-xs text-slate-500">Cargando sesión…</div>
        )}
      </div>
    </aside>
  );
}
