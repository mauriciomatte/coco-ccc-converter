// cocoColors.ts — paleta VDG 6847 + utilitários de cor (portado do CGS coco-game-studio).
// Usado pelo editor ASCII/SG4: a tela de 512B em $0400 que as fitas/loaders do CoCo usam.

export interface SgColor {
  name: string;
  rgb: [number, number, number];
  vramSolid: number; // byte VRAM de um bloco SG4 totalmente aceso desta cor
  hint: string;
}

// Paleta SG4/SG8 (8 cores + preto). vramSolid = 0x80 | (idx<<4) | 0x0F (padrão 15 = 4 sub-pixels).
export const SG_COLORS: SgColor[] = [
  { name: 'Verde', rgb: [0, 210, 0], vramSolid: 0x8f, hint: 'Verde | VRAM: $8F | Dec: 143' },
  { name: 'Amarelo', rgb: [210, 210, 0], vramSolid: 0x9f, hint: 'Amarelo | VRAM: $9F | Dec: 159' },
  { name: 'Azul', rgb: [0, 0, 210], vramSolid: 0xaf, hint: 'Azul | VRAM: $AF | Dec: 175' },
  { name: 'Vermelho', rgb: [210, 0, 0], vramSolid: 0xbf, hint: 'Vermelho | VRAM: $BF | Dec: 191' },
  { name: 'Buff (Cinza)', rgb: [210, 210, 180], vramSolid: 0xcf, hint: 'Buff (Cinza) | VRAM: $CF | Dec: 207' },
  { name: 'Ciano', rgb: [0, 210, 210], vramSolid: 0xdf, hint: 'Ciano | VRAM: $DF | Dec: 223' },
  { name: 'Magenta', rgb: [210, 0, 210], vramSolid: 0xef, hint: 'Magenta (Roxo) | VRAM: $EF | Dec: 239' },
  { name: 'Laranja', rgb: [210, 105, 0], vramSolid: 0xff, hint: 'Laranja | VRAM: $FF | Dec: 255' },
  // index 8 = Preto (padrão 0 = sub-pixels apagados = fundo preto)
  { name: 'Preto', rgb: [0, 0, 0], vramSolid: 0x80, hint: 'Preto | VRAM: $80 | Dec: 128 (padrão 0 = tela preta)' },
];

// Distância perceptual ponderada (aprox. redmean de Thiadmer Riemersma).
export function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  const rmean = (r1 + r2) / 2;
  const wR = 2 + rmean / 256;
  const wG = 4.0;
  const wB = 2 + (255 - rmean) / 256;
  return Math.sqrt(wR * dr * dr + wG * dg * dg + wB * db * db);
}

// Índice da cor da paleta mais próxima de um RGB.
export function nearestColorIndex(r: number, g: number, b: number, palette: SgColor[]): number {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i].rgb;
    const d = colorDistance(r, g, b, pr, pg, pb);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}
