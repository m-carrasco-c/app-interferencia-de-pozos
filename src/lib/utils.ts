import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';

// --- 1. DETECCIÓN DE CONFIGURACIÓN REGIONAL ---

// Detecta automáticamente si el navegador/sistema usa punto o coma como separador decimal
export const getSystemDecimalSeparator = () => {
  const n = 1.1;
  return n.toLocaleString().substring(1, 2);
};

export const DECIMAL_SEPARATOR = getSystemDecimalSeparator();
export const THOUSANDS_SEPARATOR = DECIMAL_SEPARATOR === ',' ? '.' : ',';


// --- 2. CONSTANTES Y CONFIGURACIONES ---

export const WELL_RADIUS_THEORETICAL = 0.15;
export const SECONDS_IN_DAY = 86400;
export const SECONDS_IN_HOUR = 3600;

export const FIELD_ORDER = [
  'name', 'type', 'easting', 'northing', 
  'depth', 
  'elevation', 'bedrock_elevation',
  'k_value', 'flow', 'pumping_hours', 
  'static_level', 'dynamic_level'
];

export const ROW_CONFIGS = [
  { label: 'Nombre del Pozo', key: 'name', type: 'text', section: 'header' },
  { label: 'Tipo de Pozo', key: 'type', type: 'select', options: ['Bombeo', 'Observación'], section: 'header' },
  { label: 'Coord. Este (X)', key: 'easting', type: 'text', section: 'geo' },
  { label: 'Coord. Norte (Y)', key: 'northing', type: 'text', section: 'geo' },
  { label: 'Profundidad del pozo (m)', key: 'depth', type: 'text', section: 'geo' },
  { label: 'Cota Terreno (msnm)', key: 'elevation', type: 'text', section: 'geo', className: 'bg-amber-50/30' },
  { label: 'Cota Roca (msnm)', key: 'bedrock_elevation', type: 'text', section: 'geo', className: 'bg-amber-50/30' },
  { label: 'K (m/d)', key: 'k_value', type: 'text', section: 'hydro', className: 'bg-blue-50/30' },
  { label: 'Caudal (l/s)', key: 'flow', type: 'text', section: 'hydro', className: 'bg-green-50/30' },
  { label: 'Horas de bombeo (hrs)', key: 'pumping_hours', type: 'text', section: 'hydro', className: 'bg-green-50/10' },
  { label: 'N. Estático (m)', key: 'static_level', type: 'text', section: 'hydro' },
  { label: 'N. Dinámico (m)', key: 'dynamic_level', type: 'text', section: 'hydro' },
  { label: 'Prof. Roca (m)', key: 'rock_depth', isCalc: true, section: 'calc', className: 'bg-gray-50 text-slate-600' },
  { label: 'Cota N.E. (msnm)', key: 'static_elev', isCalc: true, section: 'calc', className: 'bg-gray-50 text-slate-600' },
  { label: 'Espesor Sat. (m)', key: 'saturated_thickness', isCalc: true, section: 'calc', className: 'bg-gray-100 font-bold text-blue-900' },
  { label: 'T (m²/s)', key: 'transmissivity_m2s', isCalc: true, section: 'calc', className: 'bg-gray-100 font-bold text-blue-900' },
  { label: 'Radio Inf. (m)', key: 'radius_influence', isCalc: true, section: 'calc', className: 'bg-indigo-50 font-bold text-indigo-900' },
  { label: 'Caudal Esp. (l/s/m)', key: 'specific_capacity', isCalc: true, section: 'calc', className: 'bg-gray-50 text-slate-600' },
  { label: 'Abatimiento (m)', key: 'drawdown', isCalc: true, section: 'calc', className: 'bg-gray-50 font-bold text-slate-700' },
  { label: 'Nivel Dinámico Max (msnm)', key: 'max_dynamic_level', isCalc: true, section: 'calc', className: 'bg-red-50 font-bold text-red-700 border-t-2 border-red-100' },
  { label: 'Nivel Dinámico Max (m)', key: 'max_dynamic_level_depth', isCalc: true, section: 'calc', className: 'bg-red-50 font-bold text-red-800 border-t border-red-200' },
];

// --- 3. UTILITARIOS MATEMÁTICOS ---

export const parseLocal = (val: any) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  
  let strVal = val.toString();
  
  // Limpiar separadores de miles y reemplazar coma por punto si aplica
  if (DECIMAL_SEPARATOR === ',') {
      strVal = strVal.replace(/\./g, ''); 
      strVal = strVal.replace(',', '.'); 
  } else {
      strVal = strVal.replace(/,/g, ''); 
  }

  const num = parseFloat(strVal);
  return (isNaN(num) || !isFinite(num)) ? 0 : num;
};

export const formatLocal = (val: any, decimals = 2) => {
  if (val === null || val === undefined || val === '' || isNaN(val)) {
     return (0).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  // Se usa 'undefined' para que tome automáticamente el idioma del sistema
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
};

export const safeFloat = (val: any) => parseLocal(val);

export const generateCirclePoints = (cx: number, cy: number, radius: number) => {
  if (!radius || radius <= 0) return [];
  const points = [];
  const steps = 60; 
  for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * 2 * Math.PI;
      points.push({
          easting: cx + radius * Math.cos(theta),
          northing: cy + radius * Math.sin(theta),
      });
  }
  return points;
};

// --- MOTOR HIDRÁULICO ---

