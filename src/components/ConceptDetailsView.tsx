import React, { useState, useEffect, useMemo } from 'react';
import { Concept, Payment, PriceVersion, UserSettings } from '../types';
import { ConceptScheduleEditor } from './ConceptScheduleEditor';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, setDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';

interface Props {
  concept: Concept;
  payments: Payment[];
  user: User;
  settings: UserSettings;
  onBack: () => void;
  onOpenPayment: (p: Payment) => void;
}

export function ConceptDetailsView({ concept, payments, user, settings, onBack, onOpenPayment }: Props) {
  const [priceVersions, setPriceVersions] = useState<PriceVersion[]>([]);
  const [loading, setLoading] = useState(true);

  // Derived
  const conceptPayments = useMemo(() => {
    return payments.filter(p => p.conceptId === concept.id).sort((a, b) => {
      // Sort by original period
      const aTime = new Date(a.originalPeriodYear || a.dueDate.getFullYear(), a.originalPeriodMonth || a.dueDate.getMonth(), 1).getTime();
      const bTime = new Date(b.originalPeriodYear || b.dueDate.getFullYear(), b.originalPeriodMonth || b.dueDate.getMonth(), 1).getTime();
      return bTime - aTime;
    });
  }, [payments, concept.id]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const q = query(
          collection(db, 'price_versions'),
          where('conceptId', '==', concept.id),
          where('userId', '==', user.uid),
          orderBy('validFrom', 'desc')
        );
        const snap = await getDocs(q);
        const versions = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          validFrom: d.data().validFrom.toDate(),
          validTo: d.data().validTo?.toDate(),
          createdAt: d.data().createdAt?.toDate() || new Date()
        } as PriceVersion));

        if (versions.length === 0) {
          // Migration: Create initial version
          const newVRef = doc(collection(db, 'price_versions'));
          const initialVersion: PriceVersion = {
            id: newVRef.id,
            conceptId: concept.id,
            userId: user.uid,
            amount: concept.expectedAmount,
            validFrom: concept.firstPeriod,
            createdAt: concept.createdAt
          };
          await setDoc(newVRef, {
            ...initialVersion,
            createdAt: serverTimestamp()
          });
          setPriceVersions([initialVersion]);
        } else {
          setPriceVersions(versions);
        }
      } catch (e) {
        console.error("Error fetching price versions", e);
      } finally {
        setLoading(false);
      }
    };
    fetchPrices();
  }, [concept.id, user.uid, concept.expectedAmount, concept.firstPeriod, concept.createdAt]);

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="animate-spin h-8 w-8 border-b-2 border-indigo-600 rounded-full"></div></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col bg-slate-50 relative">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center gap-4 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">{concept.name}</h2>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight ${concept.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
              {concept.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{concept.category}</p>
        </div>
      </div>

      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-8">
        {/* We will add blocks here */}
      </div>
    </div>
  );
}

// Added sections
