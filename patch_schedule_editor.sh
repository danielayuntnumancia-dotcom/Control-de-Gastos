sed -i "s/import { Concept, Payment, PriceVersion, UserSettings } from '..\/types';/import { Concept, Payment, PriceVersion, UserSettings } from '..\/types';\nimport { ConceptScheduleEditor } from '.\/ConceptScheduleEditor';/g" src/components/ConceptDetailsView.tsx

sed -i "s/const \[isEditingGeneral, setIsEditingGeneral\] = useState(false);/const \[isEditingGeneral, setIsEditingGeneral\] = useState(false);\n  const \[isEditingSchedule, setIsEditingSchedule\] = useState(false);/g" src/components/ConceptDetailsView.tsx

# Replace the specific block of "Editar (Próximamente)"
sed -i 's/<button className="text-sm text-slate-400 font-medium cursor-not-allowed" title="La edición de programación estará disponible pronto">\n              Editar (Próximamente)\n            <\/button>/\{!isEditingSchedule \&\& (\n              <button onClick={() => setIsEditingSchedule(true)} className="text-sm text-indigo-600 font-medium hover:underline">\n                Editar\n              <\/button>\n            )\}/g' src/components/ConceptDetailsView.tsx

