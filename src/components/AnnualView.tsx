import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Payment, Concept } from '../types';
import { 
  calculateTotalPrevisto, 
  calculateTotalPagadoReal, 
  calculateDiferenciaConfirmada, 
  calculatePendientes, 
  filterPaymentsByYear,
  PENDING_STATUSES
} from '../utils/paymentUtils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AnnualBreakdowns } from './AnnualBreakdowns';
import { MONTH_NAMES, MONTH_NAMES_SHORT, formatStatusLabel, getCategoryColor } from '../utils/formatUtils';
import { useAppState } from '../context/AppStateContext';
import { useData } from '../context/DataContext';

interface AnnualViewProps {
  payments: Payment[];
  concepts: Concept[];
  globalYear: number;
  setGlobalYear: React.Dispatch<React.SetStateAction<number>>;
  onOpenPayment: (payment: Payment) => void;
}

export function AnnualView({ payments, concepts, globalYear, setGlobalYear, onOpenPayment }: AnnualViewProps) {
  const navigate = useNavigate();
  const { setGlobalMonth } = useAppState();
  const { customCategories } = useData();
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  const handleNavigateToMonth = (monthIndex: number) => {
    setGlobalYear(globalYear);
    setGlobalMonth(monthIndex);
    navigate('/calendario');
  };

  // Search & Sort states for matrix
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'previsto' | 'real'>('name');
  const [sortDesc, setSortDesc] = useState(false);
  const [isIncomeCollapsed, setIsIncomeCollapsed] = useState(false);
  const [isExpenseCollapsed, setIsExpenseCollapsed] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const toggleCategoryCollapse = (catName: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [catName]: !prev[catName]
    }));
  };

  const conceptsMap = useMemo(() => new Map(concepts.map(c => [c.id, c])), [concepts]);

  const thisYearPayments = filterPaymentsByYear(payments, globalYear);
  
  const previstoGlobal = calculateTotalPrevisto(thisYearPayments);
  const realGlobal = calculateTotalPagadoReal(thisYearPayments);
  const totalPrevisto = previstoGlobal.net;
  const totalRealPagado = realGlobal.net;
  const diferenciaConfirmada = calculateDiferenciaConfirmada(thisYearPayments);
  const pendientesGlobal = calculatePendientes(thisYearPayments);
  const countPendientes = pendientesGlobal.count;
  
  const countPagados = thisYearPayments.filter(p => p.status === 'PAID').length;
  const countCancelados = thisYearPayments.filter(p => p.status === 'CANCELED').length;

  const chartData = useMemo(() => {
    return MONTH_NAMES_SHORT.map((monthName, index) => {
      const monthPayments = thisYearPayments.filter(p => p.originalPeriodMonth === index);
      const prev = calculateTotalPrevisto(monthPayments);
      const real = calculateTotalPagadoReal(monthPayments);
      return {
        name: monthName,
        Previsto: prev.net,
        Real: real.net,
        IngresosPrev: prev.incomes,
        GastosPrev: prev.expenses,
        IngresosReal: real.incomes,
        GastosReal: real.expenses,
        monthIndex: index
      };
    });
  }, [thisYearPayments]);

  const matrixData = useMemo(() => {
    const conceptsInYear = concepts.filter(c => thisYearPayments.some(p => p.conceptId === c.id));

    const rows = conceptsInYear.map(c => {
      const conceptPayments = thisYearPayments.filter(p => p.conceptId === c.id);
      const isIncome = c.type === 'income' || (!c.type && (['Salario', 'Paga Extra', 'Ingreso Extra'].includes(c.category) || conceptPayments.some(p => p.type === 'income')));

      const prevTotals = calculateTotalPrevisto(conceptPayments);
      const realTotals = calculateTotalPagadoReal(conceptPayments);

      const totalPrevisto = isIncome ? prevTotals.incomes : prevTotals.expenses;
      const totalReal = isIncome ? realTotals.incomes : realTotals.expenses;

      const months: Record<number, { previsto: number; real: number; payments: Payment[] }> = {};

      for (let i = 0; i < 12; i++) {
        const p = conceptPayments.filter(p => p.originalPeriodMonth === i);
        const mPrev = calculateTotalPrevisto(p);
        const mReal = calculateTotalPagadoReal(p);
        months[i] = {
          previsto: isIncome ? mPrev.incomes : mPrev.expenses,
          real: isIncome ? mReal.incomes : mReal.expenses,
          payments: p
        };
      }

      return {
        concept: c,
        isIncome,
        totalPrevisto,
        totalReal,
        months
      };
    });

    // Filter
    let filteredRows = rows;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filteredRows = rows.filter(r => r.concept.name.toLowerCase().includes(q));
    }
    
    // Sort
    filteredRows.sort((a, b) => {
      let diff = 0;
      if (sortBy === 'name') diff = a.concept.name.localeCompare(b.concept.name);
      else if (sortBy === 'previsto') diff = a.totalPrevisto - b.totalPrevisto;
      else if (sortBy === 'real') diff = a.totalReal - b.totalReal;
      
      return sortDesc ? -diff : diff;
    });

    const incomeRows = filteredRows.filter(r => r.isIncome);
    const expenseRows = filteredRows.filter(r => !r.isIncome);

    return { incomeRows, expenseRows, allRows: filteredRows };
  }, [thisYearPayments, concepts, searchQuery, sortBy, sortDesc]);

  const expenseCategories = useMemo(() => {
    const map = new Map<string, typeof matrixData.expenseRows>();
    matrixData.expenseRows.forEach(row => {
      const cat = row.concept.category || 'Otro';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(row);
    });

    return Array.from(map.entries()).map(([category, rows]) => {
      const catTotalReal = rows.reduce((sum, r) => sum + r.totalReal, 0);
      const catTotalPrevisto = rows.reduce((sum, r) => sum + r.totalPrevisto, 0);
      return {
        category,
        rows,
        catTotalReal,
        catTotalPrevisto
      };
    });
  }, [matrixData.expenseRows]);

  const filteredTotals = useMemo(() => {
    let globalExpensePrev = 0;
    let globalExpenseReal = 0;
    let globalIncomePrev = 0;
    let globalIncomeReal = 0;

    const monthlyExpensePrev = Array(12).fill(0);
    const monthlyExpenseReal = Array(12).fill(0);
    const monthlyIncomePrev = Array(12).fill(0);
    const monthlyIncomeReal = Array(12).fill(0);

    matrixData.allRows.forEach(row => {
      if (row.isIncome) {
        globalIncomePrev += row.totalPrevisto;
        globalIncomeReal += row.totalReal;
        for (let i = 0; i < 12; i++) {
          monthlyIncomePrev[i] += row.months[i].previsto;
          monthlyIncomeReal[i] += row.months[i].real;
        }
      } else {
        globalExpensePrev += row.totalPrevisto;
        globalExpenseReal += row.totalReal;
        for (let i = 0; i < 12; i++) {
          monthlyExpensePrev[i] += row.months[i].previsto;
          monthlyExpenseReal[i] += row.months[i].real;
        }
      }
    });

    const globalNetReal = globalIncomeReal - globalExpenseReal;
    const monthlyNetReal = Array(12).fill(0);
    for (let i = 0; i < 12; i++) {
      monthlyNetReal[i] = monthlyIncomeReal[i] - monthlyExpenseReal[i];
    }

    return { 
      globalExpensePrev, 
      globalExpenseReal, 
      globalIncomePrev, 
      globalIncomeReal,
      globalNetReal,
      monthlyExpensePrev, 
      monthlyExpenseReal,
      monthlyIncomePrev,
      monthlyIncomeReal,
      monthlyNetReal
    };
  }, [matrixData]);

  const handlePrevYear = () => setGlobalYear(globalYear - 1);
  const handleNextYear = () => setGlobalYear(globalYear + 1);

  return (
    <div className="p-4 md:p-8 space-y-6 flex-1 overflow-y-auto max-w-7xl mx-auto w-full">
      
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-2">
        <h2 className="text-2xl font-bold text-slate-800">Resumen Anual</h2>
        
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
          <button onClick={handlePrevYear} aria-label="Año anterior" className="p-1.5 hover:bg-slate-100 rounded-md text-slate-600 transition-colors">
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
          <span className="text-lg font-bold text-slate-800 min-w-[4rem] text-center">{globalYear}</span>
          <button onClick={handleNextYear} aria-label="Año siguiente" className="p-1.5 hover:bg-slate-100 rounded-md text-slate-600 transition-colors">
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
        </div>
      </div>
      
      {thisYearPayments.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200 shadow-sm">
          <span className="material-symbols-outlined text-5xl mb-4 text-slate-300">event_busy</span>
          <h3 className="text-xl font-bold text-slate-800 mb-2">No hay datos para {globalYear}</h3>
          <p className="text-slate-500 font-medium">No existen vencimientos registrados en este periodo.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* INGRESOS */}
            <div className="bg-white rounded-xl border border-emerald-100 shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">arrow_upward</span> Ingresos del Año
                </h3>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] text-slate-500 font-medium">REAL</span>
                  <span className="text-xl font-bold text-emerald-600">{realGlobal.incomes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </div>
                <div className="flex justify-between items-end border-t border-slate-50 pt-1">
                  <span className="text-[10px] text-slate-400">PREVISTO</span>
                  <span className="text-xs font-semibold text-slate-600">{previstoGlobal.incomes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </div>
              </div>
            </div>

            {/* GASTOS */}
            <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xs font-bold text-red-800 uppercase tracking-wider flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">arrow_downward</span> Gastos del Año
                </h3>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] text-slate-500 font-medium">REAL</span>
                  <span className="text-xl font-bold text-red-600">{realGlobal.expenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </div>
                <div className="flex justify-between items-end border-t border-slate-50 pt-1">
                  <span className="text-[10px] text-slate-400">PREVISTO</span>
                  <span className="text-xs font-semibold text-slate-600">{previstoGlobal.expenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </div>
              </div>
            </div>

            {/* NETO */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">account_balance</span> Balance Neto
                </h3>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] text-slate-500 font-medium">REAL</span>
                  <span className={`text-xl font-bold ${realGlobal.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {realGlobal.net > 0 ? '+' : ''}{realGlobal.net.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
                <div className="flex justify-between items-end border-t border-slate-50 pt-1">
                  <span className="text-[10px] text-slate-400">PREVISTO</span>
                  <span className={`text-xs font-semibold ${previstoGlobal.net >= 0 ? 'text-slate-700' : 'text-red-500'}`}>
                    {previstoGlobal.net > 0 ? '+' : ''}{previstoGlobal.net.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
             <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center flex flex-col justify-center">
                <span className="block text-[10px] font-bold text-slate-500 uppercase">Pagados</span>
                <span className="block text-xl font-bold text-green-700">{countPagados}</span>
             </div>
             <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center flex flex-col justify-center">
                <span className="block text-[10px] font-bold text-slate-500 uppercase">Pendientes</span>
                <span className="block text-xl font-bold text-orange-600">{countPendientes}</span>
             </div>
             <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center flex flex-col justify-center">
                <span className="block text-[10px] font-bold text-slate-500 uppercase">Cancelados</span>
                <span className="block text-xl font-bold text-slate-600">{countCancelados}</span>
             </div>
          </div>

          <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-base md:text-lg font-bold text-slate-800 mb-1">Evolución Mensual</h3>
            <p className="text-xs text-slate-400 mb-5">Haz clic en una barra para ver ese mes en el calendario</p>
            <div className="h-64 md:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={chartData} 
                  margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  onClick={(data: any) => {
                    if (data && data.activePayload && data.activePayload.length > 0) {
                      const monthIndex = data.activePayload[0].payload.monthIndex;
                      if (monthIndex !== undefined) handleNavigateToMonth(monthIndex);
                    }
                  }}
                  style={{ cursor: 'pointer', outline: 'none' }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickFormatter={(value) => `${value} €`}
                    width={50}
                  />
                  <Tooltip 
                    cursor={{ fill: '#eef2ff' }}
                    formatter={(value: number) => value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', outline: 'none' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  <Bar dataKey="IngresosReal" name="Ingresos (Real)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} style={{ outline: 'none' }} />
                  <Bar dataKey="GastosReal" name="Gastos (Real)" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} style={{ outline: 'none' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Matriz Anual Desktop */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">
                Desglose por Concepto (Matriz Anual)
                {searchQuery.trim() !== '' && <span className="ml-2 text-xs font-normal text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Filtrado</span>}
              </h3>
              
              <div className="flex items-center gap-3">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                  <input 
                    type="text" 
                    placeholder="Buscar concepto..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-48"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>
                <select 
                  value={`${sortBy}-${sortDesc ? 'desc' : 'asc'}`}
                  onChange={(e) => {
                    const [s, d] = e.target.value.split('-');
                    setSortBy(s as any);
                    setSortDesc(d === 'desc');
                  }}
                  className="py-1.5 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-700 bg-white"
                >
                  <option value="name-asc">Nombre (A-Z)</option>
                  <option value="name-desc">Nombre (Z-A)</option>
                  <option value="previsto-desc">Previsto (Mayor)</option>
                  <option value="previsto-asc">Previsto (Menor)</option>
                  <option value="real-desc">Real (Mayor)</option>
                  <option value="real-asc">Real (Menor)</option>
                </select>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 w-48 shadow-[1px_0_0_0_#e2e8f0]">Concepto</th>
                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right w-24">Total Año</th>
                    {MONTH_NAMES_SHORT.map((m, i) => (
                      <th 
                        key={m} 
                        className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right min-w-[70px] cursor-pointer hover:bg-indigo-50 hover:text-indigo-600 transition-colors group"
                        onClick={() => handleNavigateToMonth(i)}
                        title={`Ver ${m} en el calendario`}
                      >
                        {m}
                        <span className="material-symbols-outlined text-[10px] opacity-0 group-hover:opacity-100 ml-0.5 align-middle transition-opacity">open_in_new</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* SECCIÓN INGRESOS */}
                  {matrixData.incomeRows.length > 0 && (
                    <>
                      <tr 
                        onClick={() => setIsIncomeCollapsed(!isIncomeCollapsed)}
                        className="bg-emerald-50/80 hover:bg-emerald-100/80 border-y border-emerald-200 cursor-pointer select-none transition-colors group"
                      >
                        <td colSpan={14} className="p-2.5 text-xs font-bold text-emerald-900 uppercase tracking-wider sticky left-0 bg-emerald-50/80 group-hover:bg-emerald-100/80 z-10 shadow-[1px_0_0_0_#a7f3d0]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-sm text-emerald-600">arrow_upward</span>
                              <span>Ingresos ({matrixData.incomeRows.length})</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                              <span>{isIncomeCollapsed ? 'Mostrar' : 'Plegar'}</span>
                              <span className={`material-symbols-outlined text-base transition-transform ${isIncomeCollapsed ? '' : 'rotate-180'}`}>
                                expand_more
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {!isIncomeCollapsed && matrixData.incomeRows.map((row) => (
                        <tr key={row.concept.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="p-3 text-sm font-semibold text-slate-800 sticky left-0 bg-white group-hover:bg-slate-50 shadow-[1px_0_0_0_#e2e8f0] truncate max-w-[200px]" title={row.concept.name}>
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                              <span className="truncate">{row.concept.name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="text-sm font-bold text-emerald-700">{row.totalReal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>
                            {row.totalReal !== row.totalPrevisto && (
                              <div className="text-[10px] text-slate-500 line-through">{row.totalPrevisto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>
                            )}
                          </td>
                          {Array.from({ length: 12 }).map((_, i) => {
                            const cell = row.months[i];
                            if (cell.payments.length === 0) return <td key={i} className="p-3 text-center text-slate-300">-</td>;
                            
                            const hasPending = cell.payments.some((p: Payment) => p.status !== 'PAID' && p.status !== 'CANCELED');
                            
                            return (
                              <td key={i} className="p-3 text-right cursor-pointer hover:bg-emerald-50 transition-colors" onClick={() => onOpenPayment(cell.payments[0])}>
                                <div className={`text-sm font-bold ${hasPending ? 'text-orange-600' : 'text-emerald-700'}`}>
                                  {cell.real > 0 ? cell.real.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : (hasPending ? cell.previsto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '0,00 €')}
                                </div>
                                {cell.real > 0 && cell.real !== cell.previsto && (
                                  <div className="text-[10px] text-slate-500 line-through">
                                    {cell.previsto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                  </div>
                                )}
                                {cell.payments.length > 1 && (
                                  <div className="text-[10px] text-indigo-600 font-medium">+{cell.payments.length - 1} más</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  )}

                  {/* SECCIÓN GASTOS */}
                  {matrixData.expenseRows.length > 0 && (
                    <>
                      <tr 
                        onClick={() => setIsExpenseCollapsed(!isExpenseCollapsed)}
                        className="bg-red-50/80 hover:bg-red-100/80 border-y border-red-200 cursor-pointer select-none transition-colors group"
                      >
                        <td colSpan={14} className="p-2.5 text-xs font-bold text-red-900 uppercase tracking-wider sticky left-0 bg-red-50/80 group-hover:bg-red-100/80 z-10 shadow-[1px_0_0_0_#fecaca]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-sm text-red-600">arrow_downward</span>
                              <span>Gastos ({matrixData.expenseRows.length})</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] font-medium text-red-700">
                              <span>{isExpenseCollapsed ? 'Mostrar' : 'Plegar'}</span>
                              <span className={`material-symbols-outlined text-base transition-transform ${isExpenseCollapsed ? '' : 'rotate-180'}`}>
                                expand_more
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {!isExpenseCollapsed && expenseCategories.map(({ category, rows, catTotalReal, catTotalPrevisto }) => {
                        const isCatCollapsed = !!collapsedCategories[category];
                        return (
                          <React.Fragment key={category}>
                            {/* Category Subheader Row */}
                            <tr 
                              onClick={() => toggleCategoryCollapse(category)}
                              className="bg-slate-100/90 hover:bg-slate-200/90 border-y border-slate-200 cursor-pointer select-none transition-colors group"
                            >
                              <td colSpan={14} className="py-2 px-3 text-xs font-bold text-slate-800 sticky left-0 bg-slate-100/90 group-hover:bg-slate-200/90 z-10 shadow-[1px_0_0_0_#cbd5e1]">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const customMatch = customCategories.find(c => c.name === category);
                                      const catColor = getCategoryColor(category, customMatch?.color);
                                      
                                      let icon = 'folder';
                                      let iconClass = 'text-indigo-600';
                                      let badgeStyle: React.CSSProperties = {};
                                      let badgeClass = 'bg-white text-slate-600 border-slate-200';
                                      
                                      if (category === 'Hipoteca') {
                                        icon = 'home'; iconClass = 'text-purple-600'; badgeClass = 'bg-purple-50 text-purple-700 border-purple-200';
                                      } else if (category === 'Préstamo') {
                                        icon = 'credit_score'; iconClass = 'text-pink-600'; badgeClass = 'bg-pink-50 text-pink-700 border-pink-200';
                                      } else if (category === 'Ahorro') {
                                        icon = 'savings'; iconClass = 'text-blue-600'; badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                                      } else if (customMatch) {
                                        icon = 'label';
                                        badgeClass = 'bg-white border-slate-200';
                                        badgeStyle = { color: catColor, borderColor: catColor, backgroundColor: `${catColor}15` };
                                      }

                                      return (
                                        <>
                                          <span className={`material-symbols-outlined text-sm ${iconClass}`} style={customMatch ? { color: catColor } : undefined}>
                                            {icon}
                                          </span>
                                          <span className="font-bold text-slate-800">{category}</span>
                                          <span 
                                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}
                                            style={badgeStyle}
                                          >
                                            {rows.length} {rows.length === 1 ? 'concepto' : 'conceptos'}
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="text-right">
                                      <span className="text-xs font-bold text-slate-900">{catTotalReal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                                      {catTotalReal !== catTotalPrevisto && (
                                        <span className="text-[10px] text-slate-500 line-through ml-1.5">{catTotalPrevisto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-0.5 text-[11px] font-medium text-slate-600">
                                      <span>{isCatCollapsed ? 'Mostrar' : 'Plegar'}</span>
                                      <span className={`material-symbols-outlined text-sm transition-transform ${isCatCollapsed ? '' : 'rotate-180'}`}>
                                        expand_more
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>

                            {/* Category Rows */}
                            {!isCatCollapsed && rows.map((row) => (
                              <tr key={row.concept.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="p-3 text-sm font-semibold text-slate-800 sticky left-0 bg-white group-hover:bg-slate-50 shadow-[1px_0_0_0_#e2e8f0] truncate max-w-[200px] pl-6" title={row.concept.name}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                                    <span className="truncate">{row.concept.name}</span>
                                  </div>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="text-sm font-bold text-slate-900">{row.totalReal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>
                                  {row.totalReal !== row.totalPrevisto && (
                                    <div className="text-[10px] text-slate-500 line-through">{row.totalPrevisto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>
                                  )}
                                </td>
                                {Array.from({ length: 12 }).map((_, i) => {
                                  const cell = row.months[i];
                                  if (cell.payments.length === 0) return <td key={i} className="p-3 text-center text-slate-300">-</td>;
                                  
                                  const hasPending = cell.payments.some((p: Payment) => p.status !== 'PAID' && p.status !== 'CANCELED');
                                  
                                  return (
                                    <td key={i} className="p-3 text-right cursor-pointer hover:bg-indigo-50 transition-colors" onClick={() => onOpenPayment(cell.payments[0])}>
                                      <div className={`text-sm font-bold ${hasPending ? 'text-orange-600' : 'text-slate-900'}`}>
                                        {cell.real > 0 ? cell.real.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : (hasPending ? cell.previsto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '0,00 €')}
                                      </div>
                                      {cell.real > 0 && cell.real !== cell.previsto && (
                                        <div className="text-[10px] text-slate-500 line-through">
                                          {cell.previsto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                        </div>
                                      )}
                                      {cell.payments.length > 1 && (
                                        <div className="text-[10px] text-indigo-600 font-medium">+{cell.payments.length - 1} más</div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}

                  {matrixData.allRows.length === 0 && (
                    <tr>
                      <td colSpan={14} className="p-6 text-center text-sm text-slate-400 font-medium">
                        No hay conceptos registradas en este filtro.
                      </td>
                    </tr>
                  )}

                  {/* Fila Totales Gastos (Previstos) */}
                  <tr className="bg-slate-100 border-t-2 border-slate-300">
                    <td className="p-3 text-xs font-bold text-slate-700 sticky left-0 bg-slate-100 shadow-[1px_0_0_0_#cbd5e1]">
                      {searchQuery ? 'Gastos Previstos (Filtrado)' : 'Totales Gastos (Previsto)'}
                    </td>
                    <td className="p-3 text-right text-xs font-bold text-slate-800">
                      {filteredTotals.globalExpensePrev.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    {filteredTotals.monthlyExpensePrev.map((v, i) => (
                      <td key={i} className="p-3 text-right text-xs font-bold text-slate-600">
                        {v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    ))}
                  </tr>

                  {/* Fila Totales Gastos (Real) */}
                  <tr className="bg-slate-100 border-t border-slate-200">
                    <td className="p-3 text-xs font-bold text-red-700 sticky left-0 bg-slate-100 shadow-[1px_0_0_0_#cbd5e1]">
                      {searchQuery ? 'Gastos Reales (Filtrado)' : 'Totales Gastos (Real)'}
                    </td>
                    <td className="p-3 text-right text-xs font-bold text-red-600">
                      {filteredTotals.globalExpenseReal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    {filteredTotals.monthlyExpenseReal.map((v, i) => (
                      <td key={i} className="p-3 text-right text-xs font-bold text-red-600">
                        {v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    ))}
                  </tr>

                  {/* Fila Totales Ingresos (Real) */}
                  <tr className="bg-slate-100 border-t border-slate-200">
                    <td className="p-3 text-xs font-bold text-emerald-700 sticky left-0 bg-slate-100 shadow-[1px_0_0_0_#cbd5e1]">
                      {searchQuery ? 'Ingresos Reales (Filtrado)' : 'Totales Ingresos (Real)'}
                    </td>
                    <td className="p-3 text-right text-xs font-bold text-emerald-600">
                      {filteredTotals.globalIncomeReal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    {filteredTotals.monthlyIncomeReal.map((v, i) => (
                      <td key={i} className="p-3 text-right text-xs font-bold text-emerald-600">
                        {v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    ))}
                  </tr>

                  {/* Fila Balance Neto Real (Ingresos - Gastos) */}
                  <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-800">
                    <td className="p-3 text-xs font-bold text-slate-100 sticky left-0 bg-slate-900 shadow-[1px_0_0_0_#334155]">
                      Balance Neto Real (I - G)
                    </td>
                    <td className={`p-3 text-right text-sm font-bold ${filteredTotals.globalNetReal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {filteredTotals.globalNetReal > 0 ? '+' : ''}{filteredTotals.globalNetReal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    {filteredTotals.monthlyNetReal.map((v, i) => (
                      <td key={i} className={`p-3 text-right text-xs font-bold ${v >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {v > 0 ? '+' : ''}{v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Acordeón Mensual Mobile */}
          <div className="md:hidden space-y-3">
            <h3 className="text-base font-bold text-slate-800 mb-2">Desglose por Meses</h3>
            {MONTH_NAMES.map((monthName, index) => {
              const monthPayments = thisYearPayments.filter(p => p.originalPeriodMonth === index);
              if (monthPayments.length === 0) return null;
              
              const isExpanded = expandedMonth === index;
              const mPrevInfo = calculateTotalPrevisto(monthPayments);
              const mRealInfo = calculateTotalPagadoReal(monthPayments);
              const mPendientes = monthPayments.filter(p => PENDING_STATUSES.includes(p.status)).length;

              return (
                <div key={index} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <button 
                    onClick={() => setExpandedMonth(isExpanded ? null : index)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <div>
                      <span className="block text-sm font-bold text-slate-800">{monthName}</span>
                      <span className="block text-xs text-slate-500">{monthPayments.length} recibos • {mPendientes} pdtes.</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleNavigateToMonth(index); }}
                        className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-full transition-colors"
                        title="Ver en calendario"
                      >
                        <span className="material-symbols-outlined text-[12px]">calendar_month</span>
                        Ver
                      </button>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-emerald-600 font-bold flex items-center"><span className="material-symbols-outlined text-[10px]">arrow_upward</span> {mRealInfo.incomes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                          <span className="text-red-600 font-bold flex items-center"><span className="material-symbols-outlined text-[10px]">arrow_downward</span> {mRealInfo.expenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                        </div>
                        <span className={`block text-sm font-bold ${mRealInfo.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {mRealInfo.net > 0 ? '+' : ''}{mRealInfo.net.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                      <span className={`material-symbols-outlined text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="divide-y divide-slate-100 border-t border-slate-200">
                      {monthPayments.map(p => {
                        const concept = conceptsMap.get(p.conceptId);
                        const isPending = PENDING_STATUSES.includes(p.status);
                        return (
                          <div 
                            key={p.id} 
                            onClick={() => onOpenPayment(p)}
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 active:bg-slate-100"
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-slate-800">{concept?.name || p.concept}</span>
                              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">{formatStatusLabel(p.status)}</span>
                            </div>
                            <div className="text-right">
                              <span className={`block text-sm font-bold ${isPending ? 'text-orange-600' : 'text-slate-900'}`}>
                                {isPending ? (p.expectedAmount / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : ((p.actualAmount ?? p.expectedAmount) / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <AnnualBreakdowns payments={thisYearPayments} concepts={concepts} onOpenPayment={onOpenPayment} />
        </>
      )}
    </div>
  );
}
