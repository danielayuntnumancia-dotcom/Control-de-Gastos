import React, { useMemo, useState } from 'react';
import { Payment, Concept, UserSettings } from '../types';
import { formatPaymentDate, MONTH_NAMES, formatAmount, getPaymentDisplayAmount } from '../utils/formatUtils';
import { CompactCalendar } from './CompactCalendar';
import DailyPaymentsModal from './DailyPaymentsModal';
import MonthPreviewModal from './MonthPreviewModal';
import { calculateTotalPrevisto, calculateTotalPagadoReal, calculateDiferenciaConfirmada, calculatePendientes, filterPaymentsByPeriod } from '../utils/paymentUtils';
import { useData } from '../context/DataContext';

interface DashboardViewProps {
  payments: Payment[];
  concepts: Concept[];
  settings: UserSettings | null;
  onOpenPayment: (payment: Payment) => void;
  onNavigateToCalendar: () => void;
  onNavigateToConcepts: () => void;
}

export function DashboardView({ payments, concepts, settings, onOpenPayment, onNavigateToCalendar, onNavigateToConcepts }: DashboardViewProps) {
  const { accounts } = useData();
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [previewMonthDate, setPreviewMonthDate] = useState<{ month: number, year: number } | null>(null);
  const [upcomingAccountFilter, setUpcomingAccountFilter] = useState<string>('ALL');

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
  const previstoInfo = calculateTotalPrevisto(currentMonthPayments);

  // 5.2 Total pagado real (only PAID, from current month period)
  const pagadoInfo = calculateTotalPagadoReal(currentMonthPayments);

  // 5.3 Diferencia confirmada (actual - expected) ONLY on PAID
  const diferencia = calculateDiferenciaConfirmada(currentMonthPayments);

  // 5.4 Pendientes (Count and sum of expectedAmount for pending)
  const pendienteInfo = calculatePendientes(currentMonthPayments);

  // 6. Próximos Gastos (Mes actual y vencidos de meses pasados, excluyendo ingresos y meses futuros)
  const upcomingPaymentsAll = payments.filter(p => {
    if (p.status === 'PAID' || p.status === 'CANCELED' || p.status === 'REFUNDED') return false;
    if (p.type === 'income') return false; // Solo gastos
    const isFuturePeriod = p.originalPeriodYear > currentYear || (p.originalPeriodYear === currentYear && p.originalPeriodMonth > currentMonth);
    return !isFuturePeriod;
  });
  
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

  const validUpcoming = sortedUpcoming;
  const totalUpcomingPendingExpenses = validUpcoming.reduce((sum, p) => sum + (getPaymentDisplayAmount(p) || 0), 0) / 100;

  const getPaymentAccount = (p: Payment) => {
    const concept = p.conceptId ? conceptsMap.get(p.conceptId) : undefined;
    const accountId = p.accountId || concept?.accountId;
    if (!accountId) return null;
    return accounts.find(a => a.id === accountId) || null;
  };

  const getPaymentDestinationAccount = (p: Payment) => {
    const concept = p.conceptId ? conceptsMap.get(p.conceptId) : undefined;
    const destinationAccountId = p.destinationAccountId || concept?.destinationAccountId;
    if (!destinationAccountId) return null;
    return accounts.find(a => a.id === destinationAccountId) || null;
  };

  // Group upcoming pending payments by account
  const upcomingByAccount = useMemo(() => {
    const counts: Record<string, { pendingAmount: number; count: number; account: (typeof accounts)[0] | null }> = {
      ALL: { pendingAmount: totalUpcomingPendingExpenses, count: validUpcoming.length, account: null }
    };

    validUpcoming.forEach(p => {
      const acc = getPaymentAccount(p);
      const key = acc ? acc.id : 'UNASSIGNED';
      if (!counts[key]) {
        counts[key] = { pendingAmount: 0, count: 0, account: acc };
      }
      counts[key].pendingAmount += (getPaymentDisplayAmount(p) || 0) / 100;
      counts[key].count += 1;
    });

    return counts;
  }, [validUpcoming, totalUpcomingPendingExpenses, accounts, conceptsMap]);

  // Filtered upcoming payments based on account chip selection
  const filteredUpcoming = useMemo(() => {
    if (upcomingAccountFilter === 'ALL') return validUpcoming;
    if (upcomingAccountFilter === 'UNASSIGNED') {
      return validUpcoming.filter(p => !getPaymentAccount(p));
    }
    return validUpcoming.filter(p => getPaymentAccount(p)?.id === upcomingAccountFilter);
  }, [validUpcoming, upcomingAccountFilter, accounts, conceptsMap]);

  const totalFilteredPendingAmount = useMemo(() => {
    return filteredUpcoming.reduce((sum, p) => sum + (getPaymentDisplayAmount(p) || 0), 0) / 100;
  }, [filteredUpcoming]);

  // Monthly summary by account for current month expenses and outgoing transfers
  const accountExpensesSummary = useMemo(() => {
    const expensePayments = currentMonthPayments.filter(p => ((p.type || 'expense') === 'expense' || p.type === 'transfer') && p.status !== 'CANCELED');

    const summaryMap: Record<string, {
      account: (typeof accounts)[0] | null;
      totalExpected: number;
      totalPaid: number;
      totalPending: number;
      pendingCount: number;
      paidCount: number;
      totalCount: number;
    }> = {};

    accounts.forEach(acc => {
      summaryMap[acc.id] = {
        account: acc,
        totalExpected: 0,
        totalPaid: 0,
        totalPending: 0,
        pendingCount: 0,
        paidCount: 0,
        totalCount: 0
      };
    });

    summaryMap['UNASSIGNED'] = {
      account: null,
      totalExpected: 0,
      totalPaid: 0,
      totalPending: 0,
      pendingCount: 0,
      paidCount: 0,
      totalCount: 0
    };

    expensePayments.forEach(p => {
      const acc = getPaymentAccount(p);
      const key = acc ? acc.id : 'UNASSIGNED';
      if (!summaryMap[key]) {
        summaryMap[key] = {
          account: acc,
          totalExpected: 0,
          totalPaid: 0,
          totalPending: 0,
          pendingCount: 0,
          paidCount: 0,
          totalCount: 0
        };
      }

      const expected = (getPaymentDisplayAmount(p) || 0) / 100;
      summaryMap[key].totalExpected += expected;
      summaryMap[key].totalCount += 1;

      if (p.status === 'PAID') {
        const paid = (p.actualAmount !== null && p.actualAmount !== undefined ? p.actualAmount : (p.expectedAmount || 0)) / 100;
        summaryMap[key].totalPaid += paid;
        summaryMap[key].paidCount += 1;
      } else {
        summaryMap[key].totalPending += expected;
        summaryMap[key].pendingCount += 1;
      }
    });

    const list = accounts.map(acc => summaryMap[acc.id]).filter(Boolean);
    if (summaryMap['UNASSIGNED'] && summaryMap['UNASSIGNED'].totalCount > 0) {
      list.push(summaryMap['UNASSIGNED']);
    }
    return list;
  }, [currentMonthPayments, accounts, conceptsMap]);

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
              <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Balance Previsto</p>
              <p className={`text-lg md:text-2xl font-bold ${previstoInfo.net >= 0 ? 'text-green-600' : 'text-slate-900'}`}>
                {previstoInfo.net > 0 ? '+' : ''}{previstoInfo.net.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
              <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                <p>Ingresos: {previstoInfo.incomes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                <p>Gastos: {previstoInfo.expenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
              </div>
            </div>
            
            <div className="bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Balance Real</p>
              <p className={`text-lg md:text-2xl font-bold ${pagadoInfo.net >= 0 ? 'text-green-600' : 'text-slate-900'}`}>
                {pagadoInfo.net > 0 ? '+' : ''}{pagadoInfo.net.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
              <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                <p>Ingresos: {pagadoInfo.incomes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                <p>Gastos: {pagadoInfo.expenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
              </div>
            </div>

            <div className="bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">
                Desviación
              </p>
              <p className={`text-lg md:text-2xl font-bold ${diferencia === 0 ? 'text-slate-600' : diferencia > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {Math.abs(diferencia).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                {diferencia === 0 ? 'Sin diferencia' : diferencia > 0 ? 'Has perdido dinero (sobrecoste / menos ingresos)' : 'Has ganado dinero (ahorro / más ingresos)'}
              </p>
            </div>

            <div className="bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Pendiente (Gastos)</p>
              <p className="text-lg md:text-2xl font-bold text-orange-500">
                {pendienteInfo.expenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">{pendienteInfo.count} movimientos pdtes</p>
            </div>

          </div>
        )}

        {/* Resumen de gastos por cuenta bancaria en el mes corriente */}
        {accounts.length > 0 && accountExpensesSummary.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs sm:text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-600 text-[18px]">account_balance</span>
                Gastos por Cuenta Bancaria ({MONTH_NAMES[currentMonth]})
              </h3>
              <span className="text-xs text-slate-400 hidden sm:inline">Haz clic en una cuenta para filtrar sus próximos gastos</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {accountExpensesSummary.map((summary) => {
                const acc = summary.account;
                const isUnassigned = !acc;
                const pctPaid = summary.totalExpected > 0 ? Math.min(100, Math.round((summary.totalPaid / summary.totalExpected) * 100)) : (summary.paidCount > 0 ? 100 : 0);
                const isSelectedInUpcoming = upcomingAccountFilter === (acc ? acc.id : 'UNASSIGNED');

                return (
                  <div
                    key={acc ? acc.id : 'unassigned'}
                    onClick={() => setUpcomingAccountFilter(isSelectedInUpcoming ? 'ALL' : (acc ? acc.id : 'UNASSIGNED'))}
                    className={`p-4 rounded-xl border transition-all cursor-pointer bg-white shadow-xs hover:shadow-md ${
                      isSelectedInUpcoming 
                        ? 'ring-2 ring-indigo-500 border-indigo-400 bg-indigo-50/20' 
                        : isUnassigned && summary.pendingCount > 0
                          ? 'border-amber-300 bg-amber-50/30'
                          : 'border-slate-200 hover:border-slate-300'
                    }`}
                    title="Haz clic para filtrar Próximos Gastos por esta cuenta"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2 truncate">
                        {acc ? (
                          <span className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10 shadow-2xs" style={{ backgroundColor: acc.color }} />
                        ) : (
                          <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">help</span>
                        )}
                        <span className="font-bold text-sm text-slate-800 truncate">
                          {acc ? acc.name : 'Sin cuenta asignada'}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                        {summary.totalCount} {summary.totalCount === 1 ? 'gasto' : 'gastos'}
                      </span>
                    </div>

                    {/* Total previsto */}
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-xs text-slate-500">Total previsto:</span>
                      <span className="text-base font-bold text-slate-900">
                        {summary.totalExpected.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </span>
                    </div>

                    {/* Pendiente vs Pagado */}
                    <div className="space-y-1 text-xs border-t border-slate-100 pt-2 mb-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                          Pendiente:
                        </span>
                        <span className={`font-bold ${summary.pendingCount > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                          {summary.totalPending.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                          <span className="text-[10px] font-normal text-slate-400 ml-1">
                            ({summary.pendingCount} pdte{summary.pendingCount === 1 ? '' : 's'})
                          </span>
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          Ya pagado:
                        </span>
                        <span className="font-medium text-emerald-700">
                          {summary.totalPaid.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                    </div>

                    {/* Barra de progreso */}
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pctPaid}%`,
                          backgroundColor: acc?.color || '#f59e0b'
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>{pctPaid}% pagado</span>
                      {summary.pendingCount === 0 && summary.totalCount > 0 ? (
                        <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px]">done_all</span>
                          Al día
                        </span>
                      ) : (
                        <span>{summary.pendingCount} restantes</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 6. Próximos Pagos and 7. Calendario (Layout split) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Próximos gastos */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 md:px-6 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-col gap-2.5">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-slate-800">Próximos Gastos</h2>
                <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200/60 px-2.5 py-1 rounded-full">
                  Pendiente: {totalFilteredPendingAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>
              <button onClick={onNavigateToCalendar} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                Ver todos
              </button>
            </div>

            {/* Chips de filtro rápido por cuenta bancaria */}
            {accounts.length > 0 && validUpcoming.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <button
                  onClick={() => setUpcomingAccountFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    upcomingAccountFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Todas ({validUpcoming.length})
                </button>
                {accounts.map(acc => {
                  const info = upcomingByAccount[acc.id];
                  if (!info || info.count === 0) return null;
                  const isSelected = upcomingAccountFilter === acc.id;
                  return (
                    <button
                      key={acc.id}
                      onClick={() => setUpcomingAccountFilter(isSelected ? 'ALL' : acc.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                        isSelected 
                          ? 'text-white shadow-xs' 
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                      style={{
                        backgroundColor: isSelected ? acc.color : undefined
                      }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isSelected ? '#ffffff' : acc.color }} />
                      <span>{acc.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {info.pendingAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} ({info.count})
                      </span>
                    </button>
                  );
                })}
                {upcomingByAccount['UNASSIGNED'] && upcomingByAccount['UNASSIGNED'].count > 0 && (
                  <button
                    onClick={() => setUpcomingAccountFilter(upcomingAccountFilter === 'UNASSIGNED' ? 'ALL' : 'UNASSIGNED')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      upcomingAccountFilter === 'UNASSIGNED'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">help</span>
                    <span>Sin cuenta ({upcomingByAccount['UNASSIGNED'].count})</span>
                  </button>
                )}
              </div>
            )}
          </div>
          
          <div className="divide-y divide-slate-100 flex-1">
            {filteredUpcoming.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <p>No hay gastos pendientes con el filtro seleccionado.</p>
                {upcomingAccountFilter !== 'ALL' && (
                  <button 
                    onClick={() => setUpcomingAccountFilter('ALL')}
                    className="mt-2 text-xs text-indigo-600 hover:underline font-semibold"
                  >
                    Ver todos los gastos próximos
                  </button>
                )}
              </div>
            ) : (
              filteredUpcoming.map(p => {
                const concept = p.conceptId ? conceptsMap.get(p.conceptId) : undefined;
                const isNoDay = concept?.dateType === 'month_only' || p.status === 'PENDING_DATE';
                const isTransfer = (p.type || concept?.type) === 'transfer';
                const paymentAccount = getPaymentAccount(p);
                const destAccount = isTransfer ? getPaymentDestinationAccount(p) : null;
                
                return (
                  <div key={p.id} className="p-4 flex justify-between items-center hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => onOpenPayment(p)}>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-slate-900">{p.concept}</h3>
                        {isTransfer ? (
                          <div className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full text-[10px] font-bold text-indigo-900">
                            <span className="material-symbols-outlined text-[11px] text-indigo-600">sync_alt</span>
                            <span>{paymentAccount ? paymentAccount.name : 'Sin origen'}</span>
                            <span className="text-indigo-400 font-bold">➔</span>
                            <span>{destAccount ? destAccount.name : 'Sin destino'}</span>
                          </div>
                        ) : paymentAccount ? (
                          <span 
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-2xs"
                            style={{ backgroundColor: paymentAccount.color }}
                          >
                            <span className="material-symbols-outlined text-[10px]">account_balance</span>
                            {paymentAccount.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200">
                            Sin cuenta
                          </span>
                        )}
                      </div>
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
                        {formatAmount(getPaymentDisplayAmount(p), p.type || 'expense', p.isAmountApproximate)}
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

          {filteredUpcoming.length > 0 && (
            <div className="p-4 bg-slate-50/80 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs font-medium text-slate-600 mt-auto">
              <div className="flex items-center gap-2">
                <span>Gastos pendientes ({filteredUpcoming.length}):</span>
                <span className="text-sm font-bold text-orange-600">
                  {totalFilteredPendingAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>

              {upcomingAccountFilter === 'ALL' && accounts.length > 0 && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                  {accounts.map(acc => {
                    const info = upcomingByAccount[acc.id];
                    if (!info || info.count === 0) return null;
                    return (
                      <span key={acc.id} className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: acc.color }} />
                        <span className="font-semibold">{acc.name}:</span>
                        <span className="text-slate-700">{info.pendingAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} ({info.count})</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <CompactCalendar 
            payments={payments}
            concepts={concepts}
            currentMonth={currentMonth}
            currentYear={currentYear}
            onNavigateToCalendar={onNavigateToCalendar}
            onOpenPayment={onOpenPayment}
            onOpenDay={setSelectedDayDate}
          />
        </div>
      </div>

      {selectedDayDate && (
        <DailyPaymentsModal
          initialDate={selectedDayDate}
          payments={payments}
          concepts={concepts}
          onClose={() => setSelectedDayDate(null)}
          onOpenPayment={onOpenPayment}
        />
      )}

      {previewMonthDate && (
        <MonthPreviewModal
          initialMonth={previewMonthDate.month}
          initialYear={previewMonthDate.year}
          payments={payments}
          concepts={concepts}
          onClose={() => setPreviewMonthDate(null)}
          onOpenPayment={onOpenPayment}
        />
      )}
    </div>
  );
}
