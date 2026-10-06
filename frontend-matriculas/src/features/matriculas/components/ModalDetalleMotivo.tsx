import React, { useState, useEffect } from 'react';
import { 
  X, AlertCircle, Calendar, User, Mail, Phone, ArrowRight, 
  ClipboardList, Building2, CheckCircle2, ShieldAlert, FileText, Loader2
} from 'lucide-react';
import { API_BASE_URL } from '../../../config/api';

export interface DetalleMotivoResponse {
  id_matricula: number;
  numero_correlativo: number;
  anio_escolar: number;
  nivel_ensenanza: string;
  curso: string;
  fecha_matricula: string | null;
  estado: string;
  estudiante: {
    id_estudiante: number;
    rut: string;
    nombre_completo: string;
    curso: string;
    nivel_ensenanza: string;
    establecimiento: string;
    rbd: string;
    id_establecimiento: number;
  };
  apoderado: {
    rut: string;
    nombre_completo: string;
    correo: string;
    telefono: string;
  };
  retiro: {
    aplica: boolean;
    fecha_retiro: string | null;
    motivo_oficial: string;
    tiene_encuesta: boolean;
    fecha_encuesta: string | null;
    motivos_seleccionados: string[];
    detalle_adicional: string;
    observaciones: string;
  };
  cambio_curso: {
    aplica: boolean;
    curso_actual: string;
    curso_anterior: string | null;
    folio_actual: number;
    folio_anterior: number | null;
    motivo_crudo: string | null;
    motivos_seleccionados: string[];
    detalle_adicional: string;
    observaciones: string;
  };
}

interface ModalDetalleMotivoProps {
  isOpen: boolean;
  onClose: () => void;
  idMatricula: number | null;
  modoInicial?: 'retiro' | 'cambio_curso';
  onAbrirCertificado?: (idMatricula: number, tipo: 'RETIRO' | 'CAMBIO_CURSO' | 'MATRICULA') => void;
}

