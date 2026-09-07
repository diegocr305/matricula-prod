import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { API_URL } from '../../../config/api';

// ðŸŒŸ INTERFAZ: Le decimos a TypeScript exactamente quÃ© campos tiene nuestro formulario
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
  run_apoderado: string;
  nombres_apoderado: string;
  apellido_paterno_apoderado: string;
  apellido_materno_apoderado: string;
  domicilio_apoderado: string;
  telefono_apoderado: string;
  correo_apoderado: string;
  // Campos Migrantes Opcionales
  pais_origen_estudiante?: string;
  doc_extranjero_estudiante?: string;
  pais_origen_apoderado?: string;
  doc_extranjero_apoderado?: string;
}

export const formatearRUT = (rut: string) => {
  const actual = rut.replace(/^0+/, "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (actual.length <= 1) return actual;
  const cuerpo = actual.slice(0, -1);
  const dv = actual.slice(-1);
  return `${cuerpo}-${dv}`;
};

export const validarRUT = (rutCompleto: string) => {
  if (!/^[0-9]+[-|â€]{1}[0-9kK]{1}$/.test(rutCompleto)) return false;
  
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

export const useEstudiantes = () => {
  const { colegioSeleccionado } = useOutletContext<{ colegioSeleccionado: string }>();
  const navigate = useNavigate();

  const usuarioString = localStorage.getItem('usuario');
  const usuario = usuarioString ? JSON.parse(usuarioString) : null;
  const puedeEditar = !['Visualizador_SLEP', 'Visualizador_Colegio'].includes(usuario?.rol);

  const [listaEstudiantes, setListaEstudiantes] = useState<any[]>([]);
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [cargandoLista, setCargandoLista] = useState(true);

  const [datosEstudiante, setDatosEstudiante] = useState<any>(null);
  const [cargandoFicha, setCargandoFicha] = useState(false);
  const [error, setError] = useState('');

  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  
  const [estudianteCreadoExito, setEstudianteCreadoExito] = useState(false);
  const [rutRecienCreado, setRutRecienCreado] = useState('');

  // ðŸŒŸ ESTADO INICIAL: Agregamos los campos de extranjerÃ­a
  const [nuevoEstudiante, setNuevoEstudiante] = useState<NuevoEstudianteForm>({
    run: '', nombres: '', apellido_paterno: '', apellido_materno: '', fecha_nacimiento: '', sexo: 'Masculino', domicilio: '', latitud:'', longitud:'',
    run_apoderado: '', nombres_apoderado: '', apellido_paterno_apoderado: '', apellido_materno_apoderado: '', domicilio_apoderado: '', telefono_apoderado: '', correo_apoderado: '',
    pais_origen_estudiante: '', doc_extranjero_estudiante: '',
    pais_origen_apoderado: '', doc_extranjero_apoderado: ''
  });

  const [modoEdicion, setModoEdicion] = useState(false);
  const [datosEdicion, setDatosEdicion] = useState<any>({});
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  
  const [buscandoMapa, setBuscandoMapa] = useState(false);
  const [sugerenciasMapa, setSugerenciasMapa] = useState<any[]>([]);

  const cargarDirectorio = () => {
    setCargandoLista(true);
    const token = localStorage.getItem('token'); 

    const url = colegioSeleccionado 
      ? `${API_URL}/estudiante?establecimiento_id=${colegioSeleccionado}`
      : `${API_URL}/estudiante`;

    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      }
    })
      .then(res => res.json())
      .then(datos => {
        setListaEstudiantes(datos);
        setCargandoLista(false);
      })
      .catch(err => {
        console.error(err);
        setCargandoLista(false);
      });
  };

  useEffect(() => {
    cargarDirectorio();
  }, [colegioSeleccionado]); 

  const manejarSubidaCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    if (!archivo.name.endsWith('.csv') && !archivo.name.endsWith('.xls') && !archivo.name.endsWith('.xlsx')) {
      alert("Por favor, selecciona un archivo en formato .csv, .xls o .xlsx");
      return;
    }

    setSubiendoArchivo(true);
    const formData = new FormData();
    formData.append("archivo", archivo);
    const token = localStorage.getItem('token');

    try {
      const respuesta = await fetch(`${API_URL}/estudiante/carga-masiva`, {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}` 
        },
        body: formData,
      });

      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.detail || "Error al subir el archivo");
      
      alert(datos.mensaje); 
      cargarDirectorio();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setSubiendoArchivo(false);
      e.target.value = ''; 
    }
  };

  const estudiantesFiltrados = listaEstudiantes.filter(est => 
    est.nombre_completo.toLowerCase().includes(textoBusqueda.toLowerCase()) ||
    est.run.includes(textoBusqueda)
  );

  const verFichaEstudiante = async (rut: string) => {
    setCargandoFicha(true);
    setError('');
    setModoEdicion(false); 
    const token = localStorage.getItem('token');
    
    try {
      const respuesta = await fetch(`${API_URL}/estudiante/${rut}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!respuesta.ok) throw new Error('Error al cargar la ficha');
      const datos = await respuesta.json();
      setDatosEstudiante(datos);
      
      setDatosEdicion({
        // Nombres de campos alineados con el backend (ActualizarEstudianteRequest)
        domicilio_estudiante: datos.personal.domicilio && datos.personal.domicilio !== 'Sin registrar' ? datos.personal.domicilio : '',
        rut_apoderado: datos.apoderado.rut_raw || '',
        nombres_apoderado: datos.apoderado.nombres || '',
        apellido_paterno_apoderado: datos.apoderado.apellido_paterno || '',
        apellido_materno_apoderado: datos.apoderado.apellido_materno || '',
        domicilio_apoderado: '',
        telefono_apoderado: datos.apoderado.telefono_raw || '',
        correo_apoderado: datos.apoderado.correo_raw || ''
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargandoFicha(false);
    }
  };

  const handleGuardarEdicion = async () => {
    // Validación del RUT del apoderado (si se ingresó). Aceptamos IPA/pasaporte
    // extranjero (>=10 caracteres alfanuméricos) igual que en la creación.
    const rutApod = (datosEdicion.rut_apoderado || '').trim();
    if (rutApod) {
      const esIpaApoderado = rutApod.replace(/[^0-9kK]/g, '').length >= 10;
      if (!esIpaApoderado && !validarRUT(rutApod)) {
        alert('⚠️ El RUT del Apoderado no es válido. Revisa el dígito verificador (formato 12345678-9).');
        return;
      }
      // Si hay RUT, exigimos al menos el nombre para no crear apoderados vacíos.
      if (!(datosEdicion.nombres_apoderado || '').trim()) {
        alert('⚠️ Ingresa al menos el nombre del apoderado.');
        return;
      }
    }

    setGuardandoEdicion(true);
    const token = localStorage.getItem('token');

    try {
      const respuesta = await fetch(`${API_URL}/estudiante/${datosEstudiante.personal.run}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(datosEdicion),
      });

      if (!respuesta.ok) throw new Error('Error al actualizar los datos');

      await verFichaEstudiante(datosEstudiante.personal.run);
      setModoEdicion(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGuardandoEdicion(false);
    }
  };
  
  const buscarSugerencias = async () => {
    if (!nuevoEstudiante.domicilio) {
      alert("Primero escribe una calle o sector para buscar.");
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
        alert("No se encontraron resultados en Chile. Intenta agregar la comuna, ej: 'Avenida Brasil, ValparaÃ­so'.");
      }
    } catch (error) {
      console.error("Error al buscar coordenadas:", error);
      alert("Hubo un error al conectar con el mapa.");
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

  // ðŸŒŸ VALIDACIÃ“N INTELIGENTE: Detecta el IPE e ignora la validaciÃ³n RUT tradicional
  const handleCrearEstudiante = async (e: React.FormEvent) => {
    e.preventDefault();

    const esIpeEstudiante = nuevoEstudiante.run.replace(/[^0-9kK]/g, '').length >= 10;
    const esIpaApoderado = nuevoEstudiante.run_apoderado.replace(/[^0-9kK]/g, '').length >= 10;

    // Validaciones Estudiante
    if (!esIpeEstudiante && !validarRUT(nuevoEstudiante.run)) {
      alert("âš ï¸ El RUT del Estudiante no es vÃ¡lido. Revisa que el dÃ­gito verificador sea correcto.");
      return;
    }
    if (esIpeEstudiante && (!nuevoEstudiante.pais_origen_estudiante || !nuevoEstudiante.doc_extranjero_estudiante)) {
      alert("âš ï¸ El estudiante tiene un IPE. Debes ingresar obligatoriamente su PaÃ­s de Origen y Documento Nacional.");
      return;
    }

    // Validaciones Apoderado
    if (!esIpaApoderado && !validarRUT(nuevoEstudiante.run_apoderado)) {
      alert("âš ï¸ El RUT del Apoderado no es vÃ¡lido. Revisa que el dÃ­gito verificador sea correcto.");
      return;
    }
    if (esIpaApoderado && (!nuevoEstudiante.pais_origen_apoderado || !nuevoEstudiante.doc_extranjero_apoderado)) {
      alert("âš ï¸ El apoderado tiene un IPA. Debes ingresar obligatoriamente su PaÃ­s de Origen y Documento Nacional.");
      return;
    }

    if (!nuevoEstudiante.latitud || !nuevoEstudiante.longitud) {
      alert("âš ï¸ AcciÃ³n requerida: Debes validar el Domicilio Actual usando el botÃ³n 'Buscar' antes de crear al estudiante.");
      return;
    }

    setCreando(true);
    const token = localStorage.getItem('token');

    try {
      const respuesta = await fetch(`${API_URL}/estudiante`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(nuevoEstudiante),
      });
      if (!respuesta.ok) throw new Error('Error al guardar. Verifica que el RUT/IPE no estÃ© duplicado en la base de datos.');
      
      setRutRecienCreado(nuevoEstudiante.run);
      setEstudianteCreadoExito(true);
      cargarDirectorio();

      // Resetear estado completo
      setNuevoEstudiante({ 
        run: '', nombres: '', apellido_paterno: '', apellido_materno: '', fecha_nacimiento: '', sexo: 'Masculino', 
        domicilio: '', latitud:'', longitud:'', 
        run_apoderado: '', nombres_apoderado: '', apellido_paterno_apoderado: '', apellido_materno_apoderado: '', 
        domicilio_apoderado: '', telefono_apoderado: '', correo_apoderado: '',
        pais_origen_estudiante: '', doc_extranjero_estudiante: '',
        pais_origen_apoderado: '', doc_extranjero_apoderado: ''
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreando(false);
    }
  };

  const irAMatricular = () => {
    setModalNuevoAbierto(false);
    setEstudianteCreadoExito(false);
    navigate('/matriculas/nueva', { state: { rutPreseleccionado: rutRecienCreado } });
  };

  const cerrarModalExito = () => {
    setModalNuevoAbierto(false);
    setEstudianteCreadoExito(false);
  };

  return {
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
  };
};