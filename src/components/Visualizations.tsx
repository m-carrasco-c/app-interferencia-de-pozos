import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { Move, ZoomIn } from 'lucide-react';
import { useZoomPan } from '../hooks/useZoomPan';
import { formatLocal, parseLocal, safeFloat, idwInterpolation, getColorForValue, generateCirclePoints } from '../lib/utils';

export const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (!data.name) return null;
    const isObs = data.type === 'Observación';
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-md text-sm z-50">
        <p className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-1 flex justify-between">
            <span>{data.name}</span>
            {data.type && <span className={`text-[10px] px-1 rounded ${isObs ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{isObs ? 'Obs.' : 'Bomb.'}</span>}
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="font-semibold">Este (X):</span><span className="font-mono text-right">{formatLocal(data.easting, 0)} m</span>
          <span className="font-semibold">Norte (Y):</span><span className="font-mono text-right">{formatLocal(data.northing, 0)} m</span>
          {!isObs && data.radius_influence > 0 && <><span className="font-semibold text-indigo-600">Radio Inf.:</span><span className="font-mono text-right text-indigo-600">{data.radius_influence} m</span></>}
          {data.max_dynamic_level && <><span className="font-semibold text-red-600">N.D. Max:</span><span className="font-mono text-right text-red-600">{data.max_dynamic_level} msnm</span></>}
          {data.isSimulated && <div className="col-span-2 text-center text-[10px] text-amber-600 mt-1 italic font-bold">Nivel Simulado</div>}
          {data.obsVal !== undefined && <div className="col-span-2 border-t pt-1 mt-1 flex justify-between font-bold text-slate-800"><span>Obs: {formatLocal(data.obsVal)}</span> <span>Sim: {formatLocal(data.simVal)}</span></div>}
        </div>
      </div>
    );
  }
  return null;
};

export const renderHeatmapFrame = (ctx: any, width: number, height: number, domain: any, dataPoints: any[], margin: any) => {
  ctx.clearRect(0, 0, width, height);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  if (plotWidth <= 0 || plotHeight <= 0) return;

  const resolution = 5;
  const cols = Math.ceil(plotWidth / resolution);
  const rows = Math.ceil(plotHeight / resolution);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const px = i * resolution;
      const py = j * resolution;
      const worldX = domain.minX + (px / plotWidth) * domain.spanX;
      const worldY = domain.maxY - (py / plotHeight) * domain.spanY;
      const val = idwInterpolation(worldX, worldY, dataPoints);
      ctx.fillStyle = getColorForValue(val, domain.minV, domain.maxV);
      ctx.fillRect(margin.left + px, margin.top + py, resolution, resolution);
    }
  }

  ctx.setLineDash([5, 5]); ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 1.5;
  dataPoints.forEach((p: any) => {
    if (p.r > 0) {
      const cx = margin.left + ((p.x - domain.minX) / domain.spanX) * plotWidth;
      const cy = margin.top + ((domain.maxY - p.y) / domain.spanY) * plotHeight;
      const rx = p.r * (plotWidth / domain.spanX);
      const ry = p.r * (plotHeight / domain.spanY);
      if (cx + rx > 0 && cx - rx < width && cy + ry > 0 && cy - ry < height) {
        ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI); ctx.stroke();
      }
    }
  });
  ctx.setLineDash([]);

  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  ctx.beginPath(); ctx.moveTo(margin.left, margin.top + plotHeight); ctx.lineTo(margin.left + plotWidth, margin.top + plotHeight); ctx.stroke();
  for (let i = 0; i <= 5; i++) {
    const pct = i / 5; const xPos = margin.left + (plotWidth * pct); const val = domain.minX + (domain.spanX * pct);
    ctx.beginPath(); ctx.moveTo(xPos, margin.top + plotHeight); ctx.lineTo(xPos, margin.top + plotHeight + 5); ctx.stroke(); ctx.fillText(formatLocal(val, 0), xPos, margin.top + plotHeight + 15);
  }
  ctx.font = 'bold 11px sans-serif'; ctx.fillText("Este (X) [m]", margin.left + plotWidth / 2, height - 5);

  ctx.beginPath(); ctx.moveTo(margin.left, margin.top); ctx.lineTo(margin.left, margin.top + plotHeight); ctx.stroke();
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const pct = i / 5; const yPos = margin.top + plotHeight - (plotHeight * pct); const val = domain.minY + (domain.spanY * pct);
    ctx.beginPath(); ctx.moveTo(margin.left, yPos); ctx.lineTo(margin.left - 5, yPos); ctx.stroke(); ctx.fillText(formatLocal(val, 0), margin.left - 8, yPos + 3);
  }
  ctx.save(); ctx.translate(15, margin.top + plotHeight / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.font = 'bold 11px sans-serif'; ctx.fillText("Norte (Y) [m]", 0, 0); ctx.restore();

  dataPoints.forEach((p: any) => {
    const cx = margin.left + ((p.x - domain.minX) / domain.spanX) * plotWidth;
    const cy = margin.top + ((domain.maxY - p.y) / domain.spanY) * plotHeight;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 2 * Math.PI); ctx.fillStyle = 'white'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'black'; ctx.stroke();
    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = "white"; ctx.shadowBlur = 4; ctx.fillText(p.name, cx, cy - 10); ctx.shadowBlur = 0;
  });
};

export const useHeatmapData = (wells: any[]) => {
  const dataPoints = useMemo(() => {
    return wells.filter(w => {
      const val = parseLocal(w.max_dynamic_level);
      return !isNaN(val);
    }).map(w => ({
      ...w,
      x: safeFloat(w.easting),
      y: safeFloat(w.northing),
      v: parseLocal(w.max_dynamic_level),
      r: parseLocal(w.radius_influence_val) || 0,
      flow: parseLocal(w.flow) // CORRECCIÓN BUG: El caudal se debe parsear a número para el tooltip nativo
    }));
  }, [wells]);

  const domain = useMemo(() => {
    if (dataPoints.length === 0) return { minX: 0, maxX: 100, minY: 0, maxY: 100, minV: 0, maxV: 0, spanX: 100, spanY: 100 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let minV = Infinity, maxV = -Infinity;
    dataPoints.forEach(p => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.v < minV) minV = p.v; if (p.v > maxV) maxV = p.v;
    });
    if (minX === Infinity) return { minX: 0, maxX: 100, minY: 0, maxY: 100, minV: 0, maxV: 0, spanX: 100, spanY: 100 };
    const padX = (maxX - minX) * 0.05 || 50;
    const padY = (maxY - minY) * 0.05 || 50;
    return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY, minV, maxV, spanX: (maxX + padX) - (minX - padX), spanY: (maxY + padY) - (minY - padY) };
  }, [dataPoints]);

  return { dataPoints, domain };
};

export const HeatmapCanvas = ({ wells }: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { dataPoints, domain } = useHeatmapData(wells);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !domain || !canvas.parentElement) return;
    const { clientWidth, clientHeight } = canvas.parentElement;
    if (clientWidth === 0 || clientHeight === 0) return;
    canvas.width = clientWidth; canvas.height = clientHeight;
    const ctx = canvas.getContext('2d');
    renderHeatmapFrame(ctx, clientWidth, clientHeight, domain, dataPoints, { top: 30, right: 30, bottom: 40, left: 60 });
  }, [domain, dataPoints]);

  if (!domain) return <div className="flex items-center justify-center h-full text-slate-400">Datos insuficientes.</div>;
  return (
    <div className="relative w-full h-full bg-slate-100 rounded overflow-hidden print:border print:border-slate-300">
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute top-4 right-4 bg-white/90 p-2 rounded shadow border border-slate-200 text-xs z-10 print:hidden">
        <div className="flex justify-between mb-1 font-bold text-slate-700"><span>{formatLocal(domain.minV)} m</span><span>{formatLocal(domain.maxV)} m</span></div>
        <div className="h-3 w-48 rounded-full" style={{ background: 'linear-gradient(to right, rgb(255,0,0), rgb(128,0,128), rgb(0,0,255))' }}></div>
      </div>
    </div>
  );
};

export const ZoomableHeatmap = ({ wells, initialDomain }: any) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverInfo, setHoverInfo] = useState<any>(null);
  const { domain: zoomDomain, isDragging, handleWheel, handleMouseDown, handleMouseMove, handleMouseUp } = useZoomPan(initialDomain);
  const { dataPoints, domain: baseDomain } = useHeatmapData(wells);
  const MARGIN = { top: 30, right: 30, bottom: 40, left: 60 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseDomain || !canvas.parentElement) return;
    const { clientWidth, clientHeight } = canvas.parentElement;
    if (clientWidth === 0 || clientHeight === 0) return;
    canvas.width = clientWidth; canvas.height = clientHeight;
    const ctx = canvas.getContext('2d');

    const viewDomain = {
        ...baseDomain,
        minX: zoomDomain.x[0], maxX: zoomDomain.x[1], spanX: zoomDomain.x[1] - zoomDomain.x[0],
        minY: zoomDomain.y[0], maxY: zoomDomain.y[1], spanY: zoomDomain.y[1] - zoomDomain.y[0]
    };
    renderHeatmapFrame(ctx, clientWidth, clientHeight, viewDomain, dataPoints, MARGIN);
  }, [baseDomain, dataPoints, zoomDomain]);

  const onMouseMoveCanvas = (e: any) => {
    if (!containerRef.current || !baseDomain) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    handleMouseMove(e, width, height);
    if (isDragging) { setHoverInfo(null); return; }
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = height - MARGIN.top - MARGIN.bottom;

    if (mouseX < MARGIN.left || mouseX > MARGIN.left + plotWidth || mouseY < MARGIN.top || mouseY > MARGIN.top + plotHeight) { setHoverInfo(null); return; }
    
    const spanX = zoomDomain.x[1] - zoomDomain.x[0];
    const spanY = zoomDomain.y[1] - zoomDomain.y[0];
    const worldX = zoomDomain.x[0] + ((mouseX - MARGIN.left) / plotWidth) * spanX;
    const worldY = zoomDomain.y[1] - ((mouseY - MARGIN.top) / plotHeight) * spanY;

    let hoveredWell = null;
    for (const p of dataPoints) {
        const cx = MARGIN.left + ((p.x - zoomDomain.x[0]) / spanX) * plotWidth;
        const cy = MARGIN.top + ((zoomDomain.y[1] - p.y) / spanY) * plotHeight;
        if (Math.sqrt(Math.pow(mouseX - cx, 2) + Math.pow(mouseY - cy, 2)) <= 10) { hoveredWell = p; break; }
    }

    if (hoveredWell) {
        setHoverInfo({ type: 'well', x: mouseX, y: mouseY, data: hoveredWell });
    } else {
        const val = idwInterpolation(worldX, worldY, dataPoints);
        setHoverInfo({ type: 'point', x: mouseX, y: mouseY, worldX, worldY, val });
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full h-full bg-slate-100 rounded overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
        onMouseDown={handleMouseDown} onMouseMove={onMouseMoveCanvas} onMouseUp={handleMouseUp} onMouseLeave={() => { handleMouseUp(); setHoverInfo(null); }} onWheel={(e) => containerRef.current && handleWheel(e, containerRef.current.clientWidth, containerRef.current.clientHeight)}>
      <canvas ref={canvasRef} className="w-full h-full block pointer-events-none" />
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 print:hidden">
         <div className="bg-white/90 p-1.5 rounded shadow text-slate-500 border border-slate-200"><Move size={16} /></div>
         <div className="bg-white/90 p-1.5 rounded shadow text-slate-500 border border-slate-200"><ZoomIn size={16} /></div>
      </div>
      {hoverInfo && !isDragging && (
        <div className="absolute bg-white/95 p-3 rounded shadow-lg border border-slate-300 text-xs pointer-events-none z-20 min-w-[150px]" style={{ left: Math.min(hoverInfo.x + 15, (containerRef.current?.offsetWidth || 500) - 160), top: hoverInfo.y + 15 }}>
          {hoverInfo.type === 'well' ? (
             <><div className="font-bold text-slate-800 mb-1 border-b border-slate-200 pb-1 text-sm">{hoverInfo.data.name}</div><div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1"><span className="text-slate-500">N.D. Max:</span><span className="font-bold text-red-600 text-right">{formatLocal(hoverInfo.data.v)} m</span><span className="text-slate-500">Caudal:</span><span className="font-mono text-right">{formatLocal(hoverInfo.data.flow)} l/s</span></div></>
          ) : (
             <><div className="font-bold text-slate-800 mb-1 border-b pb-1">Nivel Interpolado</div><div>X: {formatLocal(hoverInfo.worldX, 0)}</div><div>Y: {formatLocal(hoverInfo.worldY, 0)}</div><div className="font-bold text-blue-700 mt-1 text-sm">{formatLocal(hoverInfo.val)} msnm</div></>
          )}
        </div>
      )}
    </div>
  );
};

export const ZoomableScatterChart = ({ processedData, initialDomain }: any) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { domain, isDragging, handleWheel, handleMouseDown, handleMouseMove, handleMouseUp } = useZoomPan(initialDomain);

    const onWheel = (e: any) => containerRef.current && handleWheel(e, containerRef.current.clientWidth, containerRef.current.clientHeight);
    const onMouseMove = (e: any) => containerRef.current && handleMouseMove(e, containerRef.current.clientWidth, containerRef.current.clientHeight);

    // Filtramos pozos
    const pumpingWells = processedData.wells.filter((w: any) => w.type !== 'Observación');
    const obsWells = processedData.wells.filter((w: any) => w.type === 'Observación');
    const EmptyShape = () => <g></g>;

    return (
        <div ref={containerRef} className={`w-full h-full relative ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            onMouseDown={handleMouseDown} onMouseMove={onMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={onWheel}>
            <div className="absolute top-4 left-10 flex flex-col gap-2 z-10 print:hidden">
                <div className="bg-white/90 p-1.5 rounded shadow text-slate-500 border border-slate-200"><Move size={16} /></div>
                <div className="bg-white/90 p-1.5 rounded shadow text-slate-500 border border-slate-200"><ZoomIn size={16} /></div>
            </div>
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="easting" name="Este (X)" unit="m" domain={domain.x} allowDataOverflow={true} tickFormatter={(val) => formatLocal(val, 0)} />
                  <YAxis type="number" dataKey="northing" name="Norte (Y)" unit="m" domain={domain.y} allowDataOverflow={true} tickFormatter={(val) => formatLocal(val, 0)} />
                  {!isDragging && <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />}
                  <Legend verticalAlign="top" height={36}/>
                  
                  {pumpingWells.map((well: any) => {
                    const points = generateCirclePoints(parseLocal(well.easting), parseLocal(well.northing), parseLocal(well.radius_influence_val));
                    if (points.length === 0) return null;
                    return (
                      <Scatter key={`circle-${well.id}`} data={points} line={{ stroke: '#ff00ff', strokeWidth: 2, strokeDasharray: '5 5' }} shape={<EmptyShape />} fill="none" legendType="none" isAnimationActive={false} pointerEvents="none" />
                    );
                  })}
                  <Scatter name="Pozos Bombeo" data={pumpingWells.map((w: any) => ({...w, easting: parseLocal(w.easting), northing: parseLocal(w.northing)}))} fill="#2563eb" shape="circle" zIndex={10}>
                    <LabelList dataKey="name" position="top" offset={10} style={{ fill: '#1e293b', fontSize: '11px', fontWeight: 'bold' }} />
                  </Scatter>
                  <Scatter name="Pozos Observación" data={obsWells.map((w: any) => ({...w, easting: parseLocal(w.easting), northing: parseLocal(w.northing)}))} fill="#16a34a" shape="triangle" zIndex={10}>
                    <LabelList dataKey="name" position="top" offset={10} style={{ fill: '#14532d', fontSize: '11px', fontWeight: 'bold' }} />
                  </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
};
