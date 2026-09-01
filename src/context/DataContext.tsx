import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { Payment, Concept, UserSettings, CustomCategory, BankAccount } from '../types';

interface DataContextType {
  payments: Payment[];
  concepts: Concept[];
  customCategories: CustomCategory[];
  accounts: BankAccount[];
  settings: UserSettings | null;
  loading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthorized } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || isAuthorized !== true) {
      setPayments([]);
      setConcepts([]);
      setCustomCategories([]);
      setAccounts([]);
      setSettings(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let paymentsReady = false;
    let conceptsReady = false;
    let categoriesReady = false;
    let accountsReady = false;
    let settingsReady = false;
    const checkLoaded = () => {
      if (paymentsReady && conceptsReady && categoriesReady && accountsReady && settingsReady) {
        setLoading(false);
      }
    };

    const qPayments = query(
      collection(db, 'payments'),
      where('userId', '==', user.uid)
    );
    const unsubscribePayments = onSnapshot(qPayments, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const docData = doc.data();
        return {
          id: doc.id,
          ...docData,
          dueDate: docData.dueDate?.toDate() || new Date(),
          actualDate: docData.actualDate ? docData.actualDate.toDate() : undefined,
          createdAt: docData.createdAt?.toDate() || new Date(),
          updatedAt: docData.updatedAt?.toDate() || new Date()
        } as Payment;
      });
      setPayments(data);
      paymentsReady = true;
      checkLoaded();
    }, (error) => {
      console.error("Error fetching payments:", error);
      paymentsReady = true;
      checkLoaded();
    });

    const qConcepts = query(
      collection(db, 'concepts'),
      where('userId', '==', user.uid)
    );
    const unsubscribeConcepts = onSnapshot(qConcepts, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const docData = doc.data();
        return {
          id: doc.id,
          ...docData,
          firstPeriod: docData.firstPeriod?.toDate() || new Date(),
          createdAt: docData.createdAt?.toDate() || new Date(),
          updatedAt: docData.updatedAt?.toDate() || new Date()
        } as Concept;
      });
      setConcepts(data);
      conceptsReady = true;
      checkLoaded();
    }, (error) => {
      console.error("Error fetching concepts:", error);
      conceptsReady = true;
      checkLoaded();
    });

    const qCategories = query(
      collection(db, 'categories'),
      where('userId', '==', user.uid)
    );
    const unsubscribeCategories = onSnapshot(qCategories, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const docData = doc.data();
        return {
          id: doc.id,
          ...docData,
          createdAt: docData.createdAt?.toDate() || new Date()
        } as CustomCategory;
      });
      setCustomCategories(data);
      categoriesReady = true;
      checkLoaded();
    }, (error) => {
      console.error("Error fetching categories:", error);
      categoriesReady = true;
      checkLoaded();
    });

    const qAccounts = query(
      collection(db, 'accounts'),
      where('userId', '==', user.uid)
    );
    const unsubscribeAccounts = onSnapshot(qAccounts, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const docData = doc.data();
        return {
          id: doc.id,
          ...docData,
          createdAt: docData.createdAt?.toDate() || new Date(),
          updatedAt: docData.updatedAt?.toDate() || new Date()
        } as BankAccount;
      });
      setAccounts(data);
      accountsReady = true;
      checkLoaded();
    }, (error) => {
      console.error("Error fetching accounts:", error);
      accountsReady = true;
      checkLoaded();
    });

    const settingsRef = doc(db, 'settings', user.uid);
    const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings({ userId: user.uid, ...docSnap.data() } as UserSettings);
      } else {
        setSettings({
          userId: user.uid,
          notificationsEnabled: true,
          generalNoticeDays: 5,
        });
      }
      settingsReady = true;
      checkLoaded();
    }, (error) => {
      console.error("Error fetching settings:", error);
      settingsReady = true;
      checkLoaded();
    });

    return () => {
      unsubscribePayments();
      unsubscribeConcepts();
      unsubscribeCategories();
      unsubscribeAccounts();
      unsubscribeSettings();
    };
  }, [user, isAuthorized]);

  return (
    <DataContext.Provider value={{ payments, concepts, customCategories, accounts, settings, loading }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