export const calcHydraulics = (well: any) => {
  const k_val = parseLocal(well.k_value);
  const depth = parseLocal(well.depth);
  const static_lvl = parseLocal(well.static_level);
  const elev = parseLocal(well.elevation);
  const bedrock_elev = parseLocal(well.bedrock_elevation);
  let dynamic_lvl = parseLocal(well.dynamic_level);
  
  const flowVal = well.type === 'Observación' ? 0 : parseLocal(well.flow);

  const saturated_thickness = Math.max(0, (elev - static_lvl) - bedrock_elev);
  const isSimulationMode = flowVal > 0 && (dynamic_lvl <= static_lvl || dynamic_lvl === 0);
  
  let drawdown = 0;
  let T_m2d = 0;
  let R = 0;

  const h_static = Math.max(0, depth - static_lvl);
  T_m2d = k_val * h_static; 
  if (isNaN(T_m2d) || !isFinite(T_m2d)) T_m2d = 0;
  const T_m2s = T_m2d / SECONDS_IN_DAY;
  const K_ms = k_val / SECONDS_IN_DAY;

  if (isSimulationMode) {
      const Q_m3s = flowVal / 1000;
      let s_guess = 1.0; 
      for(let i=0; i<10; i++) {
          if (s_guess <= 0) s_guess = 0.1;
          const R_guess = 3000 * s_guess * Math.sqrt(K_ms);
          if (R_guess <= WELL_RADIUS_THEORETICAL) { s_guess = 0; break; }
          const s_calc = (Q_m3s / (2 * Math.PI * T_m2s)) * Math.log(R_guess / WELL_RADIUS_THEORETICAL);
          if (Math.abs(s_calc - s_guess) < 0.01) { s_guess = s_calc; break; }
          s_guess = s_calc;
      }
      drawdown = s_guess;
      dynamic_lvl = static_lvl + drawdown; 
  } else {
      drawdown = Math.max(0, dynamic_lvl - static_lvl);
  }

  if (drawdown > 0 && K_ms > 0) {
    R = 3000 * drawdown * Math.sqrt(K_ms);
  }
  if (isNaN(R) || !isFinite(R)) R = 0;

  // CORRECCIÓN BUG: El chequeo lógico original era incorrecto por el uso de "!" con estricta igualdad.
  const specific_capacity = (well.type !== 'Observación' && drawdown > 0) ? flowVal / drawdown : 0;
  const static_elev_val = elev - static_lvl;

  return {
    ...well, 
    _vals: { k_val, elev, static_lvl, dynamic_lvl, flow: flowVal, depth, saturated_thickness, drawdown, T_m2s, K_ms, R, static_elev_val, isObservation: well.type === 'Observación' },
    
    static_elev_val, 
    transmissivity_m2s_val: T_m2s,
    radius_influence_val: R,
    drawdown: formatLocal(drawdown),
    easting: parseLocal(well.easting),
    northing: parseLocal(well.northing),
    rock_depth: formatLocal(elev - bedrock_elev),
    static_elev: formatLocal(static_elev_val),
    saturated_thickness: formatLocal(saturated_thickness),
    specific_capacity: formatLocal(specific_capacity),
    transmissivity: formatLocal(T_m2d, 1),
    transmissivity_m2s: T_m2s.toExponential(2).replace('.', DECIMAL_SEPARATOR), // Se adapta localmente
    radius_influence: formatLocal(R, 1),
    isSimulated: isSimulationMode
  };
};

export const getDrawdownInterference = (targetWell: any, sourceWell: any) => {
  const { _vals: sVals } = sourceWell;
  const { easting: tx, northing: ty } = targetWell;
  const { easting: sx, northing: sy } = sourceWell;

  if (sVals.isObservation) return 0; 

  const Q_m3s = sVals.flow / 1000;
  const T_m2s = sVals.T_m2s;
  const R = sVals.R;

  if (Q_m3s <= 0 || T_m2s <= 0) return 0;

  const dx = tx - sx;
  const dy = ty - sy;
  let dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > R && R > 0) return 0;
  if (dist === 0) dist = WELL_RADIUS_THEORETICAL;

  try {
    const term_factor = Q_m3s / (2 * Math.PI * T_m2s);
    const term_log = Math.log(R / dist);
    const s = term_factor * term_log;
    return (s > 0 && isFinite(s)) ? s : 0;
  } catch {
    return 0;
  }
};

export const idwInterpolation = (x: number, y: number, points: any[], power = 2) => {
  let numerator = 0, denominator = 0;
  for (let i = 0; i < points.length; i++) {
    const d = Math.sqrt(Math.pow(x - points[i].x, 2) + Math.pow(y - points[i].y, 2));
    if (d === 0) return points[i].v;
    const w = 1 / Math.pow(d, power);
    numerator += w * points[i].v;
    denominator += w;
  }
  return denominator !== 0 ? numerator / denominator : 0;
};

export const getColorForValue = (value: number, min: number, max: number) => {
  if (isNaN(value) || isNaN(min) || isNaN(max)) return 'rgb(200,200,200)';
  if (min === max) return 'rgb(0, 0, 255)';
  let ratio = (value - min) / (max - min);
  ratio = Math.max(0, Math.min(1, ratio));
  const r = Math.floor(255 * (1 - ratio));
  const g = Math.floor(255 * ratio * 0.5);
  const b = Math.floor(255 * ratio);
  return `rgb(${r},${g},${b})`;
};
