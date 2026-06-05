// No Node imports needed for pure FSK DSP audio decoding in the browser

export interface WavMetadata {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
  dataSize: number;
}

export interface DecodedWav {
  metadata: WavMetadata;
  bytes: Buffer;
  isInverted: boolean;
  syncBitIndex: number;
}

/**
 * Decodes a TRS-80 Color Computer FSK WAV audio file into its raw byte stream.
 */
export function decodeWav(wavBuffer: Buffer): DecodedWav {
  // Parse WAV header
  let offset = 12; // Skip 'RIFF', size, 'WAVE'
  let sampleRate = 0;
  let bitsPerSample = 0;
  let channels = 0;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < wavBuffer.length) {
    if (offset + 8 > wavBuffer.length) break;
    const chunkId = wavBuffer.slice(offset, offset + 4).toString('ascii');
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      channels = wavBuffer.readUInt16LE(offset + 8 + 2);
      sampleRate = wavBuffer.readUInt32LE(offset + 8 + 4);
      bitsPerSample = wavBuffer.readUInt16LE(offset + 8 + 14);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }

  if (sampleRate === 0 || bitsPerSample === 0 || channels === 0 || dataOffset === 0) {
    throw new Error('Invalid or unsupported WAV format.');
  }

  const pcm = wavBuffer.slice(dataOffset, dataOffset + dataSize);
  const samples: number[] = [];

  if (bitsPerSample === 8) {
    for (let i = 0; i < pcm.length; i += channels) {
      samples.push((pcm[i] - 128) / 128.0);
    }
  } else if (bitsPerSample === 16) {
    for (let i = 0; i < pcm.length; i += 2 * channels) {
      if (i + 1 < pcm.length) {
        samples.push(pcm.readInt16LE(i) / 32768.0);
      }
    }
  } else {
    throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
  }

  if (samples.length === 0) {
    throw new Error('No audio samples found in WAV file.');
  }

  // Zero-crossing detection (up-crossings only)
  const upCrossings: number[] = [];
  let prevSign = Math.sign(samples[0]) || 1;

  for (let i = 1; i < samples.length; i++) {
    const sign = Math.sign(samples[i]) || 1;
    if (sign !== prevSign) {
      if (sign > 0 && prevSign < 0) {
        // Linear interpolation for exact crossing point
        const fraction = -samples[i - 1] / (samples[i] - samples[i - 1]);
        upCrossings.push(i - 1 + fraction);
      }
      prevSign = sign;
    }
  }

  // Classify full cycles into bits
  const bits: number[] = [];
  for (let i = 1; i < upCrossings.length; i++) {
    const diffSamples = upCrossings[i] - upCrossings[i - 1];
    const diffMicroseconds = (diffSamples / sampleRate) * 1000000;

    // CoCo FSK Standard:
    // 2400 Hz full cycle (bit 1) => ~416.7 us
    // 1200 Hz full cycle (bit 0) => ~833.3 us
    if (diffMicroseconds >= 300 && diffMicroseconds <= 600) {
      bits.push(1);
    } else if (diffMicroseconds >= 601 && diffMicroseconds <= 1200) {
      bits.push(0);
    }
  }

  if (bits.length < 16) {
    throw new Error('Failed to extract enough FSK bits from audio.');
  }

  // Slide a 1-bit window to find sync marker ($55 followed by $3C)
  let foundSync = false;
  let syncBitIndex = 0;
  let isInverted = false;
  const decodedBytes: number[] = [];

  for (let i = 0; i < bits.length - 16; i++) {
    let byte1 = 0;
    let byte2 = 0;
    for (let b = 0; b < 8; b++) {
      byte1 |= (bits[i + b] << b);
      byte2 |= (bits[i + 8 + b] << b);
    }

    const isNormalLeader = byte1 === 0x55;
    const isInvertedLeader = byte1 === 0xAA;
    const isNormalSync = byte2 === 0x3C;
    const isInvertedSync = byte2 === 0xC3;

    if ((isNormalLeader && isNormalSync) || (isInvertedLeader && isInvertedSync)) {
      foundSync = true;
      syncBitIndex = i;
      isInverted = isInvertedLeader;

      // Extract all bytes starting from the sync byte
      for (let j = i + 8; j < bits.length - 8; j += 8) {
        let byteVal = 0;
        for (let b = 0; b < 8; b++) {
          byteVal |= (bits[j + b] << b);
        }
        if (isInverted) {
          byteVal = (~byteVal) & 0xFF;
        }
        decodedBytes.push(byteVal);
      }
      break;
    }
  }

  if (!foundSync) {
    throw new Error('Could not find CoCo cassette sync marker ($55 $3C) in audio.');
  }

  return {
    metadata: {
      sampleRate,
      bitsPerSample,
      channels,
      dataSize
    },
    bytes: Buffer.from(decodedBytes),
    isInverted,
    syncBitIndex
  };
}

