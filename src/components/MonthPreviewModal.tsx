import React, { useState, useEffect } from 'react';
import { CalendarMonthView } from './CalendarMonthView';
import { Payment, Concept } from '../types';

interface MonthPreviewModalProps {
  initialMonth: number;
  initialYear: number;
  payments: Payment[];
  concepts: Concept[];
  onClose: () => void;
  onOpenPayment: (p: Payment) => void;
}

export default function MonthPreviewModal({
  initialMonth,
  initialYear,
  payments,
  concepts,
  onClose,
  onOpenPayment
}: MonthPreviewModalProps) {
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);

  useEffect(() => {
    setMonth(initialMonth);
    setYear(initialYear);
  }, [initialMonth, initialYear]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const handleToday = () => {
    const today = new Date();
    setMonth(today.getMonth());
    setYear(today.getFullYear());
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" onClick={onClose}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 pointer-events-none">
        <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col pointer-events-auto relative">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 z-10 p-2 text-slate-500 hover:text-slate-700 bg-white/80 backdrop-blur hover:bg-slate-100 rounded-full shadow-sm transition-colors border border-slate-200"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
          
          <div className="flex-1 overflow-y-auto w-full">
            <CalendarMonthView 
              payments={payments}
              concepts={concepts}
              month={month}
              year={year}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              onToday={handleToday}
              onOpenPayment={onOpenPayment}
            />
          </div>
        </div>
      </div>
    </>
  );
}
