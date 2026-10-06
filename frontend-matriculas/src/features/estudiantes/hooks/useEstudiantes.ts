import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../../config/api';
import { coincideBusqueda } from '../../../utils/search';
import { useToast } from '../../../components/Toast';

export interface NuevoEstudianteForm {
  run: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  fecha_nacimiento: string;
  sexo: string;
  domicilio: string;
  latitud: string;
  longitud: string;
  pais_origen_estudiante?: string;
  doc_extranjero_estudiante?: string;

  run_apoderado: string;
  nombres_apoderado: string;
  apellido_paterno_apoderado: string;
  apellido_materno_apoderado: string;
  domicilio_apoderado: string;
  telefono_apoderado: string;
  correo_apoderado: string;
  relacion_estudiante: string;
  pais_origen_apoderado?: string;
  doc_extranjero_apoderado?: string;

  tiene_suplente: boolean;
  run_suplente: string;
  nombres_suplente: string;
  apellido_paterno_suplente: string;
  apellido_materno_suplente: string;
  domicilio_suplente: string;
  telefono_suplente: string;
  correo_suplente: string;
  relacion_suplente: string;

  sistema_salud: string;
  letra_fonasa: string;
  cesfam: string;
  centro_emergencia: string;
  diagnostico_medico: string;
  medico_tratante: string;
  medicamento: string;
  alergias: string;
  nee: string;
  nee_tipo: string;
}

