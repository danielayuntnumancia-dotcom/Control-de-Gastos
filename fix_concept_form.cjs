const fs = require('fs');
let code = fs.readFileSync('src/components/ConceptForm.tsx', 'utf-8');

// First block
code = code.replace(
  `          let dueDate = new Date(year, month, targetDay);
          
          if (dateType !== 'month_only') {
             // Handle non-existent days
             if (dueDate.getMonth() !== month) {
               status = 'PENDING_DATE';
               // Reset to last day of intended month just for sorting/storing, but keep status as PENDING_DATE
               dueDate = new Date(year, month + 1, 0); 
             }
          }`,
  `          let dueDate = new Date(year, month, targetDay);
          if (dateType !== 'month_only' && dueDate.getMonth() !== month) {
             status = 'PENDING_DATE';
             dueDate = new Date(year, month, 1); 
          } else if (dateType === 'month_only') {
             dueDate = new Date(year, month, 1);
          } else if (dateType === 'approximate') {
             status = 'PENDING_DATE';
          }`
);

// Second block
code = code.replace(
  `              let dueDate = new Date(year, month, targetDay);
              
              if (dateType !== 'month_only') {
                 if (dueDate.getMonth() !== month) {
                   status = 'PENDING_DATE';
                   dueDate = new Date(year, month + 1, 0); 
                 }
              }`,
  `              let dueDate = new Date(year, month, targetDay);
              if (dateType !== 'month_only' && dueDate.getMonth() !== month) {
                 status = 'PENDING_DATE';
                 dueDate = new Date(year, month, 1); 
              } else if (dateType === 'month_only') {
                 dueDate = new Date(year, month, 1);
              } else if (dateType === 'approximate') {
                 status = 'PENDING_DATE';
              }`
);

fs.writeFileSync('src/components/ConceptForm.tsx', code);
