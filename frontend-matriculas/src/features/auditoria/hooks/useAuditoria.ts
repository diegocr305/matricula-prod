import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { API_URL } from '../../../config/api';

export interface RegistroAuditoria {
  id_auditoria: number;
  id_matricula: number;
  accion_db: string;
  tipo_movimiento: 'ALTA' | 'RETIRO' | 'CUESTIONARIO' | 'CAMBIO_CURSO' | 'ACTUALIZACION';
  detalle: string;
  fecha: string;
  id_usuario: number;
  nombre_ejecutor: string;
  datos_anteriores: any;
  datos_nuevos: any;
  id_establecimiento: number;
  nombre_establecimiento: string;
}

export const useAuditoria = () => {
  const { colegioSeleccionado } = useOutletContext<{ colegioSeleccionado: string }>();
  
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Estados de filtros
  const [tipoMovimientoFiltro, setTipoMovimientoFiltro] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  useEffect(() => {
    setCargando(true);
    setError('');
    const token = localStorage.getItem('token');

    const params = new URLSearchParams();
    if (colegioSeleccionado) params.append('establecimiento_id', colegioSeleccionado);
    if (tipoMovimientoFiltro) params.append('tipo_movimiento', tipoMovimientoFiltro);
    if (fechaInicio) params.append('fecha_inicio', fechaInicio);
    if (fechaFin) params.append('fecha_fin', fechaFin);

    const url = `${API_URL}/reportes/auditoria-matriculas?${params.toString()}`;

    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) throw new Error('Error al conectar con la bitÃ¡cora de auditorÃ­a.');
        return res.json();
      })
      .then(data => {
        setRegistros(data);
        setCargando(false);
      })
      .catch(err => {
        setError(err.message);
        setCargando(false);
      });
  }, [colegioSeleccionado, tipoMovimientoFiltro, fechaInicio, fechaFin]);

  return {
    registros,
    cargando,
    error,
    tipoMovimientoFiltro,
    setTipoMovimientoFiltro,
    fechaInicio,
    setFechaInicio,
    fechaFin,
    setFechaFin
  };
};