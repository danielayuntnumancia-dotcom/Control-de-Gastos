import { Payment, Concept } from '../types';
import { db } from '../lib/firebase';
import { writeBatch, collection, getDocs, query, where, doc } from 'firebase/firestore';
import { generateOccurrences } from './occurrenceEngine';

export const PENDING_STATUSES = ['PENDING', 'OVERDUE', 'APPROX_OVERDUE', 'PENDING_DATE', 'NO_NOTICE'];

export function calculateTotalPrevisto(payments: Payment[]): { expenses: number, incomes: number, net: number } {
  let expenses = 0;
  let incomes = 0;
  payments.filter(p => p.status !== 'CANCELED').forEach(p => {
    if ((p.type || 'expense') === 'income') {
      incomes += p.expectedAmount;
    } else {
      expenses += p.expectedAmount;
    }
  });
  return { expenses: expenses / 100, incomes: incomes / 100, net: (incomes - expenses) / 100 };
}

export function calculateTotalPagadoReal(payments: Payment[]): { expenses: number, incomes: number, net: number } {
  let expenses = 0;
  let incomes = 0;
  payments.filter(p => p.status === 'PAID').forEach(p => {
    const amt = p.actualAmount ?? p.expectedAmount;
    if ((p.type || 'expense') === 'income') {
      incomes += amt;
    } else {
      expenses += amt;
    }
  });
  return { expenses: expenses / 100, incomes: incomes / 100, net: (incomes - expenses) / 100 };
}

export function calculateDiferenciaConfirmada(payments: Payment[]): number {
  const paidPayments = payments.filter(p => p.status === 'PAID');
  return paidPayments.reduce((sum, p) => {
    const expected = p.expectedAmount / 100;
    const actual = (p.actualAmount ?? p.expectedAmount) / 100;
    const diff = actual - expected;
    return sum + ( (p.type || 'expense') === 'income' ? -diff : diff );
  }, 0);
}

export function calculatePendientes(payments: Payment[]): { expenses: number, incomes: number, count: number } {
  const pendingPayments = payments.filter(p => PENDING_STATUSES.includes(p.status));
  let expenses = 0;
  let incomes = 0;
  pendingPayments.forEach(p => {
    if ((p.type || 'expense') === 'income') {
      incomes += p.expectedAmount;
    } else {
      expenses += p.expectedAmount;
    }
  });
  return { expenses: expenses / 100, incomes: incomes / 100, count: pendingPayments.length };
}

export function filterPaymentsByPeriod(payments: Payment[], month: number, year: number): Payment[] {
  return payments.filter(p => p.originalPeriodMonth === month && p.originalPeriodYear === year && p.status !== 'CANCELED');
}

export function filterPaymentsByYear(payments: Payment[], year: number): Payment[] {
  return payments.filter(p => p.originalPeriodYear === year && p.status !== 'CANCELED');
}

export async function syncAllConceptPayments(userUid: string, concepts: Concept[]): Promise<number> {
  const currentYear = new Date().getFullYear();
  const batch = writeBatch(db);
  let totalCreated = 0;

  const qAll = query(collection(db, 'payments'), where('userId', '==', userUid));
  const snapAll = await getDocs(qAll);

  const existingMap = new Set<string>();
  const conceptsMap = new Map(concepts.map(c => [c.id, c]));

  snapAll.docs.forEach(d => {
    const data = d.data();
    if (!data.conceptId) return;
    const pYear = data.originalPeriodYear !== undefined ? data.originalPeriodYear : (data.dueDate?.toDate ? data.dueDate.toDate().getFullYear() : new Date(data.dueDate).getFullYear());
    const pMonth = data.originalPeriodMonth !== undefined ? data.originalPeriodMonth : (data.dueDate?.toDate ? data.dueDate.toDate().getMonth() : new Date(data.dueDate).getMonth());
    existingMap.add(`${data.conceptId}_${pYear}_${pMonth}`);

    // Retroactive repair: if payment was PAID and actualDate/dueDate got altered, restore them to scheduled period date
    if (data.status === 'PAID') {
      const pDueDate = data.dueDate?.toDate ? data.dueDate.toDate() : new Date(data.dueDate);
      const pActualDate = data.actualDate?.toDate ? data.actualDate.toDate() : (data.actualDate ? new Date(data.actualDate) : null);
      
      let needsRepair = false;
      let targetDate = pDueDate;

      if (!data.isDelayed && data.originalPeriodYear !== undefined && data.originalPeriodMonth !== undefined) {
        const c = conceptsMap.get(data.conceptId);
        const targetDay = c && c.day && c.day > 0 ? c.day : (pDueDate.getDate() || 1);
        targetDate = new Date(data.originalPeriodYear, data.originalPeriodMonth, targetDay);
        
        if (pDueDate.getTime() !== targetDate.getTime()) {
          needsRepair = true;
        }
      }

      if (!data.isDelayed && pActualDate) {
        if (pActualDate.getTime() !== targetDate.getTime()) {
          needsRepair = true;
        }
      }

      if (needsRepair) {
        batch.update(d.ref, { 
          dueDate: targetDate,
          actualDate: targetDate
        });
        totalCreated++;
      }
    }
  });

  for (const concept of concepts) {
    if (!concept.active) continue;

    const firstPeriod = concept.firstPeriod && typeof (concept.firstPeriod as any).toDate === 'function'
      ? (concept.firstPeriod as any).toDate()
      : new Date(concept.firstPeriod);

    const firstPeriodYear = firstPeriod.getFullYear();
    const firstPeriodMonth = firstPeriod.getMonth();

    const startYear = Math.min(firstPeriodYear, currentYear);
    const endYear = currentYear + 1;
    const yearsToGenerate = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);

    const occurrences = generateOccurrences({
      periodicity: concept.periodicity,
      dateType: concept.dateType,
      day: concept.day,
      firstPeriodYear,
      firstPeriodMonth,
      customMonths: concept.customMonths || []
    }, yearsToGenerate);

    for (const occ of occurrences) {
      const key = `${concept.id}_${occ.originalPeriodYear}_${occ.originalPeriodMonth}`;
      if (!existingMap.has(key)) {
        const occRef = doc(collection(db, 'payments'));
        batch.set(occRef, {
          userId: userUid,
          conceptId: concept.id,
          concept: concept.name,
          type: concept.type || 'expense',
          expectedAmount: concept.expectedAmount,
          isAmountApproximate: concept.amountType === 'approximate',
          actualAmount: null,
          status: occ.status,
          dueDate: occ.dueDate,
          originalPeriodMonth: occ.originalPeriodMonth,
          originalPeriodYear: occ.originalPeriodYear,
          createdAt: new Date()
        });
        existingMap.add(key);
        totalCreated++;
      }
    }
  }

  if (totalCreated > 0) {
    await batch.commit();
  }

  return totalCreated;
}
