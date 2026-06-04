import React, { useEffect, useRef, useState } from 'react';
import {
  FolderOpen, Save, Download, ArrowRightLeft, MonitorPlay, Undo2, Redo2,
  Play, Pause, Square, Circle, Rewind, FastForward, AudioLines, ZoomIn, ZoomOut,
} from 'lucide-react';

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
const SPEEDS = [{ v: 1, l: 'Época' }, { v: 2, l: '×2' }, { v: 4, l: '×4' }, { v: 8, l: '×8' }];
// Laranja do app (#ff8c1a), em versões OPACAS/apagadas — não força os olhos como o ciano forte.
const WAVE_COLOR = 'rgba(255,140,26,0.5)';   // forma de onda
const ACCENT = 'rgba(255,140,26,0.65)';      // detalhes (cassete, contador, drag)
const ACCENT_DIM = 'rgba(255,140,26,0.4)';

export function K7Tab({ lang }: { lang: string }) {
  const pt = lang === 'pt-br';
  const t = (a: string, b: string) => (pt ? a : b);
  const [audio, setAudio] = useState<Audio | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);                     // 0..1 ao carregar/decodificar o WAV
  const [dragOver, setDragOver] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [, setFrame] = useState(0);                                // bump para re-render por quadro
  const [view, setView] = useState({ start: 0, len: 1 });          // janela visível (frações 0..1)
  const [decoded, setDecoded] = useState<any>(null);               // K2: resultado do decode FSK→CAS
  const [decoding, setDecoding] = useState(false);
  const [dec, setDec] = useState({ midUs: 600, minAmp: 0 });       // K8: parâmetros de ajuste fino
  const [exporting, setExporting] = useState(false);
  const rawRef = useRef<Uint8Array | null>(null);                  // bytes crus do WAV (p/ decode/export)

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
    if (!/\.wav$/i.test(name)) { setErr(t('Por enquanto a K7 abre só .WAV (decode de .CAS/.VOC vem na K2).', 'For now K7 opens only .WAV (.CAS/.VOC decoding comes in K2).')); return; }
    reset(); setErr(''); setDecoded(null); setLoading(true); setProgress(0);
    const p = await decodeWavAsync(bytes, setProgress);
    if (!p) { setLoading(false); setErr(t('WAV inválido ou não-PCM (8/16-bit).', 'Invalid or non-PCM (8/16-bit) WAV.')); return; }
    rawRef.current = bytes;
    setAudio({ name, ...p });
    const ctx = getCtx();
    const ab = ctx.createBuffer(1, p.samples.length, p.sampleRate);
    ab.copyToChannel(p.samples, 0);
    bufRef.current = ab;
    setLoading(false);
  };
  // K2/K8 — decodifica a fita (FSK → CAS) com os parâmetros atuais; re-roda quando `dec` muda (debounce).
  const runDecode = async (params: typeof dec) => {
    if (!rawRef.current) return;
    setDecoding(true);
    try { const r = await window.cocoApi.k7Decode(rawRef.current, params); setDecoded(r?.success ? r : null); }
    finally { setDecoding(false); }
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
      setErr(t(`Salvo: ${r.path} (${(r.size / 1024).toFixed(1)} KB, ${r.files} arq.)`, `Saved: ${r.path} (${(r.size / 1024).toFixed(1)} KB, ${r.files} files)`));
    } finally { setExporting(false); }
  };
  // K5/K6 (parcial) — extrai os bytes de um arquivo decodificado da fita → PC (.bas/.bin/.dat).
  const extractFile = async (index: number) => {
    if (!rawRef.current || !decoded?.foundSync) return;
    const r = await window.cocoApi.k7ExtractFile(rawRef.current, dec, index);
    if (r?.cancelled) return;
    if (!r?.success) { setErr('Extrair: ' + r?.error); return; }
    setErr(t(`Extraído: ${r.path} (${r.size} B)`, `Extracted: ${r.path} (${r.size} B)`));
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
      if (audio && pos >= audio.durationSec) { stop(); posRef.current = audio.durationSec; setFrame(f => f + 1); return; }
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
  const play = () => { if (playing || !bufRef.current) return; startSource(posRef.current >= (audio?.durationSec ?? 0) ? 0 : posRef.current); };
  function stop() { if (srcRef.current) { try { srcRef.current.onended = null; srcRef.current.stop(); } catch { /* */ } srcRef.current = null; } cancelAnimationFrame(rafRef.current); setPlaying(false); }
  const pause = () => stop();
  const stopReset = () => { stop(); posRef.current = 0; lastPosRef.current = 0; reelL.current = 0; reelR.current = 0; setFrame(f => f + 1); };
  const rewind = () => { const wasPlaying = playing; stop(); posRef.current = 0; setFrame(f => f + 1); if (wasPlaying) startSource(0); };
  const seek = (sec: number) => { const wasPlaying = playing; const s = Math.max(0, Math.min(sec, audio?.durationSec ?? 0)); stop(); posRef.current = s; lastPosRef.current = s; setFrame(f => f + 1); if (wasPlaying) startSource(s); };
  const changeSpeed = (sp: number) => { setSpeed(sp); if (playing) { stop(); setTimeout(() => startSourceAt(posRef.current, sp), 0); } };
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
  };
  useEffect(() => { draw(); }, [audio, view]);
  useEffect(() => { const box = waveBoxRef.current; if (!box) return; const ro = new ResizeObserver(() => draw()); ro.observe(box); return () => ro.disconnect(); }, [audio, view]);

  // playhead (fração 0..1 dentro da janela) + clique p/ seek
  const dur = audio?.durationSec || 1;
  const playFrac = audio ? (posRef.current / dur - view.start) / view.len : 0;
  const onWaveClick = (e: React.MouseEvent) => {
    if (!audio) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    seek((view.start + frac * view.len) * dur);
  };
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
  const tool = (icon: React.ReactNode, label: string, onClick?: () => void, enabled = false, color?: string): React.ReactNode => (
    <button onClick={onClick} disabled={!enabled} className="dsk-tool flex items-center gap-1" style={{ color: enabled ? color : undefined, opacity: enabled ? 1 : 0.45 }} title={label}>{icon}<span className="text-[11px]">{label}</span></button>
  );
  const sep = <div style={{ width: 1, height: 16, background: 'var(--border)' }} />;
  const transBtn = (icon: React.ReactNode, title: string, onClick: () => void, on = false, color?: string) => (
    <button onClick={onClick} disabled={!audio} className="dsk-tool" style={{ padding: '3px 8px', opacity: audio ? 1 : 0.4, color: on ? (color || 'var(--primary)') : color }} title={title}>{icon}</button>
  );
  const panelTitle = 'text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1';
  const pProg = audio ? posRef.current / dur : 0;
  const rTake = 4 + 7 * pProg, rSupply = 11 - 7 * pProg;            // raios atuais dos carretéis
  const f0 = decoded?.files?.[0];                                  // 1º arquivo decodificado (K2)
  const hex4 = (n: number) => '$' + (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const fmtSz = (n: number) => (n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B');

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
          <div style={{ background: 'rgba(2,6,12,0.9)', padding: '10px 18px', borderRadius: 8, color: ACCENT, fontWeight: 700, fontSize: 13 }}><AudioLines size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: '-3px' }} />{t('Solte o WAV para abrir', 'Drop the WAV to open')}</div>
        </div>
      )}

      {/* BARRA DE FERRAMENTAS */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--border)] flex-wrap flex-shrink-0">
        {tool(<FolderOpen size={14} />, t('Abrir', 'Open'), openDialog, true, '#ff8c1a')}
        {tool(<Save size={14} />, t('Salvar', 'Save'))}
        {tool(<Download size={14} />, t('Norm.→CAS', 'Norm.→CAS'), () => exportClean('cas'), !!decoded?.foundSync && !exporting, '#34d399')}
        {tool(<Download size={14} />, t('Norm.→WAV', 'Norm.→WAV'), () => exportClean('wav'), !!decoded?.foundSync && !exporting, '#34d399')}
        {sep}
        {tool(<ArrowRightLeft size={14} />, t('↔ Painel DSK', '↔ DSK pane'))}
        {tool(<MonitorPlay size={14} />, '→ XRoar')}
        {sep}
        {tool(<Undo2 size={14} />, t('Desfazer', 'Undo'))}
        {tool(<Redo2 size={14} />, t('Refazer', 'Redo'))}
        <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold flex items-center gap-1"><AudioLines size={13} /> K7</span>
      </div>

      {/* CORPO */}
      <div className="flex-1 flex" style={{ minHeight: 0 }}>
        <div className="flex-1 flex flex-col" style={{ minHeight: 0, padding: 10, gap: 10 }}>
          {/* WAVEFORM + playhead + zoom */}
          <div ref={waveBoxRef} className="glass-panel" style={{ flex: '1 1 0%', minHeight: 70, maxHeight: '50%', overflow: 'hidden', position: 'relative', cursor: audio ? 'text' : 'default' }} onClick={onWaveClick} onWheel={onWheel}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            {audio && playFrac >= 0 && playFrac <= 1 && (
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${playFrac * 100}%`, width: 1.5, background: '#fbbf24', boxShadow: '0 0 6px #fbbf24', pointerEvents: 'none' }} />
            )}
            {audio && (
              <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
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
                <span className="text-xs">{t('Arraste um WAV aqui ou clique em Abrir', 'Drag a WAV here or click Open')}</span>
                {err && <span className="text-[11px]" style={{ color: '#fbbf24', maxWidth: 420, textAlign: 'center' }}>{err}</span>}
              </div>
            )}
          </div>

          {/* DATACORDER animado */}
          <div className="glass-panel flex items-center gap-3" style={{ padding: '8px 12px', flexShrink: 0 }}>
            <svg width={132} height={66} viewBox="0 0 88 44" style={{ flexShrink: 0 }}>
              <rect x={1} y={1} width={86} height={42} rx={5} fill="#0b1220" stroke="rgba(148,163,184,0.35)" />
              <rect x={10} y={30} width={68} height={9} rx={2} fill="#060a12" stroke="rgba(148,163,184,0.2)" />
              {reel(28, rTake, reelL.current)}
              {reel(60, rSupply, reelR.current)}
              <line x1={28 + rTake} y1={12} x2={60 - rSupply} y2={12} stroke={ACCENT_DIM} strokeWidth={1.2} />
            </svg>
            <div className="flex items-center gap-1">
              {transBtn(<Rewind size={13} />, t('Rebobinar', 'Rewind'), rewind)}
              {playing ? transBtn(<Pause size={13} />, t('Pausar', 'Pause'), pause, true) : transBtn(<Play size={13} />, 'Play', play, false, '#34d399')}
              <button disabled className="dsk-tool" style={{ padding: '3px 8px', opacity: 0.4, color: '#f87171' }} title={t('Gravar fita real (K4)', 'Record real tape (K4)')}><Circle size={13} /></button>
              {transBtn(<Square size={13} />, 'Stop', stopReset)}
              {transBtn(<FastForward size={13} />, t('Ir ao fim', 'To end'), () => seek(dur))}
            </div>
            <span className="font-mono text-[12px] px-2 py-0.5 rounded" style={{ background: '#060a12', border: '1px solid var(--border)', color: playing ? '#34d399' : ACCENT, minWidth: 64, textAlign: 'center' }}>{fmtTime(posRef.current)}</span>
            <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">{t('Vel.', 'Speed')}
              <select value={speed} onChange={e => changeSpeed(Number(e.target.value))} className="input-select text-[10px]" style={{ padding: '1px 3px' }}>
                {SPEEDS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </label>
            <span className="text-[10px] text-[var(--text-muted)] ml-auto">{t('gravar fita real: K4 · → XRoar/DSK: K5', 'record real tape: K4 · → XRoar/DSK: K5')}</span>
          </div>

          {/* STATUS BAR */}
          <div className="flex items-center gap-3 px-1 text-[11px] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {audio ? (
              <>
                <span className="font-mono" style={{ color: '#c4b5fd' }}>{audio.name}</span>
                <span>{fmtTime(posRef.current)} / {fmtTime(audio.durationSec)}</span>
                <span>{(audio.sampleRate / 1000).toFixed(1)} kHz</span>
                <span>{audio.bits}-bit · {audio.channels === 1 ? 'mono' : `${audio.channels}ch`}</span>
                <span>{t('zoom', 'zoom')} {(1 / view.len).toFixed(1)}×</span>
                {playing && <span style={{ color: '#34d399' }}>● {t('tocando', 'playing')}</span>}
              </>
            ) : <span className="text-[var(--text-muted)]">{t('Nenhum áudio carregado', 'No audio loaded')}</span>}
          </div>
        </div>

        {/* COLUNA DIREITA */}
        <div style={{ width: 224, flexShrink: 0, borderLeft: '1px solid var(--border)', padding: 10, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          <div className="glass-panel p-2.5">
            <div className={panelTitle}>{t('Programa', 'Program')}</div>
            {[
              [t('nome', 'name'), f0?.name || '—'],
              [t('início (load)', 'start (load)'), f0 ? hex4(f0.loadAddr) : '—'],
              [t('fim', 'end'), f0 ? hex4(f0.loadAddr + f0.sizeBytes - 1) : '—'],
              [t('execução (exec)', 'exec'), f0 ? hex4(f0.execAddr) : '—'],
              [t('tipo', 'type'), f0?.ftypeName || '—'],
              [t('tamanho', 'size'), f0 ? fmtSz(f0.sizeBytes) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px] py-0.5" style={{ color: 'var(--text-secondary)' }}><span className="text-[var(--text-muted)]">{k}</span><span className="font-mono truncate ml-2" style={{ maxWidth: 120 }} title={String(v)}>{v}</span></div>
            ))}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] font-bold" style={{ color: decoding ? 'var(--text-muted)' : decoded?.foundSync ? '#34d399' : '#fbbf24' }}>
                {decoding ? t('decodificando…', 'decoding…') : !decoded ? '' : decoded.foundSync ? `✓ ${t('sync', 'sync')} · ${decoded.files.length} ${t('arq.', 'files')}` : `✗ ${t('sem sync', 'no sync')}`}
              </span>
              {f0 && <button onClick={() => extractFile(0)} className="dsk-tool text-[10px]" style={{ padding: '2px 6px' }} title={t('Extrair o arquivo para o PC', 'Extract the file to the PC')}>{t('Extrair', 'Extract')}</button>}
            </div>
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
            <label className="block text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              <div className="flex justify-between"><span>{t('Limiar (µs)', 'Threshold (µs)')}</span><span className="font-mono">{dec.midUs}</span></div>
              <input type="range" min={500} max={720} step={5} value={dec.midUs} disabled={!audio} onChange={e => setDec(d => ({ ...d, midUs: Number(e.target.value) }))} className="w-full" style={{ accentColor: '#ff8c1a' }} />
            </label>
            <label className="block text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              <div className="flex justify-between"><span>{t('Amplitude mín.', 'Min amplitude')}</span><span className="font-mono">{dec.minAmp.toFixed(2)}</span></div>
              <input type="range" min={0} max={0.3} step={0.01} value={dec.minAmp} disabled={!audio} onChange={e => setDec(d => ({ ...d, minAmp: Number(e.target.value) }))} className="w-full" style={{ accentColor: '#ff8c1a' }} />
            </label>
            <div className="flex items-center justify-between mt-1">
              <button onClick={() => setDec({ midUs: 600, minAmp: 0 })} disabled={!audio} className="dsk-tool text-[10px]" style={{ padding: '2px 6px' }}>{t('Redefinir', 'Reset')}</button>
              <span className="text-[9px] font-mono text-[var(--text-muted)]">{decoded ? `${decoded.bitCount} bits · ${decoded.byteCount} B` : ''}</span>
            </div>
            <div className="text-[9px] text-[var(--text-muted)] mt-1 leading-tight">{t('Mexa no limiar/amplitude para destravar fitas difíceis (ex.: dinowars).', 'Adjust threshold/amplitude to unlock difficult tapes (e.g. dinowars).')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
