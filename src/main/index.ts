import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { decodeWav } from './converter/wav';
import { parseCas } from './converter/cas';
import { parseDsk, extractDskFile, addDskFile, deleteDskFile, sortDskDirectory, defragFileInPlace, isRsDosDisk, deDoubleDisk, scanMiniIdeImage, DskFileEntry } from './converter/dsk';
import { readDragonDirectory, stripVdk, extractDragonFile, encodeDragonBlank, looksDragon, addDragonFile, deleteDragonFile, cocoToDragonBin, recommendDragonMode, sortDragonDirectory, defragDragonDisk } from './converter/dragondos';
import { readFatVolume, listFatFiles, readFatFile, Reader } from './converter/fat';
import { isOs9DiskStrict, parseIdent, parseOs9, readFD, readFileData } from './converter/os9';
import { parseBin } from './converter/bin';
import { compileBootstrap, BootstrapConfig } from './converter/bootstrap';
import { encodeCas, encodeDsk, buildCocoFlashBin, CasFileInput, DskFileInput } from './converter/export';

let mainWindow: BrowserWindow | null = null;
let allowClose = false; // só true depois que o usuário confirma no modal de "Sair"

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'CoCo CCC Converter',
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

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize(); // abre maximizado, preenchendo a tela
    mainWindow?.show();
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

// 3c0z. Pick any CoCo/Dragon media file to load into the embedded XRoar emulator.
ipcMain.handle('xroar-pick-file', async () => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir no XRoar',
    properties: ['openFile'],
    filters: [
      { name: 'CoCo/Dragon', extensions: ['dsk', 'vdk', 'jvc', 'dmk', 'cas', 'wav', 'bin', 'rom', 'ccc', 'sna', 'asc', 'bas'] },
      { name: 'All Files', extensions: ['*'] },
    ],
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

// 3c1b. Unified storage-image browser: pick an image, detect its kind, list its disks/files.
ipcMain.handle('image-analyze', async () => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir imagem (MiniIDE / CoCoSDC / .dsk / .vdk)',
    properties: ['openFile'],
    filters: [
      { name: 'Imagens de armazenamento', extensions: ['img', 'dsk', 'vdk', 'jvc', 'dmk', 'ima', 'bin', 'raw', 'vhd'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return { cancelled: true };
  const filePath = result.filePaths[0];
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
          locator: { kind: 'fat', cluster: f.firstCluster, size: f.size },
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
      const buf = readFileWithProgress(filePath, stat.size, 'read');
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
        return { success: true, kind: 'os9', filePath, fileName, os9Base: 0, os9Volume, entries: [] };
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
    // plain dsk / container
    const total = fs.statSync(filePath).size;
    const buf = readFileWithProgress(filePath, total, 'read');
    return { success: true, image: new Uint8Array(buf) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
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

// 3c1c2. Write ONE MiniIDE disk back IN PLACE into the .img at its slot offset. The disk must be a
// standard 161,280-byte (35-track) RS-DOS image; the slot is 322,560 (sector-doubled).
//   SAFETY: read tests on real .img show the doubled "odd" sub-sectors are NOT identical copies (raw
//   CF leftovers/2nd copy the HDBDOS firmware may keep). So we DON'T re-double blindly — we read the
//   current slot and overwrite ONLY the EVEN 256-byte sub-sectors (the actual CoCo sectors that
//   de-double reads), preserving every odd sub-sector byte-for-byte. Minimal, reversible change.
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
    } finally { fs.closeSync(fd); }
    return { success: true };
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
      { name: 'Disk Images (RS-DOS / Dragon)', extensions: ['dsk', 'vdk'] },
      { name: 'RS-DOS Disk Image', extensions: ['dsk'] },
      { name: 'Dragon VDK Image', extensions: ['vdk'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false, cancelled: true };
  try {
    const fp = result.filePaths[0];
    const buf = fs.readFileSync(fp);
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
ipcMain.handle('save-cartridge-file', async (_, romUint8Array: Uint8Array, defaultName: string, title?: string, customFilters?: any[]) => {
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
    const romBuffer = Buffer.from(romUint8Array);
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

