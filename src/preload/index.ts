import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { DskFileEntry } from '../main/converter/dsk';
import { BootstrapConfig } from '../main/converter/bootstrap';

// Define the API object to be exposed in the renderer context
const api = {
  selectFile: () => ipcRenderer.invoke('select-file'),
  
  readDskDirectory: (dskBuffer: Uint8Array) => 
    ipcRenderer.invoke('read-dsk-directory', dskBuffer),
    
  extractDskProgram: (dskBuffer: Uint8Array, fileEntry: DskFileEntry) =>
    ipcRenderer.invoke('extract-dsk-program', dskBuffer, fileEntry),

  dskAddFile: (dskBuffer: Uint8Array) =>
    ipcRenderer.invoke('dsk-add-file', dskBuffer),

  dskDeleteFile: (dskBuffer: Uint8Array, fileEntry: DskFileEntry) =>
    ipcRenderer.invoke('dsk-delete-file', dskBuffer, fileEntry),
  dskRenameFile: (dskBuffer: Uint8Array, fileEntry: any, newName: string, newExt: string) =>
    ipcRenderer.invoke('dsk-rename-file', dskBuffer, fileEntry, newName, newExt),

  dskSortDirectory: (dskBuffer: Uint8Array) =>
    ipcRenderer.invoke('dsk-sort-directory', dskBuffer),

  dskDetectContainer: (dskBuffer: Uint8Array, stdDisk: number) =>
    ipcRenderer.invoke('dsk-detect-container', dskBuffer, stdDisk),

  // DMK → raw sector image (read-only). Idempotente: bytes não-DMK voltam iguais.
  normalizeImage: (bytes: Uint8Array) => ipcRenderer.invoke('normalize-image', bytes),

  xroarPickFile: (kind?: string) =>
    ipcRenderer.invoke('xroar-pick-file', kind),
  k7Decode: (wavBytes: Uint8Array, opts?: any) => ipcRenderer.invoke('k7-decode', wavBytes, opts),
  k7ExportClean: (wavBytes: Uint8Array, opts: any, format: string, sampleRate: number, defaultName: string) => ipcRenderer.invoke('k7-export-clean', wavBytes, opts, format, sampleRate, defaultName),
  k7ExtractFile: (wavBytes: Uint8Array, opts: any, fileIndex: number) => ipcRenderer.invoke('k7-extract-file', wavBytes, opts, fileIndex),
  k7FileBytes: (wavBytes: Uint8Array, opts: any, fileIndex: number) => ipcRenderer.invoke('k7-file-bytes', wavBytes, opts, fileIndex),
  k7Stream: (wavBytes: Uint8Array, opts: any) => ipcRenderer.invoke('k7-stream', wavBytes, opts),
  k7CasBytes: (wavBytes: Uint8Array, opts: any) => ipcRenderer.invoke('k7-cas-bytes', wavBytes, opts),
  k7ExportSizes: (wavBytes: Uint8Array, opts: any, rate: number) => ipcRenderer.invoke('k7-export-sizes', wavBytes, opts, rate),
  k7ResampleWav: (wavBytes: Uint8Array, rate: number) => ipcRenderer.invoke('k7-resample-wav', wavBytes, rate),
  k7FileForDsk: (wavBytes: Uint8Array, opts: any, fileIndex: number) => ipcRenderer.invoke('k7-file-for-dsk', wavBytes, opts, fileIndex),
  k7CasToWav: (casBytes: Uint8Array, sampleRate?: number) => ipcRenderer.invoke('k7-cas-to-wav', casBytes, sampleRate),
  loaderScan: (wavBytes: Uint8Array, opts?: any) => ipcRenderer.invoke('loader-scan', wavBytes, opts),
  loaderBuild: (wavBytes: Uint8Array, opts: any, params: any) => ipcRenderer.invoke('loader-build', wavBytes, opts, params),
  loaderStrip: (binBytes: Uint8Array, name?: string) => ipcRenderer.invoke('loader-strip', binBytes, name),
  loaderRevert: () => ipcRenderer.invoke('loader-revert'),

  imageAnalyze: () =>
    ipcRenderer.invoke('image-analyze'),

  imageExtract: (filePath: string, locator: any) =>
    ipcRenderer.invoke('image-extract', filePath, locator),

  // OS-9 / NitrOS-9 (RBF) — somente-leitura. os9Read devolve a árvore hierárquica; os9Extract
  // salva um arquivo (seguindo FD.SEG) num caminho escolhido pelo usuário.
  os9Read: (filePath: string, base = 0) =>
    ipcRenderer.invoke('os9-read', filePath, base),

  os9Extract: (filePath: string, base: number, fdLsn: number, defaultName: string) =>
    ipcRenderer.invoke('os9-extract', filePath, base, fdLsn, defaultName),

  // OS-9 escrita (buffer em memória — discos .os9 editáveis no navegador)
  os9CreateBlank: (geomKey: string, name?: string) => ipcRenderer.invoke('os9-create-blank', geomKey, name),
  os9PickBuffer: () => ipcRenderer.invoke('os9-pick-buffer'),
  os9ParseBuffer: (buffer: Uint8Array) => ipcRenderer.invoke('os9-parse-buffer', buffer),
  os9MkdirBuffer: (buffer: Uint8Array, parentFdLsn: number, name: string) => ipcRenderer.invoke('os9-mkdir-buffer', buffer, parentFdLsn, name),
  os9RenameBuffer: (buffer: Uint8Array, dirFdLsn: number, oldName: string, newName: string) => ipcRenderer.invoke('os9-rename-buffer', buffer, dirFdLsn, oldName, newName),
  os9InsertBuffer: (buffer: Uint8Array, parentFdLsn: number, opts?: { name?: string; data?: Uint8Array; srcPath?: string }) => ipcRenderer.invoke('os9-insert-buffer', buffer, parentFdLsn, opts),
  os9DeleteBuffer: (buffer: Uint8Array, parentFdLsn: number, name: string) => ipcRenderer.invoke('os9-delete-buffer', buffer, parentFdLsn, name),
  os9DefragFileBuffer: (buffer: Uint8Array, fdLsn: number) => ipcRenderer.invoke('os9-defrag-file-buffer', buffer, fdLsn),
  os9DefragAllBuffer: (buffer: Uint8Array) => ipcRenderer.invoke('os9-defrag-all-buffer', buffer),
  os9ContainerEdit: (filePath: string, base: number, op: string, args: any) => ipcRenderer.invoke('os9-container-edit', filePath, base, op, args),
  os9ReadTreeBuffer: (buffer: Uint8Array, fdLsn: number, name: string) => ipcRenderer.invoke('os9-read-tree-buffer', buffer, fdLsn, name),
  os9ReadTreePath: (filePath: string, base: number, fdLsn: number, name: string) => ipcRenderer.invoke('os9-read-tree-path', filePath, base, fdLsn, name),
  os9ApplyTreeBuffer: (buffer: Uint8Array, dstParentFdLsn: number, tree: any) => ipcRenderer.invoke('os9-apply-tree-buffer', buffer, dstParentFdLsn, tree),
  os9OpenPath: (filePath: string) => ipcRenderer.invoke('os9-open-path', filePath),
  os9ReadFileBuffer: (buffer: Uint8Array, fdLsn: number) => ipcRenderer.invoke('os9-readfile-buffer', buffer, fdLsn),
  os9ReadFilePath: (filePath: string, base: number, fdLsn: number) => ipcRenderer.invoke('os9-readfile-path', filePath, base, fdLsn),
  // resolve o caminho real de um File arrastado (Electron ≥30 webUtils; fallback p/ file.path)
  getPathForFile: (file: File) => { try { return webUtils.getPathForFile(file); } catch { return (file as any).path || ''; } },
  os9ExtractBuffer: (buffer: Uint8Array, fdLsn: number, defaultName: string) => ipcRenderer.invoke('os9-extract-buffer', buffer, fdLsn, defaultName),
  os9SaveBuffer: (buffer: Uint8Array, defaultName: string) => ipcRenderer.invoke('os9-save-buffer', buffer, defaultName),
  os9SaveOverwrite: (filePath: string, buffer: Uint8Array) => ipcRenderer.invoke('os9-save-overwrite', filePath, buffer),
  os9MakeBootable: (buffer: Uint8Array) => ipcRenderer.invoke('os9-make-bootable', buffer),
  os9NewBootable: (geomKey: string, withPrograms: boolean, forceRef?: boolean) => ipcRenderer.invoke('os9-new-bootable', geomKey, withPrograms, forceRef),

  // FujiNet / Online
  netDownloadUrl: (url: string) => ipcRenderer.invoke('net-download-url', url),
  tnfsList: (host: string, path: string) => ipcRenderer.invoke('tnfs-list', host, path),
  tnfsListCancel: () => ipcRenderer.invoke('tnfs-list-cancel'),
  tnfsRead: (host: string, path: string) => ipcRenderer.invoke('tnfs-read', host, path),
  tnfsReadCancel: () => ipcRenderer.invoke('tnfs-read-cancel'),
  onTnfsProgress: (cb: (m: { got: number }) => void) => { const h = (_e: any, m: any) => cb(m); ipcRenderer.on('tnfs-progress', h); return () => ipcRenderer.removeListener('tnfs-progress', h); },
  tnfsCommunity: () => ipcRenderer.invoke('tnfs-community'),
  tnfsServerStart: (opts: { mode: string; path: string; writable?: boolean; hideExtra?: string[]; hideAllow?: string[] }) => ipcRenderer.invoke('tnfs-server-start', opts),
  tnfsServerStop: () => ipcRenderer.invoke('tnfs-server-stop'),
  tnfsServerStatus: () => ipcRenderer.invoke('tnfs-server-status'),
  tnfsServerPreview: (opts: { mode: string; path: string; hideExtra?: string[]; hideAllow?: string[] }) => ipcRenderer.invoke('tnfs-server-preview', opts),
  tnfsHiddenDefaults: () => ipcRenderer.invoke('tnfs-hidden-defaults'),
  onNetLog: (cb: (m: { pt: string; en: string; type?: string }) => void) => { const h = (_e: any, m: any) => cb(m); ipcRenderer.on('net-log', h); return () => ipcRenderer.removeListener('net-log', h); },
  zipExtract: (zipBytes: Uint8Array, entryName: string) => ipcRenderer.invoke('zip-extract', zipBytes, entryName),
  pickDirectory: () => ipcRenderer.invoke('pick-directory'),
  pickFile: (filters?: { name: string; extensions: string[] }[]) => ipcRenderer.invoke('pick-file', filters),

  onImageProgress: (cb: (p: any) => void) => {
    const listener = (_e: any, p: any) => cb(p);
    ipcRenderer.on('image-progress', listener);
    return () => ipcRenderer.removeListener('image-progress', listener);
  },

  onDragError: (cb: (msg: string) => void) => {
    const listener = (_e: any, msg: string) => cb(msg);
    ipcRenderer.on('drag-error', listener);
    return () => ipcRenderer.removeListener('drag-error', listener);
  },

  openDskPane: () =>
    ipcRenderer.invoke('open-dsk-pane'),

  dskExtractRaw: (dskBuffer: Uint8Array, fileEntry: DskFileEntry) =>
    ipcRenderer.invoke('dsk-extract-raw', dskBuffer, fileEntry),

  dskAddBytes: (dskBuffer: Uint8Array, name: string, ext: string, fileType: number, asciiFlag: number, data: Uint8Array) =>
    ipcRenderer.invoke('dsk-add-bytes', dskBuffer, name, ext, fileType, asciiFlag, data),

  dskNewBlank: (tracks?: number) =>
    ipcRenderer.invoke('dsk-new-blank', tracks),

  // Formata a imagem RS-DOS do buffer: 'quick' (só FAT+diretório) ou 'full' (imagem toda).
  dskFormat: (dskBuffer: Uint8Array, mode: 'quick' | 'full') =>
    ipcRenderer.invoke('dsk-format', dskBuffer, mode),

  // Seleciona um .dsk (35T RS-DOS) para inserir num slot vazio da MiniIDE.
  pickDiskImage: () =>
    ipcRenderer.invoke('pick-disk-image'),

  // Grava/renomeia o nome do drive SIDEKICK (LSN 322) numa imagem de-doubled.
  dskSetSidekickName: (dskBuffer: Uint8Array, name: string) =>
    ipcRenderer.invoke('dsk-set-sidekick-name', dskBuffer, name),

  dskNewBlankDragon: () =>
    ipcRenderer.invoke('dsk-new-blank-dragon'),

  buildDragonBin: (loadAddr: number, execAddr: number, payload: Uint8Array, mode: 'direct' | 'reloc') =>
    ipcRenderer.invoke('build-dragon-bin', loadAddr, execAddr, payload, mode),

  dskDefragFile: (dskBuffer: Uint8Array, fileEntry: DskFileEntry) =>
    ipcRenderer.invoke('dsk-defrag-file', dskBuffer, fileEntry),

  dskDefragDragon: (dskBuffer: Uint8Array) =>
    ipcRenderer.invoke('dsk-defrag-dragon', dskBuffer),

  // Grava UM disco editado de volta no slot da imagem MiniIDE (.img), no offset do slot.
  imageWriteSlot: (filePath: string, offset: number, diskBuffer: Uint8Array) =>
    ipcRenderer.invoke('image-write-slot', filePath, offset, diskBuffer),

  // É um disco OS-9 (RBF)? (decide rota p/ aba OS-9 ao extrair de um contêiner FAT/MiniIDE)
  os9DetectBuffer: (buffer: Uint8Array) => ipcRenderer.invoke('os9-detect-buffer', buffer),

  // Escrita FAT (D12 — CoCoSDC / RetroRewind): write-back de .dsk editado, inserir e excluir.
  imageFatWriteback: (filePath: string, innerPath: string, data: Uint8Array) =>
    ipcRenderer.invoke('image-fat-writeback', filePath, innerPath, data),
  imageFatAdd: (filePath: string, dirPath: string, name: string, data: Uint8Array) =>
    ipcRenderer.invoke('image-fat-add', filePath, dirPath, name, data),
  imageFatAddPick: (filePath: string, dirPath: string) =>
    ipcRenderer.invoke('image-fat-add-pick', filePath, dirPath),
  imageFatDelete: (filePath: string, innerPath: string) =>
    ipcRenderer.invoke('image-fat-delete', filePath, innerPath),

  // Drag-OUT nativo: extrai o arquivo para um temp e inicia o arrasto do SO (soltar no Explorer).
  startFileDrag: (dskBuffer: Uint8Array, fileEntry: any, fileName: string) =>
    ipcRenderer.send('start-file-drag', dskBuffer, fileEntry, fileName),
  startOs9FileDrag: (opts: { buf?: Uint8Array; filePath?: string; base?: number; fdLsn: number; name: string }) =>
    ipcRenderer.send('start-os9-file-drag', opts),

  pickCocoFile: () =>
    ipcRenderer.invoke('pick-coco-file'),
    
  decodeWavAudio: (wavBuffer: Uint8Array) => 
    ipcRenderer.invoke('decode-wav-audio', wavBuffer),
    
  parseCasPayload: (casBuffer: Uint8Array) => 
    ipcRenderer.invoke('parse-cas-payload', casBuffer),
    
  parseBinPayload: (binBuffer: Uint8Array) => 
    ipcRenderer.invoke('parse-bin-payload', binBuffer),
    
  compileCartridge: (payloadBuffer: Uint8Array, config: BootstrapConfig) =>
    ipcRenderer.invoke('compile-cartridge', payloadBuffer, config),

  buildEmulatorCas: (files: any[]) =>
    ipcRenderer.invoke('build-emulator-cas', files),

  buildEmulatorDsk: (files: any[]) =>
    ipcRenderer.invoke('build-emulator-dsk', files),

  buildCocoFlashBin: (romImage: Uint8Array) =>
    ipcRenderer.invoke('build-cocoflash-bin', romImage),

  saveCartridgeFile: (romBuffer: Uint8Array, defaultName: string, title?: string, filters?: any[], sdfGeom?: { sectorsPerTrack: number; sides: number }) =>
    ipcRenderer.invoke('save-cartridge-file', romBuffer, defaultName, title, filters, sdfGeom),

  saveDskOverwrite: (filePath: string, data: Uint8Array) =>
    ipcRenderer.invoke('save-dsk-overwrite', filePath, data),
    
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),

  // Fechamento da janela (X) -> abre o modal de "Sair" no renderer; confirmação fecha de verdade
  onAppCloseRequest: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('app-close-request', listener);
    return () => ipcRenderer.removeListener('app-close-request', listener);
  },
  appCloseConfirmed: () => ipcRenderer.invoke('app-close-confirmed'),

  // Greaseweazle
  gwPickExe: () => ipcRenderer.invoke('gw-pick-exe'),
  gwInfo: (opts: any) => ipcRenderer.invoke('gw-info', opts),
  gwRun: (opts: any, args: string[]) => ipcRenderer.invoke('gw-run', opts, args),
  gwRead: (opts: any) => ipcRenderer.invoke('gw-read', opts),
  gwWrite: (opts: any, image: Uint8Array) => ipcRenderer.invoke('gw-write', opts, image),
  onGwLog: (cb: (line: string) => void) => {
    const handler = (_e: any, line: string) => cb(line);
    ipcRenderer.on('gw-log', handler);
    return () => ipcRenderer.removeListener('gw-log', handler);
  }
};

// Safe Context Bridge exposure
contextBridge.exposeInMainWorld('cocoApi', api);

// Declare window types for TS
declare global {
  interface Window {
    cocoApi: typeof api;
  }
}
