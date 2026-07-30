import { Payment, Concept } from '../types';

export const MONTH_NAMES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function formatPaymentDate(payment: Payment, concept?: Concept) {
  if (payment.status === 'PENDING_DATE') {
    return 'Fecha pendiente';
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