// ─── K2/K8/K10 — decode parametrizado + parse de blocos CAS + reemissão limpa ───

const CAS_TYPE_NAME: Record<number, string> = { 0: 'BASIC', 1: 'Data', 2: 'Machine (ML)' };

export interface CasBlock { type: number; data: number[]; checksumOk: boolean; }
export interface CasFileInfo { name: string; ftype: number; ftypeName: string; ascii: boolean; gapped: boolean; loadAddr: number; execAddr: number; sizeBytes: number; blocks: number; checksumOk: boolean; }
export interface DecodeOpts { midUs?: number; minUs?: number; maxUs?: number; minAmp?: number; }
export interface CasDecodeResult {
  sampleRate: number; bitsPerSample: number; channels: number; totalSamples: number; durationSec: number;
  foundSync: boolean; inverted: boolean; bitCount: number; byteCount: number;
  bytes: number[]; byteTimes: number[]; blocks: CasBlock[]; files: CasFileInfo[];
}

/** Lê os SAMPLES (canal 0, -1..1) de um WAV PCM 8/16-bit. */
function readWavSamples(wavBuffer: Buffer): { samples: Float32Array; sampleRate: number; bits: number; channels: number } {
  let offset = 12, sampleRate = 0, bits = 0, channels = 0, dataOffset = 0, dataSize = 0;
  while (offset + 8 <= wavBuffer.length) {
    const id = wavBuffer.slice(offset, offset + 4).toString('ascii'), size = wavBuffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') { channels = wavBuffer.readUInt16LE(offset + 10); sampleRate = wavBuffer.readUInt32LE(offset + 12); bits = wavBuffer.readUInt16LE(offset + 22); }
    else if (id === 'data') { dataOffset = offset + 8; dataSize = Math.min(size, wavBuffer.length - dataOffset); break; }
    offset += 8 + size + (size & 1);
  }
  if (!sampleRate || (bits !== 8 && bits !== 16)) throw new Error('WAV inválido ou não-PCM 8/16-bit.');
  const frame = (bits / 8) * channels, n = Math.floor(dataSize / frame), samples = new Float32Array(n);
  for (let i = 0; i < n; i++) { const b = dataOffset + i * frame; samples[i] = bits === 8 ? (wavBuffer[b] - 128) / 128 : wavBuffer.readInt16LE(b) / 32768; }
  return { samples, sampleRate, bits, channels };
}

/** Parse dos blocos CAS a partir do fluxo de bytes (após sync): [$3C type len data… checksum]. */
function parseCasBlocks(bytes: number[]): CasBlock[] {
  const blocks: CasBlock[] = [];
  let i = 0;
  while (i < bytes.length - 3) {
    if (bytes[i] !== 0x3c) { i++; continue; }
    const type = bytes[i + 1], len = bytes[i + 2];
    if (i + 3 + len >= bytes.length) break;
    const data = bytes.slice(i + 3, i + 3 + len), chk = bytes[i + 3 + len];
    let sum = (type + len) & 0xff; for (const b of data) sum = (sum + b) & 0xff;
    blocks.push({ type, data, checksumOk: sum === chk });
    i += 3 + len + 1;
    if (type === 0xff) { /* EOF — segue procurando outro arquivo */ }
    if (blocks.length > 4000) break;
  }
  return blocks;
}

