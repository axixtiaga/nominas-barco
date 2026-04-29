import "./globals.css";
import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "Capturas · Itsas Lagunak", description: "Gestión de capturas pesqueras" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const loggedIn = !!cookies().get("capturas_session")?.value;
  return (
    <html lang="es">
      <body>
        {loggedIn ? (
          <div className="min-h-screen grid grid-cols-[240px_1fr]">
            <Sidebar />
            {/* Ya no hay topbar — la info de sesión vive dentro del sidebar. */}
            <main className="min-h-screen p-6">{children}</main>
          </div>
        ) : (
          <main className="min-h-screen">{children}</main>
        )}
      </body>
    </html>
  );
}
