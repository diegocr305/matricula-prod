import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_URL } from '../../config/api';

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

  const esPerfilGlobal = ['SLEP', 'admin_slep', 'Visualizador_SLEP'].includes(usuario?.rol);
  const puedeVerAuditoria = !['Colegio', 'Visualizador_Colegio'].includes(usuario?.rol);

  const [colegioSeleccionado, setColegioSeleccionado] = useState<string>(
    !esPerfilGlobal ? String(usuario?.id_establecimiento) : ''
  );
  const [busquedaFiltro, setBusquedaFiltro] = useState('');
  const [mostrarDropdownFiltro, setMostrarDropdownFiltro] = useState(false);
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_URL}/establecimientos`, { headers: { 'Authorization': `Bearer ${token}` } })
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
      setBusquedaFiltro('ðŸŒ Ver todos los Establecimientos (Nivel Central)');
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