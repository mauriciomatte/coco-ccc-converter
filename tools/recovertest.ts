// Teste dos núcleos de RECUPERAÇÃO R3/R4/R5 contra o corpus real.
//   npx tsc -p tsconfig.tools.json && node out-tools/tools/recovertest.js
import * as fs from 'fs';
import { decodeCasTapeGapAware, tapeDiagnostics, decodeRegion, mergeCaptures } from '../src/main/converter/wav';

const BASE = 'G:\\Meu Drive\\EmuCoco\\FitasConvertidas WAV';
const GOOD = `${BASE}\\Softkristian\\Batalha dos Dinossauros\\QUASAR_22khz_mono.wav`;
const STEREO = `${BASE}\\BIT\\Polaris\\Polaris-stereo.wav`;
const OFF_A = `${BASE}\\BIT\\Offender\\Offender.wav`;
const OFF_B = `${BASE}\\BIT\\Polaris\\Offender.wav`;

const payLen = (buf: Buffer, opts: any) => { try { return decodeCasTapeGapAware(buf, opts).payload.length; } catch { return -1; } };
let pass = 0, fail = 0;
const check = (name: string, cond: boolean, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`); cond ? pass++ : fail++; };
const has = (p: string) => fs.existsSync(p);

// ── R3 — diagnóstico (histograma + mapa de blocos) ──
if (has(GOOD)) {
  const d = tapeDiagnostics(fs.readFileSync(GOOD), { recover: true });
  const peak = Math.max(...d.histogram.bins);
  check('R3 histograma tem dados', d.histogram.total > 100 && peak > 0, `total=${d.histogram.total} midUs=${d.histogram.midUs?.toFixed(0)}`);
  check('R3 mapa de blocos (QUASAR)', d.segs.length > 0 && d.goodBlocks > 0, `segs=${d.segs.length} bons=${d.goodBlocks}/${d.totalBlocks}`);
  // R3 — re-decode de uma REGIÃO (toda a fita) recupera blocos
  const reg = decodeRegion(fs.readFileSync(GOOD), 0, d.durationSec, { recover: true });
  check('R3 decodeRegion', reg.foundSync && reg.good > 0, `bons=${reg.good}/${reg.total} payload=${reg.payload.length}B`);
} else console.log('SKIP R3 (QUASAR ausente)');

// ── R5 — pré-filtros: NÃO podem zerar uma fita boa (regressão) ──
if (has(GOOD)) {
  const buf = fs.readFileSync(GOOD);
  const base = payLen(buf, { recover: true });
  const filt = payLen(buf, { recover: true, prefilter: { dc: true, bandpass: true } });
  const all = payLen(buf, { recover: true, prefilter: { dc: true, bandpass: true, agc: true, treble: true } });
  check('R5 pré-filtros não quebram fita boa', filt > 0, `base=${base}B dc+bp=${filt}B all4=${all}B`);
}

// ── R5 — estéreo: a SELEÇÃO de canal lê dados diferentes (a fita pode estar degradada nos dois) ──
if (has(STEREO)) {
  const buf = fs.readFileSync(STEREO);
  const d0 = tapeDiagnostics(buf, { recover: true, channel: 0 });
  const d1 = tapeDiagnostics(buf, { recover: true, channel: 1 });
  const diff = d0.channels >= 2 && JSON.stringify(d0.histogram.bins) !== JSON.stringify(d1.histogram.bins);
  check('R5 seleção de canal lê canais distintos', diff, `canais=${d0.channels} bons c0=${d0.goodBlocks} c1=${d1.goodBlocks}`);
} else console.log('SKIP R5 estéreo (Polaris-stereo ausente)');

// ── R4 — fusão de 2 capturas da mesma fita (Offender): nunca perde blocos ──
if (has(OFF_A) && has(OFF_B)) {
  const m = mergeCaptures([fs.readFileSync(OFF_A), fs.readFileSync(OFF_B)], { recover: true });
  check('R4 fusão ≥ melhor captura', m.mergedGood >= m.bestSingleGood, `capturas=${JSON.stringify(m.perCapture)} base#${m.baseIndex} fundido=${m.mergedGood} melhorSingle=${m.bestSingleGood} payload=${m.payload.length}B`);
} else console.log('SKIP R4 (capturas Offender ausentes)');

console.log(`\n${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
