// dithering.ts — Floyd–Steinberg para os modos VDG do CoCo (portado do CGS).
// Converte um ImageData RGBA (de um canvas oculto) num array de índices de paleta.

import { nearestColorIndex, SgColor } from './cocoColors';

export function floydSteinberg(imageData: ImageData, width: number, height: number, palette: SgColor[]): Uint8Array {
  // Cópia float para acumular o erro de difusão.
  const data = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3 + 0] = imageData.data[i * 4 + 0];
    data[i * 3 + 1] = imageData.data[i * 4 + 1];
    data[i * 3 + 2] = imageData.data[i * 4 + 2];
  }

  const result = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const oldR = clamp(data[idx]);
      const oldG = clamp(data[idx + 1]);
      const oldB = clamp(data[idx + 2]);

      const palIdx = nearestColorIndex(oldR, oldG, oldB, palette);
      result[y * width + x] = palIdx;

      const [newR, newG, newB] = palette[palIdx].rgb;
      const errR = oldR - newR, errG = oldG - newG, errB = oldB - newB;

      distributeError(data, width, height, x + 1, y, errR, errG, errB, 7 / 16);
      distributeError(data, width, height, x - 1, y + 1, errR, errG, errB, 3 / 16);
      distributeError(data, width, height, x, y + 1, errR, errG, errB, 5 / 16);
      distributeError(data, width, height, x + 1, y + 1, errR, errG, errB, 1 / 16);
    }
  }

  return result;
}

function distributeError(data: Float32Array, width: number, height: number, x: number, y: number, errR: number, errG: number, errB: number, factor: number): void {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 3;
  data[idx] += errR * factor;
  data[idx + 1] += errG * factor;
  data[idx + 2] += errB * factor;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
