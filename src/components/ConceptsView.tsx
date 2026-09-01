import React, { useState, useMemo } from 'react';
import { Concept } from '../types';
import { doc, updateDoc, deleteDoc, writeBatch, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ConfirmDialog } from './ConfirmDialog';
import { paramsFromConcept, computeDueDateAndStatus } from '../utils/occurrenceEngine';
import { getConceptColor, formatAmount } from '../utils/formatUtils';
import { syncAllConceptPayments } from '../utils/paymentUtils';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { BulkAccountAssignModal } from './BulkAccountAssignModal';

interface ConceptsViewProps {
  concepts: Concept[];
  onNew: () => void;
  onSelect: (concept: Concept) => void;
}

export function ConceptsView({ concepts, onNew, onSelect }: ConceptsViewProps) {
  const { user } = useAuth();
  const { accounts } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterAccount, setFilterAccount] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>(''); // '' | 'active' | 'inactive'
  const [sortBy, setSortBy] = useState<'name' | 'next_due' | 'amount'>('name');
  const [viewType, setViewType] = useState<'expense' | 'income'>('expense');
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedConceptIds, setSelectedConceptIds] = useState<string[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const openConfirm = (title: string, message: string, onConfirm: () => void, isDestructive = false, confirmText = 'Confirmar') => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        onConfirm();
      },
      isDestructive,
      confirmText
    });
  };

  const handleSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const createdCount = await syncAllConceptPayments(user.uid, concepts);
      if (createdCount > 0) {
        alert(`¡Sincronización completada! Se han generado ${createdCount} recibos faltantes.`);
      } else {
        alert('Todos tus conceptos ya tienen sus recibos al día.');
      }
    } catch (e) {
      console.error(e);
      alert('Error al sincronizar recibos.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleSelect = (conceptId: string) => {
    setSelectedConceptIds(prev => 
      prev.includes(conceptId) ? prev.filter(id => id !== conceptId) : [...prev, conceptId]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedConceptIds.length === filteredConcepts.length) {
      setSelectedConceptIds([]);
    } else {
      setSelectedConceptIds(filteredConcepts.map(c => c.id));
    }
  };

  const handleBulkAssignAccount = async (accountId: string, applyFromMonth: number, applyFromYear: number) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      
      // Target date to filter payments
      const targetDate = new Date(applyFromYear, applyFromMonth, 1);
      
      // Update each selected concept
      for (const conceptId of selectedConceptIds) {
        const conceptRef = doc(db, 'concepts', conceptId);
        batch.update(conceptRef, { 
          accountId: accountId === 'unassigned' ? null : accountId,
          updatedAt: new Date()
        });
        
        // Find and update pending payments for this concept from target date onwards
        const q = query(
          collection(db, 'payments'),
          where('conceptId', '==', conceptId),
          where('userId', '==', user.uid)
        );
        const snap = await getDocs(q);
        
        snap.forEach(d => {
          const data = d.data();
          if (data.status === 'PAID') return; // Do not touch paid ones
          
          if (!data.dueDate || typeof data.dueDate.toDate !== 'function') return;
          const dueDate = data.dueDate.toDate();
          
          let paymentMonth = dueDate.getMonth();
          let paymentYear = dueDate.getFullYear();
          if (data.originalPeriodMonth !== undefined && data.originalPeriodYear !== undefined) {
            paymentMonth = data.originalPeriodMonth;
            paymentYear = data.originalPeriodYear;
          }
          
          const paymentDateForComparison = new Date(paymentYear, paymentMonth, 1);
          
          if (paymentDateForComparison >= targetDate) {
            batch.update(d.ref, {
              accountId: accountId === 'unassigned' ? null : accountId,
              updatedAt: new Date()
            });
          }
        });
      }

      await batch.commit();
      setSelectedConceptIds([]);
    } catch (e: any) {
      console.error(e);
      alert('Error al asignar cuenta masivamente: ' + e.message);
    }
  };

  const filteredConcepts = useMemo(() => {
    let result = concepts;

    result = result.filter(c => (c.type || 'expense') === viewType);

    if (searchTerm) {
      result = result.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    if (filterCategory) {
      result = result.filter(c => c.category === filterCategory);
    }
    if (filterAccount) {
      if (filterAccount === 'unassigned') {
        result = result.filter(c => !c.accountId);
      } else {
        result = result.filter(c => c.accountId === filterAccount);
      }
    }
    if (filterStatus === 'active') {
      result = result.filter(c => c.active);
    } else if (filterStatus === 'inactive') {
      result = result.filter(c => !c.active);
    }

    result.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'amount') {
        return b.expectedAmount - a.expectedAmount; // desc
      }
      if (sortBy === 'next_due') {
        return b.createdAt.getTime() - a.createdAt.getTime();
      }
      return 0;
    });

    return result;
  }, [concepts, searchTerm, filterCategory, filterAccount, filterStatus, sortBy, viewType]);

  const handleToggleStatus = (concept: Concept) => {
    const doUpdate = async () => {
      try {
        const batch = writeBatch(db);
        const conceptRef = doc(db, 'concepts', concept.id);
        
        batch.update(conceptRef, {
          active: !concept.active,
          updatedAt: new Date()
        });

        // Update future payments
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const q = query(
          collection(db, 'payments'),
          where('conceptId', '==', concept.id),
          where('userId', '==', user?.uid)
        );
        const snap = await getDocs(q);

        snap.forEach(d => {
          const data = d.data();
          if (!data.dueDate || typeof data.dueDate.toDate !== 'function') return;
          
          const dueDate = data.dueDate.toDate();
          
          if (concept.active) {
            // It's being DEACTIVATED: Cancel ALL pending payments, even past ones
            if (data.status === 'PENDING' || data.status === 'PENDING_DATE') {
              batch.update(d.ref, { status: 'CANCELED' });
            }
          } else {
            // It's being ACTIVATED: Restore canceled payments
            // Only restore future ones
            if (dueDate >= now && data.status === 'CANCELED') {
              const params = paramsFromConcept(concept);
              const year = data.originalPeriodYear !== undefined ? data.originalPeriodYear : dueDate.getFullYear();
              const month = data.originalPeriodMonth !== undefined ? data.originalPeriodMonth : dueDate.getMonth();
              
              const { status } = computeDueDateAndStatus(year, month, params);
              
              batch.update(d.ref, { 
                status: status,
                expectedAmount: concept.expectedAmount
              });
            }
          }
        });

        await batch.commit();
      } catch (e: unknown) {
        console.error(e);
        alert('Error: ' + (e instanceof Error ? e.message : String(e)));
      }
    };

    if (concept.active) {
      openConfirm(
        'Desactivar concepto',
        '¿Deseas desactivar este concepto? No se generarán nuevos vencimientos, pero se mantendrá el historial.',
        doUpdate,
        true,
        'Desactivar'
      );
    } else {
      doUpdate();
    }
  };

  const handleDelete = (concept: Concept) => {
    openConfirm(
      'Eliminar concepto',
      `¿Eliminar definitivamente el concepto "${concept.name}"? Solo usar si fue creado por error.`,
      async () => {
        try {
          const q = query(collection(db, 'payments'), where('userId', '==', user.uid), where('conceptId', '==', concept.id));
          const snap = await getDocs(q);
          
          const hasHistorical = snap.docs.some(d => {
            const data = d.data();
            const st = data.status;
            return st === 'PAID' || st === 'CANCELED' || data.isDelayed;
          });

          if (hasHistorical) {
            alert("No se puede eliminar un concepto que ya tiene pagos históricos registrados. Por favor, desactívalo en su lugar.");
            return;
          }

          const batch = writeBatch(db);
          snap.docs.forEach(d => {
            batch.delete(d.ref);
          });
          batch.delete(doc(db, 'concepts', concept.id));
          
          await batch.commit();
        } catch (e: any) {
          console.error(e);
          alert("Error al eliminar el concepto: " + e.message);
        }
      },
      true,
      'Eliminar'
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-6">
          <h2 className="text-2xl font-bold text-slate-800">Conceptos</h2>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => { setViewType('expense'); setFilterCategory(''); }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewType === 'expense' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Gastos
            </button>
            <button
              onClick={() => { setViewType('income'); setFilterCategory(''); }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewType === 'income' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Ingresos
            </button>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <input 
            type="text"
            placeholder="Buscar concepto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
          <select 
            value={filterCategory} 
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">Todas las categorías</option>
            {viewType === 'expense' ? (
              <>
                <option value="Suscripción">Suscripción</option>
                <option value="Impuesto">Impuesto</option>
                <option value="Tasa">Tasa</option>
                <option value="Seguro">Seguro</option>
                <option value="Otro">Otro</option>
              </>
            ) : (
              <>
                <option value="Salario">Salario</option>
                <option value="Paga Extra">Paga Extra</option>
                <option value="Ingreso Extra">Ingreso Extra</option>
                <option value="Otro">Otro</option>
              </>
            )}
          </select>
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          {accounts.length > 0 && (
            <select 
              value={filterAccount} 
              onChange={(e) => setFilterAccount(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">Todas las cuentas</option>
              <option value="unassigned">Sin cuenta</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shrink-0 shadow-sm disabled:opacity-50"
            title="Sincronizar y generar todos los recibos pasados faltantes"
          >
            {isSyncing ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">sync</span>}
            <span>Sincronizar recibos</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {filteredConcepts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <span className="material-symbols-outlined text-4xl mb-3 text-slate-300">search_off</span>
            <p>No se encontraron conceptos.</p>
            {(searchTerm || filterCategory || filterAccount || filterStatus) ? (
              <button onClick={() => { setSearchTerm(''); setFilterCategory(''); setFilterAccount(''); setFilterStatus(''); }} className="mt-4 text-indigo-600 hover:underline text-sm">
                Restablecer filtros
              </button>
            ) : (
              <button onClick={onNew} className="mt-4 text-indigo-600 hover:underline text-sm font-medium">
                Crear tu primer concepto
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 w-10">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={filteredConcepts.length > 0 && selectedConceptIds.length === filteredConcepts.length}
                        onChange={handleToggleSelectAll}
                      />
                    </th>
                    <th className="px-6 py-3">Concepto</th>
                    <th className="px-6 py-3">Periodicidad</th>
                    <th className="px-6 py-3">Importe</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredConcepts.map(concept => {
                    const conceptAccount = accounts.find(a => a.id === concept.accountId);
                    const isSelected = selectedConceptIds.includes(concept.id);
                    return (
                      <tr key={concept.id} className={`hover:bg-slate-50 cursor-pointer ${isSelected ? 'bg-blue-50/50' : ''}`} onClick={() => onSelect(concept)}>
                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(concept.id)}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {getConceptColor(concept) && (
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getConceptColor(concept) }} />
                            )}
                            <div>
                              <div className="font-medium text-slate-900">{concept.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-slate-500">{concept.category}</span>
                                {conceptAccount && (
                                  <span 
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white shadow-2xs"
                                    style={{ backgroundColor: conceptAccount.color }}
                                  >
                                    <span className="material-symbols-outlined text-[11px]">account_balance</span>
                                    {conceptAccount.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 capitalize">
                          {concept.periodicity === 'monthly' && 'Mensual'}
                          {concept.periodicity === 'quarterly' && 'Trimestral'}
                          {concept.periodicity === 'semiannual' && 'Semestral'}
                          {concept.periodicity === 'annual' && 'Anual'}
                          {concept.periodicity === 'one_time' && 'Pago Único'}
                          {concept.periodicity === 'custom_months' && 'Meses Específicos'}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium">
                          {formatAmount(concept.expectedAmount, concept.type || 'expense', concept.amountType === 'approximate')}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-tight ${concept.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {concept.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={(e) => { e.stopPropagation(); onSelect(concept); }}
                            className="text-slate-400 hover:text-blue-600 transition-colors mr-3"
                            title="Editar"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleToggleStatus(concept); }}
                            className="text-slate-400 hover:text-indigo-600 transition-colors mr-3"
                            title={concept.active ? 'Desactivar' : 'Activar'}
                          >
                            <span className="material-symbols-outlined text-[20px]">{concept.active ? 'block' : 'check_circle'}</span>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(concept); }}
                            className="text-slate-400 hover:text-red-600 transition-colors"
                            title="Eliminar definitivamente"
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden flex flex-col divide-y divide-slate-100 pb-16">
              {filteredConcepts.map(concept => {
                const conceptAccount = accounts.find(a => a.id === concept.accountId);
                const isSelected = selectedConceptIds.includes(concept.id);
                return (
                  <div key={concept.id} className={`p-4 hover:bg-slate-50 cursor-pointer ${isSelected ? 'bg-blue-50/50' : ''}`} onClick={() => onSelect(concept)}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(concept.id)}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {getConceptColor(concept) && (
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getConceptColor(concept) }} />
                        )}
                        <div>
                          <h3 className="font-medium text-slate-900">{concept.name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-slate-500">{concept.category}</span>
                            {conceptAccount && (
                              <span 
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white shadow-2xs"
                                style={{ backgroundColor: conceptAccount.color }}
                              >
                                {conceptAccount.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-sm">{formatAmount(concept.expectedAmount, concept.type || 'expense', concept.amountType === 'approximate')}</div>
                        <span className={`px-2 py-0.5 mt-1 inline-block rounded-full text-[10px] font-bold uppercase tracking-tight ${concept.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {concept.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </div>
                  
                  <div className="flex justify-between items-center mt-4">
                    <div className="text-xs text-slate-600 capitalize bg-slate-100 px-2 py-1 rounded">
                      {concept.periodicity === 'monthly' && 'Mensual'}
                      {concept.periodicity === 'quarterly' && 'Trimestral'}
                      {concept.periodicity === 'semiannual' && 'Semestral'}
                      {concept.periodicity === 'annual' && 'Anual'}
                      {concept.periodicity === 'one_time' && 'Pago Único'}
                      {concept.periodicity === 'custom_months' && 'Meses Específicos'}
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onSelect(concept); }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Editar"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleToggleStatus(concept); }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title={concept.active ? 'Desactivar' : 'Activar'}
                      >
                        <span className="material-symbols-outlined text-[18px]">{concept.active ? 'block' : 'check_circle'}</span>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(concept); }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar definitivamente"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </>
        )}
      </div>
      {selectedConceptIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-fade-in-up border border-slate-700">
          <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-sm font-bold">
            {selectedConceptIds.length}
          </span>
          <span className="text-sm font-medium pr-2">conceptos seleccionados</span>
          <div className="w-px h-6 bg-slate-700"></div>
          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">account_balance</span>
            Asignar Cuenta
          </button>
        </div>
      )}

      {isAssignModalOpen && (
        <BulkAccountAssignModal
          accounts={accounts}
          selectedCount={selectedConceptIds.length}
          onClose={() => setIsAssignModalOpen(false)}
          onConfirm={handleBulkAssignAccount}
        />
      )}

      {confirmDialog.isOpen && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
          isDestructive={confirmDialog.isDestructive}
          confirmText={confirmDialog.confirmText}
        />
      )}
    </div>
  );
}
