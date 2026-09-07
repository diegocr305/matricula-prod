import React, { useState } from 'react';
import { API_URL } from '../../../config/api';

export const useVerificador = () => {
  const [rut, setRut] = useState('');
  const [codigo, setCodigo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manejarVerificacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError(null);

    try {
      // Como es pÃºblico, no enviamos token de Authorization
      const respuesta = await fetch(`${API_URL}/documentos/verificar?rut=${rut}&codigo=${codigo}`);
      
      if (!respuesta.ok) {
        const data = await respuesta.json();
        throw new Error(data.detail || 'OcurriÃ³ un error al verificar el documento.');
      }

      // Si es exitoso, el backend nos devuelve el PDF en crudo. Lo abrimos.
      const blob = await respuesta.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return {
    rut, setRut,
    codigo, setCodigo,
    cargando,
    error,
    manejarVerificacion
  };
};