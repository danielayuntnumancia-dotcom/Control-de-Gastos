import { Concept, Payment } from '../types';

export function generateAnnualPayments(concepts: Concept[], year: number): Omit<Payment, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[] {
  const newPayments: Omit<Payment, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[] = [];

  for (const concept of concepts) {
    if (!concept.active) continue;

    const firstPeriodYear = concept.firstPeriod.getFullYear();
    const firstPeriodMonth = concept.firstPeriod.getMonth();

    if (year < firstPeriodYear) continue; // Not started yet

    let monthsToGenerate: number[] = [];
    switch (concept.periodicity) {
      case 'monthly':
        monthsToGenerate = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        break;
      case 'quarterly':
        monthsToGenerate = [firstPeriodMonth % 3, (firstPeriodMonth % 3) + 3, (firstPeriodMonth % 3) + 6, (firstPeriodMonth % 3) + 9];
        break;
      case 'semiannual':
        monthsToGenerate = [firstPeriodMonth % 6, (firstPeriodMonth % 6) + 6];
        break;
      case 'annual':
        monthsToGenerate = [firstPeriodMonth];
        break;
      case 'custom_months':
        monthsToGenerate = concept.customMonths || [];
        break;
      case 'one_time':
        if (year === firstPeriodYear) {
          monthsToGenerate = [firstPeriodMonth];
        }
        break;
    }

    for (const month of monthsToGenerate) {
      // For the first year of the concept, do not generate past months
      if (year === firstPeriodYear && month < firstPeriodMonth) continue;

      const targetDay = concept.day || 1;
      let dueDate = new Date(year, month, targetDay);
      let status: Payment['status'] = 'PENDING';

      if (concept.dateType !== 'month_only' && dueDate.getMonth() !== month) {
        // Invalid day for this month (e.g. Feb 30).
        status = 'PENDING_DATE';
        // Reset due date to 1st of month just to keep it in the right month, status handles the rest
        dueDate = new Date(year, month, 1);
      } else {
        if (concept.dateType === 'month_only') {
          dueDate = new Date(year, month, 1);
        } else if (concept.dateType === 'approximate') {
          status = 'PENDING_DATE';
        }
      }

      newPayments.push({
        conceptId: concept.id,
        concept: concept.name,
        expectedAmount: concept.expectedAmount,
        actualAmount: null,
        dueDate,
        originalPeriodMonth: month,
        originalPeriodYear: year,
        status,
        isDelayed: false
      });
    }
  }

  return newPayments;
}
