import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, CheckCircle2, Users, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import ModalEmisionDocumento from '../../components/ModalEmisionDocumento';
import ModalDescargaExcel from './components/ModalDescargaExcel';
import ModalDetalleMotivo from './components/ModalDetalleMotivo';
import { useMatriculas } from './hooks/useMatriculas'; 
import { API_BASE_URL } from '../../config/api';

export default function Matriculas() {
  const {
    colegioSeleccionado, setColegioSeleccionado, establecimientos, esPerfilGlobal,
    puedeEditar, puedeCargarSIGE, anioActual,
    cargando, error, subiendoArchivo,
    busqueda, setBusqueda,
    filtroAnio, setFiltroAnio,
    filtroCodigo, setFiltroCodigo,
    filtroCurso, setFiltroCurso,
    filtroEstado, setFiltroEstado,
    ordenEstado, setOrdenEstado,
    aniosUnicos, codigosUnicos, cursosUnicos, estructuraColegio, matriculasProcesadas,
    modalCursoAbierto, setModalCursoAbierto, procesandoCurso,
    planDestino, setPlanDestino, cursoDestino, setCursoDestino, advertenciaNivel,
    enviarApoderadoCurso, setEnviarApoderadoCurso, correoApoderadoCurso, setCorreoApoderadoCurso,
    descargarLocalCurso, setDescargarLocalCurso,
    modalAbierto, setModalAbierto, procesandoRetiro, fechaRetiro, setFechaRetiro,
    enviarApoderadoRetiro, setEnviarApoderadoRetiro, correoApoderadoRetiro, setCorreoApoderadoRetiro,
    descargarLocalRetiro, setDescargarLocalRetiro,
    modalEmisionAbierto, setModalEmisionAbierto, datosEmision,
    matriculaSeleccionada,
    manejarSubidaCSV, abrirModalEmision, iniciarRetiro, confirmarRetiro, 
    iniciarCambioCurso, confirmarCambioCurso,
    mostrarCupos, cuposOcupados, capacidadSala, descargandoExcel, exportarAExcel,
    capacidadCursoDestino, cargandoCapacidadDestino, matriculadosCursoDestino, cursoDestinoLleno, cuposPorCurso,
    cursoActual, estudiantesCursoDestino, cargandoEstudiantesDestino, esMismoCurso,
    modalExcelAbierto, setModalExcelAbierto,
    page, setPage, totalPages, total,
  } = useMatriculas();

  const [mostrarListaDestino, setMostrarListaDestino] = useState(false);
  const [modalDetalleMotivoAbierto, setModalDetalleMotivoAbierto] = useState(false);
  const [idMatriculaDetalleMotivo, setIdMatriculaDetalleMotivo] = useState<number | null>(null);
  const [modoDetalleMotivo, setModoDetalleMotivo] = useState<'retiro' | 'cambio_curso'>('retiro');

  const abrirModalDetalleMotivo = (id: number, modo: 'retiro' | 'cambio_curso') => {
    setIdMatriculaDetalleMotivo(id);
    setModoDetalleMotivo(modo);
    setModalDetalleMotivoAbierto(true);
  };

  const formatearNombreCorto = (nombre?: string) => {
    if (!nombre || nombre === 'Pendiente' || nombre === 'Sin registro') {
      return nombre || 'Pendiente';
    }
    const palabras = nombre.trim().split(/\s+/);
    if (palabras.length <= 2) return nombre;
    return `${palabras[0]} ${palabras[1]}`;
  };

  const renderEstadoBadge = (mat: any) => {
    const estado = (mat.estado || '').trim();
    const estadoLower = estado.toLowerCase();
    const motivoCambio = (mat.motivo_cambio_curso || '').trim();

    if (estadoLower === 'pendiente retiro') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-sm animate-pulse" title="En proceso de baja - esperando respuesta a encuesta del apoderado">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          Pendiente Retiro
        </span>
      );
    }
    if (motivoCambio.startsWith('PENDIENTE_TRASLADO')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-800 border border-purple-300 shadow-sm" title="Solicitud de traslado de sala en proceso">
          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          Traslado Pendiente
        </span>
      );
    }
    const esTraslado = (mat.motivo_retiro && mat.motivo_retiro.toLowerCase().includes('traslado')) ||
                       (mat.observaciones && mat.observaciones.toLowerCase().includes('traslado'));

    if (esTraslado && (estadoLower === 'retirado' || estadoLower === 'retirada' || estadoLower === 'inactiva' || estadoLower === 'inactivo')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200 shadow-sm" title={mat.observaciones || "Retirado por traslado a otro establecimiento"}>
          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          Trasladado
        </span>
      );
    }
    if (estadoLower === 'promovido' || estadoLower === 'promovida') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 shadow-sm" title="Alumno promovido">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          Promovido
        </span>
      );
    }
    if (estadoLower === 'repitente') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-sm" title="Alumno repitente">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          Repitente
        </span>
      );
    }
    if (estadoLower === 'retirado' || estadoLower === 'retirada') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200" title="Matrícula finalizada / Alumno retirado">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          Retirado
        </span>
      );
    }
    if (estadoLower === 'inactiva' || estadoLower === 'inactivo') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200" title="Matrícula inactiva (baja o retiro registrado en SIGE)">
          <span className="w-2 h-2 rounded-full bg-orange-500"></span>
          Inactiva
        </span>
      );
    }
    if (estadoLower === 'pendiente firma') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-300 shadow-sm" title="Pendiente de firma del apoderado">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          Pendiente Firma
        </span>
      );
    }
    if (estadoLower === 'anulada' || estadoLower === 'anulado') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-300" title="Matrícula anulada">
          <span className="w-2 h-2 rounded-full bg-gray-400"></span>
          Anulada
        </span>
      );
    }
    if (estadoLower === 'activa' || estadoLower === 'activo') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-sm" title="Matrícula regular activa">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          Activa
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-300" title={`Estado: ${estado || 'Sin estado'}`}>
        <span className="w-2 h-2 rounded-full bg-gray-400"></span>
        {estado || 'Sin Estado'}
      </span>
    );
  };

  return (
    <div className="space-y-6 relative">
      
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Registro de Matrículas</h1>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => setModalExcelAbierto(true)}
            disabled={!colegioSeleccionado && !matriculasProcesadas.length}
            className={`flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-colors border ${
              !colegioSeleccionado && !matriculasProcesadas.length
              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
              : 'bg-white text-[#006BB9] border-[#006BB9] hover:bg-blue-50'
            }`}
          >
            Descargar Excel
          </button>
          {puedeEditar && (
            <>
              {/* Botón "Cargar SIGE / CSV" oculto a petición. Para reactivarlo,
                  cambiar `false` por `puedeCargarSIGE`. */}
              {false && puedeCargarSIGE && (
                <>
                  <input 
                    type="file" accept=".csv, .xls, .xlsx" 
                    id="csv-upload-matriculas" className="hidden" 
                    onChange={manejarSubidaCSV} disabled={subiendoArchivo}
                    multiple 
                  />
                  <label 
                    htmlFor="csv-upload-matriculas" 
                    className={`flex items-center justify-center cursor-pointer px-4 py-2 rounded-lg font-medium transition-colors border ${
                      subiendoArchivo ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-emerald-600 border-emerald-600 hover:bg-emerald-50'
                    }`}
                  >
                    {subiendoArchivo ? 'Procesando archivos...' : 'Cargar SIGE / CSV'}
                  </label>
                </>
              )}
              {colegioSeleccionado && (
                <Link to="/matriculas/nueva" className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                  + Renovar Matrícula
                </Link>
              )}
            </>
          )}
        </div>
      </div>                         

      {!cargando && !error && !colegioSeleccionado && (
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
        </div>
      )}

      {cargando && <p className="text-gray-500 font-medium">Cargando base de datos...</p>}
      {error && <p className="text-red-500 font-medium">Error: {error}</p>}

      {!cargando && !error && matriculasProcesadas.length >= 0 && colegioSeleccionado && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">🔍 Buscar</label>
            <input type="text" placeholder="RUT o Nombre." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">📅 1. Año</label>
            <select value={filtroAnio} onChange={(e) => { setFiltroAnio(e.target.value); setPage(1); }} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none bg-white cursor-pointer">
              <option value="">Todos los años</option>
              {aniosUnicos.map(anio => <option key={anio} value={anio}>{anio}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">📚 2. Plan de Estudio</label>
            <select value={filtroCodigo} onChange={(e) => { setFiltroCodigo(e.target.value); setPage(1); }} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none bg-white cursor-pointer">
              <option value="">Todos los planes</option>
              {codigosUnicos.map(cod => <option key={cod} value={cod}>Cod. {cod}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">🏫 3. Curso</label>
            <select value={filtroCurso} onChange={(e) => { setFiltroCurso(e.target.value); setPage(1); }} disabled={cursosUnicos.length === 0} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none bg-white disabled:bg-gray-100 disabled:text-gray-400">
              <option value="">Todos los cursos</option>
              {cursosUnicos.map(curso => <option key={curso} value={curso}>{curso}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">📋 4. Estado</label>
            <select value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); setPage(1); }} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none bg-white cursor-pointer">
              <option value="">Todos los estados</option>
              <option value="Activa">Solo Activas</option>
              <option value="traslados">Traslados Intercolegio</option>
              <option value="Inactiva">Inactivas / Retirados</option>
              <option value="Pendiente Retiro">Pendientes de Retiro</option>
              <option value="Pendiente_Traslado">Traslados Pendientes</option>
              <option value="Anulada">Anuladas</option>
            </select>
          </div>
        </div>
      )}

      {/* =======================================================================
          TABLA PRINCIPAL DE REGISTROS DE MATRÍCULA
          ======================================================================= */}
      {!cargando && !error && colegioSeleccionado && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          
          {/* 🌟 NUEVO: BARRA INFORMATIVA CON INDICADOR DE CUPOS */}
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex flex-wrap gap-4 items-center justify-between">
            <span className="text-xs font-bold text-gray-700">
              {total > matriculasProcesadas.length 
                ? `Mostrando ${matriculasProcesadas.length} de ${total.toLocaleString()} resultados`
                : `Mostrando ${matriculasProcesadas.length} resultados`}
            </span>
            
            {/* Lógica Condicional: Se muestra solo cuando los 3 filtros están seleccionados */}
            {mostrarCupos && (
              <div className={`flex items-center gap-3 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                cuposOcupados >= capacidadSala
                  ? 'bg-red-100 text-red-700 border-red-200' 
                  : 'bg-blue-100 text-blue-700 border-blue-200'
              }`}>
                <span>👥 Ocupación en sala:</span>
                <span className="text-sm">{cuposOcupados} / {capacidadSala}</span>
                
                {cuposOcupados >= capacidadSala && (
                  <span className="ml-2 uppercase bg-red-600 text-white px-2 py-0.5 rounded-full text-[10px] tracking-wider animate-pulse">
                    Límite Legal Alcanzado
                  </span>
                )}
              </div>
            )}
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                <th className="p-4 font-medium">Folio</th>
                <th className="p-4 font-medium text-center">RBD</th>
                <th className="p-4 font-medium">Estudiante</th>
                <th className="p-4 font-medium">Apoderado(s)</th>
                <th className="p-4 font-medium">Curso y Plan</th>
                <th className="p-4 font-medium text-center">Año</th>
                <th className="p-4 font-medium cursor-pointer hover:bg-gray-200 transition-colors group select-none" onClick={() => setOrdenEstado(prev => prev === 'asc' ? 'desc' : 'asc')}>
                  <div className="flex items-center gap-2">ESTADO <span className="text-xs">{ordenEstado === 'asc' ? '▲' : '▼'}</span></div>
                </th>
                <th className="p-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {matriculasProcesadas.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">No se encontraron matrículas con esos filtros.</td></tr>
              ) : (
                matriculasProcesadas.map((mat) => (
                  <tr key={mat.id_matricula} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-900 font-medium">#{mat.numero_correlativo}</td>
                    <td className="p-4 text-center"><span className="px-2 py-1 bg-indigo-100 text-indigo-700 font-bold rounded-md text-xs">{mat.rbd}</span></td>
                    <td className="p-4">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-800">{mat.estudiante_nombre}</p>
                          {mat.es_excedente && (
                            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded text-[10px] font-bold uppercase tracking-wider border border-orange-200" title={mat.numero_resolucion_excedente || 'Estudiante Excedente'}>
                              Excedente
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{mat.estudiante_rut}</p>
                    </td>
                    <td className="p-4">
                        <p className="font-medium text-emerald-700">{formatearNombreCorto(mat.apoderado_nombre)}</p>
                        <p className="text-xs text-gray-500">{mat.apoderado_rut}</p>
                        {mat.suplente_nombre && (
                          <p className="text-[11px] text-gray-400 mt-1">
                            <span className="font-semibold">Supl:</span> {formatearNombreCorto(mat.suplente_nombre)}
                            {mat.suplente_rut ? ` · ${mat.suplente_rut}` : ''}
                          </p>
                        )}
                    </td>
                    <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-blue-800">{mat.curso}</p>
                          {mat.motivo_cambio_curso?.startsWith('PENDIENTE_TRASLADO') && (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-[10px] font-bold border border-purple-200" title={`Traslado solicitado hacia ${mat.motivo_cambio_curso.split('|')[2]}. En espera de justificación del apoderado.`}>
                              ⏳ Solicitud Traslado
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 truncate max-w-[250px]" title={mat.tipo_ensenanza}>
                          {mat.cod_tipo_ensenanza && <span className="font-semibold text-gray-700 mr-1">(Cod. {mat.cod_tipo_ensenanza})</span>}
                          {mat.tipo_ensenanza}
                        </p>
                    </td>
                    <td className="p-4 text-center font-semibold text-gray-700">{mat.anio_escolar}</td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1.5 items-start">
                        {renderEstadoBadge(mat)}
                        {mat.estado_renovacion && (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border whitespace-nowrap ${
                            mat.estado_renovacion === 'Firmada'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : mat.estado_renovacion === 'Pendiente firma'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : mat.estado_renovacion === 'Por renovar'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : mat.estado_renovacion === 'No renueva'
                              ? 'bg-gray-100 text-gray-600 border-gray-300'
                              : 'bg-slate-100 text-slate-600 border-slate-300'
                          }`} title={`Renovación: ${mat.estado_renovacion}`}>
                            {mat.estado_renovacion === 'Firmada' ? '✅ Firmada'
                              : mat.estado_renovacion === 'Pendiente firma' ? '✍️ Pendiente firma'
                              : mat.estado_renovacion === 'Por renovar' ? '🔄 Por renovar'
                              : mat.estado_renovacion === 'Egresado' ? '🎓 Egresado'
                              : mat.estado_renovacion}
                          </span>
                        )}
                      </div>
                    </td>
                    
                    <td className="p-4 text-right">
                      <div className="flex justify-end items-center gap-3">
                        {mat.ruta_documento_resolucion && (
                          <button 
                            type="button"
                            onClick={() => {
                              const token = localStorage.getItem('token');
                              window.open(`${API_BASE_URL}/documentos/adjunto?tipo=resolucion&id=${mat.id_matricula}&token=${token}`, '_blank');
                            }}
                            className="text-orange-600 hover:text-orange-800 font-semibold text-xs transition-colors underline cursor-pointer"
                            title="Ver Resolución de Sobrecupo"
                          >
                            Resolución PDF
                          </button>
                        )}
                        {mat.ruta_documento_traslado && (
                          <button 
                            type="button"
                            onClick={() => {
                              const token = localStorage.getItem('token');
                              window.open(`${API_BASE_URL}/documentos/adjunto?tipo=traslado&id=${mat.id_matricula}&token=${token}`, '_blank');
                            }}
                            className="text-purple-600 hover:text-purple-800 font-semibold text-xs transition-colors underline cursor-pointer"
                            title="Ver Certificado de Traslado Adjunto"
                          >
                            Cert. Traslado
                          </button>
                        )}
                        {mat.estado === 'Pendiente Retiro' && (
                          <a 
                            href={`/encuesta-retiro/${mat.id_matricula}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-amber-700 hover:text-amber-900 font-bold text-xs underline cursor-pointer"
                            title="Abrir el cuestionario confidencial de retiro"
                          >
                            Completar Encuesta
                          </a>
                        )}
                        {mat.motivo_cambio_curso?.startsWith('PENDIENTE_TRASLADO') && mat.estado === 'Activa' && (
                          <a 
                            href={`/encuesta-cambio-curso/${mat.id_matricula}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-purple-700 hover:text-purple-900 font-bold text-xs underline cursor-pointer"
                            title="Abrir la justificación de cambio de curso"
                          >
                            Justificar Traslado
                          </a>
                        )}
                        {(mat.estado === 'Inactiva' || mat.estado === 'Retirado' || mat.estado === 'Retirada') && (
                          <>
                            <button 
                              type="button"
                              onClick={() => abrirModalEmision(mat.id_matricula, 'RETIRO')} 
                              className="text-red-600 hover:text-red-800 font-medium transition-colors text-xs cursor-pointer"
                              title="Emitir Comprobante de Retiro"
                            >
                              Cert. Retiro
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirModalDetalleMotivo(mat.id_matricula, 'retiro')}
                              className="text-amber-700 hover:text-amber-900 font-semibold transition-colors text-xs cursor-pointer underline"
                              title="Ver causa y motivos detallados del retiro"
                            >
                              Motivo Retiro
                            </button>
                          </>
                        )}
                        {((mat.motivo_cambio_curso && !mat.motivo_cambio_curso.startsWith('PENDIENTE_TRASLADO')) || (mat.observaciones && mat.observaciones.toLowerCase().includes('traslado formalizado'))) && (
                          <button
                            type="button"
                            onClick={() => abrirModalDetalleMotivo(mat.id_matricula, 'cambio_curso')}
                            className="text-purple-700 hover:text-purple-900 font-semibold transition-colors text-xs cursor-pointer underline"
                            title="Ver justificación y detalles del cambio de curso"
                          >
                            Motivo Traslado
                          </button>
                        )}
                        {mat.estado === 'Activa' && (
                          <>
                            {/* "Emitir Doc." solo si la matrícula NO está en un flujo de
                                renovación pendiente. Se oculta mientras esté 'Por renovar'
                                o 'Pendiente firma' (aún no firmada por el apoderado).
                                En matrículas históricas (estado_renovacion null) o ya
                                'Firmada' se muestra normalmente. */}
                            {mat.estado_renovacion !== 'Por renovar' && mat.estado_renovacion !== 'Pendiente firma' && (
                              <button onClick={() => abrirModalEmision(mat.id_matricula, 'MATRICULA')} className="text-emerald-600 hover:text-emerald-800 font-medium transition-colors">
                                Emitir Doc.
                              </button>
                            )}

                            {puedeEditar && mat.estado_renovacion === 'Por renovar' && (
                              <Link
                                to={`/matriculas/confirmar-renovacion/${mat.id_matricula}`}
                                state={{ rut: mat.estudiante_rut, curso: mat.curso, anio: mat.anio_escolar }}
                                className="text-indigo-600 hover:text-indigo-800 font-bold transition-colors"
                                title="Actualizar datos del apoderado y estudiante y enviar a firma"
                              >
                                Confirmar Renovación
                              </Link>
                            )}
                            
                            {puedeEditar && mat.anio_escolar === anioActual && !mat.motivo_cambio_curso?.startsWith('PENDIENTE_TRASLADO') && (
                              <button onClick={() => iniciarCambioCurso(mat.id_matricula, mat.curso, mat.cod_tipo_ensenanza)} className="text-blue-600 hover:text-blue-800 font-medium transition-colors">Mover</button>
                            )}
                            {puedeEditar && (
                              <button onClick={() => iniciarRetiro(mat.id_matricula)} className="text-red-600 hover:text-red-800 font-medium transition-colors">Retirar</button>
                            )}
                          </>
                        )}
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Controles de paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-2">
              <p className="text-sm text-gray-500">
                Mostrando <span className="font-semibold text-gray-700">{(page - 1) * 50 + 1}–{Math.min(page * 50, total)}</span> de <span className="font-semibold text-gray-700">{total.toLocaleString()}</span> matrículas
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Anterior
                </button>
                <span className="text-sm text-gray-700 font-semibold px-2">
                  Pág. {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =======================================================================
          MODAL A: CAMBIO DE CURSO (TRASLADO INTERNO)
          ======================================================================= */}
      {modalCursoAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Solicitar Traslado de Curso</h3>
            
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-4 text-xs text-blue-800">
              <p><strong>Normativa SLEP:</strong> El traslado requiere la justificación obligatoria del apoderado mediante encuesta. Al confirmar, se enviará el formulario al apoderado y el cambio de sala se aplicará automáticamente en el sistema en cuanto el apoderado responda la justificación.</p>
            </div>

            {matriculaSeleccionada && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4 text-xs space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="font-bold text-slate-700">Resumen de la Acción:</span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold">Traslado de Sala</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div>
                    <span className="text-gray-400 block text-[11px]">Estudiante:</span>
                    <strong className="text-slate-800">{matriculaSeleccionada.estudiante_nombre}</strong>
                    <div className="text-slate-500 font-mono text-[11px]">{matriculaSeleccionada.estudiante_rut}</div>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Curso Origen:</span>
                    <strong className="text-slate-800">{matriculaSeleccionada.curso}</strong>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Curso Destino:</span>
                    <strong className="text-blue-700 font-bold">{cursoDestino || 'Por seleccionar...'}</strong>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Disponibilidad Destino:</span>
                    {cursoDestino ? (
                      <span className={cursoDestinoLleno ? 'text-red-600 font-bold' : 'text-emerald-700 font-bold'}>
                        {matriculadosCursoDestino} / {capacidadCursoDestino} cupos
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={confirmarCambioCurso} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">1. Plan de Destino</label>
                <select 
                  value={planDestino} 
                  onChange={(e) => { setPlanDestino(e.target.value); setCursoDestino(''); }}
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white outline-none" required
                >
                  <option value="">Seleccione un plan...</option>
                  {Object.keys(estructuraColegio).map(cod => (
                    <option key={cod} value={cod}>Cod. {cod} - {estructuraColegio[cod].nombrePlan}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">2. Curso Específico</label>
                <select 
                  value={cursoDestino} onChange={(e) => {
                    setCursoDestino(e.target.value);
                    setMostrarListaDestino(false);
                  }} 
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white disabled:bg-gray-100 outline-none"
                  disabled={!planDestino} required
                >
                  <option value="">Seleccione la sala...</option>
                  {planDestino && Array.from(estructuraColegio[planDestino].cursos).sort().map(curso => {
                    const cant = cuposPorCurso[curso] || 0;
                    const esActual = Boolean(cursoActual && curso.trim().toLowerCase() === cursoActual.trim().toLowerCase());
                    return (
                      <option key={curso} value={curso} disabled={esActual}>
                        {curso} ({cant} matriculados){esActual ? ' — [Curso actual del alumno]' : ''}
                      </option>
                    );
                  })}
                </select>

                {/* AVISO SI ELIGE EL MISMO CURSO */}
                {esMismoCurso && (
                  <div className="mt-2.5 p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl flex gap-2.5 items-center text-xs">
                    <AlertCircle className="text-amber-600 shrink-0" size={18} />
                    <span>El estudiante ya está matriculado en este curso (<strong>{cursoActual}</strong>). Por favor seleccione un curso de destino diferente.</span>
                  </div>
                )}

                {/* AVISO DE CAPACIDAD DE SALA / CURSO LLENO */}
                {cursoDestino && !esMismoCurso && (
                  <div>
                    {cargandoCapacidadDestino ? (
                      <p className="text-xs text-gray-500 italic mt-1.5 animate-pulse">
                        Consultando disponibilidad de vacantes en el curso...
                      </p>
                    ) : cursoDestinoLleno ? (
                      <div className="mt-2.5 p-3.5 bg-red-50 border-2 border-red-300 text-red-900 rounded-xl flex gap-3 items-start animate-in fade-in shadow-sm">
                        <AlertOctagon className="text-red-600 shrink-0 mt-0.5" size={20} />
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-red-800">
                            Curso Lleno - Capacidad Máxima Alcanzada
                          </p>
                          <p className="text-xs text-red-700 mt-1 leading-relaxed">
                            El curso <strong>{cursoDestino}</strong> ya cuenta con sus <strong>{matriculadosCursoDestino} de {capacidadCursoDestino} cupos ocupados</strong>. No es posible solicitar el traslado hacia un curso que ya cuenta con sus vacantes completas.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center justify-between text-xs animate-in fade-in">
                        <span className="font-semibold flex items-center gap-1.5">
                          <CheckCircle2 size={16} className="text-emerald-600" /> Disponibilidad en {cursoDestino}:
                        </span>
                        <span className="font-bold bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-900">
                          {matriculadosCursoDestino} / {capacidadCursoDestino} cupos ({Math.max(0, capacidadCursoDestino - matriculadosCursoDestino)} vacantes)
                        </span>
                      </div>
                    )}

                    {/* COMPONENTE: Nómina de Estudiantes Matriculados en el Curso Destino */}
                    <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setMostrarListaDestino(!mostrarListaDestino)}
                        className="w-full px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <Users size={15} className="text-blue-600" />
                          Estudiantes ya matriculados en esta sala ({estudiantesCursoDestino.length})
                        </span>
                        {mostrarListaDestino ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {mostrarListaDestino && (
                        <div className="p-2 border-t border-slate-200 max-h-48 overflow-y-auto bg-white text-xs">
                          {cargandoEstudiantesDestino ? (
                            <p className="text-center py-2 text-slate-400 italic">Cargando nómina del curso...</p>
                          ) : estudiantesCursoDestino.length === 0 ? (
                            <p className="text-center py-2 text-slate-400">No hay estudiantes activos en este curso aún.</p>
                          ) : (
                            <table className="w-full text-left">
                              <thead>
                                <tr className="border-b text-[11px] text-slate-500">
                                  <th className="py-1 px-1.5 w-10">N°</th>
                                  <th className="py-1 px-1.5">Estudiante</th>
                                  <th className="py-1 px-1.5 text-right">RUN</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {estudiantesCursoDestino.map((est, idx) => (
                                  <tr key={est.id_matricula || idx} className="hover:bg-slate-50">
                                    <td className="py-1 px-1.5 font-mono text-slate-400 text-[11px]">
                                      {est.numero_correlativo || idx + 1}
                                    </td>
                                    <td className="py-1 px-1.5 font-medium text-slate-800">
                                      {est.nombre_completo}
                                    </td>
                                    <td className="py-1 px-1.5 text-right font-mono text-slate-600 text-[11px]">
                                      {est.run}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {advertenciaNivel && (
                  <div className="mt-2 p-2.5 bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold rounded-lg flex gap-2 items-start shadow-sm animate-pulse">
                    <span className="text-sm">⚠️</span>
                    <p className="whitespace-pre-line">ATENCIÓN:<br/>{advertenciaNivel}</p>
                  </div>
                )}
              </div>

              <div className="border-t pt-3 space-y-3">
                <p className="text-xs font-bold text-gray-700 uppercase">3. Envío de Encuesta Obligatoria al Apoderado</p>
                
                <div className="p-2.5 border rounded-lg bg-gray-50 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-800">
                    <input type="checkbox" checked={enviarApoderadoCurso} onChange={(e) => setEnviarApoderadoCurso(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                    Enviar encuesta a correo del apoderado
                  </label>
                  {enviarApoderadoCurso && (
                    <input type="email" placeholder="correo.apoderado@gmail.com" value={correoApoderadoCurso} onChange={(e) => setCorreoApoderadoCurso(e.target.value)} className="w-full border p-2 rounded text-xs bg-white" required />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button type="button" onClick={() => setModalCursoAbierto(false)} className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancelar</button>
                <button 
                  type="submit" 
                  disabled={procesandoCurso || !cursoDestino || cursoDestinoLleno || cargandoCapacidadDestino || esMismoCurso} 
                  className={`px-4 py-2 text-white rounded-lg text-sm font-bold transition-all shadow-sm ${
                    cursoDestinoLleno || esMismoCurso
                      ? 'bg-red-400 cursor-not-allowed opacity-80'
                      : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
                  }`}
                >
                  {procesandoCurso 
                    ? 'Procesando...' 
                    : esMismoCurso
                      ? 'Estudiante ya está en este curso'
                      : cursoDestinoLleno 
                        ? 'Curso sin cupos disponibles (Lleno)' 
                        : 'Enviar Solicitud y Encuesta al Apoderado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL B: RETIRO DE ESTUDIANTE (SOLICITUD Y ENCUESTA)
          ======================================================================= */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Solicitar Retiro de Estudiante</h3>
            <p className="text-xs text-gray-500 mb-4">La baja del estudiante requiere que el apoderado complete obligatoriamente el cuestionario confidencial de retiro. El alumno quedará en estado <strong>'Pendiente Retiro'</strong> hasta que el sistema reciba las respuestas.</p>

            {matriculaSeleccionada && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 mb-4 text-xs space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-rose-200">
                  <span className="font-bold text-rose-900">Resumen de Baja:</span>
                  <span className="px-2 py-0.5 bg-rose-200 text-rose-900 rounded font-semibold">Solicitud Retiro</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-rose-800">
                  <div>
                    <span className="text-rose-500 block text-[11px]">Estudiante:</span>
                    <strong className="text-rose-950">{matriculaSeleccionada.estudiante_nombre}</strong>
                    <div className="text-rose-600 font-mono text-[11px]">{matriculaSeleccionada.estudiante_rut}</div>
                  </div>
                  <div>
                    <span className="text-rose-500 block text-[11px]">Curso Actual:</span>
                    <strong className="text-rose-950">{matriculaSeleccionada.curso}</strong>
                  </div>
                  <div>
                    <span className="text-rose-500 block text-[11px]">Apoderado Titular:</span>
                    <span className="text-rose-900 font-medium">{formatearNombreCorto(matriculaSeleccionada.apoderado_nombre)}</span>
                  </div>
                  <div>
                    <span className="text-rose-500 block text-[11px]">Fecha Prevista:</span>
                    <span className="font-bold text-rose-950">{fechaRetiro || 'Por seleccionar'}</span>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={confirmarRetiro} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Fecha Prevista de Retiro</label>
                <input type="date" required value={fechaRetiro} onChange={(e) => setFechaRetiro(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
              </div>

              <div className="border-t pt-3 space-y-3">
                <p className="text-xs font-bold text-gray-700 uppercase">Envío Obligatorio de Cuestionario al Apoderado</p>
                
                <div className="p-2.5 border rounded-lg bg-gray-50 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-800">
                    <input type="checkbox" checked={enviarApoderadoRetiro} onChange={(e) => setEnviarApoderadoRetiro(e.target.checked)} className="w-4 h-4 text-red-600 rounded" />
                    Enviar cuestionario a correo del apoderado
                  </label>
                  {enviarApoderadoRetiro && (
                    <input type="email" placeholder="correo.apoderado@gmail.com" value={correoApoderadoRetiro} onChange={(e) => setCorreoApoderadoRetiro(e.target.value)} className="w-full border p-2 rounded text-xs bg-white" required />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button type="button" onClick={() => setModalAbierto(false)} className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" disabled={procesandoRetiro} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {procesandoRetiro ? 'Procesando...' : 'Enviar Solicitud y Cuestionario al Apoderado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL C: EMISIÓN GENÉRICA DE DOCUMENTOS
          ======================================================================= */}
      {modalEmisionAbierto && datosEmision && (
        <ModalEmisionDocumento
          isOpen={modalEmisionAbierto}
          onClose={() => setModalEmisionAbierto(false)}
          idMatricula={datosEmision.id}
          nombreAlumno={datosEmision.nombre}
          tipoDocumento={datosEmision.tipo}
        />
      )}

      <ModalDescargaExcel
        abierto={modalExcelAbierto}
        onCerrar={() => setModalExcelAbierto(false)}
        colegioSeleccionado={colegioSeleccionado || ''}
      />

      <ModalDetalleMotivo
        isOpen={modalDetalleMotivoAbierto}
        onClose={() => setModalDetalleMotivoAbierto(false)}
        idMatricula={idMatriculaDetalleMotivo}
        modoInicial={modoDetalleMotivo}
        onAbrirCertificado={(id, tipo) => {
          setModalDetalleMotivoAbierto(false);
          abrirModalEmision(id, tipo);
        }}
      />
    </div>
  );
}
