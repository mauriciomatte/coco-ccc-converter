// Analisa a ESTRUTURA FSK de um .wav de fita CoCo: cabeçalho, regiões de sinal x silêncio (gaps),
// período de bit (1200/2400 Hz), forma de onda (quadrada x senoide) e nível/offset. Serve para
// comparar o nosso export com fitas reais da época. Uso:
//   npx tsc -p tsconfig.tools.json && node out-tools/tools/wavanalyze.js "<arquivo.wav>"
import * as fs from 'fs';

function readWav(path: string) {
  const b = fs.readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error('não é RIFF');
  let off = 12, fmt: any = {}, dataOff = -1, dataLen = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const sz = b.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt.audioFormat = b.readUInt16LE(off + 8);
      fmt.channels = b.readUInt16LE(off + 10);
      fmt.sampleRate = b.readUInt32LE(off + 12);
      fmt.bits = b.readUInt16LE(off + 22);
    } else if (id === 'data') { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz & 1);
  }
  // canal 0 → Float32 [-1,1]
  const ch = fmt.channels || 1, bps = (fmt.bits || 8) >> 3, frame = ch * bps;
  const n = Math.floor(dataLen / frame);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = dataOff + i * frame;
    if (fmt.bits === 8) s[i] = (b[p] - 128) / 128;
    else if (fmt.bits === 16) s[i] = b.readInt16LE(p) / 32768;
    else s[i] = 0;
  }
  return { ...fmt, samples: s, dataLen };
}

const fmtT = (sec: number) => sec.toFixed(3) + 's';

function analyze(path: string) {
  const w = readWav(path);
  const sr = w.sampleRate;
  const s = w.samples;
  console.log(`\n=== ${path.split(/[\\/]/).pop()} ===`);
  console.log(`fmt=${w.audioFormat} ch=${w.channels} ${w.bits}-bit ${sr} Hz · ${s.length} amostras · ${fmtT(s.length / sr)} · ${w.dataLen} B dados`);

  // amplitude / DC offset
  let mn = 1, mx = -1, sum = 0;
  for (let i = 0; i < s.length; i++) { if (s[i] < mn) mn = s[i]; if (s[i] > mx) mx = s[i]; sum += s[i]; }
  console.log(`nível: min=${mn.toFixed(3)} max=${mx.toFixed(3)} DCoffset=${(sum / s.length).toFixed(4)}`);

  // regiões de SINAL x SILÊNCIO (janela de 10 ms, RMS)
  const win = Math.max(1, Math.round(sr * 0.01));
  const silTh = 0.04; // limiar de silêncio (RMS)
  const regions: Array<{ sig: boolean; a: number; b: number }> = [];
  let curSig = false, start = 0;
  for (let i = 0; i < s.length; i += win) {
    let e = 0, c = 0;
    for (let k = i; k < Math.min(i + win, s.length); k++) { e += s[k] * s[k]; c++; }
    const rms = Math.sqrt(e / Math.max(1, c));
    const sig = rms > silTh;
    if (i === 0) { curSig = sig; start = 0; }
    else if (sig !== curSig) { regions.push({ sig: curSig, a: start, b: i }); curSig = sig; start = i; }
  }
  regions.push({ sig: curSig, a: start, b: s.length });
  // funde regiões muito curtas (<30ms) no vizinho
  console.log(`regiões (sinal/silêncio), gap≥10ms:`);
  let blockCount = 0;
  for (const r of regions) {
    const dur = (r.b - r.a) / sr;
    if (!r.sig && dur < 0.01) continue; // ignora silêncios ínfimos (transições)
    if (r.sig) blockCount++;
    console.log(`  ${r.sig ? 'SINAL  ' : 'silêncio'} ${fmtT(r.a / sr)} → ${fmtT(r.b / sr)}  (${(dur * 1000).toFixed(0)} ms)`);
  }

  // período de bit no 1º bloco de sinal: mede meio-períodos via cruzamentos por zero
  const first = regions.find(r => r.sig);
  if (first) {
    const a = first.a, b = Math.min(first.b, a + Math.round(sr * 0.3)); // 1ros 300ms do leader
    const crossings: number[] = [];
    let prev = s[a];
    for (let i = a + 1; i < b; i++) { if ((prev < 0 && s[i] >= 0) || (prev >= 0 && s[i] < 0)) crossings.push(i); prev = s[i]; }
    const halfPeriods: number[] = [];
    for (let i = 1; i < crossings.length; i++) halfPeriods.push(crossings[i] - crossings[i - 1]);
    halfPeriods.sort((x, y) => x - y);
    const med = halfPeriods[halfPeriods.length >> 1] || 0;
    const fullPeriodUs = (med * 2 / sr) * 1e6;
    console.log(`leader: meio-período mediano=${med} amostras → ciclo ≈ ${fullPeriodUs.toFixed(0)} µs (${(1e6 / fullPeriodUs).toFixed(0)} Hz)`);
    // forma de onda: razão de amostras nos extremos (quadrada) vs distribuídas (senoide)
    let extremes = 0, mid = 0;
    for (let i = a; i < b; i++) { const v = Math.abs(s[i]); if (v > 0.7 * Math.max(Math.abs(mn), mx)) extremes++; else if (v < 0.3 * Math.max(Math.abs(mn), mx)) mid++; }
    console.log(`forma de onda (leader): extremos=${(extremes / (b - a) * 100).toFixed(0)}% meio=${(mid / (b - a) * 100).toFixed(0)}%  (quadrada≈alto extremos; senoide≈distribuído)`);
  }
  console.log(`blocos de sinal detectados: ${blockCount}`);
}

const args = process.argv.slice(2);
if (!args.length) { console.log('uso: node wavanalyze.js <a.wav> [b.wav ...]'); process.exit(1); }
for (const a of args) { try { analyze(a); } catch (e: any) { console.log(`ERRO ${a}: ${e.message}`); } }
