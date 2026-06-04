import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  FolderOpen, Save, Download, ArrowRightLeft, MonitorPlay, Undo2, Redo2,
  Play, Pause, Square, Circle, Rewind, FastForward, AudioLines, ZoomIn, ZoomOut, FileCode2,
  Scissors, Copy, ClipboardPaste, Trash2, Crop, Maximize2, ArrowUpFromLine, Plus, Minus,
} from 'lucide-react';
import MiniXRoar from './MiniXRoar';

// ABA K7 (fita cassete) — FASE K1: K0 (waveform + casco) + PLAYER (Web Audio play/pause/stop) +
// CASSETE ANIMADA sincronizada + PLAYHEAD + contador + velocidade (Época/×2/×4) + zoom/seek.
// Decode FSK→programa (K2), edição (K3), REC (K4), export (K5)… vêm depois.

interface Audio { name: string; sampleRate: number; channels: number; bits: number; durationSec: number; samples: Float32Array; }

/** Decodifica WAV (RIFF/PCM 8/16-bit) → metadados + amostras do canal 0 (taxa ORIGINAL).
 *  ASSÍNCRONO em chunks (cede à UI) com callback de progresso → barra de carregamento. */
async function decodeWavAsync(bytes: Uint8Array, onProgress: (p: number) => void): Promise<Omit<Audio, 'name'> | null> {
  if (bytes.byteLength < 44) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, false) !== 0x52494646) return null;          // 'RIFF'
  if (dv.getUint32(8, false) !== 0x57415645) return null;          // 'WAVE'
  let off = 12, channels = 0, sampleRate = 0, bits = 0, dataOff = -1, dataLen = 0;
  while (off + 8 <= bytes.byteLength) {
    const id = dv.getUint32(off, false), size = dv.getUint32(off + 4, true);
    if (id === 0x666d7420) {                                       // 'fmt '
      channels = dv.getUint16(off + 10, true);
      sampleRate = dv.getUint32(off + 12, true);
      bits = dv.getUint16(off + 22, true);
    } else if (id === 0x64617461) { dataOff = off + 8; dataLen = Math.min(size, bytes.byteLength - (off + 8)); }
    off += 8 + size + (size & 1);
  }
  if (!sampleRate || dataOff < 0 || (bits !== 8 && bits !== 16)) return null;
  const frame = (bits / 8) * channels, n = Math.floor(dataLen / frame);
  const samples = new Float32Array(n);
  const CHUNK = 300000;
  for (let i = 0; i < n; i += CHUNK) {
    const end = Math.min(i + CHUNK, n);
    for (let k = i; k < end; k++) { const b = dataOff + k * frame; samples[k] = bits === 8 ? (bytes[b] - 128) / 128 : dv.getInt16(b, true) / 32768; }
    onProgress(n ? end / n : 1);
    await new Promise(r => setTimeout(r, 0));                      // cede à UI para a barra animar
  }
  return { sampleRate, channels, bits, durationSec: n / sampleRate, samples };
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 10))}`;

/** Quebra cada linha em no máx. 32 colunas (largura da tela do CoCo) — espelha como apareceria na tela. */
const wrap32 = (s: string) => s.split('\n').map(l => (l.length > 32 ? (l.match(/.{1,32}/g) || [l]).join('\n') : l)).join('\n');

/** Estima o fator de playback que põe a fita na VELOCIDADE PADRÃO do CoCo: mede o período do tom
 *  rápido (2400 Hz da FSK) nos ~3 s iniciais (com histerese) e devolve 2400/fMedido (clamp 0.25–4).
 *  ≈1.0 para gravações no padrão; <1 desacelera fitas gravadas rápido; >1 acelera as lentas. */
function estimateEpochRate(samples: Float32Array, sr: number): number {
  const n = Math.min(samples.length, Math.floor(sr * 3));
  if (n < sr * 0.2) return 1;
  let peak = 0; for (let i = 0; i < n; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; }
  if (peak < 1e-3) return 1;
  const gate = peak * 0.25;
  const periods: number[] = [];
  let last = -1, armed = false;
  for (let i = 1; i < n; i++) {
    if (samples[i] < -gate) armed = true;                              // só conta após mergulhar < -gate (1 por ciclo)
    if (armed && samples[i - 1] <= 0 && samples[i] > 0) {
      if (last >= 0) { const p = i - last; if (p >= 3 && p <= sr / 700) periods.push(p); }
      last = i; armed = false;
    }
  }
  if (periods.length < 30) return 1;
  periods.sort((a, b) => a - b);
  const pHi = periods[Math.floor(periods.length * 0.15)];             // ~período do tom de 2400 Hz
  const fHi = sr / pHi;
  return Math.max(0.25, Math.min(4, 2400 / fHi));
}

/** Float32 (-1..1) → bytes de WAV PCM 16-bit mono (p/ regravar após editar / gravação de fita). */
function samplesToWav16(samples: Float32Array, sampleRate: number): Uint8Array {
  const n = samples.length, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const wr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[i])); dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Uint8Array(buf);
}
/** Decodifica VOC (Creative Voice File) → PCM mono (canal 0). Cobre blocos 1 (8-bit), 9 (novo:
 *  8/16-bit), 2 (continuação), 3 (silêncio) e 8 (estendido). Retorna null se não for VOC válido. */
function decodeVoc(bytes: Uint8Array): { sampleRate: number; bits: number; samples: Float32Array } | null {
  const SIG = 'Creative Voice File';
  if (bytes.length < 26) return null;
  for (let i = 0; i < SIG.length; i++) if (bytes[i] !== SIG.charCodeAt(i)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = (dv.getUint16(20, true) || 26);                          // offset do 1º bloco de dados
  const chunks: Float32Array[] = [];
  let sampleRate = 0, bits = 8;
  let extSR = 0;                                                     // SR do bloco 8 (estendido) p/ o próximo bloco 1
  while (off + 1 <= bytes.byteLength) {
    const type = bytes[off];
    if (type === 0) break;                                           // terminador
    if (off + 4 > bytes.byteLength) break;
    const len = bytes[off + 1] | (bytes[off + 2] << 8) | (bytes[off + 3] << 16);
    const d = off + 4;
    if (d + len > bytes.byteLength) break;                           // truncado
    if (type === 1) {                                                // som (8-bit unsigned)
      const tc = bytes[d];
      const sr = extSR || Math.round(1000000 / (256 - tc));
      if (!sampleRate) { sampleRate = sr; bits = 8; }
      const n = Math.max(0, len - 2), s = new Float32Array(n);
      for (let k = 0; k < n; k++) s[k] = (bytes[d + 2 + k] - 128) / 128;
      chunks.push(s); extSR = 0;
    } else if (type === 2) {                                         // continuação (mesmo formato 8-bit)
      const s = new Float32Array(len);
      for (let k = 0; k < len; k++) s[k] = (bytes[d + k] - 128) / 128;
      chunks.push(s);
    } else if (type === 3) {                                         // silêncio
      const cnt = (bytes[d] | (bytes[d + 1] << 8)) + 1;
      chunks.push(new Float32Array(Math.max(0, cnt)));
    } else if (type === 8) {                                         // estendido: TC16 + pack + modo
      const tc16 = bytes[d] | (bytes[d + 1] << 8);
      const ch = bytes[d + 3] ? 2 : 1;
      extSR = Math.round(256000000 / (ch * (65536 - tc16)));
    } else if (type === 9) {                                         // novo formato (8/16-bit, n canais)
      const sr = dv.getUint32(d, true), bps = bytes[d + 4], ch = Math.max(1, bytes[d + 5]);
      if (!sampleRate) { sampleRate = sr; bits = bps; }
      const so = d + 12, sl = Math.max(0, len - 12);
      if (bps === 16) { const n = Math.floor(sl / 2 / ch), s = new Float32Array(n); for (let k = 0; k < n; k++) s[k] = dv.getInt16(so + k * 2 * ch, true) / 32768; chunks.push(s); }
      else { const n = Math.floor(sl / ch), s = new Float32Array(n); for (let k = 0; k < n; k++) s[k] = (bytes[so + k * ch] - 128) / 128; chunks.push(s); }
    }
    off = d + len;
  }
  if (!chunks.length || !sampleRate) return null;
  let total = 0; for (const c of chunks) total += c.length;
  const all = new Float32Array(total); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  return { sampleRate, bits, samples: all };
}

// Opções de velocidade. 'epoca' = velocidade-padrão do CoCo (analisada do arquivo); 'normal' = como gravado.
const SPEED_OPTS = [
  { k: 'epoca', l: 'Época' }, { k: 'normal', l: 'Normal' },
  { k: 'half', l: '-2×' }, { k: 'quarter', l: '-4×' },
  { k: 'x2', l: '×2' }, { k: 'x4', l: '×4' },
] as const;
type SpeedKey = typeof SPEED_OPTS[number]['k'];
// Laranja do app (#ff8c1a), em versões OPACAS/apagadas — não força os olhos como o ciano forte.
const WAVE_COLOR = 'rgba(255,140,26,0.5)';   // forma de onda
const ACCENT = 'rgba(255,140,26,0.65)';      // detalhes (cassete, contador, drag)
const ACCENT_DIM = 'rgba(255,140,26,0.4)';

export function K7Tab({ lang, active, platform, onOpenBasic, detokenize, onSendToXroar, onSendToDsk, onLog }: {
  lang: string;
  active?: boolean;
  platform?: 'coco' | 'dragon';
  onOpenBasic?: (bytes: Uint8Array, name: string) => void;
  detokenize?: (bytes: Uint8Array) => { text: string; tokenized: boolean };
  onSendToXroar?: (wavBytes: Uint8Array, name: string) => void;
  onSendToDsk?: (wavBytes: Uint8Array, opts: any, fileIndex: number) => void;
  onLog?: (pt: string, en: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}) {
  const pt = lang === 'pt-br';
  const t = (a: string, b: string) => (pt ? a : b);
  // Configurações persistentes da aba K7 (localStorage): ajustes de som, velocidade, formato de
  // extração, espelhamento e os pesos (larguras) dos 3 painéis de baixo.
  const cfg = useMemo(() => { try { return JSON.parse(localStorage.getItem('k7Settings') || '{}'); } catch { return {}; } }, []);
  const [audio, setAudio] = useState<Audio | null>(null);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState<null | 'rec' | 'eject'>(null); // diálogo de confirmação (REC/Eject)
  const hexScrollRef = useRef<HTMLDivElement | null>(null);                // auto-scroll do hex na revelação
  const basicScrollRef = useRef<HTMLDivElement | null>(null);              // auto-scroll do BASIC na revelação
  const revealCntRef = useRef(0);                                          // throttle da revelação dentro do tickLoop
  const fileBytesRef = useRef<Uint8Array | null>(null);                    // espelho de fileBytes p/ o tickLoop (evita closure obsoleto)
  const [extFmt, setExtFmt] = useState<'bin' | 'bas' | 'cas'>(cfg.extFmt ?? 'bin'); // formato de extração (Extrair)
  // Pesos (flex-grow) dos painéis de baixo, ajustáveis por splitters: BASIC | HEX | mini-XRoar.
  const [panelW, setPanelW] = useState<{ basic: number; hex: number; mini: number }>(cfg.panelW ?? { basic: 1, hex: 1, mini: 2 });
  const panelsRowRef = useRef<HTMLDivElement | null>(null);
  const splitDrag = useRef<null | { leftK: 'basic' | 'hex'; rightK: 'hex' | 'mini'; x0: number; pairPx: number; l0Px: number; sum: number }>(null);
  const [revealN, setRevealN] = useState(0);                               // bytes "revelados" (efeito de carga), atualizado por intervalo
  const [srcSize, setSrcSize] = useState(0);                               // tamanho do arquivo carregado no SISTEMA (bytes do .wav/.cas/.voc)
  const [mirrorXroar, setMirrorXroar] = useState(!!cfg.mirror);            // espelhar no mini-XRoar (opt-in)
  const [miniLoad, setMiniLoad] = useState<{ name: string; data: Uint8Array; ftype: number; key: number } | null>(null);
  const [starting, setStarting] = useState(false);                         // espelhando: aguardando o XRoar digitar o CLOAD
  const mirrorDelayRef = useRef(0);                                        // timer de FALLBACK do espelhamento
  const mirrorFromRef = useRef(0);                                         // posição (s) onde o áudio deve começar após o sinal da mini
  const startingRef = useRef(false);                                       // espelho de `starting` p/ o callback da mini
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);                     // 0..1 ao carregar/decodificar o WAV
  const [dragOver, setDragOver] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);                                   // fator de playback EFETIVO (numérico)
  const [speedKey, setSpeedKey] = useState<SpeedKey>(cfg.speedKey ?? 'epoca'); // opção escolhida no seletor
  const [epochRate, setEpochRate] = useState(1);                           // fator p/ a velocidade-padrão do CoCo (analisado)
  const [, setFrame] = useState(0);                                // bump para re-render por quadro
  const [view, setView] = useState({ start: 0, len: 1 });          // janela visível (frações 0..1)
  const [decoded, setDecoded] = useState<any>(null);               // K2: resultado do decode FSK→CAS
  const [decoding, setDecoding] = useState(false);
  const [dec, setDec] = useState({ midUs: cfg.midUs ?? 600, minAmp: cfg.minAmp ?? 0 }); // K8: parâmetros de ajuste fino
  const [exporting, setExporting] = useState(false);
  const rawRef = useRef<Uint8Array | null>(null);                  // bytes crus do WAV (p/ decode/export)
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null); // K3: seleção (índices de amostra)
  const [, setHist] = useState(0);                                 // bump p/ re-render dos botões de edição
  const clipRef = useRef<Float32Array | null>(null);
  const undoRef = useRef<Float32Array[]>([]);
  const redoRef = useRef<Float32Array[]>([]);
  const selDrag = useRef<{ x0: number; sample0: number; moved: boolean } | null>(null);
  const [recording, setRecording] = useState(false);              // K4
  const [vu, setVu] = useState(0);
  const recRef = useRef<any>(null);
  const scrollDrag = useRef<{ left: number; width: number } | null>(null); // arraste do scrollbar do zoom
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);     // bytes do 1º arquivo decodificado (p/ o BASIC)
  const [fileMeta, setFileMeta] = useState<{ ftype: number; name: string } | null>(null);
  // STREAM CRU completo (todos os bytes lidos da fita + tempo de cada um) → o painel HEX revela
  // conforme o playhead passa por cada byte em TODA a fita (header → tela/loader → turbo).
  const [streamBytes, setStreamBytes] = useState<Uint8Array | null>(null);
  const streamRef = useRef<{ bytes: Uint8Array; times: number[] } | null>(null);
  const [hexRevealN, setHexRevealN] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveBoxRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const posRef = useRef(0);                                        // posição (s)
  const lastPosRef = useRef(0);
  const anchorCtxRef = useRef(0);                                  // ctx.currentTime no play
  const anchorOffRef = useRef(0);                                  // posição no play
  const rafRef = useRef(0);
  const reelL = useRef(0), reelR = useRef(0);                      // ângulos dos carretéis

  const getCtx = () => { if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); return ctxRef.current; };

  // ---- carregar ----
  const reset = () => { stop(); posRef.current = 0; lastPosRef.current = 0; reelL.current = 0; reelR.current = 0; setView({ start: 0, len: 1 }); };
  const loadBytes = async (bytes: Uint8Array, name: string) => {
    const ext = (name.split('.').pop() || '').toLowerCase();
    reset(); setErr(''); setDecoded(null); setFileBytes(null); setFileMeta(null); setStreamBytes(null); streamRef.current = null; setHexRevealN(0); setSrcSize(bytes.length); setLoading(true); setProgress(0);
    // K2 — normaliza qualquer formato de fita para bytes de WAV e segue pelo MESMO pipeline.
    let wavBytes: Uint8Array;
    if (ext === 'wav') {
      wavBytes = bytes;
    } else if (ext === 'cas' || ext === 'c10') {
      // .cas/.c10 = stream de cassete → codifica em WAV (FSK quadrada) no main.
      const r = await window.cocoApi.k7CasToWav(bytes, 22050);
      if (!r?.success) { setLoading(false); setErr('CAS→WAV: ' + (r?.error || '?')); return; }
      wavBytes = new Uint8Array(r.data);
    } else if (ext === 'voc') {
      const v = decodeVoc(bytes);
      if (!v) { setLoading(false); setErr(t('VOC inválido (esperado Creative Voice File, PCM 8/16-bit).', 'Invalid VOC (expected Creative Voice File, PCM 8/16-bit).')); return; }
      wavBytes = samplesToWav16(v.samples, v.sampleRate);
    } else {
      setLoading(false); setErr(t('Formato não suportado. Use .WAV, .CAS, .C10 ou .VOC.', 'Unsupported format. Use .WAV, .CAS, .C10 or .VOC.')); return;
    }
    const p = await decodeWavAsync(wavBytes, setProgress);
    if (!p) { setLoading(false); setErr(t('Áudio inválido ou não-PCM (8/16-bit).', 'Invalid or non-PCM (8/16-bit) audio.')); return; }
    rawRef.current = wavBytes;
    setAudio({ name, ...p });
    const ctx = getCtx();
    const ab = ctx.createBuffer(1, p.samples.length, p.sampleRate);
    ab.copyToChannel(p.samples, 0);
    bufRef.current = ab;
    // Analisa a velocidade-padrão do CoCo p/ a opção "Época"; aplica já se ela estiver selecionada.
    const er = estimateEpochRate(p.samples, p.sampleRate);
    setEpochRate(er);
    if (speedKey === 'epoca') setSpeed(er);
    setLoading(false);
  };
  // K2/K8 — decodifica a fita (FSK → CAS) com os parâmetros atuais; re-roda quando `dec` muda (debounce).
  const runDecode = async (params: typeof dec) => {
    if (!rawRef.current) return;
    setDecoding(true);
    try {
      const r = await window.cocoApi.k7Decode(rawRef.current, params);
      setDecoded(r?.success ? r : null);
      if (r?.success && r.foundSync && r.files.length) {
        const fb = await window.cocoApi.k7FileBytes(rawRef.current, params, 0);
        if (fb?.success) { setFileBytes(new Uint8Array(fb.data)); setFileMeta({ ftype: fb.ftype, name: fb.name }); }
        else { setFileBytes(null); setFileMeta(null); }
        // stream cru completo (p/ o hex revelar a fita inteira)
        const st = await window.cocoApi.k7Stream(rawRef.current, params);
        if (st?.success && st.data?.length) { const sb = new Uint8Array(st.data); setStreamBytes(sb); streamRef.current = { bytes: sb, times: st.times || [] }; setHexRevealN(playing ? 0 : sb.length); }
        else { setStreamBytes(null); streamRef.current = null; setHexRevealN(0); }
      } else { setFileBytes(null); setFileMeta(null); setStreamBytes(null); streamRef.current = null; setHexRevealN(0); }
    } finally { setDecoding(false); }
  };
  useEffect(() => { if (!audio || !rawRef.current) return; const id = setTimeout(() => runDecode(dec), 250); return () => clearTimeout(id); }, [dec, audio]);
  // K10 — Normalizar/Remaster → arquivo limpo (.cas/.wav) menor.
  const exportClean = async (format: 'cas' | 'wav') => {
    if (!rawRef.current || !decoded?.foundSync) return;
    setExporting(true);
    try {
      const r = await window.cocoApi.k7ExportClean(rawRef.current, dec, format, format === 'wav' ? 11025 : 0, audio?.name || 'fita');
      if (r?.cancelled) return;
      if (!r?.success) { setErr('Export: ' + r?.error); return; }
      const extra = hasTurbo ? t(' — ATENÇÃO: só a parte PADRÃO (loader). O jogo turbo NÃO entra no .cas; use "→ Fita completa".', ' — NOTE: STANDARD part only (loader). The turbo game is NOT in the .cas; use "→ Full tape".') : '';
      setErr(t(`Salvo: ${r.path} (${(r.size / 1024).toFixed(1)} KB)${extra}`, `Saved: ${r.path} (${(r.size / 1024).toFixed(1)} KB)${extra}`));
    } finally { setExporting(false); }
  };
  // Salva a FITA COMPLETA (áudio original carregado, rawRef) — captura TUDO (header + tela/loader +
  // programa turbo). É o que roda inteiro no XRoar; o "→ CAS/WAV" só pega a parte padrão decodificada.
  const exportFullWav = async () => {
    if (!rawRef.current) return;
    setExporting(true);
    try {
      const base = (audio?.name || 'fita').replace(/\.[^.]+$/, '') || 'fita';
      const r = await window.cocoApi.saveCartridgeFile(rawRef.current, `${base}_completa.wav`,
        t('Salvar a FITA COMPLETA (.wav) — todo o áudio (tela/loader/turbo)', 'Save the FULL TAPE (.wav) — all audio (screen/loader/turbo)'),
        [{ name: 'WAV', extensions: ['wav'] }, { name: 'All Files', extensions: ['*'] }]);
      if (r?.success) setErr(t(`Fita completa salva: ${r.filePath}`, `Full tape saved: ${r.filePath}`));
      else if (r?.error) setErr('Export: ' + r.error);
    } finally { setExporting(false); }
  };
  // K5/K6 — extrai um arquivo decodificado da fita → PC, no formato escolhido (BIN cru / BAS texto / CAS fita).
  const extractFile = async (index: number) => {
    if (!rawRef.current || !decoded?.foundSync) return;
    const fb = await window.cocoApi.k7FileBytes(rawRef.current, dec, index);
    if (!fb?.success) { setErr('Extrair: ' + (fb?.error || '?')); return; }
    const meta = decoded.files[index];
    const safe = (fb.name || 'FILE').replace(/[^A-Za-z0-9._-]/g, '_') || 'FILE';
    const data = new Uint8Array(fb.data);
    try {
      if (extFmt === 'bin') {
        const r = await window.cocoApi.saveCartridgeFile(data, `${safe}.bin`, t('Extrair bytes (.bin)', 'Extract bytes (.bin)'), [{ name: 'Binary (.bin)', extensions: ['bin'] }, { name: 'All Files', extensions: ['*'] }]);
        if (r?.success) setErr(t(`Extraído: ${r.filePath} (${data.length} B)`, `Extracted: ${r.filePath} (${data.length} B)`));
        else if (r?.error) setErr('Extrair: ' + r.error);
      } else if (extFmt === 'bas') {
        if (fb.ftype !== 0 || !detokenize) { setErr(t('BAS só vale para arquivos BASIC.', 'BAS only applies to BASIC files.')); return; }
        const d = detokenize(data);
        if (d.tokenized || !d.text.trim()) { setErr(t('Não foi possível detokenizar este BASIC.', 'Could not detokenize this BASIC.')); return; }
        const txt = new TextEncoder().encode(d.text.endsWith('\n') ? d.text : d.text + '\n');
        const r = await window.cocoApi.saveCartridgeFile(txt, `${safe}.bas`, t('Extrair BASIC (texto .bas)', 'Extract BASIC (text .bas)'), [{ name: 'BASIC text (.bas)', extensions: ['bas'] }, { name: 'Text (.txt)', extensions: ['txt'] }, { name: 'All Files', extensions: ['*'] }]);
        if (r?.success) setErr(t(`Extraído: ${r.filePath}`, `Extracted: ${r.filePath}`));
        else if (r?.error) setErr('Extrair: ' + r.error);
      } else { // cas
        const built = await window.cocoApi.buildEmulatorCas([{ name: (safe.replace(/\..*$/, '') || 'FILE').slice(0, 8), fileType: fb.ftype, asciiFlag: meta?.ascii ? 0xFF : 0x00, loadAddr: meta?.loadAddr || 0, execAddr: meta?.execAddr || 0, payload: data }]);
        if (!built?.success) { setErr('Extrair: ' + built?.error); return; }
        const r = await window.cocoApi.saveCartridgeFile(new Uint8Array(built.image), `${safe}.cas`, t('Extrair como fita (.cas)', 'Extract as tape (.cas)'), [{ name: 'CoCo Cassette (.cas)', extensions: ['cas'] }, { name: 'All Files', extensions: ['*'] }]);
        if (r?.success) setErr(t(`Extraído: ${r.filePath}`, `Extracted: ${r.filePath}`));
        else if (r?.error) setErr('Extrair: ' + r.error);
      }
    } catch (e: any) { setErr('Extrair: ' + e.message); }
  };
  // ───────── K3 — edição da waveform (seleção, recortar/copiar/colar/excluir/trim/normalizar + undo) ─────────
  const cat = (...arrs: Float32Array[]) => { const n = arrs.reduce((s, a) => s + a.length, 0); const out = new Float32Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
  const selRange = () => { if (!sel || !audio) return null; const a = Math.max(0, Math.min(sel.a, sel.b)), b = Math.min(audio.samples.length, Math.max(sel.a, sel.b)); return b > a ? { a, b } : null; };
  const applySamples = (next: Float32Array) => {
    if (!audio) return;
    const sr = audio.sampleRate || 22050;
    // Constrói o que PODE lançar (createBuffer/encode) ANTES de tocar no estado — se falhar, mostra
    // erro e não corrompe a UI (evita tela preta por exceção em render).
    let ab: AudioBuffer, raw: Uint8Array;
    try {
      const ctx = getCtx();
      ab = ctx.createBuffer(1, Math.max(1, next.length), sr);
      if (next.length) ab.copyToChannel(next, 0);
      raw = samplesToWav16(next, sr);
    } catch (e: any) { setErr(t('Edição falhou: ', 'Edit failed: ') + (e?.message || e)); return; }
    bufRef.current = ab; rawRef.current = raw;                               // re-decode/export refletem a edição
    setAudio({ ...audio, samples: next, durationSec: next.length / sr });
    stop(); posRef.current = 0; lastPosRef.current = 0; setView({ start: 0, len: 1 }); setSel(null); setFrame(f => f + 1);
  };
  const edit = (next: Float32Array) => { if (!audio) return; undoRef.current.push(audio.samples); if (undoRef.current.length > 8) undoRef.current.shift(); redoRef.current = []; applySamples(next); setHist(h => h + 1); };
  const undo = () => { if (!audio || !undoRef.current.length) return; redoRef.current.push(audio.samples); applySamples(undoRef.current.pop()!); setHist(h => h + 1); };
  const redo = () => { if (!audio || !redoRef.current.length) return; undoRef.current.push(audio.samples); applySamples(redoRef.current.pop()!); setHist(h => h + 1); };
  const doCut = () => { const r = selRange(); if (!r || !audio) return; clipRef.current = audio.samples.slice(r.a, r.b); edit(cat(audio.samples.slice(0, r.a), audio.samples.slice(r.b))); };
  const doCopy = () => { const r = selRange(); if (!r || !audio) return; clipRef.current = audio.samples.slice(r.a, r.b); setHist(h => h + 1); };
  const doPaste = () => { if (!audio || !clipRef.current) return; const r = selRange(); const at = r ? r.a : Math.floor(posRef.current * audio.sampleRate); edit(cat(audio.samples.slice(0, at), clipRef.current, audio.samples.slice(at))); };
  const doDelete = () => { const r = selRange(); if (!r || !audio) return; edit(cat(audio.samples.slice(0, r.a), audio.samples.slice(r.b))); };
  const doTrim = () => { const r = selRange(); if (!r || !audio) return; edit(audio.samples.slice(r.a, r.b)); };
  // Normaliza: se houver SELEÇÃO, só o trecho selecionado; senão a onda toda.
  const doNormalize = () => {
    if (!audio) return;
    try {
      const r = selRange();
      const a = r ? r.a : 0, b = r ? r.b : audio.samples.length;
      let mx = 0; for (let i = a; i < b; i++) { const x = Math.abs(audio.samples[i]); if (x > mx) mx = x; }
      if (mx < 1e-4) { setErr(t('Trecho silencioso — nada para normalizar.', 'Silent range — nothing to normalize.')); return; }
      const g = 0.99 / mx, n = new Float32Array(audio.samples);              // cópia; só o trecho [a,b) é escalado
      for (let i = a; i < b; i++) n[i] = audio.samples[i] * g;
      edit(n);
    } catch (e: any) { setErr('Normalizar: ' + (e?.message || e)); }
  };

  // ───────── K4 — gravar fita REAL (line-in via Web Audio) ─────────
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as any });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const gain = ctx.createGain(); gain.gain.value = 0;                    // muta o retorno (sem microfonia)
      const chunks: Float32Array[] = [];
      proc.onaudioprocess = (e: any) => { const d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d)); let mx = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > mx) mx = a; } setVu(mx); };
      src.connect(proc); proc.connect(gain); gain.connect(ctx.destination);
      recRef.current = { stream, ctx, proc, src, gain, chunks, sampleRate: ctx.sampleRate };
      setErr(''); setRecording(true);
    } catch (e: any) { setErr(t('REC: microfone/line-in negado ou indisponível. ', 'REC: mic/line-in denied or unavailable. ') + (e?.message || '')); }
  };
  const stopRec = async () => {
    const r = recRef.current; if (!r) return;
    try { r.proc.disconnect(); r.src.disconnect(); r.gain.disconnect(); r.stream.getTracks().forEach((tr: any) => tr.stop()); await r.ctx.close(); } catch { /* */ }
    recRef.current = null; setRecording(false); setVu(0);
    const total = r.chunks.reduce((a: number, c: Float32Array) => a + c.length, 0);
    if (!total) { setErr(t('Gravação vazia.', 'Empty recording.')); return; }
    const all = new Float32Array(total); let o = 0; for (const c of r.chunks) { all.set(c, o); o += c.length; }
    await loadBytes(samplesToWav16(all, r.sampleRate), 'gravacao.wav');
  };
  const toggleRec = () => { if (recording) stopRec(); else startRec(); };
  // REC pede confirmação de sobrescrita só ao INICIAR sobre uma onda não-vazia (parar não pergunta).
  const onRecClick = () => { if (recording) { toggleRec(); return; } if (audio) setConfirm('rec'); else toggleRec(); };
  // EJECT: pede confirmação se há onda carregada (e avisa de edições não salvas); confirmado → limpa tudo.
  const onEjectClick = () => { if (audio) setConfirm('eject'); };
  const clearTape = () => {
    stop();
    setAudio(null); rawRef.current = null;
    setDecoded(null); setFileBytes(null); setFileMeta(null); setSel(null); setSrcSize(0);
    setStreamBytes(null); streamRef.current = null; setHexRevealN(0);
    undoRef.current = []; redoRef.current = []; clipRef.current = null; bufRef.current = null;
    posRef.current = 0; lastPosRef.current = 0; reelL.current = 0; reelR.current = 0;
    setView({ start: 0, len: 1 }); setErr(''); setHist(h => h + 1); setFrame(f => f + 1);
  };
  const confirmYes = () => { const k = confirm; setConfirm(null); if (k === 'rec') toggleRec(); else if (k === 'eject') clearTape(); };
  // K8 — ajuste fino por clique: Limiar ±0.5 µs (faixa 500–720), Amplitude mín. ±0.01 (faixa 0–0.30).
  const nudgeMid = (d: number) => setDec(s => ({ ...s, midUs: Math.max(500, Math.min(720, Math.round((s.midUs + d) * 2) / 2)) }));
  const nudgeAmp = (d: number) => setDec(s => ({ ...s, minAmp: Math.max(0, Math.min(0.3, Math.round((s.minAmp + d) * 100) / 100)) }));

  // K6 — abre o 1º arquivo BASIC da fita no editor BASIC (detokeniza no App).
  const openInBasic = async () => {
    if (!rawRef.current || !decoded?.foundSync) return;
    const i = decoded.files.findIndex((f: any) => f.ftype === 0);
    if (i < 0) { setErr(t('Nenhum arquivo BASIC na fita.', 'No BASIC file on the tape.')); return; }
    const r = await window.cocoApi.k7FileBytes(rawRef.current, dec, i);
    if (!r?.success) { setErr('BASIC: ' + r?.error); return; }
    onOpenBasic?.(new Uint8Array(r.data), r.name || 'FITA.BAS');
  };
  const openDialog = async () => {
    const r = await window.cocoApi.xroarPickFile('tape');
    if (r?.cancelled) return;
    if (!r?.success) { setErr('Erro: ' + r?.error); return; }
    await loadBytes(new Uint8Array(r.data), r.name);
  };

  // ---- player (Web Audio) ----
  const tickLoop = () => {
    const ctx = ctxRef.current;
    if (ctx && srcRef.current) {
      const pos = Math.min(anchorOffRef.current + (ctx.currentTime - anchorCtxRef.current) * speed, audio?.durationSec ?? 0);
      const dPos = pos - lastPosRef.current; lastPosRef.current = pos; posRef.current = pos;
      // carretéis: o de recolhimento (esq) cresce, o de alimentação (dir) encolhe; vel angular ∝ 1/raio
      const p = audio ? pos / audio.durationSec : 0;
      const rTake = 4 + 7 * p, rSupply = 11 - 7 * p;
      reelL.current += dPos * 520 / Math.max(2, rTake);
      reelR.current += dPos * 520 / Math.max(2, rSupply);
      autoFollow(pos);
      setFrame(f => f + 1);
      // Revelação progressiva — throttle ~7 quadros (≈8x/s) p/ não reconstruir a 60fps.
      const fb = fileBytesRef.current;
      if (audio && ++revealCntRef.current >= 7) {
        revealCntRef.current = 0;
        // BASIC: revela o arquivo padrão (loader) ancorado em ~200 B/s.
        if (fb) { const lw = Math.max(0.3, Math.min(audio.durationSec, fb.length / 200)); setRevealN(Math.min(fb.length, Math.ceil(Math.min(1, pos / lw) * fb.length))); }
        // HEX: revela o STREAM CRU conforme o playhead passa pelo tempo de cada byte (fita inteira).
        const st = streamRef.current;
        if (st && st.times.length) { let lo = 0, hi = st.times.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (st.times[mid] <= pos) lo = mid + 1; else hi = mid; } setHexRevealN(lo); }
      }
      if (audio && pos >= audio.durationSec) { stop(); posRef.current = audio.durationSec; setRevealN(fileBytesRef.current ? fileBytesRef.current.length : 0); setHexRevealN(streamRef.current ? streamRef.current.bytes.length : 0); setFrame(f => f + 1); return; }
    }
    rafRef.current = requestAnimationFrame(tickLoop);
  };
  const startSource = (fromSec: number) => {
    const ctx = getCtx(), buf = bufRef.current; if (!buf) return;
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = speed; src.connect(ctx.destination);
    src.onended = () => { /* fim natural tratado no loop */ };
    anchorCtxRef.current = ctx.currentTime; anchorOffRef.current = fromSec; lastPosRef.current = fromSec; posRef.current = fromSec;
    src.start(0, fromSec);
    srcRef.current = src; setPlaying(true);
    cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(tickLoop);
  };
  const play = () => {
    if (playing || starting || !bufRef.current) return;
    const from = posRef.current >= (audio?.durationSec ?? 0) ? 0 : posRef.current;
    // Espelhando: dispara a mini-XRoar (reset → CLOAD/CLOADM) e SÓ inicia o áudio quando ela avisar que
    // o comando foi digitado (onMiniCommandIssued) — assim o CoCo já está pronto p/ ler quando o som toca.
    // Fallback: se a mini não sinalizar em 8s, toca mesmo assim.
    if (mirrorXroar && rawRef.current) {
      mirrorFromRef.current = from;
      startingRef.current = true; setStarting(true);
      triggerMini();
      mirrorDelayRef.current = window.setTimeout(() => { mirrorDelayRef.current = 0; startingRef.current = false; setStarting(false); startSource(from); }, 8000);
    } else {
      startSource(from);
    }
  };
  // A mini terminou de digitar CLOAD/CLOADM → inicia o áudio (se ainda estiver aguardando este play).
  const onMiniCommandIssued = () => {
    if (!startingRef.current) return;
    if (mirrorDelayRef.current) { clearTimeout(mirrorDelayRef.current); mirrorDelayRef.current = 0; }
    startingRef.current = false; setStarting(false);
    startSource(mirrorFromRef.current);
  };
  function stop() {
    if (mirrorDelayRef.current) { clearTimeout(mirrorDelayRef.current); mirrorDelayRef.current = 0; }
    startingRef.current = false; setStarting(false);
    if (srcRef.current) { try { srcRef.current.onended = null; srcRef.current.stop(); } catch { /* */ } srcRef.current = null; } cancelAnimationFrame(rafRef.current); setPlaying(false);
  }
  const pause = () => stop();
  const stopReset = () => { stop(); posRef.current = 0; lastPosRef.current = 0; reelL.current = 0; reelR.current = 0; setFrame(f => f + 1); };
  const rewind = () => { const wasPlaying = playing; stop(); posRef.current = 0; setFrame(f => f + 1); if (wasPlaying) startSource(0); };
  const seek = (sec: number) => { const wasPlaying = playing; const s = Math.max(0, Math.min(sec, audio?.durationSec ?? 0)); stop(); posRef.current = s; lastPosRef.current = s; setFrame(f => f + 1); if (wasPlaying) startSource(s); };
  const rateFor = (k: SpeedKey) => k === 'epoca' ? epochRate : k === 'half' ? 0.5 : k === 'quarter' ? 0.25 : k === 'x2' ? 2 : k === 'x4' ? 4 : 1;
  const changeSpeed = (k: SpeedKey) => { setSpeedKey(k); const sp = rateFor(k); setSpeed(sp); if (playing) { stop(); setTimeout(() => startSourceAt(posRef.current, sp), 0); } };
  const startSourceAt = (fromSec: number, sp: number) => { const ctx = getCtx(), buf = bufRef.current; if (!buf) return; const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = sp; src.connect(ctx.destination); anchorCtxRef.current = ctx.currentTime; anchorOffRef.current = fromSec; lastPosRef.current = fromSec; src.start(0, fromSec); srcRef.current = src; setPlaying(true); cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(tickLoop); };
  useEffect(() => () => stop(), []);                               // limpa ao desmontar

  // ---- zoom / scroll / follow ----
  const zoom = (factor: number, centerFrac?: number) => setView(v => {
    const len = Math.min(1, Math.max(0.002, v.len * factor));
    const c = centerFrac ?? (v.start + v.len / 2);
    let start = c - len / 2; start = Math.max(0, Math.min(start, 1 - len));
    return { start, len };
  });
  const autoFollow = (pos: number) => {
    if (!audio) return;
    setView(v => {
      if (v.len >= 0.999) return v;                                // tudo visível → não segue
      const pf = pos / audio.durationSec;
      if (pf >= v.start && pf <= v.start + v.len) return v;         // playhead visível
      let start = pf - v.len / 2; start = Math.max(0, Math.min(start, 1 - v.len));
      return { start, len: v.len };
    });
  };
  // scrollbar horizontal do zoom: centraliza a janela no clique e arrasta para navegar
  const scrollTo = (frac: number) => setView(v => ({ ...v, start: Math.max(0, Math.min(frac - v.len / 2, 1 - v.len)) }));
  const onScrollMouseDown = (e: React.MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); scrollDrag.current = { left: r.left, width: r.width }; scrollTo((e.clientX - r.left) / r.width); };
  useEffect(() => {
    const move = (e: MouseEvent) => { const d = scrollDrag.current; if (!d) return; scrollTo((e.clientX - d.left) / d.width); };
    const up = () => { scrollDrag.current = null; };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  // ---- desenho da waveform (janela [start,start+len]) ----
  const draw = () => {
    const c = canvasRef.current, box = waveBoxRef.current; if (!c || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, box.clientWidth), h = Math.max(1, box.clientHeight);
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0a0f18'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    if (!audio) return;
    const s = audio.samples;
    const vStart = Math.floor(view.start * s.length), vLen = Math.max(1, Math.floor(view.len * s.length));
    const step = vLen / w;
    ctx.strokeStyle = WAVE_COLOR; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const a = vStart + Math.floor(x * step), b = Math.max(a + 1, vStart + Math.floor((x + 1) * step));
      let mn = 1, mx = -1;
      for (let i = a; i < b && i < s.length; i++) { const v = s[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mn > mx) { mn = 0; mx = 0; }
      ctx.moveTo(x + 0.5, (1 - (mx * 0.48 + 0.5)) * h);
      ctx.lineTo(x + 0.5, (1 - (mn * 0.48 + 0.5)) * h);
    }
    ctx.stroke();
    const sr = selRange();                                         // K3: realça a seleção
    if (sr) {
      const x1 = ((sr.a / s.length - view.start) / view.len) * w, x2 = ((sr.b / s.length - view.start) / view.len) * w;
      ctx.fillStyle = 'rgba(255,140,26,0.18)'; ctx.fillRect(Math.min(x1, x2), 0, Math.abs(x2 - x1), h);
    }
  };
  useEffect(() => { draw(); }, [audio, view, sel]);
  useEffect(() => { const box = waveBoxRef.current; if (!box) return; const ro = new ResizeObserver(() => draw()); ro.observe(box); return () => ro.disconnect(); }, [audio, view, sel]);

  // playhead (fração 0..1 dentro da janela) + clique p/ seek
  const dur = audio?.durationSec || 1;
  const playFrac = audio ? (posRef.current / dur - view.start) / view.len : 0;
  const xToSample = (clientX: number, el: HTMLElement) => { const r = el.getBoundingClientRect(); const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width)); return Math.floor((view.start + frac * view.len) * (audio?.samples.length || 0)); };
  const onWaveMouseDown = (e: React.MouseEvent) => { if (!audio) return; selDrag.current = { x0: e.clientX, sample0: xToSample(e.clientX, e.currentTarget as HTMLElement), moved: false }; };
  const onWaveMouseMove = (e: React.MouseEvent) => { if (!selDrag.current || !audio) return; if (Math.abs(e.clientX - selDrag.current.x0) > 3) { selDrag.current.moved = true; setSel({ a: selDrag.current.sample0, b: xToSample(e.clientX, e.currentTarget as HTMLElement) }); } };
  const onWaveMouseUp = () => { if (!selDrag.current || !audio) return; if (!selDrag.current.moved) { seek(selDrag.current.sample0 / audio.sampleRate); setSel(null); } selDrag.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    if (!audio) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const centerFrac = view.start + ((e.clientX - r.left) / r.width) * view.len;
    zoom(e.deltaY < 0 ? 0.8 : 1.25, centerFrac);
  };

  // ---- drag-and-drop ----
  const onDragOver = (e: React.DragEvent) => { if (Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); if (!dragOver) setDragOver(true); } };
  const onDragLeave = (e: React.DragEvent) => { if (e.currentTarget === e.target) setDragOver(false); };
  const onDrop = async (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (!f) return; try { await loadBytes(new Uint8Array(await f.arrayBuffer()), f.name); } catch (er: any) { setLoading(false); setErr('Erro: ' + er.message); } };

  // ---- helpers de render ----
  const GREEN = '#34d399';
  const tool = (icon: React.ReactNode, label: string, onClick?: () => void, enabled = false, title?: string): React.ReactNode => (
    <button onClick={onClick} disabled={!enabled} className="dsk-tool flex items-center gap-1" style={{ color: enabled ? GREEN : undefined, opacity: enabled ? 1 : 0.45 }} title={title || label}>{icon}<span className="text-[11px]">{label}</span></button>
  );
  const ebtn = (icon: React.ReactNode, title: string, onClick: () => void, enabled: boolean): React.ReactNode => (
    <button onClick={onClick} disabled={!enabled} className="dsk-tool" style={{ padding: '3px 6px', color: enabled ? GREEN : undefined, opacity: enabled ? 1 : 0.45 }} title={title}>{icon}</button>
  );
  const sep = <div style={{ width: 1, height: 16, background: 'var(--border)' }} />;
  const transBtn = (icon: React.ReactNode, title: string, onClick: () => void, on = false) => (
    <button onClick={onClick} disabled={!audio} className="dsk-tool" style={{ padding: '3px 8px', opacity: audio ? 1 : 0.4, color: ACCENT, fontWeight: on ? 700 : 400 }} title={title}>{icon}</button>
  );
  const panelTitle = 'text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1';
  const pProg = audio ? posRef.current / dur : 0;
  const rTake = 4 + 7 * pProg, rSupply = 11 - 7 * pProg;            // raios atuais dos carretéis
  const f0 = decoded?.files?.[0];                                  // 1º arquivo decodificado (K2)
  // Fita TURBO/loader: a parte padrão decodificada (≈ tamanho/200 s) é bem menor que a fita toda →
  // há tela/loader/jogo turbo que o decoder padrão NÃO lê (só vive no áudio). Usado p/ avisar no export.
  const hasTurbo = !!(audio && fileBytes && audio.durationSec > (fileBytes.length / 200) * 1.6 + 2);
  const hex4 = (n: number) => '$' + (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const fmtSz = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B');
  // Classe de RAM do CoCo que comportaria o programa (4K/8K/16K/32K/64K).
  const cocoMem = (n: number) => { const kb = n / 1024; const c = [4, 8, 16, 32, 64].find(x => kb <= x); return c ? `${c}K` : '>64K'; };
  // Revelação progressiva (efeito UX): o hex/BASIC vão surgindo "carregando". A CONTAGEM (revealN) é
  // atualizada por INTERVALO (~8x/s) num useEffect — desacoplada do rAF de 60fps p/ NÃO travar
  // reconstruindo o hex a cada quadro. Aqui só derivamos a fração revelada para fatiar texto/cursor.
  const revealFrac = (fileBytes && fileBytes.length) ? Math.max(0, Math.min(1, revealN / fileBytes.length)) : 1;
  // BASIC detokenizado por completo (uma vez); o "datilografar" progressivo é fatiar o TEXTO no render.
  const basicFull = useMemo(() => {
    if (!fileBytes || !fileMeta) return null;
    if (fileMeta.ftype !== 0) return { kind: 'ml' as const };
    if (!detokenize) return { kind: 'fail' as const };
    const d = detokenize(fileBytes);
    return (d.tokenized || !d.text.trim()) ? { kind: 'fail' as const } : { kind: 'text' as const, text: d.text };
  }, [fileBytes, fileMeta, detokenize]);
  // Fatiado (revelação) + quebrado em 32 col — MEMOIZADO por revealN p/ não recomputar a 60fps (travava perto do fim).
  const basicView = useMemo(() => {
    if (basicFull?.kind !== 'text') return basicFull;
    const frac = (fileBytes && fileBytes.length) ? Math.min(1, revealN / fileBytes.length) : 1;
    return { kind: 'text' as const, text: wrap32(basicFull.text.slice(0, Math.ceil(frac * basicFull.text.length))) };
  }, [basicFull, revealN, fileBytes]);
  // HEX dos bytes JÁ "lidos" (até revealN). Recalcula a cada quadro durante o play (revealN muda).
  const hexLines = useMemo(() => {
    const sb = streamBytes;
    if (!sb) return '';
    const n = hexRevealN;
    const lines: string[] = [];
    for (let o = 0; o < n; o += 16) {
      let hx = '', asc = '';
      for (let i = 0; i < 16; i++) { const j = o + i; if (j < n) { const b = sb[j]; hx += b.toString(16).padStart(2, '0') + ' '; asc += (b >= 32 && b < 127) ? String.fromCharCode(b) : '.'; } else hx += '   '; }
      lines.push(o.toString(16).padStart(4, '0') + '  ' + hx + ' ' + asc);
    }
    return lines.join('\n');
  }, [streamBytes, hexRevealN]);
  // Janela de "carga" (s) ancorada na taxa real do cassete CoCo (~200 B/s) — usada p/ mapear o
  // playhead → bytes revelados. A ATUALIZAÇÃO durante o play é feita no tickLoop (throttle), que
  // comprovadamente roda. Aqui só inicializamos: sem arquivo → 0; parado → tudo; ao dar play → ponto atual.
  const loadWindow = fileBytes ? Math.max(0.3, Math.min(audio?.durationSec || 1, fileBytes.length / 200)) : 1;
  useEffect(() => { fileBytesRef.current = fileBytes; }, [fileBytes]);
  useEffect(() => {
    if (!fileBytes) { setRevealN(0); return; }
    if (!playing) { setRevealN(fileBytes.length); return; }
    setRevealN(Math.min(fileBytes.length, Math.ceil(Math.min(1, posRef.current / loadWindow) * fileBytes.length)));
  }, [playing, fileBytes, loadWindow]);
  // HEX (stream cru): parado/pausado → tudo (estudo); ao tocar, recomeça da posição atual (revela por tempo).
  useEffect(() => {
    if (!streamBytes) { setHexRevealN(0); return; }
    if (!playing) { setHexRevealN(streamBytes.length); return; }
    const st = streamRef.current; const pos = posRef.current;
    if (st) { let lo = 0, hi = st.times.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (st.times[mid] <= pos) lo = mid + 1; else hi = mid; } setHexRevealN(lo); }
  }, [playing, streamBytes]);
  // Manda a fita atual p/ a mini-XRoar rodar (reset + CLOAD/CLOADM). Vale mesmo sem sync no nosso
  // decoder (fitas com loader turbo rodam no XRoar) — aí assume CLOADM (jogos ML).
  const triggerMini = () => {
    if (!rawRef.current) return;
    const base = (audio?.name || 'fita').replace(/\.[^.]+$/, '') || 'fita';
    const ftype = decoded?.files?.[0]?.ftype ?? 2;
    setMiniLoad({ name: base + '.wav', data: rawRef.current, ftype, key: Date.now() });
  };
  // Persiste as configurações da aba K7 sempre que qualquer uma muda.
  useEffect(() => {
    try {
      localStorage.setItem('k7Settings', JSON.stringify({
        midUs: dec.midUs, minAmp: dec.minAmp, speedKey, extFmt, mirror: mirrorXroar, panelW,
      }));
    } catch { /* ignore */ }
  }, [dec.midUs, dec.minAmp, speedKey, extFmt, mirrorXroar, panelW]);
  // Splitter: começa o arraste entre dois painéis adjacentes (o par mantém a soma de pesos).
  const onSplitDown = (e: React.MouseEvent, leftK: 'basic' | 'hex', rightK: 'hex' | 'mini') => {
    const row = panelsRowRef.current; if (!row) return;
    e.preventDefault();
    const visible: Array<'basic' | 'hex' | 'mini'> = mirrorXroar ? ['basic', 'hex', 'mini'] : ['basic', 'hex'];
    const totalW = visible.reduce((s, k) => s + panelW[k], 0);
    const totalPx = row.clientWidth;
    const sum = panelW[leftK] + panelW[rightK];
    splitDrag.current = { leftK, rightK, x0: e.clientX, pairPx: (sum / totalW) * totalPx, l0Px: (panelW[leftK] / totalW) * totalPx, sum };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = splitDrag.current; if (!d) return;
      const minPx = 60;
      const newLeftPx = Math.max(minPx, Math.min(d.pairPx - minPx, d.l0Px + (e.clientX - d.x0)));
      const leftW = (newLeftPx / d.pairPx) * d.sum;
      setPanelW(w => ({ ...w, [d.leftK]: leftW, [d.rightK]: d.sum - leftW }));
    };
    const up = () => { splitDrag.current = null; };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);
  const splitter = (leftK: 'basic' | 'hex', rightK: 'hex' | 'mini') => (
    <div onMouseDown={e => onSplitDown(e, leftK, rightK)} title={t('Arraste para redimensionar os painéis', 'Drag to resize the panels')}
      style={{ width: 6, flexShrink: 0, cursor: 'col-resize', alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 2, height: '40%', minHeight: 16, borderRadius: 2, background: 'var(--border)' }} />
    </div>
  );
  // durante o play, acompanha o fim da leitura (rola hex e BASIC para baixo conforme preenchem)
  useEffect(() => {
    if (!playing) return;
    if (hexScrollRef.current) hexScrollRef.current.scrollTop = hexScrollRef.current.scrollHeight;
    if (basicScrollRef.current) basicScrollRef.current.scrollTop = basicScrollRef.current.scrollHeight;
  }, [revealN, hexRevealN, playing]);

  const reel = (cx: number, r: number, ang: number) => (
    <g>
      <circle cx={cx} cy={16} r={r} fill="#3a2a18" stroke={ACCENT} strokeWidth={0.6} />
      <g transform={`rotate(${ang} ${cx} 16)`}>
        {[0, 60, 120, 180, 240, 300].map(a => <line key={a} x1={cx} y1={16} x2={cx + (r - 0.5) * Math.cos(a * Math.PI / 180)} y2={16 + (r - 0.5) * Math.sin(a * Math.PI / 180)} stroke="rgba(148,163,184,0.5)" strokeWidth={1.2} />)}
      </g>
      <circle cx={cx} cy={16} r={3} fill="#0e1726" stroke={ACCENT} strokeWidth={0.6} />
    </g>
  );

  return (
    <div className="h-full flex flex-col" style={{ minHeight: 0, position: 'relative' }} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(255,140,26,0.08)', border: `2px dashed ${ACCENT}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(2,6,12,0.9)', padding: '10px 18px', borderRadius: 8, color: ACCENT, fontWeight: 700, fontSize: 13 }}><AudioLines size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: '-3px' }} />{t('Solte a fita (.wav/.cas/.voc/.c10) para abrir', 'Drop the tape (.wav/.cas/.voc/.c10) to open')}</div>
        </div>
      )}

      {/* CONFIRMAÇÃO de sobrescrita (REC) / ejeção (Eject) */}
      {confirm && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(2,6,12,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirm(null)}>
          <div className="glass-panel" style={{ padding: 18, maxWidth: 360, border: `1px solid ${ACCENT}` }} onClick={e => e.stopPropagation()}>
            <div className="text-[13px] font-bold mb-2" style={{ color: ACCENT }}>
              {confirm === 'rec' ? t('Gravar por cima?', 'Record over?') : t('Ejetar a fita?', 'Eject the tape?')}
            </div>
            <div className="text-[11px] mb-3" style={{ color: 'var(--text-secondary)' }}>
              {confirm === 'rec'
                ? t('Já há uma onda carregada. Gravar agora vai substituí-la.', 'There is already a waveform loaded. Recording now will replace it.')
                : t('Isso limpa a onda atual.', 'This clears the current waveform.')}
              {undoRef.current.length > 0 && ' ' + t('Há edições não exportadas — salve antes (→CAS/→WAV/Extrair) se quiser mantê-las.', 'There are unexported edits — save first (→CAS/→WAV/Extract) if you want to keep them.')}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="dsk-tool text-[11px]" style={{ padding: '4px 10px' }}>{t('Cancelar', 'Cancel')}</button>
              <button onClick={confirmYes} className="dsk-tool text-[11px]" style={{ padding: '4px 10px', color: confirm === 'rec' ? '#f87171' : ACCENT, fontWeight: 700 }}>{confirm === 'rec' ? t('Gravar', 'Record') : t('Ejetar', 'Eject')}</button>
            </div>
          </div>
        </div>
      )}

      {/* BARRA DE FERRAMENTAS */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--border)] flex-wrap flex-shrink-0">
        {tool(<FolderOpen size={14} />, t('Abrir', 'Open'), openDialog, true, t('Abrir uma fita do PC (.wav, .cas, .voc, .c10) — também pode arrastar e soltar na onda', 'Open a tape from the PC (.wav, .cas, .voc, .c10) — you can also drag-and-drop onto the wave'))}
        {tool(<Download size={14} />, '→ CAS', () => exportClean('cas'), !!decoded?.foundSync && !exporting, t('NORMALIZAR: salvar um .CAS LIMPO e minúsculo só com os dados decodificados (padrão CoCo/Dragon)', 'NORMALIZE: save a CLEAN, tiny .CAS with just the decoded data (standard CoCo/Dragon)'))}
        {tool(<Download size={14} />, '→ WAV', () => exportClean('wav'), !!decoded?.foundSync && !exporting, t('NORMALIZAR: salvar um .WAV LIMPO a 11 kHz, bem menor que a captura original, que lê confiável no hardware', 'NORMALIZE: save a CLEAN 11 kHz .WAV, much smaller than the original capture, reliable on real hardware'))}
        {tool(<Download size={14} />, t('→ Fita completa', '→ Full tape'), exportFullWav, !!audio && !exporting, t('Salvar a FITA COMPLETA (.wav do áudio original) — captura TUDO: header, tela, loader e jogo turbo. Use p/ fitas com tela de abertura, que rodam inteiras no XRoar.', 'Save the FULL TAPE (.wav of the original audio) — captures EVERYTHING: header, screen, loader and turbo game. Use for tapes with an opening screen that run fully in XRoar.'))}
        {tool(<FileCode2 size={14} />, '→ BASIC', openInBasic, !!decoded?.files?.some((f: any) => f.ftype === 0), t('Abrir o programa BASIC lido da fita no editor BASIC (detokeniza automaticamente)', 'Open the BASIC program read from the tape in the BASIC editor (auto-detokenizes)'))}
        {tool(<ArrowRightLeft size={14} />, '↔ DSK', () => { if (rawRef.current && fileMeta && onSendToDsk) onSendToDsk(rawRef.current, { midUs: dec.midUs, minAmp: dec.minAmp }, 0); }, !!(rawRef.current && fileMeta && onSendToDsk), t('Gravar o arquivo lido (BASIC/ML) num painel DSK', 'Write the read file (BASIC/ML) into a DSK pane'))}
        {tool(<MonitorPlay size={14} />, '→ XRoar', () => { if (rawRef.current && audio && onSendToXroar) onSendToXroar(rawRef.current, audio.name); }, !!(rawRef.current && audio && onSendToXroar), t('Carregar esta fita no emulador XRoar', 'Load this tape into the XRoar emulator'))}
        <button onClick={() => setMirrorXroar(v => !v)} className="dsk-tool flex items-center gap-1" style={{ color: mirrorXroar ? ACCENT : GREEN, fontWeight: mirrorXroar ? 700 : 400 }} title={t('Espelhar no mini-XRoar (mudo): ao dar PLAY, reseta e roda CLOAD/CLOADM numa tela embutida ao lado do hex', 'Mirror in the mini-XRoar (muted): on PLAY, resets and runs CLOAD/CLOADM in an embedded screen next to the hex')}><MonitorPlay size={14} /><span className="text-[11px]">{t('Espelhar', 'Mirror')}{mirrorXroar ? ' ✓' : ''}</span></button>
        {sep}
        {tool(<Undo2 size={14} />, t('Desfazer', 'Undo'), undo, undoRef.current.length > 0, t('Desfazer a última edição da onda', 'Undo the last waveform edit'))}
        {tool(<Redo2 size={14} />, t('Refazer', 'Redo'), redo, redoRef.current.length > 0, t('Refazer a edição desfeita', 'Redo the undone edit'))}
        {sep}
        {ebtn(<Scissors size={14} />, t('Recortar a seleção (move p/ a área de transferência)', 'Cut the selection (moves it to the clipboard)'), doCut, !!selRange())}
        {ebtn(<Copy size={14} />, t('Copiar a seleção', 'Copy the selection'), doCopy, !!selRange())}
        {ebtn(<ClipboardPaste size={14} />, t('Colar no início da seleção (ou no playhead)', 'Paste at the selection start (or at the playhead)'), doPaste, !!clipRef.current)}
        {ebtn(<Trash2 size={14} />, t('Excluir a seleção', 'Delete the selection'), doDelete, !!selRange())}
        {ebtn(<Crop size={14} />, t('Recortar p/ a seleção (mantém só o trecho selecionado)', 'Crop to the selection (keep only the selected part)'), doTrim, !!selRange())}
        {ebtn(<Maximize2 size={14} />, t('Normalizar a amplitude (melhora a decodificação)', 'Normalize the amplitude (improves decoding)'), doNormalize, !!audio)}
        <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold flex items-center gap-1"><AudioLines size={13} /> K7</span>
      </div>

      {/* CORPO */}
      <div className="flex-1 flex" style={{ minHeight: 0 }}>
        <div className="flex-1 flex flex-col" style={{ minHeight: 0, padding: 10, gap: 10 }}>
          {/* WAVEFORM + playhead + zoom */}
          <div ref={waveBoxRef} className="glass-panel" style={{ flex: '1 1 0%', minHeight: 56, maxHeight: '25%', overflow: 'hidden', position: 'relative', cursor: audio ? 'text' : 'default' }} onMouseDown={onWaveMouseDown} onMouseMove={onWaveMouseMove} onMouseUp={onWaveMouseUp} onMouseLeave={onWaveMouseUp} onWheel={onWheel}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            {audio && playFrac >= 0 && playFrac <= 1 && (
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${playFrac * 100}%`, width: 1.5, background: '#fbbf24', boxShadow: '0 0 6px #fbbf24', pointerEvents: 'none' }} />
            )}
            {audio && (
              <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                <span className="font-mono text-[10px] px-1 rounded" style={{ color: ACCENT, background: 'rgba(2,6,12,0.6)' }} title={t('Nível de zoom da onda', 'Waveform zoom level')}>{(1 / view.len).toFixed(1)}×</span>
                <button onClick={() => zoom(0.7)} className="dsk-tool" style={{ padding: '2px 5px' }} title={t('Aproximar', 'Zoom in')}><ZoomIn size={12} /></button>
                <button onClick={() => zoom(1.4)} disabled={view.len >= 0.999} className="dsk-tool" style={{ padding: '2px 5px' }} title={t('Afastar', 'Zoom out')}><ZoomOut size={12} /></button>
              </div>
            )}
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none', background: 'rgba(2,6,12,0.45)' }}>
                <span className="text-[11px] font-mono" style={{ color: ACCENT }}>{t('Carregando fita…', 'Loading tape…')} {Math.round(progress * 100)}%</span>
                <div style={{ width: '60%', maxWidth: 320, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${progress * 100}%`, height: '100%', background: ACCENT, transition: 'width 0.08s linear' }} />
                </div>
              </div>
            )}
            {!audio && !loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', pointerEvents: 'none' }}>
                <AudioLines size={32} className="text-[var(--primary)] opacity-60" />
                <span className="text-xs">{t('Arraste uma fita (.wav/.cas/.voc/.c10) aqui ou clique em Abrir', 'Drag a tape (.wav/.cas/.voc/.c10) here or click Open')}</span>
                {err && <span className="text-[11px]" style={{ color: '#fbbf24', maxWidth: 420, textAlign: 'center' }}>{err}</span>}
              </div>
            )}
          </div>

          {/* SCROLLBAR horizontal — aparece com zoom; arraste para ir e voltar na onda */}
          {audio && view.len < 0.999 && (
            <div className="flex-shrink-0" style={{ height: 9, background: 'rgba(255,255,255,0.05)', borderRadius: 4, position: 'relative', cursor: 'grab' }} onMouseDown={onScrollMouseDown} title={t('Arraste para navegar na onda (zoom)', 'Drag to scroll the wave (zoom)')}>
              <div style={{ position: 'absolute', top: 1, bottom: 1, left: `${view.start * 100}%`, width: `${Math.max(3, view.len * 100)}%`, background: ACCENT, opacity: 0.55, borderRadius: 4 }} />
            </div>
          )}

          {/* BARRA DE PROGRESSO quadriculada (estilo aba GW) — status da waveform, clicável p/ seek */}
          {audio && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="font-mono text-[10px] flex-shrink-0" style={{ color: ACCENT, width: 38 }}>{fmtTime(posRef.current)}</span>
              <div className="flex flex-1" style={{ gap: 2, cursor: 'pointer' }} onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur); }} title={t('Progresso da fita — clique para posicionar', 'Tape progress — click to seek')}>
                {Array.from({ length: 72 }).map((_, i) => {
                  const on = (i + 0.5) / 72 <= (posRef.current / dur);
                  return <div key={i} style={{ flex: 1, minWidth: 2, height: 9, borderRadius: 2, background: on ? ACCENT : 'rgba(255,140,26,0.1)' }} />;
                })}
              </div>
              <span className="font-mono text-[10px] flex-shrink-0 text-[var(--text-muted)]" style={{ width: 38, textAlign: 'right' }}>{fmtTime(audio.durationSec)}</span>
            </div>
          )}

          {/* DATACORDER animado */}
          <div className="glass-panel flex items-center gap-3" style={{ padding: '8px 12px', flexShrink: 0 }}>
            <svg width={132} height={66} viewBox="0 0 88 44" style={{ flexShrink: 0 }}>
              <rect x={1} y={1} width={86} height={42} rx={5} fill="#0b1220" stroke="rgba(148,163,184,0.35)" />
              <rect x={10} y={30} width={68} height={9} rx={2} fill="#060a12" stroke="rgba(148,163,184,0.2)" />
              {reel(28, rTake, reelL.current)}
              {reel(60, rSupply, reelR.current)}
              {/* A fita corre por BAIXO: desce do fundo de cada rolo e atravessa a abertura inferior. */}
              <polyline points={`28,${16 + rTake} 28,31 60,31 60,${16 + rSupply}`} fill="none" stroke={ACCENT_DIM} strokeWidth={1.2} />
            </svg>
            <div className="flex items-center gap-1">
              {transBtn(<Rewind size={13} />, t('Rebobinar (volta ao início)', 'Rewind (back to start)'), rewind)}
              {(playing || starting) ? transBtn(<Pause size={13} />, starting ? t('Aguardando o XRoar (3s) — clique p/ cancelar', 'Waiting for XRoar (3s) — click to cancel') : t('Pausar a reprodução', 'Pause playback'), pause, true) : transBtn(<Play size={13} />, t('Tocar a fita (áudio)', 'Play the tape (audio)'), play)}
              <button onClick={onRecClick} className="dsk-tool" style={{ padding: '3px 8px', color: '#f87171', fontWeight: recording ? 700 : 400 }} title={t('GRAVAR uma fita REAL pelo line-in/microfone do PC → vira um WAV carregado aqui. Clique de novo para parar.', 'RECORD a REAL tape via the PC line-in/mic → becomes a WAV loaded here. Click again to stop.')}>{recording ? <Square size={13} /> : <Circle size={13} />}</button>
              {transBtn(<Square size={13} />, t('Parar e voltar ao início', 'Stop and rewind to start'), stopReset)}
              {transBtn(<FastForward size={13} />, t('Ir para o fim', 'Go to the end'), () => seek(dur))}
              <button onClick={onEjectClick} disabled={!audio} className="dsk-tool" style={{ padding: '3px 8px', opacity: audio ? 1 : 0.4, color: ACCENT }} title={t('Ejetar: limpa a onda carregada (pede confirmação)', 'Eject: clears the loaded waveform (asks for confirmation)')}><ArrowUpFromLine size={13} /></button>
            </div>
            <span className="font-mono text-[12px] px-2 py-0.5 rounded" style={{ background: '#060a12', border: '1px solid var(--border)', color: starting ? '#fbbf24' : playing ? '#34d399' : ACCENT, minWidth: 64, textAlign: 'center' }} title={t('Contador (tempo) da fita', 'Tape counter (time)')}>{starting ? t('XRoar…', 'XRoar…') : fmtTime(posRef.current)}</span>
            <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]" title={t(`"Época" = velocidade-padrão do CoCo (analisada da fita: ${epochRate.toFixed(2)}×). "Normal" = como gravado. -2×/-4× desaceleram; ×2/×4 aceleram.`, `"Época" = CoCo standard speed (analyzed from tape: ${epochRate.toFixed(2)}×). "Normal" = as recorded. -2×/-4× slow down; ×2/×4 speed up.`)}>{t('Velocidade', 'Speed')}
              <select value={speedKey} onChange={e => changeSpeed(e.target.value as SpeedKey)} className="input-select text-[10px]" style={{ padding: '1px 3px' }}>
                {SPEED_OPTS.map(s => <option key={s.k} value={s.k}>{s.l}{s.k === 'epoca' ? ` (${epochRate.toFixed(2)}×)` : ''}</option>)}
              </select>
            </label>
            {recording && (
              <span className="flex items-center gap-1.5 text-[10px] ml-auto font-bold" style={{ color: '#f87171' }}>● REC
                <span style={{ display: 'inline-block', width: 54, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }} title={t('Nível de entrada (line-in)', 'Input level (line-in)')}>
                  <span style={{ display: 'block', width: `${Math.min(100, vu * 140)}%`, height: '100%', background: vu > 0.85 ? '#f87171' : '#34d399' }} />
                </span>
              </span>
            )}
          </div>

          {/* PAINÉIS: BASIC | HEX | mini-XRoar — larguras ajustáveis por splitters (pesos persistidos) */}
          <div ref={panelsRowRef} className="flex" style={{ flex: '1 1 0%', minHeight: 80 }}>
            <div className="glass-panel flex flex-col" style={{ flex: `${panelW.basic} 1 0%`, minWidth: 60, minHeight: 0, overflow: 'hidden' }}>
              <div className="px-2 py-1 border-b border-[var(--border)] text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex-shrink-0 flex justify-between"><span>{t('BASIC (detokenizado · 32 col)', 'BASIC (detokenized · 32 col)')}</span>{playing && revealFrac < 1 && <span style={{ color: '#34d399' }}>▶ {t('lendo…', 'reading…')}</span>}</div>
              <div ref={basicScrollRef} className="flex-1 overflow-auto p-2" style={{ minHeight: 0 }}>
                {!fileBytes ? <span className="text-[11px] text-[var(--text-muted)]">{decoded?.foundSync === false ? t('Sem sync — ajuste o som (K8).', 'No sync — adjust the sound (K8).') : t('Decodifique uma fita para ver o BASIC.', 'Decode a tape to see the BASIC.')}</span>
                  : basicView?.kind === 'text' ? <pre className="text-[11px] font-mono whitespace-pre" style={{ color: 'var(--text-primary, #e5e5e5)', margin: 0 }}>{basicView.text}{playing && revealFrac < 1 && <span style={{ color: '#34d399' }}>▮</span>}</pre>
                    : basicView?.kind === 'ml' ? <span className="text-[11px]" style={{ color: '#fbbf24' }}>{t('Linguagem de Máquina. Detokenização apenas para BASIC.', 'Machine Language. Detokenization is for BASIC only.')}</span>
                      : <span className="text-[11px]" style={{ color: '#fbbf24' }}>{t('Não foi possível detokenizar este BASIC.', 'Could not detokenize this BASIC.')}</span>}
              </div>
            </div>
            {splitter('basic', 'hex')}
            <div className="glass-panel flex flex-col" style={{ flex: `${panelW.hex} 1 0%`, minWidth: 60, minHeight: 0, overflow: 'hidden' }}>
              <div className="px-2 py-1 border-b border-[var(--border)] text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex-shrink-0 flex justify-between"><span>{t('Hexadecimal (fita inteira)', 'Hex (whole tape)')}</span>{streamBytes && <span className="text-[var(--text-secondary)]">{playing && hexRevealN < streamBytes.length ? `${hexRevealN} / ${streamBytes.length} B` : `${streamBytes.length} B`}</span>}</div>
              <div ref={hexScrollRef} className="flex-1 overflow-auto p-2" style={{ minHeight: 0 }}>
                {streamBytes ? <pre className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{hexLines}</pre>
                  : <span className="text-[11px] text-[var(--text-muted)]">{t('Decodifique uma fita para ver os bytes.', 'Decode a tape to see the bytes.')}</span>}
              </div>
            </div>
            {/* 3ª coluna: mini-XRoar (espelhamento opt-in, mudo) — roda CLOAD/CLOADM ao dar PLAY */}
            {mirrorXroar && splitter('hex', 'mini')}
            {mirrorXroar && <MiniXRoar lang={pt ? 'pt-br' : 'en-us'} platform={platform} active={active !== false} load={miniLoad} flexGrow={panelW.mini} onCommandIssued={onMiniCommandIssued} onLog={onLog} />}
          </div>
        </div>

        {/* COLUNA DIREITA */}
        <div style={{ width: 224, flexShrink: 0, borderLeft: '1px solid var(--border)', padding: 10, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          <div className="glass-panel p-2.5">
            <div className={panelTitle}>{t('Programa', 'Program')}</div>
            {/* Arquivo de áudio (WAV) carregado — consolidado aqui (antes ficava na status bar). */}
            <div className="flex justify-between text-[11px] py-0.5" style={{ color: 'var(--text-secondary)' }}><span className="text-[var(--text-muted)]">{t('arquivo', 'file')}</span><span className="font-mono ml-2" style={{ color: '#c4b5fd' }} title={audio?.name}>{audio ? (audio.name.length > 13 ? audio.name.slice(0, 13) + '...' : audio.name) : '—'}</span></div>
            <div className="flex justify-between text-[11px] py-0.5" style={{ color: 'var(--text-secondary)' }}><span className="text-[var(--text-muted)]">{t('extensão', 'extension')}</span><span className="font-mono">{audio ? '.' + (audio.name.split('.').pop() || '?').toUpperCase() : '—'}</span></div>
            <div className="flex justify-between text-[11px] py-0.5" style={{ color: 'var(--text-secondary)' }}><span className="text-[var(--text-muted)]">{t('arquivo (sistema)', 'file (system)')}</span><span className="font-mono" title={srcSize ? `${srcSize} bytes` : ''}>{srcSize ? fmtSz(srcSize) : '—'}</span></div>
            <div className="flex justify-between text-[11px] py-0.5" style={{ color: 'var(--text-secondary)' }}><span className="text-[var(--text-muted)]">{t('taxa', 'rate')}</span><span className="font-mono">{audio ? `${(audio.sampleRate / 1000).toFixed(1)} kHz` : '—'}</span></div>
            <div className="flex justify-between text-[11px] py-0.5" style={{ color: 'var(--text-secondary)' }}><span className="text-[var(--text-muted)]">{t('formato', 'format')}</span><span className="font-mono">{audio ? `${audio.bits}-bit · ${audio.channels === 1 ? 'mono' : `${audio.channels}ch`}` : '—'}</span></div>
            <div className="flex justify-between text-[11px] py-0.5" style={{ color: 'var(--text-secondary)' }}><span className="text-[var(--text-muted)]">{t('duração', 'length')}</span><span className="font-mono">{audio ? fmtTime(audio.durationSec) : '—'}</span></div>
            <div className="border-t border-[var(--border)] my-1" />
            {[
              [t('nome', 'name'), f0?.name || '—'],
              [t('início (load)', 'start (load)'), f0 ? hex4(f0.loadAddr) : '—'],
              [t('fim', 'end'), f0 ? hex4(f0.loadAddr + f0.sizeBytes - 1) : '—'],
              [t('execução (exec)', 'exec'), f0 ? hex4(f0.execAddr) : '—'],
              [t('tipo', 'type'), f0?.ftypeName || '—'],
              [t('programa (CoCo)', 'program (CoCo)'), f0 ? `${fmtSz(f0.sizeBytes)} · ${cocoMem(f0.sizeBytes)}` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px] py-0.5" style={{ color: 'var(--text-secondary)' }}><span className="text-[var(--text-muted)]">{k}</span><span className="font-mono truncate ml-2" style={{ maxWidth: 120 }} title={String(v)}>{v}</span></div>
            ))}
            {/* Linha isolada: status do sync */}
            <div className="mt-1 text-[10px] font-bold" style={{ color: decoding ? 'var(--text-muted)' : decoded?.foundSync ? '#34d399' : '#fbbf24' }}>
              {decoding ? t('decodificando…', 'decoding…') : !decoded ? '' : decoded.foundSync ? `✓ ${t('sync', 'sync')} · ${decoded.files.length} ${t('arq.', 'files')}` : `✗ ${t('sem sync', 'no sync')}`}
            </div>
            {hasTurbo && (
              <div className="mt-1 text-[9px] leading-tight" style={{ color: '#fbbf24' }}
                title={t('A fita é maior que a parte padrão decodificada — há tela/loader/jogo TURBO que o decoder padrão não lê. O hex/→CAS/→BIN mostram só o loader; o jogo inteiro está no áudio (use "→ Fita completa" ou rode no XRoar).', 'The tape is longer than the decoded standard part — there is a TURBO screen/loader/game the standard decoder cannot read. The hex/→CAS/→BIN show only the loader; the whole game is in the audio (use "→ Full tape" or run in XRoar).')}>
                ⚠ {t('fita turbo: hex/→CAS = só o loader; jogo completo só no áudio (→ Fita completa)', 'turbo tape: hex/→CAS = loader only; full game only in audio (→ Full tape)')}
              </div>
            )}
            {/* Linha de baixo: toggle de formato (BIN/BAS/CAS) + botão Extrair */}
            {f0 && (
              <div className="flex items-end justify-between gap-2 mt-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[8px] uppercase tracking-wider text-[var(--text-muted)]">{t('Formato', 'Format')}</span>
                  <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {(['bin', 'bas', 'cas'] as const).map(fmt => {
                      const off = fmt === 'bas' && f0.ftype !== 0;
                      return (
                        <button key={fmt} onClick={() => setExtFmt(fmt)} disabled={off}
                          className="text-[9px] font-bold uppercase"
                          style={{ padding: '1px 6px', background: extFmt === fmt ? '#34d399' : 'transparent', color: extFmt === fmt ? '#06210f' : off ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: off ? 0.4 : 1, cursor: off ? 'not-allowed' : 'pointer' }}
                          title={fmt === 'bin' ? t('Bytes crus (.bin)', 'Raw bytes (.bin)') : fmt === 'bas' ? t('BASIC em texto (.bas) — só para arquivos BASIC', 'BASIC as text (.bas) — BASIC files only') : t('Fita de emulador (.cas), tocável no XRoar/MAME', 'Emulator tape (.cas), playable in XRoar/MAME')}>{fmt}</button>
                      );
                    })}
                  </div>
                </div>
                <button onClick={() => extractFile(0)} className="dsk-tool text-[10px]" style={{ padding: '2px 8px', color: '#34d399' }} title={t('Extrair o arquivo no formato selecionado', 'Extract the file in the selected format')}>{t('Extrair', 'Extract')}</button>
              </div>
            )}
            {decoded?.files?.length > 1 && (
              <div className="mt-1 pt-1 border-t border-[var(--border)] flex flex-col gap-0.5" style={{ maxHeight: 90, overflowY: 'auto' }}>
                {decoded.files.map((f: any, i: number) => (
                  <button key={i} onClick={() => extractFile(i)} className="flex justify-between text-[10px] hover:bg-slate-800/50 rounded px-1" style={{ color: 'var(--text-secondary)' }} title={t('Extrair', 'Extract')}><span className="font-mono truncate" style={{ maxWidth: 110 }}>{f.name || '(?)'}</span><span className="text-[var(--text-muted)]">{f.ftypeName} {fmtSz(f.sizeBytes)}</span></button>
                ))}
              </div>
            )}
          </div>
          <div className="glass-panel p-2.5">
            <div className={panelTitle}>{t('Ajustes de som (K8)', 'Sound adjustments (K8)')}</div>
            <div className="flex justify-between text-[11px] py-0.5" style={{ color: 'var(--text-secondary)' }}><span className="text-[var(--text-muted)]">{t('Taxa (kHz)', 'Rate (kHz)')}</span><span className="font-mono">{audio ? (audio.sampleRate / 1000).toFixed(1) : '—'}</span></div>
            <div className="block text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              <div className="flex justify-between"><span>{t('Limiar (µs)', 'Threshold (µs)')}</span><span className="font-mono">{dec.midUs}</span></div>
              <div className="flex items-center gap-1">
                <button onClick={() => nudgeMid(-0.5)} disabled={!audio || dec.midUs <= 500} className="dsk-tool" style={{ padding: '1px 3px', color: audio ? '#34d399' : undefined }} title={t('−0,5 µs', '−0.5 µs')}><Minus size={11} /></button>
                <input type="range" min={500} max={720} step={5} value={dec.midUs} disabled={!audio} onChange={e => setDec(d => ({ ...d, midUs: Number(e.target.value) }))} className="flex-1" style={{ accentColor: '#34d399' }} />
                <button onClick={() => nudgeMid(0.5)} disabled={!audio || dec.midUs >= 720} className="dsk-tool" style={{ padding: '1px 3px', color: audio ? '#34d399' : undefined }} title={t('+0,5 µs', '+0.5 µs')}><Plus size={11} /></button>
              </div>
            </div>
            <div className="block text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              <div className="flex justify-between"><span>{t('Amplitude mín.', 'Min amplitude')}</span><span className="font-mono">{dec.minAmp.toFixed(2)}</span></div>
              <div className="flex items-center gap-1">
                <button onClick={() => nudgeAmp(-0.01)} disabled={!audio || dec.minAmp <= 0} className="dsk-tool" style={{ padding: '1px 3px', color: audio ? '#34d399' : undefined }} title={t('−0,01', '−0.01')}><Minus size={11} /></button>
                <input type="range" min={0} max={0.3} step={0.01} value={dec.minAmp} disabled={!audio} onChange={e => setDec(d => ({ ...d, minAmp: Number(e.target.value) }))} className="flex-1" style={{ accentColor: '#34d399' }} />
                <button onClick={() => nudgeAmp(0.01)} disabled={!audio || dec.minAmp >= 0.3} className="dsk-tool" style={{ padding: '1px 3px', color: audio ? '#34d399' : undefined }} title={t('+0,01', '+0.01')}><Plus size={11} /></button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1">
              <button onClick={() => setDec({ midUs: 600, minAmp: 0 })} disabled={!audio} className="dsk-tool text-[10px]" style={{ padding: '2px 6px', color: audio ? '#34d399' : undefined }} title={t('Voltar os ajustes ao padrão', 'Reset adjustments to default')}>{t('Redefinir', 'Reset')}</button>
              <span className="text-[9px] font-mono text-[var(--text-muted)]">{decoded ? `${decoded.bitCount} bits · ${decoded.byteCount} B` : ''}</span>
            </div>
            <div className="text-[9px] text-[var(--text-muted)] mt-1 leading-tight">{t('Mexa no limiar/amplitude para destravar fitas difíceis (ex.: dinowars).', 'Adjust threshold/amplitude to unlock difficult tapes (e.g. dinowars).')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
