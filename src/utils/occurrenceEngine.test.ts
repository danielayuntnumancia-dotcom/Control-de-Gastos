/**
 * occurrenceEngine.test.ts
 *
 * Tests de regresión para la lógica de generación de ocurrencias.
 * Ejecutar con: node --experimental-vm-modules src/utils/occurrenceEngine.test.ts
 * O usando tsx: npx tsx src/utils/occurrenceEngine.test.ts
 *
 * Sin framework externo. Usa aserciones manuales con process.exit(1) en fallos.
 */

// ---- Mini test runner ----
let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failCount++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`  ✗ ${name}\n    ${msg}`);
    console.log(`  ✗ ${name}: ${msg}`);
  }
}

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected ${b}, got ${a}`);
      }
    },
    toHaveLength(n: number) {
      if (!Array.isArray(actual)) throw new Error(`Not an array`);
      if (actual.length !== n) {
        throw new Error(`Expected length ${n}, got ${actual.length}`);
      }
    },
    toBeGreaterThan(n: number) {
      if (typeof actual !== 'number' || actual <= n) {
        throw new Error(`Expected > ${n}, got ${actual}`);
      }
    },
  };
}

// ---- Import engine (usando require-style para compatibilidad tsx) ----
import { generateOccurrences, type OccurrenceParams } from './occurrenceEngine';

// ---- TESTS ----

console.log('\n=== occurrenceEngine.ts — Tests de Regresión ===\n');

// --- MENSUAL ---
console.log('Mensual:');
test('genera 12 ocurrencias en un año completo', () => {
  const params: OccurrenceParams = {
    periodicity: 'monthly',
    dateType: 'exact',
    day: 15,
    firstPeriodYear: 2025,
    firstPeriodMonth: 0, // Enero
  };
  const result = generateOccurrences(params, [2025]);
  expect(result).toHaveLength(12);
});

test('respeta firstPeriodMonth: no genera meses anteriores', () => {
  const params: OccurrenceParams = {
    periodicity: 'monthly',
    dateType: 'exact',
    day: 1,
    firstPeriodYear: 2025,
    firstPeriodMonth: 5, // Junio
  };
  const result = generateOccurrences(params, [2025]);
  expect(result).toHaveLength(7); // Junio..Diciembre = 7
  expect(result[0].originalPeriodMonth).toBe(5);
});

// --- TRIMESTRAL ---
console.log('\nTrimestral:');
test('trimestral desde enero genera Ene, Abr, Jul, Oct', () => {
  const params: OccurrenceParams = {
    periodicity: 'quarterly',
    dateType: 'exact',
    day: 1,
    firstPeriodYear: 2025,
    firstPeriodMonth: 0, // Enero
  };
  const result = generateOccurrences(params, [2025]);
  expect(result).toHaveLength(4);
  const months = result.map(o => o.originalPeriodMonth);
  expect(months).toEqual([0, 3, 6, 9]); // Ene, Abr, Jul, Oct
});

test('trimestral desde marzo genera Mar, Jun, Sep, Dic', () => {
  const params: OccurrenceParams = {
    periodicity: 'quarterly',
    dateType: 'exact',
    day: 1,
    firstPeriodYear: 2025,
    firstPeriodMonth: 2, // Marzo
  };
  const result = generateOccurrences(params, [2025]);
  expect(result).toHaveLength(4);
  const months = result.map(o => o.originalPeriodMonth);
  expect(months).toEqual([2, 5, 8, 11]); // Mar, Jun, Sep, Dic
});

test('trimestral desde febrero genera Feb, May, Ago, Nov', () => {
  const params: OccurrenceParams = {
    periodicity: 'quarterly',
    dateType: 'exact',
    day: 1,
    firstPeriodYear: 2025,
    firstPeriodMonth: 1, // Febrero
  };
  const result = generateOccurrences(params, [2025]);
  expect(result).toHaveLength(4);
  const months = result.map(o => o.originalPeriodMonth);
  expect(months).toEqual([1, 4, 7, 10]); // Feb, May, Ago, Nov
});

test('trimestral: continuidad entre años (dic → mar)', () => {
  const params: OccurrenceParams = {
    periodicity: 'quarterly',
    dateType: 'exact',
    day: 1,
    firstPeriodYear: 2025,
    firstPeriodMonth: 2, // Marzo 2025
  };
  const result = generateOccurrences(params, [2025, 2026]);
  // 2025: Mar, Jun, Sep, Dic (4) + 2026: Mar, Jun, Sep, Dic (4) = 8
  expect(result).toHaveLength(8);
  // El primer de 2026 debe ser marzo
  const firstOf2026 = result.find(o => o.originalPeriodYear === 2026);
  expect(firstOf2026?.originalPeriodMonth).toBe(2); // Marzo
});

// --- SEMESTRAL ---
console.log('\nSemestral:');
test('semestral desde enero genera Ene y Jul', () => {
  const params: OccurrenceParams = {
    periodicity: 'semiannual',
    dateType: 'exact',
    day: 1,
    firstPeriodYear: 2025,
    firstPeriodMonth: 0,
  };
  const result = generateOccurrences(params, [2025]);
  expect(result).toHaveLength(2);
  const months = result.map(o => o.originalPeriodMonth);
  expect(months).toEqual([0, 6]); // Ene, Jul
});

test('semestral desde abril genera Abr y Oct', () => {
  const params: OccurrenceParams = {
    periodicity: 'semiannual',
    dateType: 'exact',
    day: 1,
    firstPeriodYear: 2025,
    firstPeriodMonth: 3, // Abril
  };
  const result = generateOccurrences(params, [2025]);
  expect(result).toHaveLength(2);
  const months = result.map(o => o.originalPeriodMonth);
  expect(months).toEqual([3, 9]); // Abr, Oct
});

// --- ANUAL ---
console.log('\nAnual:');
test('anual genera exactamente 1 por año', () => {
  const params: OccurrenceParams = {
    periodicity: 'annual',
    dateType: 'exact',
    day: 15,
    firstPeriodYear: 2025,
    firstPeriodMonth: 3, // Abril
  };
  const result = generateOccurrences(params, [2025, 2026]);
  expect(result).toHaveLength(2);
  expect(result[0].originalPeriodMonth).toBe(3);
  expect(result[1].originalPeriodMonth).toBe(3);
});

// --- MESES PERSONALIZADOS ---
console.log('\nMeses personalizados:');
test('custom_months genera solo los meses especificados', () => {
  const params: OccurrenceParams = {
    periodicity: 'custom_months',
    dateType: 'exact',
    day: 1,
    firstPeriodYear: 2025,
    firstPeriodMonth: 0,
    customMonths: [0, 5, 11], // Enero, Junio, Diciembre
  };
  const result = generateOccurrences(params, [2025]);
  expect(result).toHaveLength(3);
  const months = result.map(o => o.originalPeriodMonth);
  expect(months).toEqual([0, 5, 11]);
});

// --- PAGO ÚNICO ---
console.log('\nPago único:');
test('one_time genera exactamente 1 ocurrencia en el año y mes del primer período', () => {
  const params: OccurrenceParams = {
    periodicity: 'one_time',
    dateType: 'exact',
    day: 10,
    firstPeriodYear: 2025,
    firstPeriodMonth: 8, // Septiembre
  };
  const result = generateOccurrences(params, [2025, 2026]);
  expect(result).toHaveLength(1);
  expect(result[0].originalPeriodYear).toBe(2025);
  expect(result[0].originalPeriodMonth).toBe(8);
});

// --- DÍAS INVÁLIDOS ---
console.log('\nDías inválidos (29-31):');
test('día 31 en febrero → PENDING_DATE, dueDate día 1', () => {
  const params: OccurrenceParams = {
    periodicity: 'monthly',
    dateType: 'exact',
    day: 31,
    firstPeriodYear: 2025,
    firstPeriodMonth: 1, // Solo febrero
  };
  const result = generateOccurrences(params, [2025]);
  const feb = result.find(o => o.originalPeriodMonth === 1);
  expect(feb?.status).toBe('PENDING_DATE');
  expect(feb?.dueDate.getMonth()).toBe(1); // Sigue siendo febrero
  expect(feb?.dueDate.getDate()).toBe(1);
});

test('día 31 en enero → PENDING (enero tiene 31 días)', () => {
  const params: OccurrenceParams = {
    periodicity: 'monthly',
    dateType: 'exact',
    day: 31,
    firstPeriodYear: 2025,
    firstPeriodMonth: 0,
  };
  const result = generateOccurrences(params, [2025]);
  const jan = result.find(o => o.originalPeriodMonth === 0);
  expect(jan?.status).toBe('PENDING');
  expect(jan?.dueDate.getDate()).toBe(31);
});

test('día 30 en febrero 2024 (bisiesto) → PENDING_DATE', () => {
  const params: OccurrenceParams = {
    periodicity: 'monthly',
    dateType: 'exact',
    day: 30,
    firstPeriodYear: 2024,
    firstPeriodMonth: 1, // Febrero
  };
  const result = generateOccurrences(params, [2024]);
  const feb = result.find(o => o.originalPeriodMonth === 1);
  expect(feb?.status).toBe('PENDING_DATE'); // Feb 2024 solo tiene 29 días
});

test('día 29 en febrero 2024 (bisiesto) → PENDING (29 días)', () => {
  const params: OccurrenceParams = {
    periodicity: 'monthly',
    dateType: 'exact',
    day: 29,
    firstPeriodYear: 2024,
    firstPeriodMonth: 1,
  };
  const result = generateOccurrences(params, [2024]);
  const feb = result.find(o => o.originalPeriodMonth === 1);
  expect(feb?.status).toBe('PENDING');
  expect(feb?.dueDate.getDate()).toBe(29);
});

test('día 29 en febrero 2025 (no bisiesto) → PENDING_DATE', () => {
  const params: OccurrenceParams = {
    periodicity: 'monthly',
    dateType: 'exact',
    day: 29,
    firstPeriodYear: 2025,
    firstPeriodMonth: 1,
  };
  const result = generateOccurrences(params, [2025]);
  const feb = result.find(o => o.originalPeriodMonth === 1);
  expect(feb?.status).toBe('PENDING_DATE');
  expect(feb?.dueDate.getMonth()).toBe(1); // Sigue en febrero
});

// --- TIPOS DE FECHA ---
console.log('\nTipos de fecha:');
test('month_only → dueDate día 1, status PENDING', () => {
  const params: OccurrenceParams = {
    periodicity: 'annual',
    dateType: 'month_only',
    day: null,
    firstPeriodYear: 2025,
    firstPeriodMonth: 6, // Julio
  };
  const result = generateOccurrences(params, [2025]);
  expect(result).toHaveLength(1);
  expect(result[0].dueDate.getDate()).toBe(1);
  expect(result[0].status).toBe('PENDING');
});

test('approximate → status siempre PENDING_DATE', () => {
  const params: OccurrenceParams = {
    periodicity: 'annual',
    dateType: 'approximate',
    day: 15,
    firstPeriodYear: 2025,
    firstPeriodMonth: 6,
  };
  const result = generateOccurrences(params, [2025]);
  expect(result[0].status).toBe('PENDING_DATE');
});

// --- CONSISTENCIA PREVIEW VS GUARDADO ---
console.log('\nConsistencia preview = guardado:');
test('mismos params → mismos resultados (determinismo)', () => {
  const params: OccurrenceParams = {
    periodicity: 'quarterly',
    dateType: 'exact',
    day: 15,
    firstPeriodYear: 2025,
    firstPeriodMonth: 2, // Marzo
  };
  const r1 = generateOccurrences(params, [2025, 2026]);
  const r2 = generateOccurrences(params, [2025, 2026]);
  expect(r1.length).toBe(r2.length);
  r1.forEach((o, i) => {
    expect(o.dueDate.getTime()).toBe(r2[i].dueDate.getTime());
    expect(o.status).toBe(r2[i].status);
  });
});

// ---- Resumen ----
console.log(`\n${'─'.repeat(40)}`);
if (failCount === 0) {
  console.log(`\n✓ Todos los tests han pasado (${passCount}/${passCount})\n`);
} else {
  console.log(`\n✗ ${failCount} test(s) fallaron de ${passCount + failCount}:`);
  failures.forEach(f => console.log(f));
  console.log('');
  process.exit(1);
}
