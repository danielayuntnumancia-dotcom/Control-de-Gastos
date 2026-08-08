import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppState } from '../context/AppStateContext';
import { useEffect, useState } from 'react';

export function Layout() {
  const { user, logout } = useAuth();
  const { setIsConceptFormOpen, setEditingConcept } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Inicio';
    if (path === '/calendario') return 'Calendario';
    if (path.startsWith('/conceptos')) {
      if (path === '/conceptos') return 'Conceptos';
      return 'Detalle del Concepto';
    }
    if (path === '/importar') return 'Importar Datos';
    if (path === '/resumen') return 'Resumen Anual';
    if (path === '/configuracion') return 'Configuración';
    return '';
  };

  const currentView = location.pathname;

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 text-slate-900 font-sans overflow-hidden flex-col md:flex-row">
      {isOffline && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-100 text-yellow-800 text-xs text-center py-1 font-medium z-50 flex items-center justify-center gap-2 border-b border-yellow-200">
          <span className="material-symbols-outlined text-[16px]">wifi_off</span>
          Estás sin conexión. Los datos pueden no estar actualizados.
        </div>
      )}
      
      {/* Sidebar for Desktop / Bottom Bar for Mobile */}
      <aside className={`md:w-64 bg-slate-900 text-slate-300 flex flex-row md:flex-col border-t md:border-t-0 md:border-r border-slate-200 shrink-0 order-2 md:order-1 z-10 pb-safe md:pb-0 ${isOffline ? 'md:mt-6' : ''}`}>
        <div className="p-0 md:p-6 flex-1 flex flex-row md:flex-col justify-around md:justify-start">
          <div className="hidden md:flex items-center gap-3 mb-8">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold">€</div>
            <span className="text-white font-semibold text-lg tracking-tight">Control Pagos</span>
          </div>
          <nav className="flex flex-row md:flex-col space-y-0 md:space-y-1 w-full justify-around md:justify-start py-2 md:py-0">
            <NavLink 
              to="/"
              end
              className={({ isActive }) => `flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-lg transition-colors flex-1 md:w-full ${isActive ? 'md:bg-indigo-600 text-indigo-400 md:text-white' : 'hover:bg-slate-800'}`}
            >
              <span className="material-symbols-outlined text-[24px] md:text-[20px]">dashboard</span>
              <span className="text-[10px] md:text-base">Inicio</span>
            </NavLink>
            <NavLink 
              to="/calendario"
              className={({ isActive }) => `flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-lg transition-colors flex-1 md:w-full ${isActive ? 'md:bg-indigo-600 text-indigo-400 md:text-white' : 'hover:bg-slate-800'}`}
            >
              <span className="material-symbols-outlined text-[24px] md:text-[20px]">calendar_month</span>
              <span className="text-[10px] md:text-base">Calendario</span>
            </NavLink>
            <NavLink 
              to="/conceptos"
              className={({ isActive }) => `flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-lg transition-colors flex-1 md:w-full ${isActive || currentView.startsWith('/conceptos') ? 'md:bg-indigo-600 text-indigo-400 md:text-white' : 'hover:bg-slate-800'}`}
            >
              <span className="material-symbols-outlined text-[24px] md:text-[20px]">list_alt</span>
              <span className="text-[10px] md:text-base">Conceptos</span>
            </NavLink>
            <NavLink 
              to="/resumen"
              className={({ isActive }) => `flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-lg transition-colors flex-1 md:w-full ${isActive ? 'md:bg-indigo-600 text-indigo-400 md:text-white' : 'hover:bg-slate-800'}`}
            >
              <span className="material-symbols-outlined text-[24px] md:text-[20px]">bar_chart</span>
              <span className="text-[10px] md:text-base">Resumen</span>
            </NavLink>

            <div className="relative flex-1 md:w-full md:hidden flex justify-center"> 
               <button 
                 onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                 className={`flex flex-col items-center justify-center gap-1 px-2 py-2 text-slate-300 hover:text-white w-full rounded-lg ${isMobileMenuOpen ? 'text-white' : ''}`}
               >
                 <span className="material-symbols-outlined text-[24px]">more_horiz</span>
                 <span className="text-[10px]">Más</span>
               </button>
               {isMobileMenuOpen && (
                 <>
                   <div className="fixed inset-0 z-40" onClick={() => setIsMobileMenuOpen(false)}></div>
                   <div className="absolute bottom-full right-2 mb-2 w-48 bg-slate-800 rounded-lg shadow-xl z-50 overflow-hidden">
                     <button onClick={() => { setIsMobileMenuOpen(false); navigate('/importar'); }} className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-slate-700">Importar</button>
                     <button onClick={() => { setIsMobileMenuOpen(false); navigate('/configuracion'); }} className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-slate-700">Configuración</button>
                     <button onClick={() => { setIsMobileMenuOpen(false); logout(); }} className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-slate-700 border-t border-slate-700">Cerrar sesión</button>
                   </div>
                 </>
               )}
            </div>
            
            <NavLink 
              to="/importar"
              className={({ isActive }) => `hidden md:flex flex-row items-center justify-start gap-3 px-4 py-3 rounded-lg transition-colors w-full ${isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
            >
              <span className="material-symbols-outlined text-[20px]">upload_file</span>
              <span className="text-base">Importar</span>
            </NavLink>
            <NavLink 
              to="/configuracion"
              className={({ isActive }) => `hidden md:flex flex-row items-center justify-start gap-3 px-4 py-3 rounded-lg transition-colors w-full ${isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
            >
              <span className="material-symbols-outlined text-[20px]">settings</span>
              <span className="text-base">Configuración</span>
            </NavLink>
          </nav>
        </div>
        <div className="hidden md:block mt-auto p-6 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs text-white shrink-0">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
            <button onClick={logout} className="text-slate-500 hover:text-white transition-colors shrink-0" title="Cerrar sesión">
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col overflow-hidden order-1 md:order-2 ${isOffline ? 'mt-6' : ''}`}>
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0 relative z-0">
          <div className="flex items-center gap-2 md:gap-4">
            {location.pathname.startsWith('/conceptos/') && (
               <button 
                onClick={() => navigate('/conceptos')}
                className="md:hidden w-8 h-8 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-full mr-1 transition-colors"
               >
                 <span className="material-symbols-outlined">arrow_back</span>
               </button>
            )}
            <h1 className="text-lg md:text-xl font-bold text-slate-800">
              {getPageTitle()}
            </h1>
          </div>
          <div className="flex gap-3" id="header-actions">
            {!location.pathname.startsWith('/conceptos/') && (
              <button 
                onClick={() => {
                  setEditingConcept(undefined);
                  setIsConceptFormOpen(true);
                }}
                className="px-3 md:px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span className="hidden md:inline">Nuevo Concepto</span>
              </button>
            )}
          </div>
        </header>
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
