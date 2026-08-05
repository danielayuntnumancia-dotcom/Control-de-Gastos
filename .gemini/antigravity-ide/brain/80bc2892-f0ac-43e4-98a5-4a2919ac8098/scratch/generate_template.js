const XLSX = require('xlsx');

const headers = [
  'Tipo',
  'Nombre',
  'Categoría',
  'Importe Previsto (€)',
  'Periodicidad',
  'Primer Periodo (Mes)',
  'Primer Periodo (Año)',
  'Tipo de Fecha',
  'Día (1-31)',
  'Meses Personalizados'
];

const ws = XLSX.utils.aoa_to_sheet([headers]);

ws['!cols'] = [
  { wch: 10 },
  { wch: 25 },
  { wch: 15 },
  { wch: 20 },
  { wch: 20 },
  { wch: 20 },
  { wch: 20 },
  { wch: 20 },
  { wch: 12 },
  { wch: 25 }
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Importacion');
XLSX.writeFile(wb, 'Plantilla_Control_Gastos.xlsx');
