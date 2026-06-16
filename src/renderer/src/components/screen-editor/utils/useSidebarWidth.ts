// useSidebarWidth.ts — largura da barra lateral redimensionável, com persistência (portado do CGS).
// Cada modo passa seu `modeKey` (ex.: "ascii_sg4"); salvo sob fiu:screenEditor.<modeKey>.sidebarWidth.

import { useState, useCallback, useEffect, useRef } from 'react';
import { readTelaSettings, immediateWriteTelaSettings } from './screenSettings';

const DEFAULT_WIDTH = 88;
const MIN_WIDTH = 60;
const MAX_WIDTH = 260;

export function useSidebarWidth(modeKey = 'shared') {
  const lsKey = `fiu:sidebar_${modeKey}`;
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const settingsLoadedRef = useRef(false);

  useEffect(() => {
    if (settingsLoadedRef.current) return;
    settingsLoadedRef.current = true;
    const load = async () => {
      try {
        const s = await readTelaSettings();
        const saved = s?.[modeKey]?.sidebarWidth;
        if (typeof saved === 'number' && saved >= MIN_WIDTH && saved <= MAX_WIDTH) {
          setWidth(saved);
          return;
        }
      } catch { /* fallback */ }
      try {
        const saved = localStorage.getItem(lsKey);
        if (saved) {
          const n = parseInt(saved, 10);
          if (!isNaN(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) setWidth(n);
        }
      } catch { /* ignore */ }
    };
    load();
  }, [modeKey, lsKey]);

  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    immediateWriteTelaSettings({ [modeKey]: { sidebarWidth: width } });
    try { localStorage.setItem(lsKey, String(width)); } catch { /* ignore */ }
  }, [width, modeKey, lsKey]);

  const onMouseDown = useCallback((e: any) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    const onMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      // Barra à direita — arrastar p/ a esquerda aumenta a largura.
      const delta = startX.current - moveEvent.clientX;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta));
      setWidth(newWidth);
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  const splitterProps = {
    onMouseDown,
    style: {
      width: '5px', flexShrink: 0, cursor: 'col-resize',
      backgroundColor: 'var(--border-color)', transition: 'background-color 0.15s',
      alignSelf: 'stretch', zIndex: 10,
    } as React.CSSProperties,
    onMouseEnter: (e: any) => { e.currentTarget.style.backgroundColor = 'var(--vdg-green)'; },
    onMouseLeave: (e: any) => { if (!isDragging.current) e.currentTarget.style.backgroundColor = 'var(--border-color)'; },
    title: 'Arrastar para redimensionar a barra lateral',
  };

  return { sidebarWidth: width, splitterProps };
}
