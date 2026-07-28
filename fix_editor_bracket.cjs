const fs = require('fs');
let code = fs.readFileSync('src/components/ConceptScheduleEditor.tsx', 'utf-8');
const lines = code.split('\n');
// We have:
// 85:       }
// 86:     }
// 87:     }
// 88:     }
// Need to find the extra brace and remove it
const badIndex = lines.findIndex((l, i) => i > 80 && l.trim() === '}' && lines[i+1].trim() === '}' && lines[i+2].trim() === '}' && lines[i+3].includes('const toCreate'));
if (badIndex !== -1) {
    lines.splice(badIndex, 1);
}
fs.writeFileSync('src/components/ConceptScheduleEditor.tsx', lines.join('\n'));
