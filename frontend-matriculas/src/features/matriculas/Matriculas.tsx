import React from 'react';
import { Link } from 'react-router-dom';
import ModalEmisionDocumento from '../../components/ModalEmisionDocumento';
import { useMatriculas } from './hooks/useMatriculas'; 

export default function Matriculas() {
  const {
    colegioSeleccionado, puedeEditar, anioActual,
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
    mostrarCupos, cuposOcupados, LIMITE_CUPOS // 🌟 Variables extraídas del hook
  } = useMatriculas();

  return (
    <div className="space-y-6 relative">
      
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Registro de Matrículas</h1>
        
        <div className="flex flex-wrap gap-3">
          {puedeEditar && (
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
                {subiendoArchivo ? 'Procesando archivos...' : '📄 Cargar SIGE / CSV'}
              </label>
              <Link to="/matriculas/nueva" className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                + Nueva Matrícula
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
            <select value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none bg-white cursor-pointer">
              {aniosUnicos.map(anio => <option key={anio} value={anio}>{anio}</option>)}
              <option value="todos">Todos los años</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">📚 2. Plan de Estudio</label>
            <select value={filtroCodigo} onChange={(e) => setFiltroCodigo(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none bg-white cursor-pointer">
              <option value="">Todos los planes</option>
              {codigosUnicos.map(cod => <option key={cod} value={cod}>Cod. {cod}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">🏫 3. Curso</label>
            <select value={filtroCurso} onChange={(e) => setFiltroCurso(e.target.value)} disabled={cursosUnicos.length === 0} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none bg-white disabled:bg-gray-100 disabled:text-gray-400">
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
              Mostrando {matriculasProcesadas.length} resultados
            </span>
            
            {/* Lógica Condicional: Se muestra solo cuando los 3 filtros están seleccionados */}
            {mostrarCupos && (
              <div className={`flex items-center gap-3 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                cuposOcupados >= LIMITE_CUPOS 
                  ? 'bg-red-100 text-red-700 border-red-200' 
                  : 'bg-blue-100 text-blue-700 border-blue-200'
              }`}>
                <span>👥 Ocupación en sala:</span>
                <span className="text-sm">{cuposOcupados} / {LIMITE_CUPOS}</span>
                
                {cuposOcupados >= LIMITE_CUPOS && (
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
                        <p className="font-bold text-gray-800">{mat.estudiante_nombre}</p>
                        <p className="text-xs text-gray-500">{mat.estudiante_rut}</p>
                    </td>
                    <td className="p-4">
                        <p className="font-medium text-emerald-700">{mat.apoderado_nombre}</p>
                        <p className="text-xs text-gray-500">{mat.apoderado_rut}</p>
                    </td>
                    <td className="p-4">
                        <p className="font-bold text-blue-800">{mat.curso}</p>
                        <p className="text-xs text-gray-600 truncate max-w-[250px]" title={mat.tipo_ensenanza}>
                          {mat.cod_tipo_ensenanza && <span className="font-semibold text-gray-700 mr-1">(Cod. {mat.cod_tipo_ensenanza})</span>}
                          {mat.tipo_ensenanza}
                        </p>
                    </td>
                    <td className="p-4 text-center font-semibold text-gray-700">{mat.anio_escolar}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${mat.estado === 'Activa' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {mat.estado}
                      </span>
                    </td>
                    
                    <td className="p-4 text-right">
                      {mat.estado === 'Activa' && (
                        <div className="flex justify-end gap-3">
                          <button onClick={() => abrirModalEmision(mat.id_matricula, 'MATRICULA')} className="text-emerald-600 hover:text-emerald-800 font-medium transition-colors">
                            Emitir Doc.
                          </button>
                          
                          {puedeEditar && mat.anio_escolar === anioActual && (
                            <button onClick={() => iniciarCambioCurso(mat.id_matricula, mat.curso, mat.cod_tipo_ensenanza)} className="text-blue-600 hover:text-blue-800 font-medium transition-colors">Mover</button>                            )}
                          {puedeEditar && (
                            <button onClick={() => iniciarRetiro(mat.id_matricula)} className="text-red-600 hover:text-red-800 font-medium transition-colors">Retirar</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* =======================================================================
          MODAL A: CAMBIO DE CURSO (TRASLADO INTERNO)
          ======================================================================= */}
      {modalCursoAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Cambio de Curso y Emisión de Constancia</h3>
            
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-4 text-xs text-blue-800">
              <p><strong>Normativa SLEP:</strong> El traslado exige el envío obligatorio del certificado digital al director o apoderado.</p>
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
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white disabled:bg-gray-100"
                  disabled={!planDestino} required
                >
                  <option value="">Seleccione la sala...</option>
                  {planDestino && Array.from(estructuraColegio[planDestino].cursos).sort().map(curso => (
                    <option key={curso} value={curso}>{curso}</option>
                  ))}
                </select>
                
                  {advertenciaNivel && (
                  <div className="mt-2 p-2.5 bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold rounded-lg flex gap-2 items-start shadow-sm animate-pulse">
                    <span className="text-sm">⚠️</span>
                    <p className="whitespace-pre-line">ATENCIÓN:<br/>{advertenciaNivel}</p>
                  </div>
                )}
              </div>

              <div className="border-t pt-3 space-y-3">
                <p className="text-xs font-bold text-gray-700 uppercase">4. Envío Obligatorio de Comprobante</p>
                
                <div className="p-2.5 border rounded-lg bg-gray-50 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-800">
                    <input type="checkbox" checked={enviarApoderadoCurso} onChange={(e) => setEnviarApoderadoCurso(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                    Enviar correo
                  </label>
                  {enviarApoderadoCurso && (
                    <input type="email" placeholder="correo.apoderado@gmail.com" value={correoApoderadoCurso} onChange={(e) => setCorreoApoderadoCurso(e.target.value)} className="w-full border p-2 rounded text-xs bg-white" required />
                  )}
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                  <input type="checkbox" checked={descargarLocalCurso} onChange={(e) => setDescargarLocalCurso(e.target.checked)} className="w-4 h-4 text-emerald-600 rounded" />
                  Descargar también una copia local en mi equipo (Opcional)
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button type="button" onClick={() => setModalCursoAbierto(false)} className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" disabled={procesandoCurso || !cursoDestino} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {procesandoCurso ? 'Procesando...' : 'Confirmar Traslado y Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL B: RETIRO DE ESTUDIANTE (BAJA OFICIAL)
          ======================================================================= */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Registrar Retiro y Constancia</h3>
            <p className="text-xs text-gray-500 mb-4">La baja del estudiante requiere el despacho obligatorio del comprobante oficial.</p>

            <form onSubmit={confirmarRetiro} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Fecha Efectiva de Retiro</label>
                <input type="date" required value={fechaRetiro} onChange={(e) => setFechaRetiro(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
              </div>

              <div className="border-t pt-3 space-y-3">
                <p className="text-xs font-bold text-gray-700 uppercase">Envío Obligatorio de Comprobante de Retiro</p>
                
                <div className="p-2.5 border rounded-lg bg-gray-50 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-800">
                    <input type="checkbox" checked={enviarApoderadoRetiro} onChange={(e) => setEnviarApoderadoRetiro(e.target.checked)} className="w-4 h-4 text-red-600 rounded" />
                    Enviar correo
                  </label>
                  {enviarApoderadoRetiro && (
                    <input type="email" placeholder="correo.apoderado@gmail.com" value={correoApoderadoRetiro} onChange={(e) => setCorreoApoderadoRetiro(e.target.value)} className="w-full border p-2 rounded text-xs bg-white" required />
                  )}
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                  <input type="checkbox" checked={descargarLocalRetiro} onChange={(e) => setDescargarLocalRetiro(e.target.checked)} className="w-4 h-4 text-emerald-600 rounded" />
                  Descargar también una copia local en mi equipo (Opcional)
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button type="button" onClick={() => setModalAbierto(false)} className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" disabled={procesandoRetiro} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {procesandoRetiro ? 'Procesando...' : 'Confirmar Retiro y Enviar'}
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
    </div>
  );
}