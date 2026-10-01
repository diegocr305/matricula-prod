// NuevaMatricula.tsx
import React from 'react';
import { Search, UserCheck, AlertCircle, CheckCircle, Download, Mail, ArrowRight, ChevronRight, ChevronLeft, AlertTriangle, Calendar, Edit3, Loader2, Globe, Building2 } from 'lucide-react';
import { useNuevaMatricula } from './hooks/useNuevaMatricula';
import Stepper from '../../components/Stepper';
import { ModalFaltantes } from './components/ModalFaltantes';
import { ModalExito } from './components/ModalExito';
import { ModalSalida } from './components/ModalSalida';
import { validarTamanoArchivo } from '../../utils/fileValidation';

export default function NuevaMatricula() {
  const {
    navigate, cargando, error, matriculaExitosa,
    rutBusqueda, estudiante, setEstudiante,
    sugerencias, mostrarSugerencias, setMostrarSugerencias, 
    handleEscribirBuscador, seleccionarEstudiante,
    modalFaltantes, setModalFaltantes,
    formulario, handleChange, establecimientosDb, esPerfilColegio,
    codigosDisponibles, cursosDisponibles, seleccionarCurso,
    colegioProcedencia, esTraslado, setHuboPrecarga,
    idEstablecimientoPrevio, setIdEstablecimientoPrevio,
    setCursoPrevio, setCodigoPrevio, alertasTransicion, setAlertasTransicion,
    checkCertNotas, setCheckCertNotas, checkCertRetiro, setCheckCertRetiro,
    handleSubmit, generarComprobantePDF, estudianteCompleto,
    cuposOcupados, limiteCupos,
    archivoResolucion, setArchivoResolucion,
    pasoActual, irSiguientePaso, irPasoAnterior,
    modalSalidaAbierto, confirmarSalida, cancelarSalida,
    // Estados de la regla de 1 año
    fichaConfirmada, setFichaConfirmada, estadoActualizacion,
    mensajeAntiguedad, fechaUltimaActualizacion,
    formFaltantes, handleFaltantesChange, guardarDatosFaltantes,
    guardandoFaltantes, copiarDomicilio,
    cargandoPreseleccion,
    busquedaGlobal, setBusquedaGlobal, toggleBusquedaGlobal,
    buscarEstudianteDirecto, buscandoSugerencias, buscandoDirecto
  } = useNuevaMatricula();

  const abrirPortalPrueba = () => {
    const colegioObj = establecimientosDb.find(e => String(e.id_establecimiento) === String(formulario.id_establecimiento));
    const apoderadoInfo = estudianteCompleto?.apoderado || {};
    
    const datosParaFirma = {
      estudiante: `${estudiante?.nombres || ''} ${estudiante?.apellidos || ''}`.trim().toUpperCase(),
      rutEstudiante: estudiante?.run || estudiante?.run_ipe || 'SIN REGISTRO',
      curso: formulario.cursoSeleccionado || 'Sin Asignar',
      apoderado: (apoderadoInfo.nombre || apoderadoInfo.nombres || 'APODERADO NO REGISTRADO').toUpperCase(),
      rutApoderado: apoderadoInfo.rut || apoderadoInfo.rut_pasaporte || 'SIN RUT',
      relacion: (apoderadoInfo.relacion || apoderadoInfo.relacion_estudiante || 'APODERADO/A').toUpperCase(),
      domicilio: estudiante?.domicilio || 'Sin registro',
      colegio: colegioObj ? colegioObj.nombre.toUpperCase() : 'ESTABLECIMIENTO EDUCACIONAL',
      anio: formulario.anio_escolar,
      fecha: new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
    };
    
    localStorage.setItem('datosPruebaFirma', JSON.stringify(datosParaFirma));
    window.open('/firma-prueba', '_blank');
  };

  const formatearFechaDisplay = (fechaStr: string | null) => {
    if (!fechaStr) return 'Sin registro previo';
    try {
      const d = new Date(fechaStr);
      if (isNaN(d.getTime())) return fechaStr;
      return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return fechaStr;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">

      {/* Banner de carga — visible solo cuando el sistema está sincronizando el estudiante recién creado */}
      {cargandoPreseleccion && !estudiante && (
        <div className="flex items-center gap-4 px-5 py-4 bg-blue-50 border border-blue-200 rounded-xl shadow-sm animate-pulse">
          <svg className="animate-spin h-6 w-6 text-blue-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <div>
            <p className="font-bold text-blue-900 text-sm">Sincronizando datos del estudiante recién registrado...</p>
            <p className="text-xs text-blue-600 mt-0.5">Por favor espere mientras el sistema carga la información. Evite hacer clic en otros elementos.</p>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Registrar Nueva Matrícula</h2>

        <Stepper
          pasoActual={pasoActual}
          pasos={[
            { titulo: 'Identificación', descripcion: 'Estudiante y ficha' },
            { titulo: 'Académico', descripcion: 'Establecimiento y curso' },
            { titulo: 'Autorizaciones', descripcion: 'Documentos y firma' },
          ]}
          className="max-w-2xl mx-auto"
        />
      </div>
      
      <form onSubmit={handleSubmit}>
        
        {/* PASO 1: BÚSQUEDA E IDENTIFICACIÓN CON VALIDACIÓN DE 1 AÑO */}
        {pasoActual === 1 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-semibold text-gray-700 mb-4 border-b pb-2">Paso 1: Identificación y Validación del Estudiante</h3>
            
            {/* SELECTOR DE ALCANCE DE BÚSQUEDA (LOCAL COLEGIO vs GLOBAL TODA LA RED) */}
            {!estudiante && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-lg ${busquedaGlobal ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                    {busquedaGlobal ? <Globe size={18} /> : <Building2 size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">
                      {busquedaGlobal ? "Búsqueda Global (Todos los Colegios / SLEP)" : "Búsqueda Local (Solo este Establecimiento)"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {busquedaGlobal 
                        ? "Buscando en toda la base de datos para traslados o alumnos nuevos provenientes de otros colegios."
                        : "Búsqueda rápida enfocada únicamente en alumnos de este colegio para renovación de matrícula."}
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none bg-white px-3.5 py-2 rounded-lg border border-gray-300 hover:border-blue-400 transition-all shadow-sm shrink-0">
                  <input 
                    type="checkbox"
                    checked={busquedaGlobal}
                    onChange={(e) => toggleBusquedaGlobal(e.target.checked)}
                    disabled={buscandoDirecto}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-gray-700">
                    ¿Alumno de otro establecimiento?
                  </span>
                </label>
              </div>
            )}

            <div className="relative mb-6">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                  <input 
                    type="text" 
                    placeholder={busquedaGlobal 
                      ? "Buscar en toda la red por RUT o Nombre completo..." 
                      : "Buscar estudiante de este colegio por RUT o Nombre..."}
                    value={rutBusqueda} 
                    onChange={(e) => handleEscribirBuscador(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        buscarEstudianteDirecto();
                      }
                    }}
                    onFocus={() => { if (sugerencias.length > 0 || buscandoSugerencias) setMostrarSugerencias(true); }}
                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    disabled={estudiante !== null || buscandoDirecto} 
                  />
                  {buscandoSugerencias && (
                    <div className="absolute right-3 top-2.5 text-blue-500">
                      <Loader2 size={18} className="animate-spin" />
                    </div>
                  )}
                </div>
                
                {estudiante ? (
                  <button 
                    type="button" 
                    onClick={() => { 
                      setEstudiante(null); handleEscribirBuscador(''); setHuboPrecarga(false);
                      setCursoPrevio(''); setCodigoPrevio(null); setAlertasTransicion([]);
                      setCheckCertNotas(false); setCheckCertRetiro(false); setIdEstablecimientoPrevio(null);
                      setFichaConfirmada(false);
                    }} 
                    className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors font-bold shrink-0"
                  >
                    Cambiar Alumno
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => buscarEstudianteDirecto()}
                    disabled={buscandoDirecto || !rutBusqueda.trim()}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors font-bold flex items-center gap-2 shadow-sm shrink-0"
                  >
                    {buscandoDirecto ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        <span>Buscando...</span>
                      </>
                    ) : (
                      <>
                        <Search size={18} />
                        <span>Buscar</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {mostrarSugerencias && !estudiante && (
                <ul className="absolute z-50 w-full md:w-[calc(100%-120px)] mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {buscandoSugerencias ? (
                    <li className="p-4 text-sm text-blue-700 bg-blue-50 flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin text-blue-600" size={18} />
                      <span>{busquedaGlobal ? "Buscando en toda la base de datos..." : "Buscando en este colegio..."}</span>
                    </li>
                  ) : sugerencias.length === 0 ? (
                    <li className="p-4 text-sm text-gray-600 text-center flex flex-col items-center gap-2">
                      <span>
                        {busquedaGlobal
                          ? `No se encontraron coincidencias en la base de datos para "${rutBusqueda}".`
                          : `No se encontró al estudiante en este colegio con "${rutBusqueda}".`}
                      </span>
                      {!busquedaGlobal ? (
                        <button
                          type="button"
                          onClick={() => toggleBusquedaGlobal(true)}
                          className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <Globe size={14} /> Buscar en otros establecimientos (Búsqueda Global)
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => buscarEstudianteDirecto()}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <Search size={14} /> Buscar directamente por RUT en el servidor
                        </button>
                      )}
                    </li>
                  ) : (
                    sugerencias.map((est, idx) => (
                      <li 
                        key={est.id || est.run || idx}
                        onClick={() => seleccionarEstudiante(est)}
                        className="p-3 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors flex flex-col"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-800">{est.nombre_completo}</span>
                          <div className="flex items-center gap-1.5">
                            {est.curso && est.curso !== 'Sin Curso' && (
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                                {est.curso}
                              </span>
                            )}
                            {busquedaGlobal && est.colegio && (
                              <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                                {est.colegio}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 font-mono">RUT: {est.run || est.run_ipe || 'Sin registro'}</span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            {cargando && !estudiante && (
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 animate-pulse mb-6">
                <Loader2 className="animate-spin text-blue-600 shrink-0" size={22} />
                <div>
                  <p className="font-bold text-sm">Cargando expediente completo del estudiante...</p>
                  <p className="text-xs text-blue-700">Recuperando antecedentes familiares, médicos e historial académico. Por favor espere un momento.</p>
                </div>
              </div>
            )}

            {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4">{error}</div>}

            {estudiante && (
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl flex flex-col gap-4 mb-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="bg-blue-100 p-2.5 rounded-full text-blue-700 mt-1">
                    <UserCheck size={26} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-blue-700 font-bold uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Estudiante Seleccionado
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Calendar size={13} /> Última actualización: {formatearFechaDisplay(fechaUltimaActualizacion)}
                      </span>
                    </div>
                    <p className="text-xl font-bold text-gray-900 mt-1">
                      {estudiante.nombres} {estudiante.apellidos}
                    </p>
                    <p className="text-sm text-gray-600 font-mono">
                      RUT / IPE: {estudiante.run}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Domicilio registrado: {formFaltantes.domicilio_estudiante || 'Sin registrar'}
                    </p>
                  </div>
                </div>

                {/* CONDICIONAL: ESTADO VIGENTE (< 1 AÑO) VS VENCIDA (> 1 AÑO O INCOMPLETA) */}
                {estadoActualizacion === 'vigente' && fichaConfirmada ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between animate-in fade-in">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={22} />
                      <div>
                        <p className="text-sm font-bold text-emerald-900">
                          Información Vigente (Actualizada hace menos de 1 año)
                        </p>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          {mensajeAntiguedad} No es obligatorio actualizar la ficha; puede avanzar directamente o editar si algún dato cambió.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalFaltantes(true)}
                      className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-white border border-emerald-300 hover:bg-emerald-100 px-3.5 py-2 rounded-lg transition-colors shadow-sm ml-3 shrink-0"
                    >
                      <Edit3 size={14} /> Modificar antecedentes
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-3 animate-in fade-in">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={24} />
                      <div>
                        <h4 className="text-sm font-black text-amber-900 uppercase tracking-wide">
                          Actualización Obligatoria Requerida (+1 año)
                        </h4>
                        <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                          {mensajeAntiguedad} Por normativa institucional, <strong>cuando la información tiene más de 1 año sin actualizarse es mandatorio revisar y guardar nuevamente los antecedentes</strong> para asegurar la validez de los contactos de emergencia y residencia.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setModalFaltantes(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-sm shadow-md transition-all hover:scale-[1.01]"
                      >
                        <UserCheck size={18} />
                        Actualizar y Validar Ficha Obligatoria
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button 
                type="button" 
                onClick={irSiguientePaso}
                disabled={!estudiante || !fichaConfirmada} 
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Siguiente Paso <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* PASO 2: DATOS DE MATRÍCULA Y ESTABLECIMIENTO */}
        {pasoActual === 2 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-right-4 space-y-5">
            <h3 className="font-semibold text-gray-700 mb-4 border-b pb-2">Paso 2: Datos Académicos y de Establecimiento</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Establecimiento Educacional</label>
              <select name="id_establecimiento" value={formulario.id_establecimiento} onChange={handleChange} required disabled={esPerfilColegio} className={`w-full border rounded-lg p-2 outline-none font-medium ${esPerfilColegio ? 'bg-gray-100 border-gray-300 text-gray-500' : 'bg-white border-gray-300 text-gray-800'}`}>
                {establecimientosDb.map((est) => (
                  <option key={est.id_establecimiento} value={est.id_establecimiento}>
                    RBD: {est.rbd} - {est.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colegio de Procedencia</label>
                <input type="text" disabled value={colegioProcedencia || 'Esperando selección...'} className={`w-full border rounded-lg p-2 outline-none font-medium text-sm ${esTraslado ? 'bg-orange-50 border-orange-300 text-orange-800' : 'bg-gray-100 border-gray-300 text-gray-600'}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Año Escolar</label>
                <input required type="number" name="anio_escolar" value={formulario.anio_escolar} onChange={handleChange} className="w-full border border-gray-300 rounded-lg p-2 outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Matrícula</label>
              <input required type="date" name="fecha_matricula" value={formulario.fecha_matricula} onChange={handleChange} className="w-full border border-gray-300 rounded-lg p-2 outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código de Plan</label>
                <select name="cod_tipo_ensenanza" value={formulario.cod_tipo_ensenanza} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg p-2 outline-none bg-white font-mono">
                  {codigosDisponibles.length === 0 ? <option value="">No hay planes</option> : codigosDisponibles.map(item => <option key={item.codigo} value={item.codigo}>Cod. {item.codigo} - {item.nombre}</option>)}
                </select>
              </div>
              
              <div>
                <div className="flex justify-between items-end mb-1">
                  <label className="block text-sm font-medium text-gray-700">Curso (Sala)</label>
                  {formulario.cursoSeleccionado && (
                    <span 
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm ${
                        limiteCupos - cuposOcupados <= 0 
                          ? 'bg-red-100 text-red-700' 
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      Disponibles: {Math.max(0, limiteCupos - cuposOcupados)} vacantes (Capacidad: {limiteCupos})
                    </span>
                  )}
                </div>
                <select 
                  name="cursoSeleccionado" 
                  value={formulario.cursoSeleccionado} 
                  onChange={(e) => seleccionarCurso(e.target.value)} 
                  required 
                  className={`w-full border rounded-lg p-2 outline-none font-bold ${
                    cuposOcupados >= limiteCupos 
                      ? 'border-red-300 text-red-800 bg-red-50' 
                      : 'border-gray-300 text-blue-800 bg-white'
                  }`}
                >
                  {cursosDisponibles.length === 0 ? (
                    <option value="">Seleccione un plan</option>
                  ) : (
                    cursosDisponibles.map(curso => (
                      <option key={curso} value={curso}>{curso}</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Alertas de Transición */}
            {alertasTransicion.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {alertasTransicion.map((alerta, index) => (
                  <div key={index} className={`p-3 rounded-lg border text-sm font-medium flex items-start gap-2 ${alerta.tipo === 'info' ? 'bg-blue-50 border-blue-200 text-blue-800' : alerta.tipo === 'alerta' ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    <span>{alerta.tipo === 'info' ? '✅' : alerta.tipo === 'alerta' ? '⚠️' : '🚨'}</span>
                    <p>{alerta.texto}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-gray-200 pt-5 mt-5">
              <h4 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Recepción de Documentos Obligatorios</h4>
              <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" checked={checkCertNotas} onChange={(e) => setCheckCertNotas(e.target.checked)} className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" />
                  <div>
                    <p className="text-sm font-bold text-gray-800 group-hover:text-blue-700">Se presentó el Certificado de Promoción (Notas)</p>
                    <p className="text-xs text-gray-500">Documento que acredita la aprobación o repitencia del último curso.</p>
                  </div>
                </label>
                {idEstablecimientoPrevio !== String(formulario.id_establecimiento) && (
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input type="checkbox" checked={checkCertRetiro} onChange={(e) => setCheckCertRetiro(e.target.checked)} className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" />
                    <div>
                      <p className="text-sm font-bold text-gray-800 group-hover:text-blue-700">Se presentó el Certificado de Retiro o Traslado</p>
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* SECCIÓN EXCEDENTES */}
            <div className="border-t border-gray-200 pt-5 mt-5">
              <h4 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Condición de Matrícula (Cupos)</h4>
              <div className={`p-4 rounded-lg border transition-colors ${formulario.es_excedente ? (cuposOcupados >= limiteCupos ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200') : 'bg-gray-50 border-gray-200'}`}>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" name="es_excedente" checked={formulario.es_excedente} onChange={handleChange} disabled={cuposOcupados >= limiteCupos} 
                    className={`mt-1 w-4 h-4 rounded cursor-pointer ${cuposOcupados >= limiteCupos ? 'text-red-600 border-red-300' : 'text-orange-600 border-gray-300'}`}
                  />
                  <div>
                    <p className={`text-sm font-bold ${cuposOcupados >= limiteCupos ? 'text-red-900' : 'text-gray-800'}`}>Matricular como Estudiante Excedente (Sobrecupo Autorizado)</p>
                  </div>
                </label>
                {formulario.es_excedente && (
                  <div className="mt-4 pt-4 border-t border-orange-200 animate-in slide-in-from-top-2 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-orange-800 mb-1">Tipo de Resolución <span className="text-red-500">*</span></label>
                      <select required={formulario.es_excedente} name="res_tipo" value={formulario.res_tipo} onChange={handleChange} className="w-full border border-orange-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                        <option value="">Seleccione el tipo...</option>
                        <option value="Administrativa">Resolución Administrativa</option>
                        <option value="Judicial">Resolución Judicial</option>
                      </select>
                    </div>
                    {formulario.res_tipo && (
                      <div className="bg-white p-4 rounded-lg border border-orange-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-gray-700 mb-1">Causa / Materia <span className="text-red-500">*</span></label>
                          <input required type="text" name="res_causa" value={formulario.res_causa} onChange={handleChange} placeholder="Ej: Vulneración de derechos..." className="w-full border rounded p-2 text-sm outline-none bg-gray-50 focus:bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">N° de Resolución <span className="text-red-500">*</span></label>
                          <input required type="text" name="res_numero" value={formulario.res_numero} onChange={handleChange} className="w-full border rounded p-2 text-sm outline-none bg-gray-50 focus:bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Año <span className="text-red-500">*</span></label>
                          <input required type="number" name="res_anio" value={formulario.res_anio} onChange={handleChange} className="w-full border rounded p-2 text-sm outline-none bg-gray-50 focus:bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Tribunal / Entidad <span className="text-red-500">*</span></label>
                          <input required type="text" name="res_tribunal" value={formulario.res_tribunal} onChange={handleChange} className="w-full border rounded p-2 text-sm outline-none bg-gray-50 focus:bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Fecha de Emisión <span className="text-red-500">*</span></label>
                          <input required type="date" name="fecha_resolucion_excedente" value={formulario.fecha_resolucion_excedente} onChange={handleChange} className="w-full border rounded p-2 text-sm outline-none bg-gray-50 focus:bg-white" />
                        </div>
                        <div className="sm:col-span-2 border-t border-dashed border-orange-200 pt-3 mt-1">
                          <label className="block text-xs font-bold text-gray-700 mb-2">Adjuntar Documento Digital (PDF) <span className="text-red-500">*</span></label>
                          <div className="flex items-center justify-center w-full">
                            <label htmlFor="pdf-upload" className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer ${archivoResolucion ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-gray-50'}`}>
                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                {archivoResolucion ? (
                                  <p className="text-sm font-semibold text-emerald-700">{archivoResolucion.name} ({(archivoResolucion.size / (1024 * 1024)).toFixed(2)} MB)</p>
                                ) : (
                                  <>
                                    <p className="text-sm text-gray-500 font-medium">Haga clic para subir PDF de la resolución</p>
                                    <p className="text-xs text-gray-400 mt-1">Formato PDF (máximo 5 MB)</p>
                                  </>
                                )}
                              </div>
                              <input 
                                id="pdf-upload" 
                                type="file" 
                                accept=".pdf" 
                                className="hidden" 
                                required={!archivoResolucion} 
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  if (file) {
                                    const res = validarTamanoArchivo(file);
                                    if (!res.valido) {
                                      alert(res.mensaje);
                                      e.target.value = '';
                                      setArchivoResolucion(null);
                                      return;
                                    }
                                  }
                                  setArchivoResolucion(file);
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-100">
              <button type="button" onClick={irPasoAnterior} className="flex items-center gap-2 px-6 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold transition-colors">
                <ChevronLeft size={18} /> Volver
              </button>
              <button 
                type="button" 
                onClick={irSiguientePaso}
                disabled={!checkCertNotas || (idEstablecimientoPrevio !== String(formulario.id_establecimiento) && !checkCertRetiro) || (formulario.es_excedente && !archivoResolucion)} 
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
              >
                Siguiente Paso <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: AUTORIZACIONES Y MÉTODO DE FIRMA */}
        {pasoActual === 3 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-right-4 space-y-6">
            <h3 className="font-semibold text-gray-700 mb-2 border-b pb-2">Paso 3: Envío y Firma de Documentos</h3>
            <p className="text-sm text-gray-500 mb-6">La religión, el acta de compromiso y las autorizaciones institucionales las decide y marca directamente el apoderado. Usted solo define cómo se le harán llegar los documentos para su firma.</p>

            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-blue-600 mt-0.5 shrink-0" size={20} />
              <div>
                <p className="text-sm font-bold text-blue-900">Religión y autorizaciones: las responde el apoderado</p>
                <p className="text-xs text-blue-700 mt-1">
                  La opción de religión (Decreto N°924/1983), el acta de compromiso, la autorización de entrevistas y la autorización de uso de imágenes ya no se marcan aquí.
                  Si el envío es <span className="font-bold">Digital</span>, el apoderado las responderá en el enlace de firma con Clave Única.
                  Si es <span className="font-bold">Manual (Papel)</span>, los documentos impresos incluirán esos casilleros en blanco para que el apoderado los marque y firme a mano en el establecimiento.
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-gray-200 pt-6">
              <h4 className="font-bold text-gray-800 mb-3">Método de Firma de Documentos</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <label className={`relative flex flex-col p-4 cursor-pointer rounded-xl border-2 transition-all ${formulario.metodo_firma === 'Digital' ? 'border-blue-600 bg-blue-50/50' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-blue-900 flex items-center gap-2">
                      📧 Envío Digital (Clave Única)
                    </span>
                    <input type="radio" name="metodo_firma" value="Digital" checked={formulario.metodo_firma === 'Digital'} onChange={handleChange} className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Se enviará un enlace al correo del apoderado para que valide los 5 documentos usando su Clave Única del Estado. <span className="font-bold text-emerald-600">Recomendado.</span>
                  </p>
                </label>

                <label className={`relative flex flex-col p-4 cursor-pointer rounded-xl border-2 transition-all ${formulario.metodo_firma === 'Manual' ? 'border-orange-500 bg-orange-50/50' : 'border-gray-200 bg-white hover:border-orange-300'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-orange-900 flex items-center gap-2">
                      🖨️ Firma Presencial (Papel)
                    </span>
                    <input type="radio" name="metodo_firma" value="Manual" checked={formulario.metodo_firma === 'Manual'} onChange={handleChange} className="w-5 h-5 text-orange-500" />
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Se generará un único archivo PDF con los 5 documentos para que los imprima y el apoderado firme manualmente en el establecimiento.
                  </p>
                </label>

              </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-gray-100">
              <button type="button" onClick={irPasoAnterior} className="flex items-center gap-2 px-6 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold transition-colors">
                <ChevronLeft size={18} /> Volver
              </button>

              <button
                type="submit"
                disabled={cargando}
                className="flex items-center gap-2 px-8 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-black tracking-wide transition-all shadow-md hover:shadow-lg disabled:opacity-50"
              >
                {cargando
                  ? 'Procesando...'
                  : (formulario.metodo_firma === 'Digital' ? 'Registrar y Enviar a Firma' : 'Generar Documentos para Firma')}
              </button>
            </div>
          </div>
        )}

      </form>

      {/* MODAL DE ACTUALIZACIÓN DE DATOS */}
      <ModalFaltantes
        isOpen={modalFaltantes}
        onClose={() => setModalFaltantes(false)}
        estudiante={estudiante}
        formFaltantes={formFaltantes}
        handleFaltantesChange={handleFaltantesChange}
        guardarDatosFaltantes={guardarDatosFaltantes}
        guardandoFaltantes={guardandoFaltantes}
        copiarDomicilio={copiarDomicilio}
      />

      {/* MODAL ÉXITO */}
      <ModalExito
        isOpen={matriculaExitosa}
        metodoFirma={formulario.metodo_firma}
        generarComprobantePDF={generarComprobantePDF}
        onVolver={() => navigate('/matriculas')}
        rutAlumno={estudiante?.run || estudiante?.run_ipe}
        anioEscolar={formulario.anio_escolar}
      />

      {/* MODAL ADVERTENCIA DE SALIDA */}
      <ModalSalida
        isOpen={modalSalidaAbierto}
        onCancelar={cancelarSalida}
        onConfirmar={confirmarSalida}
      />

    </div>
  );
}