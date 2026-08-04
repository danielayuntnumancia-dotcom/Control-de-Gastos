import { Payment } from '../types';

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
