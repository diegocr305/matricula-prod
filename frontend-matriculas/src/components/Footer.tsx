import { Mail, Code2 } from 'lucide-react';

/**
 * Footer institucional del Sistema RGM Digital — SLEP Valparaíso.
 * Top bar con el nombre del sistema + columnas (identidad / soporte / contacto)
 * y franja decorativa (Gobierno de Chile).
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

      {/* TOP BAR del footer */}
      <div className="bg-[#1d2650] border-b border-white/10">
        <div className="max-w-6xl mx-auto px-9 py-2.5 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-widest text-blue-200 font-['gobCL',_sans-serif]">
            Registro General de Matrícula Digital
          </span>
          <span className="text-[11px] text-blue-300">SLEP Valparaíso</span>
        </div>
      </div>

      {/* COLUMNAS */}
      <div className="max-w-6xl mx-auto px-9 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">

          {/* COLUMNA 1: Logo DEP (grande) */}
          <div className="flex justify-center md:justify-start">
            <img
              src="/images/logo-dep.png"
              alt="Dirección de Educación Pública · Ministerio de Educación"
              className="h-44 w-auto object-contain rounded"
            />
          </div>

          {/* COLUMNA 2: Soporte del sistema */}
          <div className="flex flex-col gap-2 text-center md:text-left">
            <h3 className="text-xs font-bold uppercase tracking-wide text-blue-300 font-['gobCL',_sans-serif]">
              Soporte del sistema
            </h3>
            <p className="flex items-center justify-center md:justify-start gap-2 text-sm font-bold text-white">
              <Code2 size={16} className="shrink-0 text-blue-300" />
              Desarrollado por SLEP Valparaíso
            </p>
            <p className="text-xs text-blue-200">Área de Informática</p>
          </div>

          {/* COLUMNA 3: Contacto */}
          <div className="flex flex-col gap-2 text-center md:text-left">
            <h3 className="text-xs font-bold uppercase tracking-wide text-blue-300 font-['gobCL',_sans-serif]">
              Contacto
            </h3>
            <a
              href="mailto:tecnologia@slepvalparaiso.cl"
              className="flex items-center justify-center md:justify-start gap-2 text-sm text-blue-200 hover:text-white transition-colors"
            >
              <Mail size={16} className="shrink-0" />
              tecnologia@slepvalparaiso.cl
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-4 border-t border-white/15">
          <p className="text-[11px] text-blue-200 text-center">
            © {anio} SLEP Valparaíso · Sistema de Registro General de Matrícula Digital.
            Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
