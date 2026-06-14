import React, { useState, useEffect, useRef } from 'react';
import { Download, Server, FolderOpen, Power, Wifi, WifiOff, Loader, Link2, FileArchive, X, Folder, ArrowUp, Star, Trash2, Plus, RefreshCw, Copy, Check, Lock, Pencil, EyeOff, ChevronDown, Send, SaveAll, HardDrive, Cable, Save, Cpu, MonitorPlay } from 'lucide-react';
import { HelpButton, TabHelpModal } from './TabHelp';
import DriveWirePanel from './DriveWirePanel';

// Splitter VERTICAL arrastável entre colunas (reaproveita .splitter-v do index.css). onDelta = dx do mouse.
function VSplitter({ onDelta }: { onDelta: (dx: number) => void }) {
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    let last = e.clientX;
    const mv = (ev: MouseEvent) => { onDelta(ev.clientX - last); last = ev.clientX; };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  return <div className="splitter-v" onMouseDown={onDown} title="Arraste para redimensionar" style={{ flexShrink: 0, alignSelf: 'stretch' }} />;
}

interface FavServer { host: string; label?: string; path?: string }
interface CommunityServer { host: string; tcpUp: boolean; udpUp: boolean }
interface RecentServed { mode: 'folder' | 'container'; path: string } // pastas/containers servidos recentemente
const RECENT_MAX = 8;

// Extensões que sabemos abrir/injetar (p/ filtrar o conteúdo de um .zip baixado).
const OPENABLE = ['dsk', 'vdk', 'sdf', 'os9', 'dmk', 'jvc', 'img', 'vhd', 'ccc', 'cas', 'c10', 'bin', 'bas', 'rom', 'hex', 'sna'];
const extOf = (n: string) => (n.split('.').pop() || '').toLowerCase();
const isOpenable = (n: string) => OPENABLE.includes(extOf(n));

// Aba FUJINET / ONLINE — ponte de imagens entre servidores FujiNet/TNFS e o nosso pipeline de discos.
// Estrutura ISOLADA (fácil de desativar): toda a rede mora no MAIN (IPC); aqui só UI + hand-off.
//  • ESQUERDA = CLIENTE: acessar servidores (cliente TNFS [M1b] + abrir por URL [M1a]).
//  • DIREITA  = SERVIDOR WiFi de arquivos p/ a FujiNet (M3 [em breve]).
// Estado durável (favoritos, último host, pasta) persiste no config; a aba fica sempre montada no App.

