import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_URL } from '../../../config/api';

export const useCuestionarioRetiro = () => {
  const { id } = useParams(); 
  
  const [rutEstudiante, setRutEstudiante] = useState('');
  const [motivosSeleccionados, setMotivosSeleccionados] = useState<string[]>([]);
  const [motivoDetalle, setMotivoDetalle] = useState('');
  const [estado, setEstado] = useState<'formulario' | 'cargando' | 'exito' | 'error'>('formulario');
  const [mensajeError, setMensajeError] = useState('');

  const alternarMotivo = (motivo: string) => {
    setMotivosSeleccionados((prev) => 
      prev.includes(motivo) ? prev.filter((m) => m !== motivo) : [...prev, motivo]
    );
  };

  const enviarCuestionario = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado('cargando');
    
    const motivosFormateados = motivosSeleccionados.map((m) => `• ${m}`).join('\n');
    const textoConsolidado = `[Motivos de Retiro]:\n${motivosFormateados}\n\n[Detalles Adicionales]: ${motivoDetalle.trim() || 'Sin comentarios adicionales.'}`;

    try {
      const respuesta = await fetch(`${API_URL}/matriculas/${id}/cuestionario`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rut_estudiante: rutEstudiante, 
          motivo_real: textoConsolidado 
        }),
      });

      if (!respuesta.ok) {
        const err = await respuesta.json();
        throw new Error(err.detail || 'Error de conexión con el servidor.');
      }
      
      setEstado('exito');
    } catch (err: any) {
      setMensajeError(err.message);
      setEstado('error');
    }
  };

  return {
    rutEstudiante, setRutEstudiante,
    motivosSeleccionados, alternarMotivo,
    motivoDetalle, setMotivoDetalle,
    estado,
    mensajeError,
    enviarCuestionario
  };
};