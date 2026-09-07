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
  const [filtroAnio, setFiltroAnio] = useState(''); 
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

  const cargarMatriculas = () => {
    if (!colegioSeleccionado) {
      setMatriculas([]);
      setCargando(false);
      return; 
    }

    setCargando(true);
    const token = localStorage.getItem('token');
    const url = `${API_URL}/matriculas?establecimiento_id=${colegioSeleccionado}`;

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

  useEffect(() => {
    cargarMatriculas();
  }, [colegioSeleccionado]); 

  useEffect(() => {
    setFiltroCurso('');
  }, [filtroCodigo]);

  const aniosUnicos = useMemo(() => {
    const anios = matriculas.map(m => m.anio_escolar).filter(Boolean);
    return Array.from(new Set(anios)).sort((a, b) => b - a);
  }, [matriculas]);

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
      
      const coincideAnio = filtroAnio === '' || mat.anio_escolar?.toString() === filtroAnio;
      const coincideCodigo = filtroCodigo === '' || mat.cod_tipo_ensenanza?.toString() === filtroCodigo;
      const coincideCurso = filtroCurso === '' || mat.curso === filtroCurso;

      return coincideBusqueda && coincideAnio && coincideCodigo && coincideCurso;
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
  }, [matriculas, busqueda, filtroAnio, filtroCodigo, filtroCurso, ordenFolio, ordenEstado]);

  // ============================================================================
  // ðŸŒŸ NUEVO: LÃ“GICA DE INDICADOR INTELIGENTE DE CUPOS (45 ALUMNOS)
  // ============================================================================
  const LIMITE_CUPOS = 45;
  
  // Solo se mostrarÃ¡ el cuadro informativo si los 3 filtros principales estÃ¡n seleccionados
  const mostrarCupos = filtroAnio !== '' && filtroCodigo !== '' && filtroCurso !== '';

  const cuposOcupados = useMemo(() => {
    if (!mostrarCupos) return 0;
    // Solo contamos las matrÃ­culas que estÃ¡n activas dentro del curso que ya filtramos arriba
    return matriculasProcesadas.filter(m => m.estado === 'Activa').length;
  }, [matriculasProcesadas, mostrarCupos]);
  // ============================================================================

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
    mostrarCupos, cuposOcupados, LIMITE_CUPOS // ðŸŒŸ AÃ±adimos las nuevas variables al return
  };
};