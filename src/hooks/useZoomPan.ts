import { useState, useEffect, useCallback, useRef } from 'react';

// Hook de Zoom/Pan
export const useZoomPan = (initialDomain: any) => {
  const [domain, setDomain] = useState(initialDomain);
  const [isDragging, setIsDragging] = useState(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setDomain(initialDomain);
  }, [initialDomain]);

  const handleWheel = useCallback((e: any, containerWidth: number, containerHeight: number) => {
    e.preventDefault(); e.stopPropagation();
    const scaleFactor = 1.1;
    const direction = e.deltaY > 0 ? 1 : -1;
    const scale = direction > 0 ? scaleFactor : 1 / scaleFactor;
    setDomain((prev: any) => {
        if (!prev || typeof prev.x[0] !== 'number') return prev;
        const spanX = prev.x[1] - prev.x[0];
        const spanY = prev.y[1] - prev.y[0];
        const centerX = (prev.x[0] + prev.x[1]) / 2;
        const centerY = (prev.y[0] + prev.y[1]) / 2;
        const newSpanX = spanX * scale;
        const newSpanY = spanY * scale;
        return {
            x: [centerX - newSpanX / 2, centerX + newSpanX / 2],
            y: [centerY - newSpanY / 2, centerY + newSpanY / 2]
        };
    });
  }, []);

  const handleMouseDown = useCallback((e: any) => {
    setIsDragging(true);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: any, containerWidth: number, containerHeight: number) => {
    if (!isDragging) return;
    const dxPixels = e.clientX - lastMouse.current.x;
    const dyPixels = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setDomain((prev: any) => {
        if (!prev || typeof prev.x[0] !== 'number') return prev;
        const spanX = prev.x[1] - prev.x[0];
        const spanY = prev.y[1] - prev.y[0];
        const unitsPerPixelX = spanX / containerWidth;
        const unitsPerPixelY = spanY / containerHeight;
        return {
            x: [prev.x[0] - dxPixels * unitsPerPixelX, prev.x[1] - dxPixels * unitsPerPixelX],
            y: [prev.y[0] + dyPixels * unitsPerPixelY, prev.y[1] + dyPixels * unitsPerPixelY] 
        };
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);
  return { domain, isDragging, handleWheel, handleMouseDown, handleMouseMove, handleMouseUp };
};
