import React, { useState } from 'react';
import { Payment } from '../types';

interface PaymentFormProps {
  onSave: (payment: Omit<Payment, 'id' | 'userId' | 'createdAt'>) => void;
  onCancel: () => void;
}

export function PaymentForm({ onSave, onCancel }: PaymentFormProps) {
  const [concept, setConcept] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [actualAmount, setActualAmount] = useState('');
  const [status, setStatus] = useState<Payment['status']>('PENDING');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept || !dueDate || !expectedAmount) return;

    onSave({
      concept,
      description,
      dueDate: new Date(dueDate),
      expectedAmount: parseFloat(expectedAmount),
      actualAmount: actualAmount ? parseFloat(actualAmount) : null,
      status,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">Nuevo Concepto</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Concepto</label>
            <input 
              type="text" 
              required
              value={concept}
              onChange={e => setConcept(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ej. Alquiler Vivienda"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <input 
              type="text" 
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ej. Mensual · Transferencia"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
              <input 
                type="date" 
                required
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
              <select 
                value={status}
                onChange={e => setStatus(e.target.value as Payment['status'])}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="PENDING">Pendiente</option>
                <option value="PAID">Pagado</option>
                <option value="DELAYED">Aplazado</option>
                <option value="NO_NOTICE">Sin Aviso</option>
                <option value="REFUNDED">Abonado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Importe Previsto</label>
              <input 
                type="number" 
                required
                step="0.01"
                value={expectedAmount}
                onChange={e => setExpectedAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Importe Real</label>
              <input 
                type="number"
                step="0.01"
                value={actualAmount}
                onChange={e => setActualAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onCancel}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
