export interface Concept {
  id: string;
  userId: string;
  name: string;
  type?: 'expense' | 'income';
  category: 'Suscripción' | 'Impuesto' | 'Tasa' | 'Seguro' | 'Salario' | 'Paga Extra' | 'Ingreso Extra' | 'Otro';
  description?: string;
  expectedAmount: number; // in cents
  amountType?: 'exact' | 'approximate';
  color?: string;
  periodicity: 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'custom_months' | 'one_time';
  customMonths?: number[];
  dateType: 'exact' | 'approximate' | 'month_only';
  day?: number | null;
  firstPeriod: Date;
  active: boolean;
  exceptionNoticeDays?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  userId: string;
  conceptId?: string; // Links to a Concept
  concept: string; // Stored here for fast access and history
  type?: 'expense' | 'income';
  description?: string;
  dueDate: Date; // Effective Date
  originalPeriodMonth?: number; // 0-11
  originalPeriodYear?: number;
  expectedAmount: number; // in cents
  isAmountApproximate?: boolean;
  actualAmount: number | null;
  actualDate?: Date; // Fecha real de pago
  isDelayed?: boolean;
  status: 'PENDING' | 'PAID' | 'NO_NOTICE' | 'REFUNDED' | 'OVERDUE' | 'APPROX_OVERDUE' | 'PENDING_DATE' | 'CANCELED';
  createdAt: Date;
  updatedAt?: Date;
}

export interface UserSettings {
  userId: string;
  notificationsEnabled: boolean;
  generalNoticeDays: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PriceVersion {
  id: string;
  conceptId: string;
  userId: string;
  amount: number; // in cents
  validFrom: Date; // The date this price becomes active (we can use the 1st of the month for period comparisons)
  validTo?: Date | null;
  createdAt: Date;
  note?: string;
}
