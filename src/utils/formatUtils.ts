import { Payment, Concept } from '../types';

const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fullMonthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function formatPaymentDate(payment: Payment, concept?: Concept) {
  if (payment.status === 'PENDING_DATE') {
    return 'Fecha pendiente';
  }
  if (!concept) {
    return `${payment.dueDate.getDate()} de ${monthNames[payment.dueDate.getMonth()]}`;
  }

  const day = payment.dueDate.getDate();
  const month = monthNames[payment.dueDate.getMonth()];
  const fullMonth = fullMonthNames[payment.dueDate.getMonth()];

  if (concept.dateType === 'month_only') {
    return `${fullMonth} · sin día concreto`;
  } else if (concept.dateType === 'approximate') {
    return `Aprox. ${day} de ${month}`;
  } else {
    return `${day} de ${month}`;
  }
}
