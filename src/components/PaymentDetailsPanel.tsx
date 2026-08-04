import React, { useEffect, useState } from 'react';
import { Payment, Concept } from '../types';
import { formatPaymentDate, MONTH_NAMES, formatAmount } from '../utils/formatUtils';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface PaymentDetailsPanelProps {
  payment: Payment;
  concept?: Concept;
  onClose: () => void;
}

type ActionState = 'view' | 'pay' | 'correct' | 'delay' | 'resolve_date' | 'cancel' | 'saving' | 'error';

export function PaymentDetailsPanel({ payment, concept, onClose }: PaymentDetailsPanelProps) {
  
  
  const [actionState, setActionState] = useState<ActionState>('view');
  const [errorMessage, setErrorMessage] = useState('');

  // Form states
  const [actualAmount, setActualAmount] = useState((payment.expectedAmount / 100).toString());
  const [actualDate, setActualDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [effectiveDate, setEffectiveDate] = useState(() => {
    const d = payment.dueDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [delayedMark, setDelayedMark] = useState(false);
  const [description, setDescription] = useState(payment.description || '');

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement;
    return () => {
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    };
  }, []);

  // Keep fresh copies if payment prop changes (e.g., from Firestore sync while open)
  useEffect(() => {
    if (actionState === 'view') {
      setActualAmount(((payment.actualAmount ?? payment.expectedAmount) / 100).toString());
      if (payment.actualDate) {
        const d = payment.actualDate;
        setActualDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      } else {
        const d = new Date();
        setActualDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
      const e = payment.dueDate;
      setEffectiveDate(`${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`);
      setDelayedMark(payment.isDelayed === true);
      setDescription(payment.description || '');
    }
  }, [payment, actionState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const originalMonth = payment.originalPeriodMonth !== undefined ? payment.originalPeriodMonth : payment.dueDate.getMonth();
  const originalYear = payment.originalPeriodYear !== undefined ? payment.originalPeriodYear : payment.dueDate.getFullYear();

  let statusClass = "text-slate-600 bg-slate-100";
  let statusText: string = payment.status;
  
  if (payment.status === 'PAID') { statusClass = "text-green-700 bg-green-100"; statusText = "Pagado"; }
  else if (payment.status === 'OVERDUE') { statusClass = "text-red-700 bg-red-100"; statusText = "Vencido"; }
  else if (payment.status === 'APPROX_OVERDUE') { statusClass = "text-orange-700 bg-orange-100"; statusText = "Revisar"; }
  else if (payment.status === 'PENDING') { statusClass = "text-slate-700 bg-slate-100"; statusText = "Pendiente"; }
  else if (payment.status === 'PENDING_DATE') { statusClass = "text-orange-700 bg-orange-100"; statusText = "Falta fecha"; }
  else if (payment.status === 'CANCELED') { statusClass = "text-slate-500 bg-slate-200"; statusText = "Cancelado"; }

  const expectedFormatted = formatAmount(payment.expectedAmount, payment.type || 'expense', isApprox);
  const currentActualFormatted = payment.actualAmount !== null ? (payment.actualAmount / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : null;
  const currentDiferencia = payment.status === 'PAID' && payment.actualAmount !== null ? payment.actualAmount - payment.expectedAmount : null;
  const isApprox = payment.isAmountApproximate || concept?.amountType === 'approximate';

  const handleUpdate = async (updates: Partial<Payment>, originalAction: ActionState) => {
    setActionState('saving');
    setErrorMessage('');
    try {
      const ref = doc(db, 'payments', payment.id);
      await updateDoc(ref, {
        ...updates,
        updatedAt: new Date()
      });
      setActionState('view');
    } catch (e: unknown) {
      console.error(e);
      setErrorMessage(e instanceof Error ? e.message : 'Error al guardar');
      setActionState(originalAction);
    }
  };

  const submitPay = () => {
    const amt = parseFloat(actualAmount.replace(',', '.'));
    if (isNaN(amt)) {
      setErrorMessage("Importe inválido"); return;
    }
    const [y, m, d] = actualDate.split('-').map(Number);
    handleUpdate({
      status: 'PAID',
      actualAmount: Math.round(amt * 100),
      actualDate: new Date(y, m - 1, d),
      description: description.trim()
    }, actionState);
  };

  const submitDelay = () => {
    const [y, m, d] = effectiveDate.split('-').map(Number);
    const newDueDate = new Date(y, m - 1, d);

    // If it's delayed to another month, status is actually just whatever it normally is (e.g. PENDING).
    // Or if it was OVERDUE before... wait, if they change the date to the future, it becomes PENDING!
    // If they change it to the past, it might become OVERDUE again.
    // For simplicity, we can just say it is PENDING, because they just changed the effective date to a new one.
    // Or we compute it like in submitRestoreDate. Let's just set it to PENDING and let other processes (or here) figure it out if it's strictly in the past.
    // Given the prompt: "transiciones: cualquier vencimiento no cancelado -> aplazado mediante fecha efectiva". Let's set PENDING and isDelayed.
    
    const today = new Date();
    today.setHours(0,0,0,0);
    let newStatus: Payment['status'] = 'PENDING';
    if (newDueDate < today) {
      if (concept?.dateType === 'exact') newStatus = 'OVERDUE';
      else if (concept?.dateType === 'approximate') newStatus = 'APPROX_OVERDUE';
    }

    handleUpdate({
      status: newStatus,
      isDelayed: delayedMark,
      dueDate: newDueDate,
      description: description.trim()
    }, actionState);
  };

  const submitRestoreDate = () => {
    if (!concept) return;
    const targetDay = concept.day === null || concept.day === undefined ? 1 : Number(concept.day);
    let newDueDate = new Date(originalYear, originalMonth, targetDay);
    let newStatus: Payment['status'] = 'PENDING';
    
    if (concept.dateType !== 'month_only') {
      if (newDueDate.getMonth() !== originalMonth) {
        newStatus = 'PENDING_DATE';
        newDueDate = new Date(originalYear, originalMonth + 1, 0);
      }
    }
    
    handleUpdate({
      status: newStatus,
      isDelayed: false,
      dueDate: newDueDate,
      description: description.trim()
    }, actionState);
  };

  const submitCancel = () => {
    handleUpdate({
      status: 'CANCELED',
      description: description.trim()
    }, actionState);
  };

  const submitReopen = () => {
    // Determine state based on dates
    const today = new Date();
    today.setHours(0,0,0,0);
    const isPast = payment.dueDate < today;
    
    let newStatus: Payment['status'] = 'PENDING';

    if (concept?.dateType !== 'month_only' && (payment.dueDate.getMonth() !== originalMonth || payment.dueDate.getFullYear() !== originalYear) && !payment.isDelayed) {
      newStatus = 'PENDING_DATE';
    } else if (isPast) {
      if (concept?.dateType === 'exact') newStatus = 'OVERDUE';
      else if (concept?.dateType === 'approximate') newStatus = 'APPROX_OVERDUE';
    }
    
    handleUpdate({
      status: newStatus,
      actualAmount: null,
      actualDate: undefined
    }, actionState);
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity" onClick={onClose}></div>
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col transform transition-transform duration-300">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">Detalle del Pago</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-2xl font-bold text-slate-900">{payment.concept}</h3>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full ${statusClass}`}>
                {statusText}
              </span>
            </div>
            <p className="text-sm font-medium text-indigo-600 bg-indigo-50 inline-block px-2 py-0.5 rounded">
              {concept?.category || 'Sin categoría'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Periodo original</p>
              <p className="text-sm font-semibold text-slate-800">{MONTH_NAMES[originalMonth]} {originalYear}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha / Precisión</p>
              <p className="text-sm font-semibold text-slate-800">{formatPaymentDate(payment, concept)}</p>
            </div>
          </div>

          {/* VIEW MODE */}
          {actionState === 'view' && (
            <>
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Datos Económicos</h4>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-600">{payment.type === 'income' ? 'Ingreso previsto' : 'Importe previsto'}</span>
                  <span className="text-lg font-bold text-slate-900">{expectedFormatted}</span>
                </div>

                {payment.status === 'PAID' && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-600">{payment.type === 'income' ? 'Ingreso real' : 'Importe real pagado'}</span>
                      <span className="text-lg font-bold text-green-700">{currentActualFormatted || expectedFormatted}</span>
                    </div>
                    {currentDiferencia !== null && currentDiferencia !== 0 && (
                      <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                        <span className="text-sm font-medium text-slate-600">Diferencia</span>
                        <span className={`text-sm font-bold ${currentDiferencia > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {currentDiferencia > 0 ? '+' : ''}{(currentDiferencia / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                          <span className="text-xs font-medium ml-1">({currentDiferencia > 0 ? 'Sobrecoste' : 'Ahorro o Abono'})</span>
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {payment.isDelayed && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
                  <span className="material-symbols-outlined text-blue-500">update</span>
                  <div>
                    <h4 className="text-sm font-bold text-blue-800 mb-1">Pago Aplazado</h4>
                    <p className="text-xs text-blue-700">Este movimiento pertenece a {MONTH_NAMES[originalMonth]} {originalYear} pero ha sido aplazado.</p>
                  </div>
                </div>
              )}
              
              {payment.description && (
                <div>
                  <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-3">Observaciones</h4>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{payment.description}</p>
                </div>
              )}
            </>
          )}

          {/* FORMS */}
          {(actionState === 'pay' || actionState === 'correct') && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
                {actionState === 'pay' ? 'Marcar como Pagado/Cobrado' : 'Corregir Pago/Cobro'}
              </h4>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Importe Real (€)</label>
                {isApprox && actionState === 'pay' && (
                  <div className="mb-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800 flex items-start gap-2">
                    <span className="material-symbols-outlined text-sm">warning</span>
                    <p>La cantidad prevista era aproximada. Por favor, asegúrate de introducir el importe exacto final.</p>
                  </div>
                )}
                <input 
                  type="number" step="0.01" 
                  value={actualAmount} onChange={e => setActualAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
                {(() => {
                  const amt = parseFloat(actualAmount.replace(',', '.'));
                  if (!isNaN(amt)) {
                    const diff = Math.round(amt * 100) - payment.expectedAmount;
                    if (diff !== 0) {
                      return (
                        <p className={`text-xs mt-1 font-medium ${diff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          Diferencia: {diff > 0 ? '+' : ''}{(diff / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </p>
                      );
                    }
                  }
                  return null;
                })()}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha de pago real</label>
                <input 
                  type="date"
                  value={actualDate} onChange={e => setActualDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observaciones (Opcional)</label>
                <textarea 
                  value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg" rows={2}
                />
              </div>
            </div>
          )}

          {(actionState === 'delay' || actionState === 'resolve_date') && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
                {actionState === 'delay' ? 'Aplazar Pago' : 'Asignar Fecha'}
              </h4>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nueva fecha efectiva</label>
                <input 
                  type="date"
                  value={effectiveDate} onChange={e => {
                    setEffectiveDate(e.target.value);
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    if (m - 1 !== originalMonth || y !== originalYear) {
                      setDelayedMark(true);
                    } else {
                      setDelayedMark(false);
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              
              {delayedMark && (
                <div className="flex items-start gap-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <input type="checkbox" id="delayed" checked={delayedMark} onChange={e => setDelayedMark(e.target.checked)} className="mt-1" />
                  <label htmlFor="delayed" className="text-sm text-blue-800">
                    Marcar como pago aplazado. No se sumará al presupuesto del nuevo mes, sino al periodo original ({MONTH_NAMES[originalMonth]}).
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observaciones</label>
                <textarea 
                  value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg" rows={2}
                />
              </div>

              <div className="pt-2">
                <button type="button" onClick={submitRestoreDate} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                  Restaurar fecha original
                </button>
              </div>
            </div>
          )}

          {actionState === 'cancel' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-red-600 border-b border-slate-100 pb-2">Cancelar Pago</h4>
              <p className="text-sm text-slate-700">El pago dejará de sumar en el presupuesto ordinario, pero se conservará en el historial.</p>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Motivo (Opcional)</label>
                <textarea 
                  value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-red-300 focus:ring-red-500" rows={2}
                />
              </div>
            </div>
          )}

        </div>
        
        <div className="p-6 border-t border-slate-200 bg-slate-50 flex flex-col gap-3">
          {errorMessage && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200">
              {errorMessage}
            </div>
          )}

          {actionState === 'saving' && (
            <button disabled className="w-full py-2.5 rounded-lg text-sm font-semibold bg-slate-400 text-white cursor-wait">
              Guardando...
            </button>
          )}

          {actionState === 'view' && payment.status !== 'CANCELED' && (
            <>
              {payment.status !== 'PAID' ? (
                <button onClick={() => setActionState('pay')} className="w-full py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm">
                  Marcar como Pagado/Cobrado
                </button>
              ) : (
                <button onClick={() => setActionState('correct')} className="w-full py-2.5 rounded-lg text-sm font-semibold bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-colors shadow-sm">
                  Corregir Pago
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setActionState(payment.status === 'PENDING_DATE' ? 'resolve_date' : 'delay')} className="py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-white transition-colors bg-slate-50">
                  {payment.status === 'PENDING_DATE' ? 'Asignar Fecha' : 'Aplazar'}
                </button>
                <button onClick={() => setActionState('cancel')} className="py-2 rounded-lg text-sm font-medium border border-slate-300 text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors bg-slate-50">
                  Cancelar
                </button>
              </div>
            </>
          )}

          {actionState === 'view' && payment.status === 'CANCELED' && (
            <button onClick={() => submitReopen()} className="w-full py-2.5 rounded-lg text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
              Reabrir Pago
            </button>
          )}

          {(actionState === 'pay' || actionState === 'correct') && (
            <div className="flex gap-2">
              <button onClick={() => setActionState('view')} className="flex-1 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50">Volver</button>
              <button onClick={submitPay} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white">Guardar</button>
            </div>
          )}

          {(actionState === 'delay' || actionState === 'resolve_date') && (
            <div className="flex gap-2">
              <button onClick={() => setActionState('view')} className="flex-1 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50">Volver</button>
              <button onClick={submitDelay} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white">Guardar</button>
            </div>
          )}

          {actionState === 'cancel' && (
            <div className="flex gap-2">
              <button onClick={() => setActionState('view')} className="flex-1 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50">Mantener</button>
              <button onClick={submitCancel} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white">Confirmar Cancelación</button>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
