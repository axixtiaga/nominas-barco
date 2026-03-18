import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Nóminas del Barco",
    template: "%s | Nóminas del Barco",
  },
  description: "Sistema de gestión de nóminas y liquidaciones para embarcaciones pesqueras",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
