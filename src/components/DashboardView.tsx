import React, { useMemo } from 'react';
import { Payment, Concept, UserSettings } from '../types';
import { formatPaymentDate, MONTH_NAMES } from '../utils/formatUtils';
import { CompactCalendar } from './CompactCalendar';
import { calculateTotalPrevisto, calculateTotalPagadoReal, calculateDiferenciaConfirmada, calculatePendientes, filterPaymentsByPeriod } from '../utils/paymentUtils';

interface DashboardViewProps {
  payments: Payment[];
  concepts: Concept[];
  settings: UserSettings | null;
  onOpenPayment: (payment: Payment) => void;
  onNavigateToCalendar: () => void;
  onNavigateToConcepts: () => void;
}

export function DashboardView({ payments, concepts, settings, onOpenPayment, onNavigateToCalendar, onNavigateToConcepts }: DashboardViewProps) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  // Helper to check if a payment belongs to the current month (by dueDate)
  const isCurrentMonth = (date: Date) => date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  const isNextMonth = (date: Date) => {
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    return date.getMonth() === nextMonth && date.getFullYear() === nextYear;
  };


  const currentMonthPayments = filterPaymentsByPeriod(payments, currentMonth, currentYear);
  const nextMonthPayments = filterPaymentsByPeriod(payments, currentMonth === 11 ? 0 : currentMonth + 1, currentMonth === 11 ? currentYear + 1 : currentYear);

  const conceptsMap = useMemo(() => {
    return new Map(concepts.map(c => [c.id, c]));
  }, [concepts]);

  // 5.1 Total Previsto (excludes cancelled)
  const totalPrevisto = calculateTotalPrevisto(currentMonthPayments);

  // 5.2 Total pagado real (only PAID, from current month period)
  const pagadoReal = calculateTotalPagadoReal(currentMonthPayments);

  // 5.3 Diferencia confirmada (actual - expected) ONLY on PAID
  const diferencia = calculateDiferenciaConfirmada(currentMonthPayments);

  // 5.4 Pendientes (Count and sum of expectedAmount for pending)
  const { total: totalPendiente, count: countPendiente } = calculatePendientes(currentMonthPayments);

  // 6. Próximos Pagos
  // Pending of current month, expired, approx dates, first of next month
  // Exclude PAID and CANCELED
  const upcomingPaymentsAll = payments.filter(p => p.status !== 'PAID' && p.status !== 'CANCELED' && p.status !== 'REFUNDED');
  
  // Sort: Exact expired, approx expired, future, pending dates
  const sortedUpcoming = [...upcomingPaymentsAll].sort((a, b) => {
    const aConcept = a.conceptId ? conceptsMap.get(a.conceptId) : undefined;
    const bConcept = b.conceptId ? conceptsMap.get(b.conceptId) : undefined;

    const aIsNoDay = aConcept?.dateType === 'month_only' || a.status === 'PENDING_DATE';
    const bIsNoDay = bConcept?.dateType === 'month_only' || b.status === 'PENDING_DATE';

    // Group no-day payments at the end
    if (aIsNoDay && !bIsNoDay) return 1;
    if (!aIsNoDay && bIsNoDay) return -1;

    // Inside no-day payments, sort by month/year
    if (aIsNoDay && bIsNoDay) {
      return a.dueDate.getTime() - b.dueDate.getTime();
    }

    // For payments with a day:
    const aIsOverdue = a.status === 'OVERDUE' || (a.dueDate < now && aConcept?.dateType === 'exact');
    const bIsOverdue = b.status === 'OVERDUE' || (b.dueDate < now && bConcept?.dateType === 'exact');

    if (aIsOverdue && !bIsOverdue) return -1;
    if (!aIsOverdue && bIsOverdue) return 1;

    const aIsApproxOverdue = a.status === 'APPROX_OVERDUE' || (a.dueDate < now && aConcept?.dateType === 'approximate');
    const bIsApproxOverdue = b.status === 'APPROX_OVERDUE' || (b.dueDate < now && bConcept?.dateType === 'approximate');

    if (aIsApproxOverdue && !bIsApproxOverdue) return -1;
    if (!aIsApproxOverdue && bIsApproxOverdue) return 1;

    // Both are future or both have same overdue state, sort by date
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  const validUpcoming = sortedUpcoming.filter(p => {
    // Siempre mostrar pagos vencidos, independientemente de la configuración de notificaciones
    if (p.status === 'OVERDUE' || p.status === 'APPROX_OVERDUE') return true;

    if (!settings?.notificationsEnabled) return false;

    const concept = p.conceptId ? conceptsMap.get(p.conceptId) : undefined;
    const isNoDay = concept?.dateType === 'month_only' || p.status === 'PENDING_DATE';
    
    if (p.status === 'PENDING_DATE') return true;
    if (concept?.dateType === 'month_only') {
      return now >= p.dueDate;
    }

    const noticeDays = concept?.exceptionNoticeDays !== undefined && concept?.exceptionNoticeDays !== null 
      ? concept.exceptionNoticeDays 
      : (settings?.generalNoticeDays ?? 5);

    const noticeDate = new Date(p.dueDate);
    noticeDate.setDate(noticeDate.getDate() - noticeDays);

    return now >= noticeDate || p.dueDate < now;
  });

  const nextPaymentsToShow = validUpcoming.slice(0, 7); // Up to 7 items

  if (concepts.length === 0 && payments.length === 0) {
    return (
      <div className="p-4 md:p-8 space-y-6 flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-3xl">inbox</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Bienvenido a Control de Pagos</h2>
        <p className="text-slate-500 max-w-md mb-6">Aún no tienes ningún pago planificado. Añade tu primer concepto (como un alquiler, seguro o suscripción) para empezar a llevar el control.</p>
        <button onClick={onNavigateToConcepts} className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm">
          <span className="material-symbols-outlined text-[20px]">add</span>
          Crear primer concepto
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 flex-1 overflow-y-auto">
      
      {/* 5. Indicadores del mes actual */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-4">{MONTH_NAMES[currentMonth]} {currentYear}</h2>
        {currentMonthPayments.length === 0 ? (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
            <p className="text-slate-500 font-medium">No hay pagos previstos para este mes.</p>
            <p className="text-sm text-slate-400 mt-1">Si esperabas ver pagos aquí, asegúrate de haber creado los conceptos correspondientes.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            
            <div className="bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Previsto</p>
              <p className="text-lg md:text-2xl font-bold text-slate-900">
                {totalPrevisto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>
            
            <div className="bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Pagado Real</p>
              <p className="text-lg md:text-2xl font-bold text-slate-900">
                {pagadoReal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>

            <div className="bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">
                Diferencia
              </p>
              <p className={`text-lg md:text-2xl font-bold ${diferencia === 0 ? 'text-slate-600' : diferencia > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {Math.abs(diferencia).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {diferencia === 0 ? 'Sin diferencia' : diferencia > 0 ? 'Sobrecoste' : 'A favor'}
              </p>
            </div>

            <div className="bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Pendiente</p>
              <p className="text-lg md:text-2xl font-bold text-orange-500">
                {totalPendiente.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
              <p className="text-xs text-slate-400 mt-1">{countPendiente} cobros</p>
            </div>

          </div>
        )}
      </div>

      {/* 6. Próximos Pagos and 7. Calendario (Layout split) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Próximos pagos */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Próximos Pagos</h2>
            <button onClick={onNavigateToCalendar} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
              Ver todos
            </button>
          </div>
          
          <div className="divide-y divide-slate-100">
            {nextPaymentsToShow.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <p>No hay pagos próximos pendientes.</p>
              </div>
            ) : (
              nextPaymentsToShow.map(p => {
                const concept = p.conceptId ? conceptsMap.get(p.conceptId) : undefined;
                const isNoDay = concept?.dateType === 'month_only' || p.status === 'PENDING_DATE';
                
                return (
                  <div key={p.id} className="p-4 flex justify-between items-center hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => onOpenPayment(p)}>
                    <div>
                      <h3 className="font-medium text-slate-900">{p.concept}</h3>
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
                      <p className="font-semibold text-slate-900">
                        {(p.expectedAmount / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </p>
                      {concept?.category && (
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{concept.category}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <CompactCalendar 
            payments={payments}
            concepts={concepts}
            currentMonth={currentMonth}
            currentYear={currentYear}
            onNavigateToCalendar={onNavigateToCalendar}
            onOpenPayment={onOpenPayment}
          />

          {/* Resumen mes siguiente */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div className="px-4 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h2 className="font-semibold text-slate-800 text-sm">Avance {MONTH_NAMES[currentMonth === 11 ? 0 : currentMonth + 1]}</h2>
              <button onClick={onNavigateToCalendar} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                Ver mes
              </button>
            </div>
            <div className="p-4 md:p-6 flex-1 flex flex-col justify-center items-center text-center">
              {nextMonthPayments.length > 0 ? (
                <>
                  <p className="text-3xl font-bold text-slate-800">
                    {(calculateTotalPrevisto(nextMonthPayments)).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </p>
                  <p className="text-sm text-slate-500 mt-2">Previsto en {nextMonthPayments.filter(p => p.status !== 'CANCELED').length} cobros</p>
                </>
              ) : (
                <p className="text-slate-500 text-sm">Aún no hay vencimientos generados para el mes siguiente.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}
