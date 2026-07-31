import { useAuth } from '../context/AuthContext';

export function Login() {
  const { login, authError, isAuthorized, user, logout, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-slate-500 text-sm">Verificando sesión...</p>
      </div>
    );
  }

  // If user is authenticated but not authorized
  if (user && isAuthorized === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-[32px]">no_accounts</span>
          </div>
          <h1 className="text-2xl font-bold mb-3 text-slate-800">Acceso no autorizado</h1>
          <p className="text-slate-500 mb-6 text-sm">
            La cuenta <span className="font-medium text-slate-700">{user.email}</span> no tiene permisos para acceder a esta aplicación.
          </p>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
        <div className="w-16 h-16 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-6 shadow-sm">
          €
        </div>
        <h1 className="text-2xl font-bold mb-3 text-slate-800">Control Anual de Pagos</h1>
        <p className="text-slate-500 mb-8 text-sm">Administra tus compromisos financieros recurrentes con claridad, orden y absoluta serenidad.</p>
        
        {authError && (
          <div className="mb-6 p-3 bg-red-50 text-red-700 text-sm rounded-lg text-left flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
            <span>{authError}</span>
          </div>
        )}

        <button
          onClick={login}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
          </svg>
          Continuar con Google
        </button>
        <div className="mt-8 flex items-center justify-center gap-2 text-slate-400 text-xs">
          <span className="material-symbols-outlined text-[16px]">lock</span>
          <span>Acceso privado, seguro y cifrado</span>
        </div>
      </div>
    </div>
  );
}
