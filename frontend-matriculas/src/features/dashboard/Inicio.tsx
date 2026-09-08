import React, { useState, useMemo } from 'react';
import { Users, UserMinus, GraduationCap, ChevronDown, ChevronUp, BarChart3, ChevronRight } from 'lucide-react';
import { useInicio2 } from './hooks/useInicio2';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function Inicio() {
  const {
    estadisticas,
    cargando,
    error,
    anioSeleccionado,
    setAnioSeleccionado
  } = useInicio2();

  // Controladores de estado para el acordeón anidado y el gráfico
  const [tipoExpandido, setTipoExpandido] = useState<string | null>(null);
  const [nivelExpandido, setNivelExpandido] = useState<string | null>(null);
  const [graficoActivo, setGraficoActivo] = useState<string>('activos');

  // ============================================================================
  // LÓGICA DE CATEGORIZACIÓN (CORREGIDA PARA PÁRVULOS)
  // ============================================================================
  const categorizarNivel = (nombre: string) => {
    const textoNormalizado = nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // 1. Prioridad Absoluta: Párvulos (Atrapa "Medio Mayor/Menor" antes de que caigan a Educación Media)
    if (
      textoNormalizado.includes('parvulo') || 
      textoNormalizado.includes('transicion') || 
      textoNormalizado.includes('kinder') || 
      textoNormalizado.includes('sala cuna') ||
      textoNormalizado.includes('medio mayor') ||
      textoNormalizado.includes('medio menor') ||
      textoNormalizado.includes('heterogeneo')
    ) {
      return 'Educación Parvularia';
    }
    
    // 2. Básica
    if (textoNormalizado.includes('basico') || textoNormalizado.includes('basica')) {
      return 'Educación Básica';
    }
    
    // 3. Media (Solo caerán aquí los 1°, 2°, 3° y 4° Medio)
    if (textoNormalizado.includes('medio') || textoNormalizado.includes('media')) {
      return 'Educación Media';
    }
    
    // 4. Adultos
    if (textoNormalizado.includes('adulto')) {
      return 'Educación de Adultos';
    }
    
    return 'Otra Enseñanza';
  };

  // ============================================================================
  // ÁRBOL ACADÉMICO: TIPO ENSEÑANZA -> NIVEL -> CURSO
  // ============================================================================
  const arbolAcademico = useMemo(() => {
    if (!estadisticas?.por_curso || !Array.isArray(estadisticas.por_curso)) return [];
    
    const categorias: Record<string, { tipo: string, total: number, niveles: Record<string, { display: string, total: number, cursos: any[] }> }> = {};
    
    estadisticas.por_curso.forEach((curso: any) => {
      const nombreSeguro = String(curso?.nombre || "");
      if (!nombreSeguro) return;

      // 1. Separar el Nivel Base de la letra (Ej: "1er nivel de Transición (Pre-kinder) A" -> "1er nivel de Transición (Pre-kinder)")
      const match = nombreSeguro.match(/^(.*?)\s+([A-Za-z])$/);
      const displayNivel = match ? match[1].trim() : nombreSeguro.trim(); 
      
      // 2. Determinar la Categoría Principal
      const tipoCategoria = categorizarNivel(displayNivel);

      // 3. Crear las ramas del árbol si no existen
      if (!categorias[tipoCategoria]) {
        categorias[tipoCategoria] = { tipo: tipoCategoria, total: 0, niveles: {} };
      }
      
      // 🌟 SOLUCIÓN A LA DUPLICIDAD: Llave de agrupación a prueba de errores humanos
      const keyNivel = displayNivel
        .toLowerCase() // Todo a minúscula
        .normalize("NFD") 
        .replace(/[\u0300-\u036f]/g, "") // Quita tildes (básico -> basico)
        .replace(/[º°]/g, "°")           // Unifica símbolos de grado (º y °)
        .replace(/\s+/g, "")             // Borra TODOS los espacios
        .trim();

      if (!categorias[tipoCategoria].niveles[keyNivel]) {
        // Formateamos el título para que se vea ordenado y elegante en la pantalla
        let nombreBonito = displayNivel.replace(/[º]/g, "°"); 
        nombreBonito = nombreBonito.charAt(0).toUpperCase() + nombreBonito.slice(1);

        categorias[tipoCategoria].niveles[keyNivel] = { display: nombreBonito, total: 0, cursos: [] };
      }
      
      // 4. Sumar los totales en cascada y guardar el curso
      const cantidad = Number(curso?.cantidad || 0);
      categorias[tipoCategoria].total += cantidad;
      categorias[tipoCategoria].niveles[keyNivel].total += cantidad;
      categorias[tipoCategoria].niveles[keyNivel].cursos.push(curso);
    });
    
    // Convertir a Arreglo
    return Object.values(categorias).map(cat => ({
      ...cat,
      niveles: Object.values(cat.niveles)
    }));
  }, [estadisticas]);

  // Manejadores de clics
  const toggleTipo = (tipo: string) => {
    if (tipoExpandido === tipo) {
      setTipoExpandido(null);
      setNivelExpandido(null);
      setGraficoActivo('activos');
    } else {
      setTipoExpandido(tipo);
      setNivelExpandido(null);
      setGraficoActivo(tipo); 
    }
  };

  const toggleNivel = (nivelDisplay: string, tipoParent: string) => {
    if (nivelExpandido === nivelDisplay) {
      setNivelExpandido(null);
      setGraficoActivo(tipoParent); 
    } else {
      setNivelExpandido(nivelDisplay);
      setGraficoActivo(nivelDisplay); 
    }
  };

  // ============================================================================
  // DATOS DEL GRÁFICO LATERAL (100% REALES DESDE LA BD)
  // ============================================================================
  const datosGrafico = useMemo(() => {
    if (!estadisticas?.historico || !Array.isArray(estadisticas.historico)) return [];

    return estadisticas.historico.map((hist: any) => {
      let valorParaGrafico = 0;

      if (graficoActivo === 'activos') {
        valorParaGrafico = hist.activos || 0;
      } else if (graficoActivo === 'retiros') {
        valorParaGrafico = hist.retiros || 0;
      } else {
        const esCategoria = arbolAcademico.find(cat => cat.tipo === graficoActivo);
        
        if (esCategoria) {
          // Sumar todos los cursos de ese año que pertenezcan a esa categoría (Ej: Toda la Parvularia)
          let sumaCategoria = 0;
          Object.keys(hist.cursos || {}).forEach(nombreCurso => {
            if (categorizarNivel(nombreCurso) === graficoActivo) {
              sumaCategoria += hist.cursos[nombreCurso];
            }
          });
          valorParaGrafico = sumaCategoria;
        } else {
          // Nivel Específico (Ej: "1er nivel de Transición (Pre-kinder)")
          const llaveEncontrada = Object.keys(hist.cursos || {}).find(
            k => k.toLowerCase() === graficoActivo.toLowerCase()
          );
          valorParaGrafico = llaveEncontrada ? hist.cursos[llaveEncontrada] : 0;
        }
      }

      return {
        anio: String(hist.anio),
        cantidad: valorParaGrafico
      };
    }); 
  }, [estadisticas, graficoActivo, arbolAcademico]);

  // Configuración de visuales dinámicas del gráfico
  let tituloGrafico = "";
  let colorCabecera = "";
  const esVistaCategoria = arbolAcademico.some(c => c.tipo === graficoActivo);

  if (graficoActivo === 'activos') {
    tituloGrafico = "Estudiantes Activos (General)";
    colorCabecera = "bg-blue-950";
  } else if (graficoActivo === 'retiros') {
    tituloGrafico = "Retiros Oficiales (General)";
    colorCabecera = "bg-red-700";
  } else if (esVistaCategoria) {
    tituloGrafico = `Análisis: ${graficoActivo}`;
    colorCabecera = "bg-indigo-900"; 
  } else {
    tituloGrafico = `Ocupación: ${graficoActivo}`;
    colorCabecera = "bg-emerald-700"; 
  }

  return (
    <div className="space-y-6">
      
      {/* --- CABECERA --- */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-blue-950">Panel de Control General</h2>
          <p className="text-sm text-gray-500 font-medium">Indicadores y estadísticas de matrícula oficial</p>
        </div>
        
        <div className="bg-white px-4 py-2 rounded-md border border-gray-300 shadow-sm flex items-center gap-3">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Año Escolar:
          </label>
          <select 
            value={anioSeleccionado || ''} 
            onChange={(e) => setAnioSeleccionado(e.target.value)}
            className="border-none bg-transparent font-extrabold text-blue-900 focus:ring-0 cursor-pointer outline-none text-sm"
          >
            <option value="">Histórico (Todos)</option>
            {estadisticas?.anios_disponibles?.map((anio: number) => (
              <option key={anio} value={anio}>{anio}</option>
            ))}
          </select>
        </div>
      </div>

      {cargando ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-900 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-500 font-medium text-sm">Consultando indicadores oficiales...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 rounded-xl border border-red-200 p-8 text-center shadow-sm">
          <p className="text-red-700 font-bold text-lg mb-1">Error de Sistema</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      ) : (
        <>
          {/* --- TARJETAS SUPERIORES --- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div 
              onClick={(e) => { e.preventDefault(); setGraficoActivo('activos'); setTipoExpandido(null); setNivelExpandido(null); }}
              className={`bg-white p-6 rounded-r-lg shadow-sm border transition-all cursor-pointer flex items-center gap-5 group relative ${graficoActivo === 'activos' ? 'border-blue-900 ring-2 ring-blue-100 bg-blue-50/30' : 'border-gray-200 border-l-4 border-l-blue-900 hover:bg-blue-50'}`}
            >
              <div className={`p-3 rounded-md transition-transform ${graficoActivo === 'activos' ? 'bg-blue-900 text-white shadow-md scale-110' : 'bg-blue-100 text-blue-900 group-hover:scale-110'}`}>
                <Users size={24} />
              </div>
              <div>
                <p className={`text-[11px] font-bold uppercase tracking-wider ${graficoActivo === 'activos' ? 'text-blue-900' : 'text-gray-500'}`}>Total Activos</p>
                <p className="text-3xl font-black text-blue-950">{estadisticas?.total_activos || 0}</p>
              </div>
              <div className="ml-auto text-blue-300">
                 <BarChart3 size={24} className={graficoActivo === 'activos' ? 'text-blue-900' : 'opacity-50'} />
              </div>
            </div>

            <div 
              onClick={(e) => { e.preventDefault(); setGraficoActivo('retiros'); setTipoExpandido(null); setNivelExpandido(null); }}
              className={`bg-white p-6 rounded-r-lg shadow-sm border transition-all cursor-pointer flex items-center gap-5 group relative ${graficoActivo === 'retiros' ? 'border-red-600 ring-2 ring-red-100 bg-red-50/30' : 'border-gray-200 border-l-4 border-l-red-600 hover:bg-red-50'}`}
            >
              <div className={`p-3 rounded-md transition-transform ${graficoActivo === 'retiros' ? 'bg-red-600 text-white shadow-md scale-110' : 'bg-red-100 text-red-600 group-hover:scale-110'}`}>
                <UserMinus size={24} />
              </div>
              <div>
                <p className={`text-[11px] font-bold uppercase tracking-wider ${graficoActivo === 'retiros' ? 'text-red-700' : 'text-gray-500'}`}>Retiros Oficiales</p>
                <p className="text-3xl font-black text-gray-800">{estadisticas?.total_inactivos || 0}</p>
              </div>
              <div className="ml-auto text-red-300">
                 <BarChart3 size={24} className={graficoActivo === 'retiros' ? 'text-red-600' : 'opacity-50'} />
              </div>
            </div>
          </div>

          {/* --- ÁREA PRINCIPAL: ACORDEÓN ANIDADO (IZQ) Y GRÁFICO (DER) --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            
            {/* 1. ACORDEÓN DE TIPO DE ENSEÑANZA Y CURSOS */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-5 border-b border-gray-200 pb-3">
                <GraduationCap className="text-blue-900" size={24} />
                <h3 className="text-lg font-extrabold text-gray-800 uppercase tracking-wide">Estructura Académica</h3>
              </div>
              
              <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                {arbolAcademico.map((categoria: any, indexCat: number) => {
                  const estaCategoriaExpandida = tipoExpandido === categoria.tipo;

                  return (
                    <div key={indexCat} className="border border-gray-200 rounded-lg overflow-hidden transition-all shadow-sm">
                      {/* NIVEL 1: TIPO DE ENSEÑANZA */}
                      <button 
                        type="button"
                        onClick={() => toggleTipo(categoria.tipo)}
                        className={`w-full flex justify-between items-center p-3 sm:p-4 transition-colors ${estaCategoriaExpandida ? 'bg-indigo-900 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-800'}`}
                      >
                        <span className="font-extrabold text-sm sm:text-base text-left tracking-wide">{categoria.tipo}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`font-black px-3 py-1 rounded-full text-xs shadow-sm ${estaCategoriaExpandida ? 'bg-white text-indigo-900' : 'bg-indigo-100 text-indigo-900'}`}>
                            {categoria.total}
                          </span>
                          {estaCategoriaExpandida ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                      </button>

                      {/* NIVEL 2: GRADOS/NIVELES */}
                      {estaCategoriaExpandida && (
                        <div className="bg-indigo-50/30 p-2 sm:p-4 animate-in slide-in-from-top-2 space-y-2">
                          {categoria.niveles.map((nivel: any, indexNiv: number) => {
                            const esteNivelExpandido = nivelExpandido === nivel.display;

                            return (
                              <div key={indexNiv} className="border border-emerald-100 rounded-lg bg-white overflow-hidden shadow-sm">
                                <button 
                                  type="button"
                                  onClick={() => toggleNivel(nivel.display, categoria.tipo)}
                                  className={`w-full flex justify-between items-center p-3 transition-colors ${esteNivelExpandido ? 'bg-emerald-700 text-white' : 'hover:bg-emerald-50 text-gray-700'}`}
                                >
                                  <div className="flex items-center gap-2">
                                    {!esteNivelExpandido && <ChevronRight size={16} className="text-emerald-600" />}
                                    <span className="font-bold text-sm text-left">{nivel.display}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`font-bold px-2.5 py-0.5 rounded text-xs ${esteNivelExpandido ? 'bg-white text-emerald-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                      {nivel.total}
                                    </span>
                                  </div>
                                </button>

                                {/* NIVEL 3: SALAS/CURSOS ESPECÍFICOS */}
                                {esteNivelExpandido && (
                                  <div className="p-3 bg-emerald-50/50 border-t border-emerald-100">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {nivel.cursos.map((curso: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center bg-white border border-emerald-200 px-3 py-2 rounded-md">
                                          <span className="text-emerald-900 text-xs font-bold truncate pr-2" title={curso.nombre}>
                                            {curso.nombre}
                                          </span>
                                          <span className="font-black text-gray-600 text-xs">
                                            {curso.cantidad}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {arbolAcademico.length === 0 && (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p className="text-sm text-gray-500 font-medium">No hay registros académicos para este periodo.</p>
                  </div>
                )}
              </div>
            </div>

            {/* 2. GRÁFICO COMPARATIVO INLINE */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full min-h-[400px]">
              <div className={`p-5 border-b rounded-t-xl text-white transition-colors duration-300 ${colorCabecera}`}>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <BarChart3 size={20} />
                  Comparativa Anual: {tituloGrafico}
                </h3>
              </div>

              <div className="p-6 flex-1 flex flex-col justify-center min-h-[300px]">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={datosGrafico} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="anio" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontWeight: 600, fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                      {datosGrafico.map((entry, index) => {
                        const anioActualView = anioSeleccionado || String(new Date().getFullYear());
                        const esSeleccionado = entry.anio === String(anioActualView);
                        
                        let color = '#D1D5DB'; 
                        if (graficoActivo === 'activos') {
                          color = esSeleccionado ? '#1E3A8A' : '#93C5FD'; 
                        } else if (graficoActivo === 'retiros') {
                          color = esSeleccionado ? '#DC2626' : '#FCA5A5'; 
                        } else if (arbolAcademico.some(c => c.tipo === graficoActivo)) {
                          color = esSeleccionado ? '#312E81' : '#A5B4FC'; 
                        } else {
                          color = esSeleccionado ? '#047857' : '#6EE7B7'; 
                        }

                        return <Cell key={`cell-${index}`} fill={color} className="transition-all duration-300" />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              <div className="px-6 py-4 bg-gray-50 rounded-b-xl border-t border-gray-100 text-xs text-gray-500 text-center">
                Visualizando línea de tiempo real extraída de los registros históricos del sistema SIGE.
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}