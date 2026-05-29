import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { decodeWav } from './converter/wav';
import { parseCas } from './converter/cas';
import { parseDsk, extractDskFile, addDskFile, deleteDskFile, DskFileEntry } from './converter/dsk';
import { parseBin } from './converter/bin';
import { compileBootstrap, BootstrapConfig } from './converter/bootstrap';
import { encodeCas, encodeDsk, buildCocoFlashBin, CasFileInput, DskFileInput } from './converter/export';

let mainWindow: BrowserWindow | null = null;

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
      nodeIntegration: false
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
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
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

// --- IPC Channel Handlers ---

// 1. Select and read any file
ipcMain.handle('select-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Color Computer Files', extensions: ['cas', 'dsk', 'bin', 'ccc', 'hex'] },
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
    const parsed = parseDsk(buffer);
    return { success: true, files: parsed.files, freeGranules: parsed.freeGranules, totalGranules: parsed.totalGranules };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2b. Extract the RAW stored bytes of a .dsk file (for copy/cut between images)
ipcMain.handle('dsk-extract-raw', async (_, dskUint8Array: Uint8Array, entry: DskFileEntry) => {
  try {
    const raw = extractDskFile(Buffer.from(dskUint8Array), entry);
    return { success: true, data: new Uint8Array(raw) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2c. Add raw bytes as a file into a .dsk image (paste / drop)
ipcMain.handle('dsk-add-bytes', async (_, dskUint8Array: Uint8Array, name: string, ext: string, fileType: number, asciiFlag: number, dataUint8Array: Uint8Array) => {
  try {
    const img = addDskFile(Buffer.from(dskUint8Array), name, ext, fileType, asciiFlag, Buffer.from(dataUint8Array));
    return { success: true, image: new Uint8Array(img) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2d. Create a fresh blank 35-track RS-DOS .dsk image
ipcMain.handle('dsk-new-blank', async () => {
  try {
    const img = encodeDsk([]);
    return { success: true, image: new Uint8Array(img) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 2e. Pick a .bin/.bas file (dialog) and return its bytes + inferred type (no add yet)
ipcMain.handle('pick-coco-file', async () => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select .BIN / .BAS file',
    properties: ['openFile'],
    filters: [{ name: 'CoCo Files', extensions: ['bin', 'bas'] }, { name: 'All Files', extensions: ['*'] }]
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

// 3. Extract DSK program and parse details
ipcMain.handle('extract-dsk-program', async (_, dskUint8Array: Uint8Array, fileEntry: DskFileEntry) => {
  try {
    const dskBuffer = Buffer.from(dskUint8Array);
    const rawFileContent = extractDskFile(dskBuffer, fileEntry);
    
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
ipcMain.handle('dsk-delete-file', async (_, dskUint8Array: Uint8Array, entry: DskFileEntry) => {
  try {
    const img = deleteDskFile(Buffer.from(dskUint8Array), entry);
    return { success: true, image: new Uint8Array(img) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 3d. Open a .dsk image into a DSK-manager pane (dialog + parse + free-space info)
ipcMain.handle('open-dsk-pane', async () => {
  if (!mainWindow) return { success: false, error: 'No application window.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open .DSK image',
    properties: ['openFile'],
    filters: [
      { name: 'RS-DOS Disk Image', extensions: ['dsk'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false, cancelled: true };
  try {
    const fp = result.filePaths[0];
    const buf = fs.readFileSync(fp);
    const parsed = parseDsk(buf);
    return {
      success: true,
      buffer: new Uint8Array(buf),
      fileName: path.basename(fp),
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

ipcMain.handle('gw-read', async (_, opts: any) => {
  const tmp = path.join(app.getPath('temp'), `gw-read-${Date.now()}.dsk`);
  const args = ['read', '--format', String(opts.format), ...gwExtraArgs(opts), tmp];
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
  const args = ['write', '--format', String(opts.format), ...gwExtraArgs(opts), tmp];
  const r = await runGw(opts.gwPath, args);
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  return { success: r.code === 0, code: r.code };
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
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (err: any) {
    console.error('Error saving config file:', err);
    return { success: false, error: err.message };
  }
});

