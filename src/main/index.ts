import { app, BrowserWindow, ipcMain, dialog, nativeImage, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { decodeWav, decodeCasTapeGapAware, buildFaithfulCas, buildCleanWav, encodeCasToWav, resampleWav8, buildEraTapeWav, tapeDiagnostics, decodeRegion, mergeCaptures } from './converter/wav';
import { parseCas, fixCas } from './converter/cas';
import { parseDsk, extractDskFile, addDskFile, deleteDskFile, renameDskFile, sortDskDirectory, defragFileInPlace, defragDiskRebuild, isRsDosDisk, deDoubleDisk, scanMiniIdeImage, formatRsDosDisk, writeSidekickName, DskFileEntry } from './converter/dsk';
import { readDragonDirectory, stripVdk, extractDragonFile, encodeDragonBlank, looksDragon, addDragonFile, deleteDragonFile, renameDragonFile, cocoToDragonBin, recommendDragonMode, sortDragonDirectory, defragDragonDisk } from './converter/dragondos';
import { readFatVolume, listFatFiles, readFatFile, fatReplaceFile, fatAddFile, fatDeleteFile, Reader, Writer } from './converter/fat';
import { isDmk, dmkToRaw, normalizeDiskImage } from './converter/dmk';
import { rawToSdf } from './converter/sdf';
import { downloadUrl } from './net/download';
import { tnfsList, tnfsReadFile, parseTnfsStatusHtml } from './net/tnfs';
import { startTnfsServer, folderProvider, containerProvider, localIPv4, localIPv4sRanked, DEFAULT_HIDDEN_NAMES, TnfsServerHandle, TnfsProvider } from './net/tnfsServer';
import { startDriveWireServer, listSerialPorts, DwServerHandle } from './net/drivewire';

let tnfsSrv: TnfsServerHandle | null = null;
let dwSrv: DwServerHandle | null = null;
function buildProvider(mode: string, p: string, writable?: boolean, hideExtra?: string[], hideAllow?: string[]): TnfsProvider {
  // gravação só faz sentido (e só é segura) no modo PASTA; container fica sempre só-leitura.
  // hideExtra/hideAllow só valem no modo PASTA (container já filtra por extensão de imagem).
  return mode === 'container' ? containerProvider(p) : folderProvider(p, { writable: !!writable, hideExtra, hideAllow });
}
// FujiNet — SERVIDOR WiFi (TNFS) servindo uma PASTA ou um CONTAINER (discos internos como .dsk).
ipcMain.handle('tnfs-server-start', async (_, opts: { mode: string; path: string; writable?: boolean; hideExtra?: string[]; hideAllow?: string[] }) => {
  try {
    if (tnfsSrv) { tnfsSrv.stop(); tnfsSrv = null; }
    const writable = opts.mode !== 'container' && !!opts.writable;
    const provider = buildProvider(opts.mode, opts.path, writable, opts.hideExtra, opts.hideAllow);
    tnfsSrv = await startTnfsServer(provider, (pt, en, type) => mainWindow?.webContents.send('net-log', { pt, en, type }));
    return { success: true, ip: tnfsSrv.ip, port: tnfsSrv.port, describe: tnfsSrv.describe, writable, ips: await localIPv4sRanked() };
  } catch (e: any) { return { success: false, error: e?.message || 'Falha ao iniciar o servidor.' }; }
});
ipcMain.handle('tnfs-server-stop', async () => {
  try { tnfsSrv?.stop(); tnfsSrv = null; return { success: true }; }
  catch (e: any) { return { success: false, error: e?.message }; }
});
ipcMain.handle('tnfs-server-status', async () => ({ running: !!tnfsSrv, ip: tnfsSrv?.ip || await localIPv4(), port: tnfsSrv?.port || 16384, describe: tnfsSrv?.describe || '', ips: await localIPv4sRanked() }));
// Padrões hardcoded de arquivos ocultos (p/ a UI exibir) — fonte única em tnfsServer.ts.
ipcMain.handle('tnfs-hidden-defaults', async () => ({ names: DEFAULT_HIDDEN_NAMES }));
// Pré-visualiza o que SERÁ servido (lista a raiz) sem iniciar o servidor.
ipcMain.handle('tnfs-server-preview', async (_, opts: { mode: string; path: string; hideExtra?: string[]; hideAllow?: string[] }) => {
  let prov: TnfsProvider | null = null;
  try {
    prov = buildProvider(opts.mode, opts.path, false, opts.hideExtra, opts.hideAllow);
    const entries = prov.list('/');
    return { success: true, describe: prov.describe, entries };
  } catch (e: any) { return { success: false, error: e?.message }; }
  finally { try { prov?.dispose?.(); } catch { /* */ } }
});

// --- Servidor DriveWire (serial) — M4. Espelha os IPCs do TNFS, mas por porta serial. ---
ipcMain.handle('dw-list-ports', async () => {
  try { return { success: true, ports: await listSerialPorts() }; }
  catch (e: any) { return { success: false, error: e?.message, ports: [] }; }
});
ipcMain.handle('dw-server-start', async (_, opts: { portPath: string; baudRate: number; drives: { slot: number; filePath: string; writable: boolean }[] }) => {
  try {
    if (dwSrv) { dwSrv.stop(); dwSrv = null; }
    dwSrv = await startDriveWireServer(opts, (pt, en, type) => mainWindow?.webContents.send('net-log', { pt, en, type }));
    return { success: true, portPath: dwSrv.portPath, baudRate: dwSrv.baudRate, drives: dwSrv.drives };
  } catch (e: any) { return { success: false, error: e?.message || 'Falha ao iniciar o servidor DriveWire.' }; }
});
ipcMain.handle('dw-server-stop', async () => {
  try { dwSrv?.stop(); dwSrv = null; return { success: true }; }
  catch (e: any) { return { success: false, error: e?.message }; }
});
ipcMain.handle('dw-server-status', async () => ({ running: !!dwSrv, portPath: dwSrv?.portPath || '', baudRate: dwSrv?.baudRate || 0, drives: dwSrv?.drives || [] }));
// Info de um .dsk para a etiqueta do drive (nome/tamanho/tipo/nº de arquivos).
ipcMain.handle('dw-disk-info', async (_, filePath: string) => {
  try {
    const buf = fs.readFileSync(filePath);
    const size = buf.length;
    const STD = 161280;
    let count = 1; // nº de discos se for CONTÊINER (N×161.280 com fatias RS-DOS válidas)
    if (size > STD && size % STD === 0) { const n = size / STD; if (n > 1 && isRsDosDisk(buf.subarray(0, STD)) && isRsDosDisk(buf.subarray(STD, 2 * STD))) count = n; }
    const slice = count > 1 ? buf.subarray(0, STD) : buf; // info vem do disco 0 quando contêiner
    let kind = ''; let files = -1; let tracks = 0;
    try {
      if (isRsDosDisk(slice)) { kind = 'RS-DOS'; tracks = Math.round(slice.length / (18 * 256)); files = (parseDsk(Buffer.from(slice)).files || []).length; }
    } catch { /* não-RS-DOS: só mostra tamanho */ }
    return { success: true, name: path.basename(filePath), size, kind, files, tracks, count };
  } catch (e: any) { return { success: false, error: e?.message }; }
});
// Grava o buffer de um disco num .dsk TEMPORÁRIO e devolve o caminho — p/ "Enviar para DriveWire" (aba DSK → painel DW).
ipcMain.handle('dw-stage-disk', async (_, name: string, buffer: Uint8Array) => {
  try {
    const dir = path.join(os.tmpdir(), 'cocofiu-dw');
    fs.mkdirSync(dir, { recursive: true });
    let safe = (name || 'DISCO.DSK').replace(/[^A-Za-z0-9._-]/g, '_');
    if (!safe.toLowerCase().endsWith('.dsk')) safe += '.dsk';
    const fp = path.join(dir, safe);
    fs.writeFileSync(fp, Buffer.from(buffer));
    return { success: true, filePath: fp, name: path.basename(fp) };
  } catch (e: any) { return { success: false, error: e?.message }; }
});
// Salva bytes DENTRO de uma pasta (junta dir+nome no main p/ não errar separador) — usado pela aba
// Servidores ("Salvar e apontar no Wi-Fi" e "Enviar p/ DriveWire": o disco vai p/ a pasta servida).
ipcMain.handle('fn-save-to-dir', async (_, dir: string, name: string, buffer: Uint8Array) => {
  try {
    if (!dir) return { success: false, error: 'No folder.' };
    const safe = (name || 'DISCO.DSK').replace(/[\\/:*?"<>|]/g, '_');
    const fp = path.join(dir, safe);
    fs.writeFileSync(fp, Buffer.from(buffer));
    return { success: true, filePath: fp, name: path.basename(fp) };
  } catch (e: any) { return { success: false, error: e?.message }; }
});
// Lista os arquivos de um .dsk de um drive DriveWire. Se for CONTÊINER (N×161.280 c/ fatias RS-DOS válidas),
// devolve count+index e os arquivos do disco interno `index` — a UI navega com ◀ ▶.
ipcMain.handle('dw-disk-files', async (_, filePath: string, index = 0) => {
  try {
    const buf = fs.readFileSync(filePath);
    const STD = 161280;
    let count = 1;
    if (buf.length > STD && buf.length % STD === 0) {
      const n = buf.length / STD;
      if (n > 1 && isRsDosDisk(buf.subarray(0, STD)) && isRsDosDisk(buf.subarray(STD, 2 * STD))) count = n;
    }
    const idx = Math.max(0, Math.min(count - 1, index | 0));
    const slice = count > 1 ? buf.subarray(idx * STD, (idx + 1) * STD) : buf;
    let files: any[] = [];
    try { files = (parseDsk(Buffer.from(slice)).files || []).map((f) => ({ fullName: f.fullName, type: f.fileTypeName, ascii: f.asciiFlag !== 0, size: f.totalSize })); } catch { /* vazio/não-RS-DOS */ }
    return { success: true, name: path.basename(filePath), count, index: idx, files };
  } catch (e: any) { return { success: false, error: e?.message }; }
});

import { isZip, listZip, extractZipByName } from './converter/zip';

// LINUX — desliga o SANDBOX do Chromium.
// Por quê: Ubuntu 24.04+ (e derivados) RESTRINGEM user namespaces não privilegiados (política do AppArmor),
// e o SETUID-sandbox (chrome-sandbox 4755) ainda falha quando o binário roda de partição/montagem `nosuid`
// (AppImage via FUSE, ou rodando o executável direto da pasta). Sintoma:
//   "zygote_host_impl_linux.cc Check failed: ... Invalid argument (22)" + "failed to execvp" + "Trace/breakpoint trap".
// App desktop LOCAL (sem conteúdo remoto; webSecurity já é false) → desligar o sandbox é seguro e garante o boot
// em qualquer kernel/AppArmor, sem o usuário precisar mexer em SUID nem em sysctl. PRECISA ser antes do whenReady().
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}

// Escolher uma PASTA (p/ a pasta compartilhada do servidor FujiNet, etc.).
ipcMain.handle('pick-directory', async () => {
  if (!mainWindow) return { cancelled: true };
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths.length) return { cancelled: true };
  return { path: r.filePaths[0] };
});

// Escolher um ARQUIVO (devolve o caminho) — p/ servir um container no servidor TNFS.
ipcMain.handle('pick-file', async (_, filters?: { name: string; extensions: string[] }[]) => {
  if (!mainWindow) return { cancelled: true };
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: filters || [{ name: 'Imagens / Containers', extensions: ['img', 'vhd', 'dsk', 'os9', 'vdk', 'dmk', 'sdf'] }, { name: 'All Files', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths.length) return { cancelled: true };
  return { path: r.filePaths[0] };
});

// FujiNet / Online (M1a) — baixa um arquivo por URL (HTTP/HTTPS) e devolve os bytes ao renderer.
ipcMain.handle('net-download-url', async (_, url: string) => {
  try {
    const r = await downloadUrl(String(url || '').trim());
    if (!r.success) return { success: false, error: r.error };
    const buf = r.data!;
    // ZIP (caso comum no Color Computer Archive): devolve a lista de entradas + os bytes do zip,
    // p/ o renderer escolher/extrair a imagem (via 'zip-extract'). Sem dependência nativa (zlib).
    if (isZip(buf)) {
      const entries = listZip(buf).filter(e => !e.isDir).map(e => ({ name: e.name, size: e.size }));
      return { success: true, isZip: true, name: r.name, entries, data: new Uint8Array(buf), bytes: r.bytes };
    }
    return { success: true, name: r.name, data: new Uint8Array(buf), bytes: r.bytes };
  } catch (e: any) { return { success: false, error: e?.message || 'Falha no download.' }; }
});

// FujiNet — lista da comunidade (status TNFS) buscada ao vivo, com fallback embutido.
ipcMain.handle('tnfs-community', async () => {
  const FALLBACK = ['tnfs.fujinet.online', 'fujinet.abbuc.de', 'fujinet.diller.org', 'fujinet.pl', 'fuji.buriedbits.org']
    .map(h => ({ host: h, tcpUp: true, udpUp: true }));
  try {
    const r = await downloadUrl('https://fujinet.online/tnfs-server-status/');
    if (!r.success || !r.data) return { success: true, servers: FALLBACK, fallback: true };
    const servers = parseTnfsStatusHtml(r.data.toString('utf8'));
    if (!servers.length) return { success: true, servers: FALLBACK, fallback: true };
    return { success: true, servers };
  } catch { return { success: true, servers: FALLBACK, fallback: true }; }
});

// FujiNet / TNFS (M1b) — navegar um hub e baixar imagens.
let tnfsListAbort: (() => void) | null = null;
ipcMain.handle('tnfs-list-cancel', () => { try { tnfsListAbort?.(); } catch { /* */ } return { success: true }; });
ipcMain.handle('tnfs-list', async (_, host: string, path: string) => {
  try {
    let lastT = 0;
    const entries = await tnfsList(String(host || '').trim(), String(path || '/'), {
      onAbort: (cancel) => { tnfsListAbort = cancel; },
      // progresso da listagem (X/N itens) — throttle por tempo; a UI só mostra a barra se demorar.
      onProgress: (loaded, total) => { const now = Date.now(); if (now - lastT >= 200 || loaded >= total) { lastT = now; mainWindow?.webContents.send('tnfs-list-progress', { loaded, total, path: String(path || '/') }); } },
    });
    return { success: true, entries };
  } catch (e: any) { return { success: false, error: e?.message || 'Falha no TNFS.' }; }
  finally { tnfsListAbort = null; }
});

let tnfsReadCancelFlag = false;
ipcMain.handle('tnfs-read-cancel', () => { tnfsReadCancelFlag = true; return { success: true }; });
ipcMain.handle('tnfs-read', async (_, host: string, path: string) => {
  try {
    tnfsReadCancelFlag = false;
    let lastT = 0;
    const buf = await tnfsReadFile(String(host || '').trim(), String(path), {
      shouldAbort: () => tnfsReadCancelFlag,
      // throttle por TEMPO (~250 ms): a barra anda suave mesmo em servidor lento (1 KB/s) ou rápido (MB/s).
      onProgress: (got) => { const now = Date.now(); if (now - lastT >= 250) { lastT = now; mainWindow?.webContents.send('tnfs-progress', { got }); } },
    });
    const name = String(path).split('/').pop() || 'arquivo';
    if (isZip(buf)) {
      const entries = listZip(buf).filter(e => !e.isDir).map(e => ({ name: e.name, size: e.size }));
      return { success: true, isZip: true, name, entries, data: new Uint8Array(buf), bytes: buf.length };
    }
    return { success: true, name, data: new Uint8Array(buf), bytes: buf.length };
  } catch (e: any) { return { success: false, error: e?.message || 'Falha ao ler do TNFS.' }; }
});

// Extrai UMA entrada de um ZIP (descomprime) e devolve os bytes ao renderer.
ipcMain.handle('zip-extract', async (_, zipBytes: Uint8Array, entryName: string) => {
  try {
    const data = extractZipByName(Buffer.from(zipBytes), String(entryName));
    return { success: true, name: String(entryName).split('/').pop() || 'arquivo', data: new Uint8Array(data), bytes: data.length };
  } catch (e: any) { return { success: false, error: e?.message || 'Falha ao extrair do ZIP.' }; }
});

// Se o caminho de saída for .sdf, codifica o buffer RAW (OS-9/RS-DOS uniforme) em SDF (CoCoSDC);
// senão devolve o RAW. A geometria vem do descritor OS-9 (SPT/lados).
function encodeForOs9Path(raw: Buffer, filePath: string): Buffer {
  if (!/\.sdf$/i.test(filePath)) return raw;
  const id = parseIdent(raw, 0);
  return rawToSdf(raw, { sectorsPerTrack: id.sectorsPerTrack || 18, sides: id.sides || 1 });
}
import { isOs9Disk, isOs9DiskStrict, parseIdent, parseOs9, readFD, readFileData, createBlankOs9, os9Mkdir, os9Rename, os9Insert, os9Delete, os9DefragFile, os9DefragAll, os9ReadTree, os9ApplyTree, os9SystemArea, os9ChildLsn, readClusterBitmap, os9MakeBootable, os9BootInfo, os9CloneBootable, OS9_GEOMETRIES } from './converter/os9';
import { parseBin } from './converter/bin';
import { compileBootstrap, BootstrapConfig } from './converter/bootstrap';
import { encodeCas, encodeDsk, buildCocoFlashBin, CasFileInput, DskFileInput } from './converter/export';
import { scanSoftKristian, scanLoaders } from './converter/loaderscan';
import { buildNoLoaderBin, readCdcuInfo, stripToProgram } from './converter/loaderpak';

let mainWindow: BrowserWindow | null = null;
let allowClose = false; // só true depois que o usuário confirma no modal de "Sair"

// --- Splash screen (5 s, barra de progresso) ---
let splashWindow: BrowserWindow | null = null;
let mainReady = false, splashDone = false, splashFinished = false;
// Resolve o splash.html (prod: <resources>/splash via extraResources; dev: <projeto>/resources/splash).
function splashHtmlPath(): string | null {
  const dirs = app.isPackaged
    ? [path.join(process.resourcesPath, 'splash')]
    : [path.join(process.cwd(), 'resources', 'splash'), path.join(app.getAppPath(), 'resources', 'splash')];
  for (const d of dirs) { const p = path.join(d, 'splash.html'); if (fs.existsSync(p)) return p; }
  return null;
}
// Mostra a janela principal quando a splash terminou (5 s) E o main está pronto.
function finishSplash() {
  if (splashFinished || !mainReady || !splashDone) return;
  splashFinished = true;
  try { splashWindow?.close(); } catch { /* ignore */ }
  splashWindow = null;
  mainWindow?.maximize();
  mainWindow?.show();
}
function createSplash() {
  const p = splashHtmlPath();
  if (!p) { splashDone = true; return; } // sem splash → segue direto
  splashWindow = new BrowserWindow({
    width: 600, height: 560, frame: false, transparent: true, resizable: false,
    center: true, alwaysOnTop: true, skipTaskbar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // idioma atual (settings.json) p/ traduzir o rodapé da splash
  let lang = 'pt-br';
  try {
    const cfgPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(cfgPath)) { const c = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); if (c?.currentLang) lang = c.currentLang; }
  } catch { /* ignore */ }
  splashWindow.loadFile(p, { query: { v: app.getVersion(), lang } });
  splashWindow.once('ready-to-show', () => splashWindow?.show());
  setTimeout(() => { splashDone = true; finishSplash(); }, 5000);
}

// Gabaritos OS-9 EMBUTIDOS (discos-semente NitrOS-9 bootáveis) — um por geometria que o NitrOS-9
// distribui para CoCo. Em produção ficam em <resources>/os9seed (electron-builder extraResources);
// em dev ficam em <projeto>/resources/os9seed. Geometrias sem gabarito livre (158K/35T e 180K/40s)
// caem no seletor manual de referência. Devolve o caminho do .os9 ou null se não existir.
const OS9_SEED_FILES: Record<string, string> = { '360k': 'seed_360k.os9', '720k': 'seed_720k.os9' };
function os9SeedPath(geomKey: string): string | null {
  const file = OS9_SEED_FILES[geomKey];
  if (!file) return null;
  const dirs = app.isPackaged
    ? [path.join(process.resourcesPath, 'os9seed')]
    : [path.join(process.cwd(), 'resources', 'os9seed'), path.join(app.getAppPath(), 'resources', 'os9seed')];
  for (const d of dirs) {
    const p = path.join(d, file);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Reads a whole file into memory in chunks, emitting an `image-progress` event per chunk so
// the renderer can show a real progress bar for large container images.
function readFileWithProgress(filePath: string, total: number, phase: string): Buffer {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(total);
    const CHUNK = 16 * 1024 * 1024;
    let pos = 0;
    while (pos < total) {
      const n = fs.readSync(fd, buf, pos, Math.min(CHUNK, total - pos), pos);
      if (n <= 0) break;
      pos += n;
      mainWindow?.webContents.send('image-progress', { phase, loaded: pos, total });
    }
    return buf;
  } finally { fs.closeSync(fd); }
}

// Resolve o ícone do app (resources/icon.png). Prod: <resources>/icon.png via extraResources;
// dev: <projeto>/resources/icon.png. Devolve um nativeImage (vazio se não achar).
function appIcon(): Electron.NativeImage {
  const dirs = app.isPackaged
    ? [path.join(process.resourcesPath, 'icon.png')]
    : [path.join(process.cwd(), 'resources', 'icon.png'), path.join(app.getAppPath(), 'resources', 'icon.png')];
  for (const p of dirs) { if (fs.existsSync(p)) return nativeImage.createFromPath(p); }
  return nativeImage.createEmpty();
}

function createWindow() {
  // Remove o menu padrão do Electron (File/Edit/View/Window/Help) — o app tem sua própria UI.
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: appIcon(), // ícone da barra de título / barra de tarefas (substitui o padrão do Electron)
    autoHideMenuBar: true, // sem barra de menu (nem ao pressionar Alt)
    title: 'CoCo File Image Utility (CoCoFIU)',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Permite que o iframe do XRoar (file:// em produção) faça fetch() das ROMs e
      // carregue xroar.wasm. App desktop local — sem conteúdo remoto.
      webSecurity: false
    }
  });

  // Determine standard load URL/File
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // K4 — permite captura de áudio (line-in/microfone) para gravar fita real na aba K7. App local/confiável.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(true));

  // Sem o menu padrão, os atalhos de DevTools sumiriam — registramos F12 / Ctrl+Shift+I à mão.
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key?.toLowerCase();
    if (k === 'f12' || (input.control && input.shift && k === 'i')) mainWindow?.webContents.toggleDevTools();
  });

  mainWindow.once('ready-to-show', () => {
    // Não mostra já: espera a splash (5 s) terminar. finishSplash() maximiza + mostra quando ambos prontos.
    mainReady = true;
    finishSplash();
    // DevTools NÃO abre automaticamente; abra manualmente com F12 / Ctrl+Shift+I.
  });

  // Botão X da janela: usa o MESMO modal de "Sair" do app (confirma + avisa sobre salvar).
  // Cancela o fechamento nativo e pede ao renderer para abrir o modal; só fecha após confirmação.
  mainWindow.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    mainWindow?.webContents.send('app-close-request');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createSplash();   // splash por 5 s (barra de progresso) antes de mostrar a janela principal
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Confirmação vinda do modal de "Sair": libera o fechamento e fecha a janela de verdade.
ipcMain.handle('app-close-confirmed', () => {
  allowClose = true;
  mainWindow?.close();
});

