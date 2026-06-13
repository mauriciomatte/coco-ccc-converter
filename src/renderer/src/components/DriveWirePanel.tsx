import React, { useEffect, useRef, useState } from 'react';
import { Plug, Power, RefreshCw, ChevronDown, ChevronRight, ArrowUpFromLine, Lock, Unlock, List, X } from 'lucide-react';

// Painel SERVIDOR DRIVEWIRE (serial) — M4. Coluna 3 da aba "Servidores".
// O CoCo real (com ROM HDB-DOS/DW do modelo) lê até 4 drives (0–3) por cabo serial; cada um é um .dsk no PC.
// Visual: 4 drives 5.25" FULL-HEIGHT empilhados (com latch + LED colorido), RW e EJETAR DENTRO de cada drive.
// Drag-and-drop um .dsk no drive OU clique para escolher. Config (porta/máquina/baud) é COLAPSÁVEL (sem scroll).
// Persiste em cfg.drivewire (chave separada de cfg.fujinet p/ não colidir com o servidor WiFi).

type Lang = 'pt-br' | 'en-us';
type LogFn = (pt: string, en: string, type?: 'info' | 'success' | 'warn' | 'error') => void;

interface DriveState { filePath: string; name: string; size: number; kind: string; files: number; tracks: number; writable: boolean; count: number; }

const MACHINES: { key: string; label: string; baud: number }[] = [
  { key: 'coco1', label: 'CoCo 1', baud: 38400 },
  { key: 'coco2', label: 'CoCo 2', baud: 57600 },
  { key: 'coco3', label: 'CoCo 3', baud: 115200 },
];
const CUSTOM_BAUDS = [38400, 57600, 115200, 230400, 460800, 921600];
const DSK_EXTS = ['dsk', 'os9', 'img', 'vdk', 'sdf'];

const fmtBytes = (n: number) => n >= 1024 ? `${n.toLocaleString('pt-BR')} B` : `${n} B`;