/** Deriva a lista de ARQUIVOS (namefile + seus data blocks) a partir dos blocos. */
function filesFromBlocks(blocks: CasBlock[]): CasFileInfo[] {
  const files: CasFileInfo[] = []; let cur: CasFileInfo | null = null;
  for (const b of blocks) {
    if (b.type === 0 && b.data.length >= 15) {
      const d = b.data;
      const name = d.slice(0, 8).map(c => (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : '').join('').trim();
      const ftype = d[8];
      cur = { name, ftype, ftypeName: CAS_TYPE_NAME[ftype] || `?${ftype}`, ascii: d[9] !== 0, gapped: d[10] !== 0, execAddr: (d[11] << 8) | d[12], loadAddr: (d[13] << 8) | d[14], sizeBytes: 0, blocks: 0, checksumOk: b.checksumOk };
      files.push(cur);
    } else if (b.type === 1 && cur) { cur.sizeBytes += b.data.length; cur.blocks++; if (!b.checksumOk) cur.checksumOk = false; }
  }
  return files;
}

/** Núcleo: SAMPLES → bits (FSK) → bytes (a partir do sync $55$3C). `timeOffset` torna os tempos
 *  absolutos na fita inteira (usado pela decodificação gap-aware por segmento). */
function decodeStreamFromSamples(samples: Float32Array, sampleRate: number, opts: DecodeOpts, timeOffset = 0):
  { foundSync: boolean; inverted: boolean; bitCount: number; bytes: number[]; byteTimes: number[] } {
  const midUs = opts.midUs ?? 600, minUs = opts.minUs ?? 300, maxUs = opts.maxUs ?? 1200, minAmp = opts.minAmp ?? 0;
  const cross: number[] = [], segMax: number[] = [];
  let prevSign = Math.sign(samples[0]) || 1, curMax = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = Math.abs(samples[i]); if (a > curMax) curMax = a;
    const sign = Math.sign(samples[i]) || 1;
    if (sign !== prevSign) { if (sign > 0 && prevSign < 0) { const f = -samples[i - 1] / (samples[i] - samples[i - 1]); cross.push(i - 1 + f); segMax.push(curMax); curMax = 0; } prevSign = sign; }
  }
  const bitsArr: number[] = [], bitPos: number[] = [];
  for (let i = 1; i < cross.length; i++) {
    if (segMax[i] < minAmp) continue;
    const us = ((cross[i] - cross[i - 1]) / sampleRate) * 1e6;
    if (us >= minUs && us < midUs) { bitsArr.push(1); bitPos.push(cross[i]); }
    else if (us >= midUs && us <= maxUs) { bitsArr.push(0); bitPos.push(cross[i]); }
  }
  if (bitsArr.length < 16) return { foundSync: false, inverted: false, bitCount: bitsArr.length, bytes: [], byteTimes: [] };
  for (let i = 0; i < bitsArr.length - 16; i++) {
    let b1 = 0, b2 = 0;
    for (let b = 0; b < 8; b++) { b1 |= bitsArr[i + b] << b; b2 |= bitsArr[i + 8 + b] << b; }
    const norm = b1 === 0x55 && b2 === 0x3c, inv = b1 === 0xaa && b2 === 0xc3;
    if (norm || inv) {
      const out: number[] = [], times: number[] = [];
      for (let j = i + 8; j < bitsArr.length - 8; j += 8) { let v = 0; for (let b = 0; b < 8; b++) v |= bitsArr[j + b] << b; out.push(inv ? (~v) & 0xff : v); times.push(timeOffset + bitPos[j] / sampleRate); }
      return { foundSync: true, inverted: inv, bitCount: bitsArr.length, bytes: out, byteTimes: times };
    }
  }
  return { foundSync: false, inverted: false, bitCount: bitsArr.length, bytes: [], byteTimes: [] };
}

