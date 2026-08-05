import * as XLSX from 'xlsx';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Concept } from '../types';

export interface ImportRecord {
  tipo: string;
  nombre: string;
  categoria: string;
  importePrevisto: number | string;
  periodicidad: string;
  primerPeriodoMes: string;
  primerPeriodoAno: string;
  tipoDeFecha: string;
  dia?: number | string;
  mesesPersonalizados?: string;
}

export interface ValidatedRecord {
  record: ImportRecord;
  concept?: Partial<Concept>;
  isValid: boolean;
  errors: string[];
}

const TEMPLATE_HEADERS = [
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

const ALLOWED_CATEGORIES = [
  'Suscripción', 'Impuesto', 'Tasa', 'Seguro', 'Salario', 'Paga Extra', 'Ingreso Extra', 'Otro'
];

const PERIODICITY_MAP: Record<string, Concept['periodicity']> = {
  'mensual': 'monthly',
  'trimestral': 'quarterly',
  'semestral': 'semiannual',
  'anual': 'annual',
  'meses personalizados': 'custom_months',
  'pago único': 'one_time'
};

const DATETYPE_MAP: Record<string, Concept['dateType']> = {
  'día exacto': 'exact',
  'día aproximado': 'approximate',
  'solo mes (sin día)': 'month_only'
};

const MONTHS_MAP: Record<string, number> = {
  'enero': 0, '1': 0, '01': 0, 'febrero': 1, '2': 1, '02': 1, 'marzo': 2, '3': 2, '03': 2,
  'abril': 3, '4': 3, '04': 3, 'mayo': 4, '5': 4, '05': 4, 'junio': 5, '6': 5, '06': 5,
  'julio': 6, '7': 6, '07': 6, 'agosto': 7, '8': 7, '08': 7, 'septiembre': 8, '9': 8, '09': 8,
  'octubre': 9, '10': 9, 'noviembre': 10, '11': 10, 'diciembre': 11, '12': 11
};

import ExcelJS from 'exceljs';

export async function generateTemplateBlob(): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Plantilla Importación');

  ws.columns = [
    { header: 'Tipo', key: 'tipo', width: 15 },
    { header: 'Nombre', key: 'nombre', width: 25 },
    { header: 'Categoría', key: 'categoria', width: 20 },
    { header: 'Importe Previsto (€)', key: 'importe', width: 22 },
    { header: 'Periodicidad', key: 'periodicidad', width: 20 },
    { header: 'Primer Periodo (Mes)', key: 'primerPeriodoMes', width: 22 },
    { header: 'Primer Periodo (Año)', key: 'primerPeriodoAno', width: 22 },
    { header: 'Tipo de Fecha', key: 'tipoDeFecha', width: 20 },
    { header: 'Día (1-31)', key: 'dia', width: 12 },
    { header: 'Meses Personalizados', key: 'mesesPersonalizados', width: 25 }
  ];

  // Header style
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

  // Add 500 empty rows with data validation
  for (let i = 2; i <= 501; i++) {
    ws.getCell(`A${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Gasto,Ingreso"']
    };
    ws.getCell(`C${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Suscripción,Impuesto,Tasa,Seguro,Salario,Paga Extra,Ingreso Extra,Otro"']
    };
    ws.getCell(`D${i}`).dataValidation = {
      type: 'decimal',
      operator: 'greaterThan',
      allowBlank: true,
      formulae: [0],
      showErrorMessage: true,
      errorStyle: 'error',
      errorTitle: 'Importe inválido',
      error: 'El importe debe ser un número mayor a 0.'
    };
    ws.getCell(`E${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Mensual,Trimestral,Semestral,Anual,Meses Personalizados,Pago Único"']
    };
    ws.getCell(`F${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Enero,Febrero,Marzo,Abril,Mayo,Junio,Julio,Agosto,Septiembre,Octubre,Noviembre,Diciembre"']
    };
    ws.getCell(`H${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Día exacto,Día aproximado,Solo mes (sin día)"']
    };
    ws.getCell(`I${i}`).dataValidation = {
      type: 'whole',
      operator: 'between',
      allowBlank: true,
      formulae: [1, 31],
      showErrorMessage: true,
      errorStyle: 'error',
      errorTitle: 'Día inválido',
      error: 'El día debe ser un número entre 1 y 31.'
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function parseExcelFile(file: File): Promise<ImportRecord[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        
        // Ensure the header is exactly what we expect by skipping the first row 
        // and mapping manually, or just use json and map properties.
        const rawData = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });
        
        if (rawData.length <= 1) {
          return resolve([]);
        }

        const headers = rawData[0] as string[];
        const rows = rawData.slice(1);

        const records = rows.map(row => {
          const record: any = {};
          headers.forEach((header, index) => {
            let val = row[index];
            if (val !== undefined && val !== null) {
              val = String(val).trim();
            }
            // Map header back to ImportRecord keys
            switch (header?.trim()) {
              case 'Tipo': record.tipo = val; break;
              case 'Nombre': record.nombre = val; break;
              case 'Categoría': record.categoria = val; break;
              case 'Importe Previsto (€)': record.importePrevisto = val; break;
              case 'Periodicidad': record.periodicidad = val; break;
              case 'Primer Periodo (Mes)': record.primerPeriodoMes = val; break;
              case 'Primer Periodo (Año)': record.primerPeriodoAno = val; break;
              case 'Tipo de Fecha': record.tipoDeFecha = val; break;
              case 'Día (1-31)': record.dia = val; break;
              case 'Meses Personalizados': record.mesesPersonalizados = val; break;
            }
          });
          return record as ImportRecord;
        });

        // Filter out completely empty rows
        const filteredRecords = records.filter(r => Object.keys(r).length > 0 && Object.values(r).some(v => v !== undefined && v !== ''));
        resolve(filteredRecords);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

export function validateRecords(records: ImportRecord[], userId: string): ValidatedRecord[] {
  return records.map((record, index) => {
    const errors: string[] = [];
    const concept: Partial<Concept> = {
      userId,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 1. Tipo
    if (!record.tipo) {
      errors.push("Tipo es obligatorio");
    } else {
      const t = record.tipo.toLowerCase();
      if (t === 'gasto' || t === 'expense') concept.type = 'expense';
      else if (t === 'ingreso' || t === 'income') concept.type = 'income';
      else errors.push("Tipo debe ser Gasto o Ingreso");
    }

    // 2. Nombre
    if (!record.nombre) {
      errors.push("Nombre es obligatorio");
    } else {
      concept.name = record.nombre;
    }

    // 3. Categoría
    if (!record.categoria) {
      errors.push("Categoría es obligatoria");
    } else {
      const foundCat = ALLOWED_CATEGORIES.find(c => c.toLowerCase() === record.categoria.toLowerCase());
      if (foundCat) {
        concept.category = foundCat as any;
      } else {
        errors.push(`Categoría no válida. Opciones: ${ALLOWED_CATEGORIES.join(', ')}`);
      }
    }

    // 4. Importe
    if (record.importePrevisto === undefined || record.importePrevisto === '') {
      errors.push("Importe Previsto es obligatorio");
    } else {
      const amtStr = String(record.importePrevisto).replace(',', '.');
      const amtNum = parseFloat(amtStr);
      if (isNaN(amtNum) || amtNum <= 0) {
        errors.push("Importe Previsto debe ser un número mayor que 0");
      } else {
        concept.expectedAmount = Math.round(amtNum * 100); // Guardado en céntimos
      }
    }

    // 5. Periodicidad
    if (!record.periodicidad) {
      errors.push("Periodicidad es obligatoria");
    } else {
      const per = PERIODICITY_MAP[record.periodicidad.toLowerCase()];
      if (per) {
        concept.periodicity = per;
      } else {
        errors.push("Periodicidad no válida");
      }
    }

    // 6 & 7. Primer Periodo
    let firstPeriodMonth = -1;
    let firstPeriodYear = -1;

    if (!record.primerPeriodoMes) {
      errors.push("Primer Periodo (Mes) es obligatorio");
    } else {
      const m = MONTHS_MAP[record.primerPeriodoMes.toLowerCase()];
      if (m !== undefined) {
        firstPeriodMonth = m;
      } else {
        errors.push("Mes no válido");
      }
    }

    if (!record.primerPeriodoAno) {
      errors.push("Primer Periodo (Año) es obligatorio");
    } else {
      const y = parseInt(String(record.primerPeriodoAno), 10);
      if (isNaN(y) || y < 2000 || y > 2100) {
        errors.push("Año no válido");
      } else {
        firstPeriodYear = y;
      }
    }

    // 8. Tipo de Fecha
    if (!record.tipoDeFecha) {
      errors.push("Tipo de Fecha es obligatorio");
    } else {
      const dt = DATETYPE_MAP[record.tipoDeFecha.toLowerCase()];
      if (dt) {
        concept.dateType = dt;
      } else {
        errors.push("Tipo de Fecha no válido");
      }
    }

    // 9. Día
    if (concept.dateType === 'exact' || concept.dateType === 'approximate') {
      if (!record.dia) {
        errors.push(`Día es obligatorio para tipo de fecha '${record.tipoDeFecha}'`);
      } else {
        const d = parseInt(String(record.dia), 10);
        if (isNaN(d) || d < 1 || d > 31) {
          errors.push("Día debe estar entre 1 y 31");
        } else {
          concept.day = d;
        }
      }
    } else {
      concept.day = null;
    }

    // Set First Period Date
    if (firstPeriodMonth !== -1 && firstPeriodYear !== -1) {
      const dayToUse = concept.day || 1;
      const date = new Date(firstPeriodYear, firstPeriodMonth, dayToUse);
      if (date.getMonth() !== firstPeriodMonth) {
        errors.push(`El mes seleccionado no tiene ${dayToUse} días`);
      } else {
        concept.firstPeriod = date;
      }
    }

    // 10. Meses Personalizados
    if (concept.periodicity === 'custom_months') {
      if (!record.mesesPersonalizados) {
        errors.push("Meses Personalizados es obligatorio si la periodicidad es 'Meses Personalizados'");
      } else {
        const months = String(record.mesesPersonalizados)
          .split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n) && n >= 1 && n <= 12)
          .map(n => n - 1); // Convertir a base 0 (0-11)
        
        if (months.length === 0) {
          errors.push("Meses Personalizados no válidos. Deben ser números separados por coma (ej. 1, 3, 5)");
        } else {
          concept.customMonths = months;
        }
      }
    }

    return {
      record,
      concept,
      isValid: errors.length === 0,
      errors
    };
  });
}

export async function uploadConceptsBatch(concepts: Partial<Concept>[]): Promise<void> {
  const BATCH_SIZE = 500;
  
  for (let i = 0; i < concepts.length; i += BATCH_SIZE) {
    const chunk = concepts.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    
    chunk.forEach(concept => {
      const newRef = doc(collection(db, 'concepts'));
      concept.id = newRef.id;
      batch.set(newRef, concept);
    });

    await batch.commit();
  }
}