type Lang = 'pt-br' | 'en-us';
interface Props {
  lang: Lang;
  onLog: (pt: string, en: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
  onOpenImage: (name: string, bytes: Uint8Array) => void; // App decide: abrir no painel / rotear OS-9
  onSendXroar: (name: string, bytes: Uint8Array) => void; // App monta no XRoar (drive 0, reset)
  pendingDw?: { filePath: string; name: string; slot?: number; key: number } | null; // disco enviado da aba DSK → painel DriveWire
  onPendingDwConsumed?: () => void;
}

export default function FujiNetTab({ lang, onLog, onOpenImage, onSendXroar, pendingDw, onPendingDwConsumed }: Props) {
  const pt = lang === 'pt-br';
  const t = (p: string, e: string) => (pt ? p : e);
  const [showHelp, setShowHelp] = useState(false);
  const [wifiWidth, setWifiWidth] = useState(320);  // largura da coluna do servidor WiFi (splitter)
  const [dwWidth, setDwWidth] = useState(360);       // largura da coluna do servidor DriveWire (splitter)
  const [busy, setBusy] = useState(false);
  // QUAL operação está em curso — separa as animações/cores por botão (connect ≠ url ≠ download).
  const [busyKind, setBusyKind] = useState<'connect' | 'url' | 'download' | ''>('');
  const connectGen = useRef(0); // "geração" da conexão: permite ABANDONAR um connect em andamento (Desconectar)
  const [zipPick, setZipPick] = useState<null | { data: Uint8Array; entries: { name: string; size: number }[] }>(null);
  // Os dois HUBs do topo (Enviar para…/Salvar arquivo…). FLUXO: o clique ABRE o HUB NA HORA (sem esperar
  // download); o arquivo só é BAIXADO quando o usuário escolhe o destino dentro do HUB.
  //  • hubSource = o item escolhido (nome+tamanho da listagem) — pode ainda NÃO estar baixado.
  //  • staged    = o arquivo já baixado+analisado (preguiçoso): preenchido na 1ª ação que precisa dos bytes.
  const [staged, setStaged] = useState<null | { name: string; bytes: Uint8Array; isOs9: boolean; isRsDos: boolean; count: number; volume?: string }>(null);
  const [hubSource, setHubSource] = useState<null | { name: string; size: number }>(null);
  const [sendOpen, setSendOpen] = useState(false);  // HUB "Enviar para…"
  const [saveOpen, setSaveOpen] = useState(false);  // HUB "Salvar arquivo…"
  const [hubBusy, setHubBusy] = useState(false);    // baixando/gravando dentro de um HUB
  const [dwDrive, setDwDrive] = useState(0);         // drive D0–D3 escolhido p/ "Enviar p/ DriveWire"
  const [localPendingDw, setLocalPendingDw] = useState<null | { filePath: string; name: string; slot?: number; key: number }>(null);
  const hubTargetRef = useRef<'send' | 'save'>('send'); // p/ o fluxo de URL: qual HUB abrir após o download
  const bigDlResolve = useRef<((ok: boolean) => void) | null>(null); // resolve da confirmação de arquivo grande

  // Detecta o TIPO do disco baixado (OS-9 vs RS-DOS vs contêiner) p/ habilitar as opções certas no HUB.
  const analyzeStaged = async (name: string, bytes: Uint8Array) => {
    let isOs9 = false, volume: string | undefined;
    try { const det = await window.cocoApi.os9DetectBuffer?.(bytes); if (det?.os9) { isOs9 = true; volume = det.volume; if (det.image) bytes = new Uint8Array(det.image); } } catch { /* */ }
    let count = 1, isRsDos = false;
    if (!isOs9) {
      const multiple = bytes.length >= 161280 && bytes.length % 161280 === 0;
      if (multiple) { try { const d = await window.cocoApi.dskDetectContainer?.(bytes, 161280); count = d?.count ?? 1; } catch { /* */ } isRsDos = true; }
      else { try { const dir = await window.cocoApi.readDskDirectory?.(bytes); if (dir?.success) isRsDos = true; } catch { /* */ } }
    }
    return { name, bytes, isOs9, isRsDos, count, volume };
  };
  // Abre um HUB NA HORA sobre um item da listagem (sem baixar). O tipo só é conhecido após a 1ª ação.
  const openHub = (target: 'send' | 'save', entry: { name: string; size: number }) => {
    setHubSource({ name: entry.name, size: entry.size });
    if (!staged || staged.name !== entry.name) setStaged(null); // tipo será detectado ao baixar
    if (target === 'save') { setSaveOpen(true); setSendOpen(false); } else { setSendOpen(true); setSaveOpen(false); }
  };
  // Fluxo de URL (download já consumado): estaciona + abre o HUB-alvo (send por padrão).
  const stageThenHub = async (name: string, bytes: Uint8Array) => {
    const s = await analyzeStaged(name, bytes);
    setStaged(s); setHubSource({ name, size: bytes.length });
    if (hubTargetRef.current === 'save') { setSaveOpen(true); setSendOpen(false); }
    else { setSendOpen(true); setSaveOpen(false); }
    hubTargetRef.current = 'send';
  };
  // Botões da toolbar: abrem o HUB-alvo NA HORA sobre o item selecionado (1 clique); se já há um baixado, reabre nele.
  const actSelected = (target: 'send' | 'save') => {
    const sel = (tnfsEntries || []).find(e => e.name === tnfsSel && !e.isDir) || null;
    if (sel) { openHub(target, sel); return; }
    if (staged && hubSource) { target === 'save' ? (setSaveOpen(true), setSendOpen(false)) : (setSendOpen(true), setSaveOpen(false)); }
  };

  // Confirmação para downloads GRANDES (TNFS é lento). Promessa resolvida pelos botões do modal bigDl.
  const confirmIfLarge = (name: string, size: number) => new Promise<boolean>((resolve) => {
    if (size <= LARGE_DL) { resolve(true); return; }
    bigDlResolve.current = resolve; setBigDl({ name, size });
  });
  // Baixa o arquivo do TNFS e devolve os bytes (descompacta .zip → 1ª imagem). NÃO abre HUB.
  const fetchTnfsFile = async (name: string, size: number): Promise<{ name: string; bytes: Uint8Array } | null> => {
    const h = host.trim(); const p = jp(tnfsPath, name);
    setBusy(true); setBusyKind('download'); setDlGot(0); setDlTotal(size || 0); setDlName(name);
    onLog(`FujiNet TNFS: baixando ${p}…`, `FujiNet TNFS: downloading ${p}…`, 'info');
    try {
      const r = await window.cocoApi.tnfsRead(h, p);
      if (!r?.success) { onLog(`FujiNet TNFS: ${r?.error}`, `FujiNet TNFS: ${r?.error}`, r?.error === 'Download cancelado.' ? 'warn' : 'error'); return null; }
      onLog(`FujiNet TNFS: ${r.name} (${r.bytes} bytes) baixado.`, `FujiNet TNFS: ${r.name} (${r.bytes} bytes) downloaded.`, 'success');
      if (r.isZip) {
        const openable = (r.entries || []).filter((e: any) => isOpenable(e.name));
        if (openable.length === 0) { onLog('FujiNet: o ZIP não tem imagem reconhecível.', 'FujiNet: the ZIP has no recognizable image.', 'warn'); return null; }
        if (openable.length > 1) onLog(`FujiNet: ZIP com ${openable.length} imagens — usando a primeira (${openable[0].name}).`, `FujiNet: ZIP with ${openable.length} images — using the first (${openable[0].name}).`, 'info');
        const ex = await window.cocoApi.zipExtract(new Uint8Array(r.data), openable[0].name);
        if (!ex?.success) { onLog(`FujiNet: falha ao extrair — ${ex?.error}`, `FujiNet: extract failed — ${ex?.error}`, 'error'); return null; }
        return { name: ex.name, bytes: new Uint8Array(ex.data) };
      }
      return { name: r.name, bytes: new Uint8Array(r.data) };
    } catch (e: any) { onLog(`FujiNet TNFS: erro — ${e?.message}`, `FujiNet TNFS: error — ${e?.message}`, 'error'); return null; }
    finally { setBusy(false); setBusyKind(''); setDlGot(0); setDlName(''); }
  };
  // Garante o arquivo baixado+analisado (preguiçoso): reusa o staged se já é o mesmo; senão confirma-se-grande, baixa e analisa.
  const ensureStaged = async (): Promise<typeof staged> => {
    if (!hubSource) return staged;
    if (staged && staged.name === hubSource.name) return staged;
    const ok = await confirmIfLarge(hubSource.name, hubSource.size);
    if (!ok) return null;
    const got = await fetchTnfsFile(hubSource.name, hubSource.size);
    if (!got) return null;
    const s = await analyzeStaged(got.name, got.bytes);
    setStaged(s);
    return s;
  };

  // Garante uma PASTA destino: usa a já servida por Wi-Fi (modo Pasta), ou pede uma — que então VIRA a pasta servida.
  const resolveServeFolder = async (): Promise<string | null> => {
    if (serverMode === 'folder' && serverPath) return serverPath;
    const r = await window.cocoApi.pickDirectory?.();
    if (!r?.path) return null;
    setServerMode('folder'); setServerWritable(false); setServerPath(r.path); setSharedFiles(null);
    previewServer(r.path, 'folder'); pushRecent('folder', r.path);
    return r.path;
  };
  const saveBytesToDir = async (dir: string, name: string, bytes: Uint8Array): Promise<string | null> => {
    try { const r = await window.cocoApi.fnSaveToDir?.(dir, name, bytes); if (r?.success) return r.filePath; onLog(`Servidores: ${r?.error}`, `Servers: ${r?.error}`, 'error'); }
    catch (e: any) { onLog(`Servidores: ${e?.message}`, `Servers: ${e?.message}`, 'error'); }
    return null;
  };

  // HUB Enviar → Painel DSK / Aba OS-9: baixa (se preciso) e deixa o App rotear pelo tipo real.
  const sendToApp = async () => {
    setHubBusy(true);
    try { const s = await ensureStaged(); if (!s) return; onOpenImage(s.name, s.bytes); setSendOpen(false); }
    finally { setHubBusy(false); }
  };
  // HUB Enviar → XRoar: baixa (se preciso) e monta no emulador (drive 0, reset).
  const sendToXroar = async () => {
    setHubBusy(true);
    try { const s = await ensureStaged(); if (!s) return; onSendXroar(s.name, s.bytes); setSendOpen(false); }
    finally { setHubBusy(false); }
  };
  // HUB Enviar → DriveWire: escolhe a PASTA primeiro (instantâneo), depois baixa e monta no drive Dx.
  const sendToDriveWire = async () => {
    const folder = await resolveServeFolder();
    if (!folder) { onLog('Envio ao DriveWire cancelado (sem pasta).', 'Send to DriveWire canceled (no folder).', 'warn'); return; }
    setHubBusy(true);
    try {
      const s = await ensureStaged(); if (!s) return;
      const fp = await saveBytesToDir(folder, s.name, s.bytes); if (!fp) return;
      setLocalPendingDw({ filePath: fp, name: s.name, slot: dwDrive, key: Date.now() });
      onLog(`Servidores: ${s.name} salvo na pasta e montado no DriveWire D${dwDrive}.`,
            `Servers: ${s.name} saved to the folder and mounted on DriveWire D${dwDrive}.`, 'success');
      setSendOpen(false);
    } finally { setHubBusy(false); }
  };
  // HUB Salvar → no PC (diálogo livre): baixa (se preciso) e abre o diálogo de salvar.
  const saveToPc = async () => {
    setHubBusy(true);
    try {
      const s = await ensureStaged(); if (!s) return;
      const r = await window.cocoApi.saveCartridgeFile(s.bytes, s.name, t('Salvar imagem no PC', 'Save image to PC'),
        [{ name: t('Imagem de disco', 'Disk image'), extensions: ['dsk', 'os9', 'img', 'vdk', 'sdf'] }, { name: t('Todos os arquivos', 'All files'), extensions: ['*'] }]);
      if (r?.success) { onLog(`Servidores: ${s.name} salvo no PC (${r.filePath}).`, `Servers: ${s.name} saved to the PC (${r.filePath}).`, 'success'); setSaveOpen(false); }
      else if (!r?.cancelled) onLog(`Servidores: ${r?.error || 'falha ao salvar'}`, `Servers: ${r?.error || 'save failed'}`, 'error');
    } catch (e: any) { onLog(`Servidores: ${e?.message}`, `Servers: ${e?.message}`, 'error'); }
    finally { setHubBusy(false); }
  };
  // HUB Salvar → e apontar no Wi-Fi: escolhe a PASTA primeiro, depois baixa, grava e aponta o servidor WiFi.
  const saveAndPointWifi = async () => {
    const folder = await resolveServeFolder();
    if (!folder) { onLog('Salvar/apontar cancelado (sem pasta).', 'Save/point canceled (no folder).', 'warn'); return; }
    setHubBusy(true);
    try {
      const s = await ensureStaged(); if (!s) return;
      const fp = await saveBytesToDir(folder, s.name, s.bytes); if (!fp) return;
      if (s.count > 1) {
        setServerMode('container'); setServerPath(fp); setSharedFiles(null); previewServer(fp, 'container'); pushRecent('container', fp);
        onLog(`Servidores: contêiner ${s.name} salvo e apontado no Wi-Fi (modo Container).`,
              `Servers: container ${s.name} saved and pointed on Wi-Fi (Container mode).`, 'success');
      } else {
        previewServer(folder, 'folder');
        onLog(`Servidores: ${s.name} salvo na pasta servida por Wi-Fi — a FujiNet já o enxerga.`,
              `Servers: ${s.name} saved to the Wi-Fi-served folder — the FujiNet now sees it.`, 'success');
      }
      setSaveOpen(false);
    } finally { setHubBusy(false); }
  };

  // extrai uma entrada do zip (no main) e manda abrir
  const openZipEntry = async (zipData: Uint8Array, entryName: string) => {
    onLog(`FujiNet: extraindo ${entryName} do ZIP…`, `FujiNet: extracting ${entryName} from the ZIP…`, 'info');
    const r = await window.cocoApi.zipExtract(zipData, entryName);
    if (!r?.success) { onLog(`FujiNet: falha ao extrair — ${r?.error}`, `FujiNet: extract failed — ${r?.error}`, 'error'); return; }
    onLog(`FujiNet: ${r.name} (${r.bytes} bytes) extraído.`, `FujiNet: ${r.name} (${r.bytes} bytes) extracted.`, 'success');
    await stageThenHub(r.name, new Uint8Array(r.data));
  };

  // Trata um resultado de download/leitura (URL ou TNFS): se for .zip → extrai/seletor; senão abre.
  const processFetched = async (r: any) => {
    if (r.isZip) {
      const openable = (r.entries || []).filter((e: any) => isOpenable(e.name));
      if (openable.length === 0) {
        onLog(`FujiNet: o ZIP não tem imagem reconhecível. Entradas: ${(r.entries || []).map((e: any) => e.name).join(', ') || '(vazio)'}`,
              `FujiNet: the ZIP has no recognizable image. Entries: ${(r.entries || []).map((e: any) => e.name).join(', ') || '(empty)'}`, 'warn');
      } else if (openable.length === 1) {
        await openZipEntry(new Uint8Array(r.data), openable[0].name);
      } else {
        setZipPick({ data: new Uint8Array(r.data), entries: openable });
        onLog(`FujiNet: ZIP com ${openable.length} imagens — escolha qual abrir.`, `FujiNet: ZIP with ${openable.length} images — choose which to open.`, 'info');
      }
    } else {
      await stageThenHub(r.name, new Uint8Array(r.data));
    }
  };

  // --- Abrir por URL (manual) ---
  const [url, setUrl] = useState('');
  const doOpenUrl = async () => {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true); setBusyKind('url');
    onLog(`FujiNet: baixando ${u}…`, `FujiNet: downloading ${u}…`, 'info');
    try {
      const r = await window.cocoApi.netDownloadUrl(u);
      if (!r?.success) { onLog(`FujiNet: falha no download — ${r?.error}`, `FujiNet: download failed — ${r?.error}`, 'error'); return; }
      onLog(`FujiNet: ${r.name} (${r.bytes} bytes) baixado.`, `FujiNet: ${r.name} (${r.bytes} bytes) downloaded.`, 'success');
      await processFetched(r);
    } catch (e: any) { onLog(`FujiNet: erro — ${e?.message}`, `FujiNet: error — ${e?.message}`, 'error'); }
    finally { setBusy(false); setBusyKind(''); }
  };

  // --- Cliente TNFS (navegar hubs FujiNet) ---
  const [host, setHost] = useState('tnfs.fujinet.online');
  const [tnfsPath, setTnfsPath] = useState('/');
  const [tnfsEntries, setTnfsEntries] = useState<null | { name: string; isDir: boolean; size: number }[]>(null);
  const [tnfsSel, setTnfsSel] = useState<string | null>(null); // item selecionado (1 clique seleciona, 2 cliques age)
  useEffect(() => { setTnfsSel(null); }, [tnfsEntries]); // troca de pasta → limpa a seleção
  // Ação do item selecionado (ou de um item específico): pasta → entra; arquivo → abre o HUB "Enviar para…" NA HORA.
  const tnfsActEntry = (e: { name: string; isDir: boolean; size: number }) => { if (e.isDir) tnfsGo(jp(tnfsPath, e.name)); else openHub('send', e); };
  const [bigDl, setBigDl] = useState<null | { name: string; size: number }>(null); // confirmação p/ arquivo grande
  const [dlGot, setDlGot] = useState(0);    // bytes baixados (progresso)
  const [dlTotal, setDlTotal] = useState(0); // tamanho total (do STAT/listagem)
  const [dlName, setDlName] = useState('');  // nome do arquivo em download (status bar visível quando != '')
  // progresso da LISTAGEM (X/N itens). Só aparece se a listagem demorar > ~400 ms (senão pisca à toa).
  const [listProg, setListProg] = useState<{ loaded: number; total: number } | null>(null);
  const [listBarOn, setListBarOn] = useState(false);
  const listTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jp = (d: string, n: string) => (d.endsWith('/') ? d + n : d + '/' + n);
  const parentOf = (p: string) => { const q = p.replace(/\/+$/, ''); const i = q.lastIndexOf('/'); return i <= 0 ? '/' : q.slice(0, i); };

