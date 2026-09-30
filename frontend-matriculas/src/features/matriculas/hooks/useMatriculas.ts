import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { API_BASE_URL } from '../../../config/api';
import { validarListaArchivos } from '../../../utils/fileValidation';

export interface Matricula {
  id_matricula: number;
  numero_correlativo: number;
  estudiante_nombre: string;
  estudiante_rut: string;
  apoderado_nombre: string;
  apoderado_rut: string;
  nivel_ensenanza: string;
  curso: string;
  fecha_matricula: string;
  estado: string;
  anio_escolar: number;
  tipo_ensenanza: string;
  rbd: string;
  cod_tipo_ensenanza: number | null; 
  es_excedente?: boolean;
  numero_resolucion_excedente?: string | null;
  fecha_resolucion_excedente?: string | null;
  ruta_documento_resolucion?: string | null;
  motivo_cambio_curso?: string | null;
  estado_renovacion?: string | null;
}

export interface PaginatedResponse {
  items: Matricula[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export const useMatriculas = () => {
  const { colegioSeleccionado } = useOutletContext<{ colegioSeleccionado: string }>();

  // --- LÓGICA DE ROLES ---
  const usuarioString = localStorage.getItem('usuario');
  const usuario = usuarioString ? JSON.parse(usuarioString) : null;
  const puedeEditar = !['Visualizador_SLEP', 'Visualizador_Colegio'].includes(usuario?.rol);
  const esAdminOSlep = ['admin_slep', 'slep', 'admin'].includes(String(usuario?.rol || '').toLowerCase());
  const puedeCargarSIGE = esAdminOSlep && puedeEditar;

  const [motivoCambio, setMotivoCambio] = useState('');

  // --- ESTADO DE PAGINACIÓN Y DATOS ---
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 50;

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // --- FILTROS (se envían al servidor) ---
  const [busqueda, setBusqueda] = useState('');
  const anioActual = new Date().getFullYear();
  const [filtroAnio, setFiltroAnio] = useState(String(anioActual));
  const anioInicializadoRef = useRef(false);
  const colegioPrevioRef = useRef<string | null>(null);

  // Reiniciar indicador cuando cambia el establecimiento seleccionado
  useEffect(() => {
    if (colegioSeleccionado !== colegioPrevioRef.current) {
      colegioPrevioRef.current = colegioSeleccionado;
      anioInicializadoRef.current = false;
    }
  }, [colegioSeleccionado]);

  const [filtroCodigo, setFiltroCodigo] = useState('');
  const [filtroCurso, setFiltroCurso] = useState('');
  const [ordenFolio, setOrdenFolio] = useState<'asc' | 'desc' | null>('asc');
  const [ordenEstado, setOrdenEstado] = useState<'asc' | 'desc' | null>(null);

  // Debounce ref para búsqueda
  const busquedaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busquedaDebounced, setBusquedaDebounced] = useState('');

  useEffect(() => {
    if (busquedaDebounceRef.current) clearTimeout(busquedaDebounceRef.current);
    busquedaDebounceRef.current = setTimeout(() => {
      setBusquedaDebounced(busqueda);
      setPage(1); // Reset a página 1 al buscar
    }, 400);
    return () => {
      if (busquedaDebounceRef.current) clearTimeout(busquedaDebounceRef.current);
    };
  }, [busqueda]);

  // Reset página cuando cambian filtros
  useEffect(() => { setPage(1); }, [filtroAnio, filtroCodigo, filtroCurso, colegioSeleccionado]);
  useEffect(() => { setFiltroCurso(''); }, [filtroCodigo]);

  // --- CARGA PRINCIPAL CON PAGINACIÓN ---
  const cargarMatriculas = useCallback(() => {
    if (!colegioSeleccionado) {
      setMatriculas([]);
      setTotal(0);
      setTotalPages(1);
      setCargando(false);
      return;
    }

    setCargando(true);
    const token = localStorage.getItem('token');

    const params = new URLSearchParams();
    params.set('establecimiento_id', colegioSeleccionado);
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    if (filtroAnio) params.set('anio', filtroAnio);
    if (filtroCodigo) params.set('codigo', filtroCodigo);
    if (filtroCurso) params.set('curso', filtroCurso);
    if (busquedaDebounced) params.set('busqueda', busquedaDebounced);

    const url = `${API_BASE_URL}/matriculas?${params.toString()}`;

    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error('Error al conectar con la API');
        return res.json();
      })
      .then((datos: PaginatedResponse) => {
        setMatriculas(datos.items);
        setTotal(datos.total);
        setTotalPages(datos.total_pages);
        setCargando(false);
      })
      .catch((err) => {
        setError(err.message);
        setCargando(false);
      });
  }, [colegioSeleccionado, page, filtroAnio, filtroCodigo, filtroCurso, busquedaDebounced]);

  useEffect(() => {
    cargarMatriculas();
  }, [cargarMatriculas]);

  // --- DATOS DEL AÑO ACTUAL (para cupos/estructura colegio) ---
  // Carga separada: solo matrículas activas del año actual para calcular cupos
  const [matriculasAnioActual, setMatriculasAnioActual] = useState<Matricula[]>([]);

  const cargarMatriculasAnioActual = useCallback(() => {
    if (!colegioSeleccionado) {
      setMatriculasAnioActual([]);
      return;
    }
    const token = localStorage.getItem('token');
    const params = new URLSearchParams();
    params.set('establecimiento_id', colegioSeleccionado);
    params.set('anio', String(anioActual));
    params.set('page', '1');
    params.set('page_size', '2000');

    fetch(`${API_BASE_URL}/matriculas?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then((datos: PaginatedResponse) => setMatriculasAnioActual(datos.items))
      .catch(() => setMatriculasAnioActual([]));
  }, [colegioSeleccionado, anioActual]);

  useEffect(() => {
    cargarMatriculasAnioActual();
  }, [cargarMatriculasAnioActual]);

  // --- OPCIONES DE FILTRO DESDE EL SERVIDOR (Años, Planes de Estudio, Cursos) ---
  const [opcionesFiltro, setOpcionesFiltro] = useState<{
    anios: number[];
    cursos: string[];
    planes: { codigo: number; descripcion: string }[];
    cursos_por_plan: Record<string, string[]>;
  }>({
    anios: [],
    cursos: [],
    planes: [],
    cursos_por_plan: {},
  });

  const cargarOpcionesFiltro = useCallback(() => {
    if (!colegioSeleccionado) {
      setOpcionesFiltro({ anios: [], cursos: [], planes: [], cursos_por_plan: {} });
      return;
    }
    const token = localStorage.getItem('token');
    const url = `${API_BASE_URL}/matriculas/opciones-filtro?establecimiento_id=${colegioSeleccionado}`;

    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then((data) => {
        // Normalizar: garantizar que los campos usados con .map sean siempre arrays,
        // aunque el backend devuelva null/objeto/campo ausente.
        const normalizado = {
          anios: Array.isArray(data?.anios) ? data.anios : [],
          cursos: Array.isArray(data?.cursos) ? data.cursos : [],
          planes: Array.isArray(data?.planes) ? data.planes : [],
          cursos_por_plan: (data?.cursos_por_plan && typeof data.cursos_por_plan === 'object')
            ? data.cursos_por_plan
            : {},
        };
        setOpcionesFiltro(normalizado);
        if (normalizado.anios.length > 0) {
          const ultimoAnioRegistrado = String(normalizado.anios[0]);
          if (!anioInicializadoRef.current) {
            setFiltroAnio(ultimoAnioRegistrado);
            anioInicializadoRef.current = true;
          }
        }
      })
      .catch((err) => {
        console.error("Error al cargar opciones de filtro:", err);
      });
  }, [colegioSeleccionado]);

  useEffect(() => {
    cargarOpcionesFiltro();
  }, [cargarOpcionesFiltro]);

  // Lista completa de todos los años disponibles para el colegio seleccionado
  const aniosUnicos = useMemo(() => {
    if (Array.isArray(opcionesFiltro.anios) && opcionesFiltro.anios.length > 0) {
      return opcionesFiltro.anios;
    }
    const base = Array.isArray(matriculas) ? matriculas : [];
    const anios = base.map(m => m.anio_escolar).filter(Boolean);
    return Array.from(new Set(anios)).sort((a, b) => b - a);
  }, [opcionesFiltro.anios, matriculas]);

  // Códigos de planes de estudio disponibles para el colegio
  const codigosUnicos = useMemo(() => {
    if (Array.isArray(opcionesFiltro.planes) && opcionesFiltro.planes.length > 0) {
      return opcionesFiltro.planes.map(p => p.codigo);
    }
    const base = Array.isArray(matriculas) ? matriculas : [];
    const codigos = base.map(m => m.cod_tipo_ensenanza).filter(cod => cod !== null);
    return Array.from(new Set(codigos)).sort();
  }, [opcionesFiltro.planes, matriculas]);

  // Cursos disponibles (filtrados por plan si se seleccionó uno)
  const cursosUnicos = useMemo(() => {
    if (filtroCodigo && Array.isArray(opcionesFiltro.cursos_por_plan?.[filtroCodigo])) {
      return opcionesFiltro.cursos_por_plan[filtroCodigo];
    }
    if (Array.isArray(opcionesFiltro.cursos) && opcionesFiltro.cursos.length > 0) {
      return opcionesFiltro.cursos;
    }
    const base = Array.isArray(matriculas) ? matriculas : [];
    const cursos = base.map(m => m.curso).filter(Boolean);
    return Array.from(new Set(cursos)).sort();
  }, [opcionesFiltro, filtroCodigo, matriculas]);

  // --- ESTRUCTURA COLEGIO (para modal cambio de curso) ---
  const estructuraColegio = useMemo(() => {
    const estructura: Record<string, { nombrePlan: string, cursos: Set<string> }> = {};
    if (opcionesFiltro.planes && opcionesFiltro.planes.length > 0) {
      opcionesFiltro.planes.forEach(p => {
        const codStr = String(p.codigo);
        const cursosList = opcionesFiltro.cursos_por_plan?.[codStr] || [];
        estructura[codStr] = {
          nombrePlan: p.descripcion,
          cursos: new Set(cursosList)
        };
      });
      return estructura;
    }
    matriculasAnioActual.forEach(mat => {
      if (mat.estado === 'Activa' && mat.cod_tipo_ensenanza) {
        const codStr = mat.cod_tipo_ensenanza.toString();
        if (!estructura[codStr]) {
          estructura[codStr] = { nombrePlan: mat.tipo_ensenanza, cursos: new Set() };
        }
        if (mat.curso) {
          estructura[codStr].cursos.add(mat.curso);
        }
      }
    });
    return estructura;
  }, [opcionesFiltro, matriculasAnioActual]);

  // --- CUPOS POR CURSO (del año actual) ---
  const cuposPorCurso = useMemo(() => {
    const conteo: Record<string, number> = {};
    matriculasAnioActual.forEach(m => {
      if (m.estado === 'Activa' && m.curso) {
        conteo[m.curso] = (conteo[m.curso] || 0) + 1;
      }
    });
    return conteo;
  }, [matriculasAnioActual]);

  // --- MATRICULADOS EN CURSO DESTINO ---
  const [modalCursoAbierto, setModalCursoAbierto] = useState(false);
  const [procesandoCurso, setProcesandoCurso] = useState(false);
  const [planDestino, setPlanDestino] = useState<string>('');
  const [cursoDestino, setCursoDestino] = useState<string>('');
  const [capacidadCursoDestino, setCapacidadCursoDestino] = useState<number>(45);
  const [cargandoCapacidadDestino, setCargandoCapacidadDestino] = useState<boolean>(false);

  const matriculadosCursoDestino = useMemo(() => {
    if (!cursoDestino) return 0;
    return matriculasAnioActual.filter(m =>
      m.curso === cursoDestino && m.estado === 'Activa'
    ).length;
  }, [matriculasAnioActual, cursoDestino]);

  // --- ESTADO DE MODALES Y ACCIONES ---
  const [modalAbierto, setModalAbierto] = useState(false);
  const [idSeleccionado, setIdSeleccionado] = useState<number | null>(null);
  const [fechaRetiro, setFechaRetiro] = useState('');
  const [procesandoRetiro, setProcesandoRetiro] = useState(false);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);

  const [enviarDirectorRetiro, setEnviarDirectorRetiro] = useState(false);
  const [correoDirectorRetiro, setCorreoDirectorRetiro] = useState('');
  const [enviarApoderadoRetiro, setEnviarApoderadoRetiro] = useState(true); 
  const [correoApoderadoRetiro, setCorreoApoderadoRetiro] = useState('');
  const [descargarLocalRetiro, setDescargarLocalRetiro] = useState(false);

  const [enviarDirectorCurso, setEnviarDirectorCurso] = useState(false);
  const [correoDirectorCurso, setCorreoDirectorCurso] = useState('');
  const [enviarApoderadoCurso, setEnviarApoderadoCurso] = useState(true);
  const [correoApoderadoCurso, setCorreoApoderadoCurso] = useState('');
  const [descargarLocalCurso, setDescargarLocalCurso] = useState(false);
  const [descargandoExcel, setDescargandoExcel] = useState(false);

  const [cursoActual, setCursoActual] = useState('');
  const [advertenciaNivel, setAdvertenciaNivel] = useState<string | null>(null);
  const [codigoActual, setCodigoActual] = useState<number | null>(null);

  const [modalEmisionAbierto, setModalEmisionAbierto] = useState(false);
  const [datosEmision, setDatosEmision] = useState<{
    id: number;
    nombre: string;
    tipo: 'MATRICULA' | 'RETIRO' | 'CAMBIO_CURSO';
  } | null>(null);

  // --- HELPERS ---
  const formatearNivelExcel = (cursoStr: string) => {
    if (!cursoStr) return "";
    const texto = cursoStr.toUpperCase();
    const numero = texto.match(/\d+/)?.[0] || "";
    if (texto.includes('MEDIO') || texto.includes('MEDIA')) return `${numero}MEDIO`;
    if (texto.includes('BÁSICO') || texto.includes('BASICO')) return `${numero}BASICO`;
    if (texto.includes('KINDER') || texto.includes('KÍNDER')) {
      return texto.includes('PRE') ? 'PREKINDER' : 'KINDER';
    }
    return texto.replace(/[^A-Z0-9]/g, '');
  };

  // --- CAPACIDAD DE SALA ---
  const [capacidadSala, setCapacidadSala] = useState<number>(45);

  useEffect(() => {
    const obtenerCapacidad = async () => {
      if (!colegioSeleccionado || !filtroAnio || !filtroCurso || matriculas.length === 0) {
        setCapacidadSala(45);
        return;
      }
      const rbdReal = matriculas[0].rbd;
      const nivelExcel = formatearNivelExcel(filtroCurso);
      const token = localStorage.getItem('token');
      try {
        const url = `${API_BASE_URL}/establecimientos/capacidad-sala?rbd=${rbdReal}&anio_escolar=${filtroAnio}&nivel=${nivelExcel}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setCapacidadSala(data.capacidad_maxima);
        } else {
          setCapacidadSala(45);
        }
      } catch (e) {
        setCapacidadSala(45);
      }
    };
    obtenerCapacidad();
  }, [colegioSeleccionado, filtroAnio, filtroCurso, matriculas]);

  useEffect(() => {
    const obtenerCapacidadDestino = async () => {
      if (!modalCursoAbierto || !cursoDestino || matriculasAnioActual.length === 0) {
        setCapacidadCursoDestino(45);
        return;
      }
      const rbdReal = matriculasAnioActual[0]?.rbd;
      if (!rbdReal) return;
      const nivelExcel = formatearNivelExcel(cursoDestino);
      const token = localStorage.getItem('token');
      setCargandoCapacidadDestino(true);
      try {
        const url = `${API_BASE_URL}/establecimientos/capacidad-sala?rbd=${rbdReal}&anio_escolar=${anioActual}&nivel=${nivelExcel}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setCapacidadCursoDestino(data.capacidad_maxima || 45);
        } else {
          setCapacidadCursoDestino(45);
        }
      } catch (e) {
        setCapacidadCursoDestino(45);
      } finally {
        setCargandoCapacidadDestino(false);
      }
    };
    obtenerCapacidadDestino();
  }, [modalCursoAbierto, cursoDestino, matriculasAnioActual, anioActual]);

  const cursoDestinoLleno = Boolean(cursoDestino && matriculadosCursoDestino >= capacidadCursoDestino);

  // --- CUPOS VISIBLES (página actual filtrada por curso) ---
  const mostrarCupos = filtroAnio !== '' && filtroCodigo !== '' && filtroCurso !== '';
  const cuposOcupados = useMemo(() => {
    if (!mostrarCupos) return 0;
    return matriculas.filter(m => m.estado === 'Activa').length;
  }, [matriculas, mostrarCupos]);

  // --- matriculasProcesadas: ordenar los resultados de la página actual ---
  const matriculasProcesadas = useMemo(() => {
    const resultado = [...matriculas];
    resultado.sort((a, b) => {
      if (ordenFolio) {
        if (a.curso !== b.curso) {
          return (a.curso || '').localeCompare(b.curso || '');
        }
        return ordenFolio === 'asc'
          ? a.numero_correlativo - b.numero_correlativo
          : b.numero_correlativo - a.numero_correlativo;
      }
      if (ordenEstado) {
        return ordenEstado === 'asc'
          ? a.estado.localeCompare(b.estado)
          : b.estado.localeCompare(a.estado);
      }
      return 0;
    });
    return resultado;
  }, [matriculas, ordenFolio, ordenEstado]);

  // --- CARGA MASIVA SIGE ---
  const manejarSubidaCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = e.target.files;
    if (!archivos || archivos.length === 0) return;

    // Validar límite máximo de 5 MB por archivo
    const validacion = validarListaArchivos(archivos);
    if (!validacion.valido) {
      alert(validacion.mensaje);
      e.target.value = '';
      return;
    }

    setSubiendoArchivo(true);
    const formData = new FormData();
    Array.from(archivos).forEach((archivo) => {
      formData.append("archivos", archivo);
    });

    const token = localStorage.getItem('token');

    try {
      const respuesta = await fetch(`${API_BASE_URL}/matriculas/carga-masiva`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.detail || "Error al subir los archivos");
      alert(datos.mensaje);
      cargarMatriculas();
      cargarMatriculasAnioActual();
      cargarOpcionesFiltro();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setSubiendoArchivo(false);
      e.target.value = '';
    }
  };

  // --- MODAL EMISIÓN ---
  const abrirModalEmision = (idMatricula: number, tipo: 'MATRICULA' | 'RETIRO' | 'CAMBIO_CURSO') => {
    const matricula = matriculas.find(m => m.id_matricula === idMatricula);
    if (matricula) {
      setDatosEmision({
        id: matricula.id_matricula,
        nombre: matricula.estudiante_nombre,
        tipo: tipo
      });
      setModalEmisionAbierto(true);
    }
  };

  // --- RETIRO ---
  const iniciarRetiro = (id: number) => {
    setIdSeleccionado(id);
    setFechaRetiro('');
    setModalAbierto(true);
  };

  const confirmarRetiro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idSeleccionado) return;

    const destinatarios: string[] = [];
    if (enviarDirectorRetiro && correoDirectorRetiro.trim()) destinatarios.push(correoDirectorRetiro.trim());
    if (enviarApoderadoRetiro && correoApoderadoRetiro.trim()) destinatarios.push(correoApoderadoRetiro.trim());

    if (destinatarios.length === 0) {
      alert('Por cumplimiento normativo, debe indicar al menos un correo de destino (Director o Apoderado) para enviar el comprobante de retiro.');
      return;
    }

    setProcesandoRetiro(true);
    const token = localStorage.getItem('token');

    try {
      const respuesta = await fetch(`${API_BASE_URL}/matriculas/${idSeleccionado}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          estado: 'Retirado',
          fecha_retiro: fechaRetiro,
          motivo_retiro: '',
          observaciones: '',
          id_usuario_ejecutor: 1,
          correo_destino: enviarApoderadoRetiro ? correoApoderadoRetiro.trim() : null
        }),
      });

      if (!respuesta.ok) throw new Error('Error al procesar la baja en el sistema');

      if (descargarLocalRetiro) {
        window.open(`${API_BASE_URL}/matriculas/${idSeleccionado}/certificado?tipo=RETIRO&token=${token || ''}`, '_blank');
      }

      setModalAbierto(false);
      cargarMatriculas();
      cargarMatriculasAnioActual();
      alert('Retiro procesado y comprobante enviado con éxito.');

    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setProcesandoRetiro(false);
    }
  };

  // --- CAMBIO DE CURSO ---
  const iniciarCambioCurso = (id: number, curso_actual: string, codigo_actual: number | null) => {
    setIdSeleccionado(id);
    setCursoActual(curso_actual);
    setCodigoActual(codigo_actual);
    setPlanDestino('');
    setCursoDestino('');
    setCapacidadCursoDestino(45);
    setMotivoCambio('');
    setAdvertenciaNivel(null);
    setModalCursoAbierto(true);
  };

  const confirmarCambioCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idSeleccionado || !planDestino || !cursoDestino) return;

    if (cursoDestinoLleno) {
      alert(`⚠️ NO ES POSIBLE EL TRASLADO:\n\nEl curso '${cursoDestino}' ha alcanzado su capacidad máxima permitida (${matriculadosCursoDestino}/${capacidadCursoDestino} cupos ocupados). Seleccione una sala con vacantes disponibles.`);
      return;
    }

    if (advertenciaNivel) {
      const seguro = window.confirm(`⚠️ ADVERTENCIA DE SEGURIDAD:\n\n${advertenciaNivel}\n\n¿Está completamente seguro de que desea confirmar este cambio de nivel?`);
      if (!seguro) return;
    }

    const destinatarios: string[] = [];
    if (enviarDirectorCurso && correoDirectorCurso.trim()) destinatarios.push(correoDirectorCurso.trim());
    if (enviarApoderadoCurso && correoApoderadoCurso.trim()) destinatarios.push(correoApoderadoCurso.trim());

    if (destinatarios.length === 0) {
      alert('Por cumplimiento normativo, debe indicar al menos un correo de destino para enviar el certificado de traslado.');
      return;
    }

    setProcesandoCurso(true);
    const token = localStorage.getItem('token');

    try {
      const respuesta = await fetch(`${API_BASE_URL}/matriculas/${idSeleccionado}/curso`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          cod_tipo_ensenanza: parseInt(planDestino),
          nuevo_curso: cursoDestino,
          motivo_cambio_curso: motivoCambio,
          correo_destino: enviarApoderadoCurso ? correoApoderadoCurso.trim() : null
        }),
      });

      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.detail || 'Error al cambiar de curso');

      if (descargarLocalCurso) {
        window.open(`${API_BASE_URL}/matriculas/${idSeleccionado}/certificado?tipo=CAMBIO_CURSO&token=${token || ''}`, '_blank');
      }

      setModalCursoAbierto(false);
      cargarMatriculas();
      cargarMatriculasAnioActual();
      alert('Traslado registrado y certificado enviado con éxito.');

    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setProcesandoCurso(false);
    }
  };

  // --- ADVERTENCIA DE NIVEL ---
  useEffect(() => {
    const advertencias: string[] = [];

    if (planDestino && codigoActual && planDestino !== codigoActual.toString()) {
      advertencias.push(`• Cambio de CÓDIGO DE ENSEÑANZA (de Cod. ${codigoActual} a Cod. ${planDestino}).`);
    }

    if (cursoDestino && cursoActual) {
      const numActualMatch = cursoActual.match(/\d+/);
      const numDestinoMatch = cursoDestino.match(/\d+/);

      if (numActualMatch && numDestinoMatch) {
        const numActual = parseInt(numActualMatch[0]);
        const numDestino = parseInt(numDestinoMatch[0]);

        if (numDestino < numActual) {
          advertencias.push(`• Está moviendo al alumno a un grado INFERIOR (de ${numActual} a ${numDestino}).`);
        } else if (numDestino > numActual + 1) {
          advertencias.push(`• Está saltando múltiples grados hacia ADELANTE (de ${numActual} a ${numDestino}).`);
        } else if (numDestino === numActual + 1) {
          advertencias.push(`• Está adelantando al alumno al grado SIGUIENTE (de ${numActual} a ${numDestino}). Normalmente los traslados a mitad de año son en el mismo grado.`);
        }
      } else {
        const baseActual = cursoActual.replace(/\s*[A-Z]\s*$/i, '').trim().toLowerCase();
        const baseDestino = cursoDestino.replace(/\s*[A-Z]\s*$/i, '').trim().toLowerCase();
        if (baseActual !== baseDestino) {
          advertencias.push(`• Está cambiando el nivel del curso de '${cursoActual}' a '${cursoDestino}'.`);
        }
      }
    }

    if (advertencias.length > 0) {
      setAdvertenciaNivel(advertencias.join('\n'));
    } else {
      setAdvertenciaNivel(null);
    }
  }, [cursoDestino, cursoActual, planDestino, codigoActual]);

  // --- EXPORTAR EXCEL ---
  const exportarAExcel = async () => {
    if (!colegioSeleccionado) return;
    setDescargandoExcel(true);

    try {
      const token = localStorage.getItem('token');
      let url = `${API_BASE_URL}/matriculas/exportar-excel?establecimiento_id=${colegioSeleccionado}`;
      if (filtroAnio) url += `&anio=${filtroAnio}`;
      if (filtroCodigo) url += `&codigo_plan=${filtroCodigo}`;
      if (filtroCurso) url += `&curso=${encodeURIComponent(filtroCurso)}`;

      const respuesta = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!respuesta.ok) throw new Error('Error al generar el archivo Excel.');

      const blob = await respuesta.blob();
      const urlBlob = window.URL.createObjectURL(blob);
      const linkDescarga = document.createElement('a');
      linkDescarga.href = urlBlob;
      linkDescarga.download = `Registro_Matriculas_${colegioSeleccionado}.xlsx`;
      document.body.appendChild(linkDescarga);
      linkDescarga.click();
      linkDescarga.remove();
      window.URL.revokeObjectURL(urlBlob);

    } catch (err: any) {
      alert("Hubo un error al descargar el Excel: " + err.message);
    } finally {
      setDescargandoExcel(false);
    }
  };

  const [modalExcelAbierto, setModalExcelAbierto] = useState(false);

  return {
    colegioSeleccionado, puedeEditar, puedeCargarSIGE, esAdminOSlep, anioActual,
    cargando, error, subiendoArchivo,
    busqueda, setBusqueda,
    filtroAnio, setFiltroAnio,
    filtroCodigo, setFiltroCodigo,
    filtroCurso, setFiltroCurso,
    ordenEstado, setOrdenEstado,
    modalCursoAbierto, setModalCursoAbierto,
    procesandoCurso,
    planDestino, setPlanDestino,
    cursoDestino, setCursoDestino,
    modalAbierto, setModalAbierto,
    fechaRetiro, setFechaRetiro,
    procesandoRetiro,
    enviarApoderadoRetiro, setEnviarApoderadoRetiro,
    correoApoderadoRetiro, setCorreoApoderadoRetiro,
    descargarLocalRetiro, setDescargarLocalRetiro,
    enviarApoderadoCurso, setEnviarApoderadoCurso,
    correoApoderadoCurso, setCorreoApoderadoCurso,
    descargarLocalCurso, setDescargarLocalCurso,
    advertenciaNivel,
    modalEmisionAbierto, setModalEmisionAbierto,
    datosEmision,
    aniosUnicos, codigosUnicos, cursosUnicos, estructuraColegio, matriculasProcesadas,
    manejarSubidaCSV, abrirModalEmision, iniciarRetiro, confirmarRetiro, iniciarCambioCurso, confirmarCambioCurso,
    mostrarCupos, cuposOcupados, descargandoExcel, exportarAExcel, capacidadSala,
    capacidadCursoDestino, cargandoCapacidadDestino, matriculadosCursoDestino, cursoDestinoLleno, cuposPorCurso,
    modalExcelAbierto, setModalExcelAbierto,
    // Paginación
    page, setPage, totalPages, total,
  };
};
