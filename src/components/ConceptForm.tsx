import React, { useState, useMemo, useEffect } from 'react';
import { Concept, Payment } from '../types';
import { doc, setDoc, writeBatch, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning';
import { generateOccurrences } from '../utils/occurrenceEngine';
import { MONTH_NAMES_SHORT, getCategoryColor, getConceptColor } from '../utils/formatUtils';

interface ConceptFormProps {
  user: User | null;
  onClose: () => void;
  initialConcept?: Concept;
}

export function ConceptForm({ user, onClose, initialConcept }: ConceptFormProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
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

  // Step 1 data
  const [name, setName] = useState(initialConcept?.name || '');
  const [category, setCategory] = useState<Concept['category']>(initialConcept?.category || 'Suscripción');
  const [description, setDescription] = useState(initialConcept?.description || '');
  const [amountStr, setAmountStr] = useState(initialConcept ? (initialConcept.expectedAmount / 100).toString() : '');
  const [color, setColor] = useState(initialConcept ? getConceptColor(initialConcept) : getCategoryColor('Suscripción'));

  // Update color automatically when category changes, IF it hasn't been manually customized
  useEffect(() => {
    if (!initialConcept) {
      setColor(getCategoryColor(category));
    }
  }, [category, initialConcept]);

  // Step 2 data
  const [periodicity, setPeriodicity] = useState<Concept['periodicity']>(initialConcept?.periodicity || 'monthly');
  const [dateType, setDateType] = useState<Concept['dateType']>(initialConcept?.dateType || 'exact');
  const [day, setDay] = useState<number | ''>(initialConcept?.day ?? 1);
  const [firstPeriodMonth, setFirstPeriodMonth] = useState<number>(initialConcept ? initialConcept.firstPeriod.getMonth() : new Date().getMonth());
  const [firstPeriodYear, setFirstPeriodYear] = useState<number>(initialConcept ? initialConcept.firstPeriod.getFullYear() : new Date().getFullYear());
  const [customMonths, setCustomMonths] = useState<number[]>(initialConcept?.customMonths || []);
  const [active, setActive] = useState(initialConcept ? initialConcept.active : true);
  const [exceptionNoticeDays, setExceptionNoticeDays] = useState<number | ''>(initialConcept?.exceptionNoticeDays ?? '');
  
  // Determine if form is dirty
  const isDirty = useMemo(() => {
    return (
      name !== (initialConcept?.name || '') ||
      category !== (initialConcept?.category || 'Suscripción') ||
      description !== (initialConcept?.description || '') ||
      amountStr !== (initialConcept ? (initialConcept.expectedAmount / 100).toString() : '') ||
      color !== (initialConcept ? getConceptColor(initialConcept) : getCategoryColor('Suscripción')) ||
      periodicity !== (initialConcept?.periodicity || 'monthly') ||
      dateType !== (initialConcept?.dateType || 'exact') ||
      day !== (initialConcept?.day ?? 1) ||
      firstPeriodMonth !== (initialConcept ? initialConcept.firstPeriod.getMonth() : new Date().getMonth()) ||
      firstPeriodYear !== (initialConcept ? initialConcept.firstPeriod.getFullYear() : new Date().getFullYear()) ||
      JSON.stringify(customMonths) !== JSON.stringify(initialConcept?.customMonths || []) ||
      active !== (initialConcept ? initialConcept.active : true) ||
      exceptionNoticeDays !== (initialConcept?.exceptionNoticeDays ?? '')
    );
  }, [name, category, description, amountStr, color, periodicity, dateType, day, firstPeriodMonth, firstPeriodYear, customMonths, active, exceptionNoticeDays, initialConcept]);

  useUnsavedChangesWarning(isDirty && !isSubmitting);

  const handleClose = () => {
    if (isDirty && !isSubmitting) {
      if (!window.confirm('Tienes cambios sin guardar. ¿Seguro que quieres cerrar el formulario y descartarlos?')) {
        return;
      }
    }
    onClose();
  };

  const amountCents = useMemo(() => {
    const parsed = parseFloat(amountStr.replace(',', '.'));
    return isNaN(parsed) ? 0 : Math.round(parsed * 100);
  }, [amountStr]);

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("El nombre es obligatorio");
      return;
    }
    if (amountStr.trim() === '') {
      alert("El importe es obligatorio");
      return;
    }
    setStep(2);
  };

  const handleToggleMonth = (m: number) => {
    setCustomMonths(prev => 
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  const currentYear = new Date().getFullYear();
  const yearsToGenerate = [currentYear, currentYear + 1];

  const previewOccurrences = useMemo(() => {
    const occurrences = generateOccurrences({
      periodicity,
      dateType,
      day: day === '' ? null : Number(day),
      firstPeriodYear,
      firstPeriodMonth,
      customMonths
    }, yearsToGenerate);

    return occurrences.map(occ => ({
      conceptId: 'preview',
      concept: name,
      expectedAmount: amountCents,
      actualAmount: null,
      status: occ.status,
      dueDate: occ.dueDate,
      originalPeriodMonth: occ.originalPeriodMonth,
      originalPeriodYear: occ.originalPeriodYear,
    })).slice(0, 6);
  }, [periodicity, dateType, day, firstPeriodMonth, firstPeriodYear, customMonths, name, amountCents]);

  const handleSave = async () => {
    if (!user) return;
    if (periodicity === 'custom_months' && customMonths.length === 0) {
      alert("Selecciona al menos un mes.");
      return;
    }

    const isEdit = !!initialConcept;
    const ruleChanged = isEdit && (
      initialConcept.periodicity !== periodicity ||
      initialConcept.dateType !== dateType ||
      initialConcept.day !== (dateType === 'month_only' ? null : Number(day)) ||
      initialConcept.firstPeriod.getTime() !== new Date(firstPeriodYear, firstPeriodMonth, 1).getTime() ||
      JSON.stringify(initialConcept.customMonths) !== JSON.stringify(customMonths)
    );

    if (ruleChanged) {
      if (!confirm("Has modificado las reglas de periodicidad o fecha. Se regenerarán los vencimientos futuros pendientes. ¿Continuar?")) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      const conceptRef = isEdit ? doc(db, 'concepts', initialConcept.id) : doc(collection(db, 'concepts'));
      const conceptData: Concept = {
        id: conceptRef.id,
        userId: user.uid,
        name: name.trim(),
        category,
        description,
        expectedAmount: amountCents,
        color,
        periodicity,
        customMonths,
        dateType,
        day: dateType === 'month_only' ? null : Number(day),
        exceptionNoticeDays: exceptionNoticeDays === '' ? null : Number(exceptionNoticeDays),
        firstPeriod: new Date(firstPeriodYear, firstPeriodMonth, 1),
        active,
        createdAt: isEdit ? initialConcept.createdAt : new Date(),
        updatedAt: new Date()
      };
      
      batch.set(conceptRef, conceptData, { merge: true });

      if (!isEdit || ruleChanged) {
        // If it's an edit and rules changed, delete future pending payments for this concept
        if (ruleChanged) {
          const now = new Date();
          const q = query(
            collection(db, 'payments'), 
            where('conceptId', '==', conceptRef.id),
            where('userId', '==', user.uid),
            where('status', 'in', ['PENDING', 'PENDING_DATE', 'CANCELED'])
          );
          const snap = await getDocs(q);
          snap.forEach(d => {
            // Only delete if dueDate is in the future
            if (d.data().dueDate.toDate() >= now) {
              batch.delete(d.ref);
            }
          });
        }

        // Generate occurrences
        const occurrences = generateOccurrences({
          periodicity,
          dateType,
          day: dateType === 'month_only' ? null : Number(day),
          firstPeriodYear,
          firstPeriodMonth,
          customMonths
        }, yearsToGenerate);

        for (const occ of occurrences) {
          const now = new Date();
          if (!isEdit || occ.dueDate >= now) {
            const occRef = doc(collection(db, 'payments'));
            batch.set(occRef, {
              userId: user.uid,
              conceptId: conceptRef.id,
              concept: conceptData.name,
              expectedAmount: amountCents,
              actualAmount: null,
              status: active ? occ.status : 'CANCELED',
              dueDate: occ.dueDate,
              originalPeriodMonth: occ.originalPeriodMonth,
              originalPeriodYear: occ.originalPeriodYear,
              createdAt: new Date()
            });
          }
        }
      } else if (isEdit && !ruleChanged) {
        // If we just edited basic details, update the pending future occurrences so they have the new name/amount
        const now = new Date();
        now.setHours(0,0,0,0);
        const q = query(
          collection(db, 'payments'), 
          where('conceptId', '==', conceptRef.id),
          where('userId', '==', user.uid),
          where('status', 'in', ['PENDING', 'PENDING_DATE', 'CANCELED'])
        );
        const snap = await getDocs(q);
        
        snap.forEach(d => {
          const data = d.data();
          const dueDate = data.dueDate.toDate();
          
          if (!active) {
            // It's being saved as inactive, cancel all pending payments (even past ones)
            if (data.status === 'PENDING' || data.status === 'PENDING_DATE') {
              batch.update(d.ref, { 
                concept: conceptData.name,
                expectedAmount: amountCents,
                status: 'CANCELED' 
              });
            } else if (dueDate >= now) {
              // It's already canceled, just update name/amount
              batch.update(d.ref, {
                concept: conceptData.name,
                expectedAmount: amountCents
              });
            }
          } else {
            // It's being saved as active
            if (data.status === 'CANCELED' && dueDate >= now) {
              // Restore it
              const params = paramsFromConcept(initialConcept ? { ...initialConcept, ...conceptData } as Concept : conceptData as Concept);
              const year = data.originalPeriodYear !== undefined ? data.originalPeriodYear : dueDate.getFullYear();
              const month = data.originalPeriodMonth !== undefined ? data.originalPeriodMonth : dueDate.getMonth();
              const { status } = computeDueDateAndStatus(year, month, params);
              
              batch.update(d.ref, {
                concept: conceptData.name,
                expectedAmount: amountCents,
                status: status
              });
            } else if (dueDate >= now) {
              // Just update name/amount
              batch.update(d.ref, {
                concept: conceptData.name,
                expectedAmount: amountCents
              });
            }
          }
        });
      }

      await batch.commit();
      onClose();
    } catch (e: unknown) {
      console.error(e);
      alert("Error al guardar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
          <h2 className="text-xl font-bold text-slate-800">
            {step === 1 ? (initialConcept ? 'Editar Concepto (1/2)' : 'Nuevo Concepto (1/2)') : 'Programación (2/2)'}
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 ? (
            <form id="step1" onSubmit={handleNext} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej. Netflix, IBI, Seguro Coche..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                  <select 
                    value={category}
                    onChange={e => setCategory(e.target.value as Concept['category'])}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  >
                    <option value="Suscripción">Suscripción</option>
                    <option value="Impuesto">Impuesto</option>
                    <option value="Tasa">Tasa</option>
                    <option value="Seguro">Seguro</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Importe Previsto (€)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={amountStr}
                    onChange={e => setAmountStr(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción (Opcional)</label>
                <textarea 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none h-20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Antelación de Aviso (Días)</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="number" 
                    min="0"
                    max="365"
                    value={exceptionNoticeDays}
                    onChange={e => setExceptionNoticeDays(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-24 px-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="General"
                  />
                  <span className="text-xs text-slate-500">Dejar vacío para usar la configuración general</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Color (Opcional)</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    className="w-10 h-10 border-0 rounded cursor-pointer"
                  />
                  <span className="text-xs text-slate-500">Selecciona un color para identificarlo fácilmente</span>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Periodicidad</label>
                  <select 
                    value={periodicity}
                    onChange={e => setPeriodicity(e.target.value as Concept['periodicity'])}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  >
                    <option value="monthly">Mensual</option>
                    <option value="quarterly">Trimestral</option>
                    <option value="semiannual">Semestral</option>
                    <option value="annual">Anual</option>
                    <option value="custom_months">Meses Personalizados</option>
                    <option value="one_time">Pago Único</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Primer Periodo</label>
                  <div className="flex gap-2">
                    <select 
                      value={firstPeriodMonth}
                      onChange={e => setFirstPeriodMonth(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    >
                      {MONTH_NAMES_SHORT.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <input 
                      type="number"
                      value={firstPeriodYear}
                      onChange={e => setFirstPeriodYear(Number(e.target.value))}
                      className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {periodicity === 'custom_months' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Selecciona los meses</label>
                  <div className="flex flex-wrap gap-2">
                    {MONTH_NAMES_SHORT.map((m, i) => (
                      <button 
                        key={i}
                        onClick={() => handleToggleMonth(i)}
                        className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                          customMonths.includes(i) ? 'bg-indigo-100 border-indigo-300 text-indigo-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Fecha</label>
                  <select 
                    value={dateType}
                    onChange={e => setDateType(e.target.value as Concept['dateType'])}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  >
                    <option value="exact">Día exacto</option>
                    <option value="approximate">Día aproximado</option>
                    <option value="month_only">Solo mes (sin día)</option>
                  </select>
                </div>
                
                {dateType !== 'month_only' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Día (1-31)</label>
                    <input 
                      type="number" 
                      min="1" max="31"
                      value={day}
                      onChange={e => setDay(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Previsualización (Próximos Vencimientos)</label>
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                  {previewOccurrences.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center">No se generarán vencimientos con la configuración actual.</p>
                  ) : (
                    <ul className="space-y-2">
                      {previewOccurrences.map((occ, i) => (
                        <li key={i} className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                          <span className="text-slate-600">
                            {dateType === 'month_only' 
                              ? `${MONTH_NAMES_SHORT[occ.dueDate.getMonth()]} ${occ.dueDate.getFullYear()} (sin día)` 
                              : dateType === 'approximate'
                              ? `Aprox. ${occ.dueDate.getDate()} de ${MONTH_NAMES_SHORT[occ.dueDate.getMonth()]} ${occ.dueDate.getFullYear()}`
                              : `${occ.dueDate.getDate()} de ${MONTH_NAMES_SHORT[occ.dueDate.getMonth()]} ${occ.dueDate.getFullYear()}`
                            }
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{(occ.expectedAmount / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                            {occ.status === 'PENDING_DATE' && (
                              <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">DÍA INVÁLIDO</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-200">Se generarán vencimientos automáticamente para los años activos (actualmente hasta {yearsToGenerate[yearsToGenerate.length - 1]}).</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-between">
          {step === 1 ? (
            <>
              <button type="button" onClick={handleClose} className="px-4 py-2 text-slate-600 font-medium hover:text-slate-800 transition-colors">
                Cancelar
              </button>
              <button type="submit" form="step1" className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors">
                Siguiente
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setStep(1)} className="px-4 py-2 text-slate-600 font-medium hover:text-slate-800 transition-colors">
                Atrás
              </button>
              <button 
                type="button" 
                onClick={handleSave} 
                disabled={isSubmitting || isOffline}
                className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Guardando...' : 'Confirmar y Guardar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
