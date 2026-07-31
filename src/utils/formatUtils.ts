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
