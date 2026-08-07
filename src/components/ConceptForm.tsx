import React, { useState, useMemo, useEffect } from 'react';
import { Concept, Payment } from '../types';
import { doc, setDoc, addDoc, writeBatch, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning';
import { generateOccurrences, paramsFromConcept, computeDueDateAndStatus } from '../utils/occurrenceEngine';
import { MONTH_NAMES_SHORT, getCategoryColor, getConceptColor, generateAutomaticCategoryColor } from '../utils/formatUtils';
import { useData } from '../context/DataContext';

interface ConceptFormProps {
  user: User | null;
  onClose: () => void;
  initialConcept?: Concept;
}

export function ConceptForm({ user, onClose, initialConcept }: ConceptFormProps) {
  const { customCategories } = useData();
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

  // New Category Modal states
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'expense' | 'income' | 'both'>('expense');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Step 1 data
  const [type, setType] = useState<Concept['type']>(initialConcept?.type || 'expense');
  const [name, setName] = useState(initialConcept?.name || '');
  const [category, setCategory] = useState<Concept['category']>(initialConcept?.category || (initialConcept?.type === 'income' ? 'Salario' : 'Suscripción'));
  const [description, setDescription] = useState(initialConcept?.description || '');
  const [amountStr, setAmountStr] = useState(initialConcept ? (initialConcept.expectedAmount / 100).toString() : '');
  const [amountType, setAmountType] = useState<Concept['amountType']>(initialConcept?.amountType || 'exact');
  const [color, setColor] = useState(initialConcept ? getConceptColor(initialConcept) : getCategoryColor('Suscripción'));

  // Update color automatically when category changes
  useEffect(() => {
    const customMatch = customCategories.find(c => c.name === category);
    setColor(getCategoryColor(category, customMatch?.color));
  }, [category, customCategories]);

  useEffect(() => {
    if (!initialConcept) {
      setCategory(type === 'income' ? 'Salario' : 'Suscripción');
    }
  }, [type, initialConcept]);

  const handleCreateCategory = async () => {
    const catName = newCatName.trim();
    if (!catName) return;

    const uid = auth.currentUser?.uid || user?.uid;
    if (!uid) {
      alert("No se detectó la sesión del usuario. Por favor vuelve a iniciar sesión.");
      return;
    }

    const autoColor = generateAutomaticCategoryColor(catName);
    
    // Cierra el modal y actualiza la UI al instante
    setCategory(catName as any);
    setColor(autoColor);
    setNewCatName('');
    setShowNewCatModal(false);

    // Guarda en Firestore en segundo plano
    try {
      await addDoc(collection(db, 'categories'), {
        userId: uid,
        name: catName,
        type: newCatType,
        color: autoColor,
        createdAt: new Date()
      });
    } catch (err: any) {
      console.error("Error saving category:", err);
    }
  };

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
      type !== (initialConcept?.type || 'expense') ||
      name !== (initialConcept?.name || '') ||
      category !== (initialConcept?.category || (initialConcept?.type === 'income' ? 'Salario' : 'Suscripción')) ||
      description !== (initialConcept?.description || '') ||
      amountStr !== (initialConcept ? (initialConcept.expectedAmount / 100).toString() : '') ||
      amountType !== (initialConcept?.amountType || 'exact') ||
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
  }, [type, name, category, description, amountStr, amountType, color, periodicity, dateType, day, firstPeriodMonth, firstPeriodYear, customMonths, active, exceptionNoticeDays, initialConcept]);

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
  const startYear = Math.min(firstPeriodYear, currentYear);
  const endYear = currentYear + 1;
  const yearsToGenerate = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);

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
      type: type || 'expense',
      expectedAmount: amountCents,
      isAmountApproximate: amountType === 'approximate',
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
    const initialFirstPeriodTime = initialConcept?.firstPeriod
      ? (typeof (initialConcept.firstPeriod as any).toDate === 'function' 
          ? (initialConcept.firstPeriod as any).toDate().getTime() 
          : new Date(initialConcept.firstPeriod).getTime())
      : 0;
    const newFirstPeriodTime = new Date(firstPeriodYear, firstPeriodMonth, 1).getTime();

    const ruleChanged = isEdit && (
      initialConcept.periodicity !== periodicity ||
      initialConcept.dateType !== dateType ||
      initialConcept.day !== (dateType === 'month_only' ? null : Number(day)) ||
      initialFirstPeriodTime !== newFirstPeriodTime ||
      JSON.stringify(initialConcept.customMonths) !== JSON.stringify(customMonths)
    );

    if (ruleChanged) {
      if (!confirm("Has modificado las reglas de periodicidad o fecha. Se regenerarán los vencimientos pendientes. ¿Continuar?")) {
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
        type: type || 'expense',
        category,
        description,
        expectedAmount: amountCents,
        amountType: amountType,
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
        // Query ALL existing payments for this concept to avoid duplicating receipts
        const qExisting = query(
          collection(db, 'payments'),
          where('conceptId', '==', conceptRef.id),
          where('userId', '==', user.uid)
        );
        const snapExisting = await getDocs(qExisting);
        const existingKeySet = new Set<string>();

        snapExisting.docs.forEach(d => {
          const data = d.data();
          const pYear = data.originalPeriodYear !== undefined ? data.originalPeriodYear : (data.dueDate?.toDate ? data.dueDate.toDate().getFullYear() : new Date(data.dueDate).getFullYear());
          const pMonth = data.originalPeriodMonth !== undefined ? data.originalPeriodMonth : (data.dueDate?.toDate ? data.dueDate.toDate().getMonth() : new Date(data.dueDate).getMonth());
          const key = `${pYear}-${pMonth}`;

          if (ruleChanged) {
            const now = new Date();
            const pDate = data.dueDate?.toDate ? data.dueDate.toDate() : new Date(data.dueDate);
            const isPendingOrCanceled = ['PENDING', 'PENDING_DATE', 'CANCELED'].includes(data.status);
            const beforeFirstPeriod = pYear < firstPeriodYear || (pYear === firstPeriodYear && pMonth < firstPeriodMonth);
            
            // Delete if pending/canceled AND (future OR falls before the new firstPeriod)
            if (isPendingOrCanceled && (pDate >= now || beforeFirstPeriod)) {
              batch.delete(d.ref);
              return;
            }
          }

          existingKeySet.add(key);
        });

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
          const key = `${occ.originalPeriodYear}-${occ.originalPeriodMonth}`;
          if (!existingKeySet.has(key)) {
            const occRef = doc(collection(db, 'payments'));
            batch.set(occRef, {
              userId: user.uid,
              conceptId: conceptRef.id,
              concept: conceptData.name,
              type: conceptData.type,
              expectedAmount: amountCents,
              isAmountApproximate: conceptData.amountType === 'approximate',
              actualAmount: null,
              status: active ? occ.status : 'CANCELED',
              dueDate: occ.dueDate,
              originalPeriodMonth: occ.originalPeriodMonth,
              originalPeriodYear: occ.originalPeriodYear,
              createdAt: new Date()
            });
            existingKeySet.add(key);
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
                type: conceptData.type,
                expectedAmount: amountCents,
                isAmountApproximate: conceptData.amountType === 'approximate',
                status: 'CANCELED' 
              });
            } else if (dueDate >= now) {
              // It's already canceled, just update name/amount
              batch.update(d.ref, {
                concept: conceptData.name,
                type: conceptData.type,
                expectedAmount: amountCents,
                isAmountApproximate: conceptData.amountType === 'approximate'
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
                type: conceptData.type,
                expectedAmount: amountCents,
                isAmountApproximate: conceptData.amountType === 'approximate',
                status: status
              });
            } else if (dueDate >= now) {
              // Just update name/amount
              batch.update(d.ref, {
                concept: conceptData.name,
                type: conceptData.type,
                expectedAmount: amountCents,
                isAmountApproximate: conceptData.amountType === 'approximate'
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
              <div className="flex bg-slate-100 p-1 rounded-lg mb-6 w-full">
                <button
                  type="button"
                  onClick={() => setType('expense')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === 'expense' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Gasto
                </button>
                <button
                  type="button"
                  onClick={() => setType('income')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === 'income' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Ingreso
                </button>
              </div>

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
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-slate-700">Categoría</label>
                    <button 
                      type="button" 
                      onClick={() => { setNewCatType(type || 'expense'); setShowNewCatModal(true); }}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                    >
                      <span className="material-symbols-outlined text-xs">add</span>
                      Nueva
                    </button>
                  </div>
                  <select 
                    value={category}
                    onChange={e => setCategory(e.target.value as Concept['category'])}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  >
                    {type === 'expense' ? (
                      <>
                        <option value="Suscripción">Suscripción</option>
                        <option value="Impuesto">Impuesto</option>
                        <option value="Tasa">Tasa</option>
                        <option value="Seguro">Seguro</option>
                        <option value="Hipoteca">Hipoteca</option>
                        <option value="Préstamo">Préstamo</option>
                        <option value="Ahorro">Ahorro</option>
                        <option value="Otro">Otro</option>
                        {customCategories.filter(c => c.type === 'expense' || c.type === 'both').map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                        {!['Suscripción', 'Impuesto', 'Tasa', 'Seguro', 'Hipoteca', 'Préstamo', 'Ahorro', 'Otro'].includes(category) && !customCategories.some(c => c.name === category) && category && (
                          <option value={category}>{category}</option>
                        )}
                      </>
                    ) : (
                      <>
                        <option value="Salario">Salario</option>
                        <option value="Paga Extra">Paga Extra</option>
                        <option value="Ingreso Extra">Ingreso Extra</option>
                        <option value="Ahorro">Ahorro</option>
                        <option value="Otro">Otro</option>
                        {customCategories.filter(c => c.type === 'income' || c.type === 'both').map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                        {!['Salario', 'Paga Extra', 'Ingreso Extra', 'Ahorro', 'Otro'].includes(category) && !customCategories.some(c => c.name === category) && category && (
                          <option value={category}>{category}</option>
                        )}
                      </>
                    )}
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
                            <span className={`font-medium ${(occ as any).type === 'income' ? 'text-green-600' : 'text-slate-800'}`}>
                              {(occ as any).isAmountApproximate ? '~' : ''}{(occ as any).type === 'income' ? '+' : '-'}{(occ.expectedAmount / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                            </span>
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

      {/* MODAL NUEVA CATEGORÍA */}
      {showNewCatModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-600">category</span>
                Nueva Categoría
              </h3>
              <button 
                type="button" 
                onClick={() => setShowNewCatModal(false)} 
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nombre de la Categoría</label>
                <input 
                  type="text" 
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newCatName.trim()) handleCreateCategory(); }}
                  placeholder="Ej. Mascotas, Viajes, Gimnasio..."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Aplica a</label>
                <select 
                  value={newCatType}
                  onChange={e => setNewCatType(e.target.value as any)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="expense">Solo Gastos</option>
                  <option value="income">Solo Ingresos</option>
                  <option value="both">Ambos (Gastos e Ingresos)</option>
                </select>
              </div>

              {newCatName.trim() && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Color asignado automáticamente:</span>
                  <div className="flex items-center gap-2 font-bold text-slate-800">
                    <span 
                      className="w-4 h-4 rounded-full border shadow-sm flex-shrink-0" 
                      style={{ backgroundColor: generateAutomaticCategoryColor(newCatName.trim()) }} 
                    />
                    <span className="text-[11px] text-slate-500 font-mono">{generateAutomaticCategoryColor(newCatName.trim())}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowNewCatModal(false)}
                  className="flex-1 py-2.5 text-xs font-semibold border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={() => handleCreateCategory()}
                  disabled={!newCatName.trim()}
                  className="flex-1 py-2.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  Crear Categoría
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
