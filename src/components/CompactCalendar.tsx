import React from 'react';
import { Payment, Concept } from '../types';

interface CompactCalendarProps {
  payments: Payment[];
  concepts: Concept[];
  currentMonth: number;
  currentYear: number;
  onNavigateToCalendar: () => void;
  onOpenPayment: (payment: Payment) => void;
}

export function CompactCalendar({ payments, concepts, currentMonth, currentYear, onNavigateToCalendar, onOpenPayment }: CompactCalendarProps) {
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  
  // Adjust so Monday is 0
  const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const today = new Date();
  const isCurrentMonthActual = today.getMonth() === currentMonth && today.getFullYear() === currentYear;
  const currentDay = today.getDate();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Map payments by day
  const paymentsByDay = new Map<number, Payment[]>();
  const noDayPayments: Payment[] = [];

  payments.forEach(p => {
    if (p.dueDate.getMonth() !== currentMonth || p.dueDate.getFullYear() !== currentYear) return;
    
    const concept = concepts.find(c => c.id === p.conceptId);
    
    if (p.status === 'PENDING_DATE') {
      if (concept?.dateType === 'approximate') {
        const targetDay = concept.day && concept.day > 0 ? concept.day : 1;
        for (let d = targetDay - 1; d <= targetDay + 1; d++) {
          if (d >= 1 && d <= daysInMonth) {
            if (!paymentsByDay.has(d)) paymentsByDay.set(d, []);
            paymentsByDay.get(d)!.push(p);
          }
        }
      } else {
        noDayPayments.push(p);
      }
    } else if (concept?.dateType === 'month_only') {
      noDayPayments.push(p);
    } else {
      const day = p.dueDate.getDate();
      if (!paymentsByDay.has(day)) paymentsByDay.set(day, []);
      paymentsByDay.get(day)!.push(p);
    }
  });

  const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <h2 className="font-semibold text-slate-800 text-sm">Calendario</h2>
        <button onClick={onNavigateToCalendar} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
          Ver mes completo
        </button>
      </div>
      
      <div className="p-4">
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {weekDays.map(d => (
            <div key={d} className="text-[10px] font-bold text-slate-400">{d}</div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1 text-center">
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} className="h-8"></div>
          ))}
          {days.map(day => {
            const dayPayments = paymentsByDay.get(day) || [];
            const isToday = isCurrentMonthActual && currentDay === day;
            const hasPending = dayPayments.some(p => p.status !== 'PAID' && p.status !== 'CANCELED');
            const hasPaid = dayPayments.some(p => p.status === 'PAID');
            
            let bgClass = "bg-slate-50 hover:bg-slate-100 text-slate-700";
            if (isToday) bgClass = "bg-indigo-50 text-indigo-700 font-bold border border-indigo-200";
            
            return (
              <button 
                key={day} 
                className={`h-8 rounded flex items-center justify-center relative ${bgClass}`}
                onClick={dayPayments.length > 0 ? () => dayPayments.length === 1 ? onOpenPayment(dayPayments[0]) : onNavigateToCalendar() : undefined}
                title={dayPayments.map(p => p.concept).join(', ')}
              >
                <span className="text-xs">{day}</span>
                {dayPayments.length > 0 && (
                  <div className="absolute bottom-1 flex gap-0.5">
                    {hasPending && <div className="w-1 h-1 rounded-full bg-orange-400"></div>}
                    {hasPaid && !hasPending && <div className="w-1 h-1 rounded-full bg-green-500"></div>}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {noDayPayments.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Sin día asignado</p>
            <div className="space-y-1">
              {noDayPayments.map(p => (
                <button 
                  key={p.id}
                  className="w-full text-left flex justify-between items-center px-2 py-1.5 rounded hover:bg-slate-50 text-xs"
                  onClick={() => onOpenPayment(p)}
                >
                  <span className="text-slate-700 truncate mr-2">{p.concept}</span>
                  <span className="font-medium text-slate-900 shrink-0">
                    {(p.expectedAmount / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
