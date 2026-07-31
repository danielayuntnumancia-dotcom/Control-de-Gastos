import React, { useMemo } from 'react';
import { Payment, Concept } from '../types';
import { filterPaymentsByPeriod } from '../utils/paymentUtils';

interface CalendarListViewProps {
  payments: Payment[];
  concepts: Concept[];
  month: number;
  year: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onOpenPayment: (payment: Payment) => void;
  isFiltered: boolean;
}

export function CalendarListView({ payments, concepts, month, year, onPrevMonth, onNextMonth, onToday, onOpenPayment, isFiltered }: CalendarListViewProps) {
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  const currentPeriodPayments = filterPaymentsByPeriod(payments, month, year);

  // Grouping logic
  const exactDates = new Map<number, Payment[]>();
  const approxDates = new Map<number, Payment[]>();
  const sinDia: Payment[] = [];
  const fechaPendiente: Payment[] = [];
  // For now, aplazados are just checking status === 'DELAYED'
  const aplazados: Payment[] = [];

  payments.forEach(p => {
    if (p.dueDate.getMonth() !== month || p.dueDate.getFullYear() !== year) return;

    const concept = concepts.find(c => c.id === p.conceptId);
    if (!concept) return;

    if (p.isDelayed) {
      aplazados.push(p);
    } else if (p.status === 'PENDING_DATE') {
      fechaPendiente.push(p);
    } else if (concept.dateType === 'month_only') {
      sinDia.push(p);
    } else if (concept.dateType === 'approximate') {
      const day = p.dueDate.getDate();
      if (!approxDates.has(day)) approxDates.set(day, []);
      approxDates.get(day)!.push(p);
    } else {
      const day = p.dueDate.getDate();
      if (!exactDates.has(day)) exactDates.set(day, []);
      exactDates.get(day)!.push(p);
    }
  });

  const exactDaysSorted = Array.from(exactDates.keys()).sort((a, b) => a - b);
  const approxDaysSorted = Array.from(approxDates.keys()).sort((a, b) => a - b);

  const renderPaymentRow = (p: Payment) => {
    const concept = concepts.find(c => c.id === p.conceptId);
    let statusClass = "text-slate-600 bg-slate-100";
    let statusText: string = p.status;
    
    if (p.status === 'PAID') { statusClass = "text-green-700 bg-green-100"; statusText = "Pagado"; }
    else if (p.status === 'OVERDUE') { statusClass = "text-red-700 bg-red-100"; statusText = "Vencido"; }
    else if (p.status === 'APPROX_OVERDUE') { statusClass = "text-orange-700 bg-orange-100"; statusText = "Revisar"; }
    else if (p.status === 'PENDING') { statusClass = "text-slate-700 bg-slate-100"; statusText = "Pendiente"; }
    else if (p.status === 'PENDING_DATE') { statusClass = "text-orange-700 bg-orange-100"; statusText = "Falta fecha"; }
    else if (p.status === 'CANCELED') { statusClass = "text-slate-500 bg-slate-200"; statusText = "Cancelado"; }

    return (
      <button 
        key={p.id} onClick={() => onOpenPayment(p)}
        className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors text-left"
      >
        <div className="flex flex-col">
          <span className="font-semibold text-slate-800">{p.concept}</span>
          <span className="text-xs text-slate-500 mt-0.5">{concept?.category || 'Sin categoría'}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-3">
            {p.isDelayed && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full text-blue-700 bg-blue-100">
                Aplazado
              </span>
            )}
            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${statusClass}`}>
              {statusText}
            </span>
            <span className="font-bold text-slate-900 w-20 text-right">
              {(p.expectedAmount / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </span>
          </div>
          {p.status === 'PAID' && p.actualAmount !== null && p.actualAmount !== p.expectedAmount && (
            <span className="text-xs text-slate-500">
              Real: {(p.actualAmount / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto flex flex-col gap-6">
      {/* Header & Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 capitalize">
          {monthNames[month]} {year}
        </h2>
        <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <button onClick={onPrevMonth} className="px-3 py-1.5 hover:bg-slate-50 text-slate-600 border-r border-slate-200">
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
          <button onClick={onToday} className="px-4 py-1.5 hover:bg-slate-50 text-sm font-medium text-slate-700">
            Hoy
          </button>
          <button onClick={onNextMonth} className="px-3 py-1.5 hover:bg-slate-50 text-slate-600 border-l border-slate-200">
            <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>
      </div>

      {isFiltered && (
        <div className="bg-indigo-50 text-indigo-700 text-xs px-3 py-2 rounded-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">filter_alt</span>
          Viendo resultados filtrados
        </div>
      )}

      {(exactDaysSorted.length === 0 && approxDaysSorted.length === 0 && sinDia.length === 0 && fechaPendiente.length === 0 && aplazados.length === 0) ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 font-medium">No hay pagos para mostrar en esta vista.</p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Exact Dates */}
          {exactDaysSorted.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fechas Exactas</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {exactDaysSorted.map(day => (
                  <div key={day}>
                    <div className="px-4 py-1.5 bg-slate-50/50 text-xs font-semibold text-slate-600 border-b border-slate-100">
                      {day} de {monthNames[month]}
                    </div>
                    {exactDates.get(day)!.map(renderPaymentRow)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approx Dates */}
          {approxDaysSorted.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fechas Aproximadas</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {approxDaysSorted.map(day => (
                  <div key={day}>
                    <div className="px-4 py-1.5 bg-slate-50/50 text-xs font-semibold text-slate-600 border-b border-slate-100">
                      Aprox. {day} de {monthNames[month]}
                    </div>
                    {approxDates.get(day)!.map(renderPaymentRow)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sin Dia */}
          {sinDia.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{monthNames[month]} · Sin día concreto</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {sinDia.map(renderPaymentRow)}
              </div>
            </div>
          )}

          {/* Fecha Pendiente */}
          {fechaPendiente.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-orange-500">warning</span>
                <h3 className="text-xs font-bold text-orange-700 uppercase tracking-wider">Fecha Pendiente</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {fechaPendiente.map(renderPaymentRow)}
              </div>
            </div>
          )}

          {/* Aplazados */}
          {aplazados.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-blue-500">update</span>
                <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider">Movimientos Aplazados</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {aplazados.map(renderPaymentRow)}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
