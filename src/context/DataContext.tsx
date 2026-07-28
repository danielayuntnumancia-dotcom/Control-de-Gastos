import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { Payment, Concept, UserSettings } from '../types';

interface DataContextType {
  payments: Payment[];
  concepts: Concept[];
  settings: UserSettings | null;
  loading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthorized } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || isAuthorized !== true) {
      setPayments([]);
      setConcepts([]);
      setSettings(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let isInitialLoad = true;

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
    }, (error) => {
      console.error("Error fetching payments:", error);
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
    }, (error) => {
      console.error("Error fetching concepts:", error);
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
      
      if (isInitialLoad) {
        setLoading(false);
        isInitialLoad = false;
      }
    }, (error) => {
      console.error("Error fetching settings:", error);
      if (isInitialLoad) {
        setLoading(false);
        isInitialLoad = false;
      }
    });

    return () => {
      unsubscribePayments();
      unsubscribeConcepts();
      unsubscribeSettings();
    };
  }, [user, isAuthorized]);

  return (
    <DataContext.Provider value={{ payments, concepts, settings, loading }}>
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
