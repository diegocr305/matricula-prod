import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Home, FolderOpen, Users, LogOut, Activity, PieChart} from 'lucide-react';
import { useLayout } from './hooks/useLayout';

export default function Layout() {
  const {
    usuario,
    esPerfilGlobal,
    puedeVerAuditoria,
    colegioSeleccionado, setColegioSeleccionado,
    busquedaFiltro, setBusquedaFiltro,
    mostrarDropdownFiltro, setMostrarDropdownFiltro,
    establecimientos,
    cerrarSesion,
    isActive,
    colegioActual
  } = useLayout();

  return (
    <div className="flex flex-col h-screen bg-[#EDF0F5] font-['Museo_Sans',_sans-serif]">
      {/* 🌟 TIPOGRAFÍA SECUNDARIA BASE Y FONDO OFICIAL */}
      
      {/* HEADER PRINCIPAL (Color Texto Institucional como fondo) */}
      <header className="bg-[#25306B] text-white shrink-0 z-20 relative shadow-md">
        
        {/* 🌟 FRANJA SUPERIOR GOBIERNO DE CHILE */}
        <div className="absolute top-0 left-0 w-full h-1 flex">
          <div className="w-1/2 bg-[#006BB9]"></div>
          <div className="w-1/2 bg-[#FF1D3D]"></div>
        </div>

        <div className="px-9 h-28 flex items-center justify-between mt-1">
                
          {/* IZQUIERDA: Logo */}
          <Link to="/" className="flex items-center gap-3 group cursor-pointer focus:outline-none">
            <img 
              src="/images/logo_slep.png" 
              alt="Logo SLEP Valparaíso" 
              className="h-20 w-auto object-contain group-hover:opacity-90 transition-opacity" 
            />
          </Link>

          {/* CENTRO: Navegación Horizontal */}
          <nav className="hidden md:flex items-center gap-2">
            <Link to="/" className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium ${isActive('/') ? 'bg-[#006BB9] text-white shadow-inner border-b-2 border-[#FF1D3D]' : 'text-blue-200 hover:bg-[#006BB9] hover:text-white border-b-2 border-transparent'}`}>
              <Home size={18} /> Inicio
            </Link>
            <Link to="/matriculas" className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium ${isActive('/matriculas') ? 'bg-[#006BB9] text-white shadow-inner border-b-2 border-[#FF1D3D]' : 'text-blue-200 hover:bg-[#006BB9] hover:text-white border-b-2 border-transparent'}`}>
              <FolderOpen size={18} /> Matrículas
            </Link>
            <Link to="/estudiantes" className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium ${isActive('/estudiantes') ? 'bg-[#006BB9] text-white shadow-inner border-b-2 border-[#FF1D3D]' : 'text-blue-200 hover:bg-[#006BB9] hover:text-white border-b-2 border-transparent'}`}>
              <Users size={18} /> Estudiantes
            </Link>
             <Link to="/inicio" className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium ${isActive('/inicio') ? 'bg-[#006BB9] text-white shadow-inner border-b-2 border-[#FF1D3D]' : 'text-blue-200 hover:bg-[#006BB9] hover:text-white border-b-2 border-transparent'}`}>
              <PieChart size={18} /> Panel de Control
            </Link>

            {puedeVerAuditoria && (
              <Link to="/auditoria" className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium ${isActive('/auditoria') ? 'bg-[#006BB9] text-white shadow-inner border-b-2 border-[#FF1D3D]' : 'text-blue-200 hover:bg-[#006BB9] hover:text-white border-b-2 border-transparent'}`}>
               <Activity size={18} /> Trazabilidad & Auditoría
              </Link>
            )}
          </nav>

          {/* DERECHA: Usuario y Logout */}
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              {/* 🌟 TIPOGRAFÍA PRIMARIA PARA TITULARES */}
              <p className="text-sm font-bold text-white leading-tight font-['gobCL',_sans-serif]">
                {usuario ? usuario.nombre : 'Usuario Activo'}
              </p>
              <p className="text-[10px] text-blue-200 font-medium uppercase tracking-wide mt-0.5">
                Perfil: {usuario ? usuario.rol : 'Cargando...'}
              </p>
            </div>
            <button 
              onClick={cerrarSesion}
              className="text-blue-200 hover:text-white bg-[#006BB9] hover:bg-[#FF1D3D] p-2 rounded-full transition-all border border-transparent shadow-sm"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>

        </div>
      </header>

      {/* SUB-HEADER (Filtro de Colegio / Contexto) */}
      <div className="bg-white border-b border-gray-200 h-14 flex items-center px-6 shrink-0 shadow-sm z-10">
        {esPerfilGlobal ? (
          <div className="flex items-center gap-3 w-full max-w-3xl relative">
            <span className="text-xs font-bold text-[#25306B] uppercase font-['gobCL',_sans-serif]">Filtro Institucional:</span>
            
            <div className="relative flex-1">
              <input 
                type="text"
                value={busquedaFiltro}
                onChange={(e) => {
                  setBusquedaFiltro(e.target.value);
                  setMostrarDropdownFiltro(true);
                }}
                onFocus={() => {
                  setBusquedaFiltro(''); 
                  setMostrarDropdownFiltro(true);
                }}
                onBlur={() => {
                  setTimeout(() => {
                    setMostrarDropdownFiltro(false);
                    if (colegioSeleccionado === '') {
                      setBusquedaFiltro('🌍 Ver todos los Establecimientos (Nivel Central)');
                    } else {
                      const col = establecimientos.find(e => String(e.id_establecimiento) === String(colegioSeleccionado));
                      if (col) setBusquedaFiltro(`${col.nombre}`);
                    }
                  }, 200);
                }}
                placeholder="🔍 Buscar por nombre o número de RBD..."
                // 🌟 RING FOCUS CON COLOR OFICIAL
                className="w-full border border-gray-300 rounded-md py-1.5 px-3 bg-[#EDF0F5] focus:outline-none focus:ring-2 focus:ring-[#006BB9] text-sm font-bold text-[#25306B] cursor-text"
              />
              
              {mostrarDropdownFiltro && (
                <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-xl max-h-60 overflow-y-auto">
                  <li 
                    className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 text-[#25306B] font-bold border-b border-gray-100"
                    onClick={() => {
                      setColegioSeleccionado('');
                      setMostrarDropdownFiltro(false);
                    }}
                  >
                    🌍 Ver todos los Establecimientos (Nivel Central)
                  </li>
                  {establecimientos
                    .filter(est => 
                      est.nombre.toLowerCase().includes(busquedaFiltro.toLowerCase()) || 
                      String(est.rbd).includes(busquedaFiltro)
                    )
                    .map(est => (
                      <li 
                        key={est.id_establecimiento}
                        className="px-3 py-2 text-sm cursor-pointer hover:bg-[#EDF0F5] text-gray-700 border-b border-gray-50"
                        onMouseDown={() => {
                          setColegioSeleccionado(String(est.id_establecimiento));
                          setMostrarDropdownFiltro(false);
                        }}
                      >
                         {est.nombre}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {/* 🌟 TIPOGRAFÍA PRIMARIA Y COLOR INSTITUCIONAL */}
            <span className="text-[10px] bg-[#25306B] text-white font-['gobCL',_sans-serif] px-2 py-1 rounded shadow-sm uppercase tracking-wider">Mi Establecimiento</span>
            <h2 className="text-sm font-bold text-[#25306B] font-['gobCL',_sans-serif]">
              {colegioActual ? `${colegioActual.nombre} ` : 'Cargando información...'}
            </h2>
          </div>
        )}
      </div>
      
      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 overflow-auto p-6 lg:p-8 bg-[#EDF0F5]">
        <Outlet context={{ colegioSeleccionado }} />
      </main>
    </div>
  );
}