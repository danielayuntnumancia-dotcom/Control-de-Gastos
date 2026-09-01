import React, { useState, useEffect } from 'react';
import { BankAccount } from '../types';

interface BulkAccountAssignModalProps {
  accounts: BankAccount[];
  selectedCount: number;
  onClose: () => void;
  onConfirm: (accountId: string, applyFromMonth: number, applyFromYear: number) => Promise<void>;
}

export function BulkAccountAssignModal({
  accounts,
  selectedCount,
  onClose,
  onConfirm
}: BulkAccountAssignModalProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [applyFromMonth, setApplyFromMonth] = useState<number>(new Date().getMonth());
  const [applyFromYear, setApplyFromYear] = useState<number>(new Date().getFullYear());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) return;
    
    setIsSubmitting(true);
    try {
      await onConfirm(selectedAccountId, applyFromMonth, applyFromYear);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 transition-opacity" onClick={onClose}></div>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto overflow-hidden animate-fade-in-up">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-800">
              Asignar Cuenta Bancaria
            </h3>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div>
              <p className="text-slate-600 mb-4 text-sm">
                Has seleccionado <span className="font-bold text-slate-800">{selectedCount}</span> concepto(s).
                Se les asignará la cuenta elegida y puedes decidir a partir de qué fecha se actualizarán los pagos pendientes.
              </p>
              
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Cuenta de cargo/abono
              </label>
              <div className="relative">
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none transition-all"
                  required
                >
                  <option value="">-- Selecciona una cuenta --</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                  <option value="unassigned">-- Quitar asignación (Ninguna) --</option>
                </select>
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  account_balance
                </span>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  expand_more
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Mes de inicio
                </label>
                <select
                  value={applyFromMonth}
                  onChange={(e) => setApplyFromMonth(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none transition-all"
                >
                  {months.map((m, idx) => (
                    <option key={idx} value={idx}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Año de inicio
                </label>
                <select
                  value={applyFromYear}
                  onChange={(e) => setApplyFromYear(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none transition-all"
                >
                  {Array.from({ length: 5 }).map((_, i) => {
                    const y = new Date().getFullYear() - 2 + i;
                    return <option key={y} value={y}>{y}</option>;
                  })}
                </select>
              </div>
            </div>
            
            <p className="text-xs text-slate-500 italic">
              * Los pagos con estado "PAGADO" no se modificarán aunque entren en la fecha seleccionada.
            </p>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 font-semibold rounded-xl transition-colors"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-3 text-white bg-blue-600 hover:bg-blue-700 font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                disabled={!selectedAccountId || isSubmitting}
              >
                {isSubmitting ? (
                  <span className="material-symbols-outlined animate-spin text-lg">sync</span>
                ) : (
                  <span className="material-symbols-outlined text-lg">check</span>
                )}
                Aplicar
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
