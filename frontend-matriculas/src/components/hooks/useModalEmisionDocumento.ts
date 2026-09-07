import { useState, useEffect } from 'react';
import { API_URL } from '../../config/api';

export const useModalEmisionDocumento = (
  idMatricula: number,
  tipoDocumento: 'MATRICULA' | 'RETIRO' | 'CAMBIO_CURSO',
  emailApoderado?: string,
  onClose?: () => void
) => {
  const [enviarDirector, setEnviarDirector] = useState(false);
  const [correoDirector, setCorreoDirector] = useState('');

  const [enviarApoderado, setEnviarApoderado] = useState(false);
  const [correoApoderado, setCorreoApoderado] = useState('');
  
  const [cargando, setCargando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');
  const [mostrarVisor, setMostrarVisor] = useState(false);

  // Al abrir el modal, pre-rellenamos el correo del apoderado si viene de la base de datos
  useEffect(() => {
    if (emailApoderado) {
      setCorreoApoderado(emailApoderado);
    }
  }, [emailApoderado]);

  const getTitulo = () => {
    switch (tipoDocumento) {
      case 'MATRICULA': return 'Emitir Certificado de MatrÃ­cula';
      case 'RETIRO': return 'Emitir Comprobante de Retiro';
      case 'CAMBIO_CURSO': return 'Emitir Certificado de Cambio';
    }
  };

  const handleEnviarCorreos = async () => {
    // Recopilar los correos que estÃ©n chequeados y no estÃ©n vacÃ­os
    const destinatarios: string[] = [];
    if (enviarDirector && correoDirector.trim() !== '') destinatarios.push(correoDirector.trim());
    if (enviarApoderado && correoApoderado.trim() !== '') destinatarios.push(correoApoderado.trim());

    if (destinatarios.length === 0) {
      alert('Debe ingresar y marcar al menos un correo electrÃ³nico para realizar el envÃ­o.');
      return;
    }

    setCargando(true);
    const token = localStorage.getItem('token');
    
    try {
      const res = await fetch(`${API_URL}/documentos/emitir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id_matricula: idMatricula,
          tipo_documento: tipoDocumento,
          destinatarios: destinatarios 
        })
      });

      if (!res.ok) throw new Error('Error al enviar los documentos por correo');
      
      const data = await res.json();
      setMensajeExito(data.message);
      
      setTimeout(() => {
        setMensajeExito('');
        if (onClose) onClose();
      }, 2500);

    } catch (error: any) {
      alert(error.message);
    } finally {
      setCargando(false);
    }
  };

  const handleDescargarLocal = () => {
    window.open(`${API_URL}/matriculas/${idMatricula}/certificado?tipo=${tipoDocumento}`, '_blank');  
  };

  return {
    enviarDirector, setEnviarDirector,
    correoDirector, setCorreoDirector,
    enviarApoderado, setEnviarApoderado,
    correoApoderado, setCorreoApoderado,
    cargando,
    mensajeExito,
    mostrarVisor, setMostrarVisor,
    getTitulo,
    handleEnviarCorreos,
    handleDescargarLocal
  };
};