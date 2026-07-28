const fs = require('fs');
let code = fs.readFileSync('src/components/ConceptScheduleEditor.tsx', 'utf-8');
code = code.replace(
  "newOccurrences: { month: number, year: number, dueDate: Date }[] = [];",
  "newOccurrences: { month: number, year: number, dueDate: Date, status: any }[] = [];"
);
code = code.replace(
  "status: dateType === 'month_only' ? 'PENDING_DATE' : 'PENDING',",
  "status: occ.status,"
);
fs.writeFileSync('src/components/ConceptScheduleEditor.tsx', code);
