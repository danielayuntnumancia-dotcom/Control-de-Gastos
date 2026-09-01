import { Payment, Concept } from '../types';

export const MONTH_NAMES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function formatStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING': return 'Pendiente';
    case 'PAID': return 'Pagado';
    case 'PENDING_DATE': return 'Fecha pendiente';
    case 'OVERDUE': return 'Vencido';
    case 'APPROX_OVERDUE': return 'Vencido (Aprox)';
    case 'CANCELED': return 'Cancelado';
    case 'NO_NOTICE': return 'Sin aviso';
    case 'REFUNDED': return 'Devuelto';
    default: return status;
  }
}

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

function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function generateAutomaticCategoryColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 70, 48);
}

export function generateAutomaticAccountColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash + 137) % 360;
  return hslToHex(hue, 65, 45);
}

export function getCategoryColor(category: string, customColor?: string): string {
  if (customColor) return customColor;
  switch (category) {
    case 'Suscripción': return '#6366f1'; // Indigo 500
    case 'Impuesto': return '#ef4444'; // Red 500
    case 'Tasa': return '#f59e0b'; // Amber 500
    case 'Seguro': return '#10b981'; // Emerald 500
    case 'Hipoteca': return '#8b5cf6'; // Purple 500
    case 'Préstamo': return '#ec4899'; // Pink 500
    case 'Salario': return '#22c55e'; // Green 500
    case 'Paga Extra': return '#16a34a'; // Green 600
    case 'Ingreso Extra': return '#4ade80'; // Green 400
    case 'Ahorro': return '#3b82f6'; // Blue 500
    case 'Otro': return '#64748b'; // Slate 500
    default: return generateAutomaticCategoryColor(category);
  }
}

export function getConceptColor(concept: { color?: string, category: string }): string {
  return getCategoryColor(concept.category);
}

export function getPaymentDisplayAmount(payment: { actualAmount?: number | null, expectedAmount: number }): number {
  if (payment.actualAmount !== null && payment.actualAmount !== undefined) {
    return payment.actualAmount;
  }
  return payment.expectedAmount;
}

export function formatAmount(cents: number, type: 'expense' | 'income' = 'expense', isApproximate: boolean = false): string {
  const value = cents / 100;
  const formatted = value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const prefix = isApproximate ? '~' : '';
  const sign = type === 'income' ? '+' : '-';
  return `${prefix}${sign}${formatted}`;
}
