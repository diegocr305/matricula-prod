import React from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Users, Activity, PieChart, ArrowRight } from 'lucide-react';
import { useInicio } from './hooks/useInicio';

export default function Inicio() {
  const { usuario, puedeVerAuditoria } = useInicio();

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* MENSAJE DE BIENVENIDA */}
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-red-600">
        <h1 className="text-3xl font-extrabold text-blue-950 mb-2">
          Bienvenido, {usuario ? usuario.nombre : 'Funcionario'}
        </h1>
        <p className="text-gray-600 text-lg">
          Sistema Oficial de Registro General de Matrículas (RGM) - SLEP Valparaíso. 
          <br className="hidden sm:block" /> ¿Qué acción desea realizar en la plataforma?
        </p>
      </div>

      {/* 🌟 GRID DINÁMICO: 4 columnas si es admin, 3 columnas si es colegio */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${puedeVerAuditoria ? 'lg:grid-cols-4' : 'lg:grid-cols-3 max-w-5xl mx-auto'}`}>

        {/* 1. BOTÓN MATRÍCULAS */}
        <Link to="/matriculas" className="group bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-900 hover:shadow-lg transition-all flex flex-col overflow-hidden">
          <div className="p-6 flex-1">
            <div className="w-14 h-14 bg-blue-50 text-blue-900 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <FolderOpen size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-3">Gestión de Matrículas</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Inscriba nuevos alumnos, registre retiros oficiales, procese traslados de curso y emita certificados institucionales en formato PDF.
            </p>
          </div>
          <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-between items-center text-blue-800 font-bold text-sm group-hover:bg-blue-900 group-hover:text-white transition-colors">
            <span>Ir a Matrículas</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* 2. BOTÓN ESTUDIANTES */}
        <Link to="/estudiantes" className="group bg-white rounded-xl shadow-sm border border-gray-200 hover:border-emerald-600 hover:shadow-lg transition-all flex flex-col overflow-hidden">
          <div className="p-6 flex-1">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Users size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-3">Directorio de Estudiantes</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Consulte la base de datos de estudiantes, edite datos personales, actualice información de apoderados y revise el historial académico.
            </p>
          </div>
          <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-between items-center text-emerald-700 font-bold text-sm group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <span>Ir a Estudiantes</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* 3. BOTÓN DASHBOARD */}
        <Link to="/inicio" className="group bg-white rounded-xl shadow-sm border border-gray-200 hover:border-purple-600 hover:shadow-lg transition-all flex flex-col overflow-hidden">
          <div className="p-6 flex-1">
            <div className="w-14 h-14 bg-purple-50 text-purple-700 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <PieChart size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-3">Panel de Control General</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Visualice métricas, estadísticas, distribución de alumnos por nivel/curso y el balance total de matrículas activas vs retiros.
            </p>
          </div>
          <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-between items-center text-purple-700 font-bold text-sm group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <span>Ver Estadísticas</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* 4. BOTÓN AUDITORÍA (Oculto para colegios, visible para admin) */}
        {puedeVerAuditoria && (
          <Link to="/auditoria" className="group bg-white rounded-xl shadow-sm border border-gray-200 hover:border-orange-600 hover:shadow-lg transition-all flex flex-col overflow-hidden">
            <div className="p-6 flex-1">
              <div className="w-14 h-14 bg-orange-50 text-orange-700 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Activity size={32} />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-3">Trazabilidad y Auditoría</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Módulo exclusivo de administración. Revise la bitácora inmutable de movimientos, altas, bajas y modificaciones realizadas en el sistema.
              </p>
            </div>
            <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-between items-center text-orange-700 font-bold text-sm group-hover:bg-orange-600 group-hover:text-white transition-colors">
              <span>Ir a Trazabilidad</span>
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        )}

      </div>
    </div>
  );
}