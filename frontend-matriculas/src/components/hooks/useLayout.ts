import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config/api';
import { esSlep, puedeVerPestana } from '../../config/roles';

export interface Establecimiento {
  id_establecimiento: number;
  rbd: string;
  nombre: string;
}

export const useLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const usuarioString = localStorage.getItem('usuario');
  const usuario = usuarioString ? JSON.parse(usuarioString) : null;

  const esPerfilGlobal = esSlep(usuario?.rol);
  // Qué pestañas ve este rol (catálogo central en config/roles.ts)
  const puedeVerPanel = puedeVerPestana(usuario?.rol, 'panel');
  const puedeVerAsistencia = puedeVerPestana(usuario?.rol, 'asistencia');
  const puedeVerAuditoria = puedeVerPestana(usuario?.rol, 'auditoria');
  const [colegioSeleccionado, setColegioSeleccionado] = useState<string>(
    !esPerfilGlobal ? String(usuario?.id_establecimiento) : ''
  );
  const [busquedaFiltro, setBusquedaFiltro] = useState('');
  const [mostrarDropdownFiltro, setMostrarDropdownFiltro] = useState(false);
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_BASE_URL}/establecimientos`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          const dataOrdenada = data.sort((a: Establecimiento, b: Establecimiento) => parseInt(a.rbd) - parseInt(b.rbd));
          setEstablecimientos(dataOrdenada);
        })
        .catch(err => console.error(err));
    }
  }, []);

  useEffect(() => {
    if (colegioSeleccionado === '') {
      setBusquedaFiltro('🌍 Ver todos los Establecimientos (Nivel Central)');
    } else {
      const col = establecimientos.find(e => String(e.id_establecimiento) === String(colegioSeleccionado));
      if (col) setBusquedaFiltro(`RBD: ${col.rbd} - ${col.nombre}`);
    }
  }, [colegioSeleccionado, establecimientos]);

  const cerrarSesion = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    navigate('/login');
  };
  
  const isActive = (path: string) => location.pathname === path;
  const colegioActual = establecimientos.find(e => e.id_establecimiento.toString() === colegioSeleccionado);

  return {
    usuario,
    esPerfilGlobal,
    puedeVerPanel,
    puedeVerAsistencia,
    puedeVerAuditoria,
    colegioSeleccionado, setColegioSeleccionado,
    busquedaFiltro, setBusquedaFiltro,
    mostrarDropdownFiltro, setMostrarDropdownFiltro,
    establecimientos,
    cerrarSesion,
    isActive,
    colegioActual
  };
};