/** K2/K8 — decodifica um WAV de fita → blocos/arquivos CAS, com parâmetros ajustáveis (K8). */
export function decodeCasTape(wavBuffer: Buffer, opts: DecodeOpts = {}): CasDecodeResult {
  const { samples, sampleRate, bits, channels } = readWavSamples(wavBuffer);
  const base: CasDecodeResult = {
    sampleRate, bitsPerSample: bits, channels, totalSamples: samples.length, durationSec: samples.length / sampleRate,
    foundSync: false, inverted: false, bitCount: 0, byteCount: 0, bytes: [], byteTimes: [], blocks: [], files: [],
  };
  const r = decodeStreamFromSamples(samples, sampleRate, opts, 0);
  base.bitCount = r.bitCount;
  if (r.foundSync) {
    base.foundSync = true; base.inverted = r.inverted; base.bytes = r.bytes; base.byteCount = r.bytes.length; base.byteTimes = r.byteTimes;
    base.blocks = parseCasBlocks(r.bytes); base.files = filesFromBlocks(base.blocks);
  }
  return base;
}

/** Segmenta a fita em regiões de DADOS, separando-as das PAUSAS (hiss). Critério forense: o hiss
 *  da fita é ruído de alta frequência (período dominante < ~330µs / ~3 kHz+), enquanto os dados FSK
 *  do CoCo usam 1200/2400 Hz (≥ ~330µs). Janela 20ms; funde buracos curtos (margem de segurança). */
function segmentDataRegions(samples: Float32Array, sampleRate: number): Array<{ a: number; b: number }> {
  const cross: number[] = [];
  let prev = Math.sign(samples[0]) || 1;
  for (let i = 1; i < samples.length; i++) { const sg = Math.sign(samples[i]) || 1; if (sg > 0 && prev < 0) { const f = -samples[i - 1] / (samples[i] - samples[i - 1]); cross.push(i - 1 + f); } if (sg !== prev) prev = sg; }
  const per: Array<{ s: number; us: number }> = [];
  for (let i = 1; i < cross.length; i++) per.push({ s: cross[i], us: ((cross[i] - cross[i - 1]) / sampleRate) * 1e6 });
  const W = Math.round(sampleRate * 0.020);                       // janela 20ms (em amostras)
  const win: boolean[] = []; let wi = 0;
  for (let s = 0; s < samples.length; s += W) {
    const ps: number[] = []; while (wi < per.length && per[wi].s < s + W) { if (per[wi].s >= s) ps.push(per[wi].us); wi++; }
    let data = false;
    if (ps.length >= 5) { ps.sort((a, b) => a - b); const med = ps[ps.length >> 1]; const inStd = ps.filter(u => u >= 330 && u <= 1050).length / ps.length; data = med >= 330 && inStd > 0.5; }
    win.push(data);
  }
  // agrupa janelas contíguas; funde buracos < 80ms (4 janelas) para não cortar dados por flutuação
  const regs: Array<{ data: boolean; a: number; b: number }> = [];
  for (let k = 0; k < win.length; k++) { const last = regs[regs.length - 1]; const a = k * W, b = Math.min((k + 1) * W, samples.length); if (last && last.data === win[k]) last.b = b; else regs.push({ data: win[k], a, b }); }
  let changed = true; const minHole = 4 * W;
  while (changed) { changed = false; for (let i = 1; i < regs.length - 1; i++) { if ((regs[i].b - regs[i].a) < minHole && regs[i - 1].data === regs[i + 1].data) { regs[i - 1].b = regs[i + 1].b; regs.splice(i, 2); changed = true; break; } } }
  return regs.filter(r => r.data && (r.b - r.a) >= Math.round(sampleRate * 0.06)).map(r => ({ a: r.a, b: r.b }));
}

