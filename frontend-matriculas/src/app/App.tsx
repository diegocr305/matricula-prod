import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from '../features/auth/Login';
import HomeMenu from '../features/home/NuevoInicio';
import Estadisticas from '../features/dashboard/Inicio';
import Estudiantes from '../features/estudiantes/Estudiantes';
import Matriculas from '../features/matriculas/Matriculas';
import NuevaMatricula from '../features/matriculas/NuevaMatricula';
import ConfirmarRenovacion from '../features/matriculas/ConfirmarRenovacion';
import CuestionarioRetiro from '../features/matriculas/CuestionarioRetiro';
import Verificador from '../features/documentos/Verificador';
import Auditoria from '../features/auditoria/Auditoria';
import PanelAsistencia from '../features/asistencia/PanelAsistencia';
import Layout from '../components/Layout';
import EncuestaCambioCurso from '../features/matriculas/CuestionarioCambio';
import PortalFirmaApoderado from '../features/matriculas/PortalFirmaAPoderado';
import { ToastProvider } from '../components/Toast';
import { esTokenExpirado, obtenerTiempoRestanteMs, cerrarSesionPorExpiracion } from '../utils/auth';

// ============================================================================
// COMPONENTE GUARDIÁN (Protección de Rutas y Expiración de Token)
// ============================================================================
const RutaProtegida = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Si el token ya venció, limpiar almacenamiento y expulsar con aviso
  if (esTokenExpirado(token)) {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    return <Navigate to="/login?motivo=expirado" replace />;
  }

  // Temporizador proactivo: Si el usuario permanece inactivo en la vista,
  // se cierra la sesión en el instante exacto en que expira el token
  useEffect(() => {
    const tiempoRestante = obtenerTiempoRestanteMs(token);
    if (tiempoRestante <= 0) {
      cerrarSesionPorExpiracion();
      return;
    }

    const timer = setTimeout(() => {
      cerrarSesionPorExpiracion();
    }, tiempoRestante);

    return () => clearTimeout(timer);
  }, [token]);
  
  return <>{children}</>;
};

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
        
        {/* 1. RUTA PÚBLICA (La única que se puede ver sin iniciar sesión) */}
        <Route path="/login" element={<Login />} />
        <Route path="/encuesta-retiro/:id" element={<CuestionarioRetiro />} />
        <Route path="/encuesta-cambio-curso/:id" element={<EncuestaCambioCurso />} />
        <Route path="/firma-prueba" element={<PortalFirmaApoderado />} /> 
        <Route path="/autorizacion/:token" element={<PortalFirmaApoderado />} />

        {/* 2. RUTAS PRIVADAS (Protegidas por el Guardián) */}
        <Route 
          path="/" 
          element={
            <RutaProtegida>
              <Layout />
            </RutaProtegida>
          }
        >
          {/* Todas estas rutas hijas heredan la protección del Layout */}
          
          <Route index element={<HomeMenu />} />
          <Route path="inicio" element={<Estadisticas/>} />
          <Route path="/verificar" element={<Verificador />} />
          <Route path="matriculas" element={<Matriculas />} />
          <Route path="matriculas/nueva" element={<NuevaMatricula />} />
          <Route path="matriculas/confirmar-renovacion/:idMatricula" element={<ConfirmarRenovacion />} />
          <Route path="estudiantes" element={<Estudiantes />} />
          <Route path="asistencia" element={<PanelAsistencia />} />
          <Route path="auditoria" element={<Auditoria />} />
          
        </Route>

      </Routes>
    </BrowserRouter>
  </ToastProvider>
);
}