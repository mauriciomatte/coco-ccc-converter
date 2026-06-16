// ScreenPreview.tsx — renderiza 512 bytes de VRAM ASCII/SG4 num canvas (read-only), reutilizando o
// renderVDGScreen do editor. Usado na miniatura "Tela do loader" para conferir a edição antes de injetar.

import React, { useRef, useEffect } from 'react';
// @ts-ignore — núcleo em JSX (sem tipos), resolvido pelo Vite.
import { renderVDGScreen, CANVAS_W, CANVAS_H } from './ScreenEditor.jsx';
import { SG_COLORS } from './utils/cocoColors';

interface Props {
  /** 512 bytes de VRAM (ou null = tela vazia/placeholder). */
  bytes: Uint8Array | null;
  /** Largura visual em px (mantém proporção 256×192). */
  width?: number;
}

export default function ScreenPreview({ bytes, width = 256 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const vram = new Uint8Array(512);
    vram.fill(0x80); // preto sólido = placeholder
    if (bytes && bytes.length >= 512) vram.set(bytes.subarray(0, 512));
    const imgData = ctx.createImageData(CANVAS_W, CANVAS_H);
    renderVDGScreen(imgData, vram, SG_COLORS);
    ctx.putImageData(imgData, 0, 0);
  }, [bytes]);

  const h = Math.round((width * CANVAS_H) / CANVAS_W);
  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ width, height: h, imageRendering: 'pixelated', display: 'block', borderRadius: 4, border: '1px solid var(--border)' }}
    />
  );
}
