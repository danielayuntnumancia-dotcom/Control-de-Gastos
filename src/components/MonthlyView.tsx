import React, { useState, useMemo } from 'react';
import { Payment, Concept } from '../types';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarListView } from './CalendarListView';
import { CalendarYearView } from './CalendarYearView';

type ViewMode = 'month' | 'list' | 'year';

interface MonthlyViewProps {
  payments: Payment[];
  concepts: Concept[];
  onOpenPayment: (payment: Payment) => void;
  globalYear: number;
  setGlobalYear: React.Dispatch<React.SetStateAction<number>>;
}

export function MonthlyView({ payments, concepts, onOpenPayment, globalYear, setGlobalYear }: MonthlyViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  // Removed local globalYear

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setGlobalYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setGlobalYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const handleToday = () => {
    setSelectedMonth(today.getMonth());
    setGlobalYear(today.getFullYear());
  };

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      if (filterStatus !== 'ALL' && p.status !== filterStatus) return false;
      
      if (filterCategory !== 'ALL') {
        const concept = concepts.find(c => c.id === p.conceptId);
        if (concept?.category !== filterCategory) return false;
      }
      return true;
    });
  }, [payments, concepts, filterCategory, filterStatus]);

  const hasActiveFilters = filterCategory !== 'ALL' || filterStatus !== 'ALL';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 h-full">
      {/* Header and Controls */}
      <div className="px-4 md:px-8 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg self-start">
            <button 
              onClick={() => setViewMode('month')} 
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Mes
            </button>
            <button 
              onClick={() => setViewMode('list')} 
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Lista
            </button>
            <button 
              onClick={() => setViewMode('year')} 
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'year' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Año
            </button>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <select 
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="ALL">Todas las categorías</option>
              <option value="Suscripción">Suscripciones</option>
              <option value="Impuesto">Impuestos</option>
              <option value="Tasa">Tasas</option>
              <option value="Seguro">Seguros</option>
              <option value="Otro">Otros</option>
            </select>
            
            <select 
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="ALL">Todos los estados</option>
              <option value="PENDING">Pendiente</option>
              <option value="PAID">Pagado</option>
              <option value="OVERDUE">Vencido</option>
              <option value="PENDING_DATE">Fecha pendiente</option>
              <option value="DELAYED">Aplazado</option>
              <option value="CANCELED">Cancelado</option>
            </select>

            {hasActiveFilters && (
              <button 
                onClick={() => { setFilterCategory('ALL'); setFilterStatus('ALL'); }}
                className="text-xs text-slate-500 hover:text-slate-800"
                title="Restablecer filtros"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {viewMode === 'month' && (
          <CalendarMonthView 
            payments={filteredPayments} 
            concepts={concepts} 
            month={selectedMonth} 
            year={globalYear}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            onToday={handleToday}
            onOpenPayment={onOpenPayment}
            isFiltered={hasActiveFilters}
          />
        )}
        {viewMode === 'list' && (
          <CalendarListView 
            payments={filteredPayments} 
            concepts={concepts} 
            month={selectedMonth} 
            year={globalYear}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            onToday={handleToday}
            onOpenPayment={onOpenPayment}
            isFiltered={hasActiveFilters}
          />
        )}
        {viewMode === 'year' && (
          <CalendarYearView 
            payments={filteredPayments} 
            concepts={concepts} 
            year={globalYear}
            onPrevYear={() => setGlobalYear(y => y - 1)}
            onNextYear={() => setGlobalYear(y => y + 1)}
            onSelectMonth={(m) => { setSelectedMonth(m); setViewMode('month'); }}
            onToday={() => { handleToday(); setViewMode('month'); }}
            isFiltered={hasActiveFilters}
          />
        )}
      </div>
    </div>
  );
}
