import { Payment } from '../types';

export const PENDING_STATUSES = ['PENDING', 'OVERDUE', 'APPROX_OVERDUE', 'PENDING_DATE', 'NO_NOTICE'];

export function calculateTotalPrevisto(payments: Payment[]): number {
  return payments
    .filter(p => p.status !== 'CANCELED')
    .reduce((sum, p) => sum + p.expectedAmount, 0) / 100;
}

export function calculateTotalPagadoReal(payments: Payment[]): number {
  return payments
    .filter(p => p.status === 'PAID')
    .reduce((sum, p) => sum + (p.actualAmount ?? p.expectedAmount), 0) / 100;
}

export function calculateDiferenciaConfirmada(payments: Payment[]): number {
  const paidPayments = payments.filter(p => p.status === 'PAID');
  return paidPayments.reduce((sum, p) => {
    const expected = p.expectedAmount / 100;
    const actual = (p.actualAmount ?? p.expectedAmount) / 100;
    return sum + (actual - expected);
  }, 0);
}

export function calculatePendientes(payments: Payment[]): { total: number, count: number } {
  const pendingPayments = payments.filter(p => PENDING_STATUSES.includes(p.status));
  const total = pendingPayments.reduce((sum, p) => sum + p.expectedAmount, 0) / 100;
  return { total, count: pendingPayments.length };
}

export function filterPaymentsByPeriod(payments: Payment[], month: number, year: number): Payment[] {
  return payments.filter(p => p.originalPeriodMonth === month && p.originalPeriodYear === year);
}

export function filterPaymentsByYear(payments: Payment[], year: number): Payment[] {
  return payments.filter(p => p.originalPeriodYear === year);
}
