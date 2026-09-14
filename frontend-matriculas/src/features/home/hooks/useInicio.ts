import { useState, useEffect } from 'react';

export const useInicio = () => {
  const [usuario, setUsuario] = useState<any>(null);

  useEffect(() => {
    const usuarioString = localStorage.getItem('usuario');
    if (usuarioString) {
      setUsuario(JSON.parse(usuarioString));
    }
  }, []);

  // 🌟 CAMBIO AQUÍ: Validación estricta solo para administradores SLEP
  const puedeVerAuditoria = ['admin_slep', 'SLEP'].includes(usuario?.rol);

  return {
    usuario,
    puedeVerAuditoria
  };
};