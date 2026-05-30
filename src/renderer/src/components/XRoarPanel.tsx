import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Power, FolderOpen, Pause, Play, Cpu } from 'lucide-react';

// Discos que vão para a drive 0 via insert_disk; o resto (cas/bin/rom/sna…) via load_file auto.
const DISK_EXTS = ['dsk', 'vdk', 'jvc', 'dmk'];

const MACHINES = [
  { id: 'coco2bus', label: 'CoCo 2 (NTSC)' },
  { id: 'coco3', label: 'CoCo 3' },
  { id: 'dragon32', label: 'Dragon 32' },
  { id: 'dragon64', label: 'Dragon 64' },
];

interface PendingLoad { name: string; ext: string; data: Uint8Array; key: number; }

interface Props {
  lang: 'pt-br' | 'en-us';
  pendingLoad?: PendingLoad | null;
  onLog?: (pt: string, en: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export default function XRoarPanel({ lang, pendingLoad, onLog }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [machine, setMachine] = useState('coco2bus');
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('');
  const lastLoadKey = useRef<number>(0);
  const t = (pt: string, en: string) => (lang === 'pt-br' ? pt : en);

  const src = new URL('xroar/xroar.html', window.location.href).href + `?machine=${machine}&glFilter=nearest`;

  const sendCmd = (fn: string, extra: Record<string, any> = {}) => {
    const w = iframeRef.current?.contentWindow;
    if (w) w.postMessage({ type: 'xroar-cmd', fn, ...extra }, '*');
  };

  const loadMedia = (name: string, ext: string, data: Uint8Array) => {
    const arr = Array.from(data);
    if (DISK_EXTS.includes(ext.toLowerCase())) {
      sendCmd('insert_disk', { drive: 0, fileName: name, fileData: arr });
      setStatus(t(`Disco "${name}" inserido na drive 0`, `Disk "${name}" inserted in drive 0`));
    } else {
      sendCmd('load_file', { fileName: name, fileData: arr, loadType: 0, drive: 0 });
      setStatus(t(`"${name}" carregado`, `"${name}" loaded`));
    }
  };

  // Mensagens vindas do iframe (boot/ready/log/atividade de disco)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d.type !== 'string' || !d.type.startsWith('xroar')) return;
      if (d.type === 'xroar-ready') { setReady(true); setPaused(false); setStatus(t('XRoar pronto', 'XRoar ready')); }
      else if (d.type === 'xroar-error') { onLog?.(`XRoar: ${d.text}`, `XRoar: ${d.text}`, 'error'); }
      else if (d.type === 'xroar-status' && d.text) setStatus(String(d.text));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lang]);

  // Carrega o que foi empurrado de fora (ex.: "Testar no XRoar" do painel DSK)
  useEffect(() => {
    if (!pendingLoad || pendingLoad.key === lastLoadKey.current) return;
    if (!ready) return; // espera o emulador
    lastLoadKey.current = pendingLoad.key;
    loadMedia(pendingLoad.name, pendingLoad.ext, pendingLoad.data);
  }, [pendingLoad, ready]);

  const handleOpen = async () => {
    try {
      const res = await window.cocoApi.xroarPickFile();
      if (res?.cancelled) return;
      if (!res?.success) { onLog?.(`XRoar: ${res?.error}`, `XRoar: ${res?.error}`, 'error'); return; }
      loadMedia(res.name, res.ext, new Uint8Array(res.data));
    } catch (err: any) { onLog?.(`XRoar: ${err.message}`, `XRoar: ${err.message}`, 'error'); }
  };

  const togglePause = () => {
    if (paused) { sendCmd('resume'); setPaused(false); }
    else { sendCmd('pause'); setPaused(true); }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-3" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-xs font-bold text-white uppercase tracking-wide flex items-center gap-1.5 mr-1">
          <Cpu size={14} className="text-[var(--primary)]" /> XRoar
        </span>
        <select value={machine} onChange={(e) => { setReady(false); setMachine(e.target.value); }}
          className="input-select text-xs py-1" title={t('Máquina (troca reinicia)', 'Machine (changing reboots)')}>
          {MACHINES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
        <button onClick={handleOpen} disabled={!ready} className="dsk-tool"><FolderOpen size={13} /> {t('Abrir', 'Open')}</button>
        <button onClick={togglePause} disabled={!ready} className="dsk-tool">{paused ? <Play size={13} /> : <Pause size={13} />} {paused ? t('Continuar', 'Resume') : t('Pausar', 'Pause')}</button>
        <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
        <button onClick={() => sendCmd('soft_reset')} disabled={!ready} className="dsk-tool"><RotateCcw size={13} /> {t('Reset', 'Reset')}</button>
        <button onClick={() => sendCmd('hard_reset')} disabled={!ready} className="dsk-tool"><Power size={13} /> {t('Reset total', 'Hard reset')}</button>
        <span className="ml-auto text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
          {ready ? <span className="text-[var(--primary)] font-bold">● {status || 'ready'}</span> : t('iniciando…', 'booting…')}
        </span>
      </div>
      {/* Emulator */}
      <div className="flex-1 glass-panel overflow-hidden flex items-center justify-center bg-black" style={{ minHeight: 0 }}>
        <iframe
          ref={iframeRef}
          key={machine}
          src={src}
          title="XRoar"
          allow="autoplay; gamepad"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      </div>
      <div className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-tight">
        {t('Clique na tela para capturar o teclado/áudio. Discos entram na Drive 0; .bin/.cas carregam direto.',
           'Click the screen to capture keyboard/audio. Disks go to Drive 0; .bin/.cas load directly.')}
      </div>
    </div>
  );
}