export interface CasGapResult {
  sampleRate: number; durationSec: number; foundSync: boolean; segments: number; multi: boolean;
  segs: CasBlock[][]; segTimes: Array<{ start: number; end: number }>;
  blocks: CasBlock[]; files: CasFileInfo[]; payload: number[]; payloadTimes: number[];
}

/** K2 forense — decodificação GAP-AWARE: segmenta a fita pelas pausas (hiss), decodifica CADA
 *  segmento isolado e CONCATENA os blocos válidos (namefile + todos os data blocks + 1 EOF).
 *  Recupera o PROGRAMA INTEIRO de fitas com tela/loader (que o decode contínuo trunca no 1º gap)
 *  e descarta o lixo do ruído. Se houver ≤1 segmento, cai no decode contínuo (fitas simples). */
export function decodeCasTapeGapAware(wavBuffer: Buffer, opts: DecodeOpts = {}): CasGapResult {
  const { samples, sampleRate } = readWavSamples(wavBuffer);
  const durationSec = samples.length / sampleRate;
  const regions = segmentDataRegions(samples, sampleRate);
  const pad = Math.floor(0.05 * sampleRate);
  const segs: CasBlock[][] = [];                                   // blocos POR SEGMENTO (preserva EOFs/ordem)
  const segTimes: Array<{ start: number; end: number }> = [];     // tempo (s) de cada segmento usado → p/ reproduzir os gaps
  const payload: number[] = [], payloadTimes: number[] = [];
  let foundSync = false, usedSegments = 0;
  for (const reg of regions) {
    const a = Math.max(0, reg.a - pad), b = Math.min(samples.length, reg.b + pad);
    const dec = decodeStreamFromSamples(samples.subarray(a, b), sampleRate, opts, a / sampleRate);
    if (!dec.foundSync) continue;
    const bytes = dec.bytes, times = dec.byteTimes;
    const segBlocks: CasBlock[] = [];
    let i = 0;
    while (i < bytes.length) {
      if (bytes[i] === 0x3c && i + 3 + (bytes[i + 2] || 0) + 1 <= bytes.length) {
        const type = bytes[i + 1], len = bytes[i + 2];
        let sum = (type + len) & 0xff; for (let k = 0; k < len; k++) sum = (sum + bytes[i + 3 + k]) & 0xff;
        if (sum === bytes[i + 3 + len]) {                          // checksum OK → bloco real (filtra ruído)
          if (type === 0x00 || type === 0x01 || type === 0xFF) {
            const data = bytes.slice(i + 3, i + 3 + len);
            segBlocks.push({ type, data, checksumOk: true });
            if (type === 0x01) for (let k = 0; k < len; k++) { payload.push(bytes[i + 3 + k]); payloadTimes.push(times[i + 3 + k]); }
          }
          i += 3 + len + 1; continue;
        }
      }
      i++;
    }
    if (segBlocks.length) { segs.push(segBlocks); segTimes.push({ start: reg.a / sampleRate, end: reg.b / sampleRate }); foundSync = true; usedSegments++; }
  }
  // Fallback: nada recuperado por segmento → decode contínuo (fita simples / sem gaps claros).
  if (!foundSync) {
    const c = decodeCasTape(wavBuffer, opts);
    const pay = extractCasFileData(c.blocks, 0);
    return { sampleRate, durationSec, foundSync: c.foundSync, segments: regions.length, multi: false, segs: c.blocks.length ? [c.blocks] : [], segTimes: [], blocks: c.blocks, files: c.files, payload: pay, payloadTimes: [] };
  }
  // `blocks` (achatado) p/ a lista de arquivos do painel: 1º namefile + todos os data + 1 EOF.
  const flat: CasBlock[] = [];
  let namefile: number[] | null = null;
  for (const sg of segs) for (const bl of sg) {
    if (bl.type === 0x00 && !namefile) { namefile = bl.data; flat.push(bl); }
    else if (bl.type === 0x01) flat.push(bl);
  }
  flat.push({ type: 0xFF, data: [], checksumOk: true });
  return { sampleRate, durationSec, foundSync, segments: usedSegments, multi: usedSegments > 1, segs, segTimes, blocks: flat, files: filesFromBlocks(flat), payload, payloadTimes };
}

/** Reconstrói um .CAS FIEL à fita original multi-segmento: cada segmento ganha seu próprio leader
 *  + sync e mantém o EOF, exatamente como o loader multi-estágio espera ler (header pt.1, header
 *  pt.2/loader, tela, programa). É isto que faz o jogo carregar igual à fita no XRoar. */
export function buildFaithfulCas(segs: CasBlock[][], nameLeader = 128): Buffer {
  const out: number[] = [];
  const leader = (n: number) => { for (let k = 0; k < n; k++) out.push(0x55); };
  const block = (type: number, data: number[]) => { out.push(0x3c, type & 0xff, data.length & 0xff); let s = (type + data.length) & 0xff; for (const x of data) { out.push(x & 0xff); s = (s + x) & 0xff; } out.push(s & 0xff); };
  for (const sg of segs) {
    leader(128);                                                   // leader antes de CADA segmento (o loader re-sincroniza)
    // `nameLeader` (gap após o namefile): 128 p/ o .cas (fast-load ignora); maior p/ o WAV em tempo
    // real, dando ao CoCo tempo de processar o namefile antes do 1º data block (fita simples).
    for (const bl of sg) { block(bl.type, bl.data); leader(bl.type === 0x00 ? nameLeader : 2); }
  }
  leader(2);
  return Buffer.from(out);
}

/** Extrai os BYTES de um arquivo (os data blocks do `fileIndex`-ésimo namefile, concatenados). */
export function extractCasFileData(blocks: CasBlock[], fileIndex = 0): number[] {
  let idx = -1; const out: number[] = [];
  for (const b of blocks) {
    if (b.type === 0) { idx++; if (idx > fileIndex) break; }
    else if (b.type === 1 && idx === fileIndex) for (const x of b.data) out.push(x);
  }
  return out;
}

/** K10 — reemite um .CAS LIMPO e padrão a partir dos blocos decodificados (leader/sync/checksum corretos). */
export function buildCleanCas(blocks: CasBlock[]): Buffer {
  const out: number[] = [];
  const leader = (n: number) => { for (let k = 0; k < n; k++) out.push(0x55); };
  const block = (type: number, data: number[]) => { out.push(0x3c, type & 0xff, data.length & 0xff); let s = (type + data.length) & 0xff; for (const b of data) { out.push(b & 0xff); s = (s + b) & 0xff; } out.push(s & 0xff); };
  // Filtra SÓ os blocos válidos (namefile=0 + data=1 até o EOF=0xFF), descartando o lixo que o decoder
  // produz ao tentar ler o stream turbo/tela após a parte padrão. Sem isso o .cas não abre no XRoar.
  let namefile: number[] | null = null;
  const data: number[][] = [];
  for (const b of blocks) {
    if (b.type === 0x00) { if (namefile) break; namefile = b.data; }      // 2º namefile = outro arquivo → para
    else if (b.type === 0x01) { if (namefile) data.push(b.data); }        // data só conta depois do namefile
    else if (b.type === 0xFF) { if (namefile) break; }                    // EOF → fim do arquivo (ignora o resto)
    // qualquer outro tipo = lixo de decode → ignora
  }
  // Estrutura canônica (igual a um .cas que abre no XRoar): leader, namefile, leader, data…, EOF.
  leader(128);
  if (namefile) { block(0x00, namefile); leader(128); }
  for (const d of data) { block(0x01, d); leader(2); }
  block(0xFF, []);
  leader(2);
  return Buffer.from(out);
}

