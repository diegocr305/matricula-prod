import { Mail } from 'lucide-react';

/**
 * Footer institucional del Sistema RGM Digital — SLEP Valparaíso.
 * Barra sutil: crédito del Área de Informática destacado, correo de contacto
 * y copyright. Franja decorativa fina (Gobierno de Chile) en el borde superior.
 */
export default function Footer() {
  const anio = new Date().getFullYear();

  return (
    <footer className="bg-[#25306B] text-white shrink-0 font-['Museo_Sans',_sans-serif]">
      {/* Franja decorativa superior (Gobierno de Chile) */}
      <div className="w-full h-0.5 flex">
        <div className="w-1/2 bg-[#006BB9]"></div>
        <div className="w-1/2 bg-[#FF1D3D]"></div>
      </div>

      {/* Barra compacta */}
      <div className="max-w-6xl mx-auto px-9 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src="/images/logo-dep.png"
            alt="Dirección de Educación Pública · Ministerio de Educación"
            className="h-16 w-auto object-contain rounded-sm"
          />
          <p className="text-xs font-bold text-white tracking-wide">
            Desarrollado por SLEP Valparaíso · Área de Informática
          </p>
        </div>

        <div className="flex items-center gap-5 text-[11px] text-blue-200">
          <a
            href="mailto:tecnologia@slepvalparaiso.cl"
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <Mail size={13} className="shrink-0" />
            tecnologia@slepvalparaiso.cl
          </a>
          <span className="hidden sm:inline text-white/30">|</span>
          <span>© {anio} SLEP Valparaíso</span>
        </div>
      </div>
    </footer>
  );
}