  const tnfsGo = async (path: string, hostOverride?: string) => {
    const h = (hostOverride ?? host).trim(); if (!h || busy) return;
    const myGen = ++connectGen.current;            // marca esta tentativa
    setBusy(true); setBusyKind('connect');
    setListProg(null);
    // só mostra a barra de listagem se passar de ~400 ms (carga rápida não pisca a barra)
    if (listTimer.current) clearTimeout(listTimer.current);
    listTimer.current = setTimeout(() => { if (myGen === connectGen.current) setListBarOn(true); }, 400);
    const finishBar = () => { if (listTimer.current) { clearTimeout(listTimer.current); listTimer.current = null; } setListBarOn(false); setListProg(null); };
    onLog(`FujiNet TNFS: listando ${h}:${path}…`, `FujiNet TNFS: listing ${h}:${path}…`, 'info');
    try {
      const r = await window.cocoApi.tnfsList(h, path);
      if (myGen !== connectGen.current) { finishBar(); return; }     // usuário clicou Desconectar/abandonou: ignora o resultado
      if (!r?.success) { onLog(`FujiNet TNFS: ${r?.error}`, `FujiNet TNFS: ${r?.error}`, 'error'); return; }
      setTnfsPath(path); setTnfsEntries(r.entries || []);
      onLog(`FujiNet TNFS: ${r.entries?.length ?? 0} itens em ${path}.`, `FujiNet TNFS: ${r.entries?.length ?? 0} items in ${path}.`, 'success');
    } catch (e: any) { if (myGen === connectGen.current) onLog(`FujiNet TNFS: erro — ${e?.message}`, `FujiNet TNFS: error — ${e?.message}`, 'error'); }
    finally { if (myGen === connectGen.current) { setBusy(false); setBusyKind(''); finishBar(); } }
  };

  // TNFS é 512 bytes por ida-e-volta → arquivos grandes (ex.: imagem de cartão SDC de 30 MB) demoram DEMAIS.
  // Acima do limite, confirma antes (ver confirmIfLarge); o download tem progresso + cancelar.
  const LARGE_DL = 4 * 1024 * 1024;

  // --- Servidor WiFi (TNFS): serve uma PASTA ou um CONTAINER (discos internos viram .dsk) ---
  const [serverMode, setServerMode] = useState<'folder' | 'container'>('folder');
  const [serverPath, setServerPath] = useState('');
  const [serverWritable, setServerWritable] = useState(false); // gravação (só modo Pasta)
  const [serverRunning, setServerRunning] = useState(false);
  const [serverInfo, setServerInfo] = useState<{ ip: string; port: number; describe: string; ips?: { ip: string; iface: string; isWifi?: boolean; routable?: boolean }[] } | null>(null);
  const [recentServed, setRecentServed] = useState<RecentServed[]>([]); // pastas/containers recentes (combobox)
  // Filtro de arquivos ocultos (não enviados à FujiNet): padrões do usuário + exceções, sobre o hardcoded.
  const [hideExtra, setHideExtra] = useState<string[]>([]);
  const [hideAllow, setHideAllow] = useState<string[]>([]);
  const [hiddenDefaults, setHiddenDefaults] = useState<string[]>([]);
  const [hideModal, setHideModal] = useState(false);
  const [newHide, setNewHide] = useState('');   // novo padrão "também ocultar"
  const [newAllow, setNewAllow] = useState(''); // nova exceção "nunca ocultar"
  const [recentOpen, setRecentOpen] = useState(false); // dropdown próprio de pastas recentes
  const [sharedFiles, setSharedFiles] = useState<null | { name: string; isDir: boolean; size: number }[]>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const [copiedIp, setCopiedIp] = useState(false);
  const copyIp = (ip: string) => { try { navigator.clipboard?.writeText(ip); setCopiedIp(true); setTimeout(() => setCopiedIp(false), 1500); } catch { /* */ } };

  // lista o que SERÁ servido (sem iniciar) — alimenta o painel "Arquivos compartilhados" (item 3)
  const previewServer = async (p: string, mode: 'folder' | 'container') => {
    if (!p) { setSharedFiles(null); return; }
    try {
      const r = await window.cocoApi.tnfsServerPreview({ mode, path: p, hideExtra, hideAllow });
      if (r?.success) setSharedFiles(r.entries || []);
      else { setSharedFiles([]); onLog(`Servidor: ${r?.error}`, `Server: ${r?.error}`, 'warn'); }
    } catch { setSharedFiles([]); }
  };
  // Registra uma pasta/container no histórico de "servidos recentemente" (mais recente primeiro, sem
  // duplicatas por mode+path, teto RECENT_MAX). Persistido em cfg.fujinet.recentServed.
  const pushRecent = (mode: 'folder' | 'container', path: string) => {
    if (!path) return;
    setRecentServed(list => [{ mode, path }, ...list.filter(r => !(r.mode === mode && r.path === path))].slice(0, RECENT_MAX));
  };
  // Filtro de ocultos: adiciona/remove padrões (case-insensitive, sem duplicar). Reaplica a prévia.
  const addHide = (term: string) => { const v = term.trim().toLowerCase(); if (!v) return; setHideExtra(l => l.some(x => x.toLowerCase() === v) ? l : [...l, v]); setNewHide(''); };
  const addAllow = (term: string) => { const v = term.trim().toLowerCase(); if (!v) return; setHideAllow(l => l.some(x => x.toLowerCase() === v) ? l : [...l, v]); setNewAllow(''); };
  const removeHide = (term: string) => setHideExtra(l => l.filter(x => x !== term));
  const removeAllow = (term: string) => setHideAllow(l => l.filter(x => x !== term));
  // Ao mudar as regras, reaplica a prévia da pasta atual (se houver e o servidor estiver desligado).
  useEffect(() => { if (loaded.current && !serverRunning && serverMode === 'folder' && serverPath) previewServer(serverPath, 'folder'); }, [hideExtra, hideAllow]);

  const pickServerPath = async () => {
    const r = serverMode === 'container' ? await window.cocoApi.pickFile?.() : await window.cocoApi.pickDirectory?.();
    if (r?.path) { setServerPath(r.path); previewServer(r.path, serverMode); pushRecent(serverMode, r.path); }
  };
  const startServer = async () => {           // item 1
    if (!serverPath || serverBusy) return;
    setServerBusy(true);
    try {
      const writable = serverMode === 'folder' && serverWritable;
      const r = await window.cocoApi.tnfsServerStart({ mode: serverMode, path: serverPath, writable, hideExtra, hideAllow });
      if (!r?.success) { onLog(`Servidor TNFS: ${r?.error}`, `TNFS server: ${r?.error}`, 'error'); return; }
      setServerRunning(true); setServerInfo({ ip: r.ip, port: r.port, describe: r.describe, ips: r.ips });
      pushRecent(serverMode, serverPath);
      const rw = r.writable ? (pt ? 'LEITURA-ESCRITA' : 'READ-WRITE') : (pt ? 'somente leitura' : 'read-only');
      onLog(`Servidor TNFS LIGADO em ${r.ip}:${r.port} (${r.describe}) — ${rw}. Na FujiNet, ponha "${r.ip}" num host slot.`,
            `TNFS server STARTED at ${r.ip}:${r.port} (${r.describe}) — ${rw}. On the FujiNet, put "${r.ip}" in a host slot.`, 'success');
    } catch (e: any) { onLog(`Servidor TNFS: erro — ${e?.message}`, `TNFS server: error — ${e?.message}`, 'error'); }
    finally { setServerBusy(false); }
  };
  const stopServer = async () => {             // item 1
    setServerBusy(true);
    try { await window.cocoApi.tnfsServerStop?.(); setServerRunning(false); setServerInfo(null); onLog('Servidor TNFS desligado.', 'TNFS server stopped.', 'info'); }
    finally { setServerBusy(false); }
  };

