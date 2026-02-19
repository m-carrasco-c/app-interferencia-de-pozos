import React from 'react';
import { FileText, Printer, X } from 'lucide-react';
import { ROW_CONFIGS, formatLocal } from '../lib/utils';
import { ZoomableScatterChart, HeatmapCanvas } from './Visualizations';

export const ReportView = ({ processedData, chartDomains, onClose }: any) => {
  const handlePrint = () => window.print();
  const inputRows = ROW_CONFIGS.filter(r => !r.isCalc);
  const resultRows = ROW_CONFIGS.filter(r => r.isCalc);

  return (
    <div className="fixed inset-0 bg-white z-[100] overflow-y-auto print:static print:h-auto print:overflow-visible">
      <div className="sticky top-0 bg-slate-900 text-white p-4 shadow-md flex justify-between items-center print:hidden z-50">
        <div className="flex items-center gap-2"><FileText className="text-blue-400" /><h2 className="text-lg font-bold">Vista Preliminar del Reporte</h2></div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2 font-medium transition-colors"><Printer size={18} /> Imprimir / Guardar PDF</button>
          <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded flex items-center gap-2 font-medium transition-colors"><X size={18} /> Cerrar</button>
        </div>
      </div>
      <div className="max-w-5xl mx-auto p-8 bg-white print:p-0 print:max-w-none text-slate-900">
        <div className="border-b-2 border-slate-800 pb-4 mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Análisis de Influencia de Pozos</h1>
          <div className="flex justify-between text-sm text-slate-500"><span>Reporte Técnico Generado Automáticamente</span><span>Fecha: {new Date().toLocaleDateString()}</span></div>
        </div>

        <section className="mb-10 break-inside-avoid">
          <h3 className="text-xl font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">1. Metodología de Cálculo</h3>
          <p className="text-justify mb-4 text-sm leading-relaxed text-slate-700">Se calcula la Transmisividad ($T$) asumiendo dependencia de la longitud de columna captada ($L$) y la conductividad hidráulica ($K$):</p>
          <div className="bg-slate-50 p-6 rounded border border-slate-200 text-center mb-6 flex flex-col justify-center items-center gap-2">
             <div className="font-serif text-xl text-slate-800 italic flex items-center gap-2"><span>T</span><span>=</span><span>K</span><span>·</span><span>(</span><span>Prof.</span><span>-</span><span>N.E.</span><span>)</span></div>
             <div className="text-xs text-slate-400">(Transmisividad simplificada por longitud de captación)</div>
          </div>
          <p className="text-justify mb-4 text-sm leading-relaxed text-slate-700">Para la evaluación de la interferencia se utiliza la solución analítica de <strong>Thiem (Régimen Permanente)</strong>:</p>
          <div className="bg-slate-50 p-6 rounded border border-slate-200 text-center mb-4 flex flex-col justify-center items-center gap-4">
             <div className="font-serif text-lg text-slate-800 italic flex items-center gap-2"><span>s</span><span>=</span><div className="flex flex-col items-center mx-1"><div className="border-b border-slate-800 pb-0.5 mb-0.5">Q</div><div>2 π T</div></div><span>·</span><span>ln</span><div className="flex items-center"><span className="text-2xl text-slate-400">(</span><div className="flex flex-col items-center mx-0.5 text-xs"><div className="border-b border-slate-800 pb-0.5 mb-0.5">R</div><div>r</div></div><span className="text-2xl text-slate-400">)</span></div></div>
             <div className="text-xs text-slate-500 mt-2"><em>(Fórmula de Thiem)</em></div>
          </div>
          <p className="text-justify mb-4 text-sm leading-relaxed text-slate-700">Para el Radio de Influencia ($R$), se utiliza la fórmula empírica de <strong>Sichardt</strong>:</p>
           <div className="bg-slate-50 p-6 rounded border border-slate-200 text-center mb-4 flex justify-center items-center gap-4">
             <div className="font-serif text-lg text-slate-800 italic flex items-center gap-2"><span>R</span><span>=</span><span>3000</span><span>·</span><span>s</span><span>·</span><span className="text-xl">√</span><span className="border-t border-slate-800 pt-0.5">K</span></div>
          </div>
        </section>

        <section className="mb-10 break-inside-avoid">
          <h3 className="text-xl font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">2. Datos de Entrada</h3>
          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="w-full text-xs text-left"><thead className="bg-slate-100 text-slate-700 uppercase"><tr><th className="px-3 py-2 border-b">Parámetro</th>{processedData.wells.map((w: any, i: number) => <th key={i} className="px-3 py-2 border-b text-center">{w.name}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{inputRows.map(row => (<tr key={row.key} className="break-inside-avoid"><td className="px-3 py-1 font-medium bg-slate-50 border-r">{row.label}</td>{processedData.wells.map((w: any, i: number) => (<td key={i} className="px-3 py-1 text-center font-mono text-slate-600">{w[row.key]}</td>))}</tr>))}</tbody></table>
          </div>
        </section>

        <section className="mb-10 break-inside-avoid">
            <h3 className="text-xl font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">3. Resultados Calculados</h3>
            <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="w-full text-xs text-left"><thead className="bg-slate-100 text-slate-700 uppercase"><tr><th className="px-3 py-2 border-b">Variable</th>{processedData.wells.map((w: any, i: number) => <th key={i} className="px-3 py-2 border-b text-center">{w.name}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{resultRows.map(row => (<tr key={row.key} className="break-inside-avoid"><td className="px-3 py-1 font-medium bg-slate-50 border-r">{row.label}</td>{processedData.wells.map((w: any, i: number) => (<td key={i} className={`px-3 py-1 text-center font-mono ${row.key.includes('max_dynamic') ? 'font-bold text-red-600' : 'text-slate-600'}`}>{w[row.key]}</td>))}</tr>))}</tbody></table>
            </div>
        </section>

        <section className="mb-10 break-inside-avoid page-break-after-always">
          <h3 className="text-xl font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">4. Matriz de Influencia</h3>
          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="w-full text-xs text-left"><thead className="bg-slate-100 text-slate-700 uppercase"><tr><th className="px-3 py-2 border-b border-r">Obs. \ Bomb.</th>{processedData.wells.map((w: any, i: number) => <th key={i} className="px-3 py-2 border-b text-center">{w.name}</th>)}<th className="px-3 py-2 border-b text-center font-bold bg-slate-200">TOTAL</th></tr></thead><tbody className="divide-y divide-slate-100">{processedData.matrix.map((row: any, i: number) => (<tr key={i} className="break-inside-avoid"><td className="px-3 py-2 font-medium bg-slate-50 border-r">{row.targetName}</td>{row.influences.map((val: any, j: number) => (<td key={j} className="px-3 py-2 text-center font-mono text-slate-600">{formatLocal(val)}</td>))}<td className="px-3 py-2 text-center font-bold font-mono bg-slate-50 text-red-600">{formatLocal(row.total)}</td></tr>))}</tbody></table>
          </div>
        </section>

        <section className="mb-10 break-inside-avoid">
            <h3 className="text-xl font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">5. Planta de Ubicación</h3>
            <div className="w-full h-[500px] border border-slate-200 rounded p-4 bg-white"><ZoomableScatterChart processedData={processedData} initialDomain={chartDomains} /></div>
        </section>
        
        <section className="mb-10 break-inside-avoid">
            <h3 className="text-xl font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">6. Mapa de Nivel Dinámico</h3>
            <div className="w-full h-[500px] border border-slate-200 rounded overflow-hidden bg-slate-50 relative"><HeatmapCanvas wells={processedData.wells} /></div>
        </section>
      </div>
    </div>
  );
};
