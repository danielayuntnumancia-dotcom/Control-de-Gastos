import { Payment, Concept } from '../types';

export const MONTH_NAMES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function formatPaymentDate(payment: Payment, concept?: Concept) {
  if (payment.status === 'PENDING_DATE' || payment.status === 'APPROX_OVERDUE') {
    if (concept?.dateType === 'approximate') {
      const targetDay = concept.day && concept.day > 0 ? concept.day : 1;
      const d1 = new Date(payment.dueDate.getFullYear(), payment.dueDate.getMonth(), targetDay - 1);
      const d2 = new Date(payment.dueDate.getFullYear(), payment.dueDate.getMonth(), targetDay + 1);
      
      if (d1.getMonth() === d2.getMonth()) {
         return `Del ${d1.getDate()} al ${d2.getDate()} de ${MONTH_NAMES_SHORT[d1.getMonth()]}`;
      } else {
         return `Del ${d1.getDate()} de ${MONTH_NAMES_SHORT[d1.getMonth()]} al ${d2.getDate()} de ${MONTH_NAMES_SHORT[d2.getMonth()]}`;
      }
    } else if (concept?.dateType === 'month_only') {
      const fullMonth = MONTH_NAMES[payment.dueDate.getMonth()];
      return `${fullMonth} · sin día concreto`;
    }
    if (payment.status === 'PENDING_DATE') return 'Fecha pendiente';
  }
  
  if (!concept) {
    return `${payment.dueDate.getDate()} de ${MONTH_NAMES_SHORT[payment.dueDate.getMonth()]}`;
  }

  const day = payment.dueDate.getDate();
  const month = MONTH_NAMES_SHORT[payment.dueDate.getMonth()];
  const fullMonth = MONTH_NAMES[payment.dueDate.getMonth()];

  if (concept.dateType === 'month_only') {
    return `${fullMonth} · sin día concreto`;
  } else if (concept.dateType === 'approximate') {
    return `Aprox. ${day} de ${month}`;
  } else {
    return `${day} de ${month}`;
  }
}

export function getCategoryColor(category: string): string {
  switch (category) {
    case 'Suscripción': return '#6366f1'; // Indigo 500
    case 'Impuesto': return '#ef4444'; // Red 500
    case 'Tasa': return '#f59e0b'; // Amber 500
    case 'Seguro': return '#10b981'; // Emerald 500
    case 'Salario': return '#22c55e'; // Green 500
    case 'Paga Extra': return '#16a34a'; // Green 600
    case 'Ingreso Extra': return '#4ade80'; // Green 400
    case 'Otro': return '#64748b'; // Slate 500
    default: return '#64748b';
  }
}

export function getConceptColor(concept: { color?: string, category: string }): string {
  if (!concept.color || concept.color.toUpperCase() === '#315E87') {
    return getCategoryColor(concept.category);
  }
  return concept.color;
}

export function formatAmount(cents: number, type: 'expense' | 'income' = 'expense', isApproximate: boolean = false): string {
  const value = cents / 100;
  const formatted = value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const prefix = isApproximate ? '~' : '';
  const sign = type === 'income' ? '+' : '-';
  return `${prefix}${sign}${formatted}`;
}
