const fs = require('fs');
let code = fs.readFileSync('src/components/ConceptDetailsView.tsx', 'utf8');

const oldUI = `<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-800">{concept.active ? 'Desactivar Concepto' : 'Reactivar Concepto'}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {concept.active 
                    ? 'No se generarán más vencimientos futuros. El historial se conserva intacto.' 
                    : 'Volverán a generarse vencimientos a partir de ahora.'}
                </p>
              </div>
              <button onClick={handleToggleActive} className={\`px-4 py-2 rounded-lg text-sm font-medium transition-colors \${concept.active ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}\`}>
                {concept.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>`;

const newUI = `<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-800">{concept.active ? 'Desactivar Concepto' : 'Reactivar Concepto'}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {concept.active 
                    ? 'No se generarán más vencimientos futuros. El historial se conserva intacto.' 
                    : 'Volverán a generarse vencimientos a partir de ahora.'}
                </p>
              </div>
              {!isReactivating ? (
                <button onClick={handleToggleActive} className={\`px-4 py-2 rounded-lg text-sm font-medium transition-colors \${concept.active ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}\`}>
                  {concept.active ? 'Desactivar' : 'Activar'}
                </button>
              ) : (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg w-full mt-4 md:mt-0 md:max-w-md">
                  <p className="text-sm text-indigo-900 font-medium mb-2">Previsualización de Reactivación</p>
                  <p className="text-xs text-indigo-700 mb-3">Se crearán <strong>{reactivatePreview?.length}</strong> vencimientos futuros que faltaban en el calendario.</p>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setIsReactivating(false)} className="px-3 py-1.5 text-xs font-medium text-slate-600">Cancelar</button>
                    <button onClick={confirmReactivate} className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded">Confirmar Reactivación</button>
                  </div>
                </div>
              )}
            </div>`;

code = code.replace(oldUI, newUI);
fs.writeFileSync('src/components/ConceptDetailsView.tsx', code);
