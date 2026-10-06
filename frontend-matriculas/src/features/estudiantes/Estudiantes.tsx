// Estudiantes.tsx
import React from 'react';
import { 
  Search, User, UserCheck, Clock, ArrowLeft, ChevronRight, ChevronLeft, 
  UserPlus, Edit2, Save, X, CheckCircle, HeartPulse, ShieldAlert, Activity, 
  Stethoscope, Check, FileText, Globe, Building2, ChevronDown, ChevronUp, Calendar, Info 
} from 'lucide-react';
import { useEstudiantes } from './hooks/useEstudiantes'; 
import { API_BASE_URL } from '../../config/api';
import ModalDetalleMotivo from '../matriculas/components/ModalDetalleMotivo';

export default function Estudiantes() {
  const {
    puedeEditar,
    datosEstudiante, setDatosEstudiante,
    modoEdicion, setModoEdicion,
    guardandoEdicion, handleGuardarEdicion,
    textoBusqueda, setTextoBusqueda,
    cargandoLista, estudiantesFiltrados,
    verFichaEstudiante,
    datosEdicion, setDatosEdicion,
    // Contexto Institucional y Búsqueda Global
    colegioSeleccionado, setColegioSeleccionado, establecimientos, esPerfilGlobal,
    busquedaGlobal, setBusquedaGlobal,
    // Paginación
    page, setPage, totalPages, total,
    // Wizard Nuevo Estudiante
    vistaCrearEstudiante, setVistaCrearEstudiante,
    pasoCrear, irSiguientePasoCrear, irPasoAnteriorCrear, iniciarCrearEstudiante,
    estudianteCreadoExito, rutRecienCreado, cerrarModalExito, irAMatricular, navegandoAMatricular,
    nuevoEstudiante, setNuevoEstudiante, formatearRUT, handleCrearEstudiante,
    creando, buscarSugerencias, buscandoMapa, sugerenciasMapa, seleccionarDireccion, archivoTutor, setArchivoTutor,
    
    filtroAnio, setFiltroAnio,
    filtroCodigo, setFiltroCodigo,
    filtroCurso, setFiltroCurso,
    aniosUnicos, codigosUnicos, cursosUnicos,
    buscarApoderadoPorRut, buscandoApoderado, avisoApoderado
  } = useEstudiantes();

  const esIpeEstudiante = nuevoEstudiante.run.replace(/[^0-9kK]/g, '').length >= 10;
  const esIpaApoderado = nuevoEstudiante.run_apoderado.replace(/[^0-9kK]/g, '').length >= 10;

  // Estado para el historial RGM colapsable y detalles individuales por matrícula
  const [historialExpandido, setHistorialExpandido] = React.useState(false);
  const [detallesAbiertos, setDetallesAbiertos] = React.useState<Record<number, boolean>>({});
  const [modalDetalleMotivoAbierto, setModalDetalleMotivoAbierto] = React.useState(false);
  const [idMatriculaDetalleMotivo, setIdMatriculaDetalleMotivo] = React.useState<number | null>(null);
  const [modoDetalleMotivo, setModoDetalleMotivo] = React.useState<'retiro' | 'cambio_curso'>('retiro');

  const abrirModalDetalleMotivo = (id: number, modo: 'retiro' | 'cambio_curso') => {
    setIdMatriculaDetalleMotivo(id);
    setModoDetalleMotivo(modo);
    setModalDetalleMotivoAbierto(true);
  };

  const toggleDetalleMatricula = (id: number) => {
    setDetallesAbiertos(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto relative pb-10">
      
      {/* =======================================================================
          CABECERA GLOBAL DINÁMICA
          ======================================================================= */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {(datosEstudiante || vistaCrearEstudiante) && (
            <button 
              onClick={() => { 
                setDatosEstudiante(null); 
                setModoEdicion(false); 
                setVistaCrearEstudiante(false); 
              }} 
              className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h1 className="text-2xl font-bold text-gray-800">
            {vistaCrearEstudiante 
              ? 'Ingreso de Nuevo Estudiante' 
              : datosEstudiante 
              ? (modoEdicion ? 'Editando Ficha Completa del Estudiante' : 'Ficha del Estudiante') 
              : 'Directorio de Estudiantes'}
          </h1>
        </div>
        
        {vistaCrearEstudiante ? (
          <div className="hidden sm:flex items-center gap-2 text-sm font-bold">
            <span className={`px-3 py-1 rounded-full ${pasoCrear >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>1. Estudiante</span>
            <div className={`w-8 h-1 ${pasoCrear >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            <span className={`px-3 py-1 rounded-full ${pasoCrear >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>2. Apoderados</span>
            <div className={`w-8 h-1 ${pasoCrear >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            <span className={`px-3 py-1 rounded-full ${pasoCrear >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>3. Ficha Médica</span>
          </div>
        ) : !datosEstudiante ? (
          <div className="flex gap-3">
            {puedeEditar && (
              <button 
                onClick={iniciarCrearEstudiante} 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-sm"
              >
                <UserPlus size={20} /> Nuevo Estudiante
              </button>
            )}
          </div>
        ) : (
          !modoEdicion ? (
            puedeEditar && (
              <button 
                onClick={() => setModoEdicion(true)} 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-sm"
              >
                <Edit2 size={18} /> Editar Ficha Completa
              </button>
            )
          ) : (
            <div className="flex gap-2">
              <button 
                onClick={() => setModoEdicion(false)} 
                className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <X size={18} /> Cancelar
              </button>
              <button 
                onClick={handleGuardarEdicion} 
                disabled={guardandoEdicion} 
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-bold transition-colors shadow-md disabled:opacity-50"
              >
                <Save size={18} /> {guardandoEdicion ? 'Guardando...' : 'Guardar Todos los Cambios'}
              </button>
            </div>
          )
        )}
      </div>

      {/* =======================================================================
          VISTA: ASISTENTE INTEGRAL DE CREACIÓN
          ======================================================================= */}
      {vistaCrearEstudiante && (
        estudianteCreadoExito ? (
          <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-200 text-center max-w-xl mx-auto animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={44} />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2">¡Estudiante Registrado con Éxito!</h3>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              El estudiante quedó registrado en la base de datos central bajo el identificador <strong className="font-mono bg-gray-100 px-2 py-0.5 rounded text-blue-800">{rutRecienCreado}</strong>, junto a sus apoderados y su ficha médica completa.
            </p>

            {/* Banner de carga visible al presionar "Matricular Ahora" */}
            {navegandoAMatricular && (
              <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center gap-3 text-blue-800 text-sm font-semibold">
                <svg className="animate-spin h-5 w-5 text-blue-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Cargando datos del estudiante, por favor espere...
              </div>
            )}

            <div className="flex justify-center gap-4">
              <button 
                onClick={cerrarModalExito}
                disabled={navegandoAMatricular}
                className="px-6 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold transition-colors"
              >
                Volver al Directorio
              </button>
              <button 
                onClick={irAMatricular}
                disabled={navegandoAMatricular}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors flex items-center gap-2 shadow-md"
              >
                {navegandoAMatricular ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Cargando...
                  </>
                ) : (
                  <>Matricular Ahora <ChevronRight size={18} /></>
                )}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCrearEstudiante} className="space-y-6">
            
            {/* PASO 1: DATOS PERSONALES */}
            {pasoCrear === 1 && (
              <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="border-b pb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-gray-800">Paso 1: Identificación y Datos Personales del Estudiante</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Ingrese los antecedentes de identidad y geolocalización de residencia del alumno.</p>
                  </div>
                  <span className="text-xs font-bold bg-blue-100 text-blue-800 px-3 py-1 rounded-full">Paso 1 de 3</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">RUN o IPE <span className="text-red-500">*</span></label>
                    <input 
                      required type="text" placeholder="Ej: 21123456-7" 
                      value={nuevoEstudiante.run} 
                      onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, run: formatearRUT(e.target.value)})} 
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono" 
                      maxLength={12} 
                    />
                  </div>

                  {esIpeEstudiante && (
                    <div className="col-span-full bg-blue-50 border border-blue-200 p-4 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200">
                      <div>
                        <label className="block text-xs font-bold text-blue-900 mb-1">País de Origen del Estudiante <span className="text-red-500">*</span></label>
                        <input 
                          required 
                          type="text" 
                          placeholder="Ej: Venezuela, Colombia, Perú, etc." 
                          value={nuevoEstudiante.pais_origen_estudiante || ''} 
                          onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, pais_origen_estudiante: e.target.value})} 
                          className="w-full border border-blue-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-blue-900 mb-1">Documento Nacional Extranjero <span className="text-red-500">*</span></label>
                        <input 
                          required type="text" placeholder="N° DNI o Pasaporte del Estudiante" 
                          value={nuevoEstudiante.doc_extranjero_estudiante || ''} 
                          onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, doc_extranjero_estudiante: e.target.value})} 
                          className="w-full border border-blue-300 rounded-lg p-2 text-sm bg-white" 
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nombres <span className="text-red-500">*</span></label>
                    <input required type="text" value={nuevoEstudiante.nombres} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, nombres: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Apellido Paterno <span className="text-red-500">*</span></label>
                    <input required type="text" value={nuevoEstudiante.apellido_paterno} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, apellido_paterno: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Apellido Materno <span className="text-red-500">*</span></label>
                    <input required type="text" value={nuevoEstudiante.apellido_materno} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, apellido_materno: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Fecha de Nacimiento <span className="text-red-500">*</span></label>
                    <input required type="date" value={nuevoEstudiante.fecha_nacimiento} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, fecha_nacimiento: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Sexo <span className="text-red-500">*</span></label>
                    <select required value={nuevoEstudiante.sexo} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, sexo: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white">
                      <option value="Masculino">Masculino</option>
                      <option value="Femenino">Femenino</option>
                      <option value="No Informado">No Informado</option>
                    </select>
                  </div>
                </div>

                {/* Geolocalización */}
                <div className="relative pt-2 border-t">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Domicilio Actual del Estudiante <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <input 
                      required type="text" placeholder="Ej: Calle Prat 450, Valparaíso" 
                      value={nuevoEstudiante.domicilio} 
                      onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, domicilio: e.target.value, latitud: '', longitud: ''})} 
                      className="flex-1 border border-gray-300 rounded-lg p-2.5 text-sm" 
                    />
                    <button 
                      type="button" onClick={buscarSugerencias} disabled={buscandoMapa} 
                      className={`px-4 text-xs font-bold rounded-lg border transition-colors ${nuevoEstudiante.latitud ? 'bg-green-100 text-green-700 border-green-300' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                    >
                      {buscandoMapa ? 'Buscando...' : (nuevoEstudiante.latitud ? '✓ Validado' : '🔍 Validar Mapa')}
                    </button>
                  </div>
                  {sugerenciasMapa.length > 0 && (
                    <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {sugerenciasMapa.map((lugar: any, idx: number) => (
                        <li key={idx} onClick={() => seleccionarDireccion(lugar)} className="p-3 border-b hover:bg-blue-50 cursor-pointer text-sm">
                          {lugar.display_name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <button 
                    type="button" onClick={irSiguientePasoCrear} 
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-colors"
                  >
                    Siguiente: Apoderados <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* PASO 2: APODERADO TITULAR Y SUPLENTE */}
            {pasoCrear === 2 && (
              <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 space-y-8 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="border-b pb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-gray-800">Paso 2: Directorio de Apoderados</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Defina al Apoderado Titular responsable y, de forma opcional pero recomendada, a su suplente de contacto.</p>
                  </div>
                  <span className="text-xs font-bold bg-blue-100 text-blue-800 px-3 py-1 rounded-full">Paso 2 de 3</span>
                </div>

                {/* Apoderado Titular */}
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-emerald-800 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> 1. Apoderado Titular (Obligatorio)
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-emerald-50/50 p-5 rounded-xl border border-emerald-100">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Parentesco con el Estudiante <span className="text-red-500">*</span></label>
                      <select 
                        required value={nuevoEstudiante.relacion_estudiante} 
                        onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, relacion_estudiante: e.target.value})} 
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                      >
                        <option value="">Seleccione parentesco...</option>
                        <option value="Madre">Madre</option>
                        <option value="Padre">Padre</option>
                        <option value="Abuelo Paterno">Abuelo Paterno</option>
                        <option value="Abuela Paterna">Abuela Paterna</option>
                        <option value="Abuelo Materno">Abuelo Materno</option>
                        <option value="Abuela Materna">Abuela Materna</option>
                        <option value="Tutor Legal Designado">Tutor Legal Designado (Medida Judicial/Proteccional)</option>
                      </select>
                    </div>

                    {nuevoEstudiante.relacion_estudiante === 'Tutor Legal Designado' && (
                      <div className="md:col-span-2 bg-orange-50 border border-orange-200 p-4 rounded-xl">
                        <label className="block text-xs font-bold text-orange-900 mb-2">Adjuntar Resolución Judicial / Notarial de Tutoría (PDF) <span className="text-red-500">*</span></label>
                        <input required={!archivoTutor} type="file" accept=".pdf" onChange={(e) => setArchivoTutor(e.target.files?.[0] || null)} className="text-sm" />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">RUT o Pasaporte <span className="text-red-500">*</span></label>
                      <input required type="text" placeholder="Ej: 12345678-9" value={nuevoEstudiante.run_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, run_apoderado: formatearRUT(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-mono" maxLength={15} />
                    </div>

                    {esIpaApoderado && (
                      <div className="col-span-full bg-emerald-50 border border-emerald-200 p-4 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200">
                        <div>
                          <label className="block text-xs font-bold text-emerald-900 mb-1">País de Origen del Apoderado Titular <span className="text-red-500">*</span></label>
                          <input 
                            required 
                            type="text" 
                            placeholder="Ej: Venezuela, Colombia, Perú, etc." 
                            value={nuevoEstudiante.pais_origen_apoderado || ''} 
                            onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, pais_origen_apoderado: e.target.value})} 
                            className="w-full border border-emerald-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-emerald-900 mb-1">Documento Nacional Extranjero (DNI o Pasaporte) <span className="text-red-500">*</span></label>
                          <input 
                            required type="text" placeholder="N° DNI o Pasaporte del Apoderado" 
                            value={nuevoEstudiante.doc_extranjero_apoderado || ''} 
                            onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, doc_extranjero_apoderado: e.target.value})} 
                            className="w-full border border-emerald-300 rounded-lg p-2 text-sm bg-white" 
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Nombres <span className="text-red-500">*</span></label>
                      <input required type="text" value={nuevoEstudiante.nombres_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, nombres_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Apellido Paterno <span className="text-red-500">*</span></label>
                      <input required type="text" value={nuevoEstudiante.apellido_paterno_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, apellido_paterno_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Apellido Materno</label>
                      <input type="text" value={nuevoEstudiante.apellido_materno_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, apellido_materno_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono Móvil <span className="text-red-500">*</span></label>
                      <input required type="text" placeholder="+569..." value={nuevoEstudiante.telefono_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, telefono_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Correo Electrónico <span className="text-red-500">*</span></label>
                      <input required type="email" value={nuevoEstudiante.correo_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, correo_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Domicilio del Apoderado <span className="text-red-500">*</span></label>
                      <div className="flex gap-2">
                        <input required type="text" value={nuevoEstudiante.domicilio_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, domicilio_apoderado: e.target.value})} className="flex-1 border border-gray-300 rounded-lg p-2.5 text-sm" />
                        <button type="button" onClick={() => setNuevoEstudiante({...nuevoEstudiante, domicilio_apoderado: nuevoEstudiante.domicilio})} className="px-3 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg hover:bg-emerald-200 transition-colors">Copiar Estudiante</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Apoderado Suplente */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span> 2. Apoderado Suplente (Opcional)
                    </h4>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                      <input 
                        type="checkbox" checked={nuevoEstudiante.tiene_suplente} 
                        onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, tiene_suplente: e.target.checked})} 
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      Habilitar registro de Suplente
                    </label>
                  </div>

                  {nuevoEstudiante.tiene_suplente ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-5 rounded-xl border border-gray-200 animate-in fade-in duration-200">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">RUT Suplente <span className="text-red-500">*</span></label>
                        <input required={nuevoEstudiante.tiene_suplente} type="text" placeholder="Ej: 15987654-3" value={nuevoEstudiante.run_suplente} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, run_suplente: formatearRUT(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-mono" maxLength={12} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Parentesco / Relación</label>
                        <input type="text" placeholder="Ej: Tía, Hermano mayor, etc." value={nuevoEstudiante.relacion_suplente} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, relacion_suplente: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Nombres <span className="text-red-500">*</span></label>
                        <input required={nuevoEstudiante.tiene_suplente} type="text" value={nuevoEstudiante.nombres_suplente} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, nombres_suplente: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Apellido Paterno <span className="text-red-500">*</span></label>
                        <input required={nuevoEstudiante.tiene_suplente} type="text" value={nuevoEstudiante.apellido_paterno_suplente} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, apellido_paterno_suplente: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Apellido Materno</label>
                        <input type="text" placeholder="Segundo apellido (opcional)" value={nuevoEstudiante.apellido_materno_suplente} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, apellido_materno_suplente: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono Móvil <span className="text-red-500">*</span></label>
                        <input required={nuevoEstudiante.tiene_suplente} type="text" placeholder="+569..." value={nuevoEstudiante.telefono_suplente} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, telefono_suplente: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Correo Electrónico</label>
                        <input type="email" value={nuevoEstudiante.correo_suplente} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, correo_suplente: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No se registrará un apoderado suplente para este alumno.</p>
                  )}
                </div>

                <div className="flex justify-between pt-4 border-t">
                  <button type="button" onClick={irPasoAnteriorCrear} className="flex items-center gap-2 px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors">
                    <ChevronLeft size={18} /> Volver
                  </button>
                  <button type="button" onClick={irSiguientePasoCrear} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-colors">
                    Siguiente: Ficha Médica <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* PASO 3: FICHA MÉDICA COMPLETA */}
            {pasoCrear === 3 && (
              <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="border-b pb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-gray-800">Paso 3: Ficha Médica y Antecedentes Clínicos</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Toda la información de previsión, centros de atención y condiciones médicas declaradas.</p>
                  </div>
                  <span className="text-xs font-bold bg-blue-100 text-blue-800 px-3 py-1 rounded-full">Paso 3 de 3</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Cobertura */}
                  <div className="p-5 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                    <h4 className="text-xs font-black text-gray-600 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
                      <Activity size={16} className="text-blue-600" /> Cobertura Asistencial
                    </h4>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Previsión / Sistema <span className="text-red-500">*</span></label>
                      <select value={nuevoEstudiante.sistema_salud} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, sistema_salud: e.target.value})} className="w-full border rounded-lg p-2 text-sm bg-white">
                        <option value="FONASA">FONASA</option>
                        <option value="ISAPRE">ISAPRE</option>
                        <option value="DIPRECA">DIPRECA</option>
                        <option value="CAPREDENA">CAPREDENA</option>
                        <option value="Particular">Particular</option>
                        <option value="Sin Información">Sin Información</option>
                      </select>
                    </div>

                    {nuevoEstudiante.sistema_salud === 'FONASA' && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Tramo FONASA</label>
                        <select value={nuevoEstudiante.letra_fonasa} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, letra_fonasa: e.target.value})} className="w-full border rounded-lg p-2 text-sm bg-white">
                          <option value="A">Tramo A</option>
                          <option value="B">Tramo B</option>
                          <option value="C">Tramo C</option>
                          <option value="D">Tramo D</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">CESFAM Asignado <span className="text-red-500">*</span></label>
                      <input required type="text" placeholder="Ej: CESFAM Jean y Marie Thierry" value={nuevoEstudiante.cesfam} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, cesfam: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Centro en Caso de Emergencia <span className="text-red-500">*</span></label>
                      <input required type="text" placeholder="Ej: Hospital Carlos Van Buren" value={nuevoEstudiante.centro_emergencia} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, centro_emergencia: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                    </div>
                  </div>

                  {/* Diagnóstico y Medicamentos */}
                  <div className="p-5 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                    <h4 className="text-xs font-black text-gray-600 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
                      <Stethoscope size={16} className="text-emerald-600" /> Diagnóstico y Fármacos
                    </h4>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">¿Presenta Diagnóstico Médico? <span className="text-red-500">*</span></label>
                      <select value={nuevoEstudiante.diagnostico_medico} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, diagnostico_medico: e.target.value})} className="w-full border rounded-lg p-2 text-sm bg-white">
                        <option value="No">No</option>
                        <option value="Sí">Sí</option>
                      </select>
                    </div>

                    {nuevoEstudiante.diagnostico_medico === 'Sí' && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Nombre Médico Tratante</label>
                        <input type="text" placeholder="Dr/a..." value={nuevoEstudiante.medico_tratante} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, medico_tratante: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Medicamentos Frecuentes / Permanentes</label>
                      <textarea rows={3} placeholder="Detalle medicamento y dosis, o deje vacío si no requiere..." value={nuevoEstudiante.medicamento} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, medicamento: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                    </div>
                  </div>

                  {/* Alergias e Inclusión */}
                  <div className="p-5 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                    <h4 className="text-xs font-black text-gray-600 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
                      <ShieldAlert size={16} className="text-rose-600" /> Alergias e Inclusión (NEE)
                    </h4>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Alergias Alimentarias o Medicamentosas</label>
                      <textarea rows={2} placeholder="Ej: Alergia a la penicilina, maní, celiaquía..." value={nuevoEstudiante.alergias} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, alergias: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Programa PIE / NEE <span className="text-red-500">*</span></label>
                      <select value={nuevoEstudiante.nee} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, nee: e.target.value})} className="w-full border rounded-lg p-2 text-sm bg-white">
                        <option value="No">No</option>
                        <option value="Sí">Sí</option>
                      </select>
                    </div>

                    {nuevoEstudiante.nee === 'Sí' && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Tipo de NEE Declarada</label>
                        <input type="text" placeholder="Ej: TEA, TDAH, DIL, etc." value={nuevoEstudiante.nee_tipo} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, nee_tipo: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-between pt-6 border-t">
                  <button type="button" onClick={irPasoAnteriorCrear} className="flex items-center gap-2 px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors">
                    <ChevronLeft size={18} /> Volver
                  </button>
                  <button 
                    type="submit" disabled={creando} 
                    className="flex items-center gap-2 px-8 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold shadow-lg transition-all disabled:opacity-50"
                  >
                    {creando ? 'Guardando Registro Completo...' : <><Check size={20} /> Finalizar y Crear Estudiante</>}
                  </button>
                </div>
              </div>
            )}

          </form>
        )
      )}

      {/* =======================================================================
          VISTA 1: DIRECTORIO DE ESTUDIANTES
          ======================================================================= */}
      {!vistaCrearEstudiante && !datosEstudiante && (
        esPerfilGlobal && !colegioSeleccionado && !busquedaGlobal ? (
          /* PANTALLA DE BLOQUEO / SELECCIÓN OBLIGATORIA (IDÉNTICA A MATRÍCULAS) */
          <div className="bg-white border border-blue-200 p-8 sm:p-12 rounded-2xl shadow-sm text-center flex flex-col items-center justify-center max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
            <div className="w-16 h-16 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center shadow-inner text-3xl">
              🏫
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">
                Seleccione un Establecimiento Educacional
              </h2>
              <p className="text-sm text-gray-600 max-w-xl leading-relaxed">
                Para consultar el registro oficial y hacer uso de las funcionalidades del sistema, debe seleccionar un colegio específico.
              </p>
            </div>

            {/* Selector directo de establecimiento */}
            <div className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 text-left space-y-2">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                🏫 Establecimiento:
              </label>
              <select
                value={colegioSeleccionado}
                onChange={(e) => {
                  if (setColegioSeleccionado) setColegioSeleccionado(e.target.value);
                }}
                className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">-- Seleccione un establecimiento de la lista --</option>
                {establecimientos.map((col: any) => (
                  <option key={col.id_establecimiento} value={col.id_establecimiento}>
                    {col.nombre} {col.rbd ? `(RBD: ${col.rbd})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative flex items-center justify-center w-full">
              <div className="border-t border-gray-200 w-full"></div>
              <span className="bg-white px-3 text-xs text-gray-400 font-bold uppercase tracking-wider absolute">O bien</span>
            </div>

            {/* Opción Búsqueda General */}
            <div 
              onClick={() => setBusquedaGlobal(true)}
              className="w-full p-4 bg-blue-50/70 border border-blue-200 rounded-xl text-left flex items-start gap-3.5 hover:bg-blue-100/60 transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                id="check-busqueda-global-vacio"
                checked={busquedaGlobal}
                onChange={(e) => setBusquedaGlobal(e.target.checked)}
                className="mt-1 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="check-busqueda-global-vacio" className="text-sm cursor-pointer select-none">
                <span className="font-bold text-blue-950 flex items-center gap-1.5">
                  <Globe size={16} className="text-blue-600" /> Búsqueda General en todos los Establecimientos (Red SLEP)
                </span>
                <span className="block text-xs text-blue-700 mt-1 leading-relaxed">
                  Permite buscar rápidamente a cualquier estudiante ingresando su RUT o nombre, incluso si no conoce su colegio actual o no se encuentra matriculado en ningún establecimiento.
                </span>
              </label>
            </div>
          </div>
        ) : (
          /* TABLA / DIRECTORIO DE ESTUDIANTES */
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            
            {/* Barra informativa de Modo para Perfiles Globales */}
            {esPerfilGlobal && (
              <div className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3 text-sm ${
                busquedaGlobal 
                  ? 'bg-amber-50 border-amber-200 text-amber-900' 
                  : 'bg-blue-50 border-blue-100 text-blue-900'
              }`}>
                <div className="flex items-center gap-2">
                  {busquedaGlobal ? (
                    <>
                      <Globe size={18} className="text-amber-600 shrink-0" />
                      <span className="font-bold">Modo Búsqueda General Activo:</span>
                      <span className="text-xs text-amber-800">Buscando en toda la Red SLEP Valparaíso</span>
                    </>
                  ) : (
                    <>
                      <Building2 size={18} className="text-blue-600 shrink-0" />
                      <span className="font-bold">Establecimiento seleccionado:</span>
                      <span className="text-xs text-blue-800 font-medium">
                        {establecimientos.find((e: any) => String(e.id_establecimiento) === String(colegioSeleccionado))?.nombre || `ID: ${colegioSeleccionado}`}
                      </span>
                    </>
                  )}
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={busquedaGlobal}
                    onChange={(e) => setBusquedaGlobal(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <Globe size={14} className={busquedaGlobal ? "text-amber-600" : "text-blue-600"} />
                  <span>🌐 Búsqueda general en todos los colegios</span>
                </label>
              </div>
            )}

            {/* Fila de Filtros */}
            <div className={`p-4 border-b border-gray-100 bg-gray-50 grid grid-cols-1 ${busquedaGlobal ? 'md:grid-cols-2' : 'md:grid-cols-4'} gap-4`}>
              <div className={busquedaGlobal ? 'md:col-span-1' : ''}>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">🔍 Buscar</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  <input 
                    type="text" 
                    placeholder={busquedaGlobal ? "Escriba RUT o Nombre (mínimo 2 caracteres)..." : "RUT o Nombre..."}
                    value={textoBusqueda} 
                    onChange={(e) => setTextoBusqueda(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
              </div>

              {!busquedaGlobal ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">📅 1. Año</label>
                    <select value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none bg-white cursor-pointer">
                      <option value="">Todos los años</option>
                      {aniosUnicos.map((anio: any) => <option key={anio} value={anio}>{anio}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">📚 2. Plan de Estudio</label>
                    <select value={filtroCodigo} onChange={(e) => setFiltroCodigo(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none bg-white cursor-pointer">
                      <option value="">Todos los planes</option>
                      {codigosUnicos.map((cod: any) => <option key={cod} value={cod}>Cod. {cod}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">🏫 3. Curso</label>
                    <select value={filtroCurso} onChange={(e) => setFiltroCurso(e.target.value)} disabled={cursosUnicos.length === 0} className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none bg-white disabled:bg-gray-100 disabled:text-gray-400">
                      <option value="">Todos los cursos</option>
                      {cursosUnicos.map((curso: any) => <option key={curso} value={curso}>{curso}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">📅 Filtrar por Año (Opcional)</label>
                  <select value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none bg-white cursor-pointer">
                    <option value="">Histórico (Todos los años)</option>
                    {aniosUnicos.map((anio: any) => <option key={anio} value={anio}>{anio}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Listado de Resultados */}
            <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {busquedaGlobal && (!textoBusqueda || textoBusqueda.trim().length < 2) ? (
                <div className="p-10 text-center text-gray-500 space-y-2">
                  <div className="text-3xl">🌐</div>
                  <p className="font-bold text-gray-700">Ingrese al menos 2 caracteres en el buscador</p>
                  <p className="text-xs text-gray-500 max-w-md mx-auto">
                    Para consultar en toda la Red SLEP Valparaíso (más de 35.000 registros), escriba el RUT o parte del nombre del estudiante.
                  </p>
                </div>
              ) : cargandoLista ? (
                <div className="p-8 text-center text-gray-500 flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>Cargando estudiantes...</span>
                </div>
              ) : estudiantesFiltrados.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No se encontraron estudiantes que coincidan con los criterios de búsqueda.
                </div>
              ) : (
                estudiantesFiltrados.map((est: any) => (
                  <li key={est.id}>
                    <button 
                      onClick={() => verFichaEstudiante(est.run)}
                      className="w-full flex items-center justify-between p-4 hover:bg-blue-50/60 transition-colors text-left"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-800 text-base">{est.nombre_completo}</p>
                          {est.estado && (
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                              est.estado.toLowerCase() === 'activa' ? 'bg-emerald-100 text-emerald-800' :
                              est.estado.toLowerCase() === 'retirada' || est.estado.toLowerCase() === 'inactiva' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {est.estado}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-mono font-medium text-gray-700">RUT: {est.run}</span>
                          {est.curso && <span>• Curso: {est.curso}</span>}
                          {est.anio && <span>• Año: {est.anio}</span>}
                          {(busquedaGlobal || esPerfilGlobal) && est.nombre_colegio && (
                            <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs font-semibold">
                              🏫 {est.nombre_colegio}
                            </span>
                          )}
                          {(busquedaGlobal || esPerfilGlobal) && !est.nombre_colegio && (
                            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs font-medium">
                              Sin matrícula activa registrada
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-blue-500 shrink-0 ml-4"><ChevronRight size={20} /></div>
                    </button>
                  </li>
                ))
              )}
            </ul>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="p-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-600 font-medium">
                  Página <strong className="text-gray-900">{page}</strong> de <strong className="text-gray-900">{totalPages}</strong> ({total} estudiantes)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1 || cargandoLista}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors flex items-center gap-1"
                  >
                    <ChevronLeft size={16} /> Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages || cargandoLista}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors flex items-center gap-1"
                  >
                    Siguiente <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

          </div>
        )
      )}

      {/* =======================================================================
          VISTA 2: FICHA DETALLADA DEL ESTUDIANTE (MODO VISTA / MODO EDICIÓN TOTAL)
          ======================================================================= */}
      {!vistaCrearEstudiante && datosEstudiante && (() => {
        const historialOrdenado = [...(datosEstudiante.historial || [])].sort((a: any, b: any) => {
          const anioA = Number(a.anio) || 0;
          const anioB = Number(b.anio) || 0;
          if (anioB !== anioA) {
            return anioB - anioA;
          }
          return (Number(b.id) || 0) - (Number(a.id) || 0);
        });
        const ultimaMatricula = historialOrdenado.length > 0 ? historialOrdenado[0] : null;

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-right-8 duration-300">
            
            {/* Columna Izquierda: Identificación e Historial */}
            <div className="space-y-6 lg:col-span-1">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-fit">
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><User size={24} /></div>
                  <h2 className="text-lg font-bold text-gray-800">Datos Personales</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">RUN / IPE</p>
                    <p className="font-mono font-bold text-gray-800">{datosEstudiante.personal.run}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Nombre Completo</p>
                    <p className="font-medium text-gray-900">{datosEstudiante.personal.nombres} {datosEstudiante.personal.apellidos}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Fecha Nacimiento</p>
                    <p className="font-medium text-gray-700">{datosEstudiante.personal.fecha_nacimiento}</p>
                  </div>
                  {datosEstudiante.personal.pais_origen && datosEstudiante.personal.pais_origen !== 'Chile' && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase">País de Origen</p>
                      <p className="font-semibold text-blue-700">{datosEstudiante.personal.pais_origen}</p>
                    </div>
                  )}
                  {datosEstudiante.personal.documento_extranjero && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase">Doc. Extranjero (DNI/Pasaporte)</p>
                      <p className="font-mono font-medium text-gray-800">{datosEstudiante.personal.documento_extranjero}</p>
                    </div>
                  )}
                  
                  <div className="pt-2 border-t border-gray-50">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Última Matrícula Registrada</p>
                    <p className="font-bold text-blue-800">{ultimaMatricula ? ultimaMatricula.establecimiento : 'Sin registro'}</p>
                    <p className="text-xs text-gray-500 font-mono">RBD: {ultimaMatricula ? ultimaMatricula.rbd : 'N/A'}</p>
                  </div>

                  <div className="pt-2 border-t border-gray-50">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">
                      Domicilio Actual {modoEdicion && <span className="text-red-500">*</span>}
                    </p>
                    {!modoEdicion ? (
                      <p className="font-medium text-gray-800">{datosEstudiante.personal.domicilio}</p>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Calle</label>
                          <input 
                            type="text" 
                            placeholder="Ej: Av. Brasil" 
                            value={datosEdicion.calle || ''} 
                            onChange={(e) => setDatosEdicion({...datosEdicion, calle: e.target.value})} 
                            className="w-full border border-blue-300 bg-blue-50/50 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium" 
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Número</label>
                            <input 
                              type="text" 
                              placeholder="Ej: 1234" 
                              value={datosEdicion.numero || ''} 
                              onChange={(e) => setDatosEdicion({...datosEdicion, numero: e.target.value})} 
                              className="w-full border border-blue-300 bg-blue-50/50 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Sector / Cerro</label>
                            <input 
                              type="text" 
                              placeholder="Ej: Cerro Alegre" 
                              value={datosEdicion.sector || ''} 
                              onChange={(e) => setDatosEdicion({...datosEdicion, sector: e.target.value})} 
                              className="w-full border border-blue-300 bg-blue-50/50 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium" 
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Comuna</label>
                          <input 
                            type="text" 
                            placeholder="Ej: Valparaíso" 
                            value={datosEdicion.comuna || ''} 
                            onChange={(e) => setDatosEdicion({...datosEdicion, comuna: e.target.value})} 
                            className="w-full border border-blue-300 bg-blue-50/50 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium" 
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Historial RGM */}
              {(() => {
                const anioActual = new Date().getFullYear();
                const LIMITE_VISIBLE = 4;
                const registrosVisibles = historialExpandido
                  ? historialOrdenado
                  : historialOrdenado.slice(0, LIMITE_VISIBLE);
                const hayMas = historialOrdenado.length > LIMITE_VISIBLE;

                const coloresEstado: Record<string, string> = {
                  Activa:      'bg-green-100 text-green-700 border border-green-200',
                  Retirado:    'bg-red-50 text-red-600 border border-red-100',
                  Inactiva:    'bg-orange-50 text-orange-600 border border-orange-100',
                  Anulada:     'bg-gray-100 text-gray-400 border border-gray-200',
                  Promovido:   'bg-blue-100 text-blue-700 border border-blue-200',
                  Repitente:   'bg-amber-100 text-amber-800 border border-amber-200',
                  Trasladado:  'bg-purple-100 text-purple-800 border border-purple-200',
                };

                return (
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><Clock size={24} /></div>
                        <div>
                          <h2 className="text-lg font-bold text-gray-800">Historial RGM</h2>
                          <p className="text-xs text-gray-400">
                            {historialOrdenado.length} registro{historialOrdenado.length !== 1 ? 's' : ''} en total
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {historialOrdenado.length === 0 && (
                        <p className="text-sm text-center text-gray-400 py-4">Sin historial de matrículas</p>
                      )}

                      {registrosVisibles.map((reg: any) => {
                        const esVigente = reg.estado === 'Activa' && reg.anio === anioActual;
                        const esActivoAnterior = reg.estado === 'Activa' && !esVigente;
                        const esTraslado = (reg.estado === 'Retirado' || reg.estado === 'Inactiva') &&
                          ((reg.motivo_retiro && reg.motivo_retiro.toLowerCase().includes('traslado')) ||
                           (reg.observaciones && reg.observaciones.toLowerCase().includes('traslado')));

                        let badgeLabel = reg.estado;
                        let badgeCls = coloresEstado[reg.estado] ?? 'bg-gray-100 text-gray-500 border border-gray-200';

                        if (esTraslado) {
                          badgeLabel = 'Trasladado';
                          badgeCls = coloresEstado['Trasladado'];
                        } else if (esActivoAnterior) {
                          badgeLabel = 'Promovido';
                          badgeCls = 'bg-gray-100 text-gray-500 border border-gray-200';
                        }

                        const estaAbierto = !!detallesAbiertos[reg.id];

                        // Desglose de observaciones/hitos de trazabilidad garantizando confidencialidad
                        const tieneObservaciones = reg.observaciones && reg.observaciones.trim() !== '' && reg.observaciones !== 'Sin observaciones.';
                        const hitosObservaciones = tieneObservaciones 
                          ? reg.observaciones.split('|').map((s: string) => {
                              const t = s.trim();
                              if (t.includes('[Motivos de Retiro]')) {
                                return 'Retiro formalizado mediante cuestionario confidencial de apoderado.';
                              }
                              return t;
                            }).filter(Boolean)
                          : [];

                        return (
                          <div
                            key={reg.id}
                            className={`flex flex-col rounded-xl border transition-all duration-200 overflow-hidden ${
                              esVigente
                                ? 'bg-green-50/60 border-green-200 shadow-2xs'
                                : esTraslado
                                ? 'bg-purple-50/40 border-purple-200 shadow-2xs'
                                : 'bg-gray-50/80 border-gray-200/80 hover:border-gray-300'
                            }`}
                          >
                            {/* Fila Principal / Cabecera Resumen de la Matrícula */}
                            <div className="flex items-center justify-between p-3 gap-3">
                              {/* Izquierda: Pill de Año + Colegio y Curso */}
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={`shrink-0 w-12 text-center text-xs font-black rounded-lg py-1.5 shadow-2xs ${
                                  esVigente ? 'bg-green-600 text-white' : esTraslado ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'
                                }`}>
                                  {reg.anio}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className={`text-xs font-bold truncate ${esVigente ? 'text-green-950' : 'text-gray-900'}`}>
                                    {reg.establecimiento}
                                  </p>
                                  <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono mt-0.5">
                                    <span className="font-semibold text-gray-700">{reg.curso || 'Sin curso'}</span>
                                    <span>·</span>
                                    <span>RBD: {reg.rbd}</span>
                                    {reg.fecha_retiro && (
                                      <>
                                        <span>·</span>
                                        <span className="text-red-600 font-sans font-medium">Retiro: {reg.fecha_retiro}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Derecha: Badge Estado + Pestaña / Botón de Detalle */}
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${badgeCls}`}>
                                  {badgeLabel}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => toggleDetalleMatricula(reg.id)}
                                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                                    estaAbierto
                                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                      : 'bg-white text-gray-700 hover:text-purple-700 hover:bg-purple-50/80 border-gray-300 hover:border-purple-300 shadow-2xs'
                                  }`}
                                  title={estaAbierto ? "Ocultar detalles de la matrícula" : "Ver detalles completos de la matrícula"}
                                >
                                  <span>Detalle</span>
                                  {estaAbierto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                              </div>
                            </div>

                            {/* Pestaña / Panel Desplegable de Detalles Ordenados */}
                            {estaAbierto && (
                              <div className="px-3.5 pb-3.5 pt-2.5 border-t border-gray-200/80 bg-white/80 space-y-2.5">
                                {/* Cuadrícula de Información Estructurada */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  <div className="bg-white p-2.5 rounded-lg border border-gray-200 shadow-2xs">
                                    <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Fecha de Matrícula</span>
                                    <p className="font-semibold text-gray-800 mt-0.5 flex items-center gap-1.5">
                                      <Calendar size={13} className="text-purple-500" />
                                      {reg.fecha_matricula || 'No registrada'}
                                    </p>
                                  </div>

                                  <div className="bg-white p-2.5 rounded-lg border border-gray-200 shadow-2xs">
                                    <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Curso y Nivel</span>
                                    <p className="font-semibold text-gray-800 mt-0.5">
                                      {reg.curso || 'Sin curso asignado'} {reg.nivel_ensenanza ? `· ${reg.nivel_ensenanza}` : ''}
                                    </p>
                                  </div>

                                  {reg.fecha_retiro && (
                                    <div className="bg-red-50/60 p-2.5 rounded-lg border border-red-200 shadow-2xs">
                                      <span className="text-[10px] uppercase font-bold text-red-500 block tracking-wider">Fecha de Retiro Oficial</span>
                                      <p className="font-semibold text-red-800 mt-0.5">
                                        {reg.fecha_retiro}
                                      </p>
                                    </div>
                                  )}

                                  {reg.motivo_retiro && (
                                    <div className="bg-red-50/60 p-2.5 rounded-lg border border-red-200 shadow-2xs">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] uppercase font-bold text-red-500 block tracking-wider">Causa / Motivo del Retiro</span>
                                        <button
                                          type="button"
                                          onClick={() => abrirModalDetalleMotivo(reg.id, 'retiro')}
                                          className="text-[11px] font-bold text-red-700 hover:text-red-900 underline cursor-pointer"
                                          title="Ver razones y justificación de retiro"
                                        >
                                          Ver Razones
                                        </button>
                                      </div>
                                      <p className="font-semibold text-red-800 mt-0.5">
                                        {reg.motivo_retiro}
                                      </p>
                                    </div>
                                  )}

                                  {reg.motivo_cambio_curso && !reg.motivo_cambio_curso.startsWith('PENDIENTE_TRASLADO') && (
                                    <div className="bg-purple-50/60 p-2.5 rounded-lg border border-purple-200 shadow-2xs">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] uppercase font-bold text-purple-700 block tracking-wider">Cambio de Curso / Traslado</span>
                                        <button
                                          type="button"
                                          onClick={() => abrirModalDetalleMotivo(reg.id, 'cambio_curso')}
                                          className="text-[11px] font-bold text-purple-700 hover:text-purple-900 underline cursor-pointer"
                                          title="Ver justificación y detalles del cambio de curso"
                                        >
                                          Ver Justificación
                                        </button>
                                      </div>
                                      <p className="font-semibold text-purple-900 mt-0.5 truncate">
                                        {reg.motivo_cambio_curso}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Bloque de Trazabilidad y Observaciones Desglosado */}
                                {hitosObservaciones.length > 0 && (
                                  <div className="bg-white p-2.5 rounded-lg border border-gray-200 shadow-2xs space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-gray-700">
                                      <Info size={13} className="text-purple-600" />
                                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                                        Trazabilidad y Observaciones
                                      </span>
                                    </div>
                                    <div className="space-y-1 pl-1">
                                      {hitosObservaciones.map((hito: string, idx: number) => (
                                        <div key={idx} className="flex items-start gap-2 text-[11px] text-gray-600 leading-relaxed">
                                          <span className="text-purple-600 font-bold shrink-0 mt-0.5">•</span>
                                          <span>{hito}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Certificado de Traslado si existe */}
                                {reg.ruta_documento_traslado && (
                                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-50 border border-purple-200 shadow-2xs">
                                    <div className="flex items-center gap-2 text-purple-900">
                                      <FileText size={15} className="text-purple-600 shrink-0" />
                                      <span className="text-xs font-bold">Certificado de Traslado Oficial Adjunto</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const token = localStorage.getItem('token');
                                        window.open(`${API_BASE_URL}/documentos/adjunto?tipo=traslado&id=${reg.id}&token=${token}`, '_blank');
                                      }}
                                      className="px-3 py-1 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-md shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                                      title="Descargar Certificado de Traslado Adjunto"
                                    >
                                      <span>Descargar</span>
                                      <ChevronRight size={13} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Toggle expandir / colapsar */}
                    {hayMas && (
                      <button
                        onClick={() => setHistorialExpandido(prev => !prev)}
                        className="mt-3 w-full text-xs font-semibold text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg py-2 transition-colors border border-purple-100"
                      >
                        {historialExpandido
                          ? '▲ Mostrar menos'
                          : `▼ Ver historial completo (${historialOrdenado.length - LIMITE_VISIBLE} más)`}
                      </button>
                    )}
                  </div>
                );
              })()}

            </div>

            {/* Columna Derecha: Directorio de Apoderados y Ficha de Salud */}
            <div className="space-y-6 lg:col-span-2">
              
              {/* Directorio de Apoderados */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><UserCheck size={24} /></div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Directorio de Apoderados</h2>
                    <p className="text-xs text-gray-500">Apoderado titular responsable y apoderado suplente ante emergencias</p>
                  </div>
                </div>
                
                {/* 1. Apoderado Titular */}
                <div className="space-y-3">
                  <h3 className="text-sm font-black text-emerald-800 uppercase flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Apoderado Titular
                  </h3>

                  {!modoEdicion ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <div><p className="text-xs font-bold text-gray-500 uppercase">Nombre Completo</p><p className="font-semibold text-gray-800">{datosEstudiante.apoderado?.nombre || 'Sin registrar'}</p></div>
                      <div><p className="text-xs font-bold text-gray-500 uppercase">RUT</p><p className="font-mono font-medium text-gray-800">{datosEstudiante.apoderado?.rut || 'Sin registrar'}</p></div>
                      <div><p className="text-xs font-bold text-gray-500 uppercase">Parentesco</p><p className="font-medium text-gray-700">{datosEstudiante.apoderado?.relacion || 'No informado'}</p></div>
                      <div><p className="text-xs font-bold text-gray-500 uppercase">Teléfono Móvil</p><p className="font-medium text-gray-700">{datosEstudiante.apoderado?.telefono || '-'}</p></div>
                      <div className="sm:col-span-2"><p className="text-xs font-bold text-gray-500 uppercase">Correo Electrónico</p><p className="font-medium text-gray-700">{datosEstudiante.apoderado?.correo || '-'}</p></div>
                      <div className="sm:col-span-2"><p className="text-xs font-bold text-gray-500 uppercase">Domicilio</p><p className="font-medium text-gray-700">{datosEstudiante.apoderado?.domicilio || 'Sin registrar'}</p></div>
                      {datosEstudiante.apoderado?.pais_origen && datosEstudiante.apoderado.pais_origen !== 'Chile' && (
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase">País de Origen</p>
                          <p className="font-semibold text-emerald-800">{datosEstudiante.apoderado.pais_origen}</p>
                        </div>
                      )}
                      {datosEstudiante.apoderado?.documento_extranjero && (
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase">Doc. Extranjero (DNI/Pasaporte)</p>
                          <p className="font-mono font-medium text-gray-800">{datosEstudiante.apoderado.documento_extranjero}</p>
                        </div>
                      )}
                      {datosEstudiante.apoderado?.ruta_documento_tutor && (
                        <div className="sm:col-span-2 pt-3 border-t border-gray-200 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-emerald-800 uppercase">Documento de Tutoría Legal</p>
                            <p className="text-xs text-gray-500">Acreditación / Resolución judicial adjunta</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const token = localStorage.getItem('token');
                              window.open(`${API_BASE_URL}/documentos/adjunto?tipo=tutor&id=${encodeURIComponent(datosEstudiante.personal.run)}&token=${token}`, '_blank');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer"
                          >
                            <FileText size={15} /> Ver Documento PDF
                          </button>
                        </div>
                      )}
                    </div>

                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-emerald-50/40 p-4 rounded-xl border border-emerald-200">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">RUT Apoderado <span className="text-red-500">*</span></label>
                        <div className="flex gap-1.5">
                          <input type="text" value={datosEdicion.rut_apoderado || ''} onChange={(e) => setDatosEdicion({...datosEdicion, rut_apoderado: formatearRUT(e.target.value)})} placeholder="12345678-9" className="w-full border border-gray-300 rounded-lg p-2 text-sm font-mono bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                          <button type="button" onClick={buscarApoderadoPorRut} disabled={buscandoApoderado} className="px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50">
                            {buscandoApoderado ? '...' : 'Buscar'}
                          </button>
                        </div>
                      </div>
                      {avisoApoderado && (
                        <div className="sm:col-span-2 text-xs p-2.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                          {avisoApoderado}
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Parentesco <span className="text-red-500">*</span></label>
                        <select value={datosEdicion.relacion_apoderado || 'Madre'} onChange={(e) => setDatosEdicion({...datosEdicion, relacion_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="Madre">Madre</option>
                          <option value="Padre">Padre</option>
                          <option value="Abuelo Paterno">Abuelo Paterno</option>
                          <option value="Abuela Paterna">Abuela Paterna</option>
                          <option value="Abuelo Materno">Abuelo Materno</option>
                          <option value="Abuela Materna">Abuela Materna</option>
                          <option value="Tutor Legal Designado">Tutor Legal Designado</option>
                          <option value="Otro">Otro</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Nombres <span className="text-red-500">*</span></label>
                        <input type="text" value={datosEdicion.nombres_apoderado || ''} onChange={(e) => setDatosEdicion({...datosEdicion, nombres_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Apellido Paterno <span className="text-red-500">*</span></label>
                        <input type="text" value={datosEdicion.apellido_paterno_apoderado || ''} onChange={(e) => setDatosEdicion({...datosEdicion, apellido_paterno_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Apellido Materno</label>
                        <input type="text" value={datosEdicion.apellido_materno_apoderado || ''} onChange={(e) => setDatosEdicion({...datosEdicion, apellido_materno_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono Móvil <span className="text-red-500">*</span></label>
                        <input type="text" value={datosEdicion.telefono_apoderado || ''} onChange={(e) => setDatosEdicion({...datosEdicion, telefono_apoderado: e.target.value})} placeholder="+569..." className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">Correo Electrónico <span className="text-red-500">*</span></label>
                        <input type="email" value={datosEdicion.correo_apoderado || ''} onChange={(e) => setDatosEdicion({...datosEdicion, correo_apoderado: e.target.value})} placeholder="correo@ejemplo.com" className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="sm:col-span-2">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs font-bold text-gray-700">Domicilio Apoderado <span className="text-red-500">*</span></label>
                          <button type="button" onClick={() => setDatosEdicion({...datosEdicion, domicilio_apoderado: datosEdicion.domicilio})} className="text-xs text-blue-600 font-bold hover:underline">Copiar del Alumno</button>
                        </div>
                        <input type="text" value={datosEdicion.domicilio_apoderado || ''} onChange={(e) => setDatosEdicion({...datosEdicion, domicilio_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Apoderado Suplente */}
                <div className="space-y-3 pt-3 border-t">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-600 uppercase flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span> Apoderado Suplente
                    </h3>
                    {modoEdicion && (
                      <label className="flex items-center gap-2 text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={Boolean(datosEdicion.tiene_suplente)} 
                          onChange={(e) => setDatosEdicion({...datosEdicion, tiene_suplente: e.target.checked})} 
                          className="rounded text-blue-600"
                        />
                        Habilitar Apoderado Suplente
                      </label>
                    )}
                  </div>

                  {!modoEdicion ? (
                    datosEstudiante.apoderado_suplente?.rut ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50/60">
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Nombre</p><p className="font-medium text-gray-800 text-sm">{datosEstudiante.apoderado_suplente.nombre}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">RUT</p><p className="font-medium text-gray-800 text-sm font-mono">{datosEstudiante.apoderado_suplente.rut}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Parentesco</p><p className="font-medium text-gray-700 text-sm">{datosEstudiante.apoderado_suplente.relacion || 'Suplente'}</p></div>
                        <div><p className="text-xs font-bold text-gray-500 uppercase">Teléfono Móvil</p><p className="font-medium text-gray-700 text-sm">{datosEstudiante.apoderado_suplente.telefono || '-'}</p></div>
                        <div className="sm:col-span-2"><p className="text-xs font-bold text-gray-500 uppercase">Correo Electrónico</p><p className="font-medium text-gray-700 text-sm">{datosEstudiante.apoderado_suplente.correo || '-'}</p></div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border border-dashed border-gray-300 text-center text-sm text-gray-500 bg-gray-50">
                        El estudiante no tiene un apoderado suplente registrado en el sistema.
                      </div>
                    )
                  ) : (
                    datosEdicion.tiene_suplente ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-gray-50 p-4 rounded-xl border border-gray-200 animate-in fade-in">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">RUT Suplente <span className="text-red-500">*</span></label>
                          <input type="text" value={datosEdicion.rut_suplente || ''} onChange={(e) => setDatosEdicion({...datosEdicion, rut_suplente: formatearRUT(e.target.value)})} placeholder="Ej: 15987654-3" className="w-full border border-gray-300 rounded-lg p-2 text-sm font-mono bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Parentesco</label>
                          <input type="text" value={datosEdicion.relacion_suplente || ''} onChange={(e) => setDatosEdicion({...datosEdicion, relacion_suplente: e.target.value})} placeholder="Ej: Tía, Hermano mayor..." className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Nombres <span className="text-red-500">*</span></label>
                          <input type="text" value={datosEdicion.nombres_suplente || ''} onChange={(e) => setDatosEdicion({...datosEdicion, nombres_suplente: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Apellido Paterno <span className="text-red-500">*</span></label>
                          <input type="text" value={datosEdicion.apellido_paterno_suplente || ''} onChange={(e) => setDatosEdicion({...datosEdicion, apellido_paterno_suplente: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Apellido Materno</label>
                          <input type="text" value={datosEdicion.apellido_materno_suplente || ''} onChange={(e) => setDatosEdicion({...datosEdicion, apellido_materno_suplente: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono Móvil <span className="text-red-500">*</span></label>
                          <input type="text" value={datosEdicion.telefono_suplente || ''} onChange={(e) => setDatosEdicion({...datosEdicion, telefono_suplente: e.target.value})} placeholder="+569..." className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-gray-700 mb-1">Correo Electrónico</label>
                          <input type="email" value={datosEdicion.correo_suplente || ''} onChange={(e) => setDatosEdicion({...datosEdicion, correo_suplente: e.target.value})} placeholder="correo@ejemplo.com" className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">No se encuentra configurado un apoderado suplente.</p>
                    )
                  )}
                </div>
              </div>

              {/* Ficha Médica y Salud */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                  <div className="p-2 bg-rose-50 rounded-lg text-rose-600"><HeartPulse size={24} /></div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Ficha Médica y Antecedentes Clínicos</h2>
                    <p className="text-xs text-gray-500">Previsión de salud, centros asistenciales y requerimientos especiales</p>
                  </div>
                </div>

                {!modoEdicion ? (
                  datosEstudiante.salud ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Cobertura */}
                      <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-3">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Activity size={14} className="text-blue-600" /> Cobertura Asistencial
                        </h4>
                        <div>
                          <p className="text-xs text-gray-500">Previsión</p>
                          <p className="font-semibold text-sm text-gray-800">
                            {datosEstudiante.salud.sistema_salud}
                            {datosEstudiante.salud.letra_fonasa && datosEstudiante.salud.letra_fonasa !== '-' && (
                              <span className="ml-1.5 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">
                                Tramo {datosEstudiante.salud.letra_fonasa}
                              </span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">CESFAM Asignado</p>
                          <p className="font-medium text-sm text-gray-800">{datosEstudiante.salud.cesfam || 'No informado'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Centro en Emergencias</p>
                          <p className="font-medium text-sm text-gray-800">{datosEstudiante.salud.centro_emergencia || 'No informado'}</p>
                        </div>
                      </div>

                      {/* Diagnóstico y Fármacos */}
                      <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-3">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Stethoscope size={14} className="text-emerald-600" /> Diagnóstico y Fármacos
                        </h4>
                        <div>
                          <p className="text-xs text-gray-500">Diagnóstico Médico</p>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${datosEstudiante.salud.diagnostico_medico === 'Sí' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'}`}>
                            {datosEstudiante.salud.diagnostico_medico || 'No'}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Médico Tratante</p>
                          <p className="font-medium text-sm text-gray-800">{datosEstudiante.salud.medico_tratante || 'No informado'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Medicamentos Frecuentes</p>
                          <p className={`text-sm ${datosEstudiante.salud.medicamento ? 'font-bold text-blue-700' : 'font-medium text-gray-800'}`}>
                            {datosEstudiante.salud.medicamento || 'No requiere'}
                          </p>
                        </div>
                      </div>

                      {/* Alergias e Inclusión */}
                      <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-3">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <ShieldAlert size={14} className="text-rose-600" /> Alergias e Inclusión
                        </h4>
                        <div>
                          <p className="text-xs text-gray-500">Alergias</p>
                          <p className={`text-sm ${datosEstudiante.salud.alergias ? 'font-bold text-amber-800 bg-amber-50 p-1 rounded' : 'font-medium text-gray-800'}`}>
                            {datosEstudiante.salud.alergias || 'Ninguna registrada'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Programa NEE / PIE</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${datosEstudiante.salud.nee === 'Sí' ? 'bg-purple-100 text-purple-800' : 'bg-gray-200 text-gray-700'}`}>
                              {datosEstudiante.salud.nee || 'No'}
                            </span>
                            {datosEstudiante.salud.nee_tipo && datosEstudiante.salud.nee_tipo !== 'No aplica' && (
                              <span className="text-xs text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded">
                                {datosEstudiante.salud.nee_tipo}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-gray-300 text-center text-sm text-gray-500 bg-gray-50">
                      Sin antecedentes clínicos registrados.
                    </div>
                  )
                ) : (
                  /* Formulario de Edición de Salud */
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-rose-50/30 p-5 rounded-xl border border-rose-200">
                    
                    {/* Cobertura */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-blue-900 uppercase flex items-center gap-1.5 border-b pb-1">
                        <Activity size={14} className="text-blue-600" /> 1. Previsión
                      </h4>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Sistema de Salud</label>
                        <select value={datosEdicion.sistema_salud || 'FONASA'} onChange={(e) => setDatosEdicion({...datosEdicion, sistema_salud: e.target.value})} className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="FONASA">FONASA</option>
                          <option value="ISAPRE">ISAPRE</option>
                          <option value="DIPRECA">DIPRECA</option>
                          <option value="CAPREDENA">CAPREDENA</option>
                          <option value="Particular">Particular</option>
                          <option value="Sin Información">Sin Información</option>
                        </select>
                      </div>

                      {datosEdicion.sistema_salud === 'FONASA' && (
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Tramo FONASA</label>
                          <select value={datosEdicion.letra_fonasa || 'A'} onChange={(e) => setDatosEdicion({...datosEdicion, letra_fonasa: e.target.value})} className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="A">Tramo A</option>
                            <option value="B">Tramo B</option>
                            <option value="C">Tramo C</option>
                            <option value="D">Tramo D</option>
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">CESFAM Asignado</label>
                        <input type="text" value={datosEdicion.cesfam || ''} onChange={(e) => setDatosEdicion({...datosEdicion, cesfam: e.target.value})} placeholder="CESFAM..." className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Centro de Emergencia</label>
                        <input type="text" value={datosEdicion.centro_emergencia || ''} onChange={(e) => setDatosEdicion({...datosEdicion, centro_emergencia: e.target.value})} placeholder="Hospital / SAR..." className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>

                    {/* Diagnóstico y Medicamentos */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-emerald-900 uppercase flex items-center gap-1.5 border-b pb-1">
                        <Stethoscope size={14} className="text-emerald-600" /> 2. Fármacos y Control
                      </h4>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">¿Presenta Diagnóstico?</label>
                        <select value={datosEdicion.diagnostico_medico || 'No'} onChange={(e) => setDatosEdicion({...datosEdicion, diagnostico_medico: e.target.value})} className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="No">No</option>
                          <option value="Sí">Sí</option>
                        </select>
                      </div>

                      {datosEdicion.diagnostico_medico === 'Sí' && (
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Médico Tratante</label>
                          <input type="text" value={datosEdicion.medico_tratante || ''} onChange={(e) => setDatosEdicion({...datosEdicion, medico_tratante: e.target.value})} placeholder="Dr/a..." className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Medicamentos Frecuentes</label>
                        <textarea rows={3} value={datosEdicion.medicamento || ''} onChange={(e) => setDatosEdicion({...datosEdicion, medicamento: e.target.value})} placeholder="Indique medicamentos o deje vacío si no requiere..." className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>

                    {/* Alergias e Inclusión */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-rose-900 uppercase flex items-center gap-1.5 border-b pb-1">
                        <ShieldAlert size={14} className="text-rose-600" /> 3. Alergias e Inclusión
                      </h4>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Alergias Conocidas</label>
                        <textarea rows={2} value={datosEdicion.alergias || ''} onChange={(e) => setDatosEdicion({...datosEdicion, alergias: e.target.value})} placeholder="Alimentos, medicamentos, etc." className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Programa PIE / NEE</label>
                        <select value={datosEdicion.nee || 'No'} onChange={(e) => setDatosEdicion({...datosEdicion, nee: e.target.value})} className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="No">No</option>
                          <option value="Sí">Sí</option>
                        </select>
                      </div>

                      {datosEdicion.nee === 'Sí' && (
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Tipo de NEE</label>
                          <input type="text" value={datosEdicion.nee_tipo || ''} onChange={(e) => setDatosEdicion({...datosEdicion, nee_tipo: e.target.value})} placeholder="Ej: TEA, TDAH, DIL..." className="w-full border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>

            </div>

          </div>
        );
      })()}

      <ModalDetalleMotivo
        isOpen={modalDetalleMotivoAbierto}
        onClose={() => setModalDetalleMotivoAbierto(false)}
        idMatricula={idMatriculaDetalleMotivo}
        modoInicial={modoDetalleMotivo}
        onAbrirCertificado={(id, tipo) => {
          const token = localStorage.getItem('token');
          window.open(`${API_BASE_URL}/matriculas/${id}/certificado?tipo=${tipo}&token=${token}`, '_blank');
        }}
      />
    </div>
  );
}