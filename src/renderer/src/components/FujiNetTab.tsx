import React, { useState, useEffect, useRef } from 'react';
import { Globe, Download, Server, FolderOpen, Power, Wifi, WifiOff, Loader, Link2, FileArchive, X, Folder, ArrowUp, Star, Trash2, Plus, RefreshCw } from 'lucide-react';
import { HelpButton, TabHelpModal } from './TabHelp';

interface FavServer { host: string; label?: string; path?: string }
interface CommunityServer { host: string; tcpUp: boolean; udpUp: boolean }

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
}

export default function FujiNetTab({ lang, onLog, onOpenImage }: Props) {
  const pt = lang === 'pt-br';
  const t = (p: string, e: string) => (pt ? p : e);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zipPick, setZipPick] = useState<null | { data: Uint8Array; entries: { name: string; size: number }[] }>(null);

  // extrai uma entrada do zip (no main) e manda abrir
  const openZipEntry = async (zipData: Uint8Array, entryName: string) => {
    onLog(`FujiNet: extraindo ${entryName} do ZIP…`, `FujiNet: extracting ${entryName} from the ZIP…`, 'info');
    const r = await window.cocoApi.zipExtract(zipData, entryName);
    if (!r?.success) { onLog(`FujiNet: falha ao extrair — ${r?.error}`, `FujiNet: extract failed — ${r?.error}`, 'error'); return; }
    onLog(`FujiNet: ${r.name} (${r.bytes} bytes) extraído.`, `FujiNet: ${r.name} (${r.bytes} bytes) extracted.`, 'success');
    onOpenImage(r.name, new Uint8Array(r.data));
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
      onOpenImage(r.name, new Uint8Array(r.data));
    }
  };

  // --- Abrir por URL (manual) ---
  const [url, setUrl] = useState('');
  const doOpenUrl = async () => {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    onLog(`FujiNet: baixando ${u}…`, `FujiNet: downloading ${u}…`, 'info');
    try {
      const r = await window.cocoApi.netDownloadUrl(u);
      if (!r?.success) { onLog(`FujiNet: falha no download — ${r?.error}`, `FujiNet: download failed — ${r?.error}`, 'error'); return; }
      onLog(`FujiNet: ${r.name} (${r.bytes} bytes) baixado.`, `FujiNet: ${r.name} (${r.bytes} bytes) downloaded.`, 'success');
      await processFetched(r);
    } catch (e: any) { onLog(`FujiNet: erro — ${e?.message}`, `FujiNet: error — ${e?.message}`, 'error'); }
    finally { setBusy(false); }
  };

  // --- Cliente TNFS (navegar hubs FujiNet) ---
  const [host, setHost] = useState('tnfs.fujinet.online');
  const [tnfsPath, setTnfsPath] = useState('/');
  const [tnfsEntries, setTnfsEntries] = useState<null | { name: string; isDir: boolean; size: number }[]>(null);
  const [bigDl, setBigDl] = useState<null | { name: string; size: number }>(null); // confirmação p/ arquivo grande
  const [dlGot, setDlGot] = useState(0);    // bytes baixados (progresso)
  const [dlTotal, setDlTotal] = useState(0); // tamanho total (do STAT/listagem)
  const [dlName, setDlName] = useState('');  // nome do arquivo em download (status bar visível quando != '')
  const jp = (d: string, n: string) => (d.endsWith('/') ? d + n : d + '/' + n);
  const parentOf = (p: string) => { const q = p.replace(/\/+$/, ''); const i = q.lastIndexOf('/'); return i <= 0 ? '/' : q.slice(0, i); };

  const tnfsGo = async (path: string, hostOverride?: string) => {
    const h = (hostOverride ?? host).trim(); if (!h || busy) return;
    setBusy(true);
    onLog(`FujiNet TNFS: listando ${h}:${path}…`, `FujiNet TNFS: listing ${h}:${path}…`, 'info');
    try {
      const r = await window.cocoApi.tnfsList(h, path);
      if (!r?.success) { onLog(`FujiNet TNFS: ${r?.error}`, `FujiNet TNFS: ${r?.error}`, 'error'); return; }
      setTnfsPath(path); setTnfsEntries(r.entries || []);
      onLog(`FujiNet TNFS: ${r.entries?.length ?? 0} itens em ${path}.`, `FujiNet TNFS: ${r.entries?.length ?? 0} items in ${path}.`, 'success');
    } catch (e: any) { onLog(`FujiNet TNFS: erro — ${e?.message}`, `FujiNet TNFS: error — ${e?.message}`, 'error'); }
    finally { setBusy(false); }
  };

  // TNFS é 512 bytes por ida-e-volta → arquivos grandes (ex.: imagem de cartão SDC de 30 MB) demoram
  // DEMAIS. Acima do limite, confirma antes; e o download tem progresso + cancelar.
  const LARGE_DL = 4 * 1024 * 1024;
  const tnfsOpenFile = (name: string, size: number) => {
    if (size > LARGE_DL) { setBigDl({ name, size }); return; }
    doTnfsRead(name, size);
  };
  const doTnfsRead = async (name: string, size: number) => {
    const h = host.trim(); const p = jp(tnfsPath, name);
    setBigDl(null); setBusy(true); setDlGot(0); setDlTotal(size || 0); setDlName(name);
    onLog(`FujiNet TNFS: baixando ${p}…`, `FujiNet TNFS: downloading ${p}…`, 'info');
    try {
      const r = await window.cocoApi.tnfsRead(h, p);
      if (!r?.success) { onLog(`FujiNet TNFS: ${r?.error}`, `FujiNet TNFS: ${r?.error}`, r?.error === 'Download cancelado.' ? 'warn' : 'error'); return; }
      onLog(`FujiNet TNFS: ${r.name} (${r.bytes} bytes) baixado.`, `FujiNet TNFS: ${r.name} (${r.bytes} bytes) downloaded.`, 'success');
      await processFetched(r);
    } catch (e: any) { onLog(`FujiNet TNFS: erro — ${e?.message}`, `FujiNet TNFS: error — ${e?.message}`, 'error'); }
    finally { setBusy(false); setDlGot(0); setDlName(''); }
  };

  // --- Servidor WiFi (TNFS): serve uma PASTA ou um CONTAINER (discos internos viram .dsk) ---
  const [serverMode, setServerMode] = useState<'folder' | 'container'>('folder');
  const [serverPath, setServerPath] = useState('');
  const [serverRunning, setServerRunning] = useState(false);
  const [serverInfo, setServerInfo] = useState<{ ip: string; port: number; describe: string } | null>(null);
  const [sharedFiles, setSharedFiles] = useState<null | { name: string; isDir: boolean; size: number }[]>(null);
  const [serverBusy, setServerBusy] = useState(false);

  // lista o que SERÁ servido (sem iniciar) — alimenta o painel "Arquivos compartilhados" (item 3)
  const previewServer = async (p: string, mode: 'folder' | 'container') => {
    if (!p) { setSharedFiles(null); return; }
    try {
      const r = await window.cocoApi.tnfsServerPreview({ mode, path: p });
      if (r?.success) setSharedFiles(r.entries || []);
      else { setSharedFiles([]); onLog(`Servidor: ${r?.error}`, `Server: ${r?.error}`, 'warn'); }
    } catch { setSharedFiles([]); }
  };
  const pickServerPath = async () => {
    const r = serverMode === 'container' ? await window.cocoApi.pickFile?.() : await window.cocoApi.pickDirectory?.();
    if (r?.path) { setServerPath(r.path); previewServer(r.path, serverMode); }
  };
  const startServer = async () => {           // item 1
    if (!serverPath || serverBusy) return;
    setServerBusy(true);
    try {
      const r = await window.cocoApi.tnfsServerStart({ mode: serverMode, path: serverPath });
      if (!r?.success) { onLog(`Servidor TNFS: ${r?.error}`, `TNFS server: ${r?.error}`, 'error'); return; }
      setServerRunning(true); setServerInfo({ ip: r.ip, port: r.port, describe: r.describe });
      onLog(`Servidor TNFS LIGADO em ${r.ip}:${r.port} (${r.describe}). Na FujiNet, ponha "${r.ip}" num host slot.`,
            `TNFS server STARTED at ${r.ip}:${r.port} (${r.describe}). On the FujiNet, put "${r.ip}" in a host slot.`, 'success');
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
        const sp = typeof fn.serverPath === 'string' ? fn.serverPath : (typeof fn.shareFolder === 'string' ? fn.shareFolder : '');
        if (sp) { setServerPath(sp); previewServer(sp, fn.serverMode === 'container' ? 'container' : 'folder'); }
      } catch { /* ignore */ }
      loaded.current = true;
      fetchCommunity();
      try { const st = await window.cocoApi.tnfsServerStatus?.(); if (st?.running) { setServerRunning(true); setServerInfo({ ip: st.ip, port: st.port, describe: st.describe }); } } catch { /* */ }
    })();
    // log de conexões do servidor → console (item 5) + progresso de download TNFS
    const off = window.cocoApi.onNetLog?.((m: any) => onLog(m?.pt || '', m?.en || m?.pt || '', m?.type || 'info'));
    const offP = window.cocoApi.onTnfsProgress?.((m: any) => setDlGot(m?.got || 0));
    return () => { try { off?.(); } catch { /* */ } try { offP?.(); } catch { /* */ } };
  }, []);

  // Persiste no config (debounce) quando favoritos/host/servidor mudam.
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(() => { window.cocoApi.saveConfig({ fujinet: { servers, lastHost: host, serverMode, serverPath } }); }, 400);
    return () => clearTimeout(id);
  }, [servers, host, serverMode, serverPath]);

  const addFavorite = (fav: FavServer) => {
    const h = fav.host.trim(); if (!h) return;
    setServers(s => s.some(x => x.host === h) ? s : [...s, { host: h, label: fav.label?.trim() || undefined, path: fav.path?.trim() || undefined }]);
  };
  const removeFavorite = (h: string) => setServers(s => s.filter(x => x.host !== h));
  const isFavorite = (h: string) => servers.some(x => x.host === h);
  const connectTo = (h: string, path = '/') => { setHost(h); tnfsGo(path, h); };
  // "Desconectar": o TNFS é por-operação (mount/umount), então isto limpa a sessão/listagem da tela.
  const tnfsDisconnect = () => { setTnfsEntries(null); setTnfsPath('/'); onLog('FujiNet TNFS: desconectado.', 'FujiNet TNFS: disconnected.', 'info'); };

  const sectionTitle = 'text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5';
  const soon = (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: '#fbbf24', border: '1px solid #fbbf2455' }}>
      {t('em breve', 'soon')}
    </span>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-3" style={{ minHeight: 0 }}>
      {/* Título + Ajuda */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <Globe size={16} className="text-[var(--primary)]" />
        <span className="text-sm font-bold text-white uppercase tracking-wide">{t('FujiNet / Online', 'FujiNet / Online')}</span>
        <span className="ml-auto"><HelpButton onClick={() => setShowHelp(true)} lang={lang} /></span>
      </div>

      {/* Divisão VERTICAL: esquerda cliente · direita servidor */}
      <div className="flex-1 flex gap-3 overflow-hidden" style={{ minHeight: 0 }}>

        {/* ESQUERDA — CLIENTE */}
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto" style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <Download size={14} className="text-[var(--primary)]" />
            <span className="text-xs font-bold text-white uppercase tracking-wide">{t('Acessar servidores', 'Access servers')}</span>
          </div>

          {/* PRIMÁRIO — Cliente TNFS (hubs FujiNet): navegar e baixar */}
          <div className="glass-panel p-3 flex flex-col gap-2 flex-1" style={{ minHeight: 160 }}>
            <div className="flex items-center justify-between">
              <span className={sectionTitle} style={{ margin: 0 }}>{t('Servidores TNFS (hubs FujiNet)', 'TNFS servers (FujiNet hubs)')}</span>
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
              <button onClick={() => tnfsGo('/')} disabled={busy || !host.trim()} className="dsk-tool flex items-center gap-1.5">
                {busy ? <Loader size={13} className="spin" /> : <Wifi size={13} />} {t('Conectar', 'Connect')}
              </button>
              <button onClick={tnfsDisconnect} disabled={busy || tnfsEntries === null} className="dsk-tool flex items-center gap-1.5" title={t('Limpar a sessão/listagem TNFS', 'Clear the TNFS session/listing')}>
                <WifiOff size={13} /> {t('Desconectar', 'Disconnect')}
              </button>
            </div>
            {tnfsEntries !== null && (
              <>
                <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                  <button onClick={() => tnfsGo(parentOf(tnfsPath))} disabled={busy || tnfsPath === '/'} className="dsk-tool" style={{ padding: '2px 6px' }} title={t('Subir', 'Up')}><ArrowUp size={12} /></button>
                  <span className="font-mono truncate" title={tnfsPath}>{tnfsPath}</span>
                </div>
                <div className="flex-1 flex flex-col gap-0.5 overflow-y-auto" style={{ minHeight: 0 }}>
                  {tnfsEntries.length === 0 && <div className="text-[10px] text-[var(--text-muted)] px-1 py-2">{t('(pasta vazia)', '(empty folder)')}</div>}
                  {tnfsEntries.map(e => (
                    <button key={e.name} disabled={busy}
                      onClick={() => e.isDir ? tnfsGo(jp(tnfsPath, e.name)) : tnfsOpenFile(e.name, e.size)}
                      className="dsk-tool flex items-center gap-2 justify-start text-left" style={{ padding: '4px 8px' }} title={e.name}>
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
                {t('Conecte a um hub TNFS (UDP 16384), navegue as pastas e clique numa imagem p/ baixar e abrir. Ex.: tnfs.fujinet.online → pasta COCO.',
                   'Connect to a TNFS hub (UDP 16384), browse folders and click an image to download and open. E.g.: tnfs.fujinet.online → COCO folder.')}
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
            <div className={sectionTitle}>{t('Abrir por URL (HTTP/HTTPS) — manual', 'Open by URL (HTTP/HTTPS) — manual')}</div>
            <div className="flex gap-2">
              <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doOpenUrl(); }}
                placeholder="https://…/jogo.dsk (.zip ok)" className="input-text text-xs flex-1" style={{ padding: '6px 10px', minWidth: 0 }} />
              <button onClick={doOpenUrl} disabled={busy || !url.trim()} className="dsk-tool flex items-center gap-1.5">
                {busy ? <Loader size={13} className="spin" /> : <Link2 size={13} />} {t('Abrir', 'Open')}
              </button>
            </div>
            <div className="text-[9px] text-[var(--text-muted)] leading-tight">
              {t('Baixa (e descompacta .zip) um .dsk/.vdk/.sdf/.os9/.img/.ccc/.cas de um link e abre no painel (OS-9 vai p/ a aba OS-9).',
                 'Downloads (and unzips .zip) a .dsk/.vdk/.sdf/.os9/.img/.ccc/.cas from a link and opens it in a pane (OS-9 goes to the OS-9 tab).')}
            </div>
          </div>
        </div>

        {/* Divisória vertical */}
        <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />

        {/* DIREITA — SERVIDOR WiFi */}
        <div className="flex flex-col gap-3 overflow-y-auto" style={{ width: 320, flexShrink: 0 }}>
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
            <div className="flex gap-2">
              <input value={serverPath} readOnly placeholder={serverMode === 'container' ? t('(escolha um .img/.vhd/.dsk)', '(choose a .img/.vhd/.dsk)') : t('(escolha uma pasta)', '(choose a folder)')} className="input-text text-xs flex-1" style={{ padding: '6px 10px', minWidth: 0 }} title={serverPath} />
              <button onClick={pickServerPath} disabled={serverRunning} className="dsk-tool flex items-center gap-1"><FolderOpen size={13} /></button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
              <span>{t('Porta', 'Port')}</span><span className="font-mono">16384 (UDP) · {t('somente leitura', 'read-only')}</span>
            </div>
            {serverRunning && serverInfo && (
              <div className="text-[10px] flex items-center justify-between" style={{ color: '#34d399' }}>
                <span>{t('Endereço (host slot):', 'Address (host slot):')}</span>
                <span className="font-mono font-bold">{serverInfo.ip}</span>
              </div>
            )}
            {serverRunning
              ? <button onClick={stopServer} disabled={serverBusy} className="dsk-tool flex items-center justify-center gap-1.5" style={{ color: '#f87171' }}>{serverBusy ? <Loader size={13} className="spin" /> : <Power size={13} />} {t('Desligar servidor', 'Stop server')}</button>
              : <button onClick={startServer} disabled={serverBusy || !serverPath} className="dsk-tool flex items-center justify-center gap-1.5" style={{ color: serverPath ? '#34d399' : undefined }}>{serverBusy ? <Loader size={13} className="spin" /> : <Power size={13} />} {t('Ligar servidor', 'Start server')}</button>}
            <div className="text-[9px] text-[var(--text-muted)] leading-tight">
              {t('Serve via TNFS (UDP 16384). Na FujiNet, ponha o IP do PC acima num host slot. Container = cada disco interno vira um .dsk.',
                 'Serves via TNFS (UDP 16384). On the FujiNet, put the PC IP above in a host slot. Container = each inner disk becomes a .dsk.')}
            </div>
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
      </div>

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
        <div className="glass-modal-overlay" onClick={() => setBigDl(null)}>
          <div className="glass-panel p-5 flex flex-col gap-3" style={{ width: 500, maxWidth: '92%' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2"><Download size={18} className="text-[var(--primary)]" /><h3 className="text-sm font-bold text-white uppercase tracking-wide">{t('Arquivo grande', 'Large file')}</h3></div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {pt ? `"${bigDl.name}" tem ${(bigDl.size / 1024 / 1024).toFixed(1)} MB. Pelo TNFS o download é de 512 bytes por vez (uma ida-e-volta por bloco), então pode levar MUITO tempo — minutos a horas, dependendo do servidor. Arquivos desse tamanho geralmente são imagens de CARTÃO (CoCoSDC), não disquetes. Continuar mesmo assim?`
                  : `"${bigDl.name}" is ${(bigDl.size / 1024 / 1024).toFixed(1)} MB. Over TNFS the download is 512 bytes at a time (one round-trip per block), so it may take a VERY long time — minutes to hours, depending on the server. Files this size are usually CARD images (CoCoSDC), not floppies. Continue anyway?`}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBigDl(null)} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{t('Cancelar', 'Cancel')}</button>
              <button onClick={() => doTnfsRead(bigDl.name, bigDl.size)} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase" style={{ color: '#fbbf24' }}>{t('Baixar mesmo assim', 'Download anyway')}</button>
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

      {showHelp && <TabHelpModal topic="fujinet" lang={lang} onClose={() => setShowHelp(false)} />}
    </div>
  );
}