  // --- Gestão de servidores: favoritos (persistidos) + comunidade (ao vivo) ---
  const [servers, setServers] = useState<FavServer[]>([]);
  const [community, setCommunity] = useState<CommunityServer[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [nf, setNf] = useState({ host: '', label: '', path: '' }); // novo favorito (modal)
  const loaded = useRef(false);

  const fetchCommunity = async () => {
    try { const r = await window.cocoApi.tnfsCommunity(); if (r?.success && Array.isArray(r.servers)) setCommunity(r.servers); } catch { /* ignore */ }
  };

  // Carrega config + comunidade + status do servidor ao montar; escuta os logs de conexão do servidor.
  useEffect(() => {
    (async () => {
      try {
        const cfg = await window.cocoApi.loadConfig();
        const fn = cfg?.fujinet || {};
        if (Array.isArray(fn.servers)) setServers(fn.servers);
        if (fn.lastHost) setHost(fn.lastHost);
        if (fn.serverMode === 'container' || fn.serverMode === 'folder') setServerMode(fn.serverMode);
        if (typeof fn.serverWritable === 'boolean') setServerWritable(fn.serverWritable);
        if (Array.isArray(fn.recentServed)) setRecentServed(fn.recentServed.filter((r: any) => r && (r.mode === 'folder' || r.mode === 'container') && typeof r.path === 'string').slice(0, RECENT_MAX));
        if (Array.isArray(fn.hideExtra)) setHideExtra(fn.hideExtra.filter((s: any) => typeof s === 'string'));
        if (Array.isArray(fn.hideAllow)) setHideAllow(fn.hideAllow.filter((s: any) => typeof s === 'string'));
        const sp = typeof fn.serverPath === 'string' ? fn.serverPath : (typeof fn.shareFolder === 'string' ? fn.shareFolder : '');
        if (sp) { setServerPath(sp); previewServer(sp, fn.serverMode === 'container' ? 'container' : 'folder'); }
      } catch { /* ignore */ }
      loaded.current = true;
      fetchCommunity();
      try { const hd = await window.cocoApi.tnfsHiddenDefaults?.(); if (hd?.names) setHiddenDefaults(hd.names); } catch { /* */ }
      try { const st = await window.cocoApi.tnfsServerStatus?.(); if (st?.running) { setServerRunning(true); setServerInfo({ ip: st.ip, port: st.port, describe: st.describe, ips: st.ips }); } } catch { /* */ }
    })();
    // log de conexões do servidor → console (item 5) + progresso de download TNFS
    const off = window.cocoApi.onNetLog?.((m: any) => onLog(m?.pt || '', m?.en || m?.pt || '', m?.type || 'info'));
    const offP = window.cocoApi.onTnfsProgress?.((m: any) => setDlGot(m?.got || 0));
    const offLP = window.cocoApi.onTnfsListProgress?.((m: any) => setListProg({ loaded: m?.loaded || 0, total: m?.total || 0 }));
    return () => { try { off?.(); } catch { /* */ } try { offP?.(); } catch { /* */ } try { offLP?.(); } catch { /* */ } };
  }, []);

  // Persiste no config (debounce) quando favoritos/host/servidor mudam.
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(() => { window.cocoApi.saveConfig({ fujinet: { servers, lastHost: host, serverMode, serverPath, serverWritable, recentServed, hideExtra, hideAllow } }); }, 400);
    return () => clearTimeout(id);
  }, [servers, host, serverMode, serverPath, serverWritable, recentServed, hideExtra, hideAllow]);

  const addFavorite = (fav: FavServer) => {
    const h = fav.host.trim(); if (!h) return;
    setServers(s => s.some(x => x.host === h) ? s : [...s, { host: h, label: fav.label?.trim() || undefined, path: fav.path?.trim() || undefined }]);
  };
  const removeFavorite = (h: string) => setServers(s => s.filter(x => x.host !== h));
  const isFavorite = (h: string) => servers.some(x => x.host === h);
  const connectTo = (h: string, path = '/') => { setHost(h); tnfsGo(path, h); };
  // "Desconectar": o TNFS é por-operação (mount/umount). Aqui (a) ABANDONA um connect em curso
  // — incrementar a geração faz o tnfsGo pendente ignorar o resultado e liberar o busy — e (b) limpa a tela.
  const tnfsDisconnect = () => {
    const wasConnecting = busyKind === 'connect';
    connectGen.current++;                    // invalida qualquer tnfsGo em voo (UI)
    if (wasConnecting) window.cocoApi.tnfsListCancel?.(); // cancelamento REAL no main (fecha socket, larga retransmissões)
    setBusy(false); setBusyKind('');
    setTnfsEntries(null); setTnfsPath('/');
    onLog(wasConnecting ? 'FujiNet TNFS: conexão interrompida.' : 'FujiNet TNFS: desconectado.',
          wasConnecting ? 'FujiNet TNFS: connection aborted.' : 'FujiNet TNFS: disconnected.', 'info');
  };

  const sectionTitle = 'text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5';
  const soon = (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: '#fbbf24', border: '1px solid #fbbf2455' }}>
      {t('em breve', 'soon')}
    </span>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-3" style={{ minHeight: 0 }}>
      {/* HUBs (Enviar para… / Salvar arquivo…) à esquerda + Ajuda à direita — agem no arquivo SELECIONADO no cliente */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        {(() => {
          const selFile = (tnfsEntries || []).find(e => e.name === tnfsSel && !e.isDir) || null;
          const hubReady = !!selFile || !!staged;
          const tip = selFile ? selFile.name : (staged ? staged.name : '');
          return (
            <>
              <button onClick={() => actSelected('send')} disabled={busy || !hubReady} className="dsk-tool flex items-center gap-1.5" style={{ color: hubReady ? 'var(--primary)' : undefined }}
                title={hubReady ? t(`Baixar ${tip} e escolher destino (painel DSK / aba OS-9 / drive DriveWire)`, `Download ${tip} and choose a destination (DSK pane / OS-9 tab / DriveWire drive)`)
                                : t('Selecione um arquivo na listagem do cliente (1 clique)', 'Select a file in the client listing (single click)')}>
                <Send size={14} /> {t('Enviar para…', 'Send to…')}
              </button>
              <button onClick={() => actSelected('save')} disabled={busy || !hubReady} className="dsk-tool flex items-center gap-1.5"
                title={hubReady ? t(`Baixar ${tip} e salvar (no PC ou na pasta servida por Wi-Fi)`, `Download ${tip} and save it (to the PC or the Wi-Fi-served folder)`)
                                : t('Selecione um arquivo na listagem do cliente (1 clique)', 'Select a file in the client listing (single click)')}>
                <SaveAll size={14} /> {t('Salvar arquivo…', 'Save file…')}
              </button>
            </>
          );
        })()}
        <span className="ml-auto"><HelpButton onClick={() => setShowHelp(true)} lang={lang} /></span>
      </div>

      {/* Divisão VERTICAL: esquerda cliente · direita servidor */}
      <div className="flex-1 flex gap-3 overflow-hidden" style={{ minHeight: 0 }}>

        {/* ESQUERDA — CLIENTE */}
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto" style={{ minWidth: 0 }}>
          {/* PRIMÁRIO — Cliente TNFS (hubs FujiNet): navegar e baixar */}
          <div className="glass-panel p-3 flex flex-col gap-2 flex-1" style={{ minHeight: 160 }}>
            <div className="flex items-center justify-between">
              <span className={sectionTitle + ' flex items-center gap-1.5'} style={{ margin: 0, color: 'hsl(120, 35%, 72%)' }}>
                <Download size={12} className="text-[var(--primary)] flex-shrink-0" /> {t('FujiNet — Acessar Servidores TNFS (hubs FujiNet)', 'FujiNet — Access TNFS Servers (FujiNet hubs)')}
              </span>
              <button onClick={() => setManageOpen(true)} className="dsk-tool" style={{ padding: '2px 6px' }} title={t('Gerenciar servidores favoritos', 'Manage favorite servers')}><Star size={12} /> {t('Gerenciar', 'Manage')}</button>
            </div>
            {/* dropdown: favoritos do usuário + comunidade (status UDP). value = host. */}
            <select value="" onChange={e => { const v = e.target.value; if (!v) return; const f = servers.find(s => s.host === v); connectTo(v, f?.path || '/'); e.currentTarget.selectedIndex = 0; }}
              className="input-select text-xs" style={{ padding: '5px 8px' }} title={t('Escolher um servidor (favoritos + comunidade ao vivo)', 'Choose a server (favorites + live community)')}>
              <option value="">{t('— escolher servidor —', '— choose server —')}</option>
              {servers.length > 0 && (
                <optgroup label={t('Meus servidores', 'My servers')}>
                  {servers.map(s => <option key={'f' + s.host} value={s.host}>{(s.label ? `${s.label} (${s.host})` : s.host) + (s.path && s.path !== '/' ? ` [${s.path}]` : '')}</option>)}
                </optgroup>
              )}
              <optgroup label={t('Comunidade (ao vivo)', 'Community (live)')}>
                {community.map(c => <option key={'c' + c.host} value={c.host} disabled={!c.udpUp}>{c.host + (c.udpUp ? '' : t('  (UDP fora)', '  (UDP down)'))}</option>)}
              </optgroup>
            </select>
            <div className="flex gap-2">
              <input value={host} onChange={e => setHost(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tnfsGo('/'); }}
                placeholder="tnfs.fujinet.online" className="input-text text-xs flex-1" style={{ padding: '6px 10px', minWidth: 0 }} />
              <button onClick={() => addFavorite({ host, path: tnfsPath })} disabled={!host.trim() || isFavorite(host.trim())} className="dsk-tool" style={{ padding: '6px 8px' }}
                title={isFavorite(host.trim()) ? t('Já está nos favoritos', 'Already a favorite') : t('Salvar host atual nos favoritos', 'Save current host to favorites')}>
                <Star size={13} style={{ color: isFavorite(host.trim()) ? '#fbbf24' : undefined }} />
              </button>
              <button onClick={() => tnfsGo('/')} disabled={busy || !host.trim()} className="dsk-tool flex items-center gap-1.5"
                style={{ color: busyKind === 'connect' ? '#fbbf24' : (tnfsEntries !== null ? '#34d399' : undefined), opacity: busyKind === 'connect' ? 1 : undefined }}>
                {busyKind === 'connect' ? <Loader size={13} className="spin" /> : <Wifi size={13} />} {t('Conectar', 'Connect')}
              </button>
              <button onClick={tnfsDisconnect} disabled={busyKind === 'connect' ? false : (busy || tnfsEntries === null)} className="dsk-tool flex items-center gap-1.5"
                style={{ color: busyKind === 'connect' ? '#fbbf24' : undefined }}
                title={busyKind === 'connect' ? t('Interromper a conexão', 'Abort the connection') : t('Limpar a sessão/listagem TNFS', 'Clear the TNFS session/listing')}>
                <WifiOff size={13} /> {busyKind === 'connect' ? t('Interromper', 'Abort') : t('Desconectar', 'Disconnect')}
              </button>
            </div>
            {/* Barra de progresso da LISTAGEM — só quando a carga passa de ~400 ms (servidor lento/pasta grande) */}
            {listBarOn && busyKind === 'connect' && (() => {
              const total = listProg?.total || 0; const loaded = listProg?.loaded || 0;
              const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
              const CELLS = 40; const filled = total > 0 ? Math.round((pct / 100) * CELLS) : 0;
              return (
                <div className="flex flex-col gap-1 rounded p-2" style={{ background: '#fbbf2410', border: '1px solid #fbbf2433' }}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[var(--text-secondary)] flex items-center gap-1.5"><Loader size={11} className="spin" style={{ color: '#fbbf24' }} /> {t('Carregando lista…', 'Loading list…')}</span>
                    <span className="font-mono flex-shrink-0" style={{ color: '#fbbf24' }}>{total > 0 ? `${loaded}/${total} (${pct}%)` : t('conectando…', 'connecting…')}</span>
                  </div>
                  {total > 0 && (
                    <div className="flex" style={{ gap: 2 }}>
                      {Array.from({ length: CELLS }).map((_, i) => (
                        <div key={i} style={{ flex: 1, minWidth: 2, height: 8, background: i < filled ? '#fbbf24' : 'var(--bg-elevated)' }} className="rounded-[2px]" />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            {tnfsEntries !== null && (
              <>
                <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                  <button onClick={() => tnfsGo(parentOf(tnfsPath))} disabled={busy || tnfsPath === '/'} className="dsk-tool" style={{ padding: '2px 6px' }} title={t('Subir', 'Up')}><ArrowUp size={12} /></button>
                  <span className="font-mono truncate flex-1" title={tnfsPath}>{tnfsPath}</span>
                  {(() => { const sel = tnfsEntries.find(e => e.name === tnfsSel); return (
                    <button onClick={() => sel && tnfsActEntry(sel)} disabled={busy || !sel} className="dsk-tool flex items-center gap-1" style={{ padding: '2px 8px', color: sel ? 'var(--primary)' : undefined }}
                      title={t('Abre o item selecionado (ou dê DUPLO-CLIQUE nele)', 'Open the selected item (or DOUBLE-CLICK it)')}>
                      {sel?.isDir ? <Folder size={12} /> : <Download size={12} />}{sel?.isDir ? t('Entrar', 'Enter') : t('Abrir', 'Open')}
                    </button>
                  ); })()}
                </div>
                <div className="flex-1 flex flex-col gap-0.5 overflow-y-auto" style={{ minHeight: 0 }}>
                  {tnfsEntries.length === 0 && <div className="text-[10px] text-[var(--text-muted)] px-1 py-2">{t('(pasta vazia)', '(empty folder)')}</div>}
                  {tnfsEntries.map(e => (
                    <button key={e.name} disabled={busy}
                      onClick={() => setTnfsSel(e.name)} onDoubleClick={() => tnfsActEntry(e)}
                      className="dsk-tool flex items-center gap-2 justify-start text-left" style={{ padding: '4px 8px', background: tnfsSel === e.name ? 'var(--primary-glow)' : undefined, borderColor: tnfsSel === e.name ? 'var(--primary)' : undefined }} title={t(`${e.name} — 1 clique seleciona, duplo-clique abre`, `${e.name} — single click selects, double-click opens`)}>
                      {e.isDir ? <Folder size={13} className="flex-shrink-0" style={{ color: '#c4b5fd' }} /> : <Download size={13} className="flex-shrink-0" />}
                      <span className="truncate flex-1 text-left normal-case">{e.name}</span>
                      {!e.isDir && <span className="text-[9px] text-[var(--text-muted)] flex-shrink-0">{Math.max(1, Math.round(e.size / 1024))} KB</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
            {tnfsEntries === null && (
              <div className="text-[9px] text-[var(--text-muted)] leading-tight">
                {t('Conecte a um hub TNFS (UDP 16384). 1 clique SELECIONA um item; DUPLO-CLIQUE (ou "Abrir/Entrar") age: pasta → entra; imagem → baixa e abre. Ex.: tnfs.fujinet.online → pasta COCO.',
                   'Connect to a TNFS hub (UDP 16384). 1 click SELECTS an item; DOUBLE-CLICK (or "Open/Enter") acts: folder → enter; image → download and open. E.g.: tnfs.fujinet.online → COCO folder.')}
              </div>
            )}
          </div>

          {/* STATUS BAR — barra de progresso de download (estilo da aba GW), entre o hub TNFS e o "Abrir por URL" */}
          {dlName && (() => {
            const pctv = dlTotal > 0 ? Math.min(100, Math.round((dlGot / dlTotal) * 100)) : 0;
            const CELLS = 44; const filled = dlTotal > 0 ? Math.round((pctv / 100) * CELLS) : 0;
            return (
              <div className="glass-panel px-3 py-2 flex flex-col gap-1.5 flex-shrink-0">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[var(--text-secondary)] truncate flex items-center gap-1.5"><Download size={12} className="text-[var(--primary)] flex-shrink-0" /> {t('Baixando', 'Downloading')} <span className="truncate normal-case">{dlName}</span></span>
                  <span className="font-mono text-[var(--primary)] flex-shrink-0 ml-2">{Math.round(dlGot / 1024)}{dlTotal > 0 ? ` / ${Math.round(dlTotal / 1024)}` : ''} KB{dlTotal > 0 ? ` (${pctv}%)` : ''}</span>
                </div>
                <div className="flex" style={{ gap: 2 }}>
                  {Array.from({ length: CELLS }).map((_, i) => (
                    <div key={i} style={{ flex: 1, minWidth: 2, height: 10 }} className={`rounded-[2px] ${i < filled ? 'bg-[var(--primary)]' : 'bg-slate-800'}`} />
                  ))}
                </div>
                <button onClick={() => window.cocoApi.tnfsReadCancel?.()} className="dsk-tool dsk-tool-danger self-end" style={{ padding: '2px 8px' }}>{t('Cancelar', 'Cancel')}</button>
              </div>
            );
          })()}

          {/* SECUNDÁRIO — Abrir por URL (manual) */}
          <div className="glass-panel p-3 flex flex-col gap-2">
            <div className={sectionTitle} style={{ color: 'hsl(120, 35%, 72%)' }}>{t('Acesso Direto — Abrir Imagem por URL (HTTP/HTTPS)', 'Direct Access — Open Image by URL (HTTP/HTTPS)')}</div>
            <div className="flex gap-2">
              <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doOpenUrl(); }}
                placeholder="https://…/jogo.dsk (.zip ok)" className="input-text text-xs flex-1" style={{ padding: '6px 10px', minWidth: 0 }} />
              <button onClick={doOpenUrl} disabled={busy || !url.trim()} className="dsk-tool flex items-center gap-1.5">
                {busyKind === 'url' ? <Loader size={13} className="spin" /> : <Link2 size={13} />} {t('Abrir', 'Open')}
              </button>
            </div>
            <div className="text-[9px] text-[var(--text-muted)] leading-tight">
              {t('Baixa (e descompacta .zip) um .dsk/.vdk/.sdf/.os9/.img/.ccc/.cas de um link e abre no painel (OS-9 vai p/ a aba OS-9).',
                 'Downloads (and unzips .zip) a .dsk/.vdk/.sdf/.os9/.img/.ccc/.cas from a link and opens it in a pane (OS-9 goes to the OS-9 tab).')}
            </div>
          </div>
        </div>

        {/* Splitter: cliente ↔ servidor WiFi */}
        <VSplitter onDelta={(dx) => setWifiWidth(w => Math.max(260, Math.min(460, w - dx)))} />

        {/* MEIO — SERVIDOR WiFi */}
        <div className="flex flex-col gap-3 overflow-y-auto" style={{ width: wifiWidth, flexShrink: 0 }}>
          <div className="flex items-center gap-2">
            <Server size={14} className="text-[var(--primary)]" />
            <span className="text-xs font-bold text-white uppercase tracking-wide">{t('Servidor WiFi (FujiNet)', 'WiFi server (FujiNet)')}</span>
            {serverRunning && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: '#34d399', border: '1px solid #34d39955' }}>{t('no ar', 'live')}</span>}
          </div>

          <div className="glass-panel p-3 flex flex-col gap-2">
            <div className={sectionTitle}>{t('Configurações', 'Settings')}</div>
            {/* origem: pasta ou container */}
            <div className="flex gap-1.5">
              <button onClick={() => { if (!serverRunning) { setServerMode('folder'); setServerPath(''); setSharedFiles(null); } }} disabled={serverRunning}
                className="dsk-tool flex-1 justify-center" style={{ color: serverMode === 'folder' ? 'var(--primary)' : undefined }}><FolderOpen size={13} /> {t('Pasta', 'Folder')}</button>
              <button onClick={() => { if (!serverRunning) { setServerMode('container'); setServerPath(''); setSharedFiles(null); } }} disabled={serverRunning}
                className="dsk-tool flex-1 justify-center" style={{ color: serverMode === 'container' ? 'var(--primary)' : undefined }}><Server size={13} /> {t('Container', 'Container')}</button>
            </div>
            {/* Campo ÚNICO de caminho = campo digitável + dropdown PRÓPRIO de recentes (a setinha ▾). Digitar
                livre faz a prévia no blur/Enter; o botão de pasta abre o seletor do sistema. (Desabilita com o
                servidor ligado.) Dropdown próprio (não <datalist>, que filtra pelo texto já digitado e some.) */}
            <div className="flex gap-2" style={{ position: 'relative' }}>
              <input value={serverPath} disabled={serverRunning}
                onChange={e => { setServerPath(e.target.value); setSharedFiles(null); }}
                onBlur={() => { if (serverPath) previewServer(serverPath, serverMode); }}
                onKeyDown={e => { if (e.key === 'Enter' && serverPath) { e.currentTarget.blur(); previewServer(serverPath, serverMode); } }}
                placeholder={serverMode === 'container' ? t('escolha ou cole um .img/.vhd/.dsk', 'pick or paste a .img/.vhd/.dsk') : t('escolha ou cole uma pasta', 'pick or paste a folder')}
                className="input-text text-xs flex-1" style={{ padding: '6px 10px', minWidth: 0 }} title={serverPath} />
              {recentServed.length > 0 && (
                <button onClick={() => setRecentOpen(o => !o)} disabled={serverRunning} className="dsk-tool flex items-center" style={{ padding: '6px 6px' }}
                  title={t('Pastas/containers recentes', 'Recent folders/containers')}><ChevronDown size={13} /></button>
              )}
              <button onClick={pickServerPath} disabled={serverRunning} className="dsk-tool flex items-center gap-1" title={t('Procurar no sistema', 'Browse the system')}><FolderOpen size={13} /></button>
              {recentOpen && recentServed.length > 0 && (
                <>
                  {/* backdrop p/ fechar ao clicar fora */}
                  <div onClick={() => setRecentOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div className="glass-panel" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50, maxHeight: 220, overflowY: 'auto', padding: 4 }}>
                    <div className="text-[9px] uppercase tracking-wider px-2 py-1" style={{ color: 'var(--text-muted)' }}>{t('Recentes', 'Recent')}</div>
                    {recentServed.map(r => (
                      <button key={r.mode + r.path}
                        onClick={() => { if (r.mode !== serverMode) setServerMode(r.mode); setServerPath(r.path); setSharedFiles(null); previewServer(r.path, r.mode); pushRecent(r.mode, r.path); setRecentOpen(false); }}
                        className="dsk-tool flex items-center gap-2 justify-start text-left" style={{ padding: '5px 8px', width: '100%' }} title={r.path}>
                        {r.mode === 'folder' ? <FolderOpen size={12} className="flex-shrink-0" style={{ color: 'var(--primary)' }} /> : <Server size={12} className="flex-shrink-0" style={{ color: '#c4b5fd' }} />}
                        <span className="truncate flex-1 normal-case">{r.path}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* acesso: somente-leitura ou leitura-escrita — gravação SÓ no modo Pasta (container é sempre RO) */}
            <div className="flex gap-1.5">
              <button onClick={() => { if (!serverRunning) setServerWritable(false); }} disabled={serverRunning}
                className="dsk-tool flex-1 justify-center" style={{ color: !(serverMode === 'folder' && serverWritable) ? 'var(--primary)' : undefined }}>
                <Lock size={12} /> {t('Só leitura', 'Read-only')}
              </button>
              <button onClick={() => { if (!serverRunning && serverMode === 'folder') setServerWritable(true); }} disabled={serverRunning || serverMode === 'container'}
                className="dsk-tool flex-1 justify-center" style={{ color: (serverMode === 'folder' && serverWritable) ? '#34d399' : undefined }}
                title={serverMode === 'container' ? t('Gravação disponível só no modo Pasta', 'Writing available only in Folder mode') : t('CoCo pode gravar/criar arquivos na pasta', 'CoCo can write/create files in the folder')}>
                <Pencil size={12} /> {t('Ler-escrever', 'Read-write')}
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
              <span>{t('Porta', 'Port')}</span><span className="font-mono">16384 (UDP) · {(serverMode === 'folder' && serverWritable) ? t('leitura-escrita', 'read-write') : t('somente leitura', 'read-only')}</span>
            </div>
            {/* gerenciar arquivos ocultos (só faz sentido no modo Pasta; container já filtra por extensão) */}
            {serverMode === 'folder' && (
              <button onClick={() => setHideModal(true)} className="dsk-tool flex items-center gap-1.5 justify-start" style={{ padding: '3px 7px' }}
                title={t('Quais arquivos NÃO são enviados à FujiNet (desktop.ini, Thumbs.db…) — adicionar/excluir', 'Which files are NOT sent to the FujiNet (desktop.ini, Thumbs.db…) — add/remove')}>
                <EyeOff size={12} /> <span className="text-[10px]">{t('Ocultar arquivos da FujiNet', 'Hide files from FujiNet')}</span>
                {(hideExtra.length + hideAllow.length) > 0 && <span className="text-[9px] text-[var(--text-muted)]">(+{hideExtra.length}/−{hideAllow.length})</span>}
              </button>
            )}
            {serverRunning && serverInfo && (() => {
              const ips = (serverInfo.ips && serverInfo.ips.length > 0) ? serverInfo.ips : [{ ip: serverInfo.ip, iface: '', isWifi: false, routable: true }];
              const multi = ips.length > 1;
              const hasRoutable = ips.some(x => x.routable);
              // O IP RECOMENDADO é o ROTEÁVEL (interface com rota default = a única que a FujiNet alcança).
              // Se o main não marcou nenhum (versão antiga), cai p/ o 1º. Os demais ficam esmaecidos.
              const recIp = ips.find(x => x.routable)?.ip || ips[0]?.ip;
              return (
                <div className="flex flex-col gap-1.5 rounded p-2" style={{ background: '#34d39915', border: '1px solid #34d39940' }}>
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: '#34d399' }}>
                    {multi ? t('Na FujiNet, use o IP destacado abaixo:', 'On the FujiNet, use the highlighted IP below:') : t('Na FujiNet, use este host:', 'On the FujiNet, use this host:')}
                  </span>
                  {ips.map((x, i) => {
                    const rec = x.ip === recIp;                       // este é o recomendado?
                    const tag = x.routable ? t('rede ✓', 'network ✓') : x.isWifi ? 'WiFi' : t('cabo', 'wired');
                    return (
                      <div key={x.ip + i} className="flex items-center gap-2" style={{ opacity: (multi && hasRoutable && !rec) ? 0.5 : 1 }}>
                        <span className="font-mono font-bold text-sm" style={{ color: rec ? '#34d399' : 'var(--text-secondary)' }}>{x.ip}</span>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">:{serverInfo.port}</span>
                        <span className="text-[8px] font-bold uppercase px-1 rounded flex-shrink-0" style={{ color: rec ? '#34d399' : (x.isWifi ? '#60a5fa' : 'var(--text-muted)'), border: `1px solid ${rec ? '#34d39955' : 'var(--border)'}` }}>
                          {tag}
                        </span>
                        {x.iface && <span className="text-[9px] text-[var(--text-muted)] truncate flex-1" title={x.iface}>{x.iface}</span>}
                        <button onClick={() => copyIp(x.ip)} className="dsk-tool" style={{ padding: '3px 7px', marginLeft: x.iface ? 0 : 'auto' }} title={t('Copiar IP', 'Copy IP')}>
                          {copiedIp ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
                        </button>
                      </div>
                    );
                  })}
                  {multi && (
                    <span className="text-[9px] leading-tight" style={{ color: '#fbbf24' }}>
                      {t('⚠ Várias redes ativas. Use o IP marcado "rede ✓" (a interface com saída p/ a rede — a que a FujiNet alcança). Garanta que a placa está na MESMA rede do PC e libere a UDP 16384 no firewall (perfil Pública e Privada).',
                         '⚠ Multiple networks active. Use the IP marked "network ✓" (the interface with a default route — the one the FujiNet can reach). Make sure the board is on the SAME network as the PC and allow UDP 16384 through the firewall (both Public and Private profiles).')}
                    </span>
                  )}
                </div>
              );
            })()}
            {serverRunning
              ? <button onClick={stopServer} disabled={serverBusy} className="dsk-tool flex items-center justify-center gap-1.5" style={{ color: '#f87171' }}>{serverBusy ? <Loader size={13} className="spin" /> : <Power size={13} />} {t('Desligar servidor', 'Stop server')}</button>
              : <button onClick={startServer} disabled={serverBusy || !serverPath} className="dsk-tool flex items-center justify-center gap-1.5" style={{ color: serverPath ? '#34d399' : undefined }}>{serverBusy ? <Loader size={13} className="spin" /> : <Power size={13} />} {t('Ligar servidor', 'Start server')}</button>}
            <div className="text-[9px] text-[var(--text-muted)] leading-tight">
              {t('Serve via TNFS (UDP 16384). Na FujiNet, ponha o IP do PC acima num host slot. Container = cada disco interno vira um .dsk.',
                 'Serves via TNFS (UDP 16384). On the FujiNet, put the PC IP above in a host slot. Container = each inner disk becomes a .dsk.')}
            </div>
            {serverMode === 'folder' && serverWritable && (
              <div className="text-[9px] leading-tight" style={{ color: '#fbbf24' }}>
                {t('⚠ Leitura-escrita: o CoCo pode CRIAR e SOBRESCREVER arquivos reais nesta pasta. Um cliente por vez. Gravação é lenta (512 B por bloco).',
                   '⚠ Read-write: the CoCo can CREATE and OVERWRITE real files in this folder. One client at a time. Writing is slow (512 B per block).')}
              </div>
            )}
          </div>

          {/* item 3: lista do que será/está sendo servido */}
          <div className="glass-panel p-3 flex-1 flex flex-col gap-1.5" style={{ minHeight: 120 }}>
            <div className={sectionTitle}>{t('Arquivos compartilhados', 'Shared files')}{sharedFiles ? ` (${sharedFiles.length})` : ''}</div>
            {sharedFiles === null && <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--text-muted)] text-center px-2">{t('Escolha uma pasta ou container acima.', 'Choose a folder or container above.')}</div>}
            {sharedFiles && sharedFiles.length === 0 && <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--text-muted)] text-center px-2">{t('(nada para servir)', '(nothing to serve)')}</div>}
            {sharedFiles && sharedFiles.length > 0 && (
              <div className="flex-1 flex flex-col gap-0.5 overflow-y-auto" style={{ minHeight: 0 }}>
                {sharedFiles.map(f => (
                  <div key={f.name} className="flex items-center gap-2 text-[11px]" style={{ padding: '2px 4px' }} title={f.name}>
                    {f.isDir ? <Folder size={12} className="flex-shrink-0" style={{ color: '#c4b5fd' }} /> : <FileArchive size={12} className="flex-shrink-0 text-[var(--text-muted)]" />}
                    <span className="truncate flex-1 normal-case">{f.name}</span>
                    {!f.isDir && <span className="text-[9px] text-[var(--text-muted)] flex-shrink-0">{Math.max(1, Math.round(f.size / 1024))} KB</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Splitter: servidor WiFi ↔ DriveWire + COLUNA 3 (servidor DriveWire serial) */}
        <VSplitter onDelta={(dx) => setDwWidth(w => Math.max(300, Math.min(520, w - dx)))} />
        <DriveWirePanel lang={lang} onLog={onLog} width={dwWidth} pendingDisk={localPendingDw || pendingDw}
          onConsumed={() => { if (localPendingDw) setLocalPendingDw(null); else onPendingDwConsumed?.(); }} />
      </div>

      {/* HUB "Enviar para…" — destino do arquivo: painel DSK (RS-DOS), aba OS-9 ou um drive DriveWire.
          Abre NA HORA; o tipo só é detectado ao baixar (na 1ª ação) → antes disso todas as opções ficam ativas. */}
      {sendOpen && hubSource && (() => {
        const known = !!staged && staged.name === hubSource.name; // já baixado/analisado?
        const dskOk = !known || !!staged?.isRsDos;
        const os9Ok = !known || !!staged?.isOs9;
        return (
        <div className="glass-modal-overlay flex items-center justify-center p-8" onClick={() => !hubBusy && setSendOpen(false)}>
          <div className="glass-panel p-5 flex flex-col gap-4" style={{ width: 580, maxWidth: '94%' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Send size={18} className="text-[var(--primary)]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{t('Enviar para…', 'Send to…')}</h3>
              <span className="text-[10px] text-[var(--text-muted)] normal-case truncate flex-1" title={hubSource.name}>
                {hubSource.name} · {known ? (staged!.isOs9 ? 'OS-9' : staged!.count > 1 ? t(`contêiner (${staged!.count} discos)`, `container (${staged!.count} disks)`) : 'RS-DOS')
                                          : `${Math.max(1, Math.round(hubSource.size / 1024))} KB · ${t('tipo ao baixar', 'type on download')}`}
              </span>
              <button onClick={() => !hubBusy && setSendOpen(false)} className="dsk-tool" style={{ padding: '3px 6px' }}><X size={14} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              {/* → Painel DSK (só RS-DOS quando o tipo já é conhecido) */}
              <button disabled={!dskOk || hubBusy} onClick={sendToApp}
                className="glass-panel p-3 flex flex-col items-center gap-2 text-center" style={{ opacity: dskOk ? 1 : 0.4, cursor: dskOk && !hubBusy ? 'pointer' : 'not-allowed' }}
                title={dskOk ? t('Baixar e abrir no painel DSK (RS-DOS)', 'Download and open in the DSK pane (RS-DOS)') : t('Disponível só para disco RS-DOS', 'Available only for an RS-DOS disk')}>
                <HardDrive size={22} className="text-[var(--primary)]" />
                <span className="text-[11px] font-bold uppercase">{t('Painel DSK', 'DSK pane')}</span>
                <span className="text-[9px] text-[var(--text-muted)]">{known ? (staged!.isRsDos ? 'RS-DOS' : '🔒') : 'RS-DOS'}</span>
              </button>
              {/* → Aba OS-9 (só OS-9 quando o tipo já é conhecido) */}
              <button disabled={!os9Ok || hubBusy} onClick={sendToApp}
                className="glass-panel p-3 flex flex-col items-center gap-2 text-center" style={{ opacity: os9Ok ? 1 : 0.4, cursor: os9Ok && !hubBusy ? 'pointer' : 'not-allowed' }}
                title={os9Ok ? t('Baixar e abrir na aba OS-9 (editável)', 'Download and open in the OS-9 tab (editable)') : t('Disponível só para disco OS-9/NitrOS-9', 'Available only for an OS-9/NitrOS-9 disk')}>
                <Cpu size={22} className="text-[var(--primary)]" />
                <span className="text-[11px] font-bold uppercase">{t('Aba OS-9', 'OS-9 tab')}</span>
                <span className="text-[9px] text-[var(--text-muted)]">{known ? (staged!.isOs9 ? (staged!.volume || 'OS-9') : '🔒') : 'OS-9'}</span>
              </button>
              {/* → XRoar (testar no emulador — drive 0, com reset) */}
              <button disabled={hubBusy} onClick={sendToXroar}
                className="glass-panel p-3 flex flex-col items-center gap-2 text-center" style={{ cursor: hubBusy ? 'not-allowed' : 'pointer' }}
                title={t('Baixar e testar no emulador XRoar (drive 0, com reset)', 'Download and test in the XRoar emulator (drive 0, with reset)')}>
                <MonitorPlay size={22} className="text-[var(--primary)]" />
                <span className="text-[11px] font-bold uppercase">{t('XRoar', 'XRoar')}</span>
                <span className="text-[9px] text-[var(--text-muted)]">{t('testar', 'test')}</span>
              </button>
              {/* → DriveWire (com seletor de drive) */}
              <div className="glass-panel p-3 flex flex-col items-center gap-2 text-center">
                <Cable size={22} className="text-[var(--primary)]" />
                <span className="text-[11px] font-bold uppercase">{t('DriveWire', 'DriveWire')}</span>
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map(d => (
                    <button key={d} disabled={hubBusy} onClick={() => setDwDrive(d)} className="dsk-tool" style={{ padding: '2px 6px', color: dwDrive === d ? 'var(--primary)' : undefined, borderColor: dwDrive === d ? 'var(--primary)' : undefined }}>D{d}</button>
                  ))}
                </div>
                <button disabled={hubBusy} onClick={sendToDriveWire} className="dsk-tool" style={{ padding: '3px 12px', color: '#34d399' }}>{t('Enviar', 'Send')}</button>
              </div>
            </div>
            <div className="text-[9px] text-[var(--text-muted)] leading-tight flex items-center gap-1.5">
              {hubBusy && <Loader size={11} className="spin" style={{ color: 'var(--primary)' }} />}
              {hubBusy ? t('Baixando/gravando…', 'Downloading/writing…')
                       : t('DriveWire grava numa PASTA (a servida por Wi-Fi, ou uma que você escolher) e monta no drive — a FujiNet também passa a enxergar o arquivo.',
                           'DriveWire writes to a FOLDER (the Wi-Fi-served one, or one you pick) and mounts it on the drive — the FujiNet also sees the file.')}
            </div>
          </div>
        </div>
        );
      })()}

      {/* HUB "Salvar arquivo…" — grava: no PC (livre) ou na pasta servida por Wi-Fi. Abre NA HORA; baixa na ação. */}
      {saveOpen && hubSource && (
        <div className="glass-modal-overlay flex items-center justify-center p-8" onClick={() => !hubBusy && setSaveOpen(false)}>
          <div className="glass-panel p-5 flex flex-col gap-4" style={{ width: 520, maxWidth: '94%' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <SaveAll size={18} className="text-[var(--primary)]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{t('Salvar arquivo…', 'Save file…')}</h3>
              <span className="text-[10px] text-[var(--text-muted)] normal-case truncate flex-1" title={hubSource.name}>
                {hubSource.name} · {Math.max(1, Math.round(hubSource.size / 1024))} KB
              </span>
              <button onClick={() => !hubBusy && setSaveOpen(false)} className="dsk-tool" style={{ padding: '3px 6px' }}><X size={14} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
              {/* Salvar no PC (livre) */}
              <button disabled={hubBusy} onClick={saveToPc} className="glass-panel p-4 flex flex-col items-center gap-2 text-center" style={{ cursor: hubBusy ? 'not-allowed' : 'pointer' }}
                title={t('Baixar e escolher onde salvar no computador', 'Download and choose where to save on the computer')}>
                <Save size={24} className="text-[var(--primary)]" />
                <span className="text-[11px] font-bold uppercase">{t('Salvar no PC', 'Save to PC')}</span>
                <span className="text-[9px] text-[var(--text-muted)] leading-tight">{t('Diálogo livre — salve onde quiser', 'Free dialog — save anywhere')}</span>
              </button>
              {/* Salvar e apontar no Wi-Fi */}
              <button disabled={hubBusy} onClick={saveAndPointWifi} className="glass-panel p-4 flex flex-col items-center gap-2 text-center" style={{ cursor: hubBusy ? 'not-allowed' : 'pointer' }}
                title={t('Escolher a pasta e apontar o servidor Wi-Fi para ela — a FujiNet passa a ver o arquivo', 'Pick the folder and point the Wi-Fi server at it — the FujiNet will see the file')}>
                <Wifi size={24} className="text-[var(--primary)]" />
                <span className="text-[11px] font-bold uppercase">{t('Salvar e apontar no Wi-Fi', 'Save & point on Wi-Fi')}</span>
                <span className="text-[9px] text-[var(--text-muted)] leading-tight">
                  {serverMode === 'folder' && serverPath ? t('Vai p/ a pasta já servida', 'Goes to the already-served folder') : t('Escolha a pasta a servir', 'Pick the folder to serve')}
                </span>
              </button>
            </div>
            <div className="text-[9px] text-[var(--text-muted)] leading-tight flex items-center gap-1.5">
              {hubBusy && <Loader size={11} className="spin" style={{ color: 'var(--primary)' }} />}
              {hubBusy ? t('Baixando/gravando…', 'Downloading/writing…')
                       : t('"Apontar no Wi-Fi": a pasta escolhida vira a pasta servida pelo Servidor WiFi. Um contêiner é apontado como arquivo Container (cada disco interno vira um .dsk p/ a FujiNet).',
                           '"Point on Wi-Fi": the chosen folder becomes the one served by the WiFi server. A container is pointed as a Container file (each inner disk becomes a .dsk for the FujiNet).')}
            </div>
          </div>
        </div>
      )}

      {/* Modal: gerenciar servidores favoritos + ver comunidade */}
      {manageOpen && (
        <div className="glass-modal-overlay" onClick={() => setManageOpen(false)}>
          <div className="glass-panel p-5 flex flex-col gap-3" style={{ width: 560, maxWidth: '94%', maxHeight: '82%' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Star size={18} className="text-[var(--primary)]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{t('Servidores favoritos', 'Favorite servers')}</h3>
              <button onClick={() => setManageOpen(false)} className="ml-auto dsk-tool" style={{ padding: '3px 6px' }}><X size={14} /></button>
            </div>

            {/* adicionar favorito */}
            <div className="flex flex-col gap-2">
              <span className={sectionTitle} style={{ margin: 0 }}>{t('Adicionar servidor', 'Add server')}</span>
              <div className="flex gap-2 flex-wrap">
                <input value={nf.host} onChange={e => setNf({ ...nf, host: e.target.value })} placeholder={t('host (ex.: casa.exemplo.com)', 'host (e.g. home.example.com)')} className="input-text text-xs flex-1" style={{ padding: '6px 10px', minWidth: 120 }} />
                <input value={nf.label} onChange={e => setNf({ ...nf, label: e.target.value })} placeholder={t('rótulo (opcional)', 'label (optional)')} className="input-text text-xs" style={{ padding: '6px 10px', width: 130 }} />
                <input value={nf.path} onChange={e => setNf({ ...nf, path: e.target.value })} placeholder={t('pasta inicial (ex.: /COCO)', 'start folder (e.g. /COCO)')} className="input-text text-xs" style={{ padding: '6px 10px', width: 130 }} />
                <button onClick={() => { addFavorite(nf); setNf({ host: '', label: '', path: '' }); }} disabled={!nf.host.trim()} className="dsk-tool flex items-center gap-1"><Plus size={13} /> {t('Adicionar', 'Add')}</button>
              </div>
            </div>

            {/* lista de favoritos */}
            <div className="flex flex-col gap-1 overflow-y-auto" style={{ minHeight: 40, maxHeight: 160 }}>
              {servers.length === 0 && <div className="text-[10px] text-[var(--text-muted)] px-1 py-2">{t('Nenhum favorito ainda.', 'No favorites yet.')}</div>}
              {servers.map(s => (
                <div key={s.host} className="flex items-center gap-2 text-[11px]" style={{ padding: '3px 4px' }}>
                  <Wifi size={12} className="flex-shrink-0 text-[var(--primary)]" />
                  <button onClick={() => { setManageOpen(false); connectTo(s.host, s.path || '/'); }} className="dsk-tool flex-1 justify-start text-left" style={{ padding: '3px 8px' }} title={t('Conectar', 'Connect')}>
                    <span className="truncate normal-case">{s.label ? `${s.label} (${s.host})` : s.host}{s.path && s.path !== '/' ? ` [${s.path}]` : ''}</span>
                  </button>
                  <button onClick={() => removeFavorite(s.host)} className="dsk-tool dsk-tool-danger" style={{ padding: '3px 6px' }} title={t('Remover', 'Remove')}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>

            {/* comunidade ao vivo */}
            <div className="flex items-center justify-between">
              <span className={sectionTitle} style={{ margin: 0 }}>{t('Comunidade (ao vivo)', 'Community (live)')}</span>
              <button onClick={fetchCommunity} className="dsk-tool" style={{ padding: '2px 6px' }} title={t('Atualizar lista', 'Refresh list')}><RefreshCw size={12} /> {t('Atualizar', 'Refresh')}</button>
            </div>
            <div className="flex flex-col gap-1 overflow-y-auto" style={{ minHeight: 40, maxHeight: 180 }}>
              {community.length === 0 && <div className="text-[10px] text-[var(--text-muted)] px-1 py-2">{t('(sem lista — clique em Atualizar)', '(no list — click Refresh)')}</div>}
              {community.map(c => (
                <div key={c.host} className="flex items-center gap-2 text-[11px]" style={{ padding: '3px 4px', opacity: c.udpUp ? 1 : 0.5 }}>
                  <span className="text-[9px] font-mono flex-shrink-0" style={{ color: c.udpUp ? '#34d399' : '#f87171', width: 64 }}>{c.udpUp ? 'UDP ✓' : 'UDP ✗'}</span>
                  <button onClick={() => { if (c.udpUp) { setManageOpen(false); connectTo(c.host, '/'); } }} disabled={!c.udpUp} className="dsk-tool flex-1 justify-start text-left" style={{ padding: '3px 8px' }} title={t('Conectar', 'Connect')}>
                    <span className="truncate normal-case">{c.host}</span>
                  </button>
                  <button onClick={() => addFavorite({ host: c.host })} disabled={isFavorite(c.host)} className="dsk-tool" style={{ padding: '3px 6px' }} title={t('Salvar nos favoritos', 'Save to favorites')}><Star size={12} style={{ color: isFavorite(c.host) ? '#fbbf24' : undefined }} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Confirmação: arquivo grande (download TNFS é lento — 512 B por ida-e-volta) */}
      {bigDl && (
        <div className="glass-modal-overlay" onClick={() => { setBigDl(null); bigDlResolve.current?.(false); bigDlResolve.current = null; }}>
          <div className="glass-panel p-5 flex flex-col gap-3" style={{ width: 500, maxWidth: '92%' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2"><Download size={18} className="text-[var(--primary)]" /><h3 className="text-sm font-bold text-white uppercase tracking-wide">{t('Arquivo grande', 'Large file')}</h3></div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {pt ? `"${bigDl.name}" tem ${(bigDl.size / 1024 / 1024).toFixed(1)} MB. Pelo TNFS o download é de 512 bytes por vez (uma ida-e-volta por bloco), então pode levar MUITO tempo — minutos a horas, dependendo do servidor. Arquivos desse tamanho geralmente são imagens de CARTÃO (CoCoSDC), não disquetes. Continuar mesmo assim?`
                  : `"${bigDl.name}" is ${(bigDl.size / 1024 / 1024).toFixed(1)} MB. Over TNFS the download is 512 bytes at a time (one round-trip per block), so it may take a VERY long time — minutes to hours, depending on the server. Files this size are usually CARD images (CoCoSDC), not floppies. Continue anyway?`}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setBigDl(null); bigDlResolve.current?.(false); bigDlResolve.current = null; }} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{t('Cancelar', 'Cancel')}</button>
              <button onClick={() => { setBigDl(null); bigDlResolve.current?.(true); bigDlResolve.current = null; }} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase" style={{ color: '#fbbf24' }}>{t('Baixar mesmo assim', 'Download anyway')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Seletor: o ZIP tem várias imagens → escolher qual abrir */}
      {zipPick && (
        <div className="glass-modal-overlay" onClick={() => setZipPick(null)}>
          <div className="glass-panel p-5 flex flex-col gap-3" style={{ width: 520, maxWidth: '92%', maxHeight: '80%' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <FileArchive size={18} className="text-[var(--primary)]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{t('Escolher imagem do ZIP', 'Choose image from the ZIP')}</h3>
              <button onClick={() => setZipPick(null)} className="ml-auto dsk-tool" style={{ padding: '3px 6px' }}><X size={14} /></button>
            </div>
            <div className="flex flex-col gap-1 overflow-y-auto" style={{ minHeight: 0 }}>
              {zipPick.entries.map(e => (
                <button key={e.name} disabled={busy}
                  onClick={() => { const d = zipPick.data; setZipPick(null); openZipEntry(d, e.name); }}
                  className="dsk-tool flex items-center gap-2 justify-start text-left" style={{ padding: '6px 10px' }} title={e.name}>
                  <FileArchive size={13} className="flex-shrink-0" />
                  <span className="truncate flex-1 text-left normal-case">{e.name}</span>
                  <span className="text-[9px] text-[var(--text-muted)] flex-shrink-0">{Math.max(1, Math.round(e.size / 1024))} KB</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: gerenciar arquivos ocultos (não enviados à FujiNet) */}
      {hideModal && (
        <div className="glass-modal-overlay" onClick={() => setHideModal(false)}>
          <div className="glass-panel p-5 flex flex-col gap-3" style={{ width: 560, maxWidth: '94%', maxHeight: '86%' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <EyeOff size={18} className="text-[var(--primary)]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{t('Arquivos ocultos (não enviados à FujiNet)', 'Hidden files (not sent to the FujiNet)')}</h3>
              <button onClick={() => setHideModal(false)} className="ml-auto dsk-tool" style={{ padding: '3px 6px' }}><X size={14} /></button>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              {t('Estes arquivos NÃO aparecem para a FujiNet (a placa às vezes auto-seleciona o desktop.ini em vez do disco). Os padrões abaixo são fixos; você pode ADICIONAR mais e abrir EXCEÇÕES. Use curingas * e ? (ex.: ',
                 'These files are NOT shown to the FujiNet (the board sometimes auto-selects desktop.ini instead of the disk). The defaults below are built-in; you can ADD more and make EXCEPTIONS. Use wildcards * and ? (e.g. ')}
              <span className="font-mono">*.tmp</span>{t('). Mudanças valem ao (re)ligar o servidor.', '). Changes apply when you (re)start the server.')}
            </p>

            {/* padrões fixos (hardcoded) */}
            <div className="flex flex-col gap-1">
              <span className={sectionTitle} style={{ margin: 0 }}>{t('Padrões fixos (Windows · macOS · Linux)', 'Built-in defaults (Windows · macOS · Linux)')}</span>
              <div className="flex flex-wrap gap-1 overflow-y-auto" style={{ maxHeight: 90 }}>
                {hiddenDefaults.map(n => (
                  <span key={n} className="text-[10px] font-mono px-1.5 py-0.5 rounded normal-case" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{n}</span>
                ))}
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{t('+ tudo que começa com "."', '+ anything starting with "."')}</span>
              </div>
            </div>

            {/* também ocultar (extra) */}
            <div className="flex flex-col gap-1.5">
              <span className={sectionTitle} style={{ margin: 0 }}>{t('Também ocultar (seus padrões)', 'Also hide (your patterns)')}</span>
              <div className="flex gap-2">
                <input value={newHide} onChange={e => setNewHide(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addHide(newHide); }}
                  placeholder={t('ex.: *.tmp, ~$*, leiame.txt', 'e.g. *.tmp, ~$*, readme.txt')} className="input-text text-xs flex-1" style={{ padding: '5px 9px', minWidth: 0 }} />
                <button onClick={() => addHide(newHide)} disabled={!newHide.trim()} className="dsk-tool flex items-center gap-1"><Plus size={13} /> {t('Adicionar', 'Add')}</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {hideExtra.length === 0 && <span className="text-[10px] text-[var(--text-muted)]">{t('(nenhum)', '(none)')}</span>}
                {hideExtra.map(term => (
                  <span key={term} className="text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 normal-case" style={{ background: '#f8717115', border: '1px solid #f8717140', color: '#fca5a5' }}>
                    {term}<button onClick={() => removeHide(term)} className="hover:text-white" title={t('Remover', 'Remove')}><X size={10} /></button>
                  </span>
                ))}
              </div>
            </div>

            {/* nunca ocultar (exceções) */}
            <div className="flex flex-col gap-1.5">
              <span className={sectionTitle} style={{ margin: 0 }}>{t('Nunca ocultar (exceções — vencem os padrões)', 'Never hide (exceptions — override defaults)')}</span>
              <div className="flex gap-2">
                <input value={newAllow} onChange={e => setNewAllow(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addAllow(newAllow); }}
                  placeholder={t('ex.: .config.dsk, thumbs.db', 'e.g. .config.dsk, thumbs.db')} className="input-text text-xs flex-1" style={{ padding: '5px 9px', minWidth: 0 }} />
                <button onClick={() => addAllow(newAllow)} disabled={!newAllow.trim()} className="dsk-tool flex items-center gap-1"><Plus size={13} /> {t('Adicionar', 'Add')}</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {hideAllow.length === 0 && <span className="text-[10px] text-[var(--text-muted)]">{t('(nenhuma)', '(none)')}</span>}
                {hideAllow.map(term => (
                  <span key={term} className="text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 normal-case" style={{ background: '#34d39915', border: '1px solid #34d39940', color: '#6ee7b7' }}>
                    {term}<button onClick={() => removeAllow(term)} className="hover:text-white" title={t('Remover', 'Remove')}><X size={10} /></button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={() => setHideModal(false)} className="btn btn-primary py-2 px-5 text-xs font-bold uppercase">{t('Pronto', 'Done')}</button>
            </div>
          </div>
        </div>
      )}

      {showHelp && <TabHelpModal topic="fujinet" lang={lang} onClose={() => setShowHelp(false)} />}
    </div>
  );
}
