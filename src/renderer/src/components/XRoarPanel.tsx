import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Power, FolderOpen, Pause, Play, Cpu, X, Disc3 } from 'lucide-react';

// Discos vão para uma drive via insert_disk; o resto (cas/bin/rom/sna…) via load_file auto.
const DISK_EXTS = ['dsk', 'vdk', 'jvc', 'dmk'];

const MACHINES = [
  { id: 'coco3', label: 'Tandy CoCo 3 (NTSC)' },
  { id: 'coco3p', label: 'Tandy CoCo 3 (PAL)' },
  { id: 'coco2bus', label: 'Tandy CoCo 2 (NTSC)' },
  { id: 'coco2b', label: 'Tandy CoCo 2 (PAL)' },
  { id: 'dragon32', label: 'Dragon 32' },
  { id: 'dragon64', label: 'Dragon 64' },
  { id: 'tano', label: 'Tano Dragon (NTSC)' },
  { id: 'mc10', label: 'Tandy MC-10' },
];

// Entrada de TV. Composto (cmp-*) decodifica as cores de artefato NTSC e PRECISA de
// cross-colour (ccr); RGB é nítido, sem artefato (bom p/ jogos RGB do CoCo 3).
const TV_INPUTS = [
  { id: 'cmp-br', labelPt: 'Composto (azul-verm)', labelEn: 'Composite (blue-red)' },
  { id: 'cmp-rb', labelPt: 'Composto (laranja-ciano)', labelEn: 'Composite (orange-cyan)' },
  { id: 'rgb', labelPt: 'RGB (nítido)', labelEn: 'RGB (sharp)' },
];

// Atribuições de joystick (mapa numérico do XRoar, igual ao CGS): 0=nenhum, 1=mouse,
// 2..5 = joysticks de teclado pré-definidos. Aplicado ao vivo via set_joystick.
const JOY_OPTIONS = [
  { v: 0, pt: 'Nenhum', en: 'None' },
  { v: 1, pt: 'Mouse', en: 'Mouse' },
  { v: 2, pt: 'Teclado: setas + Alt', en: 'Keyboard: cursors + Alt' },
  { v: 3, pt: 'Teclado: WASD + O,P', en: 'Keyboard: WASD + O,P' },
  { v: 4, pt: 'Teclado: IJKL + X,Z', en: 'Keyboard: IJKL + X,Z' },
  { v: 5, pt: 'Teclado: QAOP + Espaço', en: 'Keyboard: QAOP + Space' },
];

interface PendingLoad { name: string; ext: string; data: Uint8Array; key: number; drive?: number; runCmd?: string; }
interface PendingType { text: string; key: number; reset?: boolean; }

interface Props {
  lang: 'pt-br' | 'en-us';
  active?: boolean;
  pendingLoad?: PendingLoad | null;
  pendingType?: PendingType | null;
  onLog?: (pt: string, en: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
  platform?: 'coco' | 'dragon';
}

export default function XRoarPanel({ lang, active, pendingLoad, pendingType, onLog, platform }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [machine, setMachine] = useState('coco3');
  const [tvInput, setTvInput] = useState('cmp-br');
  const [rightJoy, setRightJoy] = useState(0); // joystick 0
  const [leftJoy, setLeftJoy] = useState(0);    // joystick 1
  const [colour, setColour] = useState(50);
  const [brightness, setBrightness] = useState(50);
  const [contrast, setContrast] = useState(50);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('');
  const [drives, setDrives] = useState<string[]>(['', '', '', '']);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false); // config carregada? (evita salvar antes da carga)
  const [mounted, setMounted] = useState(false); // iframe montado? (só após a aba ficar visível)
  const lastLoadKey = useRef(0);
  const lastTypeKey = useRef(0);
  const t = (pt: string, en: string) => (lang === 'pt-br' ? pt : en);

  // A plataforma-alvo (toggle CoCo/Dragon do app) define a MÁQUINA padrão: CoCo 3 (NTSC) ou
  // Dragon 64. Ao trocar a plataforma, a máquina acompanha; o usuário ainda pode escolher outra
  // máquina manualmente no seletor abaixo (vale até a próxima troca de plataforma).
  useEffect(() => {
    if (!platform) return;
    setMachine(platform === 'dragon' ? 'dragon64' : 'coco3');
  }, [platform]);

  // Toda a config visual vai no boot (URL). Trocar máquina ou saída de vídeo reinicia (rápido
  // e mostra a tela corretamente); brilho/contraste/cor são ao vivo (set_float ao arrastar).
  const src = new URL('xroar/xroar.html', window.location.href).href +
    `?machine=${machine}&tvInput=${tvInput}&tvType=ntsc&ccr=${tvInput.startsWith('cmp') ? 1 : 0}&glFilter=nearest`;

  const sendCmd = (fn: string, extra: Record<string, any> = {}) => {
    const w = iframeRef.current?.contentWindow;
    if (w) w.postMessage({ type: 'xroar-cmd', fn, ...extra }, '*');
  };
  const focusEmu = () => {
    const f = iframeRef.current;
    if (!f) return;
    try { f.focus(); f.contentWindow?.focus(); } catch { /* ignore */ }
    sendCmd('focus');
  };

  const loadToDrive = (drive: number, name: string, ext: string, data: Uint8Array) => {
    const arr = Array.from(data);
    if (DISK_EXTS.includes(ext.toLowerCase())) {
      sendCmd('insert_disk', { drive, fileName: name, fileData: arr });
      setDrives(d => { const n = [...d]; n[drive] = name; return n; });
      setStatus(`D${drive}: ${name}`);
    } else {
      sendCmd('load_file', { fileName: name, fileData: arr, loadType: 0, drive });
      setStatus(t(`Carregado: ${name}`, `Loaded: ${name}`));
    }
    setTimeout(focusEmu, 60);
  };

  const openToDrive = async (drive: number) => {
    try {
      const res = await window.cocoApi.xroarPickFile();
      if (res?.cancelled) return;
      if (!res?.success) { onLog?.(`XRoar: ${res?.error}`, `XRoar: ${res?.error}`, 'error'); return; }
      loadToDrive(drive, res.name, res.ext, new Uint8Array(res.data));
    } catch (err: any) { onLog?.(`XRoar: ${err.message}`, `XRoar: ${err.message}`, 'error'); }
  };

  const eject = (drive: number) => {
    sendCmd('eject_disk', { drive });
    setDrives(d => { const n = [...d]; n[drive] = ''; return n; });
  };

  // Controles de imagem AO VIVO. Fonte XRoar (wasm.c + vo_render.c): tags 'brightness',
  // 'contrast', 'saturation' são INTEIROS 0–100 (neutro 50) → enviar por set_INT (não float,
  // senão o XRoar lê o ponteiro de float como lixo e zera o vídeo).
  const setVideo = (key: 'brightness' | 'contrast' | 'saturation', value: number) =>
    sendCmd('set_int', { control: key, value });
  const setJoy = (port: number, value: number) => {
    sendCmd('set_joystick', { joy: port, value });
    if (port === 0) setRightJoy(value); else setLeftJoy(value);
  };

