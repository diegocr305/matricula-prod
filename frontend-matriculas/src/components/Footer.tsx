import { Mail, Code2, MapPin, ShieldCheck } from 'lucide-react';

/**
 * Footer institucional del Sistema RGM Digital — SLEP Valparaíso.
 * Columnas: identidad (logo DEP) / soporte / contacto / marco normativo.
 * Franja decorativa (Gobierno de Chile) en el borde superior.
 */
export default function Footer() {
  const anio = new Date().getFullYear();

  return (
    <footer className="bg-[#25306B] text-white shrink-0 font-['Museo_Sans',_sans-serif]">
      {/* Franja decorativa superior (Gobierno de Chile) */}
      <div className="w-full h-1.5 flex">
        <div className="w-1/2 bg-[#006BB9]"></div>
        <div className="w-1/2 bg-[#FF1D3D]"></div>
      </div>

      {/* COLUMNAS */}
      <div className="max-w-6xl mx-auto px-9 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">

          {/* COLUMNA 1: Logo DEP + identidad */}
          <div className="flex flex-col items-center md:items-start gap-2">
            <img
              src="/images/logo-dep.png"
              alt="Dirección de Educación Pública · Ministerio de Educación"
              className="h-24 w-auto object-contain rounded"
            />
            <p className="text-[11px] text-blue-200 leading-relaxed text-center md:text-left">
              Servicio Local de Educación Pública de Valparaíso.
            </p>
          </div>

          {/* COLUMNA 2: Soporte del sistema */}
          <div className="flex flex-col gap-1.5 text-center md:text-left">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-blue-300 font-['gobCL',_sans-serif] mb-1">
              Soporte del sistema
            </h3>
            <p className="flex items-center justify-center md:justify-start gap-2 text-sm font-bold text-white">
              <Code2 size={15} className="shrink-0 text-blue-300" />
              Desarrollado por SLEP Valparaíso
            </p>
            <p className="text-xs text-blue-200">Área de Informática</p>
          </div>

          {/* COLUMNA 3: Contacto */}
          <div className="flex flex-col gap-1.5 text-center md:text-left">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-blue-300 font-['gobCL',_sans-serif] mb-1">
              Contacto
            </h3>
            <a
              href="mailto:tecnologia@slepvalparaiso.cl"
              className="flex items-center justify-center md:justify-start gap-2 text-xs text-blue-200 hover:text-white transition-colors"
            >
              <Mail size={14} className="shrink-0" />
              tecnologia@slepvalparaiso.cl
            </a>
            <p className="flex items-center justify-center md:justify-start gap-2 text-xs text-blue-200">
              <MapPin size={14} className="shrink-0" />
              Blanco 937, 2° piso, Valparaíso
            </p>
          </div>

          {/* COLUMNA 4: Marco normativo */}
          <div className="flex flex-col gap-1.5 text-center md:text-left">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-blue-300 font-['gobCL',_sans-serif] mb-1">
              Marco normativo
            </h3>
            <p className="flex items-start justify-center md:justify-start gap-2 text-xs text-blue-200 leading-relaxed">
              <ShieldCheck size={14} className="shrink-0 mt-0.5" />
              Registro General de Matrícula conforme a la Resolución Exenta 0030/2021 (Superintendencia de Educación).
            </p>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 pt-3 border-t border-white/15">
          <p className="text-[11px] text-blue-200 text-center">
            © {anio} SLEP Valparaíso · Sistema de Registro General de Matrícula Digital.
            Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
