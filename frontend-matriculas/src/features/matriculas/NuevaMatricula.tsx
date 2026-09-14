import React from 'react';
import { Search, UserCheck, AlertCircle, X, Copy, CheckCircle, Download, Mail, ArrowRight, Upload, ChevronRight, ChevronLeft } from 'lucide-react';
import { useNuevaMatricula } from './hooks/useNuevaMatricula';

export default function NuevaMatricula() {
  const {
    navigate, cargando, error, matriculaExitosa,
    rutBusqueda, estudiante, setEstudiante,
    sugerencias, mostrarSugerencias, setMostrarSugerencias, 
    handleEscribirBuscador, seleccionarEstudiante,
    datosFaltantes, setDatosFaltantes, modalFaltantes, setModalFaltantes,
    formFaltantes, setFormFaltantes, guardandoFaltantes, guardarDatosFaltantes, copiarDomicilio,
    formulario, handleChange, establecimientosDb, esPerfilColegio,
    codigosDisponibles, cursosDisponibles, seleccionarCurso,
    colegioProcedencia, esTraslado, huboPrecarga, setHuboPrecarga,
    idEstablecimientoPrevio, setIdEstablecimientoPrevio,
    setCursoPrevio, setCodigoPrevio, alertasTransicion, setAlertasTransicion,
    esColegioEMTP, esCuartoMedio,
    checkCertNotas, setCheckCertNotas, checkCertRetiro, setCheckCertRetiro,
    handleSubmit, generarComprobantePDF,
    cuposOcupados, limiteCupos,
    archivoResolucion, setArchivoResolucion,
    pasoActual, irSiguientePaso, irPasoAnterior // 🌟 Traemos las funciones del Wizard
  } = useNuevaMatricula();

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-gray-800">Registrar Nueva Matrícula</h2>
        
        {/* Barra de Progreso Visual */}
        <div className="hidden sm:flex items-center gap-2 text-sm font-bold">
          <span className={`px-3 py-1 rounded-full ${pasoActual >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>1. Identificación</span>
          <div className={`w-8 h-1 ${pasoActual >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
          <span className={`px-3 py-1 rounded-full ${pasoActual >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>2. Académico</span>
          <div className={`w-8 h-1 ${pasoActual >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
          <span className={`px-3 py-1 rounded-full ${pasoActual >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>3. Autorizaciones</span>
        </div>
      </div>
      
      <form onSubmit={handleSubmit}>
        
        {/* =======================================================================
            PASO 1: BÚSQUEDA E IDENTIFICACIÓN DEL ESTUDIANTE
            ======================================================================= */}
        {pasoActual === 1 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-semibold text-gray-700 mb-4 border-b pb-2">Paso 1: Identificación del Estudiante</h3>
            
            <div className="relative mb-6">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                  <input 
                    type="text" 
                    placeholder="Ingrese RUT o Nombre del estudiante a matricular..."
                    value={rutBusqueda} 
                    onChange={(e) => handleEscribirBuscador(e.target.value)}
                    onFocus={() => { if (sugerencias.length > 0) setMostrarSugerencias(true) }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 outline-none transition-all"
                    disabled={estudiante !== null} 
                  />
                </div>
                
                {estudiante && (
                  <button 
                    type="button" 
                    onClick={() => { 
                      setEstudiante(null); handleEscribirBuscador(''); setHuboPrecarga(false); setDatosFaltantes([]); 
                      setCursoPrevio(''); setCodigoPrevio(null); setAlertasTransicion([]);
                      setCheckCertNotas(false); setCheckCertRetiro(false); setIdEstablecimientoPrevio(null);
                    }} 
                    className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors font-bold"
                  >
                    Cambiar Alumno
                  </button>
                )}
              </div>

              {mostrarSugerencias && !estudiante && (
                <ul className="absolute z-50 w-full md:w-[calc(100%-140px)] mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {sugerencias.length === 0 ? (
                    <li className="p-3 text-sm text-gray-500 text-center">No se encontraron estudiantes.</li>
                  ) : (
                    sugerencias.map((est) => (
                      <li 
                        key={est.id}
                        onClick={() => seleccionarEstudiante(est)}
                        className="p-3 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors flex flex-col"
                      >
                        <span className="font-semibold text-gray-800">{est.nombre_completo}</span>
                        <span className="text-xs text-gray-500">RUT: {est.run}</span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4">{error}</div>}

            {estudiante && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-lg flex items-start gap-4 mb-6">
                <div className="bg-emerald-100 p-2 rounded-full text-emerald-600 mt-1"><UserCheck size={24} /></div>
                <div className="flex-1">
                  <p className="text-sm text-emerald-800 font-semibold uppercase tracking-wider">Estudiante Seleccionado</p>
                  <p className="text-lg font-bold text-gray-900">{estudiante.nombres} {estudiante.apellidos}</p>
                  <p className="text-sm text-gray-600 mb-1">RUT: {estudiante.run}</p>
                  
                  {datosFaltantes.length > 0 && (
                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="flex items-center gap-2 text-orange-800 font-bold text-sm mb-1">
                        <AlertCircle size={16} /> 
                        <span>* Información Incompleta (Estudiante / Apoderado)</span>
                      </div>
                      <ul className="list-disc pl-5 text-xs text-orange-700 mb-3">
                        {datosFaltantes.map(dato => <li key={dato}>{dato}</li>)}
                      </ul>
                      <button 
                        type="button" 
                        onClick={() => setModalFaltantes(true)}
                        className="text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded transition-colors"
                      >
                        Completar Ficha Obligatoria
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button 
                type="button" 
                onClick={irSiguientePaso}
                disabled={!estudiante || datosFaltantes.length > 0} 
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
              >
                Siguiente Paso <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* =======================================================================
            PASO 2: DATOS DE MATRÍCULA Y ESTABLECIMIENTO
            ======================================================================= */}
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
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm ${cuposOcupados >= limiteCupos ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                      Cupos: {cuposOcupados} / {limiteCupos}
                    </span>
                  )}
                </div>
                <select name="cursoSeleccionado" value={formulario.cursoSeleccionado} onChange={(e) => seleccionarCurso(e.target.value)} required className={`w-full border rounded-lg p-2 outline-none font-bold ${cuposOcupados >= limiteCupos ? 'border-red-300 text-red-800 bg-red-50' : 'border-gray-300 text-blue-800 bg-white'}`}>
                  {cursosDisponibles.length === 0 ? <option value="">Seleccione un plan</option> : cursosDisponibles.map(curso => <option key={curso} value={curso}>{curso}</option>)}
                </select>
              </div>
            </div>

            {/* Alertas de Transición (Mantenemos la lógica visual) */}
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
                                {archivoResolucion ? <p className="text-sm font-semibold text-emerald-700">{archivoResolucion.name}</p> : <p className="text-sm text-gray-500">Haga clic para subir PDF</p>}
                              </div>
                              <input id="pdf-upload" type="file" accept=".pdf" className="hidden" required={!archivoResolucion} onChange={(e) => setArchivoResolucion(e.target.files?.[0] || null)}/>
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

        {/* =======================================================================
            PASO 3: AUTORIZACIONES Y MÉTODO DE FIRMA (🌟 NUEVO)
            ======================================================================= */}
        {pasoActual === 3 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-right-4 space-y-6">
            <h3 className="font-semibold text-gray-700 mb-2 border-b pb-2">Paso 3: Envío y Firma de Documentos</h3>
            <p className="text-sm text-gray-500 mb-6">La religión, el acta de compromiso y las autorizaciones institucionales las decide y marca directamente el apoderado. Usted solo define cómo se le harán llegar los documentos para su firma.</p>

            {/* Aviso: estas preguntas ya no las responde el funcionario */}
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

            {/* Selector del Método de Firma (El Híbrido) */}
            <div className="mt-6 border-t border-gray-200 pt-6">
              <h4 className="font-bold text-gray-800 mb-3">Método de Firma de Documentos</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Opción Digital */}
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

                {/* Opción Manual (Papel) */}
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
                {cargando ? 'Procesando...' : (formulario.metodo_firma === 'Digital' ? 'Enviar Solicitud de Firma' : 'Generar Documentos para Firma')}
              </button>
            </div>
          </div>
        )}

      </form>

      {/* =======================================================================
          MODALES EXISTENTES (Faltantes y Éxito)
          ======================================================================= */}
      {/* Modal Faltantes se mantiene igual... */}
      {modalFaltantes && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           {/* ... (Tu código actual del modal faltantes queda intacto) ... */}
           <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
             <h3 className="font-bold text-gray-800 mb-4">Por favor actualice los datos del estudiante en la pestaña "Directorio de Estudiantes" para continuar.</h3>
             <button onClick={() => setModalFaltantes(false)} className="px-4 py-2 bg-gray-200 rounded">Cerrar</button>
           </div>
        </div>
      )}

      {/* MODAL DE ÉXITO ADAPTADO AL NUEVO FLUJO HÍBRIDO */}
      {matriculaExitosa && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-[#25306B] p-6 text-center">
              <CheckCircle className="mx-auto text-emerald-400 mb-3" size={48} />
              <h3 className="text-xl font-bold text-white">{formulario.metodo_firma === 'Digital' ? '¡Solicitud de Firma Enviada!' : '¡Matrícula Registrada!'}</h3>
              <p className="text-blue-200 text-sm mt-1">
                {formulario.metodo_firma === 'Digital' 
                  ? 'El estudiante fue ingresado y queda a la espera de la firma del apoderado.' 
                  : 'El estudiante ha sido ingresado exitosamente.'}
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              
              {/* Botón dinámico según el método de firma elegido */}
              {formulario.metodo_firma === 'Digital' ? (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-center">
                  <Mail className="mx-auto text-blue-600 mb-2" size={24} />
                  <p className="text-sm font-bold text-blue-900">Solicitud de Firma Enviada</p>
                  <p className="text-xs text-blue-700 mt-1">La matrícula queda en estado <span className="font-bold">Pendiente de Firma</span> hasta que el apoderado lea, responda religión/autorizaciones y firme con su Clave Única.</p>
                </div>
              ) : (
                <button 
                  onClick={generarComprobantePDF}
                  className="w-full flex flex-col items-center justify-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 py-4 rounded-lg font-bold transition-colors"
                >
                  <span className="flex items-center gap-2"><Download size={20} /> Descargar Set de Documentos (PDF)</span>
                  <span className="text-[10px] font-normal text-orange-600">Imprima este archivo para la firma presencial del apoderado.</span>
                </button>
              )}

              <div className="border-t border-gray-100 pt-4 mt-2">
                <button 
                  onClick={() => navigate('/matriculas')}
                  className="w-full flex items-center justify-center gap-2 bg-[#006BB9] hover:bg-[#25306B] text-white py-3 rounded-lg font-bold transition-colors shadow-md"
                >
                  Volver al inicio <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}