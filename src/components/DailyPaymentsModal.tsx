import React, { useState, useEffect } from 'react';
import { Payment, Concept } from '../types';
import { formatPaymentDate, MONTH_NAMES_SHORT, MONTH_NAMES, formatAmount } from '../utils/formatUtils';

interface DailyPaymentsModalProps {
  initialDate: Date;
  payments: Payment[];
  concepts: Concept[];
  onClose: () => void;
  onOpenPayment: (p: Payment) => void;
}

export default function DailyPaymentsModal({ initialDate, payments, concepts, onClose, onOpenPayment }: DailyPaymentsModalProps) {
  const [currentDate, setCurrentDate] = useState<Date>(initialDate);

  useEffect(() => {
    setCurrentDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const goToPrevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const goToNextDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const onDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      const parts = val.split('-');
      if (parts.length === 3) {
        setCurrentDate(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      }
    }
  };

  // Extraer string YYYY-MM-DD para el input[type=date]
  const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

  const dayPayments = payments.filter(p => {
    if (p.status === 'CANCELED') return false;
    
    const concept = concepts.find(c => c.id === p.conceptId);
    if (!concept) return false;

    if (concept.dateType === 'month_only') return false;

    if ((p.status === 'PENDING_DATE' || p.status === 'APPROX_OVERDUE') && concept.dateType === 'approximate') {
      const targetDay = concept.day && concept.day > 0 ? concept.day : 1;
      const d1 = new Date(p.dueDate.getFullYear(), p.dueDate.getMonth(), targetDay - 1);
      const d2 = new Date(p.dueDate.getFullYear(), p.dueDate.getMonth(), targetDay + 1);
      
      const current = new Date(currentDate);
      current.setHours(0,0,0,0);
      d1.setHours(0,0,0,0);
      d2.setHours(0,0,0,0);
      
      return current.getTime() >= d1.getTime() && current.getTime() <= d2.getTime();
    }

    const current = new Date(currentDate);
    current.setHours(0,0,0,0);
    const pDate = new Date(p.dueDate);
    pDate.setHours(0,0,0,0);
    
    return current.getTime() === pDate.getTime();
  });

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" onClick={onClose}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto">
          
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={goToPrevDay} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors">
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              
              <div className="relative">
                <input 
                  type="date"
                  value={dateStr}
                  onChange={onDateChange}
                  className="pl-3 pr-2 py-1.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
                />
              </div>

              <button onClick={goToNextDay} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors">
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>

            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors">
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-white">
            <h2 className="text-lg font-bold text-slate-800 capitalize">
              {currentDate.getDate()} de {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
              {dayPayments.length} cobros
            </span>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
            {dayPayments.length === 0 ? (
              <div className="text-center py-8">
                <span className="material-symbols-outlined text-4xl text-slate-300 mb-3">event_busy</span>
                <p className="text-slate-500">No hay gastos registrados para este día.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dayPayments.map(p => {
                  const concept = concepts.find(c => c.id === p.conceptId);
                  const isNoDay = concept?.dateType === 'month_only' || p.status === 'PENDING_DATE';
                  
                  return (
                    <div 
                      key={p.id} 
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all group"
                      onClick={() => onOpenPayment(p)}
                    >
                      <div>
                        <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">{p.concept}</h3>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                          <span className={isNoDay ? 'text-indigo-600 font-medium' : ''}>
                            {formatPaymentDate(p, concept)}
                          </span>
                          {p.status === 'OVERDUE' && (
                            <span className="text-red-500 font-medium bg-red-50 px-1.5 py-0.5 rounded">Vencido</span>
                          )}
                          {p.status === 'APPROX_OVERDUE' && (
                            <span className="text-orange-500 font-medium bg-orange-50 px-1.5 py-0.5 rounded">Revisar</span>
                          )}
                          {p.isDelayed && (
                            <span className="text-blue-500 font-medium bg-blue-50 px-1.5 py-0.5 rounded">Aplazado</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900 text-lg">
                          {formatAmount(p.expectedAmount, p.type || 'expense', p.isAmountApproximate)}
                        </p>
                        {concept?.category && (
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{concept.category}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
        </div>
      </div>
    </>
  );
}
