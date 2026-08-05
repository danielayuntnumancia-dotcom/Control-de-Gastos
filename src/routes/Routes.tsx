import { Outlet, Navigate, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useAppState } from '../context/AppStateContext';
import { Login } from '../pages/Login';
import { Layout } from '../components/Layout';
import { DashboardView } from '../components/DashboardView';
import { MonthlyView } from '../components/MonthlyView';
import { AnnualView } from '../components/AnnualView';
import { SettingsView } from '../components/SettingsView';
import { ConceptsView } from '../components/ConceptsView';
import { ConceptDetailsView } from '../components/ConceptDetailsView';
import { PaymentDetailsPanel } from '../components/PaymentDetailsPanel';
import { ConceptForm } from '../components/ConceptForm';
import { ImportView } from '../components/ImportView';
import { useEffect } from 'react';

export function ProtectedRoute() {
  const { user, loading, isAuthorized } = useAuth();
  const { loading: dataLoading, concepts } = useData();
  const { selectedPayment, setSelectedPayment, isConceptFormOpen, setIsConceptFormOpen, editingConcept, setEditingConcept } = useAppState();

  if (loading || (user && isAuthorized && dataLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user || isAuthorized === false) {
    return <Login />;
  }

  return (
    <>
      <Layout />
      {selectedPayment && (
        <PaymentDetailsPanel
          payment={selectedPayment}
          concept={concepts.find(c => c.id === selectedPayment.conceptId)}
          onClose={() => setSelectedPayment(null)}
        />
      )}
      {isConceptFormOpen && (
        <ConceptForm
          user={user}
          initialConcept={editingConcept}
          onClose={() => {
            setIsConceptFormOpen(false);
            setEditingConcept(undefined);
          }}
        />
      )}
    </>
  );
}

export function DashboardRoute() {
  const { payments, concepts, settings } = useData();
  const { setSelectedPayment } = useAppState();
  const navigate = useNavigate();
  
  if (!settings) return null;
  return (
    <DashboardView 
      payments={payments}
      concepts={concepts}
      settings={settings}
      onOpenPayment={setSelectedPayment}
      onNavigateToCalendar={() => navigate('/calendario')}
      onNavigateToConcepts={() => navigate('/conceptos')}
    />
  );
}

export function MonthlyRoute() {
  const { payments, concepts } = useData();
  const { globalYear, setGlobalYear, setSelectedPayment } = useAppState();
  
  return (
    <MonthlyView 
      payments={payments}
      concepts={concepts}
      onOpenPayment={setSelectedPayment}
      globalYear={globalYear}
      setGlobalYear={setGlobalYear}
    />
  );
}

export function ConceptsRoute() {
  const { concepts } = useData();
  const { setEditingConcept, setIsConceptFormOpen } = useAppState();
  const navigate = useNavigate();
  
  return (
    <ConceptsView 
      concepts={concepts}
      onNew={() => {
        setEditingConcept(undefined);
        setIsConceptFormOpen(true);
      }}
      onSelect={(concept) => {
        navigate(`/conceptos/${concept.id}`);
      }}
    />
  );
}

export function ConceptDetailsRoute() {
  const { id } = useParams<{ id: string }>();
  const { concepts, payments, settings } = useData();
  const { setSelectedPayment } = useAppState();
  const { user } = useAuth();
  const navigate = useNavigate();

  const concept = concepts.find(c => c.id === id);

  // Instead of an effect that redirects on render, we conditionally render.
  // If the concept doesn't exist, show empty state or redirect.
  useEffect(() => {
    if (concepts.length > 0 && !concept) {
      navigate('/conceptos', { replace: true });
    }
  }, [concept, concepts, navigate]);

  if (!concept || !settings || !user) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-slate-500">
        Concepto no encontrado o eliminado.
      </div>
    );
  }

  return (
    <ConceptDetailsView
      concept={concept}
      payments={payments}
      onBack={() => navigate('/conceptos')}
      onOpenPayment={setSelectedPayment}
      user={user}
      settings={settings}
    />
  );
}

export function AnnualRoute() {
  const { payments, concepts } = useData();
  const { globalYear, setGlobalYear, setSelectedPayment } = useAppState();
  
  return (
    <AnnualView 
      payments={payments}
      concepts={concepts}
      globalYear={globalYear}
      setGlobalYear={setGlobalYear}
      onOpenPayment={setSelectedPayment}
    />
  );
}

export function SettingsRoute() {
  const { payments, concepts, settings } = useData();
  const { user, logout } = useAuth();
  
  if (!settings || !user) return null;

  return (
    <SettingsView 
      user={user}
      settings={settings}
      payments={payments}
      concepts={concepts}
      onLogout={logout}
    />
  );
}

export function ImportRoute() {
  return <ImportView />;
}

export function NotFoundRoute() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600 bg-slate-50 h-full">
      <span className="material-symbols-outlined text-[48px] text-slate-400 mb-4">route</span>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Ruta no encontrada</h2>
      <p className="mb-6">La sección a la que intentas acceder no existe.</p>
      <button 
        onClick={() => navigate('/')}
        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Volver a Inicio
      </button>
    </div>
  );
}
