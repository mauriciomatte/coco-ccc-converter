import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Power, FolderOpen, Pause, Play, Cpu, X, RefreshCw, Music, ToggleLeft, ToggleRight, Maximize2, Minimize2, HelpCircle } from 'lucide-react';
import { TabHelpModal } from './TabHelp';

// Discos vão para uma drive via insert_disk; FITA (.cas/.wav) vai pro deck via insert_tape;
// o resto (bin/rom/sna…) via load_file auto. OS-9 (.os9) é um dump raw de setores (mesma
// geometria do .dsk) → montado como disco, mas renomeado p/ .dsk na VFS do XRoar (que detecta
// a geometria pela extensão/tamanho — ".os9" não é reconhecido).
const DISK_EXTS = ['dsk', 'vdk', 'jvc', 'dmk', 'os9'];
const CASSETTE_EXTS = ['cas', 'wav'];

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

interface PendingLoad { name: string; ext: string; data: Uint8Array; key: number; drive?: number; runCmd?: string; reset?: boolean; tvInput?: string; glFilter?: string; }
interface PendingType { text: string; key: number; reset?: boolean; }

// Atraso por tecla na injeção BASIC→XRoar. O xroar.html SEMPRE digita caractere-a-caractere (o envio
// em bloco descartava a 1ª linha no CoCo). A velocidade é o toggle "Vel.Export.Código" do editor BASIC
// (localStorage 'xroarTypeSpeed'): 'fast' = 12ms/tecla, 'normal'/padrão = 25ms. Lido a cada digitação.
// AUDITORIA: ponha AUDIT_DELAY_MS em 3000 para inspecionar a 3s/tecla (com log por tecla no console).
const AUDIT_DELAY_MS = 0;
const getTypeDelay = () => {
  if (AUDIT_DELAY_MS > 0) return AUDIT_DELAY_MS;
  try { const v = localStorage.getItem('xroarTypeSpeed'); if (v === 'fast') return 12; if (v === 'normal') return 25; const n = parseInt(v || '25', 10); return [25, 12, 8, 2].includes(n) ? n : 25; } catch { return 25; }
};

interface Props {
  lang: 'pt-br' | 'en-us';
  active?: boolean;
  pendingLoad?: PendingLoad | null;
  pendingType?: PendingType | null;
  onDrivesChange?: (drives: string[]) => void; // reporta ao App quais drives do XRoar estao ocupados (RODAR NO XROAR do BASIC)
  onLog?: (pt: string, en: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
  platform?: 'coco' | 'dragon';
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export default function XRoarPanel({ lang, active, pendingLoad, pendingType, onDrivesChange, onLog, platform, expanded, onToggleExpand }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [machine, setMachine] = useState('coco3');
  const [tvInput, setTvInput] = useState('cmp-br');
  const [glFilter, setGlFilter] = useState('nearest'); // 'nearest'=pixel-perfect (jogos) | 'linear'=suave (texto 80col)
  const [kbdLayout, setKbdLayout] = useState<'coco' | 'pc'>('coco'); // 'coco'=matriz física do CoCo | 'pc'=tradução (o que digita aparece)
  const [kbdLang, setKbdLang] = useState('auto'); // idioma do teclado do host p/ o modo PC (-kbd-lang): auto/br/us/gb/de/fr/es/it…
  const [rightJoy, setRightJoy] = useState(0); // joystick 0
  const [leftJoy, setLeftJoy] = useState(0);    // joystick 1
  const [colour, setColour] = useState(50);
  const [brightness, setBrightness] = useState(50);
  const [contrast, setContrast] = useState(50);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('');
  const [drives, setDrives] = useState<string[]>(['', '', '', '']);
  const [dragDrive, setDragDrive] = useState<number | null>(null); // drive sob o cursor durante um arrastar (highlight)
  useEffect(() => { onDrivesChange?.(drives); }, [drives]); // espelha os drives ocupados pro App (RODAR NO XROAR do BASIC)
  // Guarda o disco montado em cada drive (nome/ext/bytes) p/ o botão "Reinserir" reinjetar — o XRoar faz
  // cache da imagem, então após um reset o "Reinserir" recarrega o .dsk sem reabrir o seletor de arquivo.
  const driveDataRef = useRef<({ name: string; ext: string; data: Uint8Array } | null)[]>([null, null, null, null]);
  // Último programa (.bin/.rom/…) carregado, p/ o botão "Recarregar" reinjetar após um reset do XRoar.
  const lastProgRef = useRef<{ name: string; ext: string; data: number[] } | null>(null);
  const [tapeName, setTapeName] = useState('');                                  // fita montada (.cas/.wav)
  const [tapeAutorun, setTapeAutorun] = useState(false);                          // CLOAD(M) automático: ON=XRoar roda sozinho; OFF=espera o usuário
  const [binAutorun, setBinAutorun] = useState(true);                             // .bin AutoRun: ON=boot com o arquivo (-run); OFF=só carrega
  const [bootProg, setBootProg] = useState<{ name: string; data: number[] } | null>(null); // programa de boot (p/ rodar .bin via argv)
  const [bootProgKey, setBootProgKey] = useState(0);                              // bump → remonta o iframe bootando com o programa
  const bootProgRef = useRef<{ name: string; data: number[] } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false); // config carregada? (evita salvar antes da carga)
  const [mounted, setMounted] = useState(false); // iframe montado? (só após a aba ficar visível)
  const [showHelp, setShowHelp] = useState(false);
  const [wide80, setWide80] = useState(false); // toggle 80/32 colunas (CoCo 3) — true = WIDTH 80 (minúsculas)
  const [progName, setProgName] = useState(''); // nome do programa (.bin/.rom/…) carregado, p/ exibir no painel
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
    `?machine=${machine}&tvInput=${tvInput}&tvType=ntsc&ccr=${tvInput.startsWith('cmp') ? 1 : 0}&glFilter=${glFilter}&kbdTranslate=${kbdLayout === 'pc' ? 1 : 0}&kbdLang=${kbdLang}${bootProg ? '&bootfile=1' : ''}`;

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
    const e = ext.toLowerCase();
    // Feedback de carga vai para o LOG (não para o indicador ao lado de "XRoar", que mostra só o estado).
    if (DISK_EXTS.includes(e)) {
      // OS-9 raw → apresenta como .dsk p/ o XRoar acertar a geometria; o nome exibido na drive
      // mantém o original.
      const vfsName = e === 'os9' ? name.replace(/\.os9$/i, '') + '.dsk' : name;
      sendCmd('insert_disk', { drive, fileName: vfsName, fileData: arr });
      driveDataRef.current[drive] = { name, ext: e, data }; // guarda p/ "Reinserir"
      setDrives(d => { const n = [...d]; n[drive] = name; return n; });
      onLog?.(`D${drive}: ${name}`, `D${drive}: ${name}`, 'info');
    } else if (CASSETTE_EXTS.includes(e)) {
      // Toggle CLOAD(M): ON → tipo 1 (XRoar roda CLOAD/CLOADM sozinho); OFF → tipo 0 (só anexa, espera o usuário).
      sendCmd('load_file', { fileName: name, fileData: arr, loadType: tapeAutorun ? 1 : 0, drive: 0 });
      setTapeName(name);
      onLog?.(tapeAutorun ? `Fita: ${name} (auto)` : `Fita anexada: ${name} — dê CLOAD/CLOADM`,
              tapeAutorun ? `Tape: ${name} (auto)` : `Tape attached: ${name} — run CLOAD/CLOADM`, 'info');
    } else {
      sendCmd('load_file', { fileName: name, fileData: arr, loadType: 0, drive });
      onLog?.(`Carregado: ${name}`, `Loaded: ${name}`, 'info');
    }
    setTimeout(focusEmu, 60);
  };

