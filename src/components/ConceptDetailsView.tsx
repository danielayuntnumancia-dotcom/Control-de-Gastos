import React, { useState, useEffect, useMemo } from 'react';
import { Concept, Payment, PriceVersion, UserSettings } from '../types';
import { ConceptScheduleEditor } from './ConceptScheduleEditor';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, setDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { MONTH_NAMES } from '../utils/formatUtils';
import { calculateTotalPrevisto, calculateTotalPagadoReal, PENDING_STATUSES } from '../utils/paymentUtils';
import { useAppState } from '../context/AppStateContext';

interface Props {
  concept: Concept;
  payments: Payment[];
  user: User;
  settings: UserSettings;
  onBack: () => void;
  onOpenPayment: (p: Payment) => void;
}

export function ConceptDetailsView({ concept, payments, user, settings, onBack, onOpenPayment }: Props) {
  const [priceVersions, setPriceVersions] = useState<PriceVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const { setIsConceptFormOpen, setEditingConcept } = useAppState();

  // Derived
  const conceptPayments = useMemo(() => {
    return payments.filter(p => p.conceptId === concept.id).sort((a, b) => {
      // Sort by original period (newest first)
      const aTime = new Date(a.originalPeriodYear || a.dueDate.getFullYear(), a.originalPeriodMonth || a.dueDate.getMonth(), 1).getTime();
      const bTime = new Date(b.originalPeriodYear || b.dueDate.getFullYear(), b.originalPeriodMonth || b.dueDate.getMonth(), 1).getTime();
      return bTime - aTime;
    });
  }, [payments, concept.id]);

  const totalPrevisto = calculateTotalPrevisto(conceptPayments);
  const totalReal = calculateTotalPagadoReal(conceptPayments);
  const countPagados = conceptPayments.filter(p => p.status === 'PAID').length;
  const countPendientes = conceptPayments.filter(p => PENDING_STATUSES.includes(p.status)).length;

  const periodicityLabel: Record<Concept['periodicity'], string> = {
    monthly: 'Mensual',
    quarterly: 'Trimestral',
    semiannual: 'Semestral',
    annual: 'Anual',
    custom_months: 'Meses personalizados',
    one_time: 'Pago único',
  };

  const dateTypeLabel: Record<Concept['dateType'], string> = {
    exact: 'Día exacto',
    approximate: 'Día aproximado',
    month_only: 'Solo mes (sin día)',
  };

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const q = query(
          collection(db, 'price_versions'),
          where('conceptId', '==', concept.id),
          where('userId', '==', user.uid),
          orderBy('validFrom', 'desc')
        );
        const snap = await getDocs(q);
        const versions = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          validFrom: d.data().validFrom.toDate(),
          validTo: d.data().validTo?.toDate(),
          createdAt: d.data().createdAt?.toDate() || new Date()
        } as PriceVersion));

        if (versions.length === 0) {
          // Migration: Create initial version
          const newVRef = doc(collection(db, 'price_versions'));
          const initialVersion: PriceVersion = {
            id: newVRef.id,
            conceptId: concept.id,
            userId: user.uid,
            amount: concept.expectedAmount,
            validFrom: concept.firstPeriod,
            createdAt: concept.createdAt
          };
          await setDoc(newVRef, {
            ...initialVersion,
            createdAt: serverTimestamp()
          });
          setPriceVersions([initialVersion]);
        } else {
          setPriceVersions(versions);
        }
      } catch (e) {
        console.error("Error fetching price versions", e);
      } finally {
        setLoading(false);
      }
    };
    fetchPrices();
  }, [concept.id, user.uid, concept.expectedAmount, concept.firstPeriod, concept.createdAt]);

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="animate-spin h-8 w-8 border-b-2 border-indigo-600 rounded-full"></div></div>;
  }

  const statusConfig: Record<string, { label: string; className: string }> = {
    PAID:          { label: 'Pagado',       className: 'bg-green-100 text-green-700' },
    PENDING:       { label: 'Pendiente',    className: 'bg-slate-100 text-slate-600' },
    OVERDUE:       { label: 'Vencido',      className: 'bg-red-100 text-red-700' },
    APPROX_OVERDUE:{ label: 'Revisar',      className: 'bg-orange-100 text-orange-700' },
    PENDING_DATE:  { label: 'Falta fecha',  className: 'bg-orange-100 text-orange-700' },
    CANCELED:      { label: 'Cancelado',    className: 'bg-slate-100 text-slate-500 line-through' },
    REFUNDED:      { label: 'Devuelto',     className: 'bg-blue-100 text-blue-700' },
    NO_NOTICE:     { label: 'Sin aviso',    className: 'bg-slate-100 text-slate-500' },
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col bg-slate-50 relative">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center gap-4 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">{concept.name}</h2>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight ${concept.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
              {concept.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{concept.category}</p>
        </div>
        <button
          onClick={() => { setEditingConcept(concept); setIsConceptFormOpen(true); }}
          className="hidden md:flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">edit</span>
          Editar
        </button>
      </div>

      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-8">

        {/* ── Resumen económico ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Importe previsto</p>
            <p className="text-xl font-bold text-slate-900">
              {(concept.expectedAmount / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </p>
            <p className="text-xs text-slate-400 mt-1">{periodicityLabel[concept.periodicity]}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total previsto (hist.)</p>
            <p className="text-xl font-bold text-slate-900">
              {totalPrevisto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </p>
            <p className="text-xs text-slate-400 mt-1">{conceptPayments.filter(p => p.status !== 'CANCELED').length} recibos</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total pagado</p>
            <p className="text-xl font-bold text-green-700">
              {totalReal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </p>
            <p className="text-xs text-slate-400 mt-1">{countPagados} pagados</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pendientes</p>
            <p className="text-xl font-bold text-orange-500">{countPendientes}</p>
            <p className="text-xs text-slate-400 mt-1">recibos por pagar</p>
          </div>
        </div>

        {/* ── Información del concepto ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Información del Concepto</h3>
            <button
              onClick={() => { setEditingConcept(concept); setIsConceptFormOpen(true); }}
              className="md:hidden text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Editar
            </button>
          </div>
          <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-500">Periodicidad</span>
              <span className="text-sm font-semibold text-slate-800">{periodicityLabel[concept.periodicity]}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-500">Tipo de fecha</span>
              <span className="text-sm font-semibold text-slate-800">{dateTypeLabel[concept.dateType]}</span>
            </div>
            {concept.dateType !== 'month_only' && concept.day && (
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Día</span>
                <span className="text-sm font-semibold text-slate-800">{concept.day}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-500">Primer periodo</span>
              <span className="text-sm font-semibold text-slate-800">
                {MONTH_NAMES[concept.firstPeriod.getMonth()]} {concept.firstPeriod.getFullYear()}
              </span>
            </div>
            {concept.periodicity === 'custom_months' && concept.customMonths && concept.customMonths.length > 0 && (
              <div className="flex justify-between items-start py-2 border-b border-slate-100 md:col-span-2">
                <span className="text-sm text-slate-500">Meses activos</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {concept.customMonths.map(m => (
                    <span key={m} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                      {MONTH_NAMES[m]}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {concept.exceptionNoticeDays !== null && concept.exceptionNoticeDays !== undefined && (
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Aviso personalizado</span>
                <span className="text-sm font-semibold text-slate-800">{concept.exceptionNoticeDays} días</span>
              </div>
            )}
            {concept.description && (
              <div className="py-2 md:col-span-2">
                <span className="block text-sm text-slate-500 mb-1">Descripción</span>
                <p className="text-sm text-slate-700">{concept.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Editor de Programación ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Programación</h3>
            {!isEditingSchedule && (
              <button
                onClick={() => setIsEditingSchedule(true)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">edit_calendar</span>
                Modificar regla
              </button>
            )}
          </div>
          <div className="p-4 md:p-6">
            {isEditingSchedule ? (
              <ConceptScheduleEditor
                concept={concept}
                payments={payments}
                onCancel={() => setIsEditingSchedule(false)}
                onSaved={() => setIsEditingSchedule(false)}
              />
            ) : (
              <div className="text-sm text-slate-600 space-y-1">
                <p>
                  <span className="font-medium text-slate-700">Periodicidad:</span>{' '}
                  {periodicityLabel[concept.periodicity]}
                  {concept.periodicity === 'custom_months' && concept.customMonths && concept.customMonths.length > 0
                    ? ` (${concept.customMonths.map(m => MONTH_NAMES[m].substring(0, 3)).join(', ')})`
                    : ''}
                </p>
                <p>
                  <span className="font-medium text-slate-700">Tipo de fecha:</span>{' '}
                  {dateTypeLabel[concept.dateType]}
                  {concept.dateType !== 'month_only' && concept.day ? `, día ${concept.day}` : ''}
                </p>
                <p className="text-xs text-slate-400 pt-2">
                  Haz clic en "Modificar regla" para cambiar periodicidad, fecha o meses activos.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Historial de Pagos ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-800">Historial de Pagos</h3>
          </div>
          {conceptPayments.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No hay pagos registrados para este concepto.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {conceptPayments.map(p => {
                const cfg = statusConfig[p.status] ?? { label: p.status, className: 'bg-slate-100 text-slate-600' };
                const periodMonth = p.originalPeriodMonth !== undefined ? p.originalPeriodMonth : p.dueDate.getMonth();
                const periodYear = p.originalPeriodYear !== undefined ? p.originalPeriodYear : p.dueDate.getFullYear();
                const amount = p.status === 'PAID'
                  ? ((p.actualAmount ?? p.expectedAmount) / 100)
                  : (p.expectedAmount / 100);

                return (
                  <div
                    key={p.id}
                    className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => onOpenPayment(p)}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {MONTH_NAMES[periodMonth]} {periodYear}
                        </p>
                        {p.isDelayed && (
                          <span className="text-[10px] text-blue-500 font-medium">Aplazado</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cfg.className}`}>
                        {cfg.label}
                      </span>
                      <span className="text-sm font-bold text-slate-900 min-w-[70px] text-right">
                        {amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </span>
                      <span className="material-symbols-outlined text-slate-300 text-[18px]">chevron_right</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