export default function ModalDetalleMotivo({
  isOpen,
  onClose,
  idMatricula,
  modoInicial = 'retiro',
  onAbrirCertificado
}: ModalDetalleMotivoProps) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<DetalleMotivoResponse | null>(null);
  const [tabActiva, setTabActiva] = useState<'retiro' | 'cambio_curso'>(modoInicial);

  useEffect(() => {
    if (!isOpen || !idMatricula) {
      setDatos(null);
      setError(null);
      return;
    }

    setTabActiva(modoInicial);
    setCargando(true);
    setError(null);

    const token = localStorage.getItem('token');
    fetch(`${API_BASE_URL}/matriculas/${idMatricula}/detalle-motivo`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'No se pudieron cargar los detalles del motivo.');
        }
        return res.json();
      })
      .then((data: DetalleMotivoResponse) => {
        setDatos(data);
        // Si el modo inicial no aplica pero el otro sí, cambiar tab automáticamente
        if (modoInicial === 'retiro' && !data.retiro.aplica && data.cambio_curso.aplica) {
          setTabActiva('cambio_curso');
        } else if (modoInicial === 'cambio_curso' && !data.cambio_curso.aplica && data.retiro.aplica) {
          setTabActiva('retiro');
        }
      })
      .catch((err: any) => {
        setError(err.message || 'Error de conexión con el servidor.');
      })
      .finally(() => {
        setCargando(false);
      });
  }, [isOpen, idMatricula, modoInicial]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* ENCABEZADO MODAL */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-950 to-indigo-950 p-4 sm:p-5 text-white flex justify-between items-start relative shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 bg-blue-800/80 rounded-lg text-blue-200">
                <FileText size={18} />
              </span>
              <h3 className="font-extrabold text-lg sm:text-xl tracking-tight">
                {tabActiva === 'retiro' ? 'Detalle de Motivo de Retiro' : 'Detalle de Cambio de Curso'}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-blue-200 font-medium">
              Información registrada en el Registro General de Matrículas (RGM)
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-blue-300 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <X size={20} />
          </button>
        </div>

        {/* TABS DE SELECCIÓN SI AMBOS APLICAN */}
        {datos && datos.retiro.aplica && datos.cambio_curso.aplica && (
          <div className="flex border-b border-gray-200 bg-gray-50/80 px-4 pt-2 shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setTabActiva('retiro')}
              className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                tabActiva === 'retiro'
                  ? 'border-red-600 text-red-700 bg-white rounded-t-lg border-t border-x border-gray-200 shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              Causa de Retiro
            </button>
            <button
              type="button"
              onClick={() => setTabActiva('cambio_curso')}
              className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                tabActiva === 'cambio_curso'
                  ? 'border-purple-600 text-purple-700 bg-white rounded-t-lg border-t border-x border-gray-200 shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              Cambio de Curso
            </button>
          </div>
        )}

        {/* CUERPO DEL MODAL (SCROLLABLE) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          
          {cargando && (
            <div className="py-16 text-center space-y-3">
              <Loader2 size={36} className="animate-spin text-blue-600 mx-auto" />
              <p className="text-sm font-bold text-gray-600">Cargando motivos y trazabilidad...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">No se pudo cargar la información</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {datos && !cargando && !error && (
            <>
              {/* FICHA RESUMEN ESTUDIANTE */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Estudiante</span>
                  <p className="font-extrabold text-slate-900 text-sm sm:text-base">{datos.estudiante.nombre_completo}</p>
                  <p className="text-slate-600 font-semibold text-xs mt-0.5">
                    RUT: <span className="font-mono">{datos.estudiante.rut}</span> • Curso: <span className="font-bold text-blue-900">{datos.estudiante.curso}</span> (Folio #{datos.numero_correlativo})
                  </p>
                </div>
                <div className="text-right sm:text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Establecimiento</span>
                  <p className="font-bold text-slate-800 text-xs truncate max-w-xs">{datos.estudiante.establecimiento}</p>
                  <p className="text-slate-500 text-[11px] font-medium">RBD: {datos.estudiante.rbd} • Año: {datos.anio_escolar}</p>
                </div>
              </div>

              {/* CONTENIDO TAB RETIRO */}
              {tabActiva === 'retiro' && (
                <div className="space-y-4">
                  {/* METADATOS CLAVE */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-red-50/70 border border-red-200/80 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider flex items-center gap-1">
                        <Calendar size={13} className="text-red-600" />
                        Fecha de Retiro Oficial
                      </span>
                      <p className="text-base font-extrabold text-red-950 mt-1">
                        {datos.retiro.fecha_retiro || 'No especificada'}
                      </p>
                      {datos.retiro.tiene_encuesta && datos.retiro.fecha_encuesta && (
                        <p className="text-[11px] text-red-700/90 font-medium mt-0.5">
                          Encuesta completada el: {new Date(datos.retiro.fecha_encuesta).toLocaleString('es-CL')}
                        </p>
                      )}
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider block">
                        Causa Administrativa / Estado
                      </span>
                      <p className="text-sm font-extrabold text-gray-900 mt-1">
                        {datos.retiro.motivo_oficial}
                      </p>
                      <div className="mt-1">
                        {datos.retiro.tiene_encuesta ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <CheckCircle2 size={12} />
                            Encuesta Apoderado Validada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                            Retiro Administrativo Directo
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* MOTIVOS SELECCIONADOS POR EL APODERADO */}
                  {datos.retiro.motivos_seleccionados.length > 0 ? (
                    <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4">
                      <h4 className="text-xs font-extrabold uppercase text-amber-900 tracking-wider mb-2.5 flex items-center gap-1.5">
                        <ClipboardList size={16} className="text-amber-700" />
                        Razones declaradas por el apoderado ({datos.retiro.motivos_seleccionados.length}):
                      </h4>
                      <ul className="space-y-2 text-xs sm:text-sm text-amber-950 font-medium">
                        {datos.retiro.motivos_seleccionados.map((motivo, idx) => (
                          <li key={idx} className="flex items-start gap-2 bg-white/70 p-2 rounded-lg border border-amber-100">
                            <span className="text-amber-600 font-extrabold text-base leading-none">•</span>
                            <span className="leading-snug">{motivo}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    datos.retiro.motivo_oficial && datos.retiro.motivo_oficial !== 'Respuesta Apoderado (Confidencial)' && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                        <h4 className="text-xs font-bold uppercase text-slate-700 tracking-wider mb-1">
                          Causa o Motivo Registrado:
                        </h4>
                        <p className="text-xs sm:text-sm text-slate-900 font-semibold">
                          {datos.retiro.motivo_oficial}
                        </p>
                      </div>
                    )
                  )}

                  {/* COMENTARIOS O DETALLES ADICIONALES */}
                  {datos.retiro.detalle_adicional && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <h4 className="text-xs font-bold uppercase text-gray-700 tracking-wider mb-1.5">
                        Comentarios adicionales / Justificación detallada:
                      </h4>
                      <div className="bg-white p-3 rounded-lg border border-gray-100 text-xs sm:text-sm text-gray-800 italic whitespace-pre-wrap font-medium">
                        "{datos.retiro.detalle_adicional}"
                      </div>
                    </div>
                  )}

                  {/* OBSERVACIONES / TRAZABILIDAD */}
                  {datos.retiro.observaciones && (
                    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5">
                      <h4 className="text-xs font-bold uppercase text-slate-600 tracking-wider mb-1 flex items-center gap-1">
                        <ShieldAlert size={14} className="text-slate-500" />
                        Trazabilidad y Observaciones de Auditoría:
                      </h4>
                      <p className="text-xs text-slate-700 font-mono leading-relaxed whitespace-pre-wrap bg-white p-2.5 rounded-lg border border-slate-200">
                        {datos.retiro.observaciones}
                      </p>
                    </div>
                  )}

                  {/* INFORMACIÓN DEL APODERADO */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-700">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                      Datos del Apoderado Titular
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 font-medium">
                      <div className="flex items-center gap-1.5">
                        <User size={13} className="text-gray-400 shrink-0" />
                        <span className="font-bold text-gray-900">{datos.apoderado.nombre_completo}</span>
                        <span className="text-gray-500 font-mono">({datos.apoderado.rut})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Mail size={13} className="text-gray-400 shrink-0" />
                        <span>{datos.apoderado.correo}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CONTENIDO TAB CAMBIO DE CURSO */}
              {tabActiva === 'cambio_curso' && (
                <div className="space-y-4">
                  {/* TRANSICIÓN DE CURSO */}
                  <div className="bg-gradient-to-r from-purple-50 via-purple-50/60 to-indigo-50 border border-purple-200 rounded-xl p-4 flex items-center justify-between gap-2 shadow-xs">
                    <div className="text-left flex-1">
                      <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">Curso Anterior</span>
                      <p className="text-sm sm:text-base font-extrabold text-purple-950 mt-0.5">
                        {datos.cambio_curso.curso_anterior || 'No registrado'}
                      </p>
                      {datos.cambio_curso.folio_anterior ? (
                        <span className="text-[11px] font-bold text-purple-600 bg-purple-100/70 px-2 py-0.5 rounded-md inline-block mt-0.5">
                          Folio #{datos.cambio_curso.folio_anterior}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-center bg-purple-600 text-white w-9 h-9 rounded-full shrink-0 shadow-sm">
                      <ArrowRight size={18} />
                    </div>

                    <div className="text-right flex-1">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">Curso Actual (Destino)</span>
                      <p className="text-sm sm:text-base font-extrabold text-indigo-950 mt-0.5">
                        {datos.cambio_curso.curso_actual}
                      </p>
                      <span className="text-[11px] font-bold text-indigo-600 bg-indigo-100/70 px-2 py-0.5 rounded-md inline-block mt-0.5">
                        Folio #{datos.numero_correlativo}
                      </span>
                    </div>
                  </div>

                  {/* MOTIVOS SELECCIONADOS */}
                  {datos.cambio_curso.motivos_seleccionados.length > 0 ? (
                    <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-4">
                      <h4 className="text-xs font-extrabold uppercase text-purple-900 tracking-wider mb-2.5 flex items-center gap-1.5">
                        <ClipboardList size={16} className="text-purple-700" />
                        Razones declaradas para el cambio de curso ({datos.cambio_curso.motivos_seleccionados.length}):
                      </h4>
                      <ul className="space-y-2 text-xs sm:text-sm text-purple-950 font-medium">
                        {datos.cambio_curso.motivos_seleccionados.map((motivo, idx) => (
                          <li key={idx} className="flex items-start gap-2 bg-white/70 p-2 rounded-lg border border-purple-100">
                            <span className="text-purple-600 font-extrabold text-base leading-none">•</span>
                            <span className="leading-snug">{motivo}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* DETALLE ADICIONAL O MOTIVO CRUDO */}
                  {datos.cambio_curso.detalle_adicional && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <h4 className="text-xs font-bold uppercase text-gray-700 tracking-wider mb-1.5">
                        Detalle / Justificación Registrada:
                      </h4>
                      <div className="bg-white p-3 rounded-lg border border-gray-100 text-xs sm:text-sm text-gray-800 font-medium italic whitespace-pre-wrap">
                        "{datos.cambio_curso.detalle_adicional}"
                      </div>
                    </div>
                  )}

                  {/* OBSERVACIONES DEL CAMBIO */}
                  {datos.cambio_curso.observaciones && (
                    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5">
                      <h4 className="text-xs font-bold uppercase text-slate-600 tracking-wider mb-1 flex items-center gap-1">
                        <ShieldAlert size={14} className="text-slate-500" />
                        Trazabilidad Oficial del Traslado:
                      </h4>
                      <p className="text-xs text-slate-700 font-mono leading-relaxed whitespace-pre-wrap bg-white p-2.5 rounded-lg border border-slate-200">
                        {datos.cambio_curso.observaciones}
                      </p>
                    </div>
                  )}

                  {/* DATOS DEL APODERADO */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-700">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                      Apoderado Solicitante / Informante
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 font-medium">
                      <div className="flex items-center gap-1.5">
                        <User size={13} className="text-gray-400 shrink-0" />
                        <span className="font-bold text-gray-900">{datos.apoderado.nombre_completo}</span>
                        <span className="text-gray-500 font-mono">({datos.apoderado.rut})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Mail size={13} className="text-gray-400 shrink-0" />
                        <span>{datos.apoderado.correo}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* PIE DEL MODAL */}
        <div className="bg-gray-50 px-4 sm:px-6 py-3.5 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {datos && tabActiva === 'retiro' && onAbrirCertificado && (
              <button
                type="button"
                onClick={() => onAbrirCertificado(datos.id_matricula, 'RETIRO')}
                className="bg-red-50 text-red-700 border border-red-300 hover:bg-red-100 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileText size={14} />
                Ver Certificado de Retiro
              </button>
            )}

            {datos && tabActiva === 'cambio_curso' && onAbrirCertificado && (
              <button
                type="button"
                onClick={() => onAbrirCertificado(datos.id_matricula, 'CAMBIO_CURSO')}
                className="bg-purple-50 text-purple-700 border border-purple-300 hover:bg-purple-100 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileText size={14} />
                Ver Comprobante de Traslado
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="bg-slate-700 hover:bg-slate-800 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ml-auto"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
