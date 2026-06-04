import React, { useEffect, useRef, useState } from 'react';
import { MonitorPlay } from 'lucide-react';

// Mini-instância do XRoar embutida na aba K7: espelha a fita carregada, MUDA (ganho -99 dB → 0),
// e ao receber uma fita reseta o emulador e digita CLOAD/CLOADM (Dragon recebe um ESPAÇO antes
// p/ dispensar o prompt "pressione uma tecla"). Reusa o mesmo bridge (xroar.html) da aba XRoar.

interface MiniLoad { name: string; data: Uint8Array; ftype: number; key: number; }
interface Props {
  lang: 'pt-br' | 'en-us';
  platform?: 'coco' | 'dragon';
  active: boolean;          // aba K7 visível (só monta o emulador quando true)
  load: MiniLoad | null;    // fita a carregar/rodar (muda de `key` a cada disparo)
  flexGrow?: number;        // peso flex (largura) controlado pelo splitter da aba K7
  onCommandIssued?: () => void; // dispara quando o CLOAD/CLOADM já foi DIGITADO (CoCo pronto p/ ler a fita)
  onLog?: (pt: string, en: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

export default function MiniXRoar({ lang, platform, active, load, flexGrow, onCommandIssued, onLog }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const lastKey = useRef(0);
  const t = (pt: string, en: string) => (lang === 'pt-br' ? pt : en);
  const machine = platform === 'dragon' ? 'dragon64' : 'coco3';
  // Boot MUDO (aoGain=-99 → ganho 0); a instância grande tem prioridade no áudio.
  const src = new URL('xroar/xroar.html', window.location.href).href +
    `?machine=${machine}&tvInput=cmp-br&tvType=ntsc&ccr=1&glFilter=nearest&aoGain=-99&mini=1`;

  const sendCmd = (fn: string, extra: Record<string, any> = {}) => {
    const w = iframeRef.current?.contentWindow;
    if (w) w.postMessage({ type: 'xroar-cmd', fn, ...extra }, '*');
  };

  // Mensagens SÓ deste iframe (filtra por event.source p/ não cruzar com a aba XRoar).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data;
      if (!d || typeof d.type !== 'string') return;
      if (d.type === 'xroar-ready') {
        setReady(true);
        sendCmd('set_float', { control: 'ao-gain', value: -99 }); // reforça o mudo
        sendCmd('set_int', { control: 'brightness', value: 55 });  // +10% de brilho (neutro = 50)
      }
      else if (d.type === 'xroar-error') onLog?.(`mini-XRoar: ${d.text}`, `mini-XRoar: ${d.text}`, 'error');
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Troca de máquina (plataforma) → iframe remonta (key={machine}); marca não-pronto.
  useEffect(() => { setReady(false); lastKey.current = 0; }, [machine]);

  // Carrega+roda a fita: hard reset → anexa a fita → (Dragon: ESPAÇO) → CLOAD/CLOADM.
  useEffect(() => {
    if (!load || !ready || load.key === lastKey.current) return;
    lastKey.current = load.key;
    const isDragon = machine.startsWith('dragon');
    const cmd = (load.ftype === 2 ? 'CLOADM' : 'CLOAD') + '\r';
    const primed = (isDragon ? ' ' : '') + cmd;
    const arr = Array.from(load.data);
    const timers: number[] = [];
    sendCmd('hard_reset');
    timers.push(window.setTimeout(() => {
      sendCmd('load_file', { fileName: load.name, fileData: arr, loadType: 0, drive: 0 }); // anexa (sem autorun)
      // não focamos o iframe (evita roubar o teclado do app); wasm_queue_basic injeta direto na fila do BASIC.
      timers.push(window.setTimeout(() => {
        sendCmd('type_string', { text: primed, delayMs: 25 });
        // Após o tempo estimado de digitação + Enter, o CoCo já está PRONTO p/ ler a fita → avisa o pai.
        const typeMs = primed.length * 25 + 400;
        timers.push(window.setTimeout(() => onCommandIssued?.(), typeMs));
      }, 600));
    }, 2800));
    return () => timers.forEach(clearTimeout);
  }, [load, ready, machine]);

  if (!active) return null; // só monta o emulador quando a aba K7 está visível

  return (
    <div className="glass-panel flex flex-col" style={{ flex: `${flexGrow ?? 2} 1 0%`, minWidth: 200, minHeight: 0, overflow: 'hidden' }}>
      <div className="px-2 py-1 border-b border-[var(--border)] text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex-shrink-0 flex justify-between items-center"
        title={t('Clique na tela p/ focar. CTRL+ENTER = reset total.', 'Click the screen to focus. CTRL+ENTER = full reset.')}>
        <span className="flex items-center gap-1"><MonitorPlay size={11} /> mini-XRoar · {machine}</span>
        <span className="flex items-center gap-2">
          <span className="normal-case tracking-normal text-[var(--text-muted)]" style={{ fontWeight: 400 }}>Ctrl+↵ {t('reset', 'reset')}</span>
          <span style={{ color: ready ? '#34d399' : '#fbbf24' }}>{ready ? t('pronto', 'ready') : '…'}</span>
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center" style={{ minHeight: 0, background: '#000' }}>
        <iframe key={machine} ref={iframeRef} src={src} title="mini-xroar"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
      </div>
    </div>
  );
}
