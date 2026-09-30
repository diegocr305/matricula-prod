// hooks/useNuevaMatricula.ts
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import { API_BASE_URL } from '../../../config/api';
import { coincideBusqueda } from '../../../utils/search';

export interface MatriculaBase {
  id_establecimiento: number;
  cod_tipo_ensenanza: number | null;
  tipo_ensenanza: string;
  nivel_ensenanza: string;
  curso: string;
  estudiante_rut: string;
  anio_escolar: number;
  estado?: string; 
}

export const useNuevaMatricula = () => {
  const navigate = useNavigate();
  const location = useLocation(); 
  
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  // Control de barrera de actualización
  const [fichaConfirmada, setFichaConfirmada] = useState(false);
  const [estadoActualizacion, setEstadoActualizacion] = useState<'vigente' | 'vencida' | 'incompleta'>('vencida');
  const [mensajeAntiguedad, setMensajeAntiguedad] = useState('');
  const [fechaUltimaActualizacion, setFechaUltimaActualizacion] = useState<string | null>(null);

  // Control del Wizard
  const [pasoActual, setPasoActual] = useState(1);
  const irSiguientePaso = () => {
    if (pasoActual === 1 && (!estudiante || !fichaConfirmada)) {
      alert("Es obligatorio actualizar y confirmar los antecedentes del estudiante y su apoderado antes de continuar.");
      return;
    }
    setPasoActual(prev => prev + 1);
  };
  const irPasoAnterior = () => setPasoActual(prev => prev - 1);

  const [rutBusqueda, setRutBusqueda] = useState('');
  const [estudiante, setEstudiante] = useState<any>(null);
  const [estudianteCompleto, setEstudianteCompleto] = useState<any>(null);
  const [estudiantesDb, setEstudiantesDb] = useState<any[]>([]);
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  
  // Control de Búsqueda Separada (Local Colegio vs Global Toda la Red)
  const [busquedaGlobal, setBusquedaGlobal] = useState(false);
  const [buscandoSugerencias, setBuscandoSugerencias] = useState(false);
  const [buscandoDirecto, setBuscandoDirecto] = useState(false);
  const debounceBusquedaRef = React.useRef<any>(null);

  const [huboPrecarga, setHuboPrecarga] = useState(false);
  const [cursoPrevio, setCursoPrevio] = useState(''); 
  const [codigoPrevio, setCodigoPrevio] = useState<number | null>(null); 
  const [alertasTransicion, setAlertasTransicion] = useState<{texto: string, tipo: 'info' | 'alerta' | 'peligro'}[]>([]);
  const [datosFaltantes, setDatosFaltantes] = useState<string[]>([]);
  const [modalFaltantes, setModalFaltantes] = useState(false);
  const { colegioSeleccionado } = useOutletContext<any>() || { colegioSeleccionado: '' };

  const usuarioString = localStorage.getItem('usuario');
  const usuario = usuarioString ? JSON.parse(usuarioString) : null;
  const rolUsuario = usuario?.rol?.toLowerCase() || '';
  const esPerfilColegio = Boolean(usuario?.id_establecimiento) || rolUsuario.includes('colegio') || rolUsuario.includes('director');

  const [matriculaExitosa, setMatriculaExitosa] = useState(false); 

  // Control de salida accidental
  const [modalSalidaAbierto, setModalSalidaAbierto] = useState(false);
  const [rutaDestinoPendiente, setRutaDestinoPendiente] = useState<string | null>(null);

  const tieneProgreso = useMemo(() => {
    return (estudiante !== null || pasoActual > 1) && !matriculaExitosa;
  }, [estudiante, pasoActual, matriculaExitosa]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (tieneProgreso) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [tieneProgreso]);

  useEffect(() => {
    const interceptarNavegacion = (e: MouseEvent) => {
      if (!tieneProgreso) return;

      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#') && href !== location.pathname && !target.target) {
        e.preventDefault();
        e.stopPropagation();
        setRutaDestinoPendiente(href);
        setModalSalidaAbierto(true);
      }
    };

    document.addEventListener('click', interceptarNavegacion, true);
    return () => document.removeEventListener('click', interceptarNavegacion, true);
  }, [tieneProgreso, location.pathname]);

  const confirmarSalida = () => {
    setModalSalidaAbierto(false);
    if (rutaDestinoPendiente) {
      navigate(rutaDestinoPendiente);
    }
  };

  const cancelarSalida = () => {
    setModalSalidaAbierto(false);
    setRutaDestinoPendiente(null);
  };

  const [formFaltantes, setFormFaltantes] = useState({
    domicilio_estudiante: '',
    rut_apoderado: '',
    nombres_apoderado: '',
    apellido_paterno_apoderado: '',
    apellido_materno_apoderado: '',
    domicilio_apoderado: '',
    telefono_apoderado: '',
    correo_apoderado: '',
    relacion_apoderado: 'Madre',
    modificar_suplente: true,
    tiene_suplente: false,
    rut_suplente: '',
    nombres_suplente: '',
    apellido_paterno_suplente: '',
    apellido_materno_suplente: '',
    domicilio_suplente: '',
    telefono_suplente: '',
    correo_suplente: '',
    relacion_suplente: 'Suplente'
  });

  const handleFaltantesChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormFaltantes(prev => ({
      ...prev,
      [name]: val
    }));
  };

  const [colegioProcedencia, setColegioProcedencia] = useState('');
  const [esTraslado, setEsTraslado] = useState(false);
  const [guardandoFaltantes, setGuardandoFaltantes] = useState(false);
  
  const [establecimientosDb, setEstablecimientosDb] = useState<any[]>([]);
  const [todasLasMatriculas, setTodasLasMatriculas] = useState<MatriculaBase[]>([]);

  const [archivoResolucion, setArchivoResolucion] = useState<File | null>(null);
  
  const [formulario, setFormulario] = useState({
    id_establecimiento: '',
    numero_correlativo: '',
    anio_escolar: '2026',
    fecha_matricula: new Date().toISOString().split('T')[0],
    nivel_ensenanza: 'Educación Básica',
    cod_tipo_ensenanza: '',
    cursoSeleccionado: '',
    cod_grado: 1,
    letra_curso: 'A',
    es_excedente: false,
    es_alumno_practica: false,
    res_tipo: '',
    res_causa: '',
    res_numero: '',
    res_anio: new Date().getFullYear().toString(),
    res_tribunal: '',
    fecha_resolucion_excedente: '',
    metodo_firma: 'Digital'
  });

  const [checkCertNotas, setCheckCertNotas] = useState(false);
  const [checkCertRetiro, setCheckCertRetiro] = useState(false);
  const [idEstablecimientoPrevio, setIdEstablecimientoPrevio] = useState<string | null>(null);

  const [limiteCupos, setLimiteCupos] = useState<number>(45);

  const formatearNivelExcel = (cursoStr: string) => {
    const texto = (cursoStr || '').toUpperCase();
    const numero = texto.match(/\d+/)?.[0] || "";
    
    if (texto.includes('MEDIO') || texto.includes('MEDIA')) return `${numero}MEDIO`;
    if (texto.includes('BÁSICO') || texto.includes('BASICO')) return `${numero}BASICO`;
    if (texto.includes('KINDER') || texto.includes('KÍNDER')) {
      return texto.includes('PRE') ? 'PREKINDER' : 'KINDER';
    }
    return texto.replace(/[^A-Z0-9]/g, ''); 
  };

  useEffect(() => {
    const obtenerCapacidadDinamica = async () => {
      if (!formulario.id_establecimiento || !formulario.cursoSeleccionado) {
        setLimiteCupos(45);
        return;
      }

      const colegio = establecimientosDb.find(e => String(e.id_establecimiento) === String(formulario.id_establecimiento));
      if (!colegio) return;

      const nivelExcel = formatearNivelExcel(formulario.cursoSeleccionado);
      const token = localStorage.getItem('token');

      try {
        const res = await fetch(`${API_BASE_URL}/establecimientos/capacidad-sala?rbd=${colegio.rbd}&anio_escolar=${formulario.anio_escolar}&nivel=${nivelExcel}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setLimiteCupos(data.capacidad_maxima);
        } else {
          setLimiteCupos(45); 
        }
      } catch (e) {
        setLimiteCupos(45);
      }
    };

    obtenerCapacidadDinamica();
  }, [formulario.id_establecimiento, formulario.anio_escolar, formulario.cursoSeleccionado, establecimientosDb]);

  const [cuposOcupados, setCuposOcupados] = useState<number>(0);

  useEffect(() => {
    const consultarCuposOcupados = async () => {
      if (!formulario.id_establecimiento || !formulario.cursoSeleccionado) {
        setCuposOcupados(0);
        return;
      }

      const token = localStorage.getItem('token');
      try {
        const params = new URLSearchParams({
          establecimiento_id: String(formulario.id_establecimiento),
          anio: String(formulario.anio_escolar),
          curso: formulario.cursoSeleccionado,
          page_size: '1'
        });
        const res = await fetch(`${API_BASE_URL}/matriculas?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCuposOcupados(Number(data.total) || 0);
        } else {
          setCuposOcupados(0);
        }
      } catch (e) {
        setCuposOcupados(0);
      }
    };

    consultarCuposOcupados();
  }, [formulario.id_establecimiento, formulario.anio_escolar, formulario.cursoSeleccionado]);

  useEffect(() => {
    if (cuposOcupados >= limiteCupos) {
      setFormulario(prev => ({ ...prev, es_excedente: true }));
    } else {
      setFormulario(prev => ({ ...prev, es_excedente: false }));
    }
  }, [cuposOcupados, limiteCupos]);

  useEffect(() => {
    if (esPerfilColegio && usuario?.id_establecimiento) {
      setFormulario(prev => ({ ...prev, id_establecimiento: String(usuario.id_establecimiento) }));
    } else if (colegioSeleccionado) {
      setFormulario(prev => ({ ...prev, id_establecimiento: String(colegioSeleccionado) }));
    }
  }, [colegioSeleccionado, esPerfilColegio, usuario?.id_establecimiento]);

  const idEstablecimientoActual = useMemo(() => {
    return formulario.id_establecimiento || usuario?.id_establecimiento || colegioSeleccionado || null;
  }, [formulario.id_establecimiento, usuario?.id_establecimiento, colegioSeleccionado]);

  // Indica si llegamos con rutPreseleccionado desde el wizard y aún estamos buscando al alumno
  const [cargandoPreseleccion, setCargandoPreseleccion] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };

    // Activar indicador de carga si venimos con RUT preseleccionado
    if (location.state?.rutPreseleccionado) {
      setCargandoPreseleccion(true);
    }

    fetch(`${API_BASE_URL}/establecimientos`, { headers })
      .then(res => res.json())
      .then(data => {
        setEstablecimientosDb(data);
        if (data.length > 0 && !formulario.id_establecimiento) {
          const colegioFiltro = data.find((est: any) => String(est.id_establecimiento) === String(colegioSeleccionado));
          if (colegioFiltro) {
            setFormulario(prev => ({ ...prev, id_establecimiento: String(colegioFiltro.id_establecimiento) }));
          } else {
            setFormulario(prev => ({ ...prev, id_establecimiento: String(data[0].id_establecimiento) }));
          }
        }
      })
      .catch(err => console.error("Error establecimientos:", err));

    fetch(`${API_BASE_URL}/matriculas`, { headers })
      .then(res => res.json())
      .then(data => {
        const lista = Array.isArray(data) ? data : (data?.items || []);
        setTodasLasMatriculas(lista);
      })
      .catch(err => {
        console.error("Error matrículas:", err);
        setTodasLasMatriculas([]);
      });

    const rutPre = location.state?.rutPreseleccionado;
    if (rutPre) {
      setCargandoPreseleccion(true);
      fetch(`${API_BASE_URL}/estudiante/${encodeURIComponent(rutPre)}`, { headers })
        .then(res => {
          if (!res.ok) throw new Error("Estudiante preseleccionado no encontrado");
          return res.json();
        })
        .then(datos => {
          procesarEstudiante(datos, rutPre);
          setRutBusqueda(datos.personal?.run || rutPre);
          setCargandoPreseleccion(false);
        })
        .catch(err => {
          console.error("Error preseleccionando estudiante:", err);
          setCargandoPreseleccion(false);
        });
    }
  }, [location.state]);

  // Carga de catálogo oficial de planes y cursos del establecimiento seleccionado
  const [opcionesColegio, setOpcionesColegio] = useState<{
    planes: { codigo: number; descripcion: string }[];
    cursos: string[];
    cursos_por_plan: Record<string, string[]>;
  }>({ planes: [], cursos: [], cursos_por_plan: {} });

  useEffect(() => {
    if (!formulario.id_establecimiento) return;
    const token = localStorage.getItem('token');
    fetch(`${API_BASE_URL}/matriculas/opciones-filtro?establecimiento_id=${formulario.id_establecimiento}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setOpcionesColegio({
            planes: data.planes || [],
            cursos: data.cursos || [],
            cursos_por_plan: data.cursos_por_plan || {}
          });
        }
      })
      .catch(e => console.error("Error al cargar opciones de establecimiento:", e));
  }, [formulario.id_establecimiento]);

  useEffect(() => {
    return () => {
      if (debounceBusquedaRef.current) {
        clearTimeout(debounceBusquedaRef.current);
      }
    };
  }, []);

  const determinarNivelInteligente = (cursoStr: string, codigoPlan: number) => {
    const texto = (cursoStr || '').toLowerCase();
    if (texto.includes('básico') || texto.includes('basico')) return 'Educación Básica';
    if (texto.includes('medio') || texto.includes('media')) return 'Educación Media';
    if (texto.includes('parvularia') || texto.includes('kínder') || texto.includes('kinder') || texto.includes('pre-kínder') || texto.includes('sala cuna')) return 'Educación Parvularia';
    if (codigoPlan === 10) return 'Educación Parvularia';
    if (codigoPlan >= 110 && codigoPlan <= 119) return 'Educación Básica';
    if (codigoPlan >= 300) return 'Educación Media';
    return 'Educación Básica'; 
  };

  const codigosDisponibles = useMemo(() => {
    if (opcionesColegio.planes && opcionesColegio.planes.length > 0) {
      return opcionesColegio.planes.map(p => ({
        codigo: p.codigo,
        nombre: p.descripcion && p.descripcion !== 'Importado desde SIGE' && p.descripcion !== 'Sin descripción'
          ? p.descripcion
          : `Plan de Estudio (Cod. ${p.codigo})`
      }));
    }
    if (!formulario.id_establecimiento || !Array.isArray(todasLasMatriculas)) return [];
    const idEst = Number(formulario.id_establecimiento);
    const filtradas = todasLasMatriculas.filter(m => Number(m.id_establecimiento) === idEst);
    const mapaCodigos = new Map();
    filtradas.forEach(m => {
      if (m.cod_tipo_ensenanza !== null && m.cod_tipo_ensenanza !== undefined) {
        mapaCodigos.set(Number(m.cod_tipo_ensenanza), m.tipo_ensenanza || 'Plan de Estudio');
      }
    });
    return Array.from(mapaCodigos.entries()).map(([codigo, nombre]) => ({ codigo, nombre }));
  }, [opcionesColegio.planes, formulario.id_establecimiento, todasLasMatriculas]);

  const cursosDisponibles = useMemo(() => {
    const codStr = String(formulario.cod_tipo_ensenanza || '');
    if (codStr && opcionesColegio.cursos_por_plan && opcionesColegio.cursos_por_plan[codStr] && opcionesColegio.cursos_por_plan[codStr].length > 0) {
      return opcionesColegio.cursos_por_plan[codStr];
    }
    if (opcionesColegio.cursos && opcionesColegio.cursos.length > 0) {
      return opcionesColegio.cursos;
    }
    if (!formulario.id_establecimiento || !formulario.cod_tipo_ensenanza || !Array.isArray(todasLasMatriculas)) return [];
    const idEst = Number(formulario.id_establecimiento);
    const codEns = Number(formulario.cod_tipo_ensenanza);
    const filtradas = todasLasMatriculas.filter(
      m => Number(m.id_establecimiento) === idEst && Number(m.cod_tipo_ensenanza) === codEns
    );
    const cursosSet = new Set<string>();
    filtradas.forEach(m => {
      if (m.curso) cursosSet.add(m.curso);
    });
    return Array.from(cursosSet).sort();
  }, [opcionesColegio, formulario.id_establecimiento, formulario.cod_tipo_ensenanza, todasLasMatriculas]);

  useEffect(() => {
    if (codigosDisponibles.length > 0) {
      const existe = codigosDisponibles.find(c => String(c.codigo) === formulario.cod_tipo_ensenanza);
      if (!existe) {
        setFormulario(prev => ({ ...prev, cod_tipo_ensenanza: String(codigosDisponibles[0].codigo), cursoSeleccionado: '' }));
      }
    }
  }, [formulario.id_establecimiento, codigosDisponibles]);

  useEffect(() => {
    if (cursosDisponibles.length > 0) {
      if (!cursosDisponibles.includes(formulario.cursoSeleccionado)) {
        seleccionarCurso(cursosDisponibles[0]);
      } else {
        seleccionarCurso(formulario.cursoSeleccionado);
      }
    }
  }, [formulario.cod_tipo_ensenanza, cursosDisponibles]);

  const seleccionarCurso = (cursoStr: string) => {
    const matchNumero = cursoStr.match(/\d+/);
    const gradoNum = matchNumero ? parseInt(matchNumero[0], 10) : 1;
    const partes = cursoStr.trim().split(' ');
    const letraEncontrada = partes.length > 0 ? partes[partes.length - 1] : 'A';
    const letraFinal = letraEncontrada.length <= 2 ? letraEncontrada.replace(/[^A-Z]/gi, '') || 'A' : 'A';
    const codigoActual = Number(formulario.cod_tipo_ensenanza) || 110;
    const nivelCalculado = determinarNivelInteligente(cursoStr, codigoActual);

    setFormulario(prev => ({
      ...prev,
      cursoSeleccionado: cursoStr,
      nivel_ensenanza: nivelCalculado,
      cod_grado: gradoNum,
      letra_curso: letraFinal
    }));
  };

  const normalizarTexto = (str: any) => {
    if (!str) return '';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  };

  const limpiarRUT = (str: any) => {
    if (!str) return '';
    return String(str).replace(/[^0-9kK]/g, '').toLowerCase();
  };

  const handleEscribirBuscador = (texto: string, forzarGlobal?: boolean) => {
    setRutBusqueda(texto);

    if (!texto || texto.trim().length < 2) {
      setSugerencias([]);
      setMostrarSugerencias(false);
      setBuscandoSugerencias(false);
      if (debounceBusquedaRef.current) clearTimeout(debounceBusquedaRef.current);
      return;
    }

    setMostrarSugerencias(true);
    setBuscandoSugerencias(true);

    if (debounceBusquedaRef.current) {
      clearTimeout(debounceBusquedaRef.current);
    }

    const esGlobal = forzarGlobal !== undefined ? forzarGlobal : busquedaGlobal;

    debounceBusquedaRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token');
        let url = `${API_BASE_URL}/estudiante/buscar?q=${encodeURIComponent(texto.trim())}`;
        if (esGlobal) {
          url += `&buscar_global=true`;
        } else if (idEstablecimientoActual) {
          url += `&establecimiento_id=${idEstablecimientoActual}`;
        }

        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSugerencias(Array.isArray(data) ? data : []);
        } else {
          setSugerencias([]);
        }
      } catch (err) {
        console.error("Error buscando sugerencias:", err);
        setSugerencias([]);
      } finally {
        setBuscandoSugerencias(false);
      }
    }, 200);
  };

  const toggleBusquedaGlobal = (activo: boolean) => {
    setBusquedaGlobal(activo);
    if (rutBusqueda.trim().length >= 2 && !estudiante) {
      handleEscribirBuscador(rutBusqueda, activo);
    }
  };

  const buscarEstudianteDirecto = async (rutManual?: string, forzarGlobal?: boolean) => {
    const query = (rutManual !== undefined ? rutManual : rutBusqueda).trim();
    if (!query) return;

    if (debounceBusquedaRef.current) clearTimeout(debounceBusquedaRef.current);
    setBuscandoDirecto(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      // 1. Intentar obtener directamente ficha del estudiante por RUT/identificador
      const respuesta = await fetch(`${API_BASE_URL}/estudiante/${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (respuesta.ok) {
        const datos = await respuesta.json();
        await procesarEstudiante(datos, query);
        setRutBusqueda(datos.personal?.run || query);
        setMostrarSugerencias(false);
        setError('');
        return;
      }

      // 2. Si no es un RUT directo o falló, buscar coincidencias mediante el buscador
      const esGlobal = forzarGlobal !== undefined ? forzarGlobal : busquedaGlobal;
      let url = `${API_BASE_URL}/estudiante/buscar?q=${encodeURIComponent(query)}`;
      if (esGlobal) {
        url += `&buscar_global=true`;
      } else if (idEstablecimientoActual) {
        url += `&establecimiento_id=${idEstablecimientoActual}`;
      }

      const resBuscar = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resBuscar.ok) {
        const coincidencias = await resBuscar.json();
        if (Array.isArray(coincidencias) && coincidencias.length === 1) {
          await seleccionarEstudiante(coincidencias[0]);
          return;
        } else if (Array.isArray(coincidencias) && coincidencias.length > 1) {
          setSugerencias(coincidencias);
          setMostrarSugerencias(true);
          setError('');
          return;
        }
      }

      if (!esGlobal) {
        setError(`No se encontró el estudiante en este establecimiento. Active la opción '¿Alumno de otro establecimiento?' para buscar en toda la base de datos.`);
      } else {
        setError(`No se encontró ningún estudiante con '${query}'. Verifique el RUT o registre al estudiante si es nuevo.`);
      }
    } catch (err: any) {
      console.error("Error en búsqueda directa:", err);
      setError(err.message || "Error al buscar estudiante en el servidor.");
    } finally {
      setBuscandoDirecto(false);
    }
  };

  const procesarEstudiante = async (datos: any, estRun: string) => {
    const personal = datos.personal || datos || {};
    const apoderado = datos.apoderado || {};

    const rawFechaAct = personal.fecha_actualizacion || datos.fecha_actualizacion || null;
    setFechaUltimaActualizacion(rawFechaAct);

    setEstudiante({
      id: personal.id || personal.id_estudiante,
      nombres: personal.nombres || '',
      apellidos: personal.apellidos || `${personal.apellido_paterno || ''} ${personal.apellido_materno || ''}`.trim(),
      run: personal.run || personal.run_ipe || estRun,
      domicilio: personal.domicilio || '',
      fecha_actualizacion: rawFechaAct
    });
    setEstudianteCompleto(datos);

    // Precargar formFaltantes
    let nombresApVal = apoderado.nombres || apoderado.nombre || '';
    let patApVal = apoderado.apellido_paterno || '';
    let matApVal = apoderado.apellido_materno || '';

    if (nombresApVal && !patApVal && nombresApVal !== 'Pendiente') {
      const partes = nombresApVal.trim().split(' ');
      if (partes.length >= 3) {
        nombresApVal = partes.slice(0, -2).join(' ');
        patApVal = partes[partes.length - 2];
        matApVal = partes[partes.length - 1];
      } else if (partes.length === 2) {
        nombresApVal = partes[0];
        patApVal = partes[1];
      }
    }

    const domEst = personal.domicilio && personal.domicilio !== 'Sin registrar' && personal.domicilio !== 'Sin registro' ? personal.domicilio : '';
    const rutAp = apoderado.rut || apoderado.rut_pasaporte || '';
    const telAp = apoderado.telefono && apoderado.telefono !== '-' ? apoderado.telefono : '';
    const corAp = apoderado.correo || apoderado.correo_electronico || '';
    const domAp = apoderado.domicilio && apoderado.domicilio !== 'Sin registrar' && apoderado.domicilio !== 'Sin registro' ? apoderado.domicilio : '';
    const relAp = apoderado.relacion || apoderado.relacion_estudiante || 'Madre';

    // Desglosar suplente si existe
    let nomSup = datos.apoderado_suplente?.nombres || '';
    let patSup = datos.apoderado_suplente?.apellido_paterno || '';
    let matSup = datos.apoderado_suplente?.apellido_materno || '';
    if (!nomSup && datos.apoderado_suplente?.nombre) {
      const parts = datos.apoderado_suplente.nombre.trim().split(' ');
      if (parts.length >= 3) {
        nomSup = parts.slice(0, -2).join(' ');
        patSup = parts[parts.length - 2];
        matSup = parts[parts.length - 1];
      } else if (parts.length === 2) {
        nomSup = parts[0];
        patSup = parts[1];
      } else {
        nomSup = parts[0];
      }
    }

    const tieneSup = Boolean(datos.apoderado_suplente && (datos.apoderado_suplente.rut || datos.apoderado_suplente.rut_pasaporte));
    const rutSup = datos.apoderado_suplente?.rut || datos.apoderado_suplente?.rut_pasaporte || '';
    const telSup = datos.apoderado_suplente?.telefono && datos.apoderado_suplente.telefono !== '-' ? datos.apoderado_suplente.telefono : '';
    const corSup = datos.apoderado_suplente?.correo && datos.apoderado_suplente.correo !== '-' ? datos.apoderado_suplente.correo : '';
    const domSup = datos.apoderado_suplente?.domicilio || '';
    const relSup = datos.apoderado_suplente?.relacion || datos.apoderado_suplente?.relacion_estudiante || 'Suplente';

    setFormFaltantes({
      domicilio_estudiante: domEst,
      rut_apoderado: rutAp !== 'Sin registrar' ? rutAp : '',
      nombres_apoderado: nombresApVal !== 'Pendiente' ? nombresApVal : '',
      apellido_paterno_apoderado: patApVal,
      apellido_materno_apoderado: matApVal,
      domicilio_apoderado: domAp,
      telefono_apoderado: telAp,
      correo_apoderado: corAp !== '-' ? corAp : '',
      relacion_apoderado: relAp,

      modificar_suplente: true,
      tiene_suplente: tieneSup,
      rut_suplente: rutSup,
      nombres_suplente: nomSup,
      apellido_paterno_suplente: patSup,
      apellido_materno_suplente: matSup,
      domicilio_suplente: domSup,
      telefono_suplente: telSup,
      correo_suplente: corSup,
      relacion_suplente: relSup
    });

    const faltan: string[] = [];
    if (!domEst) faltan.push("Domicilio del Estudiante");
    if (!rutAp || rutAp === "Sin registrar") faltan.push("RUT del Apoderado");
    if (!nombresApVal || nombresApVal === "Pendiente") faltan.push("Nombres del Apoderado");
    if (!patApVal) faltan.push("Apellido Paterno del Apoderado");
    if (!telAp) faltan.push("Teléfono del Apoderado");
    if (!corAp || corAp === "-") faltan.push("Correo del Apoderado");
    if (!domAp) faltan.push("Domicilio del Apoderado");
    if (!relAp) faltan.push("Parentesco del Apoderado");

    setDatosFaltantes(faltan);

    // EVALUACIÓN DE ANTIGÜEDAD (1 AÑO)
    if (faltan.length > 0) {
      setEstadoActualizacion('incompleta');
      setFichaConfirmada(false);
      setMensajeAntiguedad(`Faltan ${faltan.length} dato(s) obligatorio(s) en la ficha.`);
    } else if (!rawFechaAct) {
      setEstadoActualizacion('vencida');
      setFichaConfirmada(false);
      setMensajeAntiguedad("La información nunca ha sido actualizada desde su registro inicial.");
    } else {
      const fechaAct = new Date(rawFechaAct);
      const hoy = new Date();
      const diffMs = hoy.getTime() - fechaAct.getTime();
      const diasTranscurridos = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diasTranscurridos > 365) {
        // MÁS DE 1 AÑO -> OBLIGATORIO ACTUALIZAR
        setEstadoActualizacion('vencida');
        setFichaConfirmada(false);
        setMensajeAntiguedad(`Información desactualizada (última actualización hace ${diasTranscurridos} días, superando el límite de 1 año).`);
      } else {
        // MENOS DE 1 AÑO Y COMPLETA -> VIGENTE (PASA DIRECTO)
        setEstadoActualizacion('vigente');
        setFichaConfirmada(true);
        setMensajeAntiguedad(`Información vigente (actualizada hace ${diasTranscurridos} días).`);
      }
    }

    try {
      const token = localStorage.getItem('token');
      const resProcedencia = await fetch(`${API_BASE_URL}/matriculas/procedencia/${estRun}`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resProcedencia.ok) {
          const procedencia = await resProcedencia.json();
          if (procedencia.encontrado) {
              setIdEstablecimientoPrevio(String(procedencia.id_establecimiento_previo)); 
              setColegioProcedencia(`${procedencia.colegio_procedencia} (RBD: ${procedencia.rbd_procedencia})`);
              setEsTraslado(String(procedencia.id_establecimiento_previo) !== String(formulario.id_establecimiento));
          } else {
              setIdEstablecimientoPrevio(null); 
              setColegioProcedencia('Estudiante Nuevo (Sin registros previos)');
              setEsTraslado(false);
          }
      }
    } catch (e) {
        console.error("Error buscando procedencia", e);
    }
  }; 

  useEffect(() => {
    if (!estudiante) return;

    const rutEst = estudiante.run || estudiante.run_ipe;
    let ultimaMatricula: any = null;

    if (estudianteCompleto?.historial && estudianteCompleto.historial.length > 0) {
      const hist = [...estudianteCompleto.historial].sort((a: any, b: any) => (Number(b.anio) || 0) - (Number(a.anio) || 0));
      ultimaMatricula = hist[0];
    } else if (Array.isArray(todasLasMatriculas) && todasLasMatriculas.length > 0) {
      const historicas = todasLasMatriculas.filter(m => m.estudiante_rut === rutEst);
      if (historicas.length > 0) {
        historicas.sort((a, b) => b.anio_escolar - a.anio_escolar);
        ultimaMatricula = historicas[0];
      }
    }

    if (ultimaMatricula) {
      setCursoPrevio(ultimaMatricula.curso || '');
      setCodigoPrevio(ultimaMatricula.cod_tipo_ensenanza ? Number(ultimaMatricula.cod_tipo_ensenanza) : null);

      if (!huboPrecarga && ultimaMatricula.curso) {
        setFormulario(prev => ({
          ...prev,
          cod_tipo_ensenanza: ultimaMatricula.cod_tipo_ensenanza ? String(ultimaMatricula.cod_tipo_ensenanza) : prev.cod_tipo_ensenanza,
          cursoSeleccionado: ultimaMatricula.curso
        }));
        setHuboPrecarga(true);
      }
    } else {
      setCursoPrevio('');
      setCodigoPrevio(null);
      setHuboPrecarga(false);
    }
  }, [estudiante, estudianteCompleto, todasLasMatriculas, huboPrecarga]);

  const seleccionarEstudiante = async (est: any) => {
    const rutVal = est.run || est.run_ipe || est.rut;
    setRutBusqueda(rutVal || '');
    setMostrarSugerencias(false);
    setCargando(true);
    setError('');
    setHuboPrecarga(false);
    setFichaConfirmada(false);
    
    try {
      const token = localStorage.getItem('token');
      const respuesta = await fetch(`${API_BASE_URL}/estudiante/${rutVal}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!respuesta.ok) throw new Error('Estudiante no encontrado en el sistema.');
      
      const datos = await respuesta.json();
      await procesarEstudiante(datos, rutVal);
    } catch (err: any) {
      setError(err.message);
      setEstudiante(null);
    } finally {
      setCargando(false);
    }
  };

  const guardarDatosFaltantes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estudiante) return;
    setGuardandoFaltantes(true);

    try {
      const token = localStorage.getItem('token');
      const rutVal = estudiante.run || estudiante.run_ipe;
      
      const respuesta = await fetch(`${API_BASE_URL}/estudiante/${rutVal}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(formFaltantes) 
      });

      if (!respuesta.ok) throw new Error('Error al guardar la información');
      
      const timestamp = new Date().getTime();
      const refreshRes = await fetch(`${API_BASE_URL}/estudiante/${rutVal}?t=${timestamp}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store' 
      });
      
      const datosNuevos = await refreshRes.json();
      await procesarEstudiante(datosNuevos, rutVal); 
      setFichaConfirmada(true);
      setEstadoActualizacion('vigente');
      setMensajeAntiguedad("Información recién actualizada y confirmada con éxito.");
      setModalFaltantes(false);
      
    } catch (err: any) {
      alert("Error al actualizar la ficha: " + err.message);
    } finally {
      setGuardandoFaltantes(false);
    }
  };

  const copiarDomicilio = () => {
    setFormFaltantes(prev => ({ ...prev, domicilio_apoderado: prev.domicilio_estudiante }));
  };

  const colegioSeleccionadoObj = establecimientosDb.find(e => String(e.id_establecimiento) === String(formulario.id_establecimiento));
  const esColegioEMTP = colegioSeleccionadoObj && ['1518', '1519', '1525'].includes(String(colegioSeleccionadoObj.rbd));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

    setFormulario((prev) => ({
      ...prev,
      [name]: val,
    }));
  };

  const generarComprobantePDF = async () => {
    try {
      const token = localStorage.getItem('token');
      const rutVal = estudiante?.run || estudiante?.run_ipe;
      const respuesta = await fetch(`${API_BASE_URL}/documentos/comprobante/${rutVal}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!respuesta.ok) throw new Error('Error al generar el documento en el servidor');

      const blob = await respuesta.blob();
      const url = window.URL.createObjectURL(blob);
      
      const linkDescarga = document.createElement('a');
      linkDescarga.href = url;
      linkDescarga.download = `Documentos_Matricula_${rutVal}.pdf`;
      document.body.appendChild(linkDescarga);
      linkDescarga.click();
      
      linkDescarga.remove();
      window.URL.revokeObjectURL(url);
      
    } catch (err: any) {
      alert("Hubo un error al descargar los documentos: " + err.message);
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estudiante || !fichaConfirmada) return;

    setCargando(true);
    setError('');

    let stringResolucion = null;
    if (formulario.es_excedente) {
      stringResolucion = `[${formulario.res_tipo.toUpperCase()}] Causa: ${formulario.res_causa}, N° ${formulario.res_numero}/${formulario.res_anio} - Tribunal: ${formulario.res_tribunal}`;
    }

    const payload = {
      numero_correlativo: 0,
      anio_escolar: parseInt(formulario.anio_escolar),
      id_estudiante: estudiante.id,
      id_establecimiento: parseInt(formulario.id_establecimiento),
      fecha_matricula: formulario.fecha_matricula,
      nivel_ensenanza: formulario.nivel_ensenanza,
      curso: formulario.cursoSeleccionado,
      estado: formulario.metodo_firma === 'Digital' ? 'Pendiente Firma' : 'Activa',
      fecha_retiro: null,
      motivo_retiro: null,
      observaciones: 'Matrícula ingresada desde portal transaccional.',
      id_usuario_ejecutor: 1,
      cod_tipo_ensenanza: formulario.cod_tipo_ensenanza ? parseInt(formulario.cod_tipo_ensenanza) : null,
      cod_grado: formulario.cod_grado,
      letra_curso: formulario.letra_curso,
      es_excedente: formulario.es_excedente,
      numero_resolucion_excedente: stringResolucion,
      fecha_resolucion_excedente: formulario.fecha_resolucion_excedente || null,
      es_alumno_practica: formulario.es_alumno_practica,
      metodo_firma: formulario.metodo_firma,
      opcion_religion: 'Pendiente',
      acepta_compromiso: false,
      autoriza_entrevista: false,
      autoriza_imagen: false
    };

    const token = localStorage.getItem('token');

    try {
      const respuesta = await fetch(`${API_BASE_URL}/matriculas`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });

      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.detail || 'Error al guardar la matrícula.');
      
      // Si es estudiante excedente y adjuntó archivo de resolución, subirlo al almacenamiento
      if (formulario.es_excedente && archivoResolucion && datos.id_matricula) {
        try {
          const formArchivo = new FormData();
          formArchivo.append('archivo', archivoResolucion);
          await fetch(`${API_BASE_URL}/matriculas/${datos.id_matricula}/documento-resolucion`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formArchivo
          });
        } catch (uploadErr) {
          console.warn("Advertencia al subir archivo de resolución:", uploadErr);
        }
      }

      setMatriculaExitosa(true);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!estudiante || !cursoPrevio || !formulario.cursoSeleccionado) {
      setAlertasTransicion([]);
      return;
    }

    const alertas: {texto: string, tipo: 'info' | 'alerta' | 'peligro'}[] = [];

    if (codigoPrevio && formulario.cod_tipo_ensenanza && String(codigoPrevio) !== String(formulario.cod_tipo_ensenanza)) {
      alertas.push({texto: `Cambio de Plan de Estudio (de Cod. ${codigoPrevio} a Cod. ${formulario.cod_tipo_ensenanza}).`, tipo: 'alerta'});
    }

    const numPrevioMatch = cursoPrevio.match(/\d+/);
    const numDestinoMatch = formulario.cursoSeleccionado.match(/\d+/);

    // Calcula un "grado absoluto" continuo para toda la trayectoria escolar chilena,
    // de modo que 8° básico (8) -> 1° medio (9) sea una promocion de +1 y no un
    // falso retroceso/repitencia. En Media el numero se reinicia (1°..4°), por eso
    // NO basta comparar el numero suelto: hay que sumar el offset de basica.
    // Es media si el texto dice "medio/media" o el cod_tipo de ensenanza es >= 300.
    const OFFSET_MEDIA = 8; // 8 grados de basica antes de 1° medio
    const esMedia = (curso: string, codTipo: number | string | null | undefined) => {
      const t = (curso || '').toLowerCase();
      if (t.includes('medio') || t.includes('media')) return true;
      const cod = Number(codTipo);
      return Number.isFinite(cod) && cod >= 300;
    };
    const gradoAbsoluto = (numMatch: RegExpMatchArray, curso: string, codTipo: number | string | null | undefined) => {
      const n = parseInt(numMatch[0]);
      return esMedia(curso, codTipo) ? OFFSET_MEDIA + n : n;
    };

    if (numPrevioMatch && numDestinoMatch) {
      const numPrevio = parseInt(numPrevioMatch[0]);
      const numDestino = parseInt(numDestinoMatch[0]);
      const gradoPrevio = gradoAbsoluto(numPrevioMatch, cursoPrevio, codigoPrevio);
      const gradoDestino = gradoAbsoluto(numDestinoMatch, formulario.cursoSeleccionado, formulario.cod_tipo_ensenanza);

      if (gradoDestino === gradoPrevio + 1) {
        alertas.push({texto: `Promoción: El estudiante avanza al curso siguiente (de ${cursoPrevio} a ${formulario.cursoSeleccionado}).`, tipo: 'info'});
      } else if (gradoDestino === gradoPrevio) {
        alertas.push({texto: `Repitencia: El estudiante mantiene el mismo nivel cursado (${numPrevio}).`, tipo: 'alerta'});
      } else if (gradoDestino < gradoPrevio) {
        alertas.push({texto: `Retroceso abrupto: Está matriculando al estudiante en un grado INFERIOR al que ya cursó (de ${cursoPrevio} a ${formulario.cursoSeleccionado}).`, tipo: 'peligro'});
      } else if (gradoDestino > gradoPrevio + 1) {
        alertas.push({texto: `Salto abrupto: Está adelantando al estudiante múltiples grados (de ${cursoPrevio} a ${formulario.cursoSeleccionado}).`, tipo: 'peligro'});
      }
    } else {
      const basePrevio = cursoPrevio.replace(/\s*[A-Z]\s*$/i, '').trim().toLowerCase();
      const baseDestino = formulario.cursoSeleccionado.replace(/\s*[A-Z]\s*$/i, '').trim().toLowerCase();
      
      if (basePrevio === baseDestino) {
        alertas.push({texto: `Repitencia: El estudiante se mantiene en el nivel '${cursoPrevio}'.`, tipo: 'alerta'});
      } else {
        alertas.push({texto: `Transición de nivel preescolar: de '${cursoPrevio}' a '${formulario.cursoSeleccionado}'.`, tipo: 'info'});
      }
    }

    setAlertasTransicion(alertas);
  }, [formulario.cursoSeleccionado, formulario.cod_tipo_ensenanza, cursoPrevio, codigoPrevio, estudiante]);

  return {
    navigate, cargando, error, rutBusqueda, setRutBusqueda, estudiante, setEstudiante,
    sugerencias, mostrarSugerencias, setMostrarSugerencias, huboPrecarga, setHuboPrecarga,
    alertasTransicion, setAlertasTransicion, datosFaltantes, setDatosFaltantes,
    modalFaltantes, setModalFaltantes, esPerfilColegio, matriculaExitosa, setMatriculaExitosa,
    formFaltantes, setFormFaltantes, handleFaltantesChange, colegioProcedencia, esTraslado, guardandoFaltantes,
    establecimientosDb, formulario, checkCertNotas, setCheckCertNotas, checkCertRetiro, setCheckCertRetiro,
    idEstablecimientoPrevio, codigosDisponibles, cursosDisponibles, 
    archivoResolucion, setArchivoResolucion, 
    pasoActual, irSiguientePaso, irPasoAnterior,
    seleccionarCurso, handleEscribirBuscador, seleccionarEstudiante, guardarDatosFaltantes, copiarDomicilio, handleChange, generarComprobantePDF, handleSubmit, setCursoPrevio, setCodigoPrevio, setIdEstablecimientoPrevio,
    esColegioEMTP, cuposOcupados, limiteCupos, estudianteCompleto,
    modalSalidaAbierto, confirmarSalida, cancelarSalida,
    // Estados de antigüedad y barrera
    fichaConfirmada, setFichaConfirmada, estadoActualizacion, mensajeAntiguedad, fechaUltimaActualizacion,
    cargandoPreseleccion,
    // Búsqueda ágil y directa (Separación Local vs Global)
    busquedaGlobal, setBusquedaGlobal, toggleBusquedaGlobal,
    buscarEstudianteDirecto, buscandoSugerencias, buscandoDirecto
  };
};