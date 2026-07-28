sed -i -e "s/let dueDate = new Date(year, month, concept.day || 1);/const targetDay = concept.day || 1;\n      let dueDate = new Date(year, month, targetDay);/g" src/utils/paymentGenerator.ts