const PCM_SILENCE = 128;                                            // 8-bit mid = silêncio
/** bytes CAS → PCM 8-bit (FSK onda quadrada), SEM cabeçalho WAV. */
function casToPcm(casBytes: Uint8Array | number[], sampleRate: number): number[] {
  const cyc1 = Math.max(2, Math.round(sampleRate / 2400)), cyc0 = Math.max(2, Math.round(sampleRate / 1200));
  const pcm: number[] = [];
  const HI = 210, LO = 46;
  const emitCycle = (len: number) => { const half = len >> 1; for (let k = 0; k < len; k++) pcm.push(k < half ? HI : LO); };
  for (const byte of casBytes) for (let b = 0; b < 8; b++) emitCycle((byte >> b) & 1 ? cyc1 : cyc0); // LSB-first
  return pcm;
}
function pcm8ToWav(pcm: number[], sampleRate: number): Buffer {
  const dataLen = pcm.length, buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < dataLen; i++) buf[44 + i] = pcm[i] & 0xff;
  return buf;
}

/** K10/K5 (A2) — FSK encode: bytes CAS → WAV LIMPO (onda quadrada, 8-bit mono, taxa escolhida). */
export function encodeCasToWav(casBytes: Uint8Array | number[], sampleRate = 22050): Buffer {
  return pcm8ToWav(casToPcm(casBytes, sampleRate), sampleRate);
}

/** WAV LIMPO com TEMPOS reais (serve p/ fita simples E multi-segmento). Diferente do .cas (que não
 *  guarda tempo), aqui inserimos SILÊNCIO entre os blocos p/ o CoCo ter tempo de processar antes de
 *  ler o próximo — especialmente após o NAMEFILE (onde o BASIC/loader faz alocação) — e o silêncio
 *  REAL medido entre os segmentos (motor parado, p/ desenhar a tela). Limpo, menor e nítido. */
export function buildCleanWav(segs: CasBlock[][], segTimes: Array<{ start: number; end: number }>, sampleRate = 22050): Buffer {
  const pcm: number[] = [];
  const silence = (sec: number) => { const n = Math.max(0, Math.round(sec * sampleRate)); for (let k = 0; k < n; k++) pcm.push(PCM_SILENCE); };
  for (let i = 0; i < segs.length; i++) {
    // gap ANTES do segmento i: silêncio real medido (multi, motor parado) ou um lead-in no 1º.
    const gap = i === 0 ? Math.max(0.2, Math.min(segTimes[0]?.start ?? 0.3, 0.5)) : Math.max(0.2, (segTimes[i]?.start ?? 0) - (segTimes[i - 1]?.end ?? 0));
    silence(gap);
    // Segmento = FSK contínua (leader + namefile + LEADER LONGO + data… + EOF). O leader longo após o
    // namefile dá tempo p/ o CoCo processar antes do 1º data block, SEM isolar (mantém o sync) — em
    // fita simples (sem loader) é o "inter-record gap" que faltava.
    const seg = casToPcm(buildFaithfulCas([segs[i]], 320), sampleRate); // leader pós-namefile LONGO (≈inter-record gap)
    for (let k = 0; k < seg.length; k++) pcm.push(seg[k]);          // (sem spread: arrays grandes estouram a pilha)
  }
  silence(0.2);
  return pcm8ToWav(pcm, sampleRate);
}

/** Reamostra um WAV para `targetRate` em 8-bit mono (interpolação linear) — encolhe o arquivo
 *  mantendo o conteúdo ("manter o .wav original com pequenas alterações"). */
export function resampleWav8(wavBuffer: Buffer, targetRate: number): Buffer {
  const { samples, sampleRate } = readWavSamples(wavBuffer);
  const n = Math.max(1, Math.round(samples.length * (targetRate / sampleRate)));
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(targetRate, 24); buf.writeUInt32LE(targetRate, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
  buf.write('data', 36); buf.writeUInt32LE(n, 40);
  const ratio = (samples.length - 1) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const x = i * ratio, i0 = Math.floor(x), f = x - i0;
    const s = (samples[i0] || 0) * (1 - f) + (samples[Math.min(samples.length - 1, i0 + 1)] || 0) * f;
    buf[44 + i] = Math.max(0, Math.min(255, Math.round(s * 127 + 128)));
  }
  return buf;
}
