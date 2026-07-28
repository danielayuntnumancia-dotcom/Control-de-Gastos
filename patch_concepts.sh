sed -i "s/<tr key={concept.id} className=\"hover:bg-slate-50\">/<tr key={concept.id} className=\"hover:bg-slate-50 cursor-pointer\" onClick={() => onSelect(concept)}>/g" src/components/ConceptsView.tsx
sed -i "s/onClick={() => onEdit(concept)}/onClick={(e) => { e.stopPropagation(); onSelect(concept); }}/g" src/components/ConceptsView.tsx
