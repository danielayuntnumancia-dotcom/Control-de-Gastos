import React, { useState, useMemo, useEffect } from 'react';
import { Concept, BankAccount } from '../types';
import { doc, writeBatch, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { formatAmount, getConceptColor } from '../utils/formatUtils';

interface BulkAccountAssignmentManagerProps {
  concepts: Concept[];
  accounts: BankAccount[];
  onClose: () => void;
  onSuccess?: () => void;
}

export function BulkAccountAssignmentManager({
  concepts,
  accounts,
  onClose,
  onSuccess
}: BulkAccountAssignmentManagerProps) {
  const { user } = useAuth();

  // Local state of concept assignments: conceptId -> accountId (or null for unassigned)
  const [assignments, setAssignments] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {};
    concepts.forEach(c => {
      initial[c.id] = c.accountId || null;
    });
    return initial;
  });

  // Selected concept IDs for multi-selection actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filters
  const [accountFilter, setAccountFilter] = useState<'ALL' | 'UNASSIGNED' | string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'expense' | 'income'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Target start date for pending payments updates
  const [applyFromMonth, setApplyFromMonth] = useState<number>(new Date().getMonth());
  const [applyFromYear, setApplyFromYear] = useState<number>(new Date().getFullYear());

  // Bulk target account for selected rows
  const [bulkTargetAccount, setBulkTargetAccount] = useState<string>('');

  // Status
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseWithPrompt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assignments]);

  // Determine dirty/modified concepts
  const dirtyConceptIds = useMemo(() => {
    const dirty = new Set<string>();
    concepts.forEach(c => {
      const originalAcc = c.accountId || null;
      const currentAcc = assignments[c.id] || null;
      if (originalAcc !== currentAcc) {
        dirty.add(c.id);
      }
    });
    return dirty;
  }, [concepts, assignments]);

  const hasUnsavedChanges = dirtyConceptIds.size > 0;

  const handleCloseWithPrompt = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm('Tienes cambios de asignación pendientes de guardar. ¿Seguro que quieres cerrar y descartarlos?')) {
        return;
      }
    }
    onClose();
  };

  // Live counters for account tabs
  const accountCounters = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: concepts.length,
      UNASSIGNED: 0
    };
    accounts.forEach(a => {
      counts[a.id] = 0;
    });

    concepts.forEach(c => {
      const accId = assignments[c.id];
      if (!accId) {
        counts.UNASSIGNED = (counts.UNASSIGNED || 0) + 1;
      } else if (counts[accId] !== undefined) {
        counts[accId] = counts[accId] + 1;
      }
    });

    return counts;
  }, [concepts, assignments, accounts]);

  // Filtered concepts based on search, type, and current account tab
  const filteredConcepts = useMemo(() => {
    return concepts.filter(c => {
      // Type filter
      if (typeFilter !== 'ALL' && (c.type || 'expense') !== typeFilter) {
        return false;
      }

      // Account filter
      const currentAcc = assignments[c.id] || null;
      if (accountFilter === 'UNASSIGNED') {
        if (currentAcc !== null) return false;
      } else if (accountFilter !== 'ALL') {
        if (currentAcc !== accountFilter) return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(query);
        const matchesCategory = (c.category || '').toLowerCase().includes(query);
        if (!matchesName && !matchesCategory) return false;
      }

      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [concepts, assignments, accountFilter, typeFilter, searchTerm]);

  // Single concept assignment change
  const handleSingleAssign = (conceptId: string, newAccountId: string | null) => {
    setAssignments(prev => ({
      ...prev,
      [conceptId]: newAccountId
    }));
  };

  // Selection toggle
  const handleToggleSelect = (conceptId: string) => {
    setSelectedIds(prev => 
      prev.includes(conceptId) ? prev.filter(id => id !== conceptId) : [...prev, conceptId]
    );
  };

  const handleToggleSelectAll = () => {
    const visibleIds = filteredConcepts.map(c => c.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Apply bulk assignment to all currently selected concepts
  const handleApplyBulkSelection = () => {
    if (!bulkTargetAccount || selectedIds.length === 0) return;
    const targetId = bulkTargetAccount === 'UNASSIGNED' ? null : bulkTargetAccount;

    setAssignments(prev => {
      const updated = { ...prev };
      selectedIds.forEach(id => {
        updated[id] = targetId;
      });
      return updated;
    });

    setSelectedIds([]);
    setBulkTargetAccount('');
  };

  // Discard all changes
  const handleDiscardChanges = () => {
    if (window.confirm('¿Deseas restaurar todas las asignaciones a su estado original?')) {
      const initial: Record<string, string | null> = {};
      concepts.forEach(c => {
        initial[c.id] = c.accountId || null;
      });
      setAssignments(initial);
      setSelectedIds([]);
    }
  };

  // Save changes to Firestore
  const handleSave = async () => {
    if (!user || dirtyConceptIds.size === 0) return;

    setIsSaving(true);
    setSaveSuccessMessage(null);

    try {
      const targetDate = new Date(applyFromYear, applyFromMonth, 1);
      const modifiedIds = Array.from(dirtyConceptIds);

      // We'll prepare write operations in batches of maximum 450 ops to respect Firestore limits
      let batch = writeBatch(db);
      let opsCount = 0;

      const commitAndResetBatch = async () => {
        if (opsCount > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opsCount = 0;
        }
      };

      for (const conceptId of modifiedIds) {
        const newAccountId = assignments[conceptId] || null;
        
        // 1. Update concept document
        const conceptRef = doc(db, 'concepts', conceptId);
        batch.update(conceptRef, {
          accountId: newAccountId,
          updatedAt: new Date()
        });
        opsCount++;

        if (opsCount >= 450) {
          await commitAndResetBatch();
        }

        // 2. Query pending payments for this concept
        const q = query(
          collection(db, 'payments'),
          where('conceptId', '==', conceptId),
          where('userId', '==', user.uid)
        );
        const snap = await getDocs(q);

        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          // Never touch paid payments
          if (data.status === 'PAID') continue;

          // Check payment period/dueDate
          let paymentMonth = 0;
          let paymentYear = 0;
          if (data.originalPeriodMonth !== undefined && data.originalPeriodYear !== undefined) {
            paymentMonth = data.originalPeriodMonth;
            paymentYear = data.originalPeriodYear;
          } else if (data.dueDate && typeof data.dueDate.toDate === 'function') {
            const d = data.dueDate.toDate();
            paymentMonth = d.getMonth();
            paymentYear = d.getFullYear();
          } else {
            continue;
          }

          const paymentDateForComparison = new Date(paymentYear, paymentMonth, 1);

          if (paymentDateForComparison >= targetDate) {
            batch.update(docSnap.ref, {
              accountId: newAccountId,
              updatedAt: new Date()
            });
            opsCount++;

            if (opsCount >= 450) {
              await commitAndResetBatch();
            }
          }
        }
      }

      // Final commit for remaining operations
      await commitAndResetBatch();

      setSaveSuccessMessage(`¡Se han guardado con éxito los cambios en ${modifiedIds.length} concepto(s) y sus recibos pendientes!`);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error('Error saving bulk account assignments:', err);
      alert('Error al guardar las asignaciones: ' + (err?.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const allVisibleSelected = filteredConcepts.length > 0 && filteredConcepts.every(c => selectedIds.includes(c.id));

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 transition-opacity" 
        onClick={handleCloseWithPrompt}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] max-h-[900px] pointer-events-auto flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-[24px]">account_tree</span>
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                  Asignación Rápida de Cuentas
                  {hasUnsavedChanges && (
                    <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 font-semibold px-2 py-0.5 rounded-full animate-pulse">
                      {dirtyConceptIds.size} {dirtyConceptIds.size === 1 ? 'cambio pendiente' : 'cambios pendientes'}
                    </span>
                  )}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  Distribuye y edita en masa a qué cuenta bancaria pertenece cada concepto de gasto o ingreso.
                </p>
              </div>
            </div>

            <button
              onClick={handleCloseWithPrompt}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-200/60 transition-colors"
              title="Cerrar (Esc)"
            >
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
          </div>

          {/* Account Category Tabs */}
          <div className="px-4 sm:px-6 pt-3 pb-2 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <button
              onClick={() => setAccountFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                accountFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Todos</span>
              <span className={`text-xs px-1.5 py-0.2 rounded-full ${accountFilter === 'ALL' ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-600'}`}>
                {accountCounters.ALL}
              </span>
            </button>

            <button
              onClick={() => setAccountFilter('UNASSIGNED')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                accountFilter === 'UNASSIGNED'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : accountCounters.UNASSIGNED > 0
                    ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">help</span>
              <span>Sin Cuenta</span>
              <span className={`text-xs px-1.5 py-0.2 rounded-full font-bold ${
                accountFilter === 'UNASSIGNED' 
                  ? 'bg-amber-700 text-white' 
                  : accountCounters.UNASSIGNED > 0 
                    ? 'bg-amber-200 text-amber-900' 
                    : 'bg-slate-200 text-slate-600'
              }`}>
                {accountCounters.UNASSIGNED}
              </span>
            </button>

            <div className="h-5 w-px bg-slate-200 mx-1 shrink-0" />

            {accounts.map(acc => {
              const count = accountCounters[acc.id] || 0;
              const isSelected = accountFilter === acc.id;
              return (
                <button
                  key={acc.id}
                  onClick={() => setAccountFilter(acc.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  style={{
                    backgroundColor: isSelected ? acc.color : undefined
                  }}
                >
                  <span 
                    className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10" 
                    style={{ backgroundColor: isSelected ? '#ffffff' : acc.color }} 
                  />
                  <span>{acc.name}</span>
                  <span className={`text-xs px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-black/20 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Controls Bar: Search + Type Filter + Bulk Actions */}
          <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Left side: Search & Type buttons */}
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-xs">
                <input
                  type="text"
                  placeholder="Buscar concepto o categoría..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                  search
                </span>
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>

              <div className="flex bg-slate-200 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  onClick={() => setTypeFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${typeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Todos ({concepts.length})
                </button>
                <button
                  onClick={() => setTypeFilter('expense')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${typeFilter === 'expense' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Gastos
                </button>
                <button
                  onClick={() => setTypeFilter('income')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${typeFilter === 'income' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Ingresos
                </button>
              </div>
            </div>

            {/* Right side: Bulk actions toolbar if items are selected */}
            {selectedIds.length > 0 ? (
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl animate-fade-in shadow-xs">
                <span className="text-xs font-bold text-indigo-900">
                  {selectedIds.length} seleccionados:
                </span>
                <select
                  value={bulkTargetAccount}
                  onChange={(e) => setBulkTargetAccount(e.target.value)}
                  className="px-2 py-1 text-xs bg-white border border-indigo-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  <option value="">-- Mover a cuenta... --</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                  <option value="UNASSIGNED">❌ Quitar cuenta (Sin asignar)</option>
                </select>
                <button
                  onClick={handleApplyBulkSelection}
                  disabled={!bulkTargetAccount}
                  className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">done_all</span>
                  Aplicar
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="text-xs text-indigo-700 hover:underline px-1"
                >
                  Deseleccionar
                </button>
              </div>
            ) : (
              <span className="text-xs text-slate-500 hidden sm:inline">
                Mostrando <strong>{filteredConcepts.length}</strong> de {concepts.length} conceptos
              </span>
            )}
          </div>

          {/* Table Container (Scrollable) */}
          <div className="flex-1 overflow-y-auto overflow-x-auto p-0">
            {filteredConcepts.length === 0 ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center h-full">
                <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">filter_alt_off</span>
                <p className="font-medium text-slate-700">No se encontraron conceptos con los filtros activos</p>
                <p className="text-xs text-slate-400 mt-1">Prueba cambiando de pestaña o borrando el término de búsqueda.</p>
                {(searchTerm || accountFilter !== 'ALL' || typeFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setAccountFilter('ALL');
                      setTypeFilter('ALL');
                    }}
                    className="mt-3 text-xs text-indigo-600 hover:underline font-semibold"
                  >
                    Restablecer todos los filtros
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="bg-slate-100/80 sticky top-0 z-10 border-b border-slate-200 backdrop-blur-xs text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={handleToggleSelectAll}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        title="Seleccionar / deseleccionar todos los visibles"
                      />
                    </th>
                    <th className="px-4 py-3">Concepto</th>
                    <th className="px-4 py-3">Tipo / Categoría</th>
                    <th className="px-4 py-3">Periodicidad</th>
                    <th className="px-4 py-3">Importe</th>
                    <th className="px-4 py-3 min-w-[240px]">Cuenta Bancaria Asignada</th>
                    <th className="px-3 py-3 w-20 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredConcepts.map(concept => {
                    const currentAccountId = assignments[concept.id] || null;
                    const originalAccountId = concept.accountId || null;
                    const isDirty = currentAccountId !== originalAccountId;
                    const isSelected = selectedIds.includes(concept.id);
                    const assignedAccount = accounts.find(a => a.id === currentAccountId);

                    return (
                      <tr
                        key={concept.id}
                        className={`transition-colors hover:bg-slate-50/80 ${
                          isSelected ? 'bg-indigo-50/60' : isDirty ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(concept.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Concept Name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                              style={{ backgroundColor: getConceptColor(concept) }}
                            />
                            <div>
                              <span className="font-bold text-slate-800">{concept.name}</span>
                              {concept.description && (
                                <p className="text-xs text-slate-400 truncate max-w-xs">{concept.description}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Type & Category */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              concept.type === 'income' 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {concept.type === 'income' ? 'Ingreso' : 'Gasto'}
                            </span>
                            <span className="text-xs text-slate-600 font-medium">
                              {concept.category}
                            </span>
                          </div>
                        </td>

                        {/* Periodicity */}
                        <td className="px-4 py-3 text-xs text-slate-600 capitalize">
                          {concept.periodicity === 'monthly' && 'Mensual'}
                          {concept.periodicity === 'quarterly' && 'Trimestral'}
                          {concept.periodicity === 'semiannual' && 'Semestral'}
                          {concept.periodicity === 'annual' && 'Anual'}
                          {concept.periodicity === 'one_time' && 'Pago Único'}
                          {concept.periodicity === 'custom_months' && 'Meses Específicos'}
                        </td>

                        {/* Expected Amount */}
                        <td className="px-4 py-3 text-xs font-bold text-slate-800">
                          {formatAmount(concept.expectedAmount, concept.type || 'expense', concept.amountType === 'approximate')}
                        </td>

                        {/* Account Selector (Direct Inline Edit) */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {assignedAccount ? (
                              <span 
                                className="w-3 h-3 rounded-full shrink-0 border border-black/10" 
                                style={{ backgroundColor: assignedAccount.color }} 
                              />
                            ) : (
                              <span className="w-3 h-3 rounded-full shrink-0 bg-slate-300" />
                            )}
                            <select
                              value={currentAccountId || ''}
                              onChange={(e) => handleSingleAssign(concept.id, e.target.value ? e.target.value : null)}
                              className={`w-full py-1.5 px-2.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                                currentAccountId
                                  ? 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 focus:ring-2 focus:ring-indigo-500'
                                  : 'border-amber-300 bg-amber-50/50 text-amber-900 hover:border-amber-400 focus:ring-2 focus:ring-amber-500'
                              }`}
                            >
                              <option value="">-- Sin cuenta asignada --</option>
                              {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>

                        {/* Status / Dirty Tag */}
                        <td className="px-3 py-3 text-center">
                          {isDirty ? (
                            <span 
                              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs" 
                              title="Asignación modificada pero sin guardar"
                            >
                              <span className="material-symbols-outlined text-[12px]">edit</span>
                              Editado
                            </span>
                          ) : currentAccountId ? (
                            <span className="text-[11px] text-emerald-600 font-medium flex items-center justify-center gap-0.5">
                              <span className="material-symbols-outlined text-[14px]">check</span>
                              Listo
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">
                              Pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer Controls & Save Bar */}
          <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shrink-0">
            {/* Cutoff Date Configuration */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-indigo-600">calendar_month</span>
                  Actualizar recibos pendientes a partir de:
                </span>
                <select
                  value={applyFromMonth}
                  onChange={(e) => setApplyFromMonth(Number(e.target.value))}
                  className="px-2 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-800 font-medium"
                >
                  {months.map((m, idx) => (
                    <option key={idx} value={idx}>{m}</option>
                  ))}
                </select>
                <select
                  value={applyFromYear}
                  onChange={(e) => setApplyFromYear(Number(e.target.value))}
                  className="px-2 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-800 font-medium"
                >
                  {Array.from({ length: 5 }).map((_, i) => {
                    const y = new Date().getFullYear() - 1 + i;
                    return <option key={y} value={y}>{y}</option>;
                  })}
                </select>
              </div>
              <p className="text-[11px] text-slate-400 italic">
                * Los recibos marcados como PAGADO no se alterarán.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 justify-end">
              {hasUnsavedChanges && (
                <button
                  type="button"
                  onClick={handleDiscardChanges}
                  disabled={isSaving}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Descartar cambios
                </button>
              )}

              <button
                type="button"
                onClick={handleCloseWithPrompt}
                disabled={isSaving}
                className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors shadow-xs"
              >
                Cerrar
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={!hasUnsavedChanges || isSaving}
                className="px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    Guardando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    Guardar {dirtyConceptIds.size > 0 ? `${dirtyConceptIds.size} cambios` : 'cambios'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Success Toast */}
          {saveSuccessMessage && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-sm font-bold animate-in fade-in slide-in-from-bottom-4">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              {saveSuccessMessage}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