// --- IPC Channel Handlers ---

// 1. Select and read any file
ipcMain.handle('select-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Color Computer Files', extensions: ['cas', 'dsk', 'bin', 'ccc', 'hex'] },
      { name: 'BASIC Text (.bas/.txt)', extensions: ['bas', 'txt'] },
      { name: 'Cassette Files', extensions: ['cas'] },
      { name: 'RS-DOS Disk Images', extensions: ['dsk'] },
      { name: 'Binary Payloads', extensions: ['bin', 'hex'] },
      { name: 'Cartridge Images', extensions: ['ccc', 'bin'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  return {
    filePath,
    fileName: path.basename(filePath),
    fileExt: ext,
    size: fileBuffer.length,
    buffer: fileBuffer // Electron IPC automatically handles Buffers as Uint8Arrays
  };
});

// 2. Parse DSK directory entries
ipcMain.handle('read-dsk-directory', async (_, dskUint8Array: Uint8Array) => {
  try {
    const buffer = Buffer.from(dskUint8Array);
    // Dragon DOS / VDK images are read in a distinct format (directory on track 20, sector
    // bitmap). Detect them first; otherwise fall back to the standard RS-DOS parser.
    const dragon = readDragonDirectory(buffer);
    if (dragon) return dragon;
    // OS-9 ANTES do RS-DOS: um disco OS-9 também passa em isRsDosDisk (ambiguidade comprovada). Sem
    // isto, um .dsk OS-9 (ex.: dentro do CoCoSDC) seria lido como RS-DOS e mostraria lixo.
    if (isOs9DiskStrict(buffer, 0)) return { success: false, error: 'OS-9', os9: true };
    // rsdos: FAT válida? Distingue um RS-DOS de verdade (mesmo com "arte" no DIR) de um disco
    // não-RS-DOS (dupla-face / JVC / lixo), que deve aparecer como "não suportado".
    const rsdos = isRsDosDisk(buffer);
    const parsed = parseDsk(buffer);
    // hasArt: o disco tem nomes não-padrão (semigráficos/"arte no DIR"). O renderer LISTA e EXTRAI
    // normalmente, mas marca somente-leitura e bloqueia edições (round-trip de escrita ainda não validado).
    const hasArt = parsed.files.some(f => f.hasGraphics);
    return { success: true, format: 'rsdos', files: parsed.files, freeGranules: parsed.freeGranules, totalGranules: parsed.totalGranules, hasArt, rsdos };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2b2. Normaliza bytes de imagem vindos do renderer (ex.: arrastar-e-soltar): se for DMK
// (imagem de trilha), decodifica para imagem RAW de setores; se for JVC (.dsk com CABEÇALHO de
// 1–5 bytes), remove o cabeçalho; senão devolve igual. Idempotente.
// JVC (C8): o cabeçalho tem tamanho = (arquivo mod 256). Bytes: [0]=setores/trilha [1]=lados
// [2]=tamanho-de-setor(código) [3]=1º ID [4]=flag. Um .dsk RAW é sempre múltiplo de 256 → mod 256 = 0
// (sem cabeçalho). Se o resto for 1..5, é um cabeçalho JVC → removemos para alinhar os setores.
ipcMain.handle('normalize-image', async (_, bytes: Uint8Array) => {
  try {
    let buf = Buffer.from(bytes);
    if (isDmk(buf)) { const { raw, geom } = dmkToRaw(buf); return { success: true, isDmk: true, image: new Uint8Array(raw), geom }; }
    const headerLen = buf.length % 256;
    if (headerLen >= 1 && headerLen <= 5 && buf.length - headerLen >= 256) {
      const sectorsPerTrack = buf[0] || 18, sides = headerLen >= 2 ? (buf[1] || 1) : 1;
      buf = buf.subarray(headerLen);
      return { success: true, isDmk: false, jvc: true, jvcHeaderLen: headerLen, jvcSectors: sectorsPerTrack, jvcSides: sides, image: new Uint8Array(buf) };
    }
    return { success: true, isDmk: false, image: bytes };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 2b3. Escolhe um arquivo .dsk (35T RS-DOS) para INSERIR num slot vazio da MiniIDE. Devolve os bytes
// crus + valida que é um disco RS-DOS de 35 trilhas (161.280 B) — o único que cabe no slot doubled.
ipcMain.handle('pick-disk-image', async () => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Inserir imagem de disco (.dsk 35 trilhas RS-DOS)',
    properties: ['openFile'],
    filters: [{ name: 'Disco RS-DOS 35T', extensions: ['dsk'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePaths.length) return { cancelled: true };
  try {
    const data = fs.readFileSync(result.filePaths[0]);
    const ok = data.length === 161280 && isRsDosDisk(data);
    return { success: true, name: path.basename(result.filePaths[0]), data: new Uint8Array(data), valid35tRsdos: ok, size: data.length };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2c. Formata uma imagem RS-DOS (apaga dados). 'quick' = só FAT+diretório; 'full' = imagem toda (0xFF).
// Retorna o buffer formatado; o renderer aplica e salva pelo fluxo normal (em MiniIDE, preserva o
// nome SIDEKICK restaurando o setor LSN 322 antes de salvar).
ipcMain.handle('dsk-format', async (_, dskUint8Array: Uint8Array, mode: 'quick' | 'full') => {
  try {
    const out = formatRsDosDisk(Buffer.from(dskUint8Array), mode === 'full' ? 'full' : 'quick');
    return { success: true, image: new Uint8Array(out) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2d. Grava/renomeia o NOME do drive SIDEKICK numa imagem RS-DOS de-doubled (LSN 322). Retorna o buffer.
ipcMain.handle('dsk-set-sidekick-name', async (_, dskUint8Array: Uint8Array, name: string) => {
  try {
    const out = writeSidekickName(Buffer.from(dskUint8Array), String(name || ''));
    return { success: true, image: new Uint8Array(out) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2b. Extract the RAW stored bytes of a .dsk file (for copy/cut between images)
ipcMain.handle('dsk-extract-raw', async (_, dskUint8Array: Uint8Array, entry: any) => {
  try {
    const buf = Buffer.from(dskUint8Array);
    const raw = entry?.format === 'dragon'
      ? extractDragonFile(stripVdk(buf), entry)
      : extractDskFile(buf, entry as DskFileEntry);
    return { success: true, data: new Uint8Array(raw) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2b1b. W3 — disco → fita: extrai o arquivo selecionado de um painel e o EMPACOTA num .CAS tocável
// (namefile + data blocks + EOF). ML (tipo 2): o conteúdo no disco é um LOADM → o parseBin recupera
// load/exec e a imagem de memória crua (o que a fita realmente carrega). BASIC/Data (0/1/3): bytes crus,
// preservando o asciiFlag do diretório. A K7 carrega o resultado pelo pipeline normal (.cas → WAV).
ipcMain.handle('dsk-file-to-cas', async (_, dskUint8Array: Uint8Array, entry: any) => {
  try {
    const buf = Buffer.from(dskUint8Array);
    const raw = entry?.format === 'dragon'
      ? extractDragonFile(stripVdk(buf), entry)
      : extractDskFile(buf, entry as DskFileEntry);
    const name = (entry?.name || 'FILE').toString();
    const ftype = entry?.fileType ?? 2;
    let cas: Buffer;
    if (ftype === 2) {
      let loadAddr = 0x1000, execAddr = 0x1000, payload: Buffer = Buffer.from(raw);
      try { const p = parseBin(Buffer.from(raw)); loadAddr = p.loadAddr; execAddr = p.execAddr; payload = Buffer.from(p.payload); }
      catch { /* não é LOADM válido → grava cru */ }
      cas = encodeCas([{ name, fileType: 2, asciiFlag: 0, loadAddr, execAddr, payload }]);
    } else {
      cas = encodeCas([{ name, fileType: ftype, asciiFlag: entry?.asciiFlag ?? 0, loadAddr: 0, execAddr: 0, payload: Buffer.from(raw) }]);
    }
    return { success: true, data: new Uint8Array(cas), name, fileType: ftype };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2b1c. W5 — FIXCAS: valida/repara um .CAS (recalcula checksums, refaz leader/sync, garante EOF).
ipcMain.handle('cas-fix', async (_, casBytes: Uint8Array) => {
  try {
    const { output, report } = fixCas(Buffer.from(casBytes));
    return { success: true, data: new Uint8Array(output), report };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2b1d. B6/B7 — extrai o 1º programa BASIC de um .CAS DIGITAL (parseCas, sem FSK): devolve o payload
// tokenizado/ASCII + nome + flag, p/ o editor BASIC abrir e detokenizar. (Para .cas vindo de áudio,
// a aba K7 já faz o decode FSK e o "Abrir no BASIC".)
ipcMain.handle('cas-extract-basic', async (_, casBytes: Uint8Array) => {
  try {
    const parsed = parseCas(Buffer.from(casBytes));
    if (!parsed.files.length) return { success: true, found: false, error: 'no-blocks' };
    const basic = parsed.files.find(f => f.fileType === 0) || parsed.files[0];
    return {
      success: true, found: basic.fileType === 0, data: new Uint8Array(basic.payload),
      name: basic.name, asciiFlag: basic.asciiFlag, fileType: basic.fileType, fileTypeName: basic.fileTypeName,
      count: parsed.files.length,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2b2. Native drag-OUT: extract the selected file to a temp path and start an OS drag so the user can
// drop it into Explorer. Uses ipcMain.on (fire-and-forget) because startDrag takes over the gesture.
// Electron REQUIRES a non-empty icon (else startDrag throws). We build one from a raw bitmap (always
// valid), falling back from a tiny PNG — a bad/empty icon was the silent cause of "drag does nothing".
function makeDragIcon() {
  let img = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR42mNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFAwAAB0+AAFr0pK3AAAAAElFTkSuQmCC'
  );
  if (!img || img.isEmpty()) {
    const s = 32, bmp = Buffer.alloc(s * s * 4);
    for (let i = 0; i < s * s; i++) { bmp[i * 4] = 0x3f; bmp[i * 4 + 1] = 0xcf; bmp[i * 4 + 2] = 0x3f; bmp[i * 4 + 3] = 0xff; }
    img = nativeImage.createFromBitmap(bmp, { width: s, height: s });
  }
  return img;
}
let DRAG_ICON: Electron.NativeImage | null = null;
ipcMain.on('start-file-drag', (event, dskUint8Array: Uint8Array, entry: any, fileName: string) => {
  try {
    if (!DRAG_ICON) DRAG_ICON = makeDragIcon();
    const buf = Buffer.from(dskUint8Array);
    const raw = entry?.format === 'dragon'
      ? extractDragonFile(stripVdk(buf), entry)
      : extractDskFile(buf, entry as DskFileEntry);
    const safe = (fileName || 'FILE.BIN').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'FILE.BIN';
    const dir = path.join(app.getPath('temp'), 'ccc-dragout');
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, safe);
    fs.writeFileSync(tmp, Buffer.from(raw));
    event.sender.startDrag({ file: tmp, icon: DRAG_ICON });
  } catch (error: any) {
    // startDrag falhando não pode derrubar o app; mostra o motivo no console de diagnóstico.
    const msg = error?.message || String(error);
    console.error('start-file-drag error:', msg);
    mainWindow?.webContents.send('drag-error', msg);
  }
});

// 2b3. Native drag-OUT de um ARQUIVO OS-9 → extrai p/ um temp e inicia o drag do SO (soltar no Explorer).
// Origem editável (buf) ou somente-leitura (filePath+base, ex.: partição de container). Fire-and-forget.
ipcMain.on('start-os9-file-drag', (event, opts: { buf?: Uint8Array; filePath?: string; base?: number; fdLsn: number; name: string }) => {
  try {
    if (!DRAG_ICON) DRAG_ICON = makeDragIcon();
    const base = opts?.base ?? 0;
    const src = opts?.buf ? Buffer.from(opts.buf) : (opts?.filePath ? fs.readFileSync(opts.filePath) : null);
    if (!src) throw new Error('Sem origem para o arquivo OS-9.');
    const data = readFileData(src, readFD(src, opts.fdLsn, base), base);
    const safe = (opts?.name || 'FILE').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'FILE';
    const dir = path.join(app.getPath('temp'), 'ccc-dragout');
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, safe);
    fs.writeFileSync(tmp, Buffer.from(data));
    event.sender.startDrag({ file: tmp, icon: DRAG_ICON });
  } catch (error: any) {
    console.error('start-os9-file-drag error:', error?.message || error);
    mainWindow?.webContents.send('drag-error', error?.message || String(error));
  }
});

// 2c. Add raw bytes as a file into a .dsk image (paste / drop)
ipcMain.handle('dsk-add-bytes', async (_, dskUint8Array: Uint8Array, name: string, ext: string, fileType: number, asciiFlag: number, dataUint8Array: Uint8Array) => {
  try {
    const buf = Buffer.from(dskUint8Array);
    const img = looksDragon(buf)
      ? addDragonFile(buf, name, ext, Buffer.from(dataUint8Array))
      : addDskFile(buf, name, ext, fileType, asciiFlag, Buffer.from(dataUint8Array));
    return { success: true, image: new Uint8Array(img) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2c2. Defragment a single file in place (relocate to a contiguous free run)
ipcMain.handle('dsk-defrag-file', async (_, dskUint8Array: Uint8Array, entry: DskFileEntry) => {
  try {
    const img = defragFileInPlace(Buffer.from(dskUint8Array), entry);
    return { success: true, image: new Uint8Array(img) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
// Desfragmenta o disco INTEIRO por reconstrução (build-fresh, 100% contíguo). Só RS-DOS padrão.
ipcMain.handle('dsk-defrag-disk', async (_, dskUint8Array: Uint8Array, order: 'dir' | 'alpha' | 'size') => {
  try {
    const r = defragDiskRebuild(Buffer.from(dskUint8Array), order || 'dir');
    return r.success ? { success: true, image: new Uint8Array(r.image!) } : { success: false, error: r.error };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2d. Create a fresh blank RS-DOS .dsk image. tracks: 35 (standard DECB) or 40 (JDOS/CODIMEX).
ipcMain.handle('dsk-new-blank', async (_, tracks?: number) => {
  try {
    const img = encodeDsk([], tracks === 40 ? 40 : 35);
    return { success: true, image: new Uint8Array(img) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2d2. Create a fresh blank Dragon DOS image (40-track single-sided, raw)
ipcMain.handle('dsk-new-blank-dragon', async () => {
  try {
    const img = encodeDragonBlank();
    return { success: true, image: new Uint8Array(img) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2d3. Build a Dragon DOS binary from a CoCo program (load/exec + payload). mode: 'direct'|'reloc'.
ipcMain.handle('build-dragon-bin', async (_, loadAddr: number, execAddr: number, payload: Uint8Array, mode: 'direct' | 'reloc') => {
  try {
    const m = mode || recommendDragonMode(loadAddr);
    const bin = cocoToDragonBin(loadAddr, execAddr, Buffer.from(payload), m);
    return { success: true, data: new Uint8Array(bin), mode: m };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2e. Pick a .bin/.bas file (dialog) and return its bytes + inferred type (no add yet)
ipcMain.handle('pick-coco-file', async () => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select .BIN / .BAS / .CAS file',
    properties: ['openFile'],
    filters: [{ name: 'CoCo Files', extensions: ['bin', 'bas', 'cas'] }, { name: 'All Files', extensions: ['*'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false, cancelled: true };
  try {
    const fp = result.filePaths[0];
    const data = fs.readFileSync(fp);
    const ext = (path.extname(fp).slice(1).toLowerCase() || 'bin');
    const base = path.basename(fp, path.extname(fp));
    const fileType = ext === 'bas' ? 0 : 2;
    return { success: true, name: base, ext, fileType, asciiFlag: 0, data: new Uint8Array(data) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2g. Pick the Greaseweazle host-tools executable (gw / gw.exe) and return its full path.
ipcMain.handle('gw-pick-exe', async () => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar executável do Greaseweazle (gw)',
    properties: ['openFile'],
    filters: process.platform === 'win32'
      ? [{ name: 'Greaseweazle (gw.exe)', extensions: ['exe'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'All Files', extensions: ['*'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false, cancelled: true };
  return { success: true, path: result.filePaths[0] };
});

// 3. Extract DSK program and parse details
ipcMain.handle('extract-dsk-program', async (_, dskUint8Array: Uint8Array, fileEntry: any) => {
  try {
    const dskBuffer = Buffer.from(dskUint8Array);
    const rawFileContent = fileEntry?.format === 'dragon'
      ? extractDragonFile(stripVdk(dskBuffer), fileEntry)
      : extractDskFile(dskBuffer, fileEntry as DskFileEntry);
    
    // Attempt to parse segment block properties if it is a machine code payload
    let loadAddr = 0x1000;
    let execAddr = 0x1000;
    let payload = rawFileContent;
    let gapBytes = 0;

    if (fileEntry.fileType === 2) {
      try {
        const binParsed = parseBin(rawFileContent);
        loadAddr = binParsed.loadAddr;
        execAddr = binParsed.execAddr;
        payload = binParsed.payload;
        gapBytes = binParsed.gapBytes;
      } catch (err) {
        console.warn('Extracted file claimed machine type but BIN parser failed, loading raw.', err);
      }
    }

    return {
      success: true,
      loadAddr,
      execAddr,
      payload: new Uint8Array(payload),
      gapBytes,
      rawExtractedSize: rawFileContent.length
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 3b. Add a .bin/.bas file (chosen via dialog) into a .dsk image
ipcMain.handle('dsk-add-file', async (_, dskUint8Array: Uint8Array) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add file to .DSK',
    properties: ['openFile'],
    filters: [
      { name: 'CoCo Files', extensions: ['bin', 'bas'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false, cancelled: true };
  try {
    const fp = result.filePaths[0];
    const data = fs.readFileSync(fp);
    const ext = path.extname(fp).slice(1).toLowerCase() || 'bin';
    const base = path.basename(fp, path.extname(fp));
    const fileType = ext === 'bas' ? 0 : 2; // .bas = BASIC, .bin = machine code
    const img = addDskFile(Buffer.from(dskUint8Array), base, ext, fileType, 0, data);
    return { success: true, image: new Uint8Array(img), addedName: `${base}.${ext}`.toUpperCase() };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 3c. Delete a file from a .dsk image
ipcMain.handle('dsk-delete-file', async (_, dskUint8Array: Uint8Array, entry: any) => {
  try {
    const buf = Buffer.from(dskUint8Array);
    const img = (looksDragon(buf) || entry?.format === 'dragon')
      ? deleteDragonFile(buf, entry)
      : deleteDskFile(buf, entry as DskFileEntry);
    return { success: true, image: new Uint8Array(img) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2d. Renomeia um arquivo numa imagem RS-DOS ou Dragon (só os campos nome/extensão da entrada de diretório).
ipcMain.handle('dsk-rename-file', async (_, dskUint8Array: Uint8Array, entry: any, newName: string, newExt: string) => {
  try {
    const buf = Buffer.from(dskUint8Array);
    const img = (looksDragon(buf) || entry?.format === 'dragon')
      ? renameDragonFile(buf, entry, String(newName), String(newExt))
      : renameDskFile(buf, entry as DskFileEntry, String(newName), String(newExt));
    return { success: true, image: new Uint8Array(img) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 3c1. Decide if a buffer is a real multi-disk container vs a single disk in an oversized
// slot. A multiple of stdDisk is only a container if BOTH the first two slices are valid
// RS-DOS disks; otherwise it is a single image (e.g. a 2x double-sized HDBDOS/OS-9 slot).
ipcMain.handle('dsk-detect-container', async (_, dskUint8Array: Uint8Array, stdDisk: number) => {
  try {
    const buf = Buffer.from(dskUint8Array);
    if (buf.length === 0 || !stdDisk || buf.length % stdDisk !== 0) return { count: 1 };
    const n = buf.length / stdDisk;
    if (n < 2) return { count: 1 };
    const slice0Valid = isRsDosDisk(buf.subarray(0, stdDisk));
    const slice1Valid = isRsDosDisk(buf.subarray(stdDisk, 2 * stdDisk));
    return { count: slice0Valid && slice1Valid ? n : 1, slice0Valid, slice1Valid };
  } catch (error: any) {
    return { count: 1, error: error.message };
  }
});

// 3c0z. Pick a media file for the embedded XRoar emulator. kind='tape' → só formatos de FITA (K7).
ipcMain.handle('xroar-pick-file', async (_, kind?: string) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const filters = kind === 'tape'
    ? [
        { name: 'Fita K7 (.wav/.cas/.voc/.c10)', extensions: ['wav', 'cas', 'voc', 'c10'] },
        { name: 'All Files', extensions: ['*'] },
      ]
    : kind === 'disk'
    ? [
        { name: 'Disco (.dsk/.vdk/.jvc/.dmk/.os9)', extensions: ['dsk', 'vdk', 'jvc', 'dmk', 'os9'] },
        { name: 'All Files', extensions: ['*'] },
      ]
    : kind === 'program'
    ? [
        { name: 'Programa (.bin/.rom/.ccc/.pak/.hex/.sna)', extensions: ['bin', 'rom', 'ccc', 'pak', 'hex', 'sna'] },
        { name: 'All Files', extensions: ['*'] },
      ]
    : [
        { name: 'CoCo/Dragon', extensions: ['dsk', 'vdk', 'jvc', 'dmk', 'os9', 'cas', 'wav', 'bin', 'rom', 'ccc', 'sna', 'asc', 'bas'] },
        { name: 'All Files', extensions: ['*'] },
      ];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: kind === 'tape' ? 'Abrir fita K7 no XRoar' : 'Abrir no XRoar',
    properties: ['openFile'],
    filters,
  });
  if (result.canceled || !result.filePaths.length) return { cancelled: true };
  const fp = result.filePaths[0];
  try {
    const data = fs.readFileSync(fp);
    return { success: true, name: path.basename(fp), ext: path.extname(fp).slice(1).toLowerCase(), data: new Uint8Array(data) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// R4 — abre VÁRIOS .wav (capturas da mesma fita) para a fusão "RAID".
ipcMain.handle('pick-wav-files', async () => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir capturas WAV da MESMA fita (várias) para fundir',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Captura de fita (.wav)', extensions: ['wav'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePaths.length) return { cancelled: true };
  try {
    const files = result.filePaths.map(fp => ({ name: path.basename(fp), data: new Uint8Array(fs.readFileSync(fp)) }));
    return { success: true, files };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z2. K7 — decodifica um WAV de fita (FSK) com parâmetros ajustáveis (K8) → blocos/arquivos CAS.
ipcMain.handle('k7-decode', async (_, wavBytes: Uint8Array, opts: any) => {
  try {
    // GAP-AWARE: recupera o programa INTEIRO de fitas com tela/loader (segmenta pelas pausas e
    // concatena os blocos), descartando o ruído entre segmentos.
    const r = decodeCasTapeGapAware(Buffer.from(wavBytes), opts || {});
    return {
      success: true, sampleRate: r.sampleRate, durationSec: r.durationSec, foundSync: r.foundSync,
      segments: r.segments, multi: r.multi, bitCount: r.payload.length * 8, byteCount: r.payload.length,
      blockCount: r.blocks.length, files: r.files,
    };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// R3 — DIAGNÓSTICO: histograma de períodos + mapa de blocos bom/ruim por segmento + limiar Otsu detectado.
ipcMain.handle('tape-diagnostics', async (_, wavBytes: Uint8Array, opts: any) => {
  try { return { success: true, diag: tapeDiagnostics(Buffer.from(wavBytes), opts || {}) }; }
  catch (error: any) { return { success: false, error: error.message }; }
});
// R3 — re-decodifica uma REGIÃO (intervalo em segundos) com os parâmetros atuais.
ipcMain.handle('tape-decode-region', async (_, wavBytes: Uint8Array, startSec: number, endSec: number, opts: any) => {
  try { return { success: true, ...decodeRegion(Buffer.from(wavBytes), startSec, endSec, opts || {}) }; }
  catch (error: any) { return { success: false, error: error.message }; }
});
// R4 — FUSÃO de N capturas da mesma fita → reemite um WAV LIMPO (tempo real) e um .CAS do resultado fundido.
ipcMain.handle('tape-merge-captures', async (_, buffers: Uint8Array[], opts: any) => {
  try {
    const m = mergeCaptures((buffers || []).map(b => Buffer.from(b)), opts || {});
    if (!m.foundSync || !m.blocks.length) return { success: false, error: 'Nenhuma captura decodificável para fundir.' };
    const wav = buildCleanWav([m.blocks], [], 22050);            // WAV tempo-real do resultado fundido
    return { success: true, wav: new Uint8Array(wav), perCapture: m.perCapture, baseIndex: m.baseIndex, mergedGood: m.mergedGood, bestSingleGood: m.bestSingleGood, payloadLen: m.payload.length };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// Reescreve, IN PLACE, os 8 bytes de NOME da 1ª namefile (bloco tipo 0) dos segmentos decodificados —
// usado pelo campo editável de nome de fita da K7. O buildFaithfulCas recalcula o checksum depois.
function applyTapeName(segs: Array<Array<{ type: number; data: number[] }>>, name?: string): void {
  if (!name) return;
  const clean = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8).padEnd(8, ' ');
  for (const seg of segs) {
    for (const b of seg) {
      if (b.type === 0x00 && b.data.length >= 8) { for (let i = 0; i < 8; i++) b.data[i] = clean.charCodeAt(i); return; }
    }
  }
}

// 3c0z3. K10 — Normalizar/Remaster: re-decodifica o WAV e reemite um arquivo LIMPO (.cas/.wav) menor.
ipcMain.handle('k7-export-clean', async (_, wavBytes: Uint8Array, opts: any, format: string, sampleRate: number, defaultName: string, tapeName?: string) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  try {
    const r = decodeCasTapeGapAware(Buffer.from(wavBytes), opts || {});
    if (!r.foundSync || !r.segs.length) return { success: false, error: 'Não foi possível decodificar a fita (sem sync/blocos).' };
    applyTapeName(r.segs as any, tapeName);
    const cas = buildFaithfulCas(r.segs);
    // WAV: fita de ARQUIVO ÚNICO (padrão) → estrutura de ÉPOCA (silêncio inicial · leader+namefile · GAP do
    // namefile · dados contínuos · silêncio final), igual às fitas reais → carrega em tempo normal e grava
    // em K7 física. Fita MULTI-SEGMENTO (loader/tela) → buildCleanWav, que preserva os SILÊNCIOS reais
    // medidos entre os segmentos (o timing original do loader). O .cas continua contíguo (fast-load).
    let out: Buffer = cas;
    if (format === 'wav') {
      const f0 = r.files[0];
      if (r.files.length === 1 && f0) {
        out = buildEraTapeWav(tapeName || f0.name, r.payload, {
          sampleRate: sampleRate || 9600, ascii: f0.ascii, fileType: f0.ftype, loadAddr: f0.loadAddr, execAddr: f0.execAddr,
        });
      } else {
        out = buildCleanWav(r.segs, r.segTimes, sampleRate || 22050);
      }
    }
    const ext = format === 'wav' ? 'wav' : 'cas';
    const res = await dialog.showSaveDialog(mainWindow, {
      title: format === 'wav' ? 'Salvar WAV limpo (normalizado)' : 'Salvar CAS limpo (normalizado)',
      defaultPath: (defaultName || 'fita').replace(/\.[^.]+$/, '') + '_clean.' + ext,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, out);
    return { success: true, path: res.filePath, size: out.length, files: r.files.length };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z4. K7 — extrai os bytes de um arquivo decodificado da fita → salva no PC (.bas/.bin/.dat).
ipcMain.handle('k7-extract-file', async (_, wavBytes: Uint8Array, opts: any, fileIndex: number) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  try {
    const r = decodeCasTapeGapAware(Buffer.from(wavBytes), opts || {});
    const f = r.files[fileIndex || 0];
    if (!f) return { success: false, error: 'Arquivo não encontrado na fita.' };
    const data = Buffer.from(r.payload);
    const ext = f.ftype === 0 ? 'bas' : f.ftype === 2 ? 'bin' : 'dat';
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Extrair arquivo da fita', defaultPath: (f.name || 'FILE').replace(/[^A-Za-z0-9._-]/g, '_') + '.' + ext,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, data);
    return { success: true, path: res.filePath, size: data.length, name: f.name };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z5. K6 — devolve os BYTES de um arquivo decodificado (sem diálogo) → p/ abrir no editor BASIC.
ipcMain.handle('k7-file-bytes', async (_, wavBytes: Uint8Array, opts: any, fileIndex: number) => {
  try {
    const r = decodeCasTapeGapAware(Buffer.from(wavBytes), opts || {});
    const f = r.files[fileIndex || 0];
    if (!f) return { success: false, error: 'Arquivo não encontrado na fita.' };
    return { success: true, data: new Uint8Array(r.payload), name: f.name, ftype: f.ftype };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z5b. K2/UX — devolve o PROGRAMA (payload concatenado, gap-aware, SEM ruído) + o TEMPO (s) de
//   cada byte. O painel hexadecimal revela conforme o playhead passa pelos segmentos de dados da
//   fita (header → tela/loader → programa), pulando as pausas (hiss).
ipcMain.handle('k7-stream', async (_, wavBytes: Uint8Array, opts: any) => {
  try {
    const r = decodeCasTapeGapAware(Buffer.from(wavBytes), opts || {});
    return { success: true, data: new Uint8Array(r.payload), times: r.payloadTimes, durationSec: r.durationSec };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z5c. Extrair → CAS — devolve os BYTES de um .cas CANÔNICO (mesmo buildCleanCas do "→ CAS", que
//   abre no XRoar): namefile + data blocks (com leaders entre eles) + EOF. Evita o encodeCas, cujos
//   blocos colados (sem leader) o XRoar recusava em arquivos multi-bloco.
ipcMain.handle('k7-cas-bytes', async (_, wavBytes: Uint8Array, opts: any, tapeName?: string) => {
  try {
    const r = decodeCasTapeGapAware(Buffer.from(wavBytes), opts || {});
    if (!r.foundSync || !r.segs.length) return { success: false, error: 'Sem dados decodificáveis na fita.' };
    applyTapeName(r.segs as any, tapeName);
    return { success: true, data: new Uint8Array(buildFaithfulCas(r.segs)), name: r.files[0]?.name || 'FILE' };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z5d. PREVIEW de tamanhos (sem salvar) — p/ o painel mostrar em TEMPO REAL o tamanho final de
//   cada export conforme o usuário mexe nos ajustes (K8) e na taxa de kHz do WAV.
ipcMain.handle('k7-export-sizes', async (_, wavBytes: Uint8Array, opts: any, rate: number) => {
  try {
    const buf = Buffer.from(wavBytes);
    const r = decodeCasTapeGapAware(buf, opts || {});
    const cas = r.foundSync && r.segs.length ? buildFaithfulCas(r.segs) : Buffer.alloc(0);
    const wav = cas.length ? buildCleanWav(r.segs, r.segTimes, rate || 11025) : Buffer.alloc(0);
    const fullRate = Math.max(rate || 11025, 22050); // FSK 2400Hz exige >=22kHz, senão corrompe (I/O ERROR)
    const fullBytes = Math.round((r.durationSec || 0) * fullRate) + 44; // fita completa reamostrada (8-bit mono)
    return { success: true, casSize: cas.length, wavSize: wav.length, fullSize: fullBytes, programBytes: r.payload.length };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z5e. Fita completa REAMOSTRADA (8-bit mono na taxa escolhida) — encolhe mantendo todo o áudio.
ipcMain.handle('k7-resample-wav', async (_, wavBytes: Uint8Array, rate: number) => {
  try {
    return { success: true, data: new Uint8Array(resampleWav8(Buffer.from(wavBytes), rate || 11025)) };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z6. K5 — prepara um arquivo decodificado da fita p/ gravar num painel DSK (RS-DOS).
//   BASIC/Data: bytes crus (o stream tokenizado da fita É o conteúdo de disco).
//   ML (tipo 2): embrulha no formato segmentado RS-DOS [00][len:2BE][load:2BE][data][FF][0000][exec:2BE].
ipcMain.handle('k7-file-for-dsk', async (_, wavBytes: Uint8Array, opts: any, fileIndex: number) => {
  try {
    const r = decodeCasTapeGapAware(Buffer.from(wavBytes), opts || {});
    const f = r.files[fileIndex || 0];
    if (!f) return { success: false, error: 'Arquivo não encontrado na fita.' };
    const raw = Buffer.from(r.payload);
    let data = raw, ext = 'dat', fileType = 1;
    if (f.ftype === 0) { ext = 'bas'; fileType = 0; }
    else if (f.ftype === 2) {
      ext = 'bin'; fileType = 2;
      const load = f.loadAddr & 0xFFFF, exec = f.execAddr & 0xFFFF, len = raw.length & 0xFFFF;
      const seg = Buffer.alloc(5 + raw.length + 5);
      seg[0] = 0x00; seg.writeUInt16BE(len, 1); seg.writeUInt16BE(load, 3);
      raw.copy(seg, 5);
      const tail = 5 + raw.length;
      seg[tail] = 0xFF; seg[tail + 1] = 0x00; seg[tail + 2] = 0x00; seg.writeUInt16BE(exec, tail + 3);
      data = seg;
    }
    const asciiFlag = f.ascii ? 0xFF : 0x00;
    const name = (f.name || 'TAPEFILE').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'TAPEFILE';
    return { success: true, data: new Uint8Array(data), name, ext, fileType, asciiFlag, ftypeName: f.ftypeName };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z7. K2 — converte um .cas/.c10 (stream de cassete) em WAV (FSK quadrada) para a aba K7
//   exibir como onda e decodificar pelo mesmo pipeline do WAV.
ipcMain.handle('k7-cas-to-wav', async (_, casBytes: Uint8Array, sampleRate: number) => {
  try {
    const wav = encodeCasToWav(Buffer.from(casBytes), sampleRate || 22050);
    return { success: true, data: new Uint8Array(wav) };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z8. Aba BASIC — gera o WAV de fita com ESTRUTURA DE ÉPOCA (mono 8-bit 9600 Hz, silêncios reais) a
//   partir do payload (tokenizado ou ASCII) já preparado no renderer. Para gravar em fita K7 física.
ipcMain.handle('build-basic-tape-wav', async (_, name: string, payload: Uint8Array, ascii: boolean, sampleRate?: number) => {
  try {
    const wav = buildEraTapeWav(name || 'PROGRAM', payload, { ascii: !!ascii, sampleRate: sampleRate || 9600 });
    return { success: true, data: new Uint8Array(wav) };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// ───────── LOADER SoftKristian → BIN/DSK sem loader (autostart) ─────────
// 3c0z8. Detecta o loader SoftKristian numa fita e devolve os endereços (tela/programa/exec) + avisos
//   de conflito de memória (pilha do DOS ~$7E00, RAM reservada $0600–$25FF). Ver loaderscan.ts.
ipcMain.handle('loader-scan', async (_, wavBytes: Uint8Array, opts: any) => {
  try {
    const pr = scanLoaders(Buffer.from(wavBytes), opts || {});
    if (!pr) return { success: true, detected: false, reason: 'no-sync' };
    return {
      success: true, detected: pr.detected,
      family: pr.family, familyName: pr.familyName, convertible: pr.convertible,
      confidence: pr.confidence, name: pr.name,
      telaLoad: pr.telaLoad, telaLen: pr.telaLen, hasScreen: pr.hasScreen,
      progLoad: pr.progLoad, progExec: pr.progExec, progLen: pr.progLen, progEnd: pr.progEnd,
      cloadmCalls: pr.cloadmCalls, parts: pr.parts, romCalls: pr.romCalls, notes: pr.notes,
      warnStack: pr.progEnd >= 0x7E00,                                // encosta na pilha do sistema
      warnDos: pr.progLoad > 0 && pr.progLoad < 0x2600 && pr.progEnd > 0x0600, // sobrepõe RAM reservada do DOS
    };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z9. Monta o BIN sem loader (tela + programa + stub-autostart + assinatura CDCU) com os endereços
//   confirmados/editados pelo usuário. Re-escaneia para obter os bytes de tela/programa.
ipcMain.handle('loader-build', async (_, wavBytes: Uint8Array, opts: any, params: any) => {
  try {
    const pr = scanSoftKristian(Buffer.from(wavBytes), opts || {});
    if (!pr || !pr.program.length) return { success: false, error: 'Loader não detectado nesta fita.' };
    const bin = buildNoLoaderBin({
      screen: pr.screen, screenLoad: params.screenLoad ?? pr.telaLoad,
      program: pr.program, progLoad: params.progLoad ?? pr.progLoad,
      origExec: params.progExec ?? pr.progExec,
      mode: params.mode === 'delay' ? 'delay' : 'key', trap: params.trap !== false,
    });
    const name = (params.name || pr.name || 'GAME').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'GAME';
    return { success: true, data: new Uint8Array(bin), name };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// Embrulha um programa ML puro (load/exec) num "segmento" CAS (namefile + data 255 + EOF) para gerar
// um WAV de TEMPO REAL via buildCleanWav (lead-in + leader longo). O .cas continua sendo fast-load;
// o .wav passa a carregar na leitura padrão (antes o encodeCasToWav quase sem timing falhava no header).
function mlProgramToSegs(name: string, load: number, exec: number, prog: Buffer): any[][] {
  const nm = (name || 'GAME').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8).padEnd(8, ' ');
  const nf: number[] = [];
  for (let i = 0; i < 8; i++) nf.push(nm.charCodeAt(i));
  nf.push(2, 0, 0, (exec >> 8) & 0xFF, exec & 0xFF, (load >> 8) & 0xFF, load & 0xFF); // ML, ascii=0, gap=0, exec, load
  const blocks: any[] = [{ type: 0, data: nf, checksumOk: true }];
  for (let i = 0; i < prog.length; i += 255) blocks.push({ type: 1, data: [...prog.subarray(i, Math.min(i + 255, prog.length))], checksumOk: true });
  blocks.push({ type: 0xFF, data: [], checksumOk: true });
  return [blocks];
}

// 3c0z10. VOLTA (round-trip): reconhece a assinatura CDCU num .bin/.dsk-file e recupera o PROGRAMA PURO
//   (sem tela/stub), reembrulhando em .CAS (ML, fast-load) e .WAV (tempo real) para reexportar.
ipcMain.handle('loader-strip', async (_, binBytes: Uint8Array, name: string) => {
  try {
    const buf = Buffer.from(binBytes);
    const info = readCdcuInfo(buf);
    if (!info) return { success: true, found: false };
    const st = stripToProgram(buf);
    if (!st) return { success: true, found: false };
    const safe = (name || 'GAME').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'GAME';
    const cas = encodeCas([{ name: safe, fileType: 2, asciiFlag: 0, loadAddr: st.load, execAddr: st.exec, payload: st.program }]);
    const wav = buildCleanWav(mlProgramToSegs(safe, st.load, st.exec, Buffer.from(st.program)), [], 22050); // .wav = tempo real
    return { success: true, found: true, name: safe, load: st.load, exec: st.exec, progLen: st.program.length, cas: new Uint8Array(cas), wav: new Uint8Array(wav) };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c0z11. VOLTA com diálogos: abre um .bin, reconhece o CDCU e salva o PROGRAMA PURO em .cas ou .wav.
ipcMain.handle('loader-revert', async () => {
  try {
    if (!mainWindow) return { success: false, error: 'Sem janela.' };
    const open = await dialog.showOpenDialog(mainWindow, {
      title: 'Reverter arquivo do app (CDCU) → programa puro', properties: ['openFile'],
      filters: [{ name: 'CoCo binary (.bin)', extensions: ['bin'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (open.canceled || !open.filePaths[0]) return { cancelled: true };
    const buf = fs.readFileSync(open.filePaths[0]);
    if (!readCdcuInfo(buf)) return { success: true, found: false };
    const st = stripToProgram(buf);
    if (!st) return { success: true, found: false };
    const base = path.basename(open.filePaths[0]).replace(/\.[^.]+$/, '');
    const safe = (base || 'GAME').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'GAME';
    const save = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar programa puro (.cas/.wav)', defaultPath: safe + '.cas',
      filters: [{ name: 'CoCo Cassette (.cas)', extensions: ['cas'] }, { name: 'WAV', extensions: ['wav'] }],
    });
    if (save.canceled || !save.filePath) return { cancelled: true };
    const isWav = /\.wav$/i.test(save.filePath);
    const out = isWav
      ? buildCleanWav(mlProgramToSegs(safe, st.load, st.exec, Buffer.from(st.program)), [], 22050) // .wav = tempo real
      : encodeCas([{ name: safe, fileType: 2, asciiFlag: 0, loadAddr: st.load, execAddr: st.exec, payload: st.program }]); // .cas = fast-load
    fs.writeFileSync(save.filePath, out);
    return { success: true, found: true, path: save.filePath, name: safe, load: st.load, exec: st.exec, progLen: st.program.length };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1b. Unified storage-image browser: pick an image, detect its kind, list its disks/files.
ipcMain.handle('image-analyze', async (_, argPath?: string) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  let filePath: string;
  if (argPath) {
    filePath = argPath; // RECARREGAR: re-analisa o MESMO caminho, sem diálogo
  } else {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Abrir imagem (MiniIDE / CoCoSDC / OS-9 / .dsk / .vdk)',
      properties: ['openFile'],
      filters: [
        { name: 'Imagens de armazenamento', extensions: ['img', 'dsk', 'os9', 'vdk', 'jvc', 'dmk', 'sdf', 'ima', 'bin', 'raw', 'vhd'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return { cancelled: true };
    filePath = result.filePaths[0];
  }
  const fileName = path.basename(filePath);
  try {
    const stat = fs.statSync(filePath);

    // 1) FAT (CoCoSDC) — random-access reads, works even on multi-GB images.
    const fd = fs.openSync(filePath, 'r');
    const reader: Reader = (off, len) => { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, off); return b; };
    try {
      const vol = readFatVolume(reader);
      if (vol) {
        mainWindow?.webContents.send('image-progress', { phase: 'fat', loaded: 0, total: 0 });
        const files = listFatFiles(reader, vol, ['dsk'])
          .filter(f => !f.name.startsWith('._') && f.size >= 4608); // skip macOS AppleDouble junk
        const entries = files.map((f, i) => ({
          id: i, label: f.name, info: `${(f.size / 1024).toFixed(0)} KB`, sub: f.path,
          locator: { kind: 'fat', cluster: f.firstCluster, size: f.size, path: f.path },
        }));
        return { success: true, kind: 'cocosdc', filePath, fileName, fatType: vol.type, entries };
      }
    } finally { fs.closeSync(fd); }

    // 1b) Plain DriveWire container: N×161,280 STANDARD RS-DOS disks concatenated.
    // MUST be checked BEFORE the MiniIDE scan — a DriveWire container is also a multiple of
    // 161,280 and the doubled-disk probe false-positives on it, which then de-doubles every
    // disk wrongly (directory survives, data granules misalign → files read as 1 blank granule).
    // Discriminator: in a DriveWire container the first 161,280-byte slice IS a valid standard
    // RS-DOS disk (FAT at track 17 sector 2); in a sector-doubled MiniIDE image it is NOT.
    {
      const STD = 161280;
      if (stat.size % STD === 0 && stat.size / STD >= 2) {
        const fdc = fs.openSync(filePath, 'r');
        try {
          const probe = Buffer.alloc(STD * 2);
          fs.readSync(fdc, probe, 0, STD * 2, 0);
          if (isRsDosDisk(probe.subarray(0, STD)) && isRsDosDisk(probe.subarray(STD, STD * 2))) {
            return { success: true, kind: 'dsk', filePath, fileName, entries: [] };
          }
        } finally { fs.closeSync(fdc); }
      }
    }

    // 2) MiniIDE / HDBDOS — needs a full scan; cap the size so we never slurp a multi-GB image.
    if (stat.size <= 800 * 1024 * 1024) {
      // DMK (track-level) → decode to a raw sector image so the OS-9/RS-DOS detectors below see it.
      const buf = normalizeDiskImage(readFileWithProgress(filePath, stat.size, 'read'));
      const disks = scanMiniIdeImage(buf, (loaded, total) =>
        mainWindow?.webContents.send('image-progress', { phase: 'scan', loaded, total }));
      // An OS-9/NitrOS-9 partition lives RAW at offset 0 in MiniIDE and CoCoSDC.VHD images (proven by
      // re-analysis). Detect it with the STRICT check (a plain OS-9 disk also passes isRsDosDisk, so
      // this must precede the RS-DOS path). For MiniIDE we still surface the RS-DOS disks, just flag
      // that an OS-9 partition is also present so the UI can offer to browse it.
      const os9Here = isOs9DiskStrict(buf, 0, buf.length);
      const os9Volume = os9Here ? parseIdent(buf, 0).name.trim() : '';
      const occupied = disks.filter(d => d.state === 'occupied');
      if (occupied.length >= 2) {
        // UMA entry por SLOT FÍSICO (000–255): ocupado, vazio ou não-RS-DOS. id == slot (contíguo) →
        // a régua percorre todos os 256 como no SIDEKICK e os vazios ficam visíveis p/ formatar/inserir.
        const entries = disks.map(d => ({
          id: d.slot, slot: d.slot, state: d.state, label: d.label,
          name: d.name ?? null,   // NOME do drive SIDEKICK (LSN 322) — usado no rótulo "DISCO (nome)" do painel
          info: d.state === 'occupied' ? `${d.fileCount} arq · ${d.freeGranules} livres`
              : d.state === 'empty' ? 'slot vazio — disponível p/ formatar/inserir' : 'não-RS-DOS (sobra/lixo)',
          sub: d.state === 'occupied' ? (d.name ? d.filePreview : '') : '',
          graphicsArt: d.graphicsArt,
          locator: { kind: 'miniide', offset: d.offset },
        }));
        // "suspect" (mapeamento de setores diferente, ex.: VHD do CoCoSDC-no-VCC): com discos de ARTE já
        // reconhecidos, o sinal é a ausência de QUALQUER nome legível entre os OCUPADOS.
        const garbled = occupied.filter(d => !d.name && d.graphicsArt && !d.filePreview).length;
        const suspect = occupied.length > 0 && garbled / occupied.length > 0.5;
        return { success: true, kind: 'miniide', filePath, fileName, entries, suspect, os9Base: os9Here ? 0 : null, os9Volume, occupiedCount: occupied.length };
      }
      // No RS-DOS disk grid, but offset 0 IS an OS-9 partition (e.g. CoCoSDC.VHD, or a loose .os9/.dsk).
      if (os9Here) {
        // STANDALONE = o filesystem OS-9 preenche o arquivo (disco solto) → abre EDITÁVEL em memória.
        // Senão é uma PARTIÇÃO de container (VHD/IMG) → somente-leitura (edição via "Habilitar edição"/O5).
        const oid = parseIdent(buf, 0);
        // Use the (normalised) buffer length, not stat.size: a DMK file is larger than its raw image.
        const os9Standalone = buf.length <= oid.totalSectors * 256 + 4096;
        return { success: true, kind: 'os9', filePath, fileName, os9Base: 0, os9Volume, os9Standalone, entries: [] };
      }
    }

    // 3) plain .dsk or DriveWire container — open directly.
    return { success: true, kind: 'dsk', filePath, fileName, entries: [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 3c1c. Extract one disk/file from an analyzed image into a standard .dsk buffer.
ipcMain.handle('image-extract', async (_, filePath: string, locator: any) => {
  try {
    if (locator?.kind === 'fat') {
      const fd = fs.openSync(filePath, 'r');
      const reader: Reader = (off, len) => { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, off); return b; };
      try {
        const vol = readFatVolume(reader);
        if (!vol) return { success: false, error: 'Volume FAT não reconhecido.' };
        const data = readFatFile(reader, vol, { name: '', path: '', firstCluster: locator.cluster, size: locator.size });
        return { success: true, image: new Uint8Array(data) };
      } finally { fs.closeSync(fd); }
    }
    if (locator?.kind === 'miniide') {
      const fd = fs.openSync(filePath, 'r');
      try {
        const slot = Buffer.alloc(322560);
        fs.readSync(fd, slot, 0, 322560, locator.offset);
        return { success: true, image: new Uint8Array(deDoubleDisk(slot)) };
      } finally { fs.closeSync(fd); }
    }
    // plain dsk / container (DMK → raw sector image)
    const total = fs.statSync(filePath).size;
    const buf = normalizeDiskImage(readFileWithProgress(filePath, total, 'read'));
    return { success: true, image: new Uint8Array(buf) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 3c1c2. É um disco OS-9 (RBF)? Usado pelo renderer ao extrair um disco de um contêiner (FAT/MiniIDE)
// para decidir se abre na aba OS-9 em vez da aba DSK (RS-DOS). Aceita DMK/JVC (normaliza antes).
ipcMain.handle('os9-detect-buffer', async (_, bufU8: Uint8Array) => {
  try {
    const raw = normalizeDiskImage(Buffer.from(bufU8));
    if (isOs9DiskStrict(raw, 0)) return { os9: true, volume: parseIdent(raw, 0).name.trim(), image: new Uint8Array(raw) };
    // Cabeçalho OS-9 presente mas o arquivo é menor que DD.TOT×256 → disco OS-9 TRUNCADO/incompleto.
    // Reconhece (p/ rotear à aba OS-9 com aviso) em vez de cair no parser RS-DOS com erro confuso.
    if (isOs9Disk(raw, 0)) {
      const id = parseIdent(raw, 0); const expected = id.totalSectors * 256;
      if (raw.length < expected) return { os9: true, truncated: true, volume: id.name.trim(), have: raw.length, expected, image: new Uint8Array(raw) };
    }
    return { os9: false };
  } catch { return { os9: false }; }
});

// === ESCRITA FAT (D12 — CoCoSDC / RetroRewind SD) ===========================================
// Abre o .img com fd read+write e devolve {vol, read, write, close} via callbacks de acesso aleatório
// (nunca carrega a imagem inteira). SEGURANÇA: trabalhe sempre numa CÓPIA + valide no hardware.
function openFatRW(filePath: string) {
  const fd = fs.openSync(filePath, 'r+');
  const read: Reader = (off, len) => { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, off); return b; };
  const write: Writer = (off, data) => { fs.writeSync(fd, data, 0, data.length, off); };
  const vol = readFatVolume(read);
  return { fd, read, write, vol, close: () => fs.closeSync(fd) };
}

// 3c1f3. Grava de volta UM .dsk editado no seu lugar no FAT (write-back), pelo caminho interno.
ipcMain.handle('image-fat-writeback', async (_, filePath: string, innerPath: string, dataU8: Uint8Array) => {
  const h = openFatRW(filePath);
  try {
    if (!h.vol) return { success: false, error: 'Volume FAT não reconhecido.' };
    const res = fatReplaceFile(h.read, h.write, h.vol, innerPath, Buffer.from(dataU8));
    // validação: relê o arquivo e confere os bytes
    const back = readFatFile(h.read, h.vol, { name: '', path: innerPath, firstCluster: res.firstCluster, size: dataU8.length });
    const ok = back.length === dataU8.length && Buffer.from(dataU8).equals(back);
    return ok ? { success: true, firstCluster: res.firstCluster } : { success: false, error: 'Falha na verificação pós-gravação (bytes não conferem).' };
  } catch (e: any) { return { success: false, error: e.message }; }
  finally { h.close(); }
});

// 3c1f4. Insere um NOVO .dsk no FAT (na pasta dirPath; "" = raiz).
ipcMain.handle('image-fat-add', async (_, filePath: string, dirPath: string, name: string, dataU8: Uint8Array) => {
  const h = openFatRW(filePath);
  try {
    if (!h.vol) return { success: false, error: 'Volume FAT não reconhecido.' };
    const res = fatAddFile(h.read, h.write, h.vol, String(dirPath || ''), String(name), Buffer.from(dataU8));
    const back = readFatFile(h.read, h.vol, { name: '', path: name, firstCluster: res.firstCluster, size: dataU8.length });
    const ok = back.length === dataU8.length && Buffer.from(dataU8).equals(back);
    return ok ? { success: true, firstCluster: res.firstCluster } : { success: false, error: 'Falha na verificação pós-gravação.' };
  } catch (e: any) { return { success: false, error: e.message }; }
  finally { h.close(); }
});

// 3c1f4b. Escolhe um .dsk/.os9 no diálogo e o insere no FAT (na pasta dirPath). Devolve a entry nova
// (cluster/tamanho/caminho) para o renderer anexar ao contêiner sem re-escanear a imagem inteira.
ipcMain.handle('image-fat-add-pick', async (_, filePath: string, dirPath: string) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const sel = await dialog.showOpenDialog(mainWindow, {
    title: 'Inserir disco no cartão CoCoSDC',
    properties: ['openFile'],
    filters: [{ name: 'Disco (.dsk/.os9/.vdk/.dmk)', extensions: ['dsk', 'os9', 'vdk', 'jvc', 'dmk'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (sel.canceled || !sel.filePaths.length) return { cancelled: true };
  const src = sel.filePaths[0];
  const name = path.basename(src);
  const h = openFatRW(filePath);
  try {
    if (!h.vol) return { success: false, error: 'Volume FAT não reconhecido.' };
    const data = fs.readFileSync(src);
    const res = fatAddFile(h.read, h.write, h.vol, String(dirPath || ''), name, data);
    const back = readFatFile(h.read, h.vol, { name: '', path: name, firstCluster: res.firstCluster, size: data.length });
    if (!(back.length === data.length && data.equals(back))) return { success: false, error: 'Falha na verificação pós-gravação.' };
    const innerPath = dirPath ? `${dirPath}/${name}` : name;
    return { success: true, name, firstCluster: res.firstCluster, size: data.length, path: innerPath };
  } catch (e: any) { return { success: false, error: e.message }; }
  finally { h.close(); }
});

// 3c1f5. Exclui um arquivo do FAT pelo caminho interno.
ipcMain.handle('image-fat-delete', async (_, filePath: string, innerPath: string) => {
  const h = openFatRW(filePath);
  try {
    if (!h.vol) return { success: false, error: 'Volume FAT não reconhecido.' };
    fatDeleteFile(h.read, h.write, h.vol, String(innerPath));
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
  finally { h.close(); }
});

// 3c1d. Read an OS-9 / NitrOS-9 (RBF) partition at `base` and return its hierarchical directory
// tree (read-only). `base` is 0 for a loose .dsk/.os9 or for the OS-9 partition that lives at
// offset 0 inside a MiniIDE / CoCoSDC.VHD image. We read at most the partition's own size (capped).
ipcMain.handle('os9-read', async (_, filePath: string, base = 0) => {
  try {
    const stat = fs.statSync(filePath);
    const fd = fs.openSync(filePath, 'r');
    try {
      const head = Buffer.alloc(256);
      fs.readSync(fd, head, 0, 256, base);
      const id = parseIdent(head, 0);
      const CAP = 256 * 1024 * 1024;
      const need = Math.min(id.totalSectors * 256, stat.size - base, CAP);
      const buf = Buffer.alloc(need);
      fs.readSync(fd, buf, 0, need, base);
      const parsed = parseOs9(buf, { base: 0 });
      return {
        success: true, ident: parsed.ident, root: parsed.root,
        totalFiles: parsed.totalFiles, totalDirs: parsed.totalDirs,
        freeBytes: parsed.freeBytes, usedSectors: parsed.usedSectors,
        usage: readClusterBitmap(buf, 0), boot: os9BootInfo(buf, 0),
      };
    } finally { fs.closeSync(fd); }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 3c1e. Extract ONE file from an OS-9 partition by following its FD segment list, then save it to a
// user-chosen path. Targeted reads only (no full-partition slurp).
ipcMain.handle('os9-extract', async (_, filePath: string, base: number, fdLsn: number, defaultName: string) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  try {
    const fd = fs.openSync(filePath, 'r');
    let data: Buffer;
    try {
      const fdSec = Buffer.alloc(256);
      fs.readSync(fd, fdSec, 0, 256, base + fdLsn * 256);
      const meta = readFD(fdSec, 0, 0); // size + segment list from the FD sector
      data = Buffer.alloc(meta.size);
      let pos = 0;
      for (const seg of meta.segments) {
        const want = Math.min(seg.sectors * 256, meta.size - pos);
        if (want <= 0) break;
        const chunk = Buffer.alloc(want);
        fs.readSync(fd, chunk, 0, want, base + seg.lsn * 256);
        chunk.copy(data, pos);
        pos += want;
        if (pos >= meta.size) break;
      }
    } finally { fs.closeSync(fd); }
    const res = await dialog.showSaveDialog(mainWindow, { title: 'Extrair arquivo OS-9', defaultPath: defaultName });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, data);
    return { success: true, path: res.filePath, size: data.length };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// === OS-9 ESCRITA (em BUFFER — para discos .os9 avulsos editáveis no navegador) ===
// 3c1f. Cria um disco OS-9 em branco (158K/180K/360K/720K) → retorna o buffer.
ipcMain.handle('os9-create-blank', async (_, geomKey: string, name?: string) => {
  try {
    const geom = OS9_GEOMETRIES[geomKey];
    if (!geom) return { success: false, error: `Geometria OS-9 desconhecida: ${geomKey}` };
    const buf = createBlankOs9(geom, { name });
    return { success: true, image: new Uint8Array(buf) };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1f2. Escolhe um arquivo .os9/.dsk OS-9 e devolve o BUFFER (para edição na aba OS-9). Valida OS-9.
ipcMain.handle('os9-pick-buffer', async () => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir disco OS-9 (.os9 / .dsk)',
    properties: ['openFile'],
    filters: [{ name: 'Disco OS-9', extensions: ['os9', 'dsk', 'dmk', 'sdf'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePaths.length) return { cancelled: true };
  try {
    const data = normalizeDiskImage(fs.readFileSync(result.filePaths[0]));
    if (!isOs9DiskStrict(data, 0)) return { success: false, error: 'Não é um disco OS-9 (RBF) válido.' };
    return { success: true, image: new Uint8Array(data), fileName: path.basename(result.filePaths[0]), filePath: result.filePaths[0] };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1j2. Sobrescreve um arquivo .os9 existente com o buffer (botão "Salvar", sem diálogo).
ipcMain.handle('os9-save-overwrite', async (_, filePath: string, bufU8: Uint8Array) => {
  try {
    fs.writeFileSync(filePath, encodeForOs9Path(Buffer.from(bufU8), filePath)); // .sdf → codifica em SDF
    return { success: true, path: filePath };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1g. Parseia um buffer OS-9 → árvore (para o navegador editável trabalhar em memória).
ipcMain.handle('os9-parse-buffer', async (_, bufU8: Uint8Array) => {
  try {
    const buf = Buffer.from(bufU8);
    const p = parseOs9(buf, {});
    return { success: true, ident: p.ident, root: p.root, totalFiles: p.totalFiles, totalDirs: p.totalDirs, freeBytes: p.freeBytes, usage: readClusterBitmap(buf, 0), boot: os9BootInfo(buf, 0) };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1g3. Cria um disco OS-9 BOOTÁVEL novo (p/ o dropdown "Novo…" da aba OS-9), clonando um disco de
// SISTEMA de referência da geometria escolhida; opcionalmente insere programas + grava um `startup`
// que os executa no boot. Geometria validada contra a referência. ⚠️ boot/execução real → confirmar XRoar.
ipcMain.handle('os9-new-bootable', async (_, geomKey: string, withPrograms: boolean, forceRef?: boolean) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const expect: Record<string, { totalSectors: number; sides: number; label: string }> = {
    '158k': { totalSectors: 630, sides: 1, label: '35T (158K)' },
    '180k': { totalSectors: 720, sides: 1, label: '40T (180K)' },
    '360k': { totalSectors: 1440, sides: 2, label: 'DS (360K)' },
    '720k': { totalSectors: 2880, sides: 2, label: 'DS (720K)' },
  };
  const want = expect[geomKey];
  if (!want) return { success: false, error: 'Geometria desconhecida.' };
  // 1) disco de SISTEMA bootável de referência: usa o GABARITO EMBUTIDO (NitrOS-9) se existir p/ esta
  //    geometria; senão pede um disco de referência ao usuário (158K/180K não têm gabarito livre).
  let ref: Buffer;
  let usedSeed = false;
  const seedPath = forceRef ? null : os9SeedPath(geomKey);
  if (seedPath) {
    ref = normalizeDiskImage(fs.readFileSync(seedPath));
    usedSeed = true;
  } else {
    const sel = await dialog.showOpenDialog(mainWindow, {
      title: `Escolher um disco OS-9/NitrOS-9 BOOTÁVEL de referência — ${want.label}`,
      properties: ['openFile'],
      filters: [{ name: 'Disco OS-9 bootável', extensions: ['dsk', 'os9', 'dmk', 'jvc', 'sdf'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (sel.canceled || !sel.filePaths.length) return { cancelled: true };
    ref = normalizeDiskImage(fs.readFileSync(sel.filePaths[0]));
  }
  try {
    if (!isOs9DiskStrict(ref, 0)) return { success: false, error: 'A referência não é um disco OS-9 (RBF) válido.' };
    const rid = parseIdent(ref, 0);
    if (rid.totalSectors !== want.totalSectors || rid.sides !== want.sides)
      return { success: false, error: `A referência é ${rid.totalSectors} setores/${rid.sides} lado(s); esperado ${want.label} (${want.totalSectors}/${want.sides}). Escolha um disco da geometria certa.` };
    if (!os9BootInfo(ref, 0).bootable) return { success: false, error: 'A referência não é bootável (DD.BT=0). Escolha um disco de SISTEMA bootável.' };
    // 2) opcional: escolher programas a embutir
    let programs: { name: string; data: Buffer }[] = [];
    if (withPrograms) {
      const ps = await dialog.showOpenDialog(mainWindow, {
        title: 'Escolher programa(s) OS-9 p/ carregar no boot (vão p/ CMDS + startup)',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Programas OS-9', extensions: ['*'] }],
      });
      if (ps.canceled || !ps.filePaths.length) return { cancelled: true };
      programs = ps.filePaths.map(fp => ({ name: path.basename(fp), data: fs.readFileSync(fp) }));
    }
    const out = os9CloneBootable(ref, programs, 0);
    parseOs9(out, { base: 0 }); // valida antes de devolver
    const fileName = (programs.length ? 'BOOT_PROG' : 'BOOT') + `_${geomKey}.os9`;
    return { success: true, image: new Uint8Array(out), fileName, boot: os9BootInfo(out, 0), programs: programs.map(p => p.name), usedSeed };
  } catch (e: any) { return { success: false, error: e.message }; }
});

// 3c1g2. Torna um disco OS-9 (buffer) BOOTÁVEL clonando o aparato de boot de um disco-REFERÊNCIA
// bootável da MESMA geometria: copia o boot track (track 34/KERNELFILE) + o arquivo OS9Boot e ajusta
// DD.BT/DD.BSZ/DD.FMT. ⚠️ ESTRUTURA validada (tools/os9mkboot.ts); o BOOT real precisa ser confirmado
// no XRoar (montar drive 0, digitar DOS). Use um disco NitrOS-9 bootável do mesmo tamanho como ref.
ipcMain.handle('os9-make-bootable', async (_, bufU8: Uint8Array) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const sel = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolher um disco NitrOS-9 BOOTÁVEL de referência (mesmo tamanho)',
    properties: ['openFile'],
    filters: [{ name: 'Disco OS-9 bootável (.dsk/.os9/.dmk)', extensions: ['dsk', 'os9', 'dmk', 'jvc'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (sel.canceled || !sel.filePaths.length) return { cancelled: true };
  try {
    const ref = normalizeDiskImage(fs.readFileSync(sel.filePaths[0]));
    if (!isOs9DiskStrict(ref, 0)) return { success: false, error: 'A referência não é um disco OS-9 (RBF) válido.' };
    const out = os9MakeBootable(Buffer.from(bufU8), ref, 0);
    return { success: true, image: new Uint8Array(out), boot: os9BootInfo(out, 0), bootName: path.basename(sel.filePaths[0]) };
  } catch (e: any) { return { success: false, error: e.message }; }
});

// 3c1h. mkdir / rename num buffer OS-9 → retorna o buffer modificado.
ipcMain.handle('os9-mkdir-buffer', async (_, bufU8: Uint8Array, parentFdLsn: number, name: string) => {
  try { return { success: true, image: new Uint8Array(os9Mkdir(Buffer.from(bufU8), parentFdLsn, String(name))) }; }
  catch (error: any) { return { success: false, error: error.message }; }
});
ipcMain.handle('os9-rename-buffer', async (_, bufU8: Uint8Array, dirFdLsn: number, oldName: string, newName: string) => {
  try { return { success: true, image: new Uint8Array(os9Rename(Buffer.from(bufU8), dirFdLsn, String(oldName), String(newName))) }; }
  catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1k. O4 — inserir/excluir arquivo num buffer OS-9 (editável). Devolve o buffer modificado.
const nowOs9Date = () => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() }; };
const os9NameFromFilename = (raw: string) => {
  const base = String(raw).split(/[\\/]/).pop() || 'FILE';
  const clean = base.replace(/[^\x20-\x7e]/g, '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').trim();
  return (clean || 'FILE').slice(0, 28);
};
ipcMain.handle('os9-insert-buffer', async (_, bufU8: Uint8Array, parentFdLsn: number, opts?: { name?: string; data?: Uint8Array; srcPath?: string }) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  try {
    let data: Buffer, srcName: string;
    if (opts?.data) { data = Buffer.from(opts.data); srcName = String(opts.name || 'FILE'); }
    else {
      let p = opts?.srcPath;
      if (!p) {
        const r = await dialog.showOpenDialog(mainWindow, { title: 'Inserir arquivo no disco OS-9', properties: ['openFile'] });
        if (r.canceled || !r.filePaths[0]) return { cancelled: true };
        p = r.filePaths[0];
      }
      data = fs.readFileSync(p);
      srcName = opts?.name || p;
    }
    const name = os9NameFromFilename(srcName);
    const image = os9Insert(Buffer.from(bufU8), parentFdLsn, name, data, 0, { date: nowOs9Date() });
    return { success: true, image: new Uint8Array(image), name, size: data.length };
  } catch (error: any) { return { success: false, error: error.message }; }
});
ipcMain.handle('os9-delete-buffer', async (_, bufU8: Uint8Array, parentFdLsn: number, name: string) => {
  try { return { success: true, image: new Uint8Array(os9Delete(Buffer.from(bufU8), parentFdLsn, String(name))) }; }
  catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1n. Defrag OS-9 — compacta os segmentos fragmentados (1 arquivo, ou todos).
ipcMain.handle('os9-defrag-file-buffer', async (_, bufU8: Uint8Array, fdLsn: number) => {
  try { const r = os9DefragFile(Buffer.from(bufU8), fdLsn, 0); return { success: true, image: new Uint8Array(r.image), changed: r.changed, reason: r.reason }; }
  catch (error: any) { return { success: false, error: error.message }; }
});
ipcMain.handle('os9-defrag-all-buffer', async (_, bufU8: Uint8Array) => {
  try { const r = os9DefragAll(Buffer.from(bufU8), 0); return { success: true, image: new Uint8Array(r.image), defragged: r.defragged, failed: r.failed, alreadyOk: r.alreadyOk }; }
  catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1o. Copiar PASTA recursiva entre discos (duplo-explorer): ler a subárvore (origem) e aplicá-la (destino).
ipcMain.handle('os9-read-tree-buffer', async (_, bufU8: Uint8Array, fdLsn: number, name: string) => {
  try { return { success: true, tree: os9ReadTree(Buffer.from(bufU8), fdLsn, String(name), 0) }; }
  catch (error: any) { return { success: false, error: error.message }; }
});
ipcMain.handle('os9-read-tree-path', async (_, filePath: string, base: number, fdLsn: number, name: string) => {
  try { return { success: true, tree: os9ReadTree(fs.readFileSync(filePath), fdLsn, String(name), base) }; }
  catch (error: any) { return { success: false, error: error.message }; }
});
ipcMain.handle('os9-apply-tree-buffer', async (_, bufU8: Uint8Array, dstParentFdLsn: number, tree: any) => {
  try { const r = os9ApplyTree(Buffer.from(bufU8), dstParentFdLsn, tree, 0); return { success: true, image: new Uint8Array(r.image), files: r.files, dirs: r.dirs }; }
  catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1p. O5 — EDIÇÃO da partição OS-9 de um CONTAINER (MiniIDE/CoCoSDC), gravando direto no arquivo.
// Lê a FATIA da partição (base 0..totalSectors), aplica a op, VALIDA o resultado e grava de volta SÓ
// os setores alterados no offset `base`. GUARDA o sistema (OS9Boot/SYS/CMDS/DEFS — só pastas de usuário).
function readOs9PartitionSlice(filePath: string, base: number): Buffer {
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(256); fs.readSync(fd, head, 0, 256, base);
    const id = parseIdent(head, 0);
    const need = Math.min(id.totalSectors * 256, stat.size - base, 256 * 1024 * 1024);
    const buf = Buffer.alloc(need); fs.readSync(fd, buf, 0, need, base);
    return buf;
  } finally { fs.closeSync(fd); }
}
function writeChangedSectors(filePath: string, base: number, oldBuf: Buffer, newBuf: Buffer): number {
  const fd = fs.openSync(filePath, 'r+');
  let changed = 0;
  try {
    const n = Math.min(oldBuf.length, newBuf.length);
    for (let off = 0; off < n; off += 256) {
      const end = Math.min(off + 256, n);
      if (!oldBuf.subarray(off, end).equals(newBuf.subarray(off, end))) { fs.writeSync(fd, newBuf, off, end - off, base + off); changed++; }
    }
  } finally { fs.closeSync(fd); }
  return changed;
}
function os9PartitionResult(filePath: string, base: number, extra: any = {}) {
  const buf = readOs9PartitionSlice(filePath, base);
  const p = parseOs9(buf, { base: 0 });
  return { success: true, ident: p.ident, root: p.root, totalFiles: p.totalFiles, totalDirs: p.totalDirs, freeBytes: p.freeBytes, usedSectors: p.usedSectors, usage: readClusterBitmap(buf, 0), ...extra };
}
ipcMain.handle('os9-container-edit', async (_, filePath: string, base: number, op: string, args: any) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  try {
    const buf = readOs9PartitionSlice(filePath, base);
    const sys = os9SystemArea(buf, 0);
    const blockParent = (p: number) => { if (sys.has(p)) throw new Error('Pasta de SISTEMA protegida (OS9Boot/SYS/CMDS/DEFS) — edição só em pastas de usuário.'); };
    const blockTarget = (parent: number, name: string) => {
      if (sys.has(parent)) throw new Error('Pasta de SISTEMA protegida.');
      const t = os9ChildLsn(buf, parent, String(name), 0);
      if (t >= 0 && sys.has(t)) throw new Error(`"${name}" pertence ao SISTEMA — protegido contra alteração.`);
    };
    let out: Buffer;
    if (op === 'mkdir') { blockParent(args.parentFdLsn); out = os9Mkdir(buf, args.parentFdLsn, String(args.name), 0, { date: nowOs9Date() }); }
    else if (op === 'rename') { blockTarget(args.dirFdLsn, args.oldName); out = os9Rename(buf, args.dirFdLsn, String(args.oldName), String(args.newName), 0); }
    else if (op === 'delete') { blockTarget(args.parentFdLsn, args.name); out = os9Delete(buf, args.parentFdLsn, String(args.name), 0); }
    else if (op === 'insert') {
      blockParent(args.parentFdLsn);
      let data: Buffer, srcName: string;
      if (args?.data) { data = Buffer.from(args.data); srcName = String(args.name || 'FILE'); }
      else {
        const r = await dialog.showOpenDialog(mainWindow, { title: 'Inserir arquivo na partição OS-9', properties: ['openFile'] });
        if (r.canceled || !r.filePaths[0]) return { cancelled: true };
        data = fs.readFileSync(r.filePaths[0]); srcName = r.filePaths[0];
      }
      out = os9Insert(buf, args.parentFdLsn, os9NameFromFilename(srcName), data, 0, { date: nowOs9Date() });
    }
    else throw new Error('Operação de container desconhecida: ' + op);
    parseOs9(out, { base: 0 }); // VALIDA antes de gravar — se a edição corrompeu, NÃO escreve no arquivo
    const changedSectors = writeChangedSectors(filePath, base, buf, out);
    return os9PartitionResult(filePath, base, { verified: true, changedSectors });
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1l. Abre um arquivo OS-9 por caminho (drag-and-drop) → bytes p/ a aba OS-9.
ipcMain.handle('os9-open-path', async (_, filePath: string) => {
  try {
    const data = normalizeDiskImage(fs.readFileSync(filePath));
    return { success: true, image: new Uint8Array(data), fileName: filePath.split(/[\\/]/).pop() || 'DISCO.OS9', filePath };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1m. Lê os BYTES de um arquivo OS-9 (sem salvar em disco) — p/ copiar entre discos (duplo-explorer).
ipcMain.handle('os9-readfile-buffer', async (_, bufU8: Uint8Array, fdLsn: number) => {
  try {
    const buf = Buffer.from(bufU8);
    const data = readFileData(buf, readFD(buf, fdLsn, 0), 0);
    return { success: true, data: new Uint8Array(data) };
  } catch (error: any) { return { success: false, error: error.message }; }
});
ipcMain.handle('os9-readfile-path', async (_, filePath: string, base: number, fdLsn: number) => {
  try {
    const buf = fs.readFileSync(filePath);
    const data = readFileData(buf, readFD(buf, fdLsn, base), base);
    return { success: true, data: new Uint8Array(data) };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1i. Extrai um arquivo de um buffer OS-9 (segue FD.SEG) → salva no PC.
ipcMain.handle('os9-extract-buffer', async (_, bufU8: Uint8Array, fdLsn: number, defaultName: string) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  try {
    const buf = Buffer.from(bufU8);
    const fd = readFD(buf, fdLsn, 0);
    const data = readFileData(buf, fd, 0);
    const res = await dialog.showSaveDialog(mainWindow, { title: 'Extrair arquivo OS-9', defaultPath: defaultName });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, data);
    return { success: true, path: res.filePath, size: data.length };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1j. Salva um buffer OS-9 como arquivo .os9 (Salvar Como).
ipcMain.handle('os9-save-buffer', async (_, bufU8: Uint8Array, defaultName: string) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  try {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar disco OS-9', defaultPath: defaultName,
      filters: [{ name: 'Disco OS-9 (.os9/.dsk)', extensions: ['os9', 'dsk'] }, { name: 'Imagem CoCoSDC (.sdf)', extensions: ['sdf'] }],
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, encodeForOs9Path(Buffer.from(bufU8), res.filePath)); // .sdf → codifica em SDF
    return { success: true, path: res.filePath };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// 3c1c2. Write ONE MiniIDE disk back IN PLACE into the .img at its slot offset. The disk must be a
// standard 161,280-byte (35-track) RS-DOS image; the slot is 322,560 (sector-doubled).
//   SAFETY: read tests on real .img show the doubled "odd" sub-sectors are NOT identical copies (raw
//   CF leftovers/2nd copy the HDBDOS firmware may keep). So we DON'T re-double blindly — we read the
//   current slot and overwrite ONLY the EVEN 256-byte sub-sectors (the actual CoCo sectors that
//   de-double reads), preserving every odd sub-sector byte-for-byte. Minimal, reversible change.
// ───────── GRAVAR .img em CARTÃO CF (reflash) — só drives REMOVÍVEIS, salvaguardas fortes ─────────
// Enumera/grava via PowerShell (sem dependência nativa → sem risco ao build de release). A gravação CRUA
// num disco físico exige o app rodando como ADMINISTRADOR (senão fs.open do \\.\PhysicalDrive dá EPERM).
function runPwsh(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString()); p.stderr.on('data', d => err += d.toString());
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out) : reject(new Error(err.trim() || `powershell saiu com código ${code}`)));
  });
}
// Igual ao runPwsh, mas entrega cada LINHA do stdout ao callback em tempo real (p/ barra de progresso).
function runPwshStream(script: string, onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    let err = '', buf = '';
    p.stdout.on('data', d => {
      buf += d.toString(); let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onLine(line); }
    });
    p.stderr.on('data', d => err += d.toString());
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(err.trim() || `powershell saiu com código ${code}`)));
  });
}
// O processo está ELEVADO (Administrador)? A gravação crua em \\.\PhysicalDrive exige elevação no Windows.
async function isElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  try {
    const r = (await runPwsh(`[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`)).trim();
    return /true/i.test(r);
  } catch { return false; }
}
ipcMain.handle('cf-is-admin', async () => ({ admin: await isElevated() }));
// Lista discos REMOVÍVEIS (USB/SD/MMC), JÁ excluindo sistema/boot — para o modal "Gravar em cartão CF".
ipcMain.handle('cf-list-removable', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Gravação de cartão CF disponível só no Windows.' };
  try {
    const json = await runPwsh(`Get-Disk | Where-Object { ($_.BusType -in 'USB','SD','MMC') -or $_.IsRemovable } | Select-Object Number,FriendlyName,Size,BusType,IsSystem,IsBoot | ConvertTo-Json -Compress`);
    let arr: any = json.trim() ? JSON.parse(json) : [];
    if (!Array.isArray(arr)) arr = [arr];
    const drives = arr.filter((d: any) => !d.IsSystem && !d.IsBoot).map((d: any) => ({ number: d.Number, name: d.FriendlyName, size: Number(d.Size) || 0, busType: d.BusType }));
    return { success: true, drives };
  } catch (e: any) { return { success: false, error: e.message }; }
});
// Grava a .img (filePath) no disco físico removível `diskNumber`. Revalida removível/não-sistema ANTES de
// escrever (segurança redundante). Progresso por 'cf-flash-progress'. Tira o disco offline p/ destravar.
ipcMain.handle('cf-flash', async (e, filePath: string, diskNumber: number) => {
  if (process.platform !== 'win32') return { success: false, error: 'Disponível só no Windows.' };
  try {
    // VALIDAÇÃO (não precisa de admin): só removível, não-sistema, e cabe.
    const d = JSON.parse(await runPwsh(`Get-Disk -Number ${diskNumber} | Select-Object Size,BusType,IsSystem,IsBoot,IsRemovable | ConvertTo-Json -Compress`));
    if (d.IsSystem || d.IsBoot) return { success: false, error: 'ABORTADO: o disco alvo é do sistema/boot.' };
    if (!(d.IsRemovable || ['USB', 'SD', 'MMC'].includes(d.BusType))) return { success: false, error: 'ABORTADO: o disco alvo não é removível.' };
    const st = fs.statSync(filePath);
    if (Number(d.Size) > 0 && st.size > Number(d.Size)) return { success: false, error: `A imagem (${st.size} B) é MAIOR que o cartão (${d.Size} B).` };

    if (await isElevated()) {
      // JÁ é admin → caminho direto (progresso por stdout, mais simples e rápido).
      await runPwsh(`Set-Disk -Number ${diskNumber} -IsReadOnly $false -ErrorAction SilentlyContinue`).catch(() => {});
      await runPwsh(`Clear-Disk -Number ${diskNumber} -RemoveData -RemoveOEM -Confirm:$false`).catch(() => {});
      const imgPs = filePath.replace(/'/g, "''");
      const flashScript = [
        `$ErrorActionPreference='Stop'`,
        `$src=[System.IO.File]::Open('${imgPs}',[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read)`,
        `$dst=New-Object System.IO.FileStream('\\\\.\\PhysicalDrive${diskNumber}',[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::ReadWrite)`,
        `try{`,
        `  $total=$src.Length; $chunk=4194304; $buf=New-Object byte[] $chunk; [long]$pos=0`,
        `  while($pos -lt $total){`,
        `    $want=[int][Math]::Min([long]$chunk,$total-$pos); $got=0`,
        `    while($got -lt $want){ $r=$src.Read($buf,$got,$want-$got); if($r -le 0){break}; $got+=$r }`,
        `    if($got -le 0){break}`,
        `    $wlen=$got; if($wlen % 512 -ne 0){ $wlen=[int]([Math]::Ceiling($got/512)*512); [Array]::Clear($buf,$got,$wlen-$got) }`,
        `    $dst.Write($buf,0,$wlen); $pos+=$got`,
        `    [Console]::Out.WriteLine('PROGRESS '+$pos+' '+$total)`,
        `  }`,
        `  $dst.Flush($true); [Console]::Out.WriteLine('DONE '+$total)`,
        `} finally { $src.Close(); $dst.Close() }`,
      ].join('\n');
      await runPwshStream(flashScript, (line) => {
        const m = /^PROGRESS (\d+) (\d+)/.exec(line);
        if (m) e.sender.send('cf-flash-progress', { written: Number(m[1]), total: Number(m[2]) });
      });
      await runPwsh(`Update-Disk -Number ${diskNumber} -ErrorAction SilentlyContinue`).catch(() => {});
      return { success: true, bytes: st.size };
    }

    // NÃO é admin → ELEVAÇÃO SOB DEMANDA: dispara o UAC só p/ a gravação. Um .ps1 self-contido faz
    // Clear-Disk + escrita (.NET FileStream) e reporta progresso/resultado em ARQUIVOS temporários (não dá
    // p/ capturar stdout de um processo elevado via -Verb RunAs). O main faz POLL do arquivo de progresso.
    const tmp = os.tmpdir(), stamp = Date.now();
    const scriptPath = path.join(tmp, `ccc-cf-${stamp}.ps1`);
    const progFile = path.join(tmp, `ccc-cf-${stamp}.prog`);
    const resFile = path.join(tmp, `ccc-cf-${stamp}.res`);
    const psq = (s: string) => s.replace(/'/g, "''");
    const cleanup = () => { for (const f of [scriptPath, progFile, resFile]) { try { fs.unlinkSync(f); } catch { /* */ } } };
    const script = [
      `$ErrorActionPreference='Stop'`,
      `$Img='${psq(filePath)}'; $Disk=${diskNumber}; $ProgFile='${psq(progFile)}'; $ResFile='${psq(resFile)}'`,
      `function Res($s){ [System.IO.File]::WriteAllText($ResFile,$s) }`,
      `try {`,
      `  $d = Get-Disk -Number $Disk`,
      `  if($d.IsSystem -or $d.IsBoot){ Res 'ERR disco de sistema/boot'; exit }`,
      `  if(-not ($d.IsRemovable -or @('USB','SD','MMC') -contains $d.BusType)){ Res 'ERR disco nao e removivel'; exit }`,
      `  Set-Disk -Number $Disk -IsReadOnly $false -ErrorAction SilentlyContinue`,
      `  try { Clear-Disk -Number $Disk -RemoveData -RemoveOEM -Confirm:$false } catch {}`,
      `  $src=[System.IO.File]::Open($Img,'Open','Read','Read')`,
      `  $dst=New-Object System.IO.FileStream("\\\\.\\PhysicalDrive$Disk",'Open','ReadWrite','ReadWrite')`,
      `  try {`,
      `    $total=$src.Length; $chunk=4194304; $buf=New-Object byte[] $chunk; [long]$pos=0; [long]$lastW=0`,
      `    while($pos -lt $total){`,
      `      $want=[int][Math]::Min([long]$chunk,$total-$pos); $got=0`,
      `      while($got -lt $want){ $r=$src.Read($buf,$got,$want-$got); if($r -le 0){break}; $got+=$r }`,
      `      if($got -le 0){break}`,
      `      $wlen=$got; if($wlen % 512 -ne 0){ $wlen=[int]([Math]::Ceiling($got/512)*512); [Array]::Clear($buf,$got,$wlen-$got) }`,
      `      $dst.Write($buf,0,$wlen); $pos+=$got`,
      `      if(($pos-$lastW) -ge 4194304 -or $pos -eq $total){ $lastW=$pos; [System.IO.File]::WriteAllText($ProgFile, ("" + $pos + " " + $total)) }`,
      `    }`,
      `    $dst.Flush($true)`,
      `  } finally { $src.Close(); $dst.Close() }`,
      `  Update-Disk -Number $Disk -ErrorAction SilentlyContinue`,
      `  Res ("OK " + $total)`,
      `} catch { Res ('ERR ' + $_.Exception.Message) }`,
    ].join('\r\n');
    fs.writeFileSync(scriptPath, script, 'utf8');
    try { fs.unlinkSync(progFile); } catch { /* */ } try { fs.unlinkSync(resFile); } catch { /* */ } // limpa restos antigos

    const poll = setInterval(() => {
      try { const tt = fs.readFileSync(progFile, 'utf8').trim(); const m = /^(\d+)\s+(\d+)/.exec(tt); if (m) e.sender.send('cf-flash-progress', { written: Number(m[1]), total: Number(m[2]) }); } catch { /* ainda não escreveu */ }
    }, 250);
    try {
      // Launcher NÃO-elevado: dispara o UAC e ESPERA o processo elevado terminar.
      const launcher = `$ErrorActionPreference='Stop'; Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${psq(scriptPath)}') -Wait; exit 0`;
      await runPwsh(launcher);
    } catch (err: any) {
      clearInterval(poll);
      const raw = err?.message || String(err);
      const msg = /canceled by the user|cancelada pelo|operation was canceled|1223|requested operation requires elevation/i.test(raw)
        ? 'Elevação cancelada (UAC). A gravação no cartão precisa de Administrador só neste momento — clique em "Gravar cartão" de novo e confirme o aviso do Windows.'
        : raw;
      cleanup();
      return { success: false, error: msg };
    }
    clearInterval(poll);
    let resultText = '';
    try { resultText = fs.readFileSync(resFile, 'utf8').trim(); } catch { /* */ }
    cleanup();
    if (resultText.startsWith('OK')) { const bytes = parseInt(resultText.slice(3), 10) || st.size; e.sender.send('cf-flash-progress', { written: bytes, total: bytes }); return { success: true, bytes }; }
    if (resultText.startsWith('ERR')) return { success: false, error: resultText.slice(4) };
    return { success: false, error: 'A gravação elevada terminou sem resultado (o UAC foi confirmado?).' };
  } catch (e2: any) {
    const raw = e2?.message || String(e2);
    return { success: false, error: raw };
  }
});

ipcMain.handle('image-write-slot', async (_, filePath: string, offset: number, diskUint8Array: Uint8Array) => {
  try {
    const disk = Buffer.from(diskUint8Array);
    if (disk.length !== 161280) {
      return { success: false, error: `Disco precisa ter 161.280 bytes (35T) para caber no slot da MiniIDE; tem ${disk.length}.` };
    }
    const SLOT = 322560;
    const stat = fs.statSync(filePath);
    if (offset < 0 || offset + SLOT > stat.size) {
      return { success: false, error: `Offset ${offset} fora dos limites da imagem (${stat.size} bytes).` };
    }
    const fd = fs.openSync(filePath, 'r+');
    try {
      const slot = Buffer.alloc(SLOT);
      fs.readSync(fd, slot, 0, SLOT, offset);               // slot atual (preserva os chunks ímpares)
      const sectors = disk.length / 256;                    // 630
      for (let i = 0; i < sectors; i++) disk.copy(slot, i * 2 * 256, i * 256, i * 256 + 256); // só os pares
      fs.writeSync(fd, slot, 0, SLOT, offset);
      fs.fsyncSync(fd);
      // Validação ROUND-TRIP (Fase A): relê o slot do arquivo e confere que cada setor de-doubled
      // (metade PAR) bate exatamente com o disco gravado. Pega gravação parcial / disco/SO com problema
      // ANTES do usuário levar o .img para o cartão real.
      const verify = Buffer.alloc(SLOT);
      fs.readSync(fd, verify, 0, SLOT, offset);
      for (let i = 0; i < sectors; i++) {
        if (Buffer.compare(verify.subarray(i * 2 * 256, i * 2 * 256 + 256), disk.subarray(i * 256, i * 256 + 256)) !== 0) {
          return { success: false, error: `Verificação pós-gravação falhou no setor ${i} (round-trip não confere) — a gravação pode estar corrompida.` };
        }
      }
    } finally { fs.closeSync(fd); }
    return { success: true, verified: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 3c2. Sort a .dsk image's directory entries alphabetically (A→Z). Routes RS-DOS vs Dragon by format.
ipcMain.handle('dsk-sort-directory', async (_, dskUint8Array: Uint8Array) => {
  try {
    const buf = Buffer.from(dskUint8Array);
    const img = looksDragon(buf) ? sortDragonDirectory(buf) : sortDskDirectory(buf);
    return { success: true, image: new Uint8Array(img) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 3c2b. Defragment a WHOLE Dragon DOS disk (rewrites files contiguously + rebuilds bitmap/directory).
// RS-DOS defrag stays per-file (dsk-defrag-file, animated client-side); Dragon has no granule FAT.
ipcMain.handle('dsk-defrag-dragon', async (_, dskUint8Array: Uint8Array) => {
  try {
    const img = defragDragonDisk(Buffer.from(dskUint8Array));
    return { success: true, image: new Uint8Array(img) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 3d. Open a .dsk image into a DSK-manager pane (dialog + parse + free-space info)
ipcMain.handle('open-dsk-pane', async () => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open .DSK / .VDK image',
    properties: ['openFile'],
    filters: [
      { name: 'Disk Images (RS-DOS / Dragon / DMK)', extensions: ['dsk', 'vdk', 'dmk'] },
      { name: 'RS-DOS Disk Image', extensions: ['dsk'] },
      { name: 'Dragon VDK Image', extensions: ['vdk'] },
      { name: 'DMK Image', extensions: ['dmk'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false, cancelled: true };
  try {
    const fp = result.filePaths[0];
    // DMK (track-level image) → decode to a raw sector image first; everything downstream
    // (Dragon/RS-DOS/OS-9 parsers, edit, save) works on the raw form.
    const buf = normalizeDiskImage(fs.readFileSync(fp));
    // Dragon DOS / VDK first; otherwise standard RS-DOS.
    const dragon = readDragonDirectory(buf);
    if (dragon) {
      return { ...dragon, buffer: new Uint8Array(buf), fileName: path.basename(fp), filePath: fp, size: buf.length };
    }
    const parsed = parseDsk(buf);
    return {
      success: true,
      format: 'rsdos',
      buffer: new Uint8Array(buf),
      fileName: path.basename(fp),
      filePath: fp,
      size: buf.length,
      files: parsed.files,
      freeGranules: parsed.freeGranules,
      totalGranules: parsed.totalGranules
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 4. Decode WAV audio (FSK) and return the CAS packet breakdown
ipcMain.handle('decode-wav-audio', async (_, wavUint8Array: Uint8Array) => {
  try {
    const wavBuffer = Buffer.from(wavUint8Array);
    const decoded = decodeWav(wavBuffer);
    const parsedCas = parseCas(decoded.bytes);

    return {
      success: true,
      casBytes: new Uint8Array(decoded.bytes),
      isInverted: decoded.isInverted,
      syncBitIndex: decoded.syncBitIndex,
      name: parsedCas.name,
      fileType: parsedCas.fileType,
      asciiFlag: parsedCas.asciiFlag,
      loadAddr: parsedCas.loadAddr,
      execAddr: parsedCas.execAddr,
      payload: new Uint8Array(parsedCas.payload),
      files: parsedCas.files.map(f => ({
        name: f.name, fileType: f.fileType, fileTypeName: f.fileTypeName, asciiFlag: f.asciiFlag,
        loadAddr: f.loadAddr, execAddr: f.execAddr, size: f.payload.length, payload: new Uint8Array(f.payload)
      })),
      blocks: parsedCas.blocks.map(b => ({
        type: b.type,
        typeName: b.typeName,
        length: b.length,
        payload: new Uint8Array(b.payload),
        checksum: b.checksum,
        checksumValid: b.checksumValid
      }))
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 5. Parse CAS raw packet stream
ipcMain.handle('parse-cas-payload', async (_, casUint8Array: Uint8Array) => {
  try {
    const casBuffer = Buffer.from(casUint8Array);
    const parsed = parseCas(casBuffer);
    return {
      success: true,
      name: parsed.name,
      fileType: parsed.fileType,
      asciiFlag: parsed.asciiFlag,
      loadAddr: parsed.loadAddr,
      execAddr: parsed.execAddr,
      payload: new Uint8Array(parsed.payload),
      files: parsed.files.map(f => ({
        name: f.name, fileType: f.fileType, fileTypeName: f.fileTypeName, asciiFlag: f.asciiFlag,
        loadAddr: f.loadAddr, execAddr: f.execAddr, size: f.payload.length, payload: new Uint8Array(f.payload)
      })),
      blocks: parsed.blocks.map(b => ({
        type: b.type,
        typeName: b.typeName,
        length: b.length,
        payload: new Uint8Array(b.payload),
        checksum: b.checksum,
        checksumValid: b.checksumValid
      }))
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 6. Parse standard BIN (LOADM format)
ipcMain.handle('parse-bin-payload', async (_, binUint8Array: Uint8Array) => {
  try {
    const binBuffer = Buffer.from(binUint8Array);
    const parsed = parseBin(binBuffer);
    return {
      success: true,
      loadAddr: parsed.loadAddr,
      execAddr: parsed.execAddr,
      payload: new Uint8Array(parsed.payload),
      gapBytes: parsed.gapBytes,
      segments: parsed.segments.map(s => ({
        type: s.type,
        length: s.length,
        loadAddr: s.loadAddr,
        data: new Uint8Array(s.data)
      }))
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 7. Compile cartridge from raw payload and loader configuration
ipcMain.handle('compile-cartridge', async (_, payloadUint8Array: Uint8Array, config: BootstrapConfig) => {
  try {
    const payload = Buffer.from(payloadUint8Array);
    const compiled = compileBootstrap(payload, config);
    return {
      success: true,
      romBuffer: new Uint8Array(compiled.romBuffer),
      loaderSize: compiled.loaderSize,
      payloadRomOffset: compiled.payloadRomOffset,
      numBanks: compiled.numBanks,
      bankUsableBytes: compiled.bankUsableBytes
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 7b. Build an emulator .cas image by re-encoding files (loadable in XRoar/MAME)
ipcMain.handle('build-emulator-cas', async (_, files: any[]) => {
  try {
    const inputs: CasFileInput[] = files.map(f => ({
      name: f.name,
      fileType: f.fileType ?? 2,
      asciiFlag: f.asciiFlag ?? 0,
      loadAddr: f.loadAddr,
      execAddr: f.execAddr,
      payload: Buffer.from(f.payload)
    }));
    const buf = encodeCas(inputs);
    return { success: true, image: new Uint8Array(buf) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 7c. Build an emulator .dsk image (RS-DOS) by writing files as LOADM programs
ipcMain.handle('build-emulator-dsk', async (_, files: any[]) => {
  try {
    const inputs: DskFileInput[] = files.map(f => ({
      name: f.name,
      loadAddr: f.loadAddr,
      execAddr: f.execAddr,
      payload: Buffer.from(f.payload)
    }));
    const buf = encodeDsk(inputs);
    return { success: true, image: new Uint8Array(buf) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 7d. Wrap a compiled cartridge image as a CocoFLASH .bin (loads at $4000 for PRGFLASH.BAS)
ipcMain.handle('build-cocoflash-bin', async (_, romUint8Array: Uint8Array) => {
  try {
    const buf = buildCocoFlashBin(Buffer.from(romUint8Array));
    return { success: true, image: new Uint8Array(buf) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// --- Greaseweazle (gw CLI) integration ---
function runGw(gwPath: string, args: string[]): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const send = (s: string) => mainWindow?.webContents.send('gw-log', s);
    send(`$ ${gwPath || 'gw'} ${args.join(' ')}`);
    let settled = false;
    const done = (code: number) => { if (!settled) { settled = true; resolve({ code }); } };
    let proc;
    try {
      proc = spawn(gwPath || 'gw', args, { windowsHide: true });
    } catch (e: any) {
      send(`ERRO ao iniciar '${gwPath || 'gw'}': ${e.message}`);
      done(-1); return;
    }
    proc.on('error', (e: any) => {
      send(`ERRO: ${e.message} — verifique se o Greaseweazle host tools (gw) está instalado e no PATH, ou informe o caminho completo.`);
      done(-1);
    });
    proc.stdout?.on('data', (d) => send(d.toString()));
    proc.stderr?.on('data', (d) => send(d.toString()));
    proc.on('close', (code) => done(code ?? -1));
  });
}

function gwExtraArgs(opts: any): string[] {
  const args: string[] = [];
  if (opts.device) args.push('--device', String(opts.device));
  if (opts.drive) args.push('--drive', String(opts.drive));
  if (Array.isArray(opts.extra)) args.push(...opts.extra.filter((s: string) => s && s.length));
  return args;
}

ipcMain.handle('gw-info', async (_, opts: any) => {
  const r = await runGw(opts.gwPath, ['info', ...(opts.device ? ['--device', String(opts.device)] : [])]);
  return { success: r.code === 0, code: r.code };
});

// Comando gw genérico de diagnóstico (delays, seek, etc.) — a saída aparece no log do GW.
ipcMain.handle('gw-run', async (_, opts: any, args: string[]) => {
  const r = await runGw(opts.gwPath, Array.isArray(args) ? args : []);
  return { success: r.code === 0, code: r.code };
});

// Flags que só fazem sentido em GRAVAÇÃO — se ficarem no campo "Argumentos extras" (compartilhado),
// o `gw read` as rejeita e falha (código 1). Removemos da leitura.
function stripWriteOnlyArgs(extra: any): string[] {
  if (!Array.isArray(extra)) return [];
  const writeOnly = new Set(['--no-verify', '--erase-empty']);
  return extra.filter((s: string) => {
    const tok = String(s).toLowerCase();
    return !writeOnly.has(tok) && !tok.startsWith('--precomp') && !tok.startsWith('--fake');
  });
}

// Quebra um "comando direto" em argumentos (split simples por espaços).
function splitDirect(direct: string): string[] {
  return String(direct || '').trim().split(/\s+/).filter(Boolean);
}

ipcMain.handle('gw-read', async (_, opts: any) => {
  const tmp = path.join(app.getPath('temp'), `gw-read-${Date.now()}.dsk`);
  // Comando direto preenchido → usa SÓ ele (+ caminho do arquivo temporário no final).
  const args = opts.direct
    ? [...splitDirect(opts.direct), tmp]
    : ['read', '--format', String(opts.format), ...gwExtraArgs({ ...opts, extra: stripWriteOnlyArgs(opts.extra) }), tmp];
  const r = await runGw(opts.gwPath, args);
  if (r.code !== 0) return { success: false, code: r.code };
  try {
    const buf = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    return { success: true, image: new Uint8Array(buf), size: buf.length };
  } catch (e: any) { return { success: false, error: e.message }; }
});

ipcMain.handle('gw-write', async (_, opts: any, imageUint8Array: Uint8Array) => {
  const tmp = path.join(app.getPath('temp'), `gw-write-${Date.now()}.dsk`);
  try { fs.writeFileSync(tmp, Buffer.from(imageUint8Array)); }
  catch (e: any) { return { success: false, error: e.message }; }
  const args = opts.direct
    ? [...splitDirect(opts.direct), tmp]
    : ['write', '--format', String(opts.format), ...gwExtraArgs(opts), tmp];
  const r = await runGw(opts.gwPath, args);
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  return { success: r.code === 0, code: r.code };
});

// 7b. Overwrite an existing file in place (no dialog) — usado pelo "Salvar" da aba DSK.
ipcMain.handle('save-dsk-overwrite', async (_, filePath: string, dataUint8Array: Uint8Array) => {
  try {
    if (!filePath) return { success: false, error: 'No file path.' };
    fs.writeFileSync(filePath, Buffer.from(dataUint8Array));
    return { success: true, filePath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 8. Save final cartridge/EPROM file to system disk
ipcMain.handle('save-cartridge-file', async (_, romUint8Array: Uint8Array, defaultName: string, title?: string, customFilters?: any[], sdfGeom?: { sectorsPerTrack: number; sides: number }) => {
  if (!mainWindow) return { success: false, error: 'No application window.' };

  const defaultFilters = [
    { name: 'Color Computer Cartridge (.ccc)', extensions: ['ccc'] },
    { name: 'Binary ROM Image (.bin)', extensions: ['bin'] },
    { name: 'All Files', extensions: ['*'] }
  ];

  const result = await dialog.showSaveDialog(mainWindow, {
    title: title || 'Export EPROM Cartridge Image',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: customFilters || defaultFilters
  });

  if (result.canceled || !result.filePath) {
    return { success: false, cancelled: true };
  }

  try {
    let romBuffer = Buffer.from(romUint8Array);
    // .sdf escolhido + geometria informada → codifica o disco RAW em SDF (CoCoSDC) antes de gravar.
    if (sdfGeom && /\.sdf$/i.test(result.filePath)) romBuffer = rawToSdf(romBuffer, sdfGeom);
    fs.writeFileSync(result.filePath, romBuffer);
    return { success: true, filePath: result.filePath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 9. Load user configuration
ipcMain.handle('load-config', async () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading config file:', err);
  }
  return null;
});

// 10. Save user configuration
ipcMain.handle('save-config', async (_, config: any) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'settings.json');
    // Merge com o existente para não apagar chaves de outras telas (ex.: xroar vs app).
    let existing: any = {};
    try { existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { /* sem arquivo ainda */ }
    fs.writeFileSync(configPath, JSON.stringify({ ...existing, ...config }, null, 2), 'utf-8');
    return { success: true };
  } catch (err: any) {
    console.error('Error saving config file:', err);
    return { success: false, error: err.message };
  }
});

