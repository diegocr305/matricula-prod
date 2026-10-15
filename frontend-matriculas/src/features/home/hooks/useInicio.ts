import { useState, useEffect } from 'react';
import { puedeVerPestana } from '../../../config/roles';

export const useInicio = () => {
  const [usuario, setUsuario] = useState<any>(null);

  useEffect(() => {
    const usuarioString = localStorage.getItem('usuario');
    if (usuarioString) {
      setUsuario(JSON.parse(usuarioString));
    }
  }, []);

  // Visibilidad de tarjetas según el catálogo central de roles (config/roles.ts).
  const puedeVerPanel = puedeVerPestana(usuario?.rol, 'panel');
  const puedeVerAsistencia = puedeVerPestana(usuario?.rol, 'asistencia');
  const puedeVerAuditoria = puedeVerPestana(usuario?.rol, 'auditoria');

  return {
    usuario,
    puedeVerPanel,
    puedeVerAsistencia,
    puedeVerAuditoria,
  };
};
