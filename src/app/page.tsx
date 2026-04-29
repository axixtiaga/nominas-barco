"use client";
import Link from "next/link";

/**
 * Portada estilo landing. Una sola pantalla: foto del barco a pantalla completa,
 * logo arriba y el nombre "ITSAS LAGUNAK" en tipografía grande. El usuario
 * navega desde la barra lateral a los módulos específicos.
 */
export default function HomePage() {
  return (
    // -m-6 cancela el padding del <main> del layout para que la foto llegue a los bordes.
    // Ya no hay topbar → min-h 100vh.
    <section className="relative -m-6 min-h-screen overflow-hidden">
      {/* Foto del barco a toda pantalla. object-bottom hace que el barco
          se vea entero y no quede cortado por la parte inferior. */}
      <img
        src="/barco-itsas-lagunak.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-bottom"
      />

      {/* Degradado para que el texto blanco resalte sobre la foto */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/30 to-slate-900/40" />

      {/* Contenido superpuesto */}
      <div className="relative z-10 h-full min-h-screen flex flex-col">
        {/* Logo arriba a la derecha, discreto */}
        <div className="flex justify-end p-8">
          <img
            src="/logo-itsas-lagunak.png"
            alt="Itsas Lagunak"
            className="w-24 md:w-28 bg-white/95 rounded-2xl p-3 shadow-xl"
          />
        </div>

        {/* Zona central — nombre del barco a tamaño hero */}
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center text-white">
            <h1 className="text-7xl md:text-8xl lg:text-[9rem] font-extrabold tracking-tight leading-none drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
              ITSAS
              <br />
              LAGUNAK
            </h1>
            <p className="mt-6 text-3xl md:text-5xl font-light tracking-wide drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
              Hondarribia
            </p>
          </div>
        </div>

        {/* Pie — línea fina con info + CTA discreto */}
        <div className="p-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4 text-white">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-slate-300">Matrícula</div>
            <div className="text-xl md:text-2xl font-semibold mt-1">3ª SS-1-2-05</div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/panel"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white text-slate-900 text-sm font-medium hover:bg-slate-100 transition"
            >
              Ver panel de control →
            </Link>
            <Link
              href="/documents"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 backdrop-blur text-white text-sm font-medium border border-white/30 hover:bg-white/20 transition"
            >
              Documentos
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