  // Mensagens vindas do iframe (ready/log/status)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d.type !== 'string' || !d.type.startsWith('xroar')) return;
      if (d.type === 'xroar-ready') { setReady(true); setPaused(false); setStatus(t('pronto', 'ready')); }
      else if (d.type === 'xroar-error') onLog?.(`XRoar: ${d.text}`, `XRoar: ${d.text}`, 'error');
      else if (d.type === 'xroar-status' && d.text) setStatus(String(d.text));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lang]);

  // Carrega o que foi empurrado de fora (ex.: "Testar no XRoar" do painel DSK) → drive 0
  useEffect(() => {
    if (!pendingLoad || pendingLoad.key === lastLoadKey.current || !ready) return;
    lastLoadKey.current = pendingLoad.key;
    loadToDrive(pendingLoad.drive ?? 0, pendingLoad.name, pendingLoad.ext, pendingLoad.data);
    // Auto-roda (duplo-clique): monta o disco, dá HARD RESET (limpa qualquer programa que já
    // esteja rodando → volta ao prompt do BASIC, onde a digitação funciona; o disco montado
    // permanece na drive) e só então digita RUN/LOADM. Sem o reset, o texto iria para o
    // programa em execução e nada carregaria.
    if (pendingLoad.runCmd) {
      const cmd = pendingLoad.runCmd;
      setTimeout(() => sendCmd('hard_reset'), 900);                                  // disco montou → reseta
      setTimeout(() => { sendCmd('type_string', { text: cmd, delayMs: 60 }); focusEmu(); }, 3400); // boot pronto → digita
    }
  }, [pendingLoad, ready]);

  // Injeção de BASIC/texto (aba BASIC) → digita no emulador via type_string.
  //  - reset=true: HARD RESET primeiro (boot limpo, garante o prompt OK mesmo com algo rodando),
  //    aguarda o boot e então digita.
  //  - reset=false: digita direto no prompt atual (mais rápido; o texto já costuma incluir NEW).
  useEffect(() => {
    if (!pendingType || pendingType.key === lastTypeKey.current || !ready) return;
    lastTypeKey.current = pendingType.key;
    const { text, reset } = pendingType;
    // "Prime" do 1º caractere: a primeira tecla é perdida quando o teclado emulado ainda não
    // está pronto (emulador recém-visível/resetado). Um CR inicial NÃO resolve (o XRoar ignora
    // CR à frente). Usamos um ESPAÇO imprimível: se for engolido, o "10" sobrevive; se não for,
    // o BASIC ignora espaços antes do número da linha/comando. Preserva o "1" do "10".
    const primed = ' ' + text;
    if (reset) {
      sendCmd('hard_reset');
      setTimeout(() => { focusEmu(); sendCmd('type_string', { text: primed, delayMs: 60 }); }, 2800); // espera o boot
    } else {
      // Atraso curto para o canvas focar/processar antes de digitar (aba recém-exibida).
      focusEmu();
      setTimeout(() => { sendCmd('type_string', { text: primed, delayMs: 60 }); }, 450);
    }
  }, [pendingType, ready]);

  // Trocar máquina ou saída de vídeo reinicia o emulador → limpa as drives.
  useEffect(() => { setDrives(['', '', '', '']); }, [machine, tvInput]);

  // Aplica TODAS as configurações ao vivo quando o emulador (re)fica pronto — o boot
  // começa nos defaults, então empurramos o estado atual (vídeo, cor, ccr, joysticks).
  useEffect(() => {
    if (!ready) return;
    // Reaplica joysticks e imagem ao (re)ficar pronto. Vídeo via set_int 0–100 (seguro) —
    // restaura o brilho/contraste/cor salvos. tv-input/ccr/máquina vêm do boot (URL).
    sendCmd('set_joystick', { joy: 0, value: rightJoy });
    sendCmd('set_joystick', { joy: 1, value: leftJoy });
    setVideo('brightness', brightness);
    setVideo('contrast', contrast);
    setVideo('saturation', colour);
  }, [ready]);

  // Monta o iframe quando a aba fica visível (1ª vez) e a config carregou. Se a tela 4:3 JÁ tem
  // tamanho real, monta na hora (canvas do WASM inicia no tamanho certo → evita tela preta). Se
  // ainda não, um fallback de 600ms monta de qualquer jeito — assim NUNCA trava em "iniciando…".
  // Depois fica montado (trocar de aba não reinicia o emulador).
  useEffect(() => {
    if (!active || !loaded || mounted) return;
    if (box.w > 0 && box.h > 0) { setMounted(true); return; }
    const id = setTimeout(() => setMounted(true), 600);
    return () => clearTimeout(id);
  }, [active, loaded, mounted, box.w, box.h]);

  // Foco no canvas ao entrar na aba (ou ao ficar pronto estando ativo)
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(focusEmu, 60);
    return () => clearTimeout(id);
  }, [active, ready]);

  // Tela 4:3 — calcula a maior caixa 4:3 que cabe na área (letterbox), reagindo a resize
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const calc = () => {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      let w = cw, h = (w * 3) / 4;
      if (h > ch) { h = ch; w = (h * 4) / 3; }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    };
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    calc();
    return () => ro.disconnect();
  }, []);
  // Recalcula quando a aba fica visível (estava display:none → tinha tamanho 0)
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => {
      const el = stageRef.current;
      if (!el) return;
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      let w = cw, h = (w * 3) / 4;
      if (h > ch) { h = ch; w = (h * 4) / 3; }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    }, 90);
    return () => clearTimeout(id);
  }, [active]);

  // Carrega as configurações salvas (1x) antes de montar o iframe — evita boot duplo.
  useEffect(() => {
    let done = false;
    (async () => {
      try {
        const cfg = window.cocoApi && typeof window.cocoApi.loadConfig === 'function' ? await window.cocoApi.loadConfig() : null;
        const x = cfg?.xroar;
        if (x && !done) {
          if (x.machine) setMachine(x.machine);
          if (x.tvInput) setTvInput(x.tvInput);
          if (typeof x.rightJoy === 'number') setRightJoy(x.rightJoy);
          if (typeof x.leftJoy === 'number') setLeftJoy(x.leftJoy);
          if (typeof x.colour === 'number') setColour(x.colour);
          if (typeof x.brightness === 'number') setBrightness(x.brightness);
          if (typeof x.contrast === 'number') setContrast(x.contrast);
        }
      } catch { /* ignore */ }
      if (!done) setLoaded(true);
    })();
    return () => { done = true; };
  }, []);

  // Salva as configurações do XRoar (debounce) quando algo muda — restauradas na reabertura.
  useEffect(() => {
    if (!loaded || !window.cocoApi || typeof window.cocoApi.saveConfig !== 'function') return;
    const id = setTimeout(() => {
      window.cocoApi.saveConfig({ xroar: { machine, tvInput, colour, brightness, contrast, rightJoy, leftJoy } });
    }, 400);
    return () => clearTimeout(id);
  }, [loaded, machine, tvInput, colour, brightness, contrast, rightJoy, leftJoy]);

  const togglePause = () => {
    if (paused) { sendCmd('resume'); setPaused(false); }
    else { sendCmd('pause'); setPaused(true); }
  };

  const sectionTitle = 'text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5';

  const SIDEBAR_W = 210;
  const joyRows = [
    { port: 0, lbl: t('Joystick 0 (direito)', 'Joystick 0 (right)'), val: rightJoy },
    { port: 1, lbl: t('Joystick 1 (esquerdo)', 'Joystick 1 (left)'), val: leftJoy },
  ];
  const pic: { key: 'brightness' | 'contrast' | 'saturation'; l: string; val: number; set: (n: number) => void }[] = [
    { key: 'saturation', l: t('Cor', 'Colour'), val: colour, set: setColour },
    { key: 'brightness', l: t('Brilho', 'Brightness'), val: brightness, set: setBrightness },
    { key: 'contrast', l: t('Contraste', 'Contrast'), val: contrast, set: setContrast },
  ];

  return (
    <div className="flex-1 flex flex-row overflow-hidden p-3 gap-3" style={{ minHeight: 0 }}>
      {/* ESQUERDA: drives + joystick/teclado */}
      <div className="flex flex-col gap-3 overflow-y-auto flex-shrink-0" style={{ width: SIDEBAR_W }}>
        <div className="glass-panel p-2.5 flex flex-col gap-1.5">
          <div className={sectionTitle}>{t('Drives', 'Drives')}</div>
          {[0, 1, 2, 3].map(d => (
            <div key={d} className="flex items-center gap-1.5">
              <Disc3 size={13} className={drives[d] ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'} />
              <span className="text-[10px] font-mono w-6 flex-shrink-0">D{d}</span>
              <span className="text-[10px] text-[var(--text-secondary)] font-mono truncate flex-1" title={drives[d]}>{drives[d] || '—'}</span>
              <button onClick={() => openToDrive(d)} disabled={!ready} className="dsk-tool" style={{ padding: '2px 6px' }} title={t('Abrir', 'Open')}><FolderOpen size={12} /></button>
              <button onClick={() => eject(d)} disabled={!ready || !drives[d]} className="dsk-tool" style={{ padding: '2px 6px' }} title={t('Ejetar', 'Eject')}><X size={12} /></button>
            </div>
          ))}
        </div>

        <div className="glass-panel p-2.5 flex flex-col gap-1.5">
          <div className={sectionTitle}>{t('Joystick / teclado', 'Joystick / keyboard')}</div>
          {joyRows.map(j => (
            <label key={j.port} className="flex flex-col gap-0.5 text-[10px] text-[var(--text-secondary)]">
              <span>{j.lbl}</span>
              <select value={j.val} onChange={(e) => setJoy(j.port, parseInt(e.target.value, 10))} disabled={!ready} className="input-select text-xs py-1 w-full">
                {JOY_OPTIONS.map(o => <option key={o.v} value={o.v}>{lang === 'pt-br' ? o.pt : o.en}</option>)}
              </select>
            </label>
          ))}
          <div className="text-[9px] text-[var(--text-muted)] leading-tight mt-0.5">
            {t('No CoCo o joystick 0 é o direito. Use um teclado-joystick para jogar.', 'On the CoCo joystick 0 is the right one. Use a keyboard-joystick to play.')}
          </div>
        </div>
      </div>

      {/* CENTRO: tela do emulador 4:3 */}
      <div ref={stageRef} className="flex-1 glass-panel overflow-hidden flex items-center justify-center bg-black" style={{ minHeight: 0, minWidth: 0 }}>
        {mounted ? (
          <iframe
            ref={iframeRef}
            key={`${machine}|${tvInput}`}
            src={src}
            title="XRoar"
            allow="autoplay; gamepad"
            style={{ width: box.w || '100%', height: box.h || '100%', border: 0, display: 'block' }}
          />
        ) : (
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{t('iniciando emulador…', 'starting emulator…')}</span>
        )}
      </div>

      {/* DIREITA: máquina + vídeo + imagem + controles */}
      <div className="flex flex-col gap-3 overflow-y-auto flex-shrink-0" style={{ width: SIDEBAR_W }}>
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-[var(--primary)]" />
          <span className="text-sm font-bold text-white uppercase tracking-wide">XRoar</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider">
            {ready ? <span className="text-[var(--primary)] font-bold">● {status || 'ready'}</span> : <span className="text-[var(--text-muted)]">{t('iniciando…', 'booting…')}</span>}
          </span>
        </div>

        <div className="glass-panel p-2.5 flex flex-col gap-2">
          <div>
            <div className={sectionTitle}>{t('Máquina', 'Machine')}</div>
            <select value={machine} onChange={(e) => { setReady(false); setMachine(e.target.value); }} className="input-select text-xs py-1 w-full">
              {MACHINES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <div className={sectionTitle}>{t('Saída de vídeo', 'Video output')}</div>
            <select value={tvInput} onChange={(e) => { setReady(false); setTvInput(e.target.value); }} className="input-select text-xs py-1 w-full">
              {TV_INPUTS.map(v => <option key={v.id} value={v.id}>{lang === 'pt-br' ? v.labelPt : v.labelEn}</option>)}
            </select>
            <div className="text-[9px] text-[var(--text-muted)] mt-1 leading-tight">
              {t('Composto = cores de artefato (NTSC). RGB = nítido, sem artefato.', 'Composite = artifact colours (NTSC). RGB = sharp, no artifacts.')}
            </div>
          </div>
        </div>

        <div className="glass-panel p-2.5 flex flex-col gap-1.5">
          <div className={sectionTitle}>{t('Imagem', 'Picture')}</div>
          {pic.map(s => (
            <label key={s.key} className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
              <span className="flex-shrink-0" style={{ width: 60 }}>{s.l}</span>
              <input type="range" min={0} max={100} value={s.val} disabled={!ready}
                onChange={(e) => { const v = parseInt(e.target.value, 10); s.set(v); setVideo(s.key, v); }}
                className="flex-1" style={{ minWidth: 0, width: '100%' }} />
            </label>
          ))}
        </div>

        <div className="glass-panel p-2.5 flex flex-col gap-1.5">
          <div className={sectionTitle}>{t('Controles', 'Controls')}</div>
          <button onClick={togglePause} disabled={!ready} className="dsk-tool justify-center">{paused ? <Play size={13} /> : <Pause size={13} />} {paused ? t('Continuar', 'Resume') : t('Pausar', 'Pause')}</button>
          <button onClick={() => sendCmd('soft_reset')} disabled={!ready} className="dsk-tool justify-center"><RotateCcw size={13} /> {t('Reset', 'Reset')}</button>
          <button onClick={() => sendCmd('hard_reset')} disabled={!ready} className="dsk-tool justify-center"><Power size={13} /> {t('Reset total', 'Hard reset')}</button>
        </div>

        <div className="text-[9px] text-[var(--text-muted)] leading-tight">
          {t('Clique na tela para capturar teclado/áudio. Trocar máquina/vídeo reinicia o emulador.',
             'Click the screen to capture keyboard/audio. Changing machine/video reboots the emulator.')}
        </div>
      </div>
    </div>
  );
}
