import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { API_BASE_URL } from '../../../config/api';

export const useInicio2 = () => {
  const [estadisticas, setEstadisticas] = useState({
    anios_disponibles: [] as number[],
    total_activos: 0,
    total_inactivos: 0,    // 🌟 El total general de retiros
    por_nivel: [],
    por_curso: [],         // 🌟 Desglose de alumnos activos
    por_curso_retiros: [], // 🌟 NUEVO: Desglose de alumnos retirados/inactivos
    historico: [] as any[],
    // KPIs del proceso de renovación (piloto)
    renovacion: {
      activa: false,
      por_renovar: 0,
      pendiente_firma: 0,
      firmada: 0,
      no_renueva: 0,
      egresado: 0,
      total_a_renovar: 0,
      avance_pct: 0,
    },
    calidad_dato: {
      total: 0,
      con_apoderado: 0,
      sin_apoderado: 0,
      pct_con_apoderado: 0,
    },
  });
  
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [anioSeleccionado, setAnioSeleccionado] = useState('');
  const { colegioSeleccionado } = useOutletContext<{ colegioSeleccionado: string }>();

  useEffect(() => {
    const token = localStorage.getItem('token');
    setCargando(true); 

    let url = `${API_BASE_URL}/dashboard/estadisticas?`;
    const params = new URLSearchParams();
    if (colegioSeleccionado) params.append('establecimiento_id', colegioSeleccionado);
    if (anioSeleccionado) params.append('anio', anioSeleccionado);
    
    url += params.toString();

    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      }
    })
      .then(res => {
        if (res.status === 401) throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
        if (!res.ok) throw new Error('Error al cargar métricas');
        return res.json();
      })
      .then(data => {
        // 🌟 La data que viene del backend ahora llenará automáticamente 
        // total_inactivos y por_curso_retiros si tu backend los envía.
        setEstadisticas(data); 
        setCargando(false);
      })
      .catch(err => {
        setError(err.message);
        setCargando(false);
      });
  }, [colegioSeleccionado, anioSeleccionado]); 

  return {
    estadisticas,
    cargando,
    error,
    anioSeleccionado,
    setAnioSeleccionado
  };
};