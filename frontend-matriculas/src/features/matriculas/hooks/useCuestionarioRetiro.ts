import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_URL } from '../../../config/api';

export const useCuestionarioRetiro = () => {
  const { id } = useParams(); 
  
  const [rutEstudiante, setRutEstudiante] = useState('');
  const [motivo, setMotivo] = useState('');
  const [estado, setEstado] = useState<'formulario' | 'cargando' | 'exito' | 'error'>('formulario');
  const [mensajeError, setMensajeError] = useState('');

  const enviarCuestionario = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado('cargando');
    
    try {
      const respuesta = await fetch(`${API_URL}/matriculas/${id}/cuestionario`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rut_estudiante: rutEstudiante, 
          motivo_real: motivo 
        }),
      });

      if (!respuesta.ok) {
        const err = await respuesta.json();
        throw new Error(err.detail || 'Error de connection con el servidor.');
      }
      
      setEstado('exito');
    } catch (err: any) {
      setMensajeError(err.message);
      setEstado('error');
    }
  };

  return {
    rutEstudiante, setRutEstudiante,
    motivo, setMotivo,
    estado,
    mensajeError,
    enviarCuestionario
  };
};