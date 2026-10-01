import { MapPin, Mail, Phone } from 'lucide-react';

/** Íconos de redes como SVG inline (lucide-react ya no exporta logos de marca). */
function IconInstagram() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function IconYoutube() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  );
}

/**
 * Footer institucional del Sistema RGM Digital — SLEP Valparaíso.
 * Estilo gobierno digital: columnas de identidad / contacto / redes,
 * franja decorativa inferior y crédito del Área de Informática.
 */
export default function Footer() {
  const anio = new Date().getFullYear();

  return (
    <footer className="bg-[#25306B] text-white shrink-0 font-['Museo_Sans',_sans-serif]">
      {/* Contenido principal */}
      <div className="px-9 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">

          {/* COLUMNA 1: Identidad institucional */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-white font-['gobCL',_sans-serif]">
              SLEP Valparaíso
            </h3>
            <p className="text-xs text-blue-200 leading-relaxed">
              Servicio Local de Educación Pública de Valparaíso. Registro General
              de Matrícula (RGM) Digital, al servicio de los establecimientos
              educacionales del territorio.
            </p>
          </div>

          {/* COLUMNA 2: Contacto */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-white font-['gobCL',_sans-serif]">
              Contacto
            </h3>
            <ul className="flex flex-col gap-2 text-xs text-blue-200">
              <li className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 shrink-0" />
                <span>Blanco 937, 2° piso, Valparaíso</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={14} className="shrink-0" />
                <a
                  href="mailto:oficinadepartes@slepvalparaiso.cl"
                  className="hover:text-white transition-colors"
                >
                  oficinadepartes@slepvalparaiso.cl
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone size={14} className="shrink-0" />
                <span>Mesa central SLEP Valparaíso</span>
              </li>
            </ul>

            {/* Redes sociales */}
            <div className="flex items-center gap-3 mt-1">
              <a
                href="https://www.instagram.com/slep_valparaiso"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram SLEP Valparaíso"
                className="text-blue-200 hover:text-white transition-colors"
              >
                <IconInstagram />
              </a>
              <a
                href="https://www.facebook.com/slep_valparaiso"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook SLEP Valparaíso"
                className="text-blue-200 hover:text-white transition-colors"
              >
                <IconFacebook />
              </a>
              <a
                href="https://www.youtube.com/@slep_valparaiso"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube SLEP Valparaíso"
                className="text-blue-200 hover:text-white transition-colors"
              >
                <IconYoutube />
              </a>
            </div>
          </div>

          {/* COLUMNA 3: Desarrollo / soporte técnico + logo DEP */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-white font-['gobCL',_sans-serif]">
              Soporte del sistema
            </h3>
            <p className="text-xs text-blue-200 leading-relaxed">
              Desarrollado por SLEP Valparaíso · Área de Informática.
            </p>
            <a
              href="mailto:tecnologia@slepvalparaiso.cl"
              className="flex items-center gap-2 text-xs text-blue-200 hover:text-white transition-colors"
            >
              <Mail size={14} className="shrink-0" />
              tecnologia@slepvalparaiso.cl
            </a>

            <div className="mt-2">
              <img
                src="/images/logo-dep.png"
                alt="Dirección de Educación Pública"
                className="h-12 w-auto object-contain bg-white/95 rounded px-3 py-2"
              />
            </div>
          </div>
        </div>

        {/* Línea de copyright */}
        <div className="max-w-6xl mx-auto mt-8 pt-4 border-t border-white/15">
          <p className="text-[11px] text-blue-200 text-center">
            © {anio} SLEP Valparaíso · Sistema de Registro General de Matrícula Digital.
            Todos los derechos reservados.
          </p>
        </div>
      </div>

      {/* Franja decorativa inferior (Gobierno de Chile) */}
      <div className="w-full h-1 flex">
        <div className="w-1/2 bg-[#006BB9]"></div>
        <div className="w-1/2 bg-[#FF1D3D]"></div>
      </div>
    </footer>
  );
}
