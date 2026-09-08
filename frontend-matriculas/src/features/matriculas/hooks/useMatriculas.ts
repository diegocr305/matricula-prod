import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { API_URL } from '../../../config/api';

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
}

export const useMatriculas = () => {
  const { colegioSeleccionado } = useOutletContext<{ colegioSeleccionado: string }>();

  // --- LÃ“GICA DE ROLES ---
  const usuarioString = localStorage.getItem('usuario');
  const usuario = usuarioString ? JSON.parse(usuarioString) : null;
  const puedeEditar = !['Visualizador_SLEP', 'Visualizador_Colegio'].includes(usuario?.rol);

  const [motivoCambio, setMotivoCambio] = useState('');
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  
  const [busqueda, setBusqueda] = useState('');
  // filtroAnio: '' hasta que el backend nos diga el año por defecto; 'todos' = histórico
  const [filtroAnio, setFiltroAnio] = useState('');
  const [aniosDisponibles, setAniosDisponibles] = useState<number[]>([]);
  const [filtroCodigo, setFiltroCodigo] = useState('');
  const [filtroCurso, setFiltroCurso] = useState('');
  const [ordenFolio, setOrdenFolio] = useState<'asc' | 'desc' | null>('asc'); 
  const [ordenEstado, setOrdenEstado] = useState<'asc' | 'desc' | null>(null);

  const [modalCursoAbierto, setModalCursoAbierto] = useState(false);
  const [procesandoCurso, setProcesandoCurso] = useState(false);
  const [planDestino, setPlanDestino] = useState<string>('');
  const [cursoDestino, setCursoDestino] = useState<string>('');
  
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

  const anioActual = new Date().getFullYear();

  const manejarSubidaCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = e.target.files;
    if (!archivos || archivos.length === 0) return;

    setSubiendoArchivo(true);
    const formData = new FormData();
    
    Array.from(archivos).forEach((archivo) => {
      formData.append("archivos", archivo);
    });

    const token = localStorage.getItem('token'); 

    try {
      const respuesta = await fetch(`${API_URL}/matriculas/carga-masiva`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.detail || "Error al subir los archivos");
      
      alert(datos.mensaje); 
      cargarMatriculas();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setSubiendoArchivo(false);
      e.target.value = ''; 
    }
  };

  const cargarMatriculas = (anioParam?: string) => {
    if (!colegioSeleccionado) {
      setMatriculas([]);
      setCargando(false);
      return; 
    }

    setCargando(true);
    const token = localStorage.getItem('token');
    // Si nos pasan un año explícito lo usamos; si no, el que esté en filtroAnio.
    // '' significa "usar el año por defecto del backend" (no se manda el parámetro).
    const anioUsar = anioParam !== undefined ? anioParam : filtroAnio;
    let url = `${API_URL}/matriculas?establecimiento_id=${colegioSeleccionado}`;
    if (anioUsar) {
      url += `&anio=${anioUsar}`;
    }

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
      .then((datos) => {
        setMatriculas(datos);
        setCargando(false);
      })
      .catch((err) => {
        setError(err.message);
        setCargando(false);
      });
  };

  // Al cambiar de colegio: pedir años disponibles y fijar el año por defecto (último con datos).
  useEffect(() => {
    if (!colegioSeleccionado) {
      setAniosDisponibles([]);
      setMatriculas([]);
      setCargando(false);
      return;
    }
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/matriculas/anios-disponibles?establecimiento_id=${colegioSeleccionado}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : { anios: [], por_defecto: null })
      .then((data: { anios: number[]; por_defecto: number | null }) => {
        setAniosDisponibles(data.anios || []);
        const porDefecto = data.por_defecto ? String(data.por_defecto) : '';
        // Fijar el año por defecto; el efecto de filtroAnio disparará la carga.
        setFiltroAnio(porDefecto);
        cargarMatriculas(porDefecto);
      })
      .catch(() => {
        setAniosDisponibles([]);
        cargarMatriculas('');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colegioSeleccionado]);

  // Al cambiar el filtro de año (por el usuario), recargar desde el backend.
  const primeraCargaAnio = useMemo(() => ({ v: true }), [colegioSeleccionado]);
  useEffect(() => {
    // Evitamos doble carga en el montaje inicial (ya la hizo el efecto de arriba).
    if (primeraCargaAnio.v) {
      primeraCargaAnio.v = false;
      return;
    }
    cargarMatriculas(filtroAnio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroAnio]);

  useEffect(() => {
    setFiltroCurso('');
  }, [filtroCodigo]);

  // Años para el selector: vienen del backend (no de las matrículas cargadas,
  // que ahora solo contienen un año por defecto).
  const aniosUnicos = aniosDisponibles;

  const codigosUnicos = useMemo(() => {
    const codigos = matriculas.map(m => m.cod_tipo_ensenanza).filter(cod => cod !== null);
    return Array.from(new Set(codigos)).sort();
  }, [matriculas]);

  const cursosUnicos = useMemo(() => {
    const matriculasFiltradas = filtroCodigo 
      ? matriculas.filter(m => m.cod_tipo_ensenanza?.toString() === filtroCodigo)
      : matriculas;
    const cursos = matriculasFiltradas.map(m => m.curso).filter(Boolean);
    return Array.from(new Set(cursos)).sort();
  }, [matriculas, filtroCodigo]);

  const estructuraColegio = useMemo(() => {
    const estructura: Record<string, { nombrePlan: string, cursos: Set<string> }> = {};
    
    matriculas.forEach(mat => {
      if (mat.anio_escolar === anioActual && mat.estado === 'Activa' && mat.cod_tipo_ensenanza) {
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
  }, [matriculas, anioActual]);

  const matriculasProcesadas = useMemo(() => {
    let resultado = matriculas.filter(mat => {
      const textoBuscado = busqueda.toLowerCase();
      const coincideBusqueda = 
        mat.estudiante_rut.toLowerCase().includes(textoBuscado) ||
        mat.numero_correlativo.toString().includes(textoBuscado) ||
        mat.estudiante_nombre.toLowerCase().includes(textoBuscado);
      
      // El año ya viene filtrado desde el backend; aquí solo búsqueda, código y curso.
      const coincideCodigo = filtroCodigo === '' || mat.cod_tipo_ensenanza?.toString() === filtroCodigo;
      const coincideCurso = filtroCurso === '' || mat.curso === filtroCurso;

      return coincideBusqueda && coincideCodigo && coincideCurso;
    });

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
  }, [matriculas, busqueda, filtroCodigo, filtroCurso, ordenFolio, ordenEstado]);

  // ============================================================================
  // ============================================================================
  // LÓGICA DINÁMICA DE CAPACIDAD DE SALA (Conectada a la BD)
  // ============================================================================
  const LIMITE_CUPOS = 45; // fallback por defecto
  const [capacidadSala, setCapacidadSala] = useState<number>(45);

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

  useEffect(() => {
    const obtenerCapacidad = async () => {
      // No aplica con "Todos los años" (los cupos son por año-curso específico)
      if (!colegioSeleccionado || !filtroAnio || filtroAnio === 'todos' || !filtroCurso || matriculas.length === 0) {
        setCapacidadSala(45);
        return;
      }
      const rbdReal = matriculas[0].rbd;
      const nivelExcel = formatearNivelExcel(filtroCurso);
      const token = localStorage.getItem('token');
      try {
        const url = `${API_URL}/establecimientos/capacidad-sala?rbd=${rbdReal}&anio_escolar=${filtroAnio}&nivel=${nivelExcel}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setCapacidadSala(data.capacidad_maxima);
        } else {
          setCapacidadSala(45);
        }
      } catch (e) {
        console.error("Error obteniendo capacidad:", e);
        setCapacidadSala(45);
      }
    };
    obtenerCapacidad();
  }, [colegioSeleccionado, filtroAnio, filtroCurso, matriculas]);

  // Cupos son por año-curso específico: no aplica con "Todos los años" ni sin año.
  const mostrarCupos = filtroAnio !== '' && filtroAnio !== 'todos' && filtroCodigo !== '' && filtroCurso !== '';

  const cuposOcupados = useMemo(() => {
    if (!mostrarCupos) return 0;
    return matriculasProcesadas.filter(m => m.estado === 'Activa').length;
  }, [matriculasProcesadas, mostrarCupos]);

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
      const respuesta = await fetch(`${API_URL}/matriculas/${idSeleccionado}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          estado: 'Retirado',
          fecha_retiro: fechaRetiro,
          motivo_retiro: '', 
          observaciones: '', 
          id_usuario_ejecutor: 1 
        }),
      });

      if (!respuesta.ok) throw new Error('Error al procesar la baja en el sistema');

      if (descargarLocalRetiro) {
        window.open(`${API_URL}/matriculas/${idSeleccionado}/certificado?tipo=RETIRO`, '_blank');
      }

      setModalAbierto(false);
      cargarMatriculas(); 
      alert('Retiro procesado y comprobante enviado con Ã©xito.');

    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setProcesandoRetiro(false);
    }
  };

  const iniciarCambioCurso = (id: number,  curso_actual: string, codigo_actual: number |null) => {
    setIdSeleccionado(id);
    setCursoActual(curso_actual);
    setCodigoActual(codigo_actual);
    setPlanDestino('');
    setCursoDestino('');
    setMotivoCambio('');
    setAdvertenciaNivel(null); 
    setModalCursoAbierto(true);
  };

  const confirmarCambioCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idSeleccionado || !planDestino || !cursoDestino) return;

    if (advertenciaNivel) {
      const seguro = window.confirm(`âš ï¸ ADVERTENCIA DE SEGURIDAD:\n\n${advertenciaNivel}\n\nÂ¿EstÃ¡ completamente seguro de que desea confirmar este cambio de nivel?`);
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
      const respuesta = await fetch(`${API_URL}/matriculas/${idSeleccionado}/curso`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          cod_tipo_ensenanza: parseInt(planDestino), 
          nuevo_curso: cursoDestino,
          motivo_cambio_curso: motivoCambio 
        }),
      });

      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.detail || 'Error al cambiar de curso');

      if (descargarLocalCurso) {
        window.open(`${API_URL}/matriculas/${idSeleccionado}/certificado?tipo=CAMBIO_CURSO`, '_blank');
      }

      setModalCursoAbierto(false);
      cargarMatriculas();
      alert('Traslado registrado y certificado enviado con Ã©xito.');

    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setProcesandoCurso(false);
    }
  };

  const exportarAExcel = async () => {
    if (!colegioSeleccionado) return;
    setDescargandoExcel(true);

    try {
      const token = localStorage.getItem('token');
      
      // Armar la URL con los parámetros de filtro actuales
      let url = `${API_URL}/matriculas/exportar-excel?establecimiento_id=${colegioSeleccionado}`;
      if (filtroAnio && filtroAnio !== 'todos') url += `&anio=${filtroAnio}`;
      if (filtroCodigo) url += `&codigo_plan=${filtroCodigo}`;

      const respuesta = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!respuesta.ok) throw new Error('Error al generar el archivo Excel.');

      // Convertir la respuesta a un Blob (archivo binario)
      const blob = await respuesta.blob();
      const urlBlob = window.URL.createObjectURL(blob);
      
      // Forzar la descarga en el navegador
      const linkDescarga = document.createElement('a');
      linkDescarga.href = urlBlob;
      linkDescarga.download = `Registro_Matriculas_${colegioSeleccionado}.xlsx`;
      document.body.appendChild(linkDescarga);
      linkDescarga.click();
      
      // Limpieza
      linkDescarga.remove();
      window.URL.revokeObjectURL(urlBlob);

    } catch (err: any) {
      alert("Hubo un error al descargar el Excel: " + err.message);
    } finally {
      setDescargandoExcel(false);
    }
  };

  useEffect(() => {
    const advertencias: string[] = [];

    if (planDestino && codigoActual && planDestino !== codigoActual.toString()) {
      advertencias.push(`â€¢ Cambio de CÃ“DIGO DE ENSEÃ‘ANZA (de Cod. ${codigoActual} a Cod. ${planDestino}).`);
    }

    if (cursoDestino && cursoActual) {
      const numActualMatch = cursoActual.match(/\d+/);
      const numDestinoMatch = cursoDestino.match(/\d+/);

      if (numActualMatch && numDestinoMatch) {
        const numActual = parseInt(numActualMatch[0]);
        const numDestino = parseInt(numDestinoMatch[0]);

        if (numDestino < numActual) {
          advertencias.push(`â€¢ EstÃ¡ moviendo al alumno a un grado INFERIOR (de ${numActual} a ${numDestino}).`);
        } else if (numDestino > numActual + 1) {
          advertencias.push(`â€¢ EstÃ¡ saltando mÃºltiples grados hacia ADELANTE (de ${numActual} a ${numDestino}).`);
        } else if (numDestino === numActual + 1) {
          advertencias.push(`â€¢ EstÃ¡ adelantando al alumno al grado SIGUIENTE (de ${numActual} a ${numDestino}). Normalmente los traslados a mitad de aÃ±o son en el mismo grado.`);
        }
      } else {
        const baseActual = cursoActual.replace(/\s*[A-Z]\s*$/i, '').trim().toLowerCase();
        const baseDestino = cursoDestino.replace(/\s*[A-Z]\s*$/i, '').trim().toLowerCase();
        
        if (baseActual !== baseDestino) {
          advertencias.push(`â€¢ EstÃ¡ cambiando el nivel del curso de '${cursoActual}' a '${cursoDestino}'.`);
        }
      }
      
    }

    if (advertencias.length > 0) {
      setAdvertenciaNivel(advertencias.join('\n'));
    } else {
      setAdvertenciaNivel(null);
    }
  }, [cursoDestino, cursoActual, planDestino, codigoActual]);

  return {
    colegioSeleccionado, puedeEditar, anioActual,
    cargando, error, 
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
    subiendoArchivo,
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
    mostrarCupos, cuposOcupados, LIMITE_CUPOS,
    descargandoExcel, exportarAExcel, capacidadSala
  };
};
