import React, { useMemo } from 'react';
import { Payment, Concept } from '../types';
import { 
  calculateTotalPrevisto, 
  calculateTotalPagadoReal, 
  calculateDiferenciaConfirmada, 
  PENDING_STATUSES
} from '../utils/paymentUtils';

interface AnnualBreakdownsProps {
  payments: Payment[];
  concepts: Concept[];
  onOpenPayment: (payment: Payment) => void;
}

export function AnnualBreakdowns({ payments, concepts, onOpenPayment }: AnnualBreakdownsProps) {
  const byCategory = useMemo(() => {
    const cats = new Map<string, Payment[]>();
    payments.forEach(p => {
      const c = concepts.find(c => c.id === p.conceptId);
      const cat = c?.category || 'Sin categoría';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(p);
    });
    return Array.from(cats.entries()).map(([name, ps]) => ({
      name,
      previsto: calculateTotalPrevisto(ps),
      real: calculateTotalPagadoReal(ps),
      diff: calculateDiferenciaConfirmada(ps),
      pendientes: ps.filter(p => PENDING_STATUSES.includes(p.status)).length,
      pagados: ps.filter(p => p.status === 'PAID').length,
      cancelados: ps.filter(p => p.status === 'CANCELED').length,
      total: ps.length
    })).sort((a, b) => b.previsto - a.previsto);
  }, [payments, concepts]);

  const byStatus = useMemo(() => {
    const stats = new Map<string, Payment[]>();
    payments.forEach(p => {
      const s = p.status;
      if (!stats.has(s)) stats.set(s, []);
      stats.get(s)!.push(p);
    });
    return Array.from(stats.entries()).map(([name, ps]) => ({
      name,
      previsto: calculateTotalPrevisto(ps),
      real: calculateTotalPagadoReal(ps),
      total: ps.length
    })).sort((a, b) => b.total - a.total);
  }, [payments]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Por Categoría */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-base font-bold text-slate-800">Desglose por Categoría</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {byCategory.map(c => (
            <div key={c.name} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-slate-800">{c.name}</span>
                <span className="text-xs font-medium text-slate-500">{c.total} recibos</span>
              </div>
              <div className="flex justify-between text-sm">
                <div>
                  <span className="block text-xs text-slate-500">Previsto</span>
                  <span className="font-semibold text-slate-900">{c.previsto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-500 text-right">Real</span>
                  <span className="font-semibold text-green-700">{c.real.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </div>
              </div>
              <div className="mt-2 flex gap-3 text-[10px] uppercase font-bold text-slate-400">
                <span className={c.pendientes > 0 ? 'text-orange-500' : ''}>{c.pendientes} Pdtes</span>
                <span className={c.pagados > 0 ? 'text-green-600' : ''}>{c.pagados} Pagados</span>
                <span>{c.cancelados} Cancelados</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Por Estado */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-base font-bold text-slate-800">Desglose por Estado</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {byStatus.map(s => (
            <div key={s.name} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-slate-800">{s.name}</span>
                <span className="text-xs font-medium text-slate-500">{s.total} recibos</span>
              </div>
              <div className="flex justify-between text-sm">
                <div>
                  <span className="block text-xs text-slate-500">Previsto</span>
                  <span className="font-semibold text-slate-900">{s.previsto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-500 text-right">Real</span>
                  <span className="font-semibold text-green-700">{s.real.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
