import React, { createContext, useContext, useState } from 'react';
import { Payment, Concept } from '../types';

interface AppStateContextType {
  globalYear: number;
  setGlobalYear: (year: number) => void;
  globalMonth: number;
  setGlobalMonth: (month: number) => void;
  selectedPayment: Payment | null;
  setSelectedPayment: (payment: Payment | null) => void;
  isConceptFormOpen: boolean;
  setIsConceptFormOpen: (isOpen: boolean) => void;
  editingConcept: Concept | undefined;
  setEditingConcept: (concept: Concept | undefined) => void;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [globalYear, setGlobalYear] = useState<number>(new Date().getFullYear());
  const [globalMonth, setGlobalMonth] = useState<number>(new Date().getMonth());
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isConceptFormOpen, setIsConceptFormOpen] = useState(false);
  const [editingConcept, setEditingConcept] = useState<Concept | undefined>();

  return (
    <AppStateContext.Provider value={{
      globalYear, setGlobalYear,
      globalMonth, setGlobalMonth,
      selectedPayment, setSelectedPayment,
      isConceptFormOpen, setIsConceptFormOpen,
      editingConcept, setEditingConcept
    }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}
