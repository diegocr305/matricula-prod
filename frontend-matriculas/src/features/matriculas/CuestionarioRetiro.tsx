import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { useCuestionarioRetiro } from './hooks/useCuestionarioRetiro';

const OPCIONES_RETIRO = [
  "Problemas de convivencia en el establecimiento (estudiante y/o apoderado)",
  "Este establecimiento no cuenta con buena infraestructura",
  "Mi hijo/a no ha podido integrarse en su curso",
  "Por comodidad (cercanía al hogar y/o trabajo)",
  "Este establecimiento no entrega la calidad educativa que espero",
  "La forma en que se entrega la enseñanza",
  "No entregan el apoyo especializado que mi hijo/a requiere",
  "Mis ingresos familiares me permitirían buscar una mejor opción",
  "Prefiero la formación valórica de otros establecimientos",
  "El calendario de actividades no se suele respetar",
  "Se deja de lado a mi hijo/a por priorizar apoyo a NEE",
  "Este establecimiento no entrega la oferta académica deseada",
  "Mayor prestigio y/o tradición de otros establecimientos",
  "Otro"
];

export default function CuestionarioRetiro() {
  const {
    rutEstudiante, setRutEstudiante,
    motivosSeleccionados, alternarMotivo,
    motivoDetalle, setMotivoDetalle,
    estado,
    mensajeError,
    enviarCuestionario
  } = useCuestionarioRetiro();

  const [menuAbierto, setMenuAbierto] = useState(false);
  const incluyeOtro = motivosSeleccionados.includes("Otro");

  return (
    <div className="min-h-screen bg-slate-200 flex items-center justify-center p-4 sm:p-8">
      <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-2xl max-w-lg w-full relative overflow-hidden border border-gray-200">
        <div className="absolute top-0 left-0 w-full h-2 flex">
          <div className="w-1/2 bg-blue-700"></div>
          <div className="w-1/2 bg-red-600"></div>
        </div>

        <div className="text-center mb-8 mt-2">
          <img src="/images/logo-slep.negro.png" alt="Logo SLEP" className="h-24 mx-auto mb-5 object-contain" />
          <h2 className="text-2xl sm:text-3xl font-extrabold text-blue-950 tracking-tight">Cuestionario de Retiro</h2>
          <p className="text-sm text-gray-500 mt-3 font-medium">Por normativa del SLEP, solicitamos nos indique los motivos del retiro. Esta información es confidencial.</p>
        </div>

        {estado === 'exito' ? (
          <div className="bg-emerald-50 text-emerald-800 p-6 rounded-xl text-center border border-emerald-200 shadow-inner">
            <div className="text-5xl mb-3">✅</div>
            <p className="font-bold text-lg mb-2">Formulario Recibido</p>
            <p className="text-sm font-medium">Sus respuestas han sido registradas de forma segura. Ya puede cerrar esta pestaña.</p>
          </div>
        ) : (
          <form onSubmit={enviarCuestionario} className="space-y-6">
            <div>
              <label className="block text-sm font-extrabold text-gray-700 mb-2 uppercase tracking-wide">
                RUT del Estudiante <span className="text-xs text-gray-400 normal-case font-medium">(Medida de Seguridad)</span>
              </label>
              <input 
                required 
                type="text" 
                placeholder="Ej: 21123456-7" 
                value={rutEstudiante} 
                onChange={(e) => setRutEstudiante(e.target.value)} 
                disabled={estado === 'cargando'} 
                className="w-full border border-gray-300 rounded-lg p-3.5 text-sm font-medium focus:ring-2 focus:ring-blue-900 focus:border-blue-900 outline-none transition-all bg-gray-50 focus:bg-white" 
              />
            </div>

            {/* Dropdown Multiselección */}
            <div className="relative">
              <label className="block text-sm font-extrabold text-gray-700 mb-2 uppercase tracking-wide">
                Motivos del retiro <span className="text-xs text-blue-700 normal-case font-medium">(Puede seleccionar más de uno)</span>
              </label>
              
              <button
                type="button"
                onClick={() => setMenuAbierto(!menuAbierto)}
                disabled={estado === 'cargando'}
                className="w-full border border-gray-300 rounded-lg p-3.5 text-sm font-medium bg-gray-50 hover:bg-white flex justify-between items-center text-left focus:ring-2 focus:ring-blue-900 transition-all"
              >
                <span className={motivosSeleccionados.length === 0 ? "text-gray-400" : "text-gray-800 font-bold"}>
                  {motivosSeleccionados.length === 0 ? "Haga clic para seleccionar motivos..." : `${motivosSeleccionados.length} motivo(s) seleccionado(s)`}
                </span>
                {menuAbierto ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
              </button>

              {menuAbierto && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto p-2 space-y-1">
                  {OPCIONES_RETIRO.map((opcion) => {
                    const marcada = motivosSeleccionados.includes(opcion);
                    return (
                      <div
                        key={opcion}
                        onClick={() => alternarMotivo(opcion)}
                        className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer text-xs sm:text-sm transition-colors ${
                          marcada ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${
                          marcada ? 'bg-blue-900 border-blue-900 text-white' : 'border-gray-300 bg-white'
                        }`}>
                          {marcada && <Check size={12} strokeWidth={3} />}
                        </div>
                        <span>{opcion}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Chips de opciones seleccionadas */}
              {motivosSeleccionados.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {motivosSeleccionados.map((m) => (
                    <span key={m} className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-900 text-xs px-2.5 py-1 rounded-md font-medium">
                      <span className="truncate max-w-[200px]">{m}</span>
                      <button type="button" onClick={() => alternarMotivo(m)} className="hover:text-red-600">
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Recuadro de comentarios / detalles */}
            {motivosSeleccionados.length > 0 && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm font-extrabold text-gray-700 mb-2 uppercase tracking-wide">
                  {incluyeOtro ? 'Especifique el motivo adicional (Obligatorio)' : 'Detalles o comentarios adicionales (Opcional)'}
                </label>
                <textarea 
                  required={incluyeOtro} 
                  rows={3} 
                  placeholder="Detalle brevemente las razones o circunstancias..." 
                  value={motivoDetalle} 
                  onChange={(e) => setMotivoDetalle(e.target.value)} 
                  disabled={estado === 'cargando'} 
                  className="w-full border border-gray-300 rounded-lg p-3.5 text-sm font-medium focus:ring-2 focus:ring-blue-900 focus:border-blue-900 outline-none resize-none transition-all bg-gray-50 focus:bg-white"
                />
              </div>
            )}

            {estado === 'error' && (
              <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm font-bold border border-red-200 text-center flex items-center justify-center gap-2">
                <span>❌</span> {mensajeError}
              </div>
            )}
            
            <button 
              type="submit" 
              disabled={estado === 'cargando' || !rutEstudiante || motivosSeleccionados.length === 0 || (incluyeOtro && !motivoDetalle.trim())} 
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3.5 px-4 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {estado === 'cargando' ? 'Enviando información segura...' : 'Enviar Respuestas'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}