  // ─── Fita (K7) — usa o deck de cassete já exposto pelo bridge do XRoar ───
  const openTape = async () => {
    try {
      const res = await window.cocoApi.xroarPickFile('tape');   // filtro só de fita (.cas/.wav/.c10)
      if (res?.cancelled) return;
      if (!res?.success) { onLog?.(`XRoar: ${res?.error}`, `XRoar: ${res?.error}`, 'error'); return; }
      sendCmd('load_file', { fileName: res.name, fileData: Array.from(new Uint8Array(res.data)), loadType: tapeAutorun ? 1 : 0, drive: 0 });
      setTapeName(res.name);
      onLog?.(tapeAutorun ? `Fita: ${res.name} (auto)` : `Fita anexada: ${res.name} — dê CLOAD/CLOADM`,
              tapeAutorun ? `Tape: ${res.name} (auto)` : `Tape attached: ${res.name} — run CLOAD/CLOADM`, 'info');
      setTimeout(focusEmu, 60);
    } catch (err: any) { onLog?.(`XRoar: ${err.message}`, `XRoar: ${err.message}`, 'error'); }
  };
  const tapeEject = () => { sendCmd('eject_tape'); setTapeName(''); };

  const openToDrive = async (drive: number) => {
    try {
      const res = await window.cocoApi.xroarPickFile('disk');   // filtro só de disco (.dsk/.vdk/.jvc/.dmk)
      if (res?.cancelled) return;
      if (!res?.success) { onLog?.(`XRoar: ${res?.error}`, `XRoar: ${res?.error}`, 'error'); return; }
      loadToDrive(drive, res.name, res.ext, new Uint8Array(res.data));
    } catch (err: any) { onLog?.(`XRoar: ${err.message}`, `XRoar: ${err.message}`, 'error'); }
  };

  const eject = (drive: number) => {
    sendCmd('eject_disk', { drive });
    driveDataRef.current[drive] = null;
    setDrives(d => { const n = [...d]; n[drive] = ''; return n; });
  };

