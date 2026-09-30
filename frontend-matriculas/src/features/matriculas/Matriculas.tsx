import React from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, CheckCircle2 } from 'lucide-react';
import ModalEmisionDocumento from '../../components/ModalEmisionDocumento';
import ModalDescargaExcel from './components/ModalDescargaExcel';
import { useMatriculas } from './hooks/useMatriculas'; 
import { API_BASE_URL } from '../../config/api';

export default function Matriculas() {
  const {
    colegioSeleccionado, puedeEditar, puedeCargarSIGE, anioActual,
    cargando, error, subiendoArchivo,
    busqueda, setBusqueda,
    filtroAnio, setFiltroAnio,
    filtroCodigo, setFiltroCodigo,
    filtroCurso, setFiltroCurso,
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
    manejarSubidaCSV, abrirModalEmision, iniciarRetiro, confirmarRetiro, 
    iniciarCambioCurso, confirmarCambioCurso,
    mostrarCupos, cuposOcupados, capacidadSala, descargandoExcel, exportarAExcel,
    capacidadCursoDestino, cargandoCapacidadDestino, matriculadosCursoDestino, cursoDestinoLleno, cuposPorCurso,
    modalExcelAbierto, setModalExcelAbierto,
    page, setPage, totalPages, total,
  } = useMatriculas();

  const formatearNombreCorto = (nombre?: string) => {
    if (!nombre || nombre === 'Pendiente' || nombre === 'Sin registro') {
      return nombre || 'Pendiente';
    }
    const palabras = nombre.trim().split(/\s+/);
    if (palabras.length <= 2) return nombre;
    return `${palabras[0]} ${palabras[1]}`;
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
              {puedeCargarSIGE && (
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
              <Link to="/matriculas/nueva" className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                + Renovar Matrícula
              </Link>
            </>
          )}
        </div>
      </div>                         

      {!cargando && !error && !colegioSeleccionado && (
        <div className="bg-blue-50 border border-blue-200 p-10 rounded-xl shadow-sm text-center flex flex-col items-center justify-center">
          <div className="text-4xl mb-4">🏫</div>
          <h2 className="text-xl font-extrabold text-blue-900 mb-2">Seleccione un Establecimiento</h2>
          <p className="text-blue-700 max-w-2xl">
            Para garantizar la velocidad del sistema, la vista global ha sido deshabilitada. 
            Por favor, <strong>utilice el "Filtro Institucional" en la barra superior</strong> y elija un colegio específico para cargar su registro de matrículas.
          </p>
        </div>
      )}

      {cargando && <p className="text-gray-500 font-medium">Cargando base de datos...</p>}
      {error && <p className="text-red-500 font-medium">Error: {error}</p>}

      {!cargando && !error && matriculasProcesadas.length >= 0 && colegioSeleccionado && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <th className="p-4 font-medium">Apoderado Titular</th>
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
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                          mat.estado === 'Activa' 
                            ? 'bg-green-50 text-green-700 border-green-200' 
                            : mat.estado === 'Pendiente Retiro'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {mat.estado === 'Pendiente Retiro' ? '⏳ Pendiente Retiro' : mat.estado}
                        </span>
                        {mat.estado_renovacion && (
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            mat.estado_renovacion === 'Firmada'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : mat.estado_renovacion === 'Pendiente firma'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
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
                        {mat.estado === 'Activa' && (
                          <>
                            <button onClick={() => abrirModalEmision(mat.id_matricula, 'MATRICULA')} className="text-emerald-600 hover:text-emerald-800 font-medium transition-colors">
                              Emitir Doc.
                            </button>

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
                  value={cursoDestino} onChange={(e) => setCursoDestino(e.target.value)} 
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white disabled:bg-gray-100 outline-none"
                  disabled={!planDestino} required
                >
                  <option value="">Seleccione la sala...</option>
                  {planDestino && Array.from(estructuraColegio[planDestino].cursos).sort().map(curso => {
                    const cant = cuposPorCurso[curso] || 0;
                    return (
                      <option key={curso} value={curso}>
                        {curso} ({cant} matriculados)
                      </option>
                    );
                  })}
                </select>

                {/* AVISO DE CAPACIDAD DE SALA / CURSO LLENO */}
                {cursoDestino && (
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
                          {matriculadosCursoDestino} / {capacidadCursoDestino} cupos ({capacidadCursoDestino - matriculadosCursoDestino} vacantes)
                        </span>
                      </div>
                    )}
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
                  disabled={procesandoCurso || !cursoDestino || cursoDestinoLleno || cargandoCapacidadDestino} 
                  className={`px-4 py-2 text-white rounded-lg text-sm font-bold transition-all shadow-sm ${
                    cursoDestinoLleno
                      ? 'bg-red-400 cursor-not-allowed opacity-80'
                      : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
                  }`}
                >
                  {procesandoCurso 
                    ? 'Procesando...' 
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
    </div>
  );
}
