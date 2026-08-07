import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { UserSettings, Payment, Concept } from '../types';
import { db } from '../lib/firebase';
import { doc, setDoc, deleteDoc, serverTimestamp, writeBatch, collection, getDocs, query, where } from 'firebase/firestore';
import { generateAnnualPayments } from '../utils/paymentGenerator';
import { syncAllConceptPayments } from '../utils/paymentUtils';
import { useData } from '../context/DataContext';
import packageJson from '../../package.json';

interface SettingsViewProps {
  user: User;
  settings: UserSettings;
  payments: Payment[];
  concepts: Concept[];
  onLogout: () => void;
}

export function SettingsView({ user, settings, payments, concepts, onLogout }: SettingsViewProps) {
  const { customCategories } = useData();
  // Configuración
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const [notificationsEnabled, setNotificationsEnabled] = useState(settings.notificationsEnabled);
  const [generalNoticeDays, setGeneralNoticeDays] = useState(settings.generalNoticeDays);

  // Ampliación & Sincronización
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  // Eliminación
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteMessage, setDeleteMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Computed for Ampliación
  // The app works with current year and next year.
  // We determine what is the latest generated year by looking at payments.
  const currentYear = new Date().getFullYear();
  let maxYear = currentYear;
  for (const p of payments) {
    if (p.originalPeriodYear && p.originalPeriodYear > maxYear) {
      maxYear = p.originalPeriodYear;
    }
  }
  const nextYearToGenerate = maxYear + 1;
  const newPaymentsPreview = generateAnnualPayments(concepts, nextYearToGenerate);
  
  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const days = parseInt(generalNoticeDays as any);
      if (isNaN(days) || days < 0 || days > 365) {
        throw new Error('La antelación debe ser un número entre 0 y 365 días.');
      }
      
      const settingsRef = doc(db, 'settings', user.uid);
      await setDoc(settingsRef, {
        notificationsEnabled,
        generalNoticeDays: days,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setSaveMessage({ type: 'success', text: 'Configuración guardada correctamente.' });
    } catch (error: unknown) {
      setSaveMessage({ type: 'error', text: error instanceof Error ? error.message : 'Error al guardar la configuración.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateYear = async () => {
    setIsGenerating(true);
    setGenerateMessage(null);
    try {
      if (newPaymentsPreview.length === 0) {
        setGenerateMessage({ type: 'error', text: 'No hay conceptos activos para generar vencimientos.' });
        setIsGenerating(false);
        return;
      }

      // Check existing payments for that year to avoid duplicates
      const existingForYear = payments.filter(p => p.originalPeriodYear === nextYearToGenerate);
      
      const toGenerate = newPaymentsPreview.filter(np => {
        // Find if already exists by conceptId and originalPeriodMonth
        return !existingForYear.some(ep => 
          ep.conceptId === np.conceptId && 
          ep.originalPeriodMonth === np.originalPeriodMonth && 
          ep.originalPeriodYear === np.originalPeriodYear
        );
      });

      if (toGenerate.length === 0) {
        setGenerateMessage({ type: 'success', text: `Ya estaban generados los vencimientos de ${nextYearToGenerate}.` });
        setIsGenerating(false);
        return;
      }

      const batch = writeBatch(db);
      for (const p of toGenerate) {
        const pRef = doc(collection(db, 'payments'));
        batch.set(pRef, {
          ...p,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      }

      await batch.commit();
      
      setGenerateMessage({ type: 'success', text: `Se han generado ${toGenerate.length} vencimientos nuevos para ${nextYearToGenerate}.` });
    } catch (error: unknown) {
      setGenerateMessage({ type: 'error', text: error instanceof Error ? error.message : 'Error al generar el año.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSyncAllPayments = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const createdCount = await syncAllConceptPayments(user.uid, concepts);
      if (createdCount > 0) {
        setSyncMessage({ type: 'success', text: `¡Sincronización completada! Se crearon ${createdCount} recibos faltantes.` });
      } else {
        setSyncMessage({ type: 'success', text: 'Todos los conceptos ya tienen sus recibos al día.' });
      }
    } catch (e) {
      console.error(e);
      setSyncMessage({ type: 'error', text: 'Error al sincronizar los recibos.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteAll = async () => {
    if (deleteConfirmation !== 'ELIMINAR') {
      setDeleteMessage({ type: 'error', text: 'Debes escribir ELIMINAR para confirmar.' });
      return;
    }

    setIsDeleting(true);
    setDeleteMessage(null);

    try {
      const conceptsQuery = await getDocs(query(collection(db, 'concepts'), where('userId', '==', user.uid)));
      const paymentsQuery = await getDocs(query(collection(db, 'payments'), where('userId', '==', user.uid)));
      const settingsRef = doc(db, 'settings', user.uid);
      
      const allDocs = [...conceptsQuery.docs, ...paymentsQuery.docs];
      
      // Delete in chunks of 500 to avoid Firestore limits
      for (let i = 0; i < allDocs.length; i += 499) { // 499 max + settingsRef in the last one
        const chunk = allDocs.slice(i, i + 499);
        const batch = writeBatch(db);
        for (const d of chunk) {
          batch.delete(d.ref);
        }
        if (i + 499 >= allDocs.length) {
          batch.delete(settingsRef); // Delete settings on the last batch
        }
        await batch.commit();
      }

      // Logout after deleting
      onLogout();
    } catch (error: unknown) {
      console.error(error);
      setDeleteMessage({ type: 'error', text: 'Error al eliminar datos. Es posible que haya demasiados documentos para borrar en lote, prueba más tarde.' });
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 flex-1 overflow-y-auto max-w-4xl mx-auto w-full">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Configuración</h2>
      
      {/* 1. Avisos Internos */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="p-4 md:p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Avisos Internos</h3>
          <p className="text-sm text-slate-500 mt-1">Configura las alertas globales de próximos vencimientos. Los conceptos con una antelación personalizada utilizarán su propia configuración.</p>
        </div>
        <div className="p-4 md:p-6 space-y-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={notificationsEnabled} onChange={(e) => setNotificationsEnabled(e.target.checked)} />
              <div className={`block w-10 h-6 rounded-full transition-colors ${notificationsEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
              <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${notificationsEnabled ? 'transform translate-x-4' : ''}`}></div>
            </div>
            <span className="text-slate-700 font-medium">Activar avisos internos</span>
          </label>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 ml-0 sm:ml-12 opacity-100 transition-opacity" style={{ opacity: notificationsEnabled ? 1 : 0.5, pointerEvents: notificationsEnabled ? 'auto' : 'none' }}>
            <span className="text-sm text-slate-700">Antelación general:</span>
            <div className="flex items-center gap-2">
              <input 
                type="number" 
                min="0" 
                max="365" 
                value={generalNoticeDays} 
                onChange={(e) => setGeneralNoticeDays(Number(e.target.value))}
                className="w-20 border border-slate-300 rounded-md text-sm px-3 py-2 text-slate-700 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <span className="text-sm text-slate-500">días</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 pt-4">
            <button 
              onClick={handleSaveSettings}
              disabled={isSaving || (notificationsEnabled === settings.notificationsEnabled && generalNoticeDays === settings.generalNoticeDays)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">save</span>}
              Guardar Ajustes
            </button>
            {saveMessage && (
              <span className={`text-sm ${saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {saveMessage.text}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. Planificación anual */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="p-4 md:p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Planificación Anual</h3>
          <p className="text-sm text-slate-500 mt-1">Genera automáticamente los vencimientos para un nuevo año a partir de los conceptos activos.</p>
        </div>
        <div className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <span className="block text-sm font-medium text-slate-500 mb-1">Año actual: <strong className="text-slate-800">{currentYear}</strong></span>
              <span className="block text-sm font-medium text-slate-500">Último año generado: <strong className="text-indigo-600">{maxYear}</strong></span>
            </div>
          </div>
          
          <div className="border border-indigo-100 bg-indigo-50/50 rounded-lg p-4">
            <h4 className="text-sm font-bold text-indigo-900 mb-2">Ampliación disponible a {nextYearToGenerate}</h4>
            <p className="text-sm text-indigo-700 mb-4">
              Se generarán <strong className="font-bold">{newPaymentsPreview.length}</strong> vencimientos nuevos para el año {nextYearToGenerate} según tus {concepts.filter(c => c.active).length} conceptos activos.
            </p>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <button 
                onClick={handleGenerateYear}
                disabled={isGenerating || newPaymentsPreview.length === 0}
                className="px-4 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isGenerating ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">event_add</span>}
                Generar año {nextYearToGenerate}
              </button>
              
              {generateMessage && (
                <span className={`text-sm ${generateMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {generateMessage.text}
                </span>
              )}
            </div>
          </div>

          <div className="border border-emerald-100 bg-emerald-50/50 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-bold text-emerald-900 mb-2">Sincronización retroactiva de recibos</h4>
            <p className="text-sm text-emerald-700 mb-4">
              ¿Modificaste la fecha de inicio de tus conceptos? Haz clic aquí para buscar y generar automáticamente todos los recibos faltantes desde su fecha de inicio inicial hasta hoy.
            </p>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <button 
                onClick={handleSyncAllPayments}
                disabled={isSyncing}
                className="px-4 py-2 bg-emerald-600 border border-emerald-700 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2 shadow-sm"
              >
                {isSyncing ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">sync</span>}
                Sincronizar recibos faltantes de todos los conceptos
              </button>
              
              {syncMessage && (
                <span className={`text-sm font-medium ${syncMessage.type === 'success' ? 'text-emerald-800 font-bold' : 'text-red-600'}`}>
                  {syncMessage.text}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Categorías Personalizadas */}
      {customCategories.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="p-4 md:p-6 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-600">category</span>
              Categorías Personalizadas
            </h3>
            <p className="text-sm text-slate-500 mt-1">Gestión de las categorías adicionales creadas para tus ingresos y gastos.</p>
          </div>
          <div className="p-4 md:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {customCategories.map(cat => {
                const handleDeleteCat = async (catId: string, catName: string) => {
                  if (window.confirm(`¿Seguro que deseas eliminar la categoría "${catName}"?`)) {
                    try {
                      await deleteDoc(doc(db, 'categories', catId));
                    } catch (err) {
                      console.error("Error deleting category:", err);
                      alert("No se pudo eliminar la categoría.");
                    }
                  }
                };

                return (
                  <div key={cat.id} className="p-3 border border-slate-200 rounded-xl bg-slate-50/50 flex items-center justify-between gap-2 shadow-xs hover:border-slate-300 transition-colors">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <span className="w-4 h-4 rounded-full border shadow-sm flex-shrink-0" style={{ backgroundColor: cat.color }} />
                      <div className="truncate">
                        <p className="text-sm font-bold text-slate-800 truncate">{cat.name}</p>
                        <p className="text-[10px] text-slate-500 font-medium">
                          {cat.type === 'expense' ? 'Gastos' : cat.type === 'income' ? 'Ingresos' : 'Gastos e Ingresos'}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteCat(cat.id, cat.name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      title="Eliminar categoría"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 3. Cuenta */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="p-4 md:p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Cuenta</h3>
          <p className="text-sm text-slate-500 mt-1">Información de la sesión actual.</p>
        </div>
        <div className="p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-indigo-600 text-xl font-bold">
              {user.email?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-slate-800">{user.email}</p>
              <p className="text-xs text-slate-500 mt-0.5">Tus datos se sincronizan con esta cuenta de Google.</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 w-full md:w-auto justify-center"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Cerrar sesión
          </button>
        </div>
      </section>

      {/* 4. Datos y copias */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm opacity-60">
        <div className="p-4 md:p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Datos y copias</h3>
            <p className="text-sm text-slate-500 mt-1">Importación y exportación de datos en formato Excel.</p>
          </div>
          <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded">Próximamente</span>
        </div>
        <div className="p-4 md:p-6 text-sm text-slate-500">
          Esta función está en desarrollo y estará disponible en una actualización futura.
        </div>
      </section>

      {/* 5. Privacidad e Información Fija */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-6">
          <h3 className="text-base font-bold text-slate-800 mb-3">Privacidad y Almacenamiento</h3>
          <ul className="text-sm text-slate-600 space-y-2 list-disc pl-4">
            <li>Tus datos se guardan en Firebase de forma segura.</li>
            <li>Se asocian exclusivamente a tu cuenta de Google.</li>
            <li>Se sincronizan entre tus dispositivos automáticamente.</li>
            <li>No se almacenan en tu Google Drive personal.</li>
            <li>Cerrar sesión no elimina tus datos.</li>
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-6">
          <h3 className="text-base font-bold text-slate-800 mb-3">Información Fija de la Aplicación</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="text-sm text-slate-500">Moneda Principal</span>
              <span className="text-sm font-bold text-slate-800">EUR (€)</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="text-sm text-slate-500">Zona Horaria</span>
              <span className="text-sm font-bold text-slate-800">Europe/Madrid</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Versión</span>
              <span className="text-sm font-bold text-slate-800">{packageJson.version}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Zona de peligro */}
      <section className="bg-red-50 border border-red-200 rounded-xl shadow-sm mt-8">
        <div className="p-4 md:p-6 border-b border-red-200">
          <h3 className="text-lg font-bold text-red-700 flex items-center gap-2">
            <span className="material-symbols-outlined">warning</span>
            Zona de peligro
          </h3>
          <p className="text-sm text-red-600 mt-1">Acciones irreversibles. Procede con precaución.</p>
        </div>
        <div className="p-4 md:p-6 space-y-4">
          <p className="text-sm text-slate-700 font-medium">
            Eliminar todos mis datos:
          </p>
          <ul className="text-sm text-slate-600 list-disc pl-4 mb-4">
            <li>Todos tus conceptos y su historial de precios.</li>
            <li>Todos tus vencimientos y pagos.</li>
            <li>Toda tu configuración y preferencias.</li>
            <li>Esta acción <strong>no</strong> se puede deshacer.</li>
          </ul>
          
          <div className="bg-white p-4 rounded-lg border border-red-100">
            <p className="text-sm text-slate-700 mb-3">Para confirmar, escribe <strong>ELIMINAR</strong> en el siguiente campo:</p>
            <input 
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="ELIMINAR"
              className="w-full md:w-64 border border-slate-300 rounded-md text-sm px-3 py-2 text-slate-700 focus:ring-red-500 focus:border-red-500 mb-4 uppercase"
            />
            
            <div className="flex items-center gap-4">
              <button 
                onClick={handleDeleteAll}
                disabled={isDeleting || deleteConfirmation !== 'ELIMINAR'}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">delete_forever</span>}
                Eliminar todo definitivamente
              </button>
              {deleteMessage && (
                <span className={`text-sm font-medium ${deleteMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {deleteMessage.text}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
