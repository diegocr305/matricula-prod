import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../../../config/api';

export const useLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [rol, setRol] = useState('COLEGIO');
  const [cargando, setCargando] = useState(false);
  
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      const respuesta = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rol })
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) throw new Error(datos.detail || 'Error al iniciar sesiÃ³n');

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
    setCargando(true);

    try {
      const respuesta = await fetch(`${API_URL}/login/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: credentialResponse.credential, 
          rol: rol 
        })
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) throw new Error(datos.detail || 'Error al iniciar sesiÃ³n con Google');

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
    rol, setRol,
    cargando,
    handleLogin,
    handleGoogleSuccess
  };
};