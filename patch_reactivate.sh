sed -i "s/const \[isNewPriceOpen/const \[isReactivating, setIsReactivating\] = useState(false);\n  const \[reactivatePreview, setReactivatePreview\] = useState<any\[\] | null>(null);\n  const \[isNewPriceOpen/g" src/components/ConceptDetailsView.tsx

# Replace handleToggleActive
cat << 'INNEREOF' > temp_replace.js
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
INNEREOF
node temp_replace.js

# Now inject the UI for Reactivation
cat << 'INNEREOF' > temp_ui.js
const fs = require('fs');
let code = fs.readFileSync('src/components/ConceptDetailsView.tsx', 'utf8');

const oldUI = `<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-800">{concept.active ? 'Desactivar Concepto' : 'Reactivar Concepto'}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {concept.active 
                    ? 'No se generarán más vencimientos futuros. El historial se conserva intacto.' 
                    : 'Volverán a generarse vencimientos a partir de ahora.'}
                </p>
              </div>
              <button onClick={handleToggleActive} className={\`px-4 py-2 rounded-lg text-sm font-medium transition-colors \${concept.active ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}\`}>
                {concept.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>`;

const newUI = `<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-800">{concept.active ? 'Desactivar Concepto' : 'Reactivar Concepto'}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {concept.active 
                    ? 'No se generarán más vencimientos futuros. El historial se conserva intacto.' 
                    : 'Volverán a generarse vencimientos a partir de ahora.'}
                </p>
              </div>
              {!isReactivating ? (
                <button onClick={handleToggleActive} className={\`px-4 py-2 rounded-lg text-sm font-medium transition-colors \${concept.active ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}\`}>
                  {concept.active ? 'Desactivar' : 'Activar'}
                </button>
              ) : (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg w-full mt-4 md:mt-0 md:max-w-md">
                  <p className="text-sm text-indigo-900 font-medium mb-2">Previsualización de Reactivación</p>
                  <p className="text-xs text-indigo-700 mb-3">Se crearán <strong>{reactivatePreview?.length}</strong> vencimientos futuros que faltaban en el calendario.</p>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setIsReactivating(false)} className="px-3 py-1.5 text-xs font-medium text-slate-600">Cancelar</button>
                    <button onClick={confirmReactivate} className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded">Confirmar Reactivación</button>
                  </div>
                </div>
              )}
            </div>`;

code = code.replace(oldUI, newUI);
fs.writeFileSync('src/components/ConceptDetailsView.tsx', code);
INNEREOF
node temp_ui.js

