import { Concept, Payment } from '../types';
import { generateOccurrences, paramsFromConcept } from './occurrenceEngine';

export function generateAnnualPayments(concepts: Concept[], year: number): Omit<Payment, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[] {
  const newPayments: Omit<Payment, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[] = [];

  for (const concept of concepts) {
    if (!concept.active) continue;

    const occurrences = generateOccurrences(paramsFromConcept(concept), [year]);

    for (const occ of occurrences) {
      newPayments.push({
        conceptId: concept.id,
        concept: concept.name,
        expectedAmount: concept.expectedAmount,
        actualAmount: null,
        dueDate: occ.dueDate,
        originalPeriodMonth: occ.originalPeriodMonth,
        originalPeriodYear: occ.originalPeriodYear,
        status: occ.status,
        isDelayed: false
      });
    }
  }

  return newPayments;
}
