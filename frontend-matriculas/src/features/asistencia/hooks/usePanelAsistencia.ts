import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { API_BASE_URL } from '../../../config/api';

export interface ResumenAsistencia {
  anio: number;
  umbral: number;
  kpis: { alumnos: number; pct_promedio: number; por_validar: number };
  semaforo: { revisar: number; rojo: number; amarillo: number; verde: number };
  tendencia: { mes: number; glosa: string; pct: number }[];
  variacion: {
    mes_actual: string; mes_anterior: string;
    pct_actual: number; pct_anterior: number; delta_pp: number;
  } | null;
  ranking: { id_establecimiento: number; nombre: string; alumnos: number; pct: number }[];
}

const VACIO: ResumenAsistencia = {
  anio: 0, umbral: 0.85,
  kpis: { alumnos: 0, pct_promedio: 0, por_validar: 0 },
  semaforo: { revisar: 0, rojo: 0, amarillo: 0, verde: 0 },
  tendencia: [], variacion: null, ranking: [],
};

export const usePanelAsistencia = () => {
  const [data, setData] = useState<ResumenAsistencia>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const { colegioSeleccionado } = useOutletContext<{ colegioSeleccionado: string }>();

  useEffect(() => {
    const token = localStorage.getItem('token');
    setCargando(true);
    setError('');

    const params = new URLSearchParams();
    if (colegioSeleccionado) params.append('establecimiento_id', colegioSeleccionado);
    const url = `${API_BASE_URL}/asistencia/resumen?${params.toString()}`;

    fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) throw new Error('Sesión expirada. Inicia sesión nuevamente.');
        if (!res.ok) throw new Error('No se pudo cargar el panel de asistencia.');
        return res.json();
      })
      .then((d) => { setData(d); setCargando(false); })
      .catch((err) => { setError(err.message); setCargando(false); });
  }, [colegioSeleccionado]);

  return { data, cargando, error };
};