  // Arrastar-e-soltar um disco do Explorer DIRETO na linha do drive escolhido (D0–D3). Lê os bytes do
  // arquivo no renderer (File.arrayBuffer) e monta com o mesmo loadToDrive do botão "Abrir".
  const onDropDrive = async (drive: number, e: React.DragEvent) => {
    e.preventDefault(); setDragDrive(null);
    if (!ready) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!DISK_EXTS.includes(ext)) {
      onLog?.(`XRoar: "${f.name}" não é uma imagem de disco aceita (.dsk/.vdk/.jvc/.dmk/.os9).`,
              `XRoar: "${f.name}" is not an accepted disk image (.dsk/.vdk/.jvc/.dmk/.os9).`, 'warn');
      return;
    }
    try {
      const buf = await f.arrayBuffer();
      loadToDrive(drive, f.name, ext, new Uint8Array(buf));
    } catch (err: any) { onLog?.(`XRoar: ${err.message}`, `XRoar: ${err.message}`, 'error'); }
  };

  // Reinsere no drive o último disco montado (o XRoar faz cache → após um reset, isto reinjeta a imagem
  // na mesma drive sem reabrir o seletor de arquivo). Mesmo padrão do "Recarregar" da aba DSK.
  const reinsertDrive = (drive: number) => {
    const p = driveDataRef.current[drive];
    if (!p) return;
    const vfsName = p.ext === 'os9' ? p.name.replace(/\.os9$/i, '') + '.dsk' : p.name;
    sendCmd('insert_disk', { drive, fileName: vfsName, fileData: Array.from(p.data) });
    onLog?.(`D${drive}: ${p.name} (reinserido)`, `D${drive}: ${p.name} (reinserted)`, 'info');
    setTimeout(focusEmu, 60);
  };

  // ─── Programa (.bin/.rom/.ccc/.pak/.hex/.sna) ───
  //  • .bin/.hex (código de máquina): só roda automático via PARÂMETRO DE BOOT (xroar arquivo.bin).
  //    Com ".bin AutoRun" ON, REMONTA o iframe bootando com o arquivo. OFF: só carrega na memória.
  //  • .ccc/.rom (cartucho) / .sna (snapshot): o load_file em runtime (autorun) já mapeia e roda.
  //  • .pak (Program Pak do VCC) = ROM de cartucho crua, idêntica a .rom/.ccc. O XRoar reconhece
  //    cartucho pela EXTENSÃO, então o apresentamos como ".rom" (o nome de tela continua o original).
  const applyProgram = (name: string, ext: string, arr: number[], reload = false) => {
    const e = ext.toLowerCase();
    const isBin = e === 'bin' || e === 'hex';
    setProgName(name);
    const xName = e === 'pak' ? name.replace(/\.pak$/i, '.rom') : name; // .pak → .rom p/ o XRoar mapear no cartucho
    const tag = reload ? ' (recarregado)' : '';
    const tagEn = reload ? ' (reloaded)' : '';
    if (isBin && binAutorun) {
      bootProgRef.current = { name, data: arr };
      setBootProg({ name, data: arr });
      setBootProgKey(k => k + 1);                                       // remonta o iframe (bootfile=1) → boot com o programa
      onLog?.(`Programa (boot): ${name}${tag}`, `Program (boot): ${name}${tagEn}`, 'info');
    } else {
      sendCmd('load_file', { fileName: xName, fileData: arr, loadType: (isBin && !binAutorun) ? 0 : 1, drive: 0 });
      onLog?.(binAutorun ? `Programa: ${name}${tag}` : `Programa anexado: ${name}${tag}`, binAutorun ? `Program: ${name}${tagEn}` : `Program attached: ${name}${tagEn}`, 'info');
      setTimeout(focusEmu, 60);
    }
  };

  const openProgram = async () => {
    try {
      const res = await window.cocoApi.xroarPickFile('program');
      if (res?.cancelled) return;
      if (!res?.success) { onLog?.(`XRoar: ${res?.error}`, `XRoar: ${res?.error}`, 'error'); return; }
      const e = (res.ext || '').toLowerCase();
      const arr = Array.from(new Uint8Array(res.data));
      lastProgRef.current = { name: res.name, ext: e, data: arr }; // guarda p/ "Recarregar"
      applyProgram(res.name, e, arr);
    } catch (err: any) { onLog?.(`XRoar: ${err.message}`, `XRoar: ${err.message}`, 'error'); }
  };

  // Recarrega o último programa (.bin/.rom) — o XRoar faz cache, então após um reset isto reinjeta o
  // arquivo sem reabrir o seletor. Mesmo papel do "Reinserir" das drives.
  const reloadProgram = () => {
    const p = lastProgRef.current;
    if (!p) return;
    applyProgram(p.name, p.ext, p.data, true);
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
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return; // só o NOSSO iframe (isola da mini-XRoar)
      const d = e.data;
      if (!d || typeof d.type !== 'string' || !d.type.startsWith('xroar')) return;
      if (d.type === 'xroar-ready') { setReady(true); setPaused(false); setStatus(t('pronto', 'ready')); }
      else if (d.type === 'xroar-need-boot-file') {
        // O iframe (bootfile=1) está esperando o programa p/ bootar com ele (-run) → envia.
        const bp = bootProgRef.current;
        if (bp) e.source && (e.source as Window).postMessage({ type: 'xroar-boot-file', name: bp.name, data: bp.data }, '*');
      }
      else if (d.type === 'xroar-error') onLog?.(`XRoar: ${d.text}`, `XRoar: ${d.text}`, 'error');
      else if (d.type === 'xroar-status' && d.text) setStatus(String(d.text));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lang]);

  // Carrega o que foi empurrado de fora (ex.: "Testar no XRoar" do painel DSK) → drive 0
  useEffect(() => {
    if (!pendingLoad || pendingLoad.key === lastLoadKey.current || !ready) return;
    // Setup pedido pelo chamador (ex.: OS-9 quer RGB + filtro Suave p/ as 80 colunas hi-res ficarem
    // legíveis): ajusta vídeo/filtro PRIMEIRO (num só passo → um remount); o iframe remonta, zera
    // lastLoadKey, este efeito re-roda já no modo certo e então monta+boota.
    {
      const needTv = pendingLoad.tvInput && tvInput !== pendingLoad.tvInput;
      const needGl = pendingLoad.glFilter && glFilter !== pendingLoad.glFilter;
      if (needTv || needGl) { if (needTv) setTvInput(pendingLoad.tvInput!); if (needGl) setGlFilter(pendingLoad.glFilter!); return; }
    }
    lastLoadKey.current = pendingLoad.key;
    loadToDrive(pendingLoad.drive ?? 0, pendingLoad.name, pendingLoad.ext, pendingLoad.data);
    // Auto-roda (duplo-clique): monta o disco, dá HARD RESET (limpa qualquer programa que já
    // esteja rodando → volta ao prompt do BASIC, onde a digitação funciona; o disco montado
    // permanece na drive) e só então digita RUN/LOADM. Sem o reset, o texto iria para o
    // programa em execução e nada carregaria.
    if (pendingLoad.runCmd) {
      // Dragon: a ROM pede "pressione uma tecla" no boot/reset → prefixa um ESPAÇO para dispensar o
      // prompt antes do comando (no prompt do BASIC o espaço é inócuo). Mesmo critério da injeção de BASIC.
      const isDragon = machine.startsWith('dragon');
      const cmd = (isDragon ? ' ' : '') + pendingLoad.runCmd;
      setTimeout(() => sendCmd('hard_reset'), 900);                                  // disco montou → reseta
      setTimeout(() => { sendCmd('type_string', { text: cmd, delayMs: getTypeDelay() }); focusEmu(); }, 3400); // boot pronto → digita
    } else if (pendingLoad.reset) {
      // "Testar Painel": monta o disco e dá HARD RESET → boot limpo com o disco no drive 0
      // (sem auto-digitar; o usuário testa com DIR/RUN/LOADM no prompt).
      setTimeout(() => { sendCmd('hard_reset'); focusEmu(); }, 900);
    }
  }, [pendingLoad, ready, tvInput, glFilter]);

  // Injeção de BASIC/texto (aba BASIC) → digita no emulador via type_string.
  //  - reset=true: HARD RESET primeiro (boot limpo, garante o prompt OK mesmo com algo rodando),
  //    aguarda o boot e então digita.
  //  - reset=false: digita direto no prompt atual (mais rápido; o texto já costuma incluir NEW).
  useEffect(() => {
    if (!pendingType || pendingType.key === lastTypeKey.current || !ready) return;
    lastTypeKey.current = pendingType.key;
    const { text, reset } = pendingType;
    // Prime depende da máquina:
    //  • CoCo: nenhum — depois do reset (ou já no prompt) o cursor está pronto; manda o texto cru.
    //    (A perda da 1ª linha no CoCo era do ENVIO EM BLOCO, já corrigido — o xroar.html agora digita
    //    sempre caractere-a-caractere.) Em "Rodar com reset" o hard reset limpa a RAM, então o NEW nem
    //    é incluído (ver BasicEditor.buildProgram).
    //  • Dragon: a ROM pede "pressione uma tecla" no boot/reset → mandamos um ESPAÇO antes para
    //    dispensar esse prompt. Se cair no prompt do BASIC, o espaço é ignorado (inócuo).
    const isDragon = machine.startsWith('dragon');
    const primed = isDragon ? ' ' + text : text;
    if (reset) {
      sendCmd('hard_reset');
      setTimeout(() => { focusEmu(); sendCmd('type_string', { text: primed, delayMs: getTypeDelay() }); }, 2800); // espera o boot
    } else {
      // Atraso curto para o canvas focar/processar antes de digitar (aba recém-exibida).
      focusEmu();
      setTimeout(() => { sendCmd('type_string', { text: primed, delayMs: getTypeDelay() }); }, 450);
    }
  }, [pendingType, ready]);

  // Trocar máquina ou saída de vídeo REMONTA o iframe (key={machine|tvInput}) → reboot. Limpa as
  // drives e marca NÃO-pronto até o novo boot reportar 'xroar-ready'. Assim um disco empurrado logo
  // após uma troca de máquina (ex.: "Testar Painel" de um disco Dragon com o XRoar em CoCo) ESPERA
  // a máquina certa subir antes de montar.
  useEffect(() => {
    setDrives(['', '', '', '']); setTapeName(''); driveDataRef.current = [null, null, null, null];
    // Remontagem (não a 1ª montagem) limpa as drives → re-aplica o disco/texto pendente no novo boot,
    // senão a imagem some do emulador (mas o nome ficava no D1) e o usuário tinha que testar 2×.
    if (mounted) { setReady(false); lastLoadKey.current = 0; lastTypeKey.current = 0; }
  }, [machine, tvInput, glFilter, kbdLayout, kbdLang, bootProgKey]);

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
          if (x.glFilter) setGlFilter(x.glFilter);
          if (x.kbdLayout === 'pc' || x.kbdLayout === 'coco') setKbdLayout(x.kbdLayout);
          if (typeof x.kbdLang === 'string') setKbdLang(x.kbdLang);
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
      window.cocoApi.saveConfig({ xroar: { machine, tvInput, glFilter, kbdLayout, kbdLang, colour, brightness, contrast, rightJoy, leftJoy } });
    }, 400);
    return () => clearTimeout(id);
  }, [loaded, machine, tvInput, glFilter, kbdLayout, kbdLang, colour, brightness, contrast, rightJoy, leftJoy]);

  const togglePause = () => {
    if (paused) { sendCmd('resume'); setPaused(false); }
    else { sendCmd('pause'); setPaused(true); }
  };
  // Toggle 80/32 colunas (só CoCo 3): digita WIDTH 80/32 no BASIC. 80 col = minúsculas reais do GIME;
  // 32 col = modo VDG (minúscula invertida). NÃO mexe em RGB/Composto — só mostra texto diferente.
  const toggleWidth = () => {
    const next = !wide80; setWide80(next);
    sendCmd('type_string', { text: next ? 'WIDTH 80\r' : 'WIDTH 32\r', delayMs: getTypeDelay() });
    focusEmu();
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
      {/* ESQUERDA: drives + joystick/teclado (oculta no modo Expandir p/ a tela usar toda a área) */}
      <div className="flex flex-col gap-3 overflow-y-auto flex-shrink-0" style={{ width: SIDEBAR_W, display: expanded ? 'none' : 'flex' }}>
        <div className="glass-panel p-2.5 flex flex-col gap-1.5">
          <div className={sectionTitle}>{t('Drives', 'Drives')}</div>
          {[0, 1, 2, 3].map(d => (
            <div key={d}
              onDragOver={e => { if (ready) { e.preventDefault(); setDragDrive(d); } }}
              onDragLeave={() => setDragDrive(c => (c === d ? null : c))}
              onDrop={e => onDropDrive(d, e)}
              className="flex items-center gap-1.5 rounded"
              style={dragDrive === d ? { outline: '1px dashed var(--primary)', background: 'var(--primary-glow)' } : undefined}
              title={t('Arraste e solte um disco (.dsk/.vdk/.jvc/.dmk/.os9) aqui para montar neste drive', 'Drag and drop a disk (.dsk/.vdk/.jvc/.dmk/.os9) here to mount it in this drive')}>
              <span className="text-[10px] font-mono w-6 flex-shrink-0" style={{ color: drives[d] ? 'var(--primary)' : 'var(--text-muted)' }}>D{d}</span>
              <span className="text-[10px] text-[var(--text-secondary)] font-mono truncate flex-1" title={drives[d]}>{drives[d] || '—'}</span>
              <button onClick={() => reinsertDrive(d)} disabled={!ready || !drives[d]} className="dsk-tool" style={{ padding: '2px 6px' }} title={t('Reinserir o disco (o XRoar faz cache; reinjeta a imagem após um reset)', 'Re-insert the disk (XRoar caches; re-injects the image after a reset)')}><RefreshCw size={12} /></button>
              <button onClick={() => openToDrive(d)} disabled={!ready} className="dsk-tool" style={{ padding: '2px 6px' }} title={t('Abrir', 'Open')}><FolderOpen size={12} /></button>
              <button onClick={() => eject(d)} disabled={!ready || !drives[d]} className="dsk-tool" style={{ padding: '2px 6px' }} title={t('Ejetar', 'Eject')}><X size={12} /></button>
            </div>
          ))}
        </div>

        {/* FITA (K7) — deck de cassete do XRoar. NOTA: este xroar.wasm só exporta load_file + eject de fita;
            o motor (play/pause/rewind) e o contador não estão neste build → carregamos via load_file (auto). */}
        <div className="glass-panel p-2.5 flex flex-col gap-1.5">
          <div className={sectionTitle}>{t('Fita (K7)', 'Tape (K7)')}</div>
          <div className="flex items-center gap-1.5">
            <Music size={13} className={tapeName ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'} />
            <span className="text-[10px] text-[var(--text-secondary)] font-mono truncate flex-1" title={tapeName}>{tapeName || '—'}</span>
            <button onClick={openTape} disabled={!ready} className="dsk-tool" style={{ padding: '2px 6px' }} title={t('Abrir fita (.cas/.wav)', 'Open tape (.cas/.wav)')}><FolderOpen size={12} /></button>
            <button onClick={tapeEject} disabled={!ready || !tapeName} className="dsk-tool" style={{ padding: '2px 6px' }} title={t('Ejetar fita', 'Eject tape')}><X size={12} /></button>
          </div>
          <button
            onClick={() => setTapeAutorun(v => !v)}
            className="dsk-tool flex items-center gap-1.5 justify-start"
            style={{ padding: '3px 7px', color: tapeAutorun ? 'var(--primary)' : 'var(--text-muted)' }}
            title={t('CLOAD(M) automático. LIGADO: o XRoar roda CLOAD/CLOADM sozinho ao abrir a fita. DESLIGADO: a fita só é anexada — você digita CLOAD/CLOADM no emulador.',
                     'Auto CLOAD(M). ON: XRoar runs CLOAD/CLOADM by itself when the tape is opened. OFF: the tape is only attached — you type CLOAD/CLOADM in the emulator.')}>
            {tapeAutorun ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
            <span className="text-[10px] font-bold">CLOAD(M) {tapeAutorun ? t('auto', 'auto') : t('manual', 'manual')}</span>
          </button>
          <div className="text-[9px] text-[var(--text-muted)] leading-tight">
            {tapeAutorun
              ? t('Auto: abrir a fita já roda CLOAD/CLOADM (XRoar detecta BASIC/máquina).', 'Auto: opening the tape runs CLOAD/CLOADM (XRoar detects BASIC/machine).')
              : t('Manual: a fita só é anexada. Digite CLOAD (BASIC) ou CLOADM (máquina) + Enter no emulador.', 'Manual: the tape is only attached. Type CLOAD (BASIC) or CLOADM (machine) + Enter in the emulator.')}
          </div>
        </div>

        {/* PROGRAMA (.bin/.rom/.ccc/.hex/.sna) — carrega e roda direto (LOADM/EXEC automático) */}
        <div className="glass-panel p-2.5 flex flex-col gap-1.5">
          <div className={sectionTitle}>{t('Programa (.bin/.rom)', 'Program (.bin/.rom)')}</div>
          {/* nome do programa carregado (em destaque) — só aparece quando há algo carregado */}
          {progName && (
            <div className="text-[10px] font-bold truncate px-1.5 py-1 rounded" title={progName}
              style={{ background: 'var(--primary-glow)', color: '#fff', border: '1px solid var(--border-active)' }}>
              {progName}
            </div>
          )}
          <div className="flex gap-1.5">
            <button onClick={openProgram} disabled={!ready} className="dsk-tool flex-1 flex items-center gap-1 justify-center" style={{ padding: '3px 5px' }}
              title={t('Abrir e RODAR um programa (.bin/.rom/.ccc/.pak/.hex/.sna) — o XRoar detecta o formato e executa (LOADM/EXEC automático). .pak = cartucho do VCC.', 'Open and RUN a program (.bin/.rom/.ccc/.pak/.hex/.sna) — XRoar detects the format and executes it (LOADM/EXEC auto). .pak = VCC cartridge.')}>
              <FolderOpen size={12} /><span className="text-[10px] font-bold">{t('Abrir', 'Open')}</span>
            </button>
            <button onClick={() => setBinAutorun(v => !v)} className="dsk-tool flex-1 flex items-center gap-1 justify-center" style={{ padding: '3px 5px', color: binAutorun ? 'var(--primary)' : 'var(--text-muted)' }}
              title={t('AutoRun do .bin. LIGADO: .bin/.hex bootam o XRoar com o arquivo (xroar arquivo.bin) e RODAM sozinhos. DESLIGADO: só carregam na memória (você roda com EXEC). (.ccc/.rom/.sna sempre rodam.)', '.bin AutoRun. ON: .bin/.hex boot XRoar with the file (xroar file.bin) and RUN automatically. OFF: just load into memory (run with EXEC). (.ccc/.rom/.sna always run.)')}>
              {binAutorun ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              <span className="text-[10px] font-bold">{t('AutoRun', 'AutoRun')}</span>
            </button>
            <button onClick={reloadProgram} disabled={!ready || !progName} className="dsk-tool flex-shrink-0" style={{ padding: '3px 6px' }}
              title={t('Recarregar o .bin/.rom carregado (o XRoar faz cache; reinjeta o arquivo após um reset).', 'Reload the loaded .bin/.rom (XRoar caches; re-injects the file after a reset).')}>
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="text-[9px] text-[var(--text-muted)] leading-tight">{t('.CCC/.ROM/.PAK (cartucho) e .SNA rodam direto. .BIN de máquina precisa do AutoRun p/ executar.', '.CCC/.ROM/.PAK (cartridge) and .SNA run directly. Machine .BIN needs AutoRun to execute.')}</div>
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
          {/* Layout de teclado: CoCo (matriz física) ↔ PC (tradução — o que você digita aparece). Remonta o emulador. */}
          <button onClick={() => setKbdLayout(v => (v === 'coco' ? 'pc' : 'coco'))} disabled={!ready}
            className="dsk-tool flex items-center gap-1.5 justify-start mt-0.5"
            style={{ padding: '3px 7px', color: kbdLayout === 'pc' ? 'var(--primary)' : 'var(--text-muted)' }}
            title={t('Layout do teclado. CoCo = posições FÍSICAS do teclado do CoCo (a tecla mapeia pela posição na matriz). PC = TRADUÇÃO (o que você digita no PC aparece — Shift+2=@, etc.). Trocar reinicia o emulador.',
                     'Keyboard layout. CoCo = PHYSICAL CoCo key positions (a key maps by its matrix position). PC = TRANSLATION (what you type on the PC appears — Shift+2=@, etc.). Switching reboots the emulator.')}>
            {kbdLayout === 'pc' ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
            <span className="text-[10px] font-bold">{t('Teclado', 'Keyboard')}: {kbdLayout === 'pc' ? t('layout PC', 'PC layout') : t('layout CoCo', 'CoCo layout')}</span>
          </button>
          {/* Idioma do teclado do host (só no modo PC): o "auto" não enxerga o layout do SO no navegador →
              o usuário escolhe (ex.: Brasil = ABNT2). Trocar reinicia o emulador. */}
          {kbdLayout === 'pc' && (
            <label className="flex flex-col gap-0.5 text-[10px] text-[var(--text-secondary)]">
              <span>{t('Idioma do teclado', 'Keyboard language')}</span>
              <select value={kbdLang} onChange={(e) => setKbdLang(e.target.value)} disabled={!ready} className="input-select text-xs py-1 w-full"
                title={t('Casa o seu teclado FÍSICO. Brasil = ABNT2. "Automático" costuma cair em US no navegador.', 'Match your PHYSICAL keyboard. Brazil = ABNT2. "Automatic" usually falls back to US in the browser.')}>
                <option value="auto">{t('Automático (sistema)', 'Automatic (system)')}</option>
                <option value="br">{t('Brasil (ABNT2)', 'Brazil (ABNT2)')}</option>
                <option value="us">{t('EUA (US)', 'USA (US)')}</option>
                <option value="gb">{t('Reino Unido (UK)', 'United Kingdom (UK)')}</option>
                <option value="de">{t('Alemanha', 'Germany')}</option>
                <option value="fr">{t('França', 'France')}</option>
                <option value="es">{t('Espanha', 'Spain')}</option>
                <option value="it">{t('Itália', 'Italy')}</option>
                <option value="be">{t('Bélgica', 'Belgium')}</option>
                <option value="nl">{t('Holanda', 'Netherlands')}</option>
                <option value="dk">{t('Dinamarca', 'Denmark')}</option>
                <option value="no">{t('Noruega', 'Norway')}</option>
                <option value="fi">{t('Finlândia', 'Finland')}</option>
                <option value="jp">{t('Japão', 'Japan')}</option>
              </select>
            </label>
          )}
          <div className="text-[9px] text-[var(--text-muted)] leading-tight mt-0.5">
            {kbdLayout === 'pc'
              ? t('Layout PC: símbolos batem com o seu teclado (escolha o idioma acima). ⚠ Mas a CAIXA fica presa em maiúscula — Shift/CapsLock não alternam aqui. Para maiúsc/minúsc use o layout CoCo.', 'PC layout: symbols match your keyboard (pick the language above). ⚠ But CASE is stuck on uppercase — Shift/CapsLock don\'t toggle here. For upper/lowercase use CoCo layout.')
              : t('Layout CoCo: teclado autêntico do CoCo. SHIFT+0 trava minúsculas e o Shift alterna maiúsc/minúsc. (Símbolos seguem a posição no teclado do CoCo.)', 'CoCo layout: authentic CoCo keyboard. SHIFT+0 locks lowercase and Shift toggles upper/lowercase. (Symbols follow the CoCo key positions.)')}
          </div>
          <div className="text-[9px] text-[var(--text-muted)] leading-tight mt-0.5">
            {t('No CoCo o joystick 0 é o direito. Use um teclado-joystick para jogar.', 'On the CoCo joystick 0 is the right one. Use a keyboard-joystick to play.')}
          </div>
        </div>
      </div>

      {/* CENTRO: tela do emulador 4:3 */}
      <div ref={stageRef} className="flex-1 glass-panel overflow-hidden flex items-center justify-center bg-black" style={{ minHeight: 0, minWidth: 0, position: 'relative' }}>
        {/* Expandir/recolher: o canvas é 4:3 limitado pela ALTURA → expandir esconde as laterais E o
            console de diagnóstico (no App), dando muito mais altura → tela maior e mais nítida. */}
        {onToggleExpand && (
          <button onClick={onToggleExpand}
            className="dsk-tool" style={{ position: 'absolute', top: 8, right: 8, zIndex: 20, padding: '4px 8px' }}
            title={expanded ? t('Recolher (mostrar painéis)', 'Collapse (show panels)') : t('Expandir a tela (esconde painéis)', 'Expand the screen (hide panels)')}>
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
        {mounted ? (
          <iframe
            ref={iframeRef}
            key={`${machine}|${tvInput}|${glFilter}|${kbdLayout}|${kbdLang}|${bootProgKey}`}
            src={src}
            title="XRoar"
            allow="autoplay; gamepad"
            style={{ width: box.w || '100%', height: box.h || '100%', border: 0, display: 'block' }}
          />
        ) : (
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{t('iniciando emulador…', 'starting emulator…')}</span>
        )}
      </div>

      {/* DIREITA: máquina + vídeo + imagem + controles (oculta no modo Expandir) */}
      <div className="flex flex-col gap-3 overflow-y-auto flex-shrink-0" style={{ width: SIDEBAR_W, display: expanded ? 'none' : 'flex' }}>
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
            <select value={machine} onChange={(e) => { setReady(false); setWide80(false); setProgName(''); setMachine(e.target.value); }} className="input-select text-xs py-1 w-full">
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
          <div>
            <div className={sectionTitle}>{t('Filtro de tela', 'Screen filter')}</div>
            <select value={glFilter} onChange={(e) => { setReady(false); setGlFilter(e.target.value); }} className="input-select text-xs py-1 w-full">
              <option value="nearest">{t('Nítido (pixel)', 'Sharp (pixel)')}</option>
              <option value="linear">{t('Suave (texto 80 col)', 'Smooth (80-col text)')}</option>
            </select>
            <div className="text-[9px] text-[var(--text-muted)] mt-1 leading-tight">
              {t('Nítido = pixels exatos (jogos). Suave = uniformiza o texto fino de 80 colunas (OS-9).',
                 'Sharp = exact pixels (games). Smooth = evens out thin 80-column text (OS-9).')}
            </div>
          </div>
        </div>

        <div className="glass-panel p-3 flex flex-col gap-2.5">
          <div className={sectionTitle}>{t('Imagem', 'Picture')}</div>
          {pic.map(s => (
            <label key={s.key} className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
              <span className="flex-shrink-0" style={{ width: 60 }}>{s.l}</span>
              <input type="range" min={0} max={100} value={s.val} disabled={!ready}
                onChange={(e) => { const v = parseInt(e.target.value, 10); s.set(v); setVideo(s.key, v); }}
                className="flex-1" style={{ minWidth: 0, width: '100%' }} />
            </label>
          ))}
          <div style={{ height: 2 }} />{/* folga extra entre o Contraste e a borda inferior do painel */}
        </div>

        <div className="glass-panel p-2.5 flex flex-col gap-1.5">
          <div className={sectionTitle}>{t('Controles', 'Controls')}</div>
          {/* Só ícones (hint no tooltip) e em LINHA → libera espaço vertical p/ os demais componentes. */}
          <div className="flex gap-1.5">
            <button onClick={togglePause} disabled={!ready} className="dsk-tool justify-center flex-1" title={paused ? t('Continuar', 'Resume') : t('Pausar', 'Pause')}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
            <button onClick={() => sendCmd('soft_reset')} disabled={!ready} className="dsk-tool justify-center flex-1" title={t('Reset', 'Reset')}><RotateCcw size={15} /></button>
            <button onClick={() => sendCmd('hard_reset')} disabled={!ready} className="dsk-tool justify-center flex-1" title={t('Reset total', 'Hard reset')}><Power size={15} /></button>
          </div>
        </div>

        {/* TEXTO — toggle 80/32 colunas (só CoCo 3): WIDTH 80 mostra as minúsculas reais do GIME */}
        {machine.startsWith('coco3') && (
          <div className="glass-panel p-2.5 flex flex-col gap-1.5">
            <div className={sectionTitle}>{t('Colunas', 'Columns')}</div>
            <button onClick={toggleWidth} disabled={!ready} className="dsk-tool justify-center" style={{ color: wide80 ? '#34d399' : undefined }}
              title={t('Digita WIDTH 80/32 no BASIC. 80 col = minúsculas reais do GIME; 32 col = modo VDG (minúscula invertida). Precisa do prompt OK.',
                       'Types WIDTH 80/32 in BASIC. 80 col = real GIME lowercase; 32 col = VDG mode (inverse lowercase). Needs the OK prompt.')}>
              {wide80 ? <ToggleRight size={15} /> : <ToggleLeft size={15} />} {wide80 ? t('80 colunas (minúsculas)', '80 columns (lowercase)') : t('32 colunas (VDG)', '32 columns (VDG)')}
            </button>
          </div>
        )}

        <button onClick={() => setShowHelp(true)} className="dsk-tool justify-center" title={t('Como usar a aba XRoar', 'How to use the XRoar tab')}>
          <HelpCircle size={13} /> {t('Ajuda', 'Help')}
        </button>

        <div className="text-[9px] text-[var(--text-muted)] leading-tight">
          {t('Clique na tela para capturar teclado/áudio. Trocar máquina/vídeo reinicia o emulador.',
             'Click the screen to capture keyboard/audio. Changing machine/video reboots the emulator.')}
        </div>
      </div>
      {showHelp && <TabHelpModal topic="xroar" lang={lang} onClose={() => setShowHelp(false)} />}
    </div>
  );
}
