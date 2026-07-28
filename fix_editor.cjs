const fs = require('fs');
let code = fs.readFileSync('src/components/ConceptScheduleEditor.tsx', 'utf-8');
const lines = code.split('\n');
const fixedLines = [
  "        if (shouldGenerate) {",
  "          const targetDay = Number(day) || 1;",
  "          let dueDate = new Date(year, month, targetDay);",
  "          let status: any = 'PENDING';",
  "          if (dateType !== 'month_only' && dueDate.getMonth() !== month) {",
  "            status = 'PENDING_DATE';",
  "            dueDate = new Date(year, month, 1);",
  "          } else if (dateType === 'month_only') {",
  "            dueDate = new Date(year, month, 1);",
  "          } else if (dateType === 'approximate') {",
  "            status = 'PENDING_DATE';",
  "          }",
  "          newOccurrences.push({ month, year, dueDate, status });",
  "        }",
  "      }",
  "    }"
];
const newCode = [...lines.slice(0, 71), ...fixedLines, ...lines.slice(89)].join('\n');
fs.writeFileSync('src/components/ConceptScheduleEditor.tsx', newCode);