export default function DriveWirePanel({ lang, onLog, width, pendingDisk, onConsumed }: { lang: Lang; onLog: LogFn; width: number; pendingDisk?: { filePath: string; name: string; slot?: number; key: number } | null; onConsumed?: () => void }) {
  const pt = lang === 'pt-br';
  const t = (p: string, e: string) => (pt ? p : e);

  const [ports, setPorts] = useState<{ path: string; label: string }[]>([]);
  const [portPath, setPortPath] = useState('');
  const [machine, setMachine] = useState('coco3');
  const [customBaud, setCustomBaud] = useState(115200);
  const [drives, setDrives] = useState<(DriveState | null)[]>([null, null, null, null]);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(true);   // config aberta até o usuário definir e colapsar
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [fileList, setFileList] = useState<{ slot: number; filePath: string; name: string; count: number; index: number; files: any[] } | null>(null);
  const loaded = useRef(false);

  const baud = machine === 'custom' ? customBaud : (MACHINES.find(m => m.key === machine)?.baud || 115200);
  const machineLabel = machine === 'custom' ? `Custom ${customBaud}` : (MACHINES.find(m => m.key === machine)?.label || '');

  // --- portas seriais ---
  const refreshPorts = async () => {
    try { const r = await window.cocoApi.dwListPorts(); if (r?.success) setPorts(r.ports || []); }
    catch { /* */ }
  };

  // --- carregar/persistir config ---
  useEffect(() => {
    (async () => {
      await refreshPorts();
      try {
        const cfg = await window.cocoApi.loadConfig();
        const dw = cfg?.drivewire;
        if (dw) {
          if (typeof dw.portPath === 'string') setPortPath(dw.portPath);
          if (typeof dw.machine === 'string') setMachine(dw.machine);
          if (typeof dw.customBaud === 'number') setCustomBaud(dw.customBaud);
          if (Array.isArray(dw.drives)) {
            const restored = await Promise.all([0, 1, 2, 3].map(async i => {
              const d = dw.drives[i];
              if (!d?.filePath) return null;
              const info = await window.cocoApi.dwDiskInfo(d.filePath).catch(() => null);
              if (!info?.success) return null;
              return { filePath: d.filePath, name: info.name, size: info.size, kind: info.kind, files: info.files, tracks: info.tracks, writable: !!d.writable, count: info.count || 1 } as DriveState;
            }));
            setDrives(restored);
            if (restored.some(Boolean)) setCfgOpen(false); // já configurado antes → colapsa
          }
        }
      } catch { /* */ }
      loaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(() => {
      window.cocoApi.saveConfig({ drivewire: { portPath, machine, customBaud, drives: drives.map(d => d ? { filePath: d.filePath, writable: d.writable } : null) } });
    }, 400);
    return () => clearTimeout(id);
  }, [portPath, machine, customBaud, drives]);

  // --- carregar um .dsk num slot (drag ou seleção) ---
  const loadDrive = async (slot: number, filePath: string) => {
    const info = await window.cocoApi.dwDiskInfo(filePath).catch(() => null);
    if (!info?.success) { onLog(`DriveWire: não consegui ler "${filePath}".`, `DriveWire: could not read "${filePath}".`, 'error'); return; }
    setDrives(ds => ds.map((d, i) => i === slot ? { filePath, name: info.name, size: info.size, kind: info.kind, files: info.files, tracks: info.tracks, writable: d?.writable ?? false, count: info.count || 1 } : d));
    onLog(`DriveWire: ${info.name} montado no drive ${slot}.`, `DriveWire: ${info.name} mounted on drive ${slot}.`, 'success');
  };

  const pickForDrive = async (slot: number) => {
    if (running) return;
    const r = await window.cocoApi.pickFile?.([{ name: t('Imagem de disco', 'Disk image'), extensions: DSK_EXTS }]);
    if (r?.path) loadDrive(slot, r.path);
  };

  const onDrop = (slot: number, e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null);
    if (running) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!DSK_EXTS.includes((f.name.split('.').pop() || '').toLowerCase())) {
      onLog(`DriveWire: "${f.name}" não é uma imagem de disco aceita.`, `DriveWire: "${f.name}" is not an accepted disk image.`, 'warn'); return;
    }
    const fp = window.cocoApi.getPathForFile(f);
    if (fp) loadDrive(slot, fp);
  };

  const eject = (slot: number) => { if (!running) setDrives(ds => ds.map((d, i) => i === slot ? null : d)); };
  const toggleRW = (slot: number) => { if (!running) setDrives(ds => ds.map((d, i) => i === slot && d ? { ...d, writable: !d.writable } : d)); };

  // Lista os arquivos do .dsk montado no drive (◀ ▶ se for contêiner multi-disco).
  const openFileList = async (slot: number) => {
    const d = drives[slot]; if (!d) return;
    const r = await window.cocoApi.dwDiskFiles(d.filePath, 0);
    if (r?.success) setFileList({ slot, filePath: d.filePath, name: r.name, count: r.count, index: r.index, files: r.files });
    else onLog(`DriveWire: não consegui ler os arquivos de "${d.name}".`, `DriveWire: could not read files of "${d.name}".`, 'warn');
  };
  const navFileList = async (delta: number) => {
    if (!fileList) return;
    const r = await window.cocoApi.dwDiskFiles(fileList.filePath, fileList.index + delta);
    if (r?.success) setFileList({ ...fileList, count: r.count, index: r.index, files: r.files });
  };

  // --- ligar/desligar servidor ---
  const start = async () => {
    if (!portPath) { onLog('DriveWire: escolha a porta serial primeiro.', 'DriveWire: pick the serial port first.', 'warn'); return; }
    const payload = drives.map((d, i) => d ? { slot: i, filePath: d.filePath, writable: d.writable } : null).filter(Boolean) as { slot: number; filePath: string; writable: boolean }[];
    if (!payload.length) { onLog('DriveWire: monte ao menos um disco num drive.', 'DriveWire: mount at least one disk on a drive.', 'warn'); return; }
    setBusy(true);
    try {
      const r = await window.cocoApi.dwServerStart({ portPath, baudRate: baud, drives: payload });
      if (!r?.success) { onLog(`DriveWire: ${r?.error}`, `DriveWire: ${r?.error}`, 'error'); return; }
      setRunning(true); setCfgOpen(false);
      onLog(`Servidor DriveWire LIGADO em ${portPath} @ ${baud} baud (${machineLabel}). Dê boot no CoCo.`,
            `DriveWire server STARTED on ${portPath} @ ${baud} baud (${machineLabel}). Boot the CoCo.`, 'success');
    } catch (e: any) { onLog(`DriveWire: ${e?.message}`, `DriveWire: ${e?.message}`, 'error'); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true);
    try { await window.cocoApi.dwServerStop?.(); setRunning(false); onLog('Servidor DriveWire desligado.', 'DriveWire server stopped.', 'info'); }
    finally { setBusy(false); }
  };

  // Disco enviado de outra aba (ex.: "Enviar para DriveWire" da aba DSK) → monta no 1º slot livre.
  useEffect(() => {
    if (!pendingDisk?.filePath) return;
    if (running) { onLog('DriveWire: pare o servidor para montar o disco enviado.', 'DriveWire: stop the server to mount the sent disk.', 'warn'); onConsumed?.(); return; }
    const free = drives.findIndex(d => !d);
    const slot = (pendingDisk.slot != null) ? Math.max(0, Math.min(3, pendingDisk.slot)) : (free >= 0 ? free : 0);
    loadDrive(slot, pendingDisk.filePath);
    onConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDisk?.key]);

  // ====================== UI ======================
  return (
    <div className="flex flex-col gap-2 overflow-hidden" style={{ width, flexShrink: 0 }}>
      {/* título */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Plug size={14} className="text-[var(--primary)]" />
        <span className="text-xs font-bold text-white uppercase tracking-wide">{t('Servidor DriveWire (serial)', 'DriveWire server (serial)')}</span>
        {running && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: '#34d399', border: '1px solid #34d39955' }}>{t('no ar', 'live')}</span>}
      </div>

      {/* CONFIG colapsável (porta + máquina/baud) — colapsa depois de definida p/ caber sem scroll */}
      <div className="glass-panel flex-shrink-0" style={{ padding: cfgOpen ? 10 : '6px 10px' }}>
        <button onClick={() => setCfgOpen(o => !o)} className="flex items-center gap-1.5 w-full text-left" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text-secondary)' }}>
          {cfgOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'hsl(120,35%,72%)' }}>{t('Conexão', 'Connection')}</span>
          {!cfgOpen && <span className="text-[10px] font-mono ml-auto truncate" style={{ color: 'var(--text-muted)' }}>{portPath || t('sem porta', 'no port')} · {machineLabel} · {baud}</span>}
        </button>
        {cfgOpen && (
          <div className="flex flex-col gap-2 mt-2">
            {/* porta serial */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] w-12 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{t('Porta', 'Port')}</span>
              <select value={portPath} disabled={running} onChange={e => setPortPath(e.target.value)} className="input-select text-xs flex-1" style={{ padding: '4px 6px', minWidth: 0 }}>
                <option value="">{t('— escolher porta —', '— choose port —')}</option>
                {ports.map(p => <option key={p.path} value={p.path}>{p.label}</option>)}
              </select>
              <button onClick={refreshPorts} disabled={running} className="dsk-tool" style={{ padding: '4px 6px' }} title={t('Atualizar portas', 'Refresh ports')}><RefreshCw size={12} /></button>
            </div>
            {/* máquina (→ baud) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] w-12 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{t('Máquina', 'Machine')}</span>
              <select value={machine} disabled={running} onChange={e => setMachine(e.target.value)} className="input-select text-xs flex-1" style={{ padding: '4px 6px', minWidth: 0 }}>
                {MACHINES.map(m => <option key={m.key} value={m.key}>{m.label} — {m.baud} baud</option>)}
                <option value="custom">{t('Personalizado…', 'Custom…')}</option>
              </select>
              {machine === 'custom' && (
                <select value={customBaud} disabled={running} onChange={e => setCustomBaud(Number(e.target.value))} className="input-select text-xs" style={{ padding: '4px 6px' }}>
                  {CUSTOM_BAUDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
            </div>
            <div className="text-[9px] leading-tight" style={{ color: 'var(--text-muted)' }}>
              {t('O CoCo precisa da ROM HDB-DOS/DriveWire do modelo (o baud casa com ela). CoCo 3 exige 1.78 MHz.',
                 'The CoCo needs the model\'s HDB-DOS/DriveWire ROM (baud must match it). CoCo 3 requires 1.78 MHz.')}
            </div>
          </div>
        )}
      </div>

      {/* 4 DRIVES 5.25" FULL-HEIGHT (empilhados) */}
      <div className="flex flex-col gap-2 flex-1" style={{ minHeight: 0 }}>
        {drives.map((d, i) => {
          const over = dragOver === i;
          const ledOn = !!d;
          return (
            <div key={i}
              className={`dw-drive ${over ? 'dw-drive-over' : ''}`}
              onClick={() => pickForDrive(i)}
              onDragOver={e => { if (!running) { e.preventDefault(); setDragOver(i); } }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => onDrop(i, e)}
              title={running ? t('Pare o servidor para trocar o disco', 'Stop the server to change the disk') : t('Clique para escolher ou arraste um .dsk', 'Click to choose or drag a .dsk')}
              style={{ flex: 1, minHeight: 76, cursor: running ? 'default' : 'pointer' }}>

              {/* TOPO: Dn + nome (canto esquerdo) · tipo (canto direito) */}
              <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                <span className="text-[10px] font-bold font-mono flex-shrink-0" style={{ color: '#9aa3ad' }}>D{i}</span>
                <span className="text-[11px] font-bold truncate normal-case flex-1" title={d?.name}
                  style={{ color: d ? '#e7ecf2' : (over ? 'var(--primary)' : '#7c8590') }}>
                  {d ? d.name : (over ? t('solte o .dsk aqui', 'drop the .dsk here') : t('(vazio)', '(empty)'))}
                </span>
                <span className="text-[9px] font-mono flex-shrink-0 normal-case" style={{ color: '#8b94a0' }}>
                  {d ? (d.count > 1 ? `${t('contêiner', 'container')} · ${d.count} ${t('discos', 'disks')}` : [d.kind || t('dados', 'data'), d.tracks ? `${d.tracks}T` : null].filter(Boolean).join(' · ')) : t('arraste / clique', 'drag / click')}
                </span>
              </div>

              {/* CENTRO: latch lever (central, em relevo) + fenda do disco logo abaixo */}
              <div className="dw-latch-lever" />
              <div className="dw-slot" />

              {/* BASE: LED (canto esquerdo) · info · RW + ejetar (canto direito) */}
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <span className={`dw-led ${ledOn ? (running ? 'dw-led-on' : 'dw-led-idle') : 'dw-led-off'}`} />
                <span className="text-[9px] font-mono truncate flex-1 normal-case" style={{ color: '#8b94a0' }}>
                  {d ? [fmtBytes(d.size), d.count > 1 ? null : (d.files >= 0 ? `${d.files} ${t('arq', 'files')}` : null)].filter(Boolean).join(' · ') : ''}
                </span>
                <button onClick={() => openFileList(i)} disabled={!d} className="dw-mini-btn" title={t('Ver os arquivos do disco', 'View the disk files')} style={{ color: d ? '#93c5fd' : '#6b7280', opacity: d ? 1 : 0.35 }}>
                  <List size={13} />
                </button>
                <button onClick={() => toggleRW(i)} disabled={!d || running} className="dw-mini-btn" title={d?.writable ? t('Leitura-escrita (clique p/ só-leitura)', 'Read-write (click for read-only)') : t('Só-leitura (clique p/ leitura-escrita)', 'Read-only (click for read-write)')}
                  style={{ color: d?.writable ? '#fbbf24' : '#6b7280', opacity: d ? 1 : 0.35 }}>
                  {d?.writable ? <Unlock size={13} /> : <Lock size={13} />}
                </button>
                <button onClick={() => eject(i)} disabled={!d || running} className="dw-mini-btn" title={t('Ejetar', 'Eject')} style={{ color: d ? '#cbd5e1' : '#6b7280', opacity: d ? 1 : 0.35 }}>
                  <ArrowUpFromLine size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ligar/desligar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {!running ? (
          <button onClick={start} disabled={busy} className="btn btn-primary flex items-center justify-center gap-1.5 flex-1 py-2 text-xs font-bold uppercase">
            <Power size={14} /> {t('Ligar servidor', 'Start server')}
          </button>
        ) : (
          <button onClick={stop} disabled={busy} className="btn btn-secondary flex items-center justify-center gap-1.5 flex-1 py-2 text-xs font-bold uppercase" style={{ color: '#f87171' }}>
            <Power size={14} /> {t('Desligar', 'Stop')}
          </button>
        )}
      </div>
      <div className="text-[9px] leading-tight flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
        {running
          ? t('No ar — o CoCo lê os drives pelo cabo. As conexões aparecem no log de atividades.', 'Live — the CoCo reads the drives over the cable. Connections show in the activity log.')
          : t('Monte .dsk nos drives (arraste/clique), escolha a porta e a máquina, e ligue.', 'Mount .dsk on the drives (drag/click), pick the port and machine, then start.')}
      </div>

      {/* Visualizador de arquivos do disco montado (◀ ▶ se for contêiner multi-disco) */}
      {fileList && (
        <div className="glass-modal-overlay flex items-center justify-center p-8" onClick={() => setFileList(null)}>
          <div className="glass-panel p-4 flex flex-col gap-2" style={{ width: 440, maxWidth: '92%', height: 460, maxHeight: '85%' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <List size={16} className="text-[var(--primary)]" />
              <span className="text-xs font-bold text-white uppercase tracking-wide">{t('Arquivos', 'Files')} — D{fileList.slot}</span>
              <button onClick={() => setFileList(null)} className="ml-auto dw-mini-btn" title={t('Fechar', 'Close')}><X size={14} /></button>
            </div>
            <div className="text-[11px] truncate normal-case" style={{ color: 'var(--text-secondary)' }} title={fileList.name}>{fileList.name}</div>
            {fileList.count > 1 && (
              <div className="flex items-center justify-center gap-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                <button onClick={() => navFileList(-1)} disabled={fileList.index <= 0} className="dsk-tool" style={{ padding: '2px 8px' }}>◀</button>
                <span className="font-mono">{t('disco', 'disk')} {fileList.index} / {fileList.count - 1}</span>
                <button onClick={() => navFileList(1)} disabled={fileList.index >= fileList.count - 1} className="dsk-tool" style={{ padding: '2px 8px' }}>▶</button>
              </div>
            )}
            <div className="flex flex-col gap-0.5 overflow-y-auto flex-1" style={{ minHeight: 0 }}>
              {fileList.files.length === 0 && <div className="text-[10px] italic px-1 py-2" style={{ color: 'var(--text-muted)' }}>{t('(sem arquivos legíveis — disco vazio ou não-RS-DOS)', '(no readable files — empty or non-RS-DOS disk)')}</div>}
              {fileList.files.map((f, k) => (
                <div key={k} className="flex items-center gap-2 text-[11px]" style={{ padding: '2px 4px', borderBottom: '1px solid var(--border)' }} title={f.fullName}>
                  <span className="font-mono truncate flex-1 normal-case" style={{ color: '#e7ecf2' }}>{f.fullName}</span>
                  <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{f.type}{f.ascii ? ' · ASCII' : ''}</span>
                  <span className="text-[9px] font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{(f.size || 0).toLocaleString('pt-BR')} B</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