export const formatearRUT = (rut: string) => {
  const actual = rut.replace(/^0+/, "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (actual.length <= 1) return actual;
  const cuerpo = actual.slice(0, -1);
  const dv = actual.slice(-1);
  return `${cuerpo}-${dv}`;
};

export const validarRUT = (rutCompleto: string) => {
  if (!/^[0-9]+[-|‐]{1}[0-9kK]{1}$/.test(rutCompleto)) return false;
  const tmp = rutCompleto.split('-');
  const rut = tmp[0];
  let digv = tmp[1]; 
  if (digv === 'K') digv = 'k';
  
  let M = 0, S = 1;
  let rutNum = parseInt(rut, 10);
  for (; rutNum; rutNum = Math.floor(rutNum / 10)) {
    S = (S + rutNum % 10 * (9 - M++ % 6)) % 11;
  }
  const dvEsperado = S ? (S - 1).toString() : 'k';
  return digv === dvEsperado;
};

const ESTUDIANTE_INICIAL: NuevoEstudianteForm = {
  run: '', nombres: '', apellido_paterno: '', apellido_materno: '', fecha_nacimiento: '', sexo: 'Masculino',
  domicilio: '', latitud: '', longitud: '',
  pais_origen_estudiante: '', doc_extranjero_estudiante: '',
  
  run_apoderado: '', nombres_apoderado: '', apellido_paterno_apoderado: '', apellido_materno_apoderado: '',
  domicilio_apoderado: '', telefono_apoderado: '', correo_apoderado: '', relacion_estudiante: 'Madre',
  pais_origen_apoderado: '', doc_extranjero_apoderado: '',

  tiene_suplente: false,
  run_suplente: '', nombres_suplente: '', apellido_paterno_suplente: '', apellido_materno_suplente: '',
  domicilio_suplente: '', telefono_suplente: '', correo_suplente: '', relacion_suplente: 'Familiar',

  sistema_salud: 'FONASA', letra_fonasa: 'A', cesfam: '', centro_emergencia: '',
  diagnostico_medico: 'No', medico_tratante: '', medicamento: '', alergias: '', nee: 'No', nee_tipo: 'No aplica'
};

export const useEstudiantes = () => {
  const { toast } = useToast();
  const context = useOutletContext<{ 
    colegioSeleccionado: string; 
    setColegioSeleccionado?: (col: string) => void;
    establecimientos?: any[];
    esPerfilGlobal?: boolean;
  }>() || { colegioSeleccionado: '' };

  const colegioSeleccionado = context.colegioSeleccionado || '';
  const setColegioSeleccionado = context.setColegioSeleccionado;
  const establecimientos = context.establecimientos || [];
  const navigate = useNavigate();

  const usuarioString = localStorage.getItem('usuario');
  const usuario = usuarioString ? JSON.parse(usuarioString) : null;
  const esPerfilGlobal = context.esPerfilGlobal ?? ['SLEP', 'admin_slep', 'Visualizador_SLEP'].includes(usuario?.rol);
  const puedeEditar = !['Visualizador_SLEP', 'Visualizador_Colegio'].includes(usuario?.rol);

  // Modo Búsqueda Global (Red SLEP sin filtro de colegio)
  const [busquedaGlobal, setBusquedaGlobal] = useState(false);

  const [listaEstudiantes, setListaEstudiantes] = useState<any[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  // Filtros Directorio
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const busquedaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filtroAnio, setFiltroAnio] = useState<string>('');
  const anioInicializadoRef = useRef(false);
  const colegioPrevioRef = useRef<string | null>(null);

  // Reiniciar indicador cuando cambia el establecimiento seleccionado
  useEffect(() => {
    if (colegioSeleccionado !== colegioPrevioRef.current) {
      colegioPrevioRef.current = colegioSeleccionado;
      anioInicializadoRef.current = false;
      setFiltroAnio('');
    }
  }, [colegioSeleccionado]);

  // Debounce para búsqueda en servidor (350ms)
  useEffect(() => {
    if (busquedaDebounceRef.current) clearTimeout(busquedaDebounceRef.current);
    busquedaDebounceRef.current = setTimeout(() => {
      setBusquedaDebounced(textoBusqueda);
      setPage(1);
    }, 350);
    return () => {
      if (busquedaDebounceRef.current) clearTimeout(busquedaDebounceRef.current);
    };
  }, [textoBusqueda]);

  const [filtroCodigo, setFiltroCodigo] = useState<string>('');
  const [filtroCurso, setFiltroCurso] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');

  // Reset página al cambiar filtros
  useEffect(() => {
    setPage(1);
  }, [filtroAnio, filtroCodigo, filtroCurso, filtroEstado, colegioSeleccionado, busquedaGlobal]);

  useEffect(() => {
    setFiltroCurso('');
  }, [filtroCodigo]);

  const [datosEstudiante, setDatosEstudiante] = useState<any>(null);
  const [cargandoFicha, setCargandoFicha] = useState(false);
  const [error, setError] = useState('');

  // Asistente Crear Estudiante
  const [vistaCrearEstudiante, setVistaCrearEstudiante] = useState(false);
  const [pasoCrear, setPasoCrear] = useState(1);
  const [creando, setCreando] = useState(false);
  const [estudianteCreadoExito, setEstudianteCreadoExito] = useState(false);
  const [rutRecienCreado, setRutRecienCreado] = useState('');
  const [archivoTutor, setArchivoTutor] = useState<File | null>(null);

  const [nuevoEstudiante, setNuevoEstudiante] = useState<NuevoEstudianteForm>(ESTUDIANTE_INICIAL);

  // Edición Completa
  const [modoEdicion, setModoEdicion] = useState(false);
  const [datosEdicion, setDatosEdicion] = useState<any>({});
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  
  const [buscandoMapa, setBuscandoMapa] = useState(false);
  const [sugerenciasMapa, setSugerenciasMapa] = useState<any[]>([]);

  const [buscandoApoderado, setBuscandoApoderado] = useState(false);
  const [avisoApoderado, setAvisoApoderado] = useState<string | null>(null);

  const buscarApoderadoPorRut = async () => {
    const rutAp = (datosEdicion.rut_apoderado || '').trim();
    if (!rutAp) {
      setAvisoApoderado('Ingrese un RUT para buscar.');
      return;
    }
    setBuscandoApoderado(true);
    setAvisoApoderado(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/estudiante/apoderado/buscar/${encodeURIComponent(rutAp)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        if (d.existe) {
          setDatosEdicion((prev: any) => ({
            ...prev,
            nombres_apoderado: d.nombres_apoderado || prev.nombres_apoderado,
            apellido_paterno_apoderado: d.apellido_paterno_apoderado || prev.apellido_paterno_apoderado,
            apellido_materno_apoderado: d.apellido_materno_apoderado || prev.apellido_materno_apoderado,
            domicilio_apoderado: d.domicilio_apoderado || prev.domicilio_apoderado,
            telefono_apoderado: d.telefono_apoderado || prev.telefono_apoderado,
            correo_apoderado: d.correo_apoderado || prev.correo_apoderado,
          }));
          setAvisoApoderado('Apoderado encontrado y datos precargados.');
        } else {
          setAvisoApoderado('Apoderado no encontrado en la base de datos.');
        }
      } else {
        setAvisoApoderado('No se pudo verificar el apoderado.');
      }
    } catch {
      setAvisoApoderado('Error al conectar con el servidor.');
    } finally {
      setBuscandoApoderado(false);
    }
  };

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
    const token = localStorage.getItem('token');
    const param = (!busquedaGlobal && colegioSeleccionado) ? `?establecimiento_id=${colegioSeleccionado}` : '';
    const url = `${API_BASE_URL}/matriculas/opciones-filtro${param}`;

    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then((data) => {
        setOpcionesFiltro(data);
        if (data.anios && data.anios.length > 0) {
          const ultimoAnioRegistrado = String(data.anios[0]);
          if (!anioInicializadoRef.current) {
            setFiltroAnio(ultimoAnioRegistrado);
            anioInicializadoRef.current = true;
          }
        }
      })
      .catch(() => {});
  }, [colegioSeleccionado, busquedaGlobal]);

  useEffect(() => {
    cargarOpcionesFiltro();
  }, [cargarOpcionesFiltro]);

  const aniosUnicos = useMemo(() => (opcionesFiltro.anios || []).map(String), [opcionesFiltro.anios]);
  const codigosUnicos = useMemo(() => {
    if (opcionesFiltro.planes && opcionesFiltro.planes.length > 0) {
      return opcionesFiltro.planes.map(p => String(p.codigo));
    }
    return [];
  }, [opcionesFiltro.planes]);
  const cursosUnicos = useMemo(() => {
    if (filtroCodigo && opcionesFiltro.cursos_por_plan && opcionesFiltro.cursos_por_plan[filtroCodigo]) {
      return opcionesFiltro.cursos_por_plan[filtroCodigo];
    }
    return opcionesFiltro.cursos || [];
  }, [filtroCodigo, opcionesFiltro]);
  const estadosUnicos = useMemo(() => ['Activa', 'Retirada', 'Pendiente_Traslado', 'Sin Matrícula'], []);

  // --- CARGA DEL DIRECTORIO PAGINADO DESDE EL SERVIDOR ---
  const cargarDirectorio = useCallback(() => {
    // Si es administrador global y no ha seleccionado colegio ni activado búsqueda general: no cargar lista
    if (esPerfilGlobal && !colegioSeleccionado && !busquedaGlobal) {
      setListaEstudiantes([]);
      setTotal(0);
      setTotalPages(1);
      setCargandoLista(false);
      return;
    }

    // Si está en búsqueda general pero no ha escrito al menos 2 caracteres: mantener lista limpia para rendimiento
    if (busquedaGlobal && (!busquedaDebounced || busquedaDebounced.trim().length < 2)) {
      setListaEstudiantes([]);
      setTotal(0);
      setTotalPages(1);
      setCargandoLista(false);
      return;
    }

    setCargandoLista(true);
    const token = localStorage.getItem('token'); 

    const params = new URLSearchParams();
    if (!busquedaGlobal && colegioSeleccionado) {
      params.set('establecimiento_id', colegioSeleccionado);
    }
    if (busquedaGlobal) {
      params.set('buscar_global', 'true');
    }
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));
    if (filtroAnio) params.set('anio', filtroAnio);
    if (filtroCodigo) params.set('codigo', filtroCodigo);
    if (filtroCurso) params.set('curso', filtroCurso);
    if (filtroEstado) params.set('estado', filtroEstado);
    if (busquedaDebounced.trim()) params.set('q', busquedaDebounced.trim());

    const url = `${API_BASE_URL}/estudiante?${params.toString()}`;

    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      }
    })
      .then(res => {
        if (!res.ok) throw new Error('Error al conectar con la API');
        return res.json();
      })
      .then(datos => {
        if (datos && Array.isArray(datos.estudiantes)) {
          setListaEstudiantes(datos.estudiantes);
          setTotal(datos.total ?? 0);
          setTotalPages(datos.total_pages ?? 1);
        } else if (Array.isArray(datos)) {
          setListaEstudiantes(datos);
          setTotal(datos.length);
          setTotalPages(1);
        } else {
          setListaEstudiantes([]);
          setTotal(0);
          setTotalPages(1);
        }
        setCargandoLista(false);
      })
      .catch(err => {
        console.error(err);
        setListaEstudiantes([]);
        setTotal(0);
        setTotalPages(1);
        setCargandoLista(false);
      });
  }, [colegioSeleccionado, page, filtroAnio, filtroCodigo, filtroCurso, filtroEstado, busquedaDebounced, busquedaGlobal, esPerfilGlobal]);

  useEffect(() => {
    cargarDirectorio();
  }, [cargarDirectorio]);

  const estudiantesFiltrados = listaEstudiantes;

  const verFichaEstudiante = async (rut: string) => {
    setCargandoFicha(true);
    setError('');
    setModoEdicion(false); 
    const token = localStorage.getItem('token');
    
    try {
      const respuesta = await fetch(`${API_BASE_URL}/estudiante/${rut}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!respuesta.ok) throw new Error('Error al cargar la ficha');
      const datos = await respuesta.json();
      
      setDatosEstudiante({
        personal: datos.personal || {},
        apoderado: datos.apoderado || {},
        apoderado_suplente: datos.apoderado_suplente || null, 
        salud: datos.salud || null, 
        historial: datos.historial || []
      });

      // Desglosar nombres de titular si venían concatenados
      let nomAp = datos.apoderado?.nombres || '';
      let patAp = datos.apoderado?.apellido_paterno || '';
      let matAp = datos.apoderado?.apellido_materno || '';
      if (!nomAp && datos.apoderado?.nombre && datos.apoderado.nombre !== 'Pendiente') {
        const parts = datos.apoderado.nombre.trim().split(' ');
        if (parts.length >= 3) {
          nomAp = parts.slice(0, -2).join(' ');
          patAp = parts[parts.length - 2];
          matAp = parts[parts.length - 1];
        } else if (parts.length === 2) {
          nomAp = parts[0];
          patAp = parts[1];
        } else {
          nomAp = parts[0];
        }
      }

      // Desglosar nombres de suplente si venían concatenados
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

      // Precargar TODO el formulario de edición con los datos existentes
      setDatosEdicion({
        domicilio: datos.personal?.domicilio && datos.personal.domicilio !== 'Sin registrar' ? datos.personal.domicilio : '',
        
        // Titular
        rut_apoderado: datos.apoderado?.rut && datos.apoderado.rut !== 'Sin registrar' ? datos.apoderado.rut : '',
        nombres_apoderado: nomAp,
        apellido_paterno_apoderado: patAp,
        apellido_materno_apoderado: matAp,
        domicilio_apoderado: datos.apoderado?.domicilio || datos.personal?.domicilio || '',
        telefono_apoderado: datos.apoderado?.telefono && datos.apoderado.telefono !== '-' ? datos.apoderado.telefono : '',
        correo_apoderado: datos.apoderado?.correo && datos.apoderado.correo !== '-' ? datos.apoderado.correo : '',
        relacion_apoderado: datos.apoderado?.relacion || 'Madre',

        // Suplente
        tiene_suplente: Boolean(datos.apoderado_suplente?.rut),
        rut_suplente: datos.apoderado_suplente?.rut || '',
        nombres_suplente: nomSup,
        apellido_paterno_suplente: patSup,
        apellido_materno_suplente: matSup,
        domicilio_suplente: datos.apoderado_suplente?.domicilio || '',
        telefono_suplente: datos.apoderado_suplente?.telefono && datos.apoderado_suplente.telefono !== '-' ? datos.apoderado_suplente.telefono : '',
        correo_suplente: datos.apoderado_suplente?.correo && datos.apoderado_suplente.correo !== '-' ? datos.apoderado_suplente.correo : '',
        relacion_suplente: datos.apoderado_suplente?.relacion || 'Familiar',

        // Salud
        sistema_salud: datos.salud?.sistema_salud || 'FONASA',
        letra_fonasa: datos.salud?.letra_fonasa || 'A',
        cesfam: datos.salud?.cesfam && datos.salud.cesfam !== 'No informado' ? datos.salud.cesfam : '',
        centro_emergencia: datos.salud?.centro_emergencia && datos.salud.centro_emergencia !== 'No informado' ? datos.salud.centro_emergencia : '',
        diagnostico_medico: datos.salud?.diagnostico_medico || 'No',
        medico_tratante: datos.salud?.medico_tratante && datos.salud.medico_tratante !== 'No informado' ? datos.salud.medico_tratante : '',
        medicamento: datos.salud?.medicamento || '',
        alergias: datos.salud?.alergias || '',
        nee: datos.salud?.nee || 'No',
        nee_tipo: datos.salud?.nee_tipo && datos.salud.nee_tipo !== 'No aplica' ? datos.salud.nee_tipo : ''
      });

    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargandoFicha(false);
    }
  };

  const handleGuardarEdicion = async () => {
    setGuardandoEdicion(true);
    const token = localStorage.getItem('token');
    try {
      const payloadEnvio = {
        domicilio_estudiante: datosEdicion.domicilio || "Sin registrar",
        
        // Titular
        rut_apoderado: datosEdicion.rut_apoderado,
        nombres_apoderado: datosEdicion.nombres_apoderado,
        apellido_paterno_apoderado: datosEdicion.apellido_paterno_apoderado,
        apellido_materno_apoderado: datosEdicion.apellido_materno_apoderado,
        domicilio_apoderado: datosEdicion.domicilio_apoderado || datosEdicion.domicilio || "Sin registrar",
        telefono_apoderado: datosEdicion.telefono_apoderado,
        correo_apoderado: datosEdicion.correo_apoderado,
        relacion_apoderado: datosEdicion.relacion_apoderado,

        // Suplente
        modificar_suplente: true,
        tiene_suplente: datosEdicion.tiene_suplente,
        rut_suplente: datosEdicion.rut_suplente,
        nombres_suplente: datosEdicion.nombres_suplente,
        apellido_paterno_suplente: datosEdicion.apellido_paterno_suplente,
        apellido_materno_suplente: datosEdicion.apellido_materno_suplente,
        domicilio_suplente: datosEdicion.domicilio_suplente || datosEdicion.domicilio_apoderado || datosEdicion.domicilio,
        telefono_suplente: datosEdicion.telefono_suplente,
        correo_suplente: datosEdicion.correo_suplente,
        relacion_suplente: datosEdicion.relacion_suplente,

        // Salud
        actualizar_salud: true,
        sistema_salud: datosEdicion.sistema_salud,
        letra_fonasa: datosEdicion.letra_fonasa,
        cesfam: datosEdicion.cesfam || "No informado",
        centro_emergencia: datosEdicion.centro_emergencia || "No informado",
        diagnostico_medico: datosEdicion.diagnostico_medico,
        medico_tratante: datosEdicion.medico_tratante || "No informado",
        medicamento: datosEdicion.medicamento,
        alergias: datosEdicion.alergias,
        nee: datosEdicion.nee,
        nee_tipo: datosEdicion.nee_tipo || "No aplica"
      };

      const respuesta = await fetch(`${API_BASE_URL}/estudiante/${datosEstudiante.personal.run}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payloadEnvio),
      });

      if (!respuesta.ok) {
        const errorData = await respuesta.json();
        throw new Error(errorData.detail || "Error al actualizar la ficha");
      }

      await verFichaEstudiante(datosEstudiante.personal.run);
      setModoEdicion(false);
      toast.success("Todos los antecedentes y la ficha médica han sido actualizados exitosamente.");
    } catch (err: any) {
      toast.error("Error al actualizar la ficha: " + err.message);
    } finally {
      setGuardandoEdicion(false);
    }
  };
  
  const buscarSugerencias = async () => {
    if (!nuevoEstudiante.domicilio) {
      toast.warning("Primero escribe una calle o sector para buscar.");
      return;
    }
    setBuscandoMapa(true);
    setSugerenciasMapa([]); 
    try {
      const query = encodeURIComponent(nuevoEstudiante.domicilio);
      const respuesta = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=cl&limit=5`);
      const datos = await respuesta.json();
      if (datos && datos.length > 0) {
        setSugerenciasMapa(datos);
      } else {
        toast.info("No se encontraron resultados en Chile. Intenta agregar la comuna, ej: 'Avenida Brasil, Valparaíso'.");
      }
    } catch (error) {
      toast.error("Hubo un error al conectar con el servicio de mapas.");
    } finally {
      setBuscandoMapa(false);
    }
  };

  const seleccionarDireccion = (lugar: any) => {
    setNuevoEstudiante({
      ...nuevoEstudiante,
      domicilio: lugar.display_name, 
      latitud: lugar.lat,
      longitud: lugar.lon
    });
    setSugerenciasMapa([]);
  };

  const irSiguientePasoCrear = () => {
    if (pasoCrear === 1) {
      const esIpe = nuevoEstudiante.run.replace(/[^0-9kK]/g, '').length >= 10;
      if (!nuevoEstudiante.run.trim()) { toast.warning("Debe ingresar el RUN o IPE del estudiante."); return; }
      if (!esIpe && !validarRUT(nuevoEstudiante.run)) { toast.warning("El RUT del estudiante no es válido."); return; }
      if (esIpe && (!nuevoEstudiante.pais_origen_estudiante || !nuevoEstudiante.doc_extranjero_estudiante)) {
        toast.warning("Para estudiantes con IPE es obligatorio ingresar País de Origen y Documento Extranjero.");
        return;
      }
      if (!nuevoEstudiante.nombres.trim() || !nuevoEstudiante.apellido_paterno.trim() || !nuevoEstudiante.fecha_nacimiento) {
        toast.warning("Por favor complete los nombres, apellidos y fecha de nacimiento del estudiante.");
        return;
      }
      if (!nuevoEstudiante.domicilio.trim()) {
        toast.warning("Debe ingresar el domicilio del estudiante.");
        return;
      }
      setPasoCrear(2);
    } else if (pasoCrear === 2) {
      const esIpa = nuevoEstudiante.run_apoderado.replace(/[^0-9kK]/g, '').length >= 10;
      if (!nuevoEstudiante.relacion_estudiante) { toast.warning("Seleccione el parentesco del Apoderado Titular."); return; }
      if (nuevoEstudiante.relacion_estudiante === 'Tutor Legal Designado' && !archivoTutor) {
        toast.warning("Debe adjuntar el documento que acredite la tutoría legal.");
        return;
      }
      if (!nuevoEstudiante.run_apoderado.trim()) { toast.warning("Debe ingresar el RUT del Apoderado Titular."); return; }
      if (!esIpa && !validarRUT(nuevoEstudiante.run_apoderado)) { toast.warning("El RUT del Apoderado Titular no es válido."); return; }
      if (!nuevoEstudiante.nombres_apoderado.trim() || !nuevoEstudiante.apellido_paterno_apoderado.trim()) {
        toast.warning("Complete el nombre y apellido del apoderado titular.");
        return;
      }
      if (!nuevoEstudiante.telefono_apoderado.trim() || !nuevoEstudiante.correo_apoderado.trim()) {
        toast.warning("El teléfono y correo del apoderado titular son obligatorios.");
        return;
      }
      if (nuevoEstudiante.tiene_suplente) {
        if (!nuevoEstudiante.run_suplente.trim()) { toast.warning("Debe ingresar el RUT del Apoderado Suplente."); return; }
        if (!validarRUT(nuevoEstudiante.run_suplente)) { toast.warning("El RUT del Apoderado Suplente no es válido."); return; }
        if (!nuevoEstudiante.nombres_suplente.trim() || !nuevoEstudiante.apellido_paterno_suplente.trim()) {
          toast.warning("Complete el nombre y apellido del apoderado suplente.");
          return;
        }
      }
      setPasoCrear(3);
    }
  };

  const irPasoAnteriorCrear = () => {
    setPasoCrear(prev => Math.max(1, prev - 1));
  };

  const handleCrearEstudiante = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEstudiante.cesfam.trim() || !nuevoEstudiante.centro_emergencia.trim()) {
      toast.warning("Por favor complete el CESFAM y Centro de Emergencias en la Ficha Médica.");
      return;
    }

    setCreando(true);
    const token = localStorage.getItem('token');

    try {
      const respuesta = await fetch(`${API_BASE_URL}/estudiante`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(nuevoEstudiante),
      });

      if (!respuesta.ok) {
        const errorData = await respuesta.json();
        throw new Error(errorData.detail || 'Error al guardar el estudiante.');
      }

      // Si el apoderado es tutor legal designado y se adjuntó archivo, subirlo
      if (nuevoEstudiante.relacion_estudiante === 'Tutor Legal Designado' && archivoTutor) {
        try {
          const formArchivo = new FormData();
          formArchivo.append('archivo', archivoTutor);
          await fetch(`${API_BASE_URL}/estudiante/${nuevoEstudiante.run}/documento-tutor`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formArchivo
          });
        } catch (uploadErr) {
          console.warn("Advertencia al subir archivo de tutoría:", uploadErr);
        }
      }
      
      setRutRecienCreado(nuevoEstudiante.run);
      setEstudianteCreadoExito(true);
      toast.success("Estudiante ingresado exitosamente al registro.");
      cargarDirectorio();
    } catch (err: any) {
      toast.error(err.message || "Error al crear el estudiante.");
    } finally {
      setCreando(false);
    }
  };

  const [navegandoAMatricular, setNavegandoAMatricular] = useState(false);

  const irAMatricular = () => {
    setNavegandoAMatricular(true);
    // Pequeño delay para que el spinner sea visible antes de que React desmonte el componente
    setTimeout(() => {
      setVistaCrearEstudiante(false);
      setEstudianteCreadoExito(false);
      setPasoCrear(1);
      navigate('/matriculas/nueva', { state: { rutPreseleccionado: rutRecienCreado } });
    }, 300);
  };

  const cerrarModalExito = () => {
    setVistaCrearEstudiante(false);
    setEstudianteCreadoExito(false);
    setPasoCrear(1);
    setNuevoEstudiante(ESTUDIANTE_INICIAL);
  };

  const iniciarCrearEstudiante = () => {
    setDatosEstudiante(null);
    setModoEdicion(false);
    setEstudianteCreadoExito(false);
    setPasoCrear(1);
    setNuevoEstudiante(ESTUDIANTE_INICIAL);
    setVistaCrearEstudiante(true);
  };

  return {
    puedeEditar,
    datosEstudiante, setDatosEstudiante,
    modoEdicion, setModoEdicion,
    guardandoEdicion, handleGuardarEdicion,
    textoBusqueda, setTextoBusqueda,
    filtroAnio, setFiltroAnio,
    filtroEstado, setFiltroEstado,
    filtroCodigo, setFiltroCodigo,
    filtroCurso, setFiltroCurso,
    aniosUnicos, estadosUnicos, codigosUnicos, cursosUnicos,
    cargandoLista, estudiantesFiltrados,
    verFichaEstudiante,
    datosEdicion, setDatosEdicion,
    // Contexto Institucional y Búsqueda Global
    colegioSeleccionado, setColegioSeleccionado, establecimientos, esPerfilGlobal,
    busquedaGlobal, setBusquedaGlobal,
    // Paginación
    page, setPage, totalPages, total,
    // Asistente Nuevo Estudiante
    vistaCrearEstudiante, setVistaCrearEstudiante,
    pasoCrear, setPasoCrear,
    irSiguientePasoCrear, irPasoAnteriorCrear,
    iniciarCrearEstudiante,
    estudianteCreadoExito, rutRecienCreado, cerrarModalExito, irAMatricular, navegandoAMatricular,
    nuevoEstudiante, setNuevoEstudiante, formatearRUT, handleCrearEstudiante,
    creando, buscarSugerencias, buscandoMapa, sugerenciasMapa, seleccionarDireccion, archivoTutor, setArchivoTutor,
    buscarApoderadoPorRut, buscandoApoderado, avisoApoderado
  };
};