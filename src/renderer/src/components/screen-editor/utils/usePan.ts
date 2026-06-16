// usePan.ts — pan do canvas com ALT+arrastar + scroll suave com inércia + zoom-to-cursor.
// Portado verbatim do CGS coco-game-studio (telas/utils/usePan.js), tipagem leve adicionada.

import { useRef, useCallback, useEffect } from 'react';

const WHEEL_LINE_PX = 72;
const WHEEL_PIXEL_SCALE = 0.8;
const MAX_VEL = 40;
const MOMENTUM_DECAY = 0.92;
const MOMENTUM_MIN_SPEED = 0.3;

function createSmoothScroller(el: any) {
  let velX = 0, velY = 0;
  let rafId: number | null = null;

  function animate() {
    if (!el) { rafId = null; return; }
    velX *= MOMENTUM_DECAY;
    velY *= MOMENTUM_DECAY;
    if (Math.abs(velX) < MOMENTUM_MIN_SPEED && Math.abs(velY) < MOMENTUM_MIN_SPEED) {
      velX = 0; velY = 0; rafId = null; return;
    }
    el.scrollLeft += velX;
    el.scrollTop += velY;
    rafId = requestAnimationFrame(animate);
  }

  function onWheel(e: WheelEvent) {
    if (e.ctrlKey) return; // Ctrl+wheel = zoom
    e.preventDefault();
    e.stopPropagation();
    let dx = 0, dy = 0;
    if (e.deltaMode === 1) {
      dx = Math.sign(e.deltaX) * WHEEL_LINE_PX;
      dy = Math.sign(e.deltaY) * WHEEL_LINE_PX;
    } else if (e.deltaMode === 2) {
      dx = e.deltaX * el.clientWidth;
      dy = e.deltaY * el.clientHeight;
    } else {
      dx = e.deltaX * WHEEL_PIXEL_SCALE;
      dy = e.deltaY * WHEEL_PIXEL_SCALE;
    }
    velX = Math.max(-MAX_VEL, Math.min(MAX_VEL, velX + dx));
    velY = Math.max(-MAX_VEL, Math.min(MAX_VEL, velY + dy));
    if (!rafId) rafId = requestAnimationFrame(animate);
  }

  function destroy() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    velX = 0; velY = 0;
  }

  return { onWheel, destroy };
}

export const PAN_PADDING = 600;

export function usePan() {
  const elRef = useRef<any>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const smoothScrollerRef = useRef<any>(null);

  const panContainerRef = useCallback((el: any) => {
    if (elRef.current && elRef.current._panMouseDown) {
      elRef.current.removeEventListener('mousedown', elRef.current._panMouseDown, true);
      delete elRef.current._panMouseDown;
    }
    if (elRef.current && elRef.current._panWheelSmooth) {
      elRef.current.removeEventListener('wheel', elRef.current._panWheelSmooth);
      delete elRef.current._panWheelSmooth;
    }
    if (smoothScrollerRef.current) {
      smoothScrollerRef.current.destroy();
      smoothScrollerRef.current = null;
    }

    elRef.current = el;
    if (!el) return;

    const scroller = createSmoothScroller(el);
    smoothScrollerRef.current = scroller;
    el._panWheelSmooth = scroller.onWheel;
    el.addEventListener('wheel', scroller.onWheel, { passive: false });

    const onMouseDown = (e: MouseEvent) => {
      if (!e.altKey || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        if (!isPanningRef.current) return;
        ev.preventDefault();
        ev.stopPropagation();
        const dx = ev.clientX - panStartRef.current.x;
        const dy = ev.clientY - panStartRef.current.y;
        el.scrollLeft = panStartRef.current.scrollLeft - dx;
        el.scrollTop = panStartRef.current.scrollTop - dy;
      };
      const onUp = () => {
        isPanningRef.current = false;
        el.style.cursor = '';
        el.style.userSelect = '';
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup', onUp, true);
      };
      document.addEventListener('mousemove', onMove, { capture: true, passive: false });
      document.addEventListener('mouseup', onUp, { capture: true });
    };

    el._panMouseDown = onMouseDown;
    el.addEventListener('mousedown', onMouseDown, { capture: true });
  }, []);

  const centerCanvas = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, []);

  const getScrollPos = useCallback(() => {
    const el = elRef.current;
    if (!el) return { scrollLeft: null, scrollTop: null };
    return { scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
  }, []);

  const pendingScrollRef = useRef<any>(null);
  const setScrollPos = useCallback(({ scrollLeft, scrollTop }: { scrollLeft: number | null; scrollTop: number | null }) => {
    if (scrollLeft == null || scrollTop == null) return;
    pendingScrollRef.current = { scrollLeft, scrollTop };
    const trySet = (attemptsLeft: number) => {
      const el = elRef.current;
      const pending = pendingScrollRef.current;
      if (!el || !pending) return;
      if (el.clientWidth === 0 || el.clientHeight === 0) {
        if (attemptsLeft > 0) setTimeout(() => trySet(attemptsLeft - 1), 50);
        return;
      }
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollLeft = Math.max(0, Math.min(pending.scrollLeft, maxLeft));
      el.scrollTop = Math.max(0, Math.min(pending.scrollTop, maxTop));
      const appliedLeft = el.scrollLeft, appliedTop = el.scrollTop;
      const targetLeft = Math.max(0, Math.min(pending.scrollLeft, maxLeft));
      const targetTop = Math.max(0, Math.min(pending.scrollTop, maxTop));
      if (Math.abs(appliedLeft - targetLeft) > 2 || Math.abs(appliedTop - targetTop) > 2) {
        if (attemptsLeft > 0) requestAnimationFrame(() => trySet(attemptsLeft - 1));
        return;
      }
      pendingScrollRef.current = null;
    };
    requestAnimationFrame(() => requestAnimationFrame(() => trySet(20)));
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (!el._panInitialCenterDone) el._panInitialCenterDone = false;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target: any = entry.target;
        const hasSize = target.clientWidth > 0 && target.clientHeight > 0;
        if (!target._panInitialCenterDone && hasSize) {
          target._panInitialCenterDone = true;
          setTimeout(() => {
            if (pendingScrollRef.current) return;
            if (target.clientWidth > 0 && target.clientHeight > 0) {
              target.scrollLeft = (target.scrollWidth - target.clientWidth) / 2;
              target.scrollTop = (target.scrollHeight - target.clientHeight) / 2;
            }
          }, 50);
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const zoomToPoint = useCallback((mouseX: number, mouseY: number, oldZoom: number, newZoom: number, canvasOriginalW: number, canvasOriginalH: number) => {
    const el = elRef.current;
    if (!el) return;
    if (typeof mouseX !== 'number' || typeof mouseY !== 'number') {
      requestAnimationFrame(() => centerCanvas());
      return;
    }
    const rect = el.getBoundingClientRect();
    const viewX = mouseX - rect.left, viewY = mouseY - rect.top;
    const pointX = el.scrollLeft + viewX, pointY = el.scrollTop + viewY;
    const oldCanvasW = canvasOriginalW * oldZoom, oldCanvasH = canvasOriginalH * oldZoom;
    const newCanvasW = canvasOriginalW * newZoom, newCanvasH = canvasOriginalH * newZoom;
    if (newCanvasW <= el.clientWidth * 0.9 && newCanvasH <= el.clientHeight * 0.9) {
      setTimeout(() => centerCanvas(), 10);
      return;
    }
    const widthDiff = newCanvasW - oldCanvasW, heightDiff = newCanvasH - oldCanvasH;
    let newPointX: number, newPointY: number;
    if (pointX <= PAN_PADDING) newPointX = pointX;
    else if (pointX >= PAN_PADDING + oldCanvasW) newPointX = pointX + widthDiff;
    else { const ratioX = (pointX - PAN_PADDING) / oldCanvasW; newPointX = PAN_PADDING + ratioX * newCanvasW; }
    if (pointY <= PAN_PADDING) newPointY = pointY;
    else if (pointY >= PAN_PADDING + oldCanvasH) newPointY = pointY + heightDiff;
    else { const ratioY = (pointY - PAN_PADDING) / oldCanvasH; newPointY = PAN_PADDING + ratioY * newCanvasH; }
    el.scrollLeft = newPointX - viewX;
    el.scrollTop = newPointY - viewY;
    setTimeout(() => {
      el.scrollLeft = newPointX - viewX;
      el.scrollTop = newPointY - viewY;
    }, 10);
  }, [centerCanvas]);

  return { panContainerRef, centerCanvas, getScrollPos, setScrollPos, zoomToPoint, panContainerProps: {} };
}
