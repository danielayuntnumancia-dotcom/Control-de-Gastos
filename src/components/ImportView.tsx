import React, { useState, useRef } from 'react';
import { generateTemplateBlob, parseExcelFile, validateRecords, uploadConceptsBatch, ImportRecord, ValidatedRecord } from '../utils/importUtils';
import { useAuth } from '../context/AuthContext';

export function ImportView() {
  const { user } = useAuth();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<ValidatedRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const blob = generateTemplateBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_importacion.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsProcessing(true);
    setUploadStatus('idle');
    setErrorMessage('');
    
    try {
      const parsedRecords = await parseExcelFile(selectedFile);
      if (parsedRecords.length === 0) {
        setErrorMessage("El archivo parece estar vacío o no tiene el formato correcto.");
        setRecords([]);
      } else if (user) {
        const validated = validateRecords(parsedRecords, user.uid);
        setRecords(validated);
      }
    } catch (err) {
      setErrorMessage("Error al procesar el archivo. Asegúrate de que sea un archivo de Excel (.xlsx) válido.");
      setRecords([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!user) return;
    
    const validConcepts = records.filter(r => r.isValid && r.concept).map(r => r.concept!);
    if (validConcepts.length === 0) return;

    setIsProcessing(true);
    try {
      await uploadConceptsBatch(validConcepts);
      setUploadStatus('success');
      setRecords([]);
      setFile(null);
    } catch (err) {
      console.error(err);
      setUploadStatus('error');
      setErrorMessage("Error al guardar los datos en Firebase. Inténtalo de nuevo.");
    } finally {
      setIsProcessing(false);
    }
  };

  const hasErrors = records.some(r => !r.isValid);
  const isValidToUpload = records.length > 0 && !hasErrors;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Importar Datos</h2>
            <p className="text-sm text-slate-500 mt-1">Sube un archivo Excel para registrar ingresos y gastos de forma masiva.</p>
          </div>
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            Descargar Plantilla
          </button>
        </div>

        <div 
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:border-slate-400'}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <span className="material-symbols-outlined text-4xl text-slate-400 mb-3">upload_file</span>
          <h3 className="text-lg font-medium text-slate-700 mb-1">Arrastra tu archivo aquí</h3>
          <p className="text-sm text-slate-500 mb-4">Solo archivos .xlsx (Excel) o .csv son soportados</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            onChange={handleChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Seleccionar archivo
          </button>
        </div>

        {isProcessing && (
          <div className="text-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="text-sm text-slate-500 mt-2">Procesando...</p>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-start gap-3 border border-red-100">
            <span className="material-symbols-outlined">error</span>
            <p className="text-sm">{errorMessage}</p>
          </div>
        )}

        {uploadStatus === 'success' && (
          <div className="bg-green-50 text-green-700 p-4 rounded-lg flex items-start gap-3 border border-green-100">
            <span className="material-symbols-outlined">check_circle</span>
            <p className="text-sm font-medium">¡Importación completada con éxito!</p>
          </div>
        )}

        {records.length > 0 && !isProcessing && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-400">visibility</span>
                Vista Previa
              </h3>
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-500">
                  {records.length} registros encontrados
                </span>
                <button
                  onClick={handleUpload}
                  disabled={!isValidToUpload}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isValidToUpload
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                  Confirmar Importación
                </button>
              </div>
            </div>

            {hasErrors && (
              <div className="bg-amber-50 text-amber-800 p-3 text-sm border-b border-amber-100 flex items-start gap-2">
                <span className="material-symbols-outlined text-[20px]">warning</span>
                <p>Hay filas con errores. Corrígelas en tu archivo y vuelve a subirlo antes de importar.</p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <th className="px-4 py-3 font-medium">Fila</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">Importe</th>
                    <th className="px-4 py-3 font-medium">Categoría</th>
                    <th className="px-4 py-3 font-medium">Periodicidad</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r, i) => (
                    <tr key={i} className={r.isValid ? 'hover:bg-slate-50' : 'bg-red-50 hover:bg-red-100'}>
                      <td className="px-4 py-3 text-slate-400">#{i + 2}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          r.record.tipo?.toLowerCase() === 'ingreso' ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {r.record.tipo || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{r.record.nombre || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.record.importePrevisto || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.record.categoria || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.record.periodicidad || '-'}</td>
                      <td className="px-4 py-3">
                        {r.isValid ? (
                          <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                            Correcto
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {r.errors.map((err, errIdx) => (
                              <span key={errIdx} className="flex items-start gap-1 text-red-600 text-xs">
                                <span className="material-symbols-outlined text-[14px] mt-0.5">error</span>
                                {err}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
