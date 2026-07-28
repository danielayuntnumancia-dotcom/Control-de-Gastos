import React, { useState, useMemo } from 'react';
import { Concept, Payment } from '../types';
import { db } from '../lib/firebase';
import { doc, updateDoc, writeBatch, serverTimestamp, collection } from 'firebase/firestore';

interface Props {
  concept: Concept;
  payments: Payment[];
  onCancel: () => void;
  onSaved: () => void;
}

const monthsList = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function ConceptScheduleEditor({ concept, payments, onCancel, onSaved }: Props) {
  const [periodicity, setPeriodicity] = useState<Concept['periodicity']>(concept.periodicity);
  const [dateType, setDateType] = useState<Concept['dateType']>(concept.dateType);
  const [day, setDay] = useState<number | ''>(concept.day ?? 1);
  const [firstPeriodMonth, setFirstPeriodMonth] = useState<number>(concept.firstPeriod.getMonth());
  const [firstPeriodYear, setFirstPeriodYear] = useState<number>(concept.firstPeriod.getFullYear());
  const [customMonths, setCustomMonths] = useState<number[]>(concept.customMonths || []);
  
  const [previewMode, setPreviewMode] = useState(false);
  const [conflictResolution, setConflictResolution] = useState<'keep' | 'cancel'>('cancel');

  const ruleChanged = (
    concept.periodicity !== periodicity ||
    concept.dateType !== dateType ||
    concept.day !== (dateType === 'month_only' ? null : Number(day)) ||
    concept.firstPeriod.getTime() !== new Date(firstPeriodYear, firstPeriodMonth, 1).getTime() ||
    JSON.stringify(concept.customMonths) !== JSON.stringify(customMonths)
  );

  const conceptPayments = useMemo(() => {
    return payments.filter(p => p.conceptId === concept.id);
  }, [payments, concept.id]);

  const previewAnalysis = useMemo(() => {
    if (!ruleChanged) return null;

    // Calculate new theoretical schedule (for current and next year, or from firstPeriod if later)
    const currentYear = new Date().getFullYear();
    const startYear = Math.min(firstPeriodYear, currentYear);
    const endYear = currentYear + 1;

    const newOccurrences: { month: number, year: number, dueDate: Date, status: any }[] = [];
    
    for (let year = startYear; year <= endYear; year++) {
      for (let month = 0; month < 12; month++) {
        if (year < firstPeriodYear || (year === firstPeriodYear && month < firstPeriodMonth)) continue;
        
        let shouldGenerate = false;
        if (periodicity === 'monthly') shouldGenerate = true;
        else if (periodicity === 'quarterly') {
          const mSince = (year - firstPeriodYear) * 12 + (month - firstPeriodMonth);
          if (mSince % 3 === 0) shouldGenerate = true;
        }
        else if (periodicity === 'semiannual') {
          const mSince = (year - firstPeriodYear) * 12 + (month - firstPeriodMonth);
          if (mSince % 6 === 0) shouldGenerate = true;
        }
        else if (periodicity === 'annual') {
          if (month === firstPeriodMonth) shouldGenerate = true;
        }
        else if (periodicity === 'custom_months') {
          if (customMonths.includes(month)) shouldGenerate = true;
        }
        else if (periodicity === 'one_time') {
          if (year === firstPeriodYear && month === firstPeriodMonth) shouldGenerate = true;
        }

        if (shouldGenerate) {
          const targetDay = Number(day) || 1;
          let dueDate = new Date(year, month, targetDay);
          let status: any = 'PENDING';
          if (dateType !== 'month_only' && dueDate.getMonth() !== month) {
            status = 'PENDING_DATE';
            dueDate = new Date(year, month, 1);
          } else if (dateType === 'month_only') {
            dueDate = new Date(year, month, 1);
          } else if (dateType === 'approximate') {
            status = 'PENDING_DATE';
          }
          newOccurrences.push({ month, year, dueDate, status });
        }
      }
    }

    const toCreate: typeof newOccurrences = [];
    const toKeep: Payment[] = [];
    const toCancel: Payment[] = [];
    const unmodified: Payment[] = [];

    // Analyze existing payments
    const existingMap = new Map<string, Payment>(conceptPayments.map(p => [`${p.originalPeriodYear}-${p.originalPeriodMonth}`, p]));

    // Check what to create and what stays unchanged
    newOccurrences.forEach(occ => {
      const existing = existingMap.get(`${occ.year}-${occ.month}`);
      if (!existing) {
        // We only create if it's not in the past
        const now = new Date();
        const isFuture = occ.year > now.getFullYear() || (occ.year === now.getFullYear() && occ.month >= now.getMonth());
        if (isFuture) {
          toCreate.push(occ);
        }
      } else {
        unmodified.push(existing);
      }
    });

    // Check what leaves schedule
    const newOccMap = new Set(newOccurrences.map(o => `${o.year}-${o.month}`));
    conceptPayments.forEach(p => {
      if (!newOccMap.has(`${p.originalPeriodYear}-${p.originalPeriodMonth}`)) {
        // It's not in the new schedule
        // If it's PAID or historical or CANCELED, we ignore (don't cancel it again)
        // If it's a future PENDING, it's a conflict
        const isFuture = p.originalPeriodYear! > currentYear || (p.originalPeriodYear === currentYear && p.originalPeriodMonth! >= new Date().getMonth());
        if (isFuture && !['PAID', 'CANCELED', 'REFUNDED'].includes(p.status)) {
          toCancel.push(p);
        }
      }
    });

    return { toCreate, toCancel, unmodified };
  }, [ruleChanged, periodicity, dateType, day, firstPeriodMonth, firstPeriodYear, customMonths, conceptPayments]);

  const toggleMonth = (m: number) => {
    if (customMonths.includes(m)) {
      setCustomMonths(customMonths.filter(x => x !== m));
    } else {
      setCustomMonths([...customMonths, m].sort((a,b) => a - b));
    }
  };

  const handleSave = async () => {
    if (!previewAnalysis) return;
    
    try {
      const batch = writeBatch(db);
      
      // Update concept
      batch.update(doc(db, 'concepts', concept.id), {
        periodicity,
        dateType,
        day: dateType === 'month_only' ? null : Number(day),
        firstPeriod: new Date(firstPeriodYear, firstPeriodMonth, 1),
        customMonths,
        updatedAt: serverTimestamp()
      });

      // Cancel conflicts if selected
      if (conflictResolution === 'cancel') {
        previewAnalysis.toCancel.forEach(p => {
          batch.update(doc(db, 'payments', p.id), {
            status: 'CANCELED',
            updatedAt: serverTimestamp()
          });
        });
      }

      // Create new ones
      previewAnalysis.toCreate.forEach(occ => {
        const newRef = doc(collection(db, 'payments'));
        const newPayment: Payment = {
          id: newRef.id,
          userId: concept.userId,
          conceptId: concept.id,
          concept: concept.name,
          dueDate: occ.dueDate,
          originalPeriodMonth: occ.month,
          originalPeriodYear: occ.year,
          expectedAmount: concept.expectedAmount, // Current price
          actualAmount: null,
          status: occ.status,
          createdAt: new Date()
        };
        batch.set(newRef, {
          ...newPayment,
          createdAt: serverTimestamp()
        });
      });

      await batch.commit();
      onSaved();
    } catch (e) {
      console.error(e);
      alert("Error al guardar programación");
    }
  };

  return (
    <div className="space-y-6">
      {!previewMode ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Periodicidad</label>
              <select 
                value={periodicity}
                onChange={e => setPeriodicity(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="monthly">Mensual</option>
                <option value="quarterly">Trimestral</option>
                <option value="semiannual">Semestral</option>
                <option value="annual">Anual</option>
                <option value="custom_months">Meses específicos</option>
                <option value="one_time">Pago Único</option>
              </select>
            </div>
            {periodicity === 'custom_months' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Selecciona los meses</label>
                <div className="flex flex-wrap gap-1">
                  {monthsList.map((m, i) => (
                    <button 
                      key={i} 
                      onClick={() => toggleMonth(i)}
                      className={`px-2 py-1 text-xs rounded-full border ${customMonths.includes(i) ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                    >
                      {m.substring(0,3)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de fecha</label>
              <select 
                value={dateType}
                onChange={e => setDateType(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="exact">Día exacto</option>
                <option value="approximate">Día aproximado</option>
                <option value="month_only">No sé el día exacto</option>
              </select>
            </div>
            {dateType !== 'month_only' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Día del mes (1-31)</label>
                <input 
                  type="number" min="1" max="31" 
                  value={day} 
                  onChange={e => setDay(Number(e.target.value))} 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Primer Periodo (Mes)</label>
              <select 
                value={firstPeriodMonth}
                onChange={e => setFirstPeriodMonth(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                {monthsList.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Primer Periodo (Año)</label>
              <input 
                type="number" 
                value={firstPeriodYear} 
                onChange={e => setFirstPeriodYear(Number(e.target.value))} 
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600">Descartar</button>
            <button 
              onClick={() => {
                if (periodicity === 'custom_months' && customMonths.length === 0) {
                  alert("Selecciona al menos un mes");
                  return;
                }
                if (!ruleChanged) {
                  onCancel();
                  return;
                }
                setPreviewMode(true);
              }} 
              disabled={!ruleChanged}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg disabled:opacity-50"
            >
              Previsualizar Cambios
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-lg">
            <h4 className="font-bold text-slate-800 mb-3">Resumen de Cambios</h4>
            <ul className="text-sm text-slate-600 space-y-2">
              <li>• Se crearán <strong className="font-bold text-indigo-600">{previewAnalysis?.toCreate.length}</strong> nuevos vencimientos.</li>
              <li>• Se mantendrán <strong className="font-bold text-slate-900">{previewAnalysis?.unmodified.length}</strong> vencimientos actuales.</li>
            </ul>

            {previewAnalysis && previewAnalysis.toCancel.length > 0 && (
              <div className="mt-6 p-4 border border-orange-200 bg-orange-50 rounded-lg">
                <p className="text-sm font-bold text-orange-800 mb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">warning</span>
                  Conflictos detectados
                </p>
                <p className="text-sm text-orange-700 mb-3">
                  Existen <strong className="font-bold">{previewAnalysis.toCancel.length}</strong> vencimientos futuros pendientes que ya no encajan en la nueva regla. ¿Qué deseas hacer con ellos?
                </p>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="radio" checked={conflictResolution === 'cancel'} onChange={() => setConflictResolution('cancel')} className="mt-1 text-indigo-600" />
                    <span><strong className="font-bold">Cancelar:</strong> Pasar a estado Cancelado para limpiar la agenda.</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="radio" checked={conflictResolution === 'keep'} onChange={() => setConflictResolution('keep')} className="mt-1 text-indigo-600" />
                    <span><strong className="font-bold">Conservar:</strong> Mantenerlos como vencimientos pendientes excepcionales.</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setPreviewMode(false)} className="px-4 py-2 text-sm font-medium text-slate-600">Atrás</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg">Confirmar Programación</button>
          </div>
        </div>
      )}
    </div>
  );
}
