import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calculator, Map, Activity, Droplets, Info, Clipboard, Grid, Waves, FileText, Sliders, RefreshCw, TrendingUp } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { 
  calcHydraulics, 
  getDrawdownInterference, 
  ROW_CONFIGS, 
  FIELD_ORDER, 
  formatLocal, 
  parseLocal, 
  DECIMAL_SEPARATOR, 
  THOUSANDS_SEPARATOR, 
  WELL_RADIUS_THEORETICAL, 
  SECONDS_IN_DAY 
} from './lib/utils';
import { ZoomableHeatmap, ZoomableScatterChart } from './components/Visualizations';
import { ReportView } from './components/ReportView';

const App = () => {
  const [numWellsInput, setNumWellsInput] = useState(1);
  const [wells, setWells] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('input');
  const [isReportMode, setIsReportMode] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);

  useEffect(() => {
    const initialCount = 2; 
    // Usar formatLocal garantiza que el estado inicial coincida con la configuración local
    const newWells = Array.from({ length: initialCount }, (_, i) => ({
      id: i + 1, name: `Pozo-${i + 1}`, type: 'Bombeo', 
      easting: formatLocal(500 + (i * 200), 0), 
      northing: formatLocal(1000, 0),
      elevation: formatLocal(100, 2), 
      bedrock_elevation: formatLocal(40, 2), 
      k_value: formatLocal(15, 2), 
      depth: formatLocal(60, 2), 
      flow: formatLocal(10, 2), 
      pumping_hours: formatLocal(24, 2), 
      static_level: formatLocal(5, 2), 
      dynamic_level: formatLocal(12, 2),
    }));
    setWells(newWells);
    setNumWellsInput(initialCount);
  }, []);

  const handleInputChange = useCallback((id: number, field: string, value: string) => {
    // Permitir coma, punto, guion y números
    if (field !== 'name' && field !== 'type') {
        if (!/^-?[\d.,]*$/.test(value)) return;
    }
    setWells(prev => prev.map(well => {
        if (well.id !== id) return well;
        let updates: any = { [field]: value };
        if (field === 'type' && value === 'Observación') {
            updates.flow = 0;
        }
        return { ...well, ...updates };
    }));
  }, []);

  const handleNumWellsChange = (e: any) => setNumWellsInput(parseInt(e.target.value) || 0);

  const applyNumWells = useCallback(() => {
    if (numWellsInput <= 0) return;
    setWells(prev => {
        if (numWellsInput > prev.length) {
            const added = Array.from({ length: numWellsInput - prev.length }, (_, i) => ({
                id: prev.length + i + 1, name: `Pozo-${prev.length + i + 1}`, type: 'Bombeo',
                easting: formatLocal(0, 0), northing: formatLocal(0, 0), 
                elevation: formatLocal(0, 2), bedrock_elevation: formatLocal(0, 2),
                k_value: formatLocal(0, 2), depth: formatLocal(0, 2), 
                flow: formatLocal(0, 2), pumping_hours: formatLocal(0, 2), 
                static_level: formatLocal(0, 2), dynamic_level: formatLocal(0, 2),
            }));
            return [...prev, ...added];
        }
        return prev.slice(0, numWellsInput);
    });
  }, [numWellsInput]);

  const handlePaste = useCallback((e: any, startWellId: number, startField: string) => {
    e.preventDefault();
    const clipboardData = e.clipboardData.getData('text');
    const rows = clipboardData.split(/\r\n|\n|\r/).filter((row: string) => row.trim() !== '');
    
    setWells(currentWells => {
        const startWellIndex = currentWells.findIndex(w => w.id === startWellId);
        const startFieldIndex = FIELD_ORDER.indexOf(startField);
        if (startWellIndex === -1 || startFieldIndex === -1) return currentWells;

        const newWells = [...currentWells];
        let updated = false;

        rows.forEach((row: string, rIndex: number) => {
            const targetFieldIndex = startFieldIndex + rIndex;
            if (targetFieldIndex >= FIELD_ORDER.length) return;
            const targetField = FIELD_ORDER[targetFieldIndex];
            const values = row.split('\t');

            values.forEach((val: string, cIndex: number) => {
                const targetWellIndex = startWellIndex + cIndex;
                if (targetWellIndex >= newWells.length) return;
                
                let cleanVal = val.trim().replace(/^"|"$/g, '');
                // Verificar si es numérico con lógica robusta
                const checkNum = parseLocal(cleanVal);
                
                if (targetField !== 'name' && targetField !== 'type' && cleanVal !== '') {
                    if (!isNaN(checkNum)) {
                       // Mantenemos el valor original limpiado
                    } else {
                       cleanVal = '';
                    }
                }
                if (cleanVal !== '') {
                    newWells[targetWellIndex] = { ...newWells[targetWellIndex], [targetField]: cleanVal };
                    updated = true;
                }
            });
        });
        return updated ? newWells : currentWells;
    });
  }, []);

  const autoCalibrateK = useCallback(() => {
    setIsCalibrating(true);
    let currentWells = [...wells];
    const MAX_ITERATIONS = 10;
    const TARGET_ERROR = 0.02; // 2% NRMSE

    let numericWells = currentWells.map(w => ({
        ...w,
        k_val_num: parseLocal(w.k_value),
        flow_num: parseLocal(w.flow),
        easting_num: parseLocal(w.easting),
        northing_num: parseLocal(w.northing),
        static_level_num: parseLocal(w.static_level),
        dynamic_level_num: parseLocal(w.dynamic_level),
        bedrock_elevation_num: parseLocal(w.bedrock_elevation),
        depth_num: parseLocal(w.depth),
        pumping_hours_num: parseLocal(w.pumping_hours),
        T_m2s: 0,
        R: 0
    }));

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        // 1. Calculate Hydraulics & Radius for all wells with current K
        numericWells.forEach(w => {
            const h_static = Math.max(0, w.depth_num - w.static_level_num);
            const T_m2d = w.k_val_num * h_static;
            w.T_m2s = T_m2d / SECONDS_IN_DAY;
            const K_ms = w.k_val_num / SECONDS_IN_DAY;
            const s_obs = w.dynamic_level_num - w.static_level_num;
            w.R = (s_obs > 0 && K_ms > 0) ? 3000 * s_obs * Math.sqrt(K_ms) : 0;
        });

        // 2. Calculate Residuals for OBSERVATION WELLS & Aggregate Error for Pumping Wells
        const pumpWellAdjustments: any = {}; // Map pump ID -> { totalWeight: 0, weightedError: 0 }
        
        let sumSqError = 0;
        let countObs = 0;
        let sumObs = 0;

        numericWells.forEach(target => {
            if (target.type !== 'Observación' || target.dynamic_level_num <= 0) return;

            let s_total_calc = 0;
            numericWells.forEach(source => {
                 if (source.type === 'Observación') return;
                 const Q_m3s = source.flow_num / 1000;
                 if (Q_m3s <= 0 || source.T_m2s <= 0) return;

                 const dx = target.easting_num - source.easting_num;
                 const dy = target.northing_num - source.northing_num;
                 let r = Math.sqrt(dx*dx + dy*dy);
                 if (r < WELL_RADIUS_THEORETICAL) r = WELL_RADIUS_THEORETICAL;
                 
                 if (r <= source.R) {
                     const term = (Q_m3s / (2 * Math.PI * source.T_m2s)) * Math.log(source.R / r);
                     s_total_calc += term;
                 }
            });

            const nd_calc_depth = target.static_level_num + s_total_calc;
            const nd_obs_depth = target.dynamic_level_num;
            
            const residual = nd_obs_depth - nd_calc_depth;
            const errorRatio = residual / (nd_obs_depth || 1); 

            // Track RMSE stats
            sumSqError += residual * residual;
            sumObs += nd_obs_depth;
            countObs++;
            
            // Distribute error to sources
            numericWells.forEach(source => {
                if (source.type === 'Observación') return;
                const dx = target.easting_num - source.easting_num;
                const dy = target.northing_num - source.northing_num;
                let r = Math.sqrt(dx*dx + dy*dy);
                
                // Only consider if source *could* affect target (within reasonable range, even if R is currently small)
                // Using current R for weighting check
                if (r <= source.R || r < 2000) { // Fallback distance if R is small initially
                     if (!pumpWellAdjustments[source.id]) pumpWellAdjustments[source.id] = { totalWeight: 0, weightedError: 0 };
                     const weight = 1 / (r*r + 1);
                     pumpWellAdjustments[source.id].weightedError += errorRatio * weight;
                     pumpWellAdjustments[source.id].totalWeight += weight;
                }
            });
        });
        
        // Check Convergence (NRMSE)
        if (countObs > 0) {
            const rmse = Math.sqrt(sumSqError / countObs);
            const meanObs = sumObs / countObs;
            const nrmse = meanObs !== 0 ? rmse / meanObs : 0;
            if (nrmse < TARGET_ERROR) break;
        }

        // 3. Apply Adjustments
        let anyChange = false;
        numericWells.forEach(w => {
            if (w.type === 'Bombeo' && pumpWellAdjustments[w.id]) {
                const adj = pumpWellAdjustments[w.id];
                if (adj.totalWeight > 0) {
                    const avgError = adj.weightedError / adj.totalWeight;
                    // Error > 0 means Obs > Calc (Underestimating Drawdown) -> Need smaller K
                    // Factor = 1 - (Error * Gain)
                    // Gain 0.1 for stability
                    const gain = 0.1; 
                    let factor = 1 - (avgError * gain); 
                    
                    // Limit step size
                    factor = Math.max(0.9, Math.min(1.1, factor));
                    
                    const oldK = w.k_val_num;
                    w.k_val_num = oldK * factor;
                    
                    // Safety bounds
                    if (w.k_val_num < 0.01) w.k_val_num = 0.01;
                    if (w.k_val_num > 10000) w.k_val_num = 10000;

                    if (Math.abs(oldK - w.k_val_num) > 0.0001) anyChange = true;
                }
            }
        });
        
        if (!anyChange) break;
    }

    const finalWells = currentWells.map((w, i) => {
         const numW = numericWells.find(nw => nw.id === w.id);
         return { ...w, k_value: formatLocal(numW?.k_val_num) };
    });
    
    setWells(finalWells);
    setTimeout(() => setIsCalibrating(false), 500); 
  }, [wells]);

  const processedData = useMemo(() => {
    const baseData = wells.map(calcHydraulics);
    const matrix = baseData.map(target => {
        const influences = baseData.map(source => getDrawdownInterference(target, source));
        const total = influences.reduce((acc, val) => acc + val, 0);
        return { targetName: target.name, influences, total };
    });
    const finalWells = baseData.map((well, idx) => {
        const total_drawdown = matrix[idx].total;
        const max_dynamic_level_msnm = well.static_elev_val - total_drawdown;
        const max_dynamic_level_depth = parseLocal(well.elevation) - max_dynamic_level_msnm;
        
        // Add numeric properties for MSE calculation
        const max_dynamic_level_depth_num = max_dynamic_level_depth;

        return {
            ...well,
            total_drawdown_matrix: total_drawdown,
            max_dynamic_level: formatLocal(max_dynamic_level_msnm),
            max_dynamic_level_depth: formatLocal(max_dynamic_level_depth),
            max_dynamic_level_depth_num
        };
    });
    return { wells: finalWells, matrix };
  }, [wells]);

  const chartDomains = useMemo(() => {
    if (processedData.wells.length === 0) return { x: [0, 100], y: [0, 100], fit: [0, 100] };
    
    // Fit Chart Domains (Observed vs Simulated)
    // Find min and max for both axes to create a square domain
    let minVal = Infinity, maxVal = -Infinity;
    processedData.wells.forEach(w => {
       if (w.type === 'Observación' && parseLocal(w.dynamic_level) > 0) {
           const obs = parseLocal(w.dynamic_level);
           const sim = w.max_dynamic_level_depth_num;
           minVal = Math.min(minVal, obs, sim);
           maxVal = Math.max(maxVal, obs, sim);
       }
    });
    
    // Default range if no data
    if (minVal === Infinity) { minVal = 0; maxVal = 10; }
    
    // Add padding
    const padding = (maxVal - minVal) * 0.1 || 1;
    const fitDomain = [Math.max(0, minVal - padding), maxVal + padding];

    // Spatial Chart Domains
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    processedData.wells.forEach(well => {
        if (well.easting < minX) minX = well.easting;
        if (well.easting > maxX) maxX = well.easting;
        if (well.northing < minY) minY = well.northing;
        if (well.northing > maxY) maxY = well.northing;
    });
    if (minX === Infinity) return { x: [0, 100], y: [0, 100], fit: fitDomain };
    let spanX = maxX - minX; let spanY = maxY - minY;
    if (spanX === 0) spanX = 100; if (spanY === 0) spanY = 100;
    const spatialPaddingX = spanX * 0.05; const spatialPaddingY = spanY * 0.05;
    
    return {
        x: [Math.floor(minX - spatialPaddingX), Math.ceil(maxX + spatialPaddingX)],
        y: [Math.floor(minY - spatialPaddingY), Math.ceil(maxY + spatialPaddingY)],
        fit: fitDomain
    };
  }, [processedData.wells]);
  
  const mse = useMemo(() => {
    let sum = 0;
    let count = 0;
    processedData.wells.forEach(w => {
       // Using dynamic_level as Observed Depth
       const obs = parseLocal(w.dynamic_level);
       const sim = w.max_dynamic_level_depth_num;
       if (w.type === 'Observación' && obs > 0) { 
           sum += Math.pow(obs - sim, 2);
           count++;
       }
    });
    return count > 0 ? sum / count : 0;
  }, [processedData.wells]);

  if (isReportMode) return <ReportView processedData={processedData} chartDomains={chartDomains} onClose={() => setIsReportMode(false)} />;

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800">
      <header className="bg-white text-slate-900 px-6 py-4 shadow-sm border-b border-slate-200 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg shadow-sm">
                <Droplets className="text-white" size={24} />
            </div>
            <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">Calculo de Interferencia de Pozos</h1>
                <p className="text-xs text-slate-500 font-medium">Análisis Hidrogeológico & Modelado</p>
            </div>
        </div>
        <div className="flex items-center gap-4">
            <button onClick={() => setIsReportMode(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all shadow-sm hover:shadow-md">
                <FileText size={18} />
                <span>Generar Reporte</span>
            </button>
            <div className="text-xs text-slate-400 hidden md:block border-l border-slate-200 pl-4">v4.3.1-mcc-2026</div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <section className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex flex-wrap items-end gap-6 justify-between">
            <div className="flex gap-4 items-end">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cantidad de Pozos</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="number" 
                            min="1" 
                            value={numWellsInput} 
                            onChange={handleNumWellsChange} 
                            className="px-4 py-2 border border-slate-300 rounded-lg outline-none w-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium text-slate-700" 
                        />
                        <button onClick={applyNumWells} className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 border border-blue-200">
                            <Activity size={16} /> Actualizar
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 px-4 py-3 rounded-lg border border-slate-200">
                <div className="bg-blue-100 p-1.5 rounded-full text-blue-600">
                    <Clipboard size={14} />
                </div>
                <span><strong>Formato Regional:</strong> Decimal ({DECIMAL_SEPARATOR}) | Miles ({THOUSANDS_SEPARATOR})</span>
            </div>
          </div>
        </section>

        <div className="flex mb-6 overflow-x-auto pb-1 gap-2">
            {[
                { id: 'input', label: 'Datos de Entrada', icon: Calculator },
                { id: 'calibration', label: 'Calibración K', icon: Sliders },
                { id: 'fit', label: 'Gráfico de Ajuste', icon: TrendingUp },
                { id: 'matrix', label: 'Matriz Influencia', icon: Grid },
                { id: 'visualization', label: 'Visualización', icon: Map },
                { id: 'heatmap', label: 'Nivel Dinámico', icon: Waves },
            ].map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)} 
                    className={`px-4 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-all whitespace-nowrap ${
                        activeTab === tab.id 
                        ? 'bg-slate-900 text-white shadow-md' 
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 hover:border-slate-300'
                    }`}
                >
                    <tab.icon size={16} className={activeTab === tab.id ? 'text-blue-400' : 'text-slate-400'} /> 
                    {tab.label}
                </button>
            ))}
        </div>

        {activeTab === 'input' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wider">
                  <tr><th className="px-6 py-4 sticky left-0 bg-slate-50 z-20 border-r border-b border-slate-200 min-w-[200px] text-right">Parámetro / Pozo</th>{processedData.wells.map((well, index) => <th key={well.id} className="px-4 py-4 border-b border-slate-200 text-center min-w-[140px] text-slate-700">#{index + 1}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ROW_CONFIGS.map((config) => (
                    <tr key={config.key} className="hover:bg-slate-50/80 transition-colors group">
                      <th className="px-6 py-3 sticky left-0 bg-white group-hover:bg-slate-50/80 z-10 border-r border-slate-200 text-right font-medium text-slate-600 text-xs uppercase tracking-wide flex items-center justify-end gap-2 h-full">
                          {config.label}
                      </th>
                      {processedData.wells.map((well) => (
                        <td key={`${well.id}-${config.key}`} className={`p-1 border-r border-slate-100 ${config.className || ''}`}>
                          {config.isCalc ? (
                            <div className="w-full px-3 py-2 text-center select-all font-mono text-sm">{well[config.key]}</div>
                          ) : config.key === 'type' ? (
                             <div className="flex justify-center">
                                 <select 
                                    className="px-3 py-1.5 text-center bg-white border border-slate-200 hover:border-blue-400 rounded-md outline-none text-xs font-medium text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer" 
                                    value={well.type} 
                                    onChange={(e) => handleInputChange(well.id, 'type', e.target.value)}
                                >
                                    {config.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                 </select>
                             </div>
                           ) : (
                            <input 
                              type={config.type} 
                              inputMode={config.type === 'text' && config.key !== 'name' ? "decimal" : undefined} 
                              value={well[config.key]} 
                              disabled={config.key === 'flow' && well.type === 'Observación'}
                              onChange={(e) => handleInputChange(well.id, config.key, e.target.value)} 
                              onPaste={(e) => handlePaste(e, well.id, config.key)} 
                              className={`w-full px-3 py-2 text-center bg-transparent border border-transparent hover:border-blue-300 focus:border-blue-500 focus:bg-white rounded outline-none transition-all font-mono text-sm
                                ${config.key === 'name' ? 'font-bold text-blue-700 font-sans' : 'text-slate-700'} 
                                ${config.key === 'flow' && well.type === 'Observación' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''} 
                                ${well.isSimulated && config.key === 'dynamic_level' ? 'text-amber-600 font-bold bg-amber-50/50' : ''}
                              `} 
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 text-xs text-slate-500 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
                <Info size={14} className="text-blue-500" />
                <span>Nota: Si deja el Nivel Dinámico en 0 (o igual al estático) y tiene caudal, el sistema calculará un valor teórico (Simulación).</span>
            </div>
          </div>
        )}

        {activeTab === 'calibration' && (
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="p-5 bg-slate-50 border-b border-slate-200 text-slate-700 text-sm flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="max-w-2xl">
                    <h3 className="font-bold text-slate-800 mb-1">Módulo de Calibración Automática</h3>
                    <p className="text-slate-500 text-xs leading-relaxed">Ajuste iterativo de la Conductividad Hidráulica (K) para minimizar el error entre niveles observados y calculados.</p>
                </div>
                
                <div className="flex items-center gap-6 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div className="text-right border-r border-slate-100 pr-6">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Error Cuadrático Medio</span>
                        <span className="font-mono text-xl font-black text-blue-600">{formatLocal(mse, 4)} <span className="text-xs text-slate-400 font-normal">m²</span></span>
                    </div>
                    <button onClick={autoCalibrateK} disabled={isCalibrating} className={`px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-sm ${isCalibrating ? 'bg-slate-100 text-slate-400 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md'}`}>
                        <RefreshCw size={18} className={isCalibrating ? 'animate-spin' : ''} />
                        {isCalibrating ? 'Calibrando...' : 'Auto-Calibrar K'}
                    </button>
                </div>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left border-collapse">
                 <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wider">
                   <tr>
                     <th className="px-6 py-4 sticky left-0 bg-slate-50 z-20 border-r border-b border-slate-200 text-left">Pozo</th>
                     <th className="px-4 py-4 border-b border-slate-200 text-center bg-blue-50/50 border-r border-blue-100 text-blue-900">K (m/d) <span className="font-normal text-[10px] block text-blue-400 mt-0.5">Editable</span></th>
                     <th className="px-4 py-4 border-b border-slate-200 text-center bg-emerald-50/50 border-r border-emerald-100 text-emerald-900">Caudal (l/s) <span className="font-normal text-[10px] block text-emerald-400 mt-0.5">Editable</span></th>
                     <th className="px-4 py-4 border-b border-slate-200 text-center bg-blue-50/50 border-r border-slate-200 text-blue-900">N.D. In Situ <span className="font-normal text-[10px] block text-blue-400 mt-0.5">Editable (m Prof.)</span></th>
                     <th className="px-4 py-4 border-b border-slate-200 text-center border-r border-slate-200 bg-slate-50 text-slate-600">N.D. Calc <span className="font-normal text-[10px] block text-slate-400 mt-0.5">(m Prof.)</span></th>
                     <th className="px-4 py-4 border-b border-slate-200 text-center border-r border-slate-200 text-slate-400">N.D. Max Calc <span className="font-normal text-[10px] block mt-0.5">(msnm)</span></th>
                     <th className="px-4 py-4 border-b border-slate-200 text-center">Residual <span className="font-normal text-[10px] block text-slate-400 mt-0.5">Obs - Calc</span></th>
                     <th className="px-4 py-4 border-b border-slate-200 text-center">% Error <span className="font-normal text-[10px] block text-slate-400 mt-0.5">Relativo</span></th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {processedData.wells.map((well, idx) => {
                     const nd_insitu_prof = parseLocal(well.dynamic_level);
                     const nd_max_cota = parseLocal(well.max_dynamic_level);
                     const elevation = parseLocal(well.elevation);
                     const nd_calc_prof = elevation - nd_max_cota;
                     
                     const residual = nd_insitu_prof - nd_calc_prof;
                     const absResidual = Math.abs(residual);
                     const isGoodFit = absResidual < 1.0;
                     const percentError = nd_insitu_prof !== 0 ? (residual / nd_insitu_prof) * 100 : 0;
                     const absPercentError = Math.abs(percentError);
                     const isGoodPercent = absPercentError < 3.0;

                     return (
                       <tr key={well.id} className="hover:bg-slate-50 transition-colors">
                         <td className="px-6 py-3 sticky left-0 bg-white z-10 border-r border-slate-200 font-bold text-slate-700 flex items-center gap-2 h-full">
                             {well.name}
                             <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded-full font-bold tracking-wide ${well.type === 'Observación' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{well.type === 'Observación' ? 'Obs' : 'Bomb'}</span>
                         </td>
                         <td className="p-0 border-r border-blue-100 bg-blue-50/30"><input type="text" inputMode="decimal" value={well.k_value} onChange={(e) => handleInputChange(well.id, 'k_value', e.target.value)} className="w-full h-full px-4 py-3 text-center bg-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-blue-800 font-bold transition-colors" /></td>
                         <td className="p-0 border-r border-emerald-100 bg-emerald-50/30"><input type="text" inputMode="decimal" value={well.flow} disabled={well.type === 'Observación'} onChange={(e) => handleInputChange(well.id, 'flow', e.target.value)} className={`w-full h-full px-4 py-3 text-center bg-transparent focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-emerald-800 font-bold transition-colors ${well.type === 'Observación' ? 'cursor-not-allowed opacity-50' : ''}`} /></td>
                         <td className="p-0 border-r border-blue-100 bg-blue-50/30"><input type="text" inputMode="decimal" value={well.dynamic_level} onChange={(e) => handleInputChange(well.id, 'dynamic_level', e.target.value)} className="w-full h-full px-4 py-3 text-center bg-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-slate-700 font-medium transition-colors" /></td>
                         <td className="px-4 py-3 text-center border-r border-slate-100 font-mono font-bold text-slate-800 bg-slate-50">{isNaN(nd_calc_prof) ? formatLocal(0) : formatLocal(nd_calc_prof)}</td>
                         <td className="px-4 py-3 text-center border-r border-slate-100 font-mono text-slate-400 text-xs">{formatLocal(nd_max_cota)}</td>
                         <td className={`px-4 py-3 text-center font-bold font-mono ${well.type === 'Bombeo' ? 'text-slate-300' : (isGoodFit ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50')}`}>
                             {well.type === 'Bombeo' ? '-' : (isNaN(residual) ? formatLocal(0) : formatLocal(residual) + ' m')}
                         </td>
                         <td className={`px-4 py-3 text-center font-bold font-mono ${well.type === 'Bombeo' ? 'text-slate-300' : (isGoodPercent ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50')}`}>
                             {well.type === 'Bombeo' ? '-' : (isNaN(percentError) ? formatLocal(0, 1) : formatLocal(percentError, 1) + '%')}
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
           </div>
        )}

        {activeTab === 'fit' && (
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-220px)] min-h-[500px]">
             <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col">
               <h3 className="text-sm font-bold text-slate-700 mb-4 shrink-0 uppercase tracking-wide">Gráfico de Ajuste: Observado vs Calculado</h3>
               <div className="flex-1 w-full min-h-0 flex justify-center items-center bg-slate-50/50 rounded-lg border border-slate-100 p-4 overflow-hidden">
                 <div style={{ aspectRatio: '1 / 1', width: '100%', maxHeight: '100%' }} className="relative bg-white shadow-sm border border-slate-200 rounded-lg p-2 mx-auto flex-shrink-0 flex justify-center items-center">
                   <ResponsiveContainer width="100%" height="100%">
                     <ScatterChart margin={{ top: 30, right: 35, bottom: 50, left: 45 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                       <XAxis 
                         type="number" 
                         dataKey="obs" 
                         name="Nivel Dinámico Observado (m)" 
                         unit="m" 
                         domain={chartDomains.fit}
                         tickFormatter={(val) => formatLocal(val, 1)}
                         label={{ value: 'N.D. Observado (m)', position: 'bottom', offset: 15, style: { fill: '#64748b', fontSize: 12, fontWeight: 600 } }} 
                         tick={{ fill: '#64748b', fontSize: 11 }}
                         axisLine={{ stroke: '#cbd5e1' }}
                       />
                       <YAxis 
                         type="number" 
                         dataKey="sim" 
                         name="Nivel Dinámico Calculado (m)" 
                         unit="m" 
                         domain={chartDomains.fit}
                         tickFormatter={(val) => formatLocal(val, 1)}
                         label={{ value: 'N.D. Calculado (m)', angle: -90, position: 'insideLeft', offset: -10, style: { fill: '#64748b', fontSize: 12, fontWeight: 600 } }} 
                         tick={{ fill: '#64748b', fontSize: 11 }}
                         axisLine={{ stroke: '#cbd5e1' }}
                       />
                       <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                       <Legend verticalAlign="top" height={36} iconType="circle" />
                       
                       <Scatter 
                            name="Línea 1:1 (Ideal)" 
                            data={[{ obs: chartDomains.fit[0], sim: chartDomains.fit[0] }, { obs: chartDomains.fit[1], sim: chartDomains.fit[1] }]} 
                            line={{ stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '5 5' }} 
                            shape={() => null} 
                            legendType="line" 
                            isAnimationActive={false}
                       />

                       <Scatter 
                            name="Pozos de Observación" 
                            data={processedData.wells.filter(w => w.type === 'Observación' && parseLocal(w.dynamic_level) > 0).map(w => ({
                                ...w,
                                obs: parseLocal(w.dynamic_level),
                                sim: w.max_dynamic_level_depth_num,
                                obsVal: parseLocal(w.dynamic_level),
                                simVal: w.max_dynamic_level_depth_num
                            }))} 
                            fill="#3b82f6" 
                            fillOpacity={0.7}
                            shape="circle" 
                       />
                     </ScatterChart>
                   </ResponsiveContainer>
                 </div>
               </div>
             </div>
             
             <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 overflow-y-auto">
               <h3 className="text-lg font-black text-slate-800 mb-8 border-b border-slate-100 pb-4 uppercase tracking-wide flex items-center gap-2">
                   <TrendingUp className="text-blue-600" /> Métricas de Error
               </h3>
               
               <div className="space-y-8">
                   <div>
                       <p className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">Error Cuadrático Medio (ECM)</p>
                       <p className="text-4xl font-mono font-black text-slate-800 tracking-tight">{formatLocal(mse, 4)} <span className="text-base text-slate-400 font-normal">m²</span></p>
                   </div>
                   
                   <div>
                       <p className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">Raíz del Error Cuadrático Medio (RMSE)</p>
                       <p className="text-4xl font-mono font-black text-blue-600 tracking-tight">{formatLocal(Math.sqrt(mse), 4)} <span className="text-base text-slate-400 font-normal">m</span></p>
                   </div>

                   <div className="pt-8 border-t border-slate-100">
                       <p className="text-sm text-slate-500 leading-relaxed">
                           Visualización de la dispersión de los niveles calculados respecto a los observados. La línea roja discontinua representa el ajuste ideal (1:1). Los puntos cercanos a esta línea indican una calibración exitosa.
                       </p>
                   </div>
               </div>
             </div>
           </div>
        )}

        {activeTab === 'matrix' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="p-4 bg-blue-50 text-blue-800 text-sm border-b border-blue-100 flex items-center gap-2">
                 <Grid size={16} />
                 <strong>Matriz de Interferencia (Metros de Abatimiento):</strong> Fila = Pozo Observado, Columna = Pozo Bombeando.
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                   <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wider">
                      <tr><th className="px-6 py-4 sticky left-0 bg-slate-50 z-20 border-r border-b border-slate-200 min-w-[150px]">Obs. \ Bomb.</th>{processedData.wells.map((well) => <th key={well.id} className="px-4 py-4 border-b border-slate-200 text-center bg-blue-50/30 text-blue-900 border-r border-slate-200 min-w-[100px]">{well.name}</th>)}<th className="px-4 py-4 border-b border-slate-200 text-center bg-slate-100 text-slate-900 font-bold border-l-2 border-slate-300 min-w-[100px]">Total</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {processedData.matrix.map((row, i) => (
                         <tr key={i} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-3 sticky left-0 bg-white z-10 border-r border-slate-200 font-medium text-slate-700">{row.targetName}</td>{row.influences.map((val, j) => (<td key={j} className="px-4 py-3 text-center font-mono text-slate-600">{formatLocal(val)}</td>))}<td className="px-4 py-3 text-center font-bold font-mono bg-slate-50 text-red-600 border-l-2 border-slate-200">{formatLocal(row.total)}</td></tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        )}

        {activeTab === 'visualization' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[600px] flex flex-col">
              <div className="flex justify-between items-center mb-4 shrink-0"><h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Planta de Ubicación</h3></div>
              <div className="flex-1 min-h-0 border border-slate-200 rounded-lg bg-slate-50 overflow-hidden">
                  <ZoomableScatterChart processedData={processedData} initialDomain={chartDomains} />
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col h-[600px]">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wide shrink-0"><Info size={16} className="text-blue-500" /> Resumen Hidráulico</h3>
              <div className="space-y-4 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                {processedData.wells.map(well => (
                  <div key={well.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm hover:shadow-sm transition-shadow">
                    <div className="font-bold text-slate-800 mb-3 flex justify-between items-center border-b border-slate-200 pb-2">
                        <span>{well.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${well.type === 'Observación' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{well.type}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 text-slate-600 text-xs">
                      <span>Transmisividad (T):</span><span className="text-right font-mono font-medium">{well.transmissivity} m²/d</span>
                      <span>Transmisividad (SI):</span><span className="text-right font-mono font-medium">{well.transmissivity_m2s} m²/s</span>
                      <span className="text-indigo-600 font-bold">Radio Inf.:</span><span className="text-right font-mono font-bold text-indigo-600">{well.radius_influence} m</span>
                      <span className="text-red-600 font-bold border-t border-slate-200 pt-2 mt-1">N.D. Max (msnm):</span><span className="text-right font-mono font-bold text-red-600 border-t border-slate-200 pt-2 mt-1">{well.max_dynamic_level}</span>
                      <span className="text-red-800 font-bold">N.D. Max (m):</span><span className="text-right font-mono font-bold text-red-800">{well.max_dynamic_level_depth}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'heatmap' && (
          <div className="flex flex-col h-full bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex justify-between items-center">
                <span className="uppercase tracking-wide">Nivel Dinámico Máximo con Interacción entre Pozos</span>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">Método: IDW (Inverse Distance Weighting)</span>
            </h3>
            <div className="flex-1 relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50 shadow-inner">
              <ZoomableHeatmap wells={processedData.wells} initialDomain={chartDomains} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
