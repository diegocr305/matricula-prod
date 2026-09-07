import React from 'react';
import { Search, User, UserCheck, Clock, ArrowLeft, ChevronRight, UserPlus, Edit2, Save, X, CheckCircle } from 'lucide-react';
import { useEstudiantes } from './hooks/useEstudiantes'; 

export default function Estudiantes() {
  const {
    puedeEditar,
    datosEstudiante, setDatosEstudiante,
    modoEdicion, setModoEdicion,
    manejarSubidaCSV, subiendoArchivo,
    modalNuevoAbierto, setModalNuevoAbierto,
    guardandoEdicion, handleGuardarEdicion,
    textoBusqueda, setTextoBusqueda,
    cargandoLista, estudiantesFiltrados,
    verFichaEstudiante,
    datosEdicion, setDatosEdicion,
    estudianteCreadoExito, rutRecienCreado, cerrarModalExito, irAMatricular,
    nuevoEstudiante, setNuevoEstudiante, formatearRUT, handleCrearEstudiante,
    creando, buscarSugerencias, buscandoMapa, sugerenciasMapa, seleccionarDireccion
  } = useEstudiantes();

  // 🌟 VARIABLES PARA UI: Detectan en tiempo real si los campos son IPE/IPA
  const esIpeEstudiante = nuevoEstudiante.run.replace(/[^0-9kK]/g, '').length >= 10;
  const esIpaApoderado = nuevoEstudiante.run_apoderado.replace(/[^0-9kK]/g, '').length >= 10;

  return (
    <div className="space-y-6 max-w-5xl mx-auto relative">
      
      {/* CABECERA */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {datosEstudiante && (
            <button onClick={() => { setDatosEstudiante(null); setModoEdicion(false); }} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
              <ArrowLeft size={20} />
            </button>
          )}
          <h1 className="text-2xl font-bold text-gray-800">
            {datosEstudiante ? 'Ficha del Estudiante' : 'Directorio de Estudiantes'}
          </h1>
        </div>
        
        {!datosEstudiante ? (
          <div className="flex gap-3">
            {puedeEditar && (
              <>
                <input 
                  type="file" accept=".csv, .xls, .xlsx" id="csv-upload" className="hidden" 
                  onChange={manejarSubidaCSV} disabled={subiendoArchivo}
                />
                <label 
                  htmlFor="csv-upload" 
                  className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg font-medium transition-colors border ${
                    subiendoArchivo ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-emerald-600 border-emerald-600 hover:bg-emerald-50'
                  }`}
                >
                  {subiendoArchivo ? 'Cargando...' : '📄 Cargar SIGE / CSV'}
                </label>
                <button onClick={() => setModalNuevoAbierto(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                  <UserPlus size={20} /> Nuevo Estudiante
                </button>
              </>
            )}
          </div>
        ) : (
          !modoEdicion ? (
            puedeEditar && (
              <button onClick={() => setModoEdicion(true)} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                <Edit2 size={18} /> Editar Datos
              </button>
            )
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setModoEdicion(false)} className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors">
                <X size={18} /> Cancelar
              </button>
              <button onClick={handleGuardarEdicion} disabled={guardandoEdicion} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
                <Save size={18} /> {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          )
        )}
      </div>

      {/* VISTA 1: DIRECTORIO */}
      {!datosEstudiante && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input 
                type="text" placeholder="Buscar por nombre, apellido o RUT..."
                value={textoBusqueda} onChange={(e) => setTextoBusqueda(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {cargandoLista ? (
              <div className="p-8 text-center text-gray-500">Cargando directorio...</div>
            ) : estudiantesFiltrados.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No hay estudiantes en este colegio.</div>
            ) : (
              estudiantesFiltrados.map((est) => (
                <li key={est.id}>
                  <button 
                    onClick={() => verFichaEstudiante(est.run)}
                    className="w-full flex items-center justify-between p-4 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div>
                      <p className="font-semibold text-gray-800 text-lg">{est.nombre_completo}</p>
                      <p className="text-sm text-gray-500">RUT: {est.run}</p>
                    </div>
                    <div className="text-blue-500"><ChevronRight size={20} /></div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

     {/* VISTA 2: FICHA DEL ESTUDIANTE */}
      {datosEstudiante && (() => {
        const historialOrdenado = [...datosEstudiante.historial].sort((a, b) => b.id - a.id);
        const ultimaMatricula = historialOrdenado.length > 0 ? historialOrdenado[0] : null;

        return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-right-8 duration-300">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 lg:col-span-1 h-fit">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><User size={24} /></div>
              <h2 className="text-lg font-bold text-gray-800">Datos Personales</h2>
            </div>
            <div className="space-y-4">
              <div><p className="text-sm text-gray-500">RUN / IPE</p><p className="font-medium">{datosEstudiante.personal.run}</p></div>
              <div><p className="text-sm text-gray-500">Nombre Completo</p><p className="font-medium">{datosEstudiante.personal.nombres} {datosEstudiante.personal.apellidos}</p></div>
              <div><p className="text-sm text-gray-500">Fecha Nacimiento</p><p className="font-medium">{datosEstudiante.personal.fecha_nacimiento}</p></div>
              
              <div className="pt-2 border-t border-gray-50">
                <p className="text-sm text-gray-500 mb-1">Última Matrícula Registrada</p>
                <p className="font-bold text-blue-800">
                  {ultimaMatricula ? ultimaMatricula.establecimiento : 'Sin registro'}
                </p>
                <p className="text-xs text-gray-500 font-mono">
                  RBD: {ultimaMatricula ? ultimaMatricula.rbd : 'N/A'}
                </p>
              </div>

              <div className="pt-2 border-t border-gray-50">
                <p className="text-sm text-gray-500 mb-1">Domicilio Actual</p>
                {!modoEdicion ? (
                  <p className="font-medium">{datosEstudiante.personal.domicilio}</p>
                ) : (
                  <input type="text" value={datosEdicion.domicilio} onChange={(e) => setDatosEdicion({...datosEdicion, domicilio: e.target.value})} className="w-full border border-blue-300 bg-blue-50 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 transition-colors" />
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6 lg:col-span-2">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><UserCheck size={24} /></div>
                <h2 className="text-lg font-bold text-gray-800">Apoderado Titular</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {!modoEdicion ? (
                  <>
                    <div><p className="text-sm text-gray-500">Nombre</p><p className="font-medium">{datosEstudiante.apoderado.nombre}</p></div>
                    <div><p className="text-sm text-gray-500">RUT</p><p className="font-medium">{datosEstudiante.apoderado.rut}</p></div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">RUT Apoderado</p>
                      <input type="text" placeholder="12345678-9" value={datosEdicion.rut_apoderado} onChange={(e) => setDatosEdicion({...datosEdicion, rut_apoderado: e.target.value})} className="w-full border border-blue-300 bg-blue-50 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 transition-colors" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Nombres</p>
                      <input type="text" placeholder="Nombres" value={datosEdicion.nombres_apoderado} onChange={(e) => setDatosEdicion({...datosEdicion, nombres_apoderado: e.target.value})} className="w-full border border-blue-300 bg-blue-50 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 transition-colors" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Apellido Paterno</p>
                      <input type="text" placeholder="Apellido paterno" value={datosEdicion.apellido_paterno_apoderado} onChange={(e) => setDatosEdicion({...datosEdicion, apellido_paterno_apoderado: e.target.value})} className="w-full border border-blue-300 bg-blue-50 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 transition-colors" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Apellido Materno</p>
                      <input type="text" placeholder="Apellido materno" value={datosEdicion.apellido_materno_apoderado} onChange={(e) => setDatosEdicion({...datosEdicion, apellido_materno_apoderado: e.target.value})} className="w-full border border-blue-300 bg-blue-50 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 transition-colors" />
                    </div>
                  </>
                )}
                <div className="pt-2 border-t border-gray-50">
                  <p className="text-sm text-gray-500 mb-1">Teléfono</p>
                  {!modoEdicion ? (
                    <p className="font-medium">{datosEstudiante.apoderado.telefono}</p>
                  ) : (
                    <input type="text" value={datosEdicion.telefono_apoderado} onChange={(e) => setDatosEdicion({...datosEdicion, telefono_apoderado: e.target.value})} className="w-full border border-blue-300 bg-blue-50 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 transition-colors" />
                  )}
                </div>
                <div className="pt-2 border-t border-gray-50">
                  <p className="text-sm text-gray-500 mb-1">Correo Electrónico</p>
                  {!modoEdicion ? (
                    <p className="font-medium">{datosEstudiante.apoderado.correo}</p>
                  ) : (
                    <input type="text" value={datosEdicion.correo_apoderado} onChange={(e) => setDatosEdicion({...datosEdicion, correo_apoderado: e.target.value})} className="w-full border border-blue-300 bg-blue-50 rounded p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 transition-colors" />
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
                <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><Clock size={24} /></div>
                <h2 className="text-lg font-bold text-gray-800">Historial RGM</h2>
              </div>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="pb-2">Año</th>
                      <th className="pb-2">Establecimiento</th>
                      <th className="pb-2">Curso</th>
                      <th className="pb-2 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialOrdenado.length === 0 && (
                      <tr><td colSpan={4} className="py-4 text-center text-gray-500">Sin historial de matrículas</td></tr>
                    )}
                    {historialOrdenado.map((reg: any) => (
                      <tr key={reg.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-3 font-semibold">{reg.anio}</td>
                        <td className="py-3">
                          <p className="font-bold text-gray-800">{reg.establecimiento}</p>
                          <p className="text-xs text-gray-500 font-mono">RBD: {reg.rbd}</p>
                        </td>
                        <td className="py-3 font-medium text-gray-700">{reg.curso}</td>
                        <td className="py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${reg.estado === 'Activa' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                            {reg.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </div>
        </div>
        );
      })()}

      {/* MODAL CREAR NUEVO ESTUDIANTE */}
      {modalNuevoAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-2xl">
            {estudianteCreadoExito ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} />
                </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-3">¡Estudiante Ingresado!</h3>
                <p className="text-gray-600 mb-8 max-w-md mx-auto">
                  El estudiante ha sido registrado en el sistema con el RUT <strong>{rutRecienCreado}</strong>. Para que el registro esté completo, debes asociarle una matrícula activa.
                </p>
                <div className="flex justify-center gap-4">
                  <button onClick={cerrarModalExito} className="px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">
                    Cerrar
                  </button>
                  <button onClick={irAMatricular} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                    Ir a Matricular <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold text-gray-800 mb-4">Registrar Nuevo Estudiante</h3>
                <form onSubmit={handleCrearEstudiante} className="space-y-4 overflow-y-auto max-h-[70vh] pr-2">
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-4">
                    <p className="text-sm text-blue-800">
                      <strong>Importante:</strong> Todos los campos marcados con <span className="text-red-500">*</span> son estrictamente obligatorios.
                    </p>
                  </div>

                  <h4 className="font-semibold text-blue-600 border-b pb-1">Datos del Estudiante</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">RUT o IPE <span className="text-red-500">*</span></label>
                      <input required type="text" placeholder="Ej: 21123456-7" value={nuevoEstudiante.run} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, run: formatearRUT(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-blue-500 outline-none text-sm font-mono" maxLength={12} />
                    </div>

                    {/* 🌟 FORMULARIO CONDICIONAL ESTUDIANTE IPE */}
                    {esIpeEstudiante && (
                      <div className="col-span-full bg-blue-50 border border-blue-200 p-4 rounded-lg mt-2 mb-2 animate-in slide-in-from-top-2">
                        <h4 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                          <span>🌍</span> Identificador Provisorio Escolar (IPE) Detectado
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-blue-800 mb-1">País de Origen <span className="text-red-500">*</span></label>
                            <select 
                              required={esIpeEstudiante}
                              value={nuevoEstudiante.pais_origen_estudiante || ''}
                              onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, pais_origen_estudiante: e.target.value})}
                              className="w-full border border-blue-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                              <option value="">Seleccione país...</option>
                              <option value="Venezuela">Venezuela</option>
                              <option value="Colombia">Colombia</option>
                              <option value="Perú">Perú</option>
                              <option value="Bolivia">Bolivia</option>
                              <option value="Haití">Haití</option>
                              <option value="Ecuador">Ecuador</option>
                              <option value="Otro">Otro país</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-blue-800 mb-1">Documento de Identidad Extranjero <span className="text-red-500">*</span></label>
                            <input 
                              required={esIpeEstudiante}
                              type="text" 
                              value={nuevoEstudiante.doc_extranjero_estudiante || ''}
                              onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, doc_extranjero_estudiante: e.target.value})}
                              placeholder="N° de Pasaporte o DNI"
                              className="w-full border border-blue-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" 
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nombres <span className="text-red-500">*</span></label>
                      <input required type="text" value={nuevoEstudiante.nombres} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, nombres: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Ap. Paterno <span className="text-red-500">*</span></label>
                      <input required type="text" value={nuevoEstudiante.apellido_paterno} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, apellido_paterno: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Ap. Materno <span className="text-red-500">*</span></label>
                      <input required type="text" value={nuevoEstudiante.apellido_materno} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, apellido_materno: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">F. Nacimiento <span className="text-red-500">*</span></label>
                      <input required type="date" value={nuevoEstudiante.fecha_nacimiento} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, fecha_nacimiento: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Sexo <span className="text-red-500">*</span></label>
                      <select required value={nuevoEstudiante.sexo} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, sexo: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-blue-500 outline-none text-sm bg-white">
                        <option value="Masculino">Masculino</option>
                        <option value="Femenino">Femenino</option>
                        <option value="No Informado">No Informado</option>
                      </select>
                    </div>
                  </div>
                  <div className="relative">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Domicilio Actual (Estudiante) <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      <input required type="text" placeholder="Ej: Calle Prat, Valparaíso" value={nuevoEstudiante.domicilio} onChange={(e) => { setNuevoEstudiante({...nuevoEstudiante, domicilio: e.target.value, latitud: '', longitud: ''}); }} className="flex-1 border border-gray-300 rounded-lg p-2 focus:ring-blue-500 outline-none text-sm" />
                      <button type="button" onClick={buscarSugerencias} disabled={buscandoMapa} className={`px-3 text-xs font-bold rounded-lg border transition-colors ${ nuevoEstudiante.latitud ? 'bg-green-100 text-green-700 border-green-300 cursor-not-allowed' : 'bg-blue-100 hover:bg-blue-200 text-blue-700 border-blue-300' } disabled:opacity-50`}>
                        {buscandoMapa ? 'Buscando...' : (nuevoEstudiante.latitud ? '✓ Validado' : '🔍 Buscar')}
                      </button>
                    </div>
                    {sugerenciasMapa.length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {sugerenciasMapa.map((lugar, index) => (
                          <li key={index} onClick={() => seleccionarDireccion(lugar)} className="p-3 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors">
                            <p className="text-sm text-gray-800">{lugar.display_name}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!nuevoEstudiante.latitud && (
                      <p className="text-[11px] text-red-500 mt-1 italic">* Escribe la dirección y haz clic en Buscar para validar la geolocalización.</p>
                    )}
                  </div>

                  <h4 className="font-semibold text-emerald-600 border-b pb-1 mt-6">Datos del Apoderado Titular</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">RUT o Pasaporte <span className="text-red-500">*</span></label>
                      <input required type="text" placeholder="Ej: 12345678-9" value={nuevoEstudiante.run_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, run_apoderado: formatearRUT(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-emerald-500 outline-none text-sm font-mono" maxLength={12} />
                    </div>

                    {/* 🌟 FORMULARIO CONDICIONAL APODERADO IPA */}
                    {esIpaApoderado && (
                      <div className="col-span-full bg-emerald-50 border border-emerald-200 p-4 rounded-lg mt-2 mb-2 animate-in slide-in-from-top-2">
                        <h4 className="text-sm font-bold text-emerald-900 mb-3 flex items-center gap-2">
                          <span>🌍</span> Identificador Provisorio de Apoderado (IPA) Detectado
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-emerald-800 mb-1">País de Origen <span className="text-red-500">*</span></label>
                            <select 
                              required={esIpaApoderado}
                              value={nuevoEstudiante.pais_origen_apoderado || ''}
                              onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, pais_origen_apoderado: e.target.value})}
                              className="w-full border border-emerald-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                            >
                              <option value="">Seleccione país...</option>
                              <option value="Venezuela">Venezuela</option>
                              <option value="Colombia">Colombia</option>
                              <option value="Perú">Perú</option>
                              <option value="Bolivia">Bolivia</option>
                              <option value="Haití">Haití</option>
                              <option value="Ecuador">Ecuador</option>
                              <option value="Otro">Otro país</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-emerald-800 mb-1">Documento de Identidad Extranjero <span className="text-red-500">*</span></label>
                            <input 
                              required={esIpaApoderado}
                              type="text" 
                              value={nuevoEstudiante.doc_extranjero_apoderado || ''}
                              onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, doc_extranjero_apoderado: e.target.value})}
                              placeholder="N° de Pasaporte o DNI"
                              className="w-full border border-emerald-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white" 
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nombres <span className="text-red-500">*</span></label>
                      <input required type="text" value={nuevoEstudiante.nombres_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, nombres_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-emerald-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Ap. Paterno <span className="text-red-500">*</span></label>
                      <input required type="text" value={nuevoEstudiante.apellido_paterno_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, apellido_paterno_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-emerald-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Ap. Materno <span className="text-red-500">*</span></label>
                      <input required type="text" value={nuevoEstudiante.apellido_materno_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, apellido_materno_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-emerald-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono <span className="text-red-500">*</span></label>
                      <input required type="text" placeholder="+569..." value={nuevoEstudiante.telefono_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, telefono_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-emerald-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Correo Electrónico <span className="text-red-500">*</span></label>
                      <input required type="email" value={nuevoEstudiante.correo_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, correo_apoderado: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-emerald-500 outline-none text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Domicilio Apoderado <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      <input required type="text" value={nuevoEstudiante.domicilio_apoderado} onChange={(e) => setNuevoEstudiante({...nuevoEstudiante, domicilio_apoderado: e.target.value})} className="flex-1 border border-gray-300 rounded-lg p-2 focus:ring-emerald-500 outline-none text-sm" />
                      <button type="button" onClick={() => setNuevoEstudiante({...nuevoEstudiante, domicilio_apoderado: nuevoEstudiante.domicilio})} className="px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium rounded-lg border border-emerald-200 transition-colors">Copiar del estudiante</button>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                    <button type="button" onClick={() => setModalNuevoAbierto(false)} className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">Cancelar</button>
                    <button type="submit" disabled={creando} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50">
                      {creando ? 'Guardando...' : 'Crear Estudiante'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}