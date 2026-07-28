cat << 'INNEREOF' > src/components/ConceptDetailsView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Concept, Payment, PriceVersion, UserSettings } from '../types';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, setDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';

interface Props {
  concept: Concept;
  payments: Payment[];
  user: User;
  settings: UserSettings;
  onBack: () => void;
  onOpenPayment: (p: Payment) => void;
}

export function ConceptDetailsView({ concept, payments, user, settings, onBack, onOpenPayment }: Props) {
  const [priceVersions, setPriceVersions] = useState<PriceVersion[]>([]);
  const [loading, setLoading] = useState(true);

  // General Editing
  const [isEditingGeneral, setIsEditingGeneral] = useState(false);
  const [editName, setEditName] = useState(concept.name);
  const [editDesc, setEditDesc] = useState(concept.description || '');
  const [editCat, setEditCat] = useState(concept.category);
  const [editColor, setEditColor] = useState(concept.color || '#4f46e5');

  // Notice Days Editing
  const [isEditingNotice, setIsEditingNotice] = useState(false);
  const [noticeDays, setNoticeDays] = useState<string>(concept.exceptionNoticeDays !== null && concept.exceptionNoticeDays !== undefined ? String(concept.exceptionNoticeDays) : '');

  // New Price
  const [isNewPriceOpen, setIsNewPriceOpen] = useState(false);
  const [newPriceAmount, setNewPriceAmount] = useState('');
  const [newPriceMonth, setNewPriceMonth] = useState<number>(new Date().getMonth());
  const [newPriceYear, setNewPriceYear] = useState<number>(new Date().getFullYear());
  const [newPriceNote, setNewPriceNote] = useState('');
  const [newPricePreview, setNewPricePreview] = useState<Payment[] | null>(null);

  // Derived
  const conceptPayments = useMemo(() => {
    return payments.filter(p => p.conceptId === concept.id).sort((a, b) => {
      // Sort descending by original period
      const aTime = new Date(a.originalPeriodYear || a.dueDate.getFullYear(), a.originalPeriodMonth || a.dueDate.getMonth(), 1).getTime();
      const bTime = new Date(b.originalPeriodYear || b.dueDate.getFullYear(), b.originalPeriodMonth || b.dueDate.getMonth(), 1).getTime();
      return bTime - aTime;
    });
  }, [payments, concept.id]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const q = query(
          collection(db, 'price_versions'),
          where('conceptId', '==', concept.id),
          where('userId', '==', user.uid),
          orderBy('validFrom', 'desc')
        );
        const snap = await getDocs(q);
        const versions = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          validFrom: d.data().validFrom.toDate(),
          validTo: d.data().validTo?.toDate(),
          createdAt: d.data().createdAt?.toDate() || new Date()
        } as PriceVersion));

        if (versions.length === 0) {
          // Migration
          const newVRef = doc(collection(db, 'price_versions'));
          const initialVersion: PriceVersion = {
            id: newVRef.id,
            conceptId: concept.id,
            userId: user.uid,
            amount: concept.expectedAmount,
            validFrom: concept.firstPeriod,
            createdAt: concept.createdAt
          };
          await setDoc(newVRef, {
            ...initialVersion,
            createdAt: serverTimestamp()
          });
          setPriceVersions([initialVersion]);
        } else {
          setPriceVersions(versions);
        }
      } catch (e) {
        console.error("Error fetching price versions", e);
      } finally {
        setLoading(false);
      }
    };
    fetchPrices();
  }, [concept.id, user.uid, concept.expectedAmount, concept.firstPeriod, concept.createdAt]);

  const handleSaveGeneral = async () => {
    try {
      await updateDoc(doc(db, 'concepts', concept.id), {
        name: editName,
        description: editDesc,
        category: editCat,
        color: editColor,
        updatedAt: serverTimestamp()
      });
      setIsEditingGeneral(false);
    } catch (e) {
      console.error(e);
      alert("Error al guardar la información general");
    }
  };

  const handleSaveNotice = async () => {
    try {
      const val = noticeDays.trim() === '' ? null : Number(noticeDays);
      await updateDoc(doc(db, 'concepts', concept.id), {
        exceptionNoticeDays: val,
        updatedAt: serverTimestamp()
      });
      setIsEditingNotice(false);
    } catch (e) {
      console.error(e);
      alert("Error al guardar la configuración de avisos");
    }
  };

  const handleToggleActive = async () => {
    try {
      if (concept.active) {
        if (!confirm("¿Desactivar este concepto? Se conservará su historial pero no se generarán nuevos vencimientos.")) return;
      }
      await updateDoc(doc(db, 'concepts', concept.id), {
        active: !concept.active,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async () => {
    if (conceptPayments.length > 0) {
      alert("No se puede eliminar un concepto con historial. Desactívalo en su lugar.");
      return;
    }
    if (!confirm("¿Eliminar definitivamente este concepto? Esta acción no se puede deshacer.")) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'concepts', concept.id));
      priceVersions.forEach(pv => {
        batch.delete(doc(db, 'price_versions', pv.id));
      });
      await batch.commit();
      onBack();
    } catch (e) {
      console.error(e);
      alert("Error al eliminar");
    }
  };

  const handlePreviewNewPrice = () => {
    const amount = parseFloat(newPriceAmount.replace(',', '.'));
    if (isNaN(amount)) {
      alert("Importe inválido");
      return;
    }

    const validFromDate = new Date(newPriceYear, newPriceMonth, 1);
    
    // Find affected payments
    // Criteria: same concept, original period >= validFromDate, future (not paid, canceled, refunded, etc.)
    // For simplicity, we check status PENDING, PENDING_DATE, OVERDUE, APPROX_OVERDUE
    // and we also assume that expectedAmount == current expectedAmount is not an "individual correction"
    
    const affected = conceptPayments.filter(p => {
      const pDate = new Date(p.originalPeriodYear || p.dueDate.getFullYear(), p.originalPeriodMonth || p.dueDate.getMonth(), 1);
      if (pDate < validFromDate) return false;
      if (['PAID', 'CANCELED', 'REFUNDED'].includes(p.status)) return false;
      
      // Individual correction logic:
      // If payment's expectedAmount does not match the concept's expected amount, we might consider it individually corrected.
      // But actually, we just update all non-paid future payments. The prompt says "no tengan una corrección individual que deba conservarse"
      // If we don't have a flag, we can assume if it's not the same as concept.expectedAmount, it's a correction.
      if (p.expectedAmount !== concept.expectedAmount) return false;

      return true;
    });

    setNewPricePreview(affected);
  };

  const handleSaveNewPrice = async () => {
    if (!newPricePreview) return;
    
    const amountCents = Math.round(parseFloat(newPriceAmount.replace(',', '.')) * 100);
    const validFromDate = new Date(newPriceYear, newPriceMonth, 1);
    
    // Create new price version
    const newPvRef = doc(collection(db, 'price_versions'));
    const newPv: PriceVersion = {
      id: newPvRef.id,
      conceptId: concept.id,
      userId: user.uid,
      amount: amountCents,
      validFrom: validFromDate,
      note: newPriceNote,
      createdAt: new Date()
    };

    try {
      const batch = writeBatch(db);
      
      batch.set(newPvRef, {
        ...newPv,
        createdAt: serverTimestamp()
      });

      // Update concept expectedAmount if this price is active NOW or in the PAST
      // If it's a future price, we don't update concept.expectedAmount yet (or we just update it anyway for simplicity,
      // but conceptually expectedAmount is the "current" one). Let's just update the concept.expectedAmount for new default.
      const now = new Date();
      if (validFromDate <= now) {
        batch.update(doc(db, 'concepts', concept.id), {
          expectedAmount: amountCents,
          updatedAt: serverTimestamp()
        });
      }

      // Update payments
      newPricePreview.forEach(p => {
        batch.update(doc(db, 'payments', p.id), {
          expectedAmount: amountCents,
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      
      // Update local state
      setPriceVersions(prev => [newPv, ...prev].sort((a,b) => b.validFrom.getTime() - a.validFrom.getTime()));
      setIsNewPriceOpen(false);
      setNewPricePreview(null);
      setNewPriceAmount('');
      setNewPriceNote('');
    } catch (e) {
      console.error(e);
      alert("Error al guardar el nuevo precio");
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="animate-spin h-8 w-8 border-b-2 border-indigo-600 rounded-full"></div></div>;
  }

  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  return (
    <div className="flex-1 overflow-y-auto flex flex-col bg-slate-50 relative">
      <div className="sticky top-0 bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center gap-4 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">{concept.name}</h2>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight ${concept.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
              {concept.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{concept.category}</p>
        </div>
      </div>

      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-8 pb-32">
        {/* 1. Información General */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-800">Información General</h3>
            {!isEditingGeneral && (
              <button onClick={() => setIsEditingGeneral(true)} className="text-sm text-indigo-600 font-medium hover:underline">
                Editar
              </button>
            )}
          </div>
          <div className="p-6">
            {isEditingGeneral ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                    <select value={editCat} onChange={e => setEditCat(e.target.value as any)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                      <option value="Suscripción">Suscripción</option>
                      <option value="Impuesto">Impuesto</option>
                      <option value="Tasa">Tasa</option>
                      <option value="Seguro">Seguro</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                  <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" rows={2}></textarea>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
                  <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="w-10 h-10 border-0 rounded cursor-pointer" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setIsEditingGeneral(false)} className="px-4 py-2 text-sm font-medium text-slate-600">Cancelar</button>
                  <button onClick={handleSaveGeneral} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg">Guardar</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Nombre</p>
                  <p className="font-medium text-slate-900">{concept.name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Categoría</p>
                  <p className="font-medium text-slate-900">{concept.category}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Descripción</p>
                  <p className="text-sm text-slate-700">{concept.description || <span className="text-slate-400 italic">Sin descripción</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Color</p>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: concept.color || '#ccc' }}></div>
                    <span className="text-sm">{concept.color || 'Ninguno'}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Fecha de Creación</p>
                  <p className="text-sm text-slate-700">{concept.createdAt.toLocaleDateString('es-ES')}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 2. Programación */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-800">Programación</h3>
            <button className="text-sm text-slate-400 font-medium cursor-not-allowed" title="La edición de programación estará disponible pronto">
              Editar (Próximamente)
            </button>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 gap-x-8">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Periodicidad</p>
                <p className="font-medium text-slate-900 capitalize">
                  {concept.periodicity === 'monthly' && 'Mensual'}
                  {concept.periodicity === 'quarterly' && 'Trimestral'}
                  {concept.periodicity === 'semiannual' && 'Semestral'}
                  {concept.periodicity === 'annual' && 'Anual'}
                  {concept.periodicity === 'one_time' && 'Pago Único'}
                  {concept.periodicity === 'custom_months' && 'Meses Específicos'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Tipo de Fecha</p>
                <p className="font-medium text-slate-900">
                  {concept.dateType === 'exact' && `Día exacto (${concept.day})`}
                  {concept.dateType === 'approximate' && `Aproximado (sobre el ${concept.day})`}
                  {concept.dateType === 'month_only' && 'Solo el mes (sin día)'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Primer Periodo</p>
                <p className="font-medium text-slate-900">{months[concept.firstPeriod.getMonth()]} {concept.firstPeriod.getFullYear()}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Precios */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-800">Historial de Precios</h3>
            {!isNewPriceOpen && (
              <button onClick={() => setIsNewPriceOpen(true)} className="text-sm text-indigo-600 font-medium hover:underline flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]">add</span>
                Nuevo Precio
              </button>
            )}
          </div>
          
          {isNewPriceOpen && (
            <div className="p-6 border-b border-indigo-100 bg-indigo-50/30">
              <h4 className="font-bold text-slate-800 mb-4">Programar Nuevo Precio</h4>
              {!newPricePreview ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nuevo Importe (€)</label>
                      <input 
                        type="text" 
                        value={newPriceAmount} 
                        onChange={e => setNewPriceAmount(e.target.value)} 
                        placeholder="Ej. 45,50"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Vigente Desde (Periodo)</label>
                      <div className="flex gap-2">
                        <select value={newPriceMonth} onChange={e => setNewPriceMonth(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                          {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                        <input type="number" value={newPriceYear} onChange={e => setNewPriceYear(Number(e.target.value))} className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nota (Opcional)</label>
                    <input type="text" value={newPriceNote} onChange={e => setNewPriceNote(e.target.value)} placeholder="Motivo del cambio de precio" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => {setIsNewPriceOpen(false); setNewPriceAmount(''); setNewPriceNote('');}} className="px-4 py-2 text-sm font-medium text-slate-600">Cancelar</button>
                    <button onClick={handlePreviewNewPrice} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg">Previsualizar Cambio</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-white border border-slate-200 rounded-lg">
                    <p className="text-sm text-slate-700 mb-2">
                      El nuevo precio de <strong className="font-bold">{parseFloat(newPriceAmount.replace(',', '.')).toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</strong> entrará en vigor a partir del periodo <strong className="font-bold">{months[newPriceMonth]} {newPriceYear}</strong>.
                    </p>
                    <p className="text-sm text-slate-700">
                      Se actualizarán <strong className="font-bold">{newPricePreview.length}</strong> vencimientos futuros que aún no han sido pagados y no tienen una corrección individual.
                    </p>
                    
                    {newPricePreview.length > 0 && (
                      <div className="mt-3 max-h-40 overflow-y-auto border border-slate-100 rounded text-xs bg-slate-50">
                        {newPricePreview.map(p => (
                          <div key={p.id} className="p-2 border-b border-slate-100 last:border-0 flex justify-between">
                            <span>{months[p.originalPeriodMonth!]} {p.originalPeriodYear}</span>
                            <span>{p.dueDate.toLocaleDateString('es-ES')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setNewPricePreview(null)} className="px-4 py-2 text-sm font-medium text-slate-600">Atrás</button>
                    <button onClick={handleSaveNewPrice} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg">Confirmar Nuevo Precio</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {priceVersions.map((pv, i) => {
              const isCurrent = i === 0; // Sort is desc by validFrom
              return (
                <div key={pv.id} className="p-6 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <p className="text-lg font-bold text-slate-900">{(pv.amount / 100).toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</p>
                      {isCurrent && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase rounded">Vigente</span>}
                      {!isCurrent && pv.validFrom > new Date() && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold uppercase rounded">Futuro</span>}
                    </div>
                    <p className="text-sm text-slate-500">
                      Desde el periodo: {months[pv.validFrom.getMonth()]} {pv.validFrom.getFullYear()}
                    </p>
                    {pv.note && <p className="text-xs text-slate-400 mt-1 italic">"{pv.note}"</p>}
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>Creado: {pv.createdAt.toLocaleDateString('es-ES')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. Avisos */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-800">Avisos Internos</h3>
            {!isEditingNotice && (
              <button onClick={() => setIsEditingNotice(true)} className="text-sm text-indigo-600 font-medium hover:underline">
                Editar
              </button>
            )}
          </div>
          <div className="p-6">
            {isEditingNotice ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Días de antelación para este concepto</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" max="365" value={noticeDays} onChange={e => setNoticeDays(e.target.value)} placeholder="Ej. 10" className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <span className="text-sm text-slate-500">días antes del vencimiento</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Déjalo en blanco para usar la configuración general ({settings.generalNoticeDays} días).</p>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setIsEditingNotice(false)} className="px-4 py-2 text-sm font-medium text-slate-600">Cancelar</button>
                  <button onClick={handleSaveNotice} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg">Guardar</button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Configuración Aplicada</p>
                <p className="font-medium text-slate-900">
                  {concept.exceptionNoticeDays !== null && concept.exceptionNoticeDays !== undefined 
                    ? `Personalizada: ${concept.exceptionNoticeDays} días` 
                    : `General: ${settings.generalNoticeDays} días`
                  }
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 5. Vencimientos Relacionados */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-800">Vencimientos Relacionados</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {conceptPayments.length === 0 ? (
              <div className="p-6 text-center text-slate-500">No hay vencimientos generados.</div>
            ) : (
              conceptPayments.map(p => (
                <div key={p.id} onClick={() => onOpenPayment(p)} className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors">
                  <div>
                    <p className="font-medium text-slate-900">{months[p.originalPeriodMonth!]} {p.originalPeriodYear}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Vence: {p.dueDate.toLocaleDateString('es-ES')}</p>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${p.status === 'PAID' ? 'bg-green-100 text-green-700' : p.status === 'CANCELED' ? 'bg-slate-100 text-slate-600' : p.status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {p.status}
                    </span>
                    <span className="font-bold text-slate-800">{(p.expectedAmount / 100).toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</span>
                    <span className="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 6. Ciclo de Vida */}
        <section className="border border-red-200 rounded-xl shadow-sm overflow-hidden bg-white">
          <div className="px-6 py-4 border-b border-red-200 bg-red-50">
            <h3 className="font-bold text-red-800">Ciclo de Vida y Peligro</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-800">{concept.active ? 'Desactivar Concepto' : 'Reactivar Concepto'}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {concept.active 
                    ? 'No se generarán más vencimientos futuros. El historial se conserva intacto.' 
                    : 'Volverán a generarse vencimientos a partir de ahora.'}
                </p>
              </div>
              <button onClick={handleToggleActive} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${concept.active ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                {concept.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
            
            <div className="pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-800">Eliminar Concepto</p>
                <p className="text-sm text-slate-500 mt-1">
                  Solo disponible si no tiene pagos registrados. Borra el concepto de forma permanente.
                </p>
              </div>
              <button 
                onClick={handleDelete}
                disabled={conceptPayments.length > 0}
                className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
INNEREOF
sh update_concept_details.sh