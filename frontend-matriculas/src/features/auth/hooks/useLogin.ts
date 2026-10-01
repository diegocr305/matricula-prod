import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../../config/api';

export const useLogin = () => {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mensajeExpiracion, setMensajeExpiracion] = useState('');
  const [rol, setRol] = useState('COLEGIO');
  const [cargando, setCargando] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get('motivo') === 'expirado') {
      setMensajeExpiracion(
        'Su sesión ha expirado por límite de tiempo o inactividad. Por favor, vuelva a iniciar sesión para continuar.'
      );
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMensajeExpiracion('');
    setCargando(true);

    try {
      const respuesta = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rol })
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) throw new Error(datos.detail || 'Error al iniciar sesión');

      localStorage.setItem('token', datos.access_token);
      localStorage.setItem('usuario', JSON.stringify(datos.usuario));
      navigate('/');
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setError('');
    setMensajeExpiracion('');
    setCargando(true);

    try {
      // El rol lo determina el backend según el correo; no se envía desde aquí.
      const respuesta = await fetch(`${API_BASE_URL}/login/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential })
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) throw new Error(datos.detail || 'Error al iniciar sesión con Google');

      localStorage.setItem('token', datos.access_token);
      localStorage.setItem('usuario', JSON.stringify(datos.usuario));
      navigate('/');
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return {
    email, setEmail,
    password, setPassword,
    error, setError,
    mensajeExpiracion, setMensajeExpiracion,
    rol, setRol,
    cargando,
    handleLogin,
    handleGoogleSuccess
  };
};