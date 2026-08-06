import React, { useMemo } from 'react';
import { Payment, Concept } from '../types';
import { calculateTotalPrevisto, calculateTotalPagadoReal, calculatePendientes, filterPaymentsByPeriod } from '../utils/paymentUtils';
import { formatAmount } from '../utils/formatUtils';

interface CalendarMonthViewProps {
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

export function CalendarMonthView({ payments, concepts, month, year, onPrevMonth, onNextMonth, onToday, onOpenPayment, isFiltered }: CalendarMonthViewProps) {
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  // 1. Period Payments & Indicators
  // Use filterPaymentsByPeriod to correctly calculate original month logic
  const currentPeriodPayments = filterPaymentsByPeriod(payments, month, year);

  const previstoInfo = calculateTotalPrevisto(currentPeriodPayments);
  const pagadoInfo = calculateTotalPagadoReal(currentPeriodPayments);
  const pendienteInfo = calculatePendientes(currentPeriodPayments);
  const countPendientes = pendienteInfo.count;

  // 2. Grid logic
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Mon = 0
  
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const totalGridCells = 42; // Always 6 rows to prevent height jumping

  const today = new Date();
  const isActualMonth = today.getMonth() === month && today.getFullYear() === year;

  // 3. Placing Payments
  // Group by grid day, or out-of-grid categories
  const gridPayments = new Map<number, Payment[]>();
  const outOfGrid_SinDia: Payment[] = [];
  const outOfGrid_FechaPendiente: Payment[] = [];
  const outOfGrid_AplazadosExt: Payment[] = []; // Effective date is in this month, but original period is different

  // Check all payments to place them correctly in this month's view
  // EITHER they belong to this period OR they have an effective date in this period (aplazados).
  // For simplicity, we assume `dueDate` is the effective date for UI placement, 
  // but the original period might be different if we implement it. Right now `dueDate` is all we have.
  // We'll place all payments whose `dueDate` falls in this month.
  payments.forEach(p => {
    if (p.status === 'CANCELED') return;
    
    const pYear = p.originalPeriodYear !== undefined ? p.originalPeriodYear : p.dueDate.getFullYear();
    const pMonth = p.originalPeriodMonth !== undefined ? p.originalPeriodMonth : p.dueDate.getMonth();

    if (pMonth !== month || pYear !== year) return;
    
    const concept = concepts.find(c => c.id === p.conceptId);
    if (!concept) return;

    if (p.status === 'PENDING_DATE') {
      if (concept.dateType === 'approximate') {
        let targetDay = concept.day && concept.day > 0 ? concept.day : 1;
        if (targetDay > daysInMonth) targetDay = daysInMonth;
        for (let d = targetDay - 1; d <= targetDay + 1; d++) {
           if (d >= 1 && d <= daysInMonth) {
             if (!gridPayments.has(d)) gridPayments.set(d, []);
             gridPayments.get(d)!.push(p);
           }
        }
      } else {
        outOfGrid_FechaPendiente.push(p);
      }
    } else if (concept.dateType === 'month_only') {
      outOfGrid_SinDia.push(p);
    } else {
      let day = p.dueDate.getDate();
      if (p.dueDate.getMonth() !== month) {
        day = concept.day && concept.day > 0 ? concept.day : 1;
      }
      if (day > daysInMonth) day = daysInMonth;

      if (!gridPayments.has(day)) gridPayments.set(day, []);
      gridPayments.get(day)!.push(p);
    }
  });

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Month Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-slate-800 capitalize w-48 sm:w-56">
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
      </div>

      {/* Balances Trilogy */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* INGRESOS */}
        <div className="bg-white rounded-xl border border-emerald-100 shadow-sm p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">arrow_upward</span> Ingresos
            </h3>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-end">
              <span className="text-[10px] text-slate-500 font-medium">REAL</span>
              <span className="text-lg font-bold text-emerald-600">{pagadoInfo.incomes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
            </div>
            <div className="flex justify-between items-end border-t border-slate-50 pt-1">
              <span className="text-[10px] text-slate-400">PREVISTO</span>
              <span className="text-xs font-semibold text-slate-600">{previstoInfo.incomes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
            </div>
          </div>
        </div>

        {/* GASTOS */}
        <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-xs font-bold text-red-800 uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">arrow_downward</span> Gastos
            </h3>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-end">
              <span className="text-[10px] text-slate-500 font-medium">REAL</span>
              <span className="text-lg font-bold text-red-600">{pagadoInfo.expenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
            </div>
            <div className="flex justify-between items-end border-t border-slate-50 pt-1">
              <span className="text-[10px] text-slate-400">PREVISTO</span>
              <span className="text-xs font-semibold text-slate-600">{previstoInfo.expenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
            </div>
          </div>
        </div>

        {/* NETO */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">account_balance</span> Balance Neto
            </h3>
            {countPendientes > 0 && (
              <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold" title="Pagos pendientes">
                {countPendientes} pend.
              </span>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-end">
              <span className="text-[10px] text-slate-500 font-medium">REAL</span>
              <span className={`text-lg font-bold ${pagadoInfo.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {pagadoInfo.net > 0 ? '+' : ''}{pagadoInfo.net.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
            <div className="flex justify-between items-end border-t border-slate-50 pt-1">
              <span className="text-[10px] text-slate-400">PREVISTO</span>
              <span className={`text-xs font-semibold ${previstoInfo.net >= 0 ? 'text-slate-700' : 'text-red-500'}`}>
                {previstoInfo.net > 0 ? '+' : ''}{previstoInfo.net.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {isFiltered && (
        <div className="bg-indigo-50 text-indigo-700 text-xs px-3 py-2 rounded-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">filter_alt</span>
          Totales filtrados activos
        </div>
      )}

      {/* Grid */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200">
          {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
            <div key={d} className="px-2 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-100 last:border-0">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.charAt(0)}</span>
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 auto-rows-fr">
          {Array.from({ length: totalGridCells }).map((_, i) => {
            const isPrevMonth = i < startDay;
            const isNextMonth = i >= startDay + daysInMonth;
            
            let dayNum = 0;
            if (isPrevMonth) dayNum = daysInPrevMonth - startDay + i + 1;
            else if (isNextMonth) dayNum = i - startDay - daysInMonth + 1;
            else dayNum = i - startDay + 1;

            const isCurrentDay = isActualMonth && !isPrevMonth && !isNextMonth && dayNum === today.getDate();
            const cellPayments = (!isPrevMonth && !isNextMonth) ? (gridPayments.get(dayNum) || []) : [];

            return (
              <div 
                key={i} 
                className={`min-h-[100px] border-b border-r border-slate-100 last:border-r-0 p-1 sm:p-2 
                  ${isPrevMonth || isNextMonth ? 'bg-slate-50 opacity-50' : 'bg-white'} 
                  ${isCurrentDay ? 'bg-indigo-50/30' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isCurrentDay ? 'bg-indigo-600 text-white' : 'text-slate-700'}`}>
                    {dayNum}
                  </span>
                </div>
                
                <div className="flex flex-col gap-1 mt-1">
                  {cellPayments.slice(0, 3).map(p => {
                    const concept = concepts.find(c => c.id === p.conceptId);
                    const isApprox = concept?.dateType === 'approximate';
                    
                    let bgClass = "bg-slate-100 text-slate-700";
                    if (p.type === 'income') bgClass = "bg-emerald-100 text-emerald-800";
                    if (p.status === 'PAID') bgClass = p.type === 'income' ? "bg-green-200 text-green-900 border border-green-300" : "bg-green-100 text-green-800";
                    if (p.status === 'OVERDUE') bgClass = "bg-red-100 text-red-800";
                    if (p.status === 'APPROX_OVERDUE') bgClass = "bg-orange-100 text-orange-800";
                    if (p.isDelayed) bgClass = "bg-blue-100 text-blue-800";
                    if (isApprox && p.status === 'PENDING_DATE') bgClass = "bg-orange-50 text-orange-700 border border-orange-200 border-dashed";

                    return (
                      <button 
                        key={p.id}
                        onClick={() => onOpenPayment(p)}
                        className={`text-left px-1.5 py-1 rounded text-[10px] sm:text-xs truncate transition-colors hover:brightness-95 ${bgClass}`}
                        title={`${p.concept} - ${formatAmount(p.expectedAmount, p.type || 'expense', isApprox)}`}
                      >
                        <span className="font-semibold block truncate">
                          {isApprox && <span className="font-normal opacity-80 mr-1">Aprox.</span>}
                          {p.concept}
                        </span>
                        <span className="block opacity-80">
                          {formatAmount(p.expectedAmount, p.type || 'expense', isApprox)}
                        </span>
                      </button>
                    );
                  })}
                  
                  {cellPayments.length > 3 && (
                    <div className="text-[10px] text-center text-slate-500 font-medium py-0.5">
                      + {cellPayments.length - 3} más
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Out of grid items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {outOfGrid_SinDia.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-slate-400">calendar_month</span>
              {monthNames[month]} · Sin día concreto
            </h3>
            <div className="space-y-2">
              {outOfGrid_SinDia.map(p => {
                const conceptSinDia = concepts.find(c => c.id === p.conceptId);
                const isApproxSinDia = conceptSinDia?.dateType === 'approximate';
                return (
                  <button 
                    key={p.id} onClick={() => onOpenPayment(p)}
                    className="w-full flex justify-between items-center px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm text-left transition-colors"
                  >
                    <span className="font-medium text-slate-700">{p.concept}</span>
                    <span className="font-semibold text-slate-900">{formatAmount(p.expectedAmount, p.type || 'expense', isApproxSinDia)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {outOfGrid_FechaPendiente.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-orange-400">pending_actions</span>
              Fecha pendiente
            </h3>
            <div className="space-y-2">
              {outOfGrid_FechaPendiente.map(p => {
                const conceptFP = concepts.find(c => c.id === p.conceptId);
                const isApproxFP = conceptFP?.dateType === 'approximate';
                return (
                  <button 
                    key={p.id} onClick={() => onOpenPayment(p)}
                    className="w-full flex justify-between items-center px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm text-left transition-colors border border-orange-100"
                  >
                    <span className="font-medium text-slate-700">{p.concept}</span>
                    <span className="font-semibold text-slate-900">{formatAmount(p.expectedAmount, p.type || 'expense', isApproxFP)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
