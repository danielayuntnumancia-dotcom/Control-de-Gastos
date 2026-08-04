/**
 * occurrenceEngine.ts
 *
 * Única fuente de verdad para la generación de ocurrencias de vencimientos.
 * Esta función es pura y determinista: mismas entradas → mismas salidas.
 *
 * Reglas de negocio:
 * - Los importes se almacenan en céntimos (enteros).
 * - Para días 29, 30 o 31 inexistentes en un mes, se genera estado PENDING_DATE
 *   y la dueDate se fija al día 1 del mismo mes (no se traslada al último día).
 * - Se conservan explícitamente originalPeriodMonth y originalPeriodYear.
 * - Periodicidad trimestral (quarterly): cada 3 meses desde el primer período,
 *   calculado como (monthsSinceStart % 3 === 0).
 * - Periodicidad semestral (semiannual): cada 6 meses desde el primer período.
 * - Un pago de tipo approximate siempre genera PENDING_DATE (fecha aproximada).
 * - Un pago de tipo month_only fija dueDate al día 1 del mes.
 */

import type { Concept, Payment } from '../types';

/** Parámetros que describen la regla de un concepto (sin el objeto Concept completo) */
export interface OccurrenceParams {
  periodicity: Concept['periodicity'];
  dateType: Concept['dateType'];
  day: number | null | undefined;
  firstPeriodYear: number;
  firstPeriodMonth: number; // 0-11
  customMonths?: number[]; // 0-11, solo para custom_months
}

/** Una ocurrencia calculada, lista para convertirse en Payment */
export interface Occurrence {
  originalPeriodYear: number;
  originalPeriodMonth: number; // 0-11
  dueDate: Date;
  status: Payment['status'];
}

/**
 * Determina si un período dado (year, month) debe generar una ocurrencia
 * según la periodicidad configurada.
 */
function shouldGenerateForPeriod(
  year: number,
  month: number,
  params: OccurrenceParams
): boolean {
  const { periodicity, firstPeriodYear, firstPeriodMonth, customMonths } = params;

  // No generar antes del primer período
  if (year < firstPeriodYear) return false;
  if (year === firstPeriodYear && month < firstPeriodMonth) return false;

  const monthsSinceStart =
    (year - firstPeriodYear) * 12 + (month - firstPeriodMonth);

  switch (periodicity) {
    case 'monthly':
      return true;
    case 'quarterly':
      // Cada 3 meses a partir del primer período (relativo)
      return monthsSinceStart % 3 === 0;
    case 'semiannual':
      // Cada 6 meses a partir del primer período (relativo)
      return monthsSinceStart % 6 === 0;
    case 'annual':
      // Cada año, en el mismo mes del primer período
      return month === firstPeriodMonth;
    case 'custom_months':
      return !!(customMonths && customMonths.includes(month));
    case 'one_time':
      return year === firstPeriodYear && month === firstPeriodMonth;
    default:
      return false;
  }
}

/**
 * Calcula la dueDate y el status inicial para una ocurrencia.
 *
 * Regla para días inválidos (ej: 31 de febrero):
 *   new Date(year, month, 31) desborda a marzo. Detectamos esto comparando
 *   el mes resultante con el mes objetivo → si difieren, el día no existe →
 *   status = 'PENDING_DATE', dueDate = último día del mes objetivo (ej: 28 de feb).
 */
export function computeDueDateAndStatus(
  year: number,
  month: number,
  params: OccurrenceParams
): { dueDate: Date; status: Payment['status'] } {
  const { dateType, day } = params;

  if (dateType === 'month_only') {
    return {
      dueDate: new Date(year, month, 1),
      status: 'PENDING',
    };
  }

  if (dateType === 'approximate') {
    const targetDay = day != null && day > 0 ? day : 1;
    const candidate = new Date(year, month, targetDay);
    // Si el día desborda (ej: 31 de feb), status = PENDING_DATE
    if (candidate.getMonth() !== month) {
      return { dueDate: new Date(year, month + 1, 0), status: 'PENDING_DATE' };
    }
    return { dueDate: candidate, status: 'PENDING_DATE' };
  }

  // dateType === 'exact'
  const targetDay = day != null && day > 0 ? day : 1;
  const candidate = new Date(year, month, targetDay);
  if (candidate.getMonth() !== month) {
    // Día inválido para este mes, ajustamos al último día del mes
    return { dueDate: new Date(year, month + 1, 0), status: 'PENDING' };
  }
  return { dueDate: candidate, status: 'PENDING' };
}

/**
 * Genera todas las ocurrencias para un conjunto de parámetros y un rango de años.
 *
 * @param params    Regla del concepto
 * @param years     Array de años a generar (ej: [2025, 2026])
 * @returns         Array de ocurrencias ordenadas cronológicamente
 */
export function generateOccurrences(
  params: OccurrenceParams,
  years: number[]
): Occurrence[] {
  const occurrences: Occurrence[] = [];

  for (const year of years) {
    for (let month = 0; month < 12; month++) {
      if (!shouldGenerateForPeriod(year, month, params)) continue;

      const { dueDate, status } = computeDueDateAndStatus(year, month, params);
      occurrences.push({
        originalPeriodYear: year,
        originalPeriodMonth: month,
        dueDate,
        status,
      });

      if (params.periodicity === 'one_time') break; // Solo un período
    }
    if (params.periodicity === 'one_time' && occurrences.length > 0) break;
  }

  return occurrences;
}

/**
 * Extrae los OccurrenceParams de un objeto Concept.
 * Permite pasar un Concept directamente a generateOccurrences.
 */
export function paramsFromConcept(concept: any): OccurrenceParams {
  const firstPeriod = concept.firstPeriod && typeof concept.firstPeriod.toDate === 'function'
    ? concept.firstPeriod.toDate()
    : (concept.firstPeriod instanceof Date ? concept.firstPeriod : new Date(concept.firstPeriod || Date.now()));

  return {
    periodicity: concept.periodicity,
    dateType: concept.dateType,
    day: concept.day,
    firstPeriodYear: firstPeriod.getFullYear(),
    firstPeriodMonth: firstPeriod.getMonth(),
    customMonths: concept.customMonths ?? [],
  };
}
