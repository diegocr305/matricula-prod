import { Check } from 'lucide-react';

export interface PasoStepper {
  /** Etiqueta corta del paso (ej. "Identificación"). */
  titulo: string;
  /** Descripción opcional bajo el título (solo visible en pantallas md+). */
  descripcion?: string;
}

interface StepperProps {
  /** Lista de pasos a mostrar, en orden. */
  pasos: PasoStepper[];
  /** Paso actual, 1-indexado (1 = primer paso). */
  pasoActual: number;
  /** Clase extra opcional para el contenedor. */
  className?: string;
}

/**
 * Indicador de progreso por pasos, estilo guía de Gobierno Digital de Chile.
 * Muestra círculos numerados conectados por una línea; los pasos anteriores al
 * actual se marcan como completados (check), el actual se resalta y los
 * siguientes quedan atenuados. Puramente visual: no controla la navegación.
 */
export default function Stepper({ pasos, pasoActual, className = '' }: StepperProps) {
  return (
    <nav aria-label="Progreso del proceso" className={`w-full ${className}`}>
      <ol className="flex items-start">
        {pasos.map((paso, idx) => {
          const numero = idx + 1;
          const completado = numero < pasoActual;
          const activo = numero === pasoActual;
          const esUltimo = idx === pasos.length - 1;

          return (
            <li key={paso.titulo} className="flex-1 flex flex-col items-center relative">
              {/* Línea conectora hacia el siguiente paso */}
              {!esUltimo && (
                <span
                  aria-hidden="true"
                  className={`absolute top-4 left-1/2 w-full h-0.5 ${
                    completado ? 'bg-[#006BB9]' : 'bg-gray-200'
                  }`}
                />
              )}

              {/* Círculo del paso */}
              <span
                className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-bold transition-colors ${
                  completado
                    ? 'bg-[#006BB9] border-[#006BB9] text-white'
                    : activo
                    ? 'bg-white border-[#006BB9] text-[#006BB9] ring-4 ring-[#006BB9]/15'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}
                aria-current={activo ? 'step' : undefined}
              >
                {completado ? <Check size={16} strokeWidth={3} /> : numero}
              </span>

              {/* Etiqueta */}
              <span className="mt-2 text-center px-1">
                <span
                  className={`block text-xs font-bold leading-tight ${
                    activo ? 'text-[#25306B]' : completado ? 'text-[#006BB9]' : 'text-gray-400'
                  }`}
                >
                  {paso.titulo}
                </span>
                {paso.descripcion && (
                  <span className="hidden md:block text-[10px] text-gray-400 mt-0.5 leading-tight">
                    {paso.descripcion}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
