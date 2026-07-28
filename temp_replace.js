const fs = require('fs');
let code = fs.readFileSync('src/components/ConceptDetailsView.tsx', 'utf8');

const replaceStr = `
  const handleToggleActive = async () => {
    try {
      if (concept.active) {
        if (!confirm("¿Desactivar este concepto? Se conservará su historial pero no se generarán nuevos vencimientos.")) return;
        await updateDoc(doc(db, 'concepts', concept.id), {
          active: false,
          updatedAt: serverTimestamp()
        });
      } else {
        // Prepare preview for reactivation
        const currentYear = new Date().getFullYear();
        const startYear = Math.min(concept.firstPeriod.getFullYear(), currentYear);
        const endYear = currentYear + 1;
        const newOccurrences = [];
        
        for (let year = startYear; year <= endYear; year++) {
          for (let month = 0; month < 12; month++) {
            if (year < concept.firstPeriod.getFullYear() || (year === concept.firstPeriod.getFullYear() && month < concept.firstPeriod.getMonth())) continue;
            
            let shouldGenerate = false;
            if (concept.periodicity === 'monthly') shouldGenerate = true;
            else if (concept.periodicity === 'quarterly') {
              const mSince = (year - concept.firstPeriod.getFullYear()) * 12 + (month - concept.firstPeriod.getMonth());
              if (mSince % 3 === 0) shouldGenerate = true;
            }
            else if (concept.periodicity === 'semiannual') {
              const mSince = (year - concept.firstPeriod.getFullYear()) * 12 + (month - concept.firstPeriod.getMonth());
              if (mSince % 6 === 0) shouldGenerate = true;
            }
            else if (concept.periodicity === 'annual') {
              if (month === concept.firstPeriod.getMonth()) shouldGenerate = true;
            }
            else if (concept.periodicity === 'custom_months') {
              if ((concept.customMonths || []).includes(month)) shouldGenerate = true;
            }
            else if (concept.periodicity === 'one_time') {
              if (year === concept.firstPeriod.getFullYear() && month === concept.firstPeriod.getMonth()) shouldGenerate = true;
            }

            if (shouldGenerate) {
              // Check if future
              const isFuture = year > currentYear || (year === currentYear && month >= new Date().getMonth());
              if (isFuture) {
                let dueDate = new Date(year, month, Number(concept.day) || 1);
                if (concept.dateType === 'month_only') {
                  dueDate = new Date(year, month + 1, 0); // last day
                }
                newOccurrences.push({ month, year, dueDate });
              }
            }
          }
        }
        
        // Filter out existing
        const existingMap = new Set(conceptPayments.map(p => \`\${p.originalPeriodYear}-\${p.originalPeriodMonth}\`));
        const toCreate = newOccurrences.filter(o => !existingMap.has(\`\${o.year}-\${o.month}\`));
        
        setReactivatePreview(toCreate);
        setIsReactivating(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const confirmReactivate = async () => {
    if (!reactivatePreview) return;
    try {
      const batch = writeBatch(db);
      
      batch.update(doc(db, 'concepts', concept.id), {
        active: true,
        updatedAt: serverTimestamp()
      });

      reactivatePreview.forEach(occ => {
        const newRef = doc(collection(db, 'payments'));
        const newPayment = {
          id: newRef.id,
          userId: concept.userId,
          conceptId: concept.id,
          concept: concept.name,
          dueDate: occ.dueDate,
          originalPeriodMonth: occ.month,
          originalPeriodYear: occ.year,
          expectedAmount: concept.expectedAmount,
          actualAmount: null,
          status: concept.dateType === 'month_only' ? 'PENDING_DATE' : 'PENDING',
          createdAt: new Date()
        };
        batch.set(newRef, {
          ...newPayment,
          createdAt: serverTimestamp()
        });
      });
      
      await batch.commit();
      setIsReactivating(false);
      setReactivatePreview(null);
    } catch (e) {
      console.error(e);
    }
  };
`;

code = code.replace(/const handleToggleActive = async \(\) => \{[\s\S]*?catch \(e\) \{\n      console\.error\(e\);\n    \}\n  \};/, replaceStr);
fs.writeFileSync('src/components/ConceptDetailsView.tsx', code);
