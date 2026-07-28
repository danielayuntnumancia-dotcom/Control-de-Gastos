cat << 'INNEREOF' > src/components/ConceptDetailsView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Concept, Payment, PriceVersion, UserSettings } from '../types';
import { ConceptScheduleEditor } from './ConceptScheduleEditor';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, setDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
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

  // Schedule Editing
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);

  // Notice Days Editing
  const [isEditingNotice, setIsEditingNotice] = useState(false);
  const [noticeDays, setNoticeDays] = useState<string>(concept.exceptionNoticeDays !== null && concept.exceptionNoticeDays !== undefined ? String(concept.exceptionNoticeDays) : '');

  // New Price & Reactivation
  const [isReactivating, setIsReactivating] = useState(false);
  const [reactivatePreview, setReactivatePreview] = useState<{month: number, year: number, dueDate: Date}[] | null>(null);

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
        await updateDoc(doc(db, 'concepts', concept.id), {
          active: false,
          updatedAt: serverTimestamp()
        });
      } else {
        // Prepare preview for reactivation
        const currentYear = new Date().getFullYear();
        const startYear = Math.min(concept.firstPeriod.getFullYear(), currentYear);
        const endYear = currentYear + 1;
        const newOccurrences = [];
        
        for (let year = startYear; year <= endYear; year++) {
          for (let month = 0; month < 12; month++) {
            if (year < concept.firstPeriod.getFullYear() || (year === concept.firstPeriod.getFullYear() && month < concept.firstPeriod.getMonth())) continue;
            
            let shouldGenerate = false;
            if (concept.periodicity === 'monthly') shouldGenerate = true;
            else if (concept.periodicity === 'quarterly') {
              const mSince = (year - concept.firstPeriod.getFullYear()) * 12 + (month - concept.firstPeriod.getMonth());
              if (mSince % 3 === 0) shouldGenerate = true;
            }
            else if (concept.periodicity === 'semiannual') {
              const mSince = (year - concept.firstPeriod.getFullYear()) * 12 + (month - concept.firstPeriod.getMonth());
              if (mSince % 6 === 0) shouldGenerate = true;
            }
            else if (concept.periodicity === 'annual') {
              if (month === concept.firstPeriod.getMonth()) shouldGenerate = true;
            }
            else if (concept.periodicity === 'custom_months') {
              if ((concept.customMonths || []).includes(month)) shouldGenerate = true;
            }
            else if (concept.periodicity === 'one_time') {
              if (year === concept.firstPeriod.getFullYear() && month === concept.firstPeriod.getMonth()) shouldGenerate = true;
            }

            if (shouldGenerate) {
              // Check if future
              const isFuture = year > currentYear || (year === currentYear && month >= new Date().getMonth());
              if (isFuture) {
                let dueDate = new Date(year, month, Number(concept.day) || 1);
                if (concept.dateType === 'month_only') {
                  dueDate = new Date(year, month + 1, 0); // last day
                }
                newOccurrences.push({ month, year, dueDate });
              }
            }
          }
        }
        
        // Filter out existing
        const existingMap = new Set(conceptPayments.map(p => `${p.originalPeriodYear}-${p.originalPeriodMonth}`));
        const toCreate = newOccurrences.filter(o => !existingMap.has(`${o.year}-${o.month}`));
        
        setReactivatePreview(toCreate);
        setIsReactivating(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const confirmReactivate = async () => {
    if (!reactivatePreview) return;
    try {
      const batch = writeBatch(db);
      
      batch.update(doc(db, 'concepts', concept.id), {
        active: true,
        updatedAt: serverTimestamp()
      });

      reactivatePreview.forEach(occ => {
        const newRef = doc(collection(db, 'payments'));
        const newPayment = {
          id: newRef.id,
          userId: concept.userId,
          conceptId: concept.id,
          concept: concept.name,
          dueDate: occ.dueDate,
          originalPeriodMonth: occ.month,
          originalPeriodYear: occ.year,
          expectedAmount: concept.expectedAmount,
          actualAmount: null,
          status: concept.dateType === 'month_only' ? 'PENDING_DATE' : 'PENDING',
          createdAt: new Date()
        };
        batch.set(newRef, {
          ...newPayment,
          createdAt: serverTimestamp()
        });
      });
      
      await batch.commit();
      setIsReactivating(false);
      setReactivatePreview(null);
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
    
    const affected = conceptPayments.filter(p => {
      const pDate = new Date(p.originalPeriodYear || p.dueDate.getFullYear(), p.originalPeriodMonth || p.dueDate.getMonth(), 1);
      if (pDate < validFromDate) return false;
      if (['PAID', 'CANCELED', 'REFUNDED'].includes(p.status)) return false;
      if (p.expectedAmount !== concept.expectedAmount) return false;
      return true;
    });

    setNewPricePreview(affected);
  };

  const handleSaveNewPrice = async () => {
    if (!newPricePreview) return;
    
    const amountCents = Math.round(parseFloat(newPriceAmount.replace(',', '.')) * 100);
    const validFromDate = new Date(newPriceYear, newPriceMonth, 1);
    
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

      const now = new Date();
      if (validFromDate <= now) {
        batch.update(doc(db, 'concepts', concept.id), {
          expectedAmount: amountCents,
          updatedAt: serverTimestamp()
        });
      }

      newPricePreview.forEach(p => {
        batch.update(doc(db, 'payments', p.id), {
          expectedAmount: amountCents,
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      
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

  const monthsList = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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
            {!isEditingSchedule && (
              <button onClick={() => setIsEditingSchedule(true)} className="text-sm text-indigo-600 font-medium hover:underline">
                Editar
              </button>
            )}
          </div>
          <div className="p-6">
            {isEditingSchedule ? (
              <ConceptScheduleEditor 
                concept={concept}
                payments={conceptPayments}
                onCancel={() => setIsEditingSchedule(false)}
                onSaved={() => setIsEditingSchedule(false)}
              />
            ) : (
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
                  <p className="font-medium text-slate-900">{monthsList[concept.firstPeriod.getMonth()]} {concept.firstPeriod.getFullYear()}</p>
                </div>
              </div>
            )}
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
                          {monthsList.map((m, i) => <option key={i} value={i}>{m}</option>)}
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
                      El nuevo precio de <strong className="font-bold">{parseFloat(newPriceAmount.replace(',', '.')).toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</strong> entrará en vigor a partir del periodo <strong className="font-bold">{monthsList[newPriceMonth]} {newPriceYear}</strong>.
                    </p>
                    <p className="text-sm text-slate-700">
                      Se actualizarán <strong className="font-bold">{newPricePreview.length}</strong> vencimientos futuros que aún no han sido pagados y no tienen una corrección individual.
                    </p>
                    
                    {newPricePreview.length > 0 && (
                      <div className="mt-3 max-h-40 overflow-y-auto border border-slate-100 rounded text-xs bg-slate-50">
                        {newPricePreview.map(p => (
                          <div key={p.id} className="p-2 border-b border-slate-100 last:border-0 flex justify-between">
                            <span>{monthsList[p.originalPeriodMonth!]} {p.originalPeriodYear}</span>
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
                      Desde el periodo: {monthsList[pv.validFrom.getMonth()]} {pv.validFrom.getFullYear()}
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
                    <p className="font-medium text-slate-900">{monthsList[p.originalPeriodMonth!]} {p.originalPeriodYear}</p>
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
              {!isReactivating ? (
                <button onClick={handleToggleActive} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${concept.active ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                  {concept.active ? 'Desactivar' : 'Activar'}
                </button>
              ) : (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg w-full mt-4 md:mt-0 md:max-w-md">
                  <p className="text-sm text-indigo-900 font-medium mb-2">Previsualización de Reactivación</p>
                  <p className="text-xs text-indigo-700 mb-3">Se crearán <strong>{reactivatePreview?.length}</strong> vencimientos futuros que faltaban en el calendario.</p>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setIsReactivating(false)} className="px-3 py-1.5 text-xs font-medium text-slate-600">Cancelar</button>
                    <button onClick={confirmReactivate} className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded">Confirmar Reactivación</button>
                  </div>
                </div>
              )}
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
sh generate_details_final.sh