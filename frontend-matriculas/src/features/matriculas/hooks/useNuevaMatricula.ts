import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import { API_URL } from '../../../config/api';

export interface MatriculaBase {
  id_establecimiento: number;
  cod_tipo_ensenanza: number | null;
  tipo_ensenanza: string;
  nivel_ensenanza: string;
  curso: string;
  estudiante_rut: string;
  anio_escolar: number;
  estado?: string; // ðŸŒŸ AÃ±adimos el estado para contar solo las Activas
}

export const useNuevaMatricula = () => {
  const navigate = useNavigate();
  const location = useLocation(); 
  
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const [rutBusqueda, setRutBusqueda] = useState('');
  const [estudiante, setEstudiante] = useState<any>(null);
  const [estudianteCompleto, setEstudianteCompleto] = useState<any>(null);
  const [estudiantesDb, setEstudiantesDb] = useState<any[]>([]);
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

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

  const [formFaltantes, setFormFaltantes] = useState({
    domicilio_estudiante: '',
    rut_apoderado: '',
    nombres_apoderado: '',
    apellido_paterno_apoderado: '',
    apellido_materno_apoderado: '',
    domicilio_apoderado: '',
    telefono_apoderado: '',
    correo_apoderado: ''
  });

  const [colegioProcedencia, setColegioProcedencia] = useState('');
  const [esTraslado, setEsTraslado] = useState(false);
  const [guardandoFaltantes, setGuardandoFaltantes] = useState(false);
  
  const [establecimientosDb, setEstablecimientosDb] = useState<any[]>([]);
  const [todasLasMatriculas, setTodasLasMatriculas] = useState<MatriculaBase[]>([]);

  const [formulario, setFormulario] = useState({
    id_establecimiento: '',
    numero_correlativo: '',
    anio_escolar: '2026',
    fecha_matricula: new Date().toISOString().split('T')[0],
    nivel_ensenanza: 'EducaciÃ³n BÃ¡sica',
    cod_tipo_ensenanza: '',
    cursoSeleccionado: '',
    cod_grado: 1,
    letra_curso: 'A',
    es_excedente: false,
    numero_resolucion_excedente: '',
    fecha_resolucion_excedente: '',
    es_alumno_practica: false
  });

  const [checkCertNotas, setCheckCertNotas] = useState(false);
  const [checkCertRetiro, setCheckCertRetiro] = useState(false);
  const [idEstablecimientoPrevio, setIdEstablecimientoPrevio] = useState<string | null>(null);

// ============================================================================
  // LÓGICA DINÁMICA DE CONTROL DE CUPOS MÁXIMOS (Conectado a BD/Excel)
  // ============================================================================
  
  // 1. Estado para guardar el límite dinámico (45 por defecto como fallback normativo)
  const [limiteCupos, setLimiteCupos] = useState<number>(45);

  // 2. Función traductora: Convierte "1° Medio A" a "1MEDIO" para que coincida con el Excel
  const formatearNivelExcel = (cursoStr: string) => {
    const texto = cursoStr.toUpperCase();
    const numero = texto.match(/\d+/)?.[0] || "";
    
    if (texto.includes('MEDIO') || texto.includes('MEDIA')) return `${numero}MEDIO`;
    if (texto.includes('BÁSICO') || texto.includes('BASICO')) return `${numero}BASICO`;
    if (texto.includes('KINDER') || texto.includes('KÍNDER')) {
      return texto.includes('PRE') ? 'PREKINDER' : 'KINDER';
    }
    return texto.replace(/[^A-Z0-9]/g, ''); // Fallback de seguridad
  };

  // 3. Efecto: Consulta al backend la capacidad real cuando cambia el curso o colegio
  useEffect(() => {
    const obtenerCapacidadDinamica = async () => {
      if (!formulario.id_establecimiento || !formulario.cursoSeleccionado) {
        setLimiteCupos(45);
        return;
      }

      // Buscar el RBD del colegio seleccionado
      const colegio = establecimientosDb.find(e => String(e.id_establecimiento) === String(formulario.id_establecimiento));
      if (!colegio) return;

      const nivelExcel = formatearNivelExcel(formulario.cursoSeleccionado);
      const token = localStorage.getItem('token');

      try {
        const res = await fetch(`${API_URL}/establecimientos/capacidad-sala?rbd=${colegio.rbd}&anio_escolar=${formulario.anio_escolar}&nivel=${nivelExcel}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setLimiteCupos(data.capacidad_maxima);
        } else {
          setLimiteCupos(45); // Si falla la consulta, mantenemos el límite legal de 45
        }
      } catch (e) {
        console.error("Error al obtener la capacidad dinámica:", e);
        setLimiteCupos(45);
      }
    };

    obtenerCapacidadDinamica();
  }, [formulario.id_establecimiento, formulario.anio_escolar, formulario.cursoSeleccionado, establecimientosDb]);

  // 4. Conteo de ocupación (mantenemos la lógica, pero ahora compararemos con 'limiteCupos')
  const cuposOcupados = useMemo(() => {
    if (!formulario.id_establecimiento || !formulario.cod_tipo_ensenanza || !formulario.cursoSeleccionado) return 0;
    
    return todasLasMatriculas.filter(m =>
      String(m.id_establecimiento) === String(formulario.id_establecimiento) &&
      String(m.anio_escolar) === String(formulario.anio_escolar) &&
      String(m.cod_tipo_ensenanza) === String(formulario.cod_tipo_ensenanza) &&
      m.curso === formulario.cursoSeleccionado &&
      (m.estado === 'Activa' || !m.estado)
    ).length;
  }, [formulario.id_establecimiento, formulario.anio_escolar, formulario.cod_tipo_ensenanza, formulario.cursoSeleccionado, todasLasMatriculas]);

  // 5. Bloqueo de excedente automático usando el límite dinámico
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

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };

    fetch(`${API_URL}/establecimientos`, { headers })
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

    fetch(`${API_URL}/matriculas`, { headers })
      .then(res => res.json())
      .then(data => setTodasLasMatriculas(data))
      .catch(err => console.error("Error matrÃ­culas:", err));

    fetch(`${API_URL}/estudiante`, { headers })
      .then(res => res.json())
      .then(datos => {
        setEstudiantesDb(datos);
        const rutPre = location.state?.rutPreseleccionado;
        if (rutPre) {
          const encontrado = datos.find((est: any) => est.run === rutPre);
          if (encontrado) seleccionarEstudiante(encontrado);
        }
      })
      .catch(err => console.error("Error estudiantes:", err));
  }, [location.state]);

  const determinarNivelInteligente = (cursoStr: string, codigoPlan: number) => {
    const texto = cursoStr.toLowerCase();
    if (texto.includes('bÃ¡sico') || texto.includes('basico')) return 'EducaciÃ³n BÃ¡sica';
    if (texto.includes('medio') || texto.includes('media')) return 'EducaciÃ³n Media';
    if (texto.includes('parvularia') || texto.includes('kÃ­nder') || texto.includes('kinder') || texto.includes('pre-kÃ­nder') || texto.includes('sala cuna')) return 'EducaciÃ³n Parvularia';
    if (codigoPlan === 10) return 'EducaciÃ³n Parvularia';
    if (codigoPlan >= 110 && codigoPlan <= 119) return 'EducaciÃ³n BÃ¡sica';
    if (codigoPlan >= 300) return 'EducaciÃ³n Media';
    return 'EducaciÃ³n BÃ¡sica'; 
  };

  const codigosDisponibles = useMemo(() => {
    if (!formulario.id_establecimiento) return [];
    const idEst = Number(formulario.id_establecimiento);
    const filtradas = todasLasMatriculas.filter(m => Number(m.id_establecimiento) === idEst);
    const mapaCodigos = new Map();
    filtradas.forEach(m => {
      if (m.cod_tipo_ensenanza !== null && m.cod_tipo_ensenanza !== undefined) {
        mapaCodigos.set(Number(m.cod_tipo_ensenanza), m.tipo_ensenanza || 'Plan de Estudio');
      }
    });
    return Array.from(mapaCodigos.entries()).map(([codigo, nombre]) => ({ codigo, nombre }));
  }, [formulario.id_establecimiento, todasLasMatriculas]);

  const cursosDisponibles = useMemo(() => {
    if (!formulario.id_establecimiento || !formulario.cod_tipo_ensenanza) return [];
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
  }, [formulario.id_establecimiento, formulario.cod_tipo_ensenanza, todasLasMatriculas]);

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

  const handleEscribirBuscador = (texto: string) => {
    setRutBusqueda(texto);
    if (texto.length > 1) {
      const textoLimpio = texto.toLowerCase();
      const filtrados = estudiantesDb.filter(est => 
        est.run.toLowerCase().includes(textoLimpio) || 
        est.nombre_completo.toLowerCase().includes(textoLimpio)
      );
      setSugerencias(filtrados);
      setMostrarSugerencias(true);
    } else {
      setSugerencias([]);
      setMostrarSugerencias(false);
    }
  };

  const procesarEstudiante =  async (datos: any, estRun: string) => {
    setEstudiante(datos.personal);
    setEstudianteCompleto(datos);

    const faltan: string[] = [];
    if (!datos.personal.domicilio || datos.personal.domicilio === "Sin registrar") faltan.push("Domicilio del Estudiante");
    if (!datos.apoderado.rut || datos.apoderado.rut === "Sin registrar") faltan.push("RUT del Apoderado");
    if (!datos.apoderado.nombre || datos.apoderado.nombre === "Pendiente") faltan.push("Nombre Completo del Apoderado");
    if (!datos.apoderado.telefono || datos.apoderado.telefono === "-") faltan.push("TelÃ©fono del Apoderado");
    if (!datos.apoderado.correo || datos.apoderado.correo === "-") faltan.push("Correo del Apoderado");
    
    setDatosFaltantes(faltan);

    if (faltan.length > 0) {
      setFormFaltantes({
        domicilio_estudiante: datos.personal.domicilio !== "Sin registrar" ? datos.personal.domicilio : '',
        rut_apoderado: datos.apoderado.rut !== "Sin registrar" ? datos.apoderado.rut : '',
        nombres_apoderado: '',
        apellido_paterno_apoderado: '',
        apellido_materno_apoderado: '',
        domicilio_apoderado: '',
        telefono_apoderado: datos.apoderado.telefono !== "-" ? datos.apoderado.telefono : '',
        correo_apoderado: datos.apoderado.correo !== "-" ? datos.apoderado.correo : ''
      });
    }

    try {
      const token = localStorage.getItem('token');
      const resProcedencia = await fetch(`${API_URL}/matriculas/procedencia/${estRun}`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resProcedencia.ok) {
          const procedencia = await resProcedencia.json();
          
          if (procedencia.encontrado) {
              setIdEstablecimientoPrevio(String(procedencia.id_establecimiento_previo)); 
              setColegioProcedencia(`${procedencia.colegio_procedencia} (RBD: ${procedencia.rbd_procedencia})`);
              
              if (String(procedencia.id_establecimiento_previo) !== String(formulario.id_establecimiento)) {
                  setEsTraslado(true);
              } else {
                  setEsTraslado(false);
              }
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
    if (estudiante && todasLasMatriculas.length > 0) {
      const historicas = todasLasMatriculas.filter(m => m.estudiante_rut === estudiante.run);
      
      if (historicas.length > 0) {
        historicas.sort((a, b) => b.anio_escolar - a.anio_escolar); 
        const ultima = historicas[0];

        setCursoPrevio(ultima.curso);
        setCodigoPrevio(ultima.cod_tipo_ensenanza ? Number(ultima.cod_tipo_ensenanza) : null);

        if (!huboPrecarga) {
          setFormulario(prev => ({
            ...prev,
            cod_tipo_ensenanza: ultima.cod_tipo_ensenanza ? String(ultima.cod_tipo_ensenanza) : prev.cod_tipo_ensenanza,
            cursoSeleccionado: ultima.curso
          }));
          setHuboPrecarga(true);
        }
      } else {
        setCursoPrevio('');
        setCodigoPrevio(null);
        setHuboPrecarga(false);
      }
    }
  }, [estudiante, todasLasMatriculas, huboPrecarga]);

  const seleccionarEstudiante = async (est: any) => {
    setRutBusqueda(est.run);
    setMostrarSugerencias(false);
    setCargando(true);
    setError('');
    setHuboPrecarga(false);
    
    try {
      const token = localStorage.getItem('token');
      const respuesta = await fetch(`${API_URL}/estudiante/${est.run}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!respuesta.ok) throw new Error('Estudiante no encontrado en el sistema.');
      
      const datos = await respuesta.json();
      await procesarEstudiante(datos, est.run);
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
      
      const respuesta = await fetch(`${API_URL}/estudiante/${estudiante.run}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(formFaltantes) 
      });

      if (!respuesta.ok) throw new Error('Error al guardar la informaciÃ³n');
      
      const timestamp = new Date().getTime();
      const refreshRes = await fetch(`${API_URL}/estudiante/${estudiante.run}?t=${timestamp}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store' 
      });
      
      const datosNuevos = await refreshRes.json();
      await procesarEstudiante(datosNuevos, estudiante.run); 
      setModalFaltantes(false);
      
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGuardandoFaltantes(false);
    }
  };

  const copiarDomicilio = () => {
    setFormFaltantes(prev => ({ ...prev, domicilio_apoderado: prev.domicilio_estudiante }));
  };

  const colegioSeleccionadoObj = establecimientosDb.find(e => String(e.id_establecimiento) === String(formulario.id_establecimiento));
  const esColegioEMTP = colegioSeleccionadoObj && ['1518', '1519', '1525'].includes(String(colegioSeleccionadoObj.rbd));

  const nombreCurso = formulario.cursoSeleccionado.toLowerCase();
  const esCuartoMedio = nombreCurso.includes('4') && nombreCurso.includes('medio');

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
      const respuesta = await fetch(`${API_URL}/documentos/comprobante/${estudiante.run}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!respuesta.ok) throw new Error('Error al generar el documento en el servidor');

      const blob = await respuesta.blob();
      const url = window.URL.createObjectURL(blob);
      
      const linkDescarga = document.createElement('a');
      linkDescarga.href = url;
      linkDescarga.download = `Comprobante_Ingreso_${estudiante.run}.pdf`;
      document.body.appendChild(linkDescarga);
      linkDescarga.click();
      
      linkDescarga.remove();
      window.URL.revokeObjectURL(url);
      
    } catch (err: any) {
      alert("Hubo un error al descargar el comprobante: " + err.message);
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estudiante || datosFaltantes.length > 0) return;

    setCargando(true);
    setError('');

    const payload = {
      numero_correlativo: 0,
      anio_escolar: parseInt(formulario.anio_escolar),
      id_estudiante: estudiante.id,
      id_establecimiento: parseInt(formulario.id_establecimiento),
      fecha_matricula: formulario.fecha_matricula,
      nivel_ensenanza: formulario.nivel_ensenanza,
      curso: formulario.cursoSeleccionado,
      estado: 'Activa',
      fecha_retiro: null,
      motivo_retiro: null,
      observaciones: 'MatrÃ­cula ingresada desde portal transaccional.',
      id_usuario_ejecutor: 1,
      cod_tipo_ensenanza: formulario.cod_tipo_ensenanza ? parseInt(formulario.cod_tipo_ensenanza) : null,
      cod_grado: formulario.cod_grado,
      letra_curso: formulario.letra_curso,
      es_excedente: formulario.es_excedente,
      numero_resolucion_excedente: formulario.numero_resolucion_excedente || null,
      fecha_resolucion_excedente: formulario.fecha_resolucion_excedente || null,
      es_alumno_practica: formulario.es_alumno_practica
    };

    const token = localStorage.getItem('token');

    try {
      const respuesta = await fetch(`${API_URL}/matriculas`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });

      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.detail || 'Error al guardar la matrÃ­cula.');
      
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

    if (numPrevioMatch && numDestinoMatch) {
      const numPrevio = parseInt(numPrevioMatch[0]);
      const numDestino = parseInt(numDestinoMatch[0]);

      if (numDestino === numPrevio + 1) {
        alertas.push({texto: `PromociÃ³n: El estudiante avanza al curso siguiente (de ${numPrevio} a ${numDestino}).`, tipo: 'info'});
      } else if (numDestino === numPrevio) {
        alertas.push({texto: `Repitencia: El estudiante mantiene el mismo nivel cursado (${numPrevio}).`, tipo: 'alerta'});
      } else if (numDestino < numPrevio) {
        alertas.push({texto: `Retroceso abrupto: EstÃ¡ matriculando al estudiante en un grado INFERIOR al que ya cursÃ³ (de ${numPrevio} a ${numDestino}).`, tipo: 'peligro'});
      } else if (numDestino > numPrevio + 1) {
        alertas.push({texto: `Salto abrupto: EstÃ¡ adelantando al estudiante mÃºltiples grados (de ${numPrevio} a ${numDestino}).`, tipo: 'peligro'});
      }
    } else {
      const basePrevio = cursoPrevio.replace(/\s*[A-Z]\s*$/i, '').trim().toLowerCase();
      const baseDestino = formulario.cursoSeleccionado.replace(/\s*[A-Z]\s*$/i, '').trim().toLowerCase();
      
      if (basePrevio === baseDestino) {
        alertas.push({texto: `Repitencia: El estudiante se mantiene en el nivel '${cursoPrevio}'.`, tipo: 'alerta'});
      } else {
        alertas.push({texto: `TransiciÃ³n de nivel preescolar: de '${cursoPrevio}' a '${formulario.cursoSeleccionado}'.`, tipo: 'info'});
      }
    }

    setAlertasTransicion(alertas);
  }, [formulario.cursoSeleccionado, formulario.cod_tipo_ensenanza, cursoPrevio, codigoPrevio, estudiante]);

  return {
    navigate, cargando, error, rutBusqueda, setRutBusqueda, estudiante, setEstudiante,
    sugerencias, mostrarSugerencias, setMostrarSugerencias, huboPrecarga, setHuboPrecarga,
    alertasTransicion, setAlertasTransicion, datosFaltantes, setDatosFaltantes,
    modalFaltantes, setModalFaltantes, esPerfilColegio, matriculaExitosa, setMatriculaExitosa,
    formFaltantes, setFormFaltantes, colegioProcedencia, esTraslado, guardandoFaltantes,
    establecimientosDb, formulario, checkCertNotas, setCheckCertNotas, checkCertRetiro, setCheckCertRetiro,
    idEstablecimientoPrevio, codigosDisponibles, cursosDisponibles, 
    seleccionarCurso, handleEscribirBuscador, seleccionarEstudiante, guardarDatosFaltantes, copiarDomicilio, handleChange, generarComprobantePDF, handleSubmit, setCursoPrevio, setCodigoPrevio, setIdEstablecimientoPrevio,
    esColegioEMTP, esCuartoMedio, cuposOcupados, limiteCupos // 🌟 Añadido al return
  };
};