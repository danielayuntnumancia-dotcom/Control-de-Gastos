import React, { useMemo } from 'react';
import { Payment, Concept } from '../types';
import { calculateTotalPrevisto, calculatePendientes, filterPaymentsByPeriod } from '../utils/paymentUtils';

interface CalendarYearViewProps {
  payments: Payment[];
  concepts: Concept[];
  year: number;
  onPrevYear: () => void;
  onNextYear: () => void;
  onToday: () => void;
  onSelectMonth: (month: number) => void;
  isFiltered: boolean;
}

export function CalendarYearView({ payments, concepts, year, onPrevYear, onNextYear, onToday, onSelectMonth, isFiltered }: CalendarYearViewProps) {
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const today = new Date();

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">
          Año {year}
        </h2>
        <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <button onClick={onPrevYear} className="px-3 py-1.5 hover:bg-slate-50 text-slate-600 border-r border-slate-200">
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
          <button onClick={onToday} className="px-4 py-1.5 hover:bg-slate-50 text-sm font-medium text-slate-700">
            Año Actual
          </button>
          <button onClick={onNextYear} className="px-3 py-1.5 hover:bg-slate-50 text-slate-600 border-l border-slate-200">
            <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>
      </div>

      {isFiltered && (
        <div className="bg-indigo-50 text-indigo-700 text-xs px-3 py-2 rounded-lg flex items-center gap-2 self-start">
          <span className="material-symbols-outlined text-[16px]">filter_alt</span>
          Totales filtrados activos
        </div>
      )}

      {/* Grid of 12 months */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {Array.from({ length: 12 }).map((_, mIndex) => {
          const monthPayments = filterPaymentsByPeriod(payments, mIndex, year);
          
          const totalPrevisto = calculateTotalPrevisto(monthPayments);
          const { count: pendingCount } = calculatePendientes(monthPayments);
          const nonCanceledCount = monthPayments.filter(p => p.status !== 'CANCELED').length;

          const isCurrentMonth = today.getFullYear() === year && today.getMonth() === mIndex;

          return (
            <button 
              key={mIndex} 
              onClick={() => onSelectMonth(mIndex)}
              className={`bg-white border p-5 rounded-xl text-left transition-colors hover:border-indigo-300 hover:shadow-md flex flex-col justify-between h-36 
                ${isCurrentMonth ? 'border-indigo-400 shadow-sm ring-1 ring-indigo-400' : 'border-slate-200 shadow-sm'}`}
            >
              <div className="flex justify-between items-start w-full">
                <h3 className={`font-bold text-lg ${isCurrentMonth ? 'text-indigo-700' : 'text-slate-800'}`}>
                  {monthNames[mIndex]}
                </h3>
                {pendingCount > 0 && (
                  <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {pendingCount} pdtes
                  </span>
                )}
              </div>
              
              <div className="mt-4 w-full flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Previsto</p>
                  <p className="font-bold text-xl text-slate-900">
                    {totalPrevisto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-500">
                    {nonCanceledCount} cobros
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
