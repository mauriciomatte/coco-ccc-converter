import { contextBridge, ipcRenderer } from 'electron';
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

  dskSortDirectory: (dskBuffer: Uint8Array) =>
    ipcRenderer.invoke('dsk-sort-directory', dskBuffer),

  dskDetectContainer: (dskBuffer: Uint8Array, stdDisk: number) =>
    ipcRenderer.invoke('dsk-detect-container', dskBuffer, stdDisk),

  imageAnalyze: () =>
    ipcRenderer.invoke('image-analyze'),

  imageExtract: (filePath: string, locator: any) =>
    ipcRenderer.invoke('image-extract', filePath, locator),

  onImageProgress: (cb: (p: any) => void) => {
    const listener = (_e: any, p: any) => cb(p);
    ipcRenderer.on('image-progress', listener);
    return () => ipcRenderer.removeListener('image-progress', listener);
  },

  openDskPane: () =>
    ipcRenderer.invoke('open-dsk-pane'),

  dskExtractRaw: (dskBuffer: Uint8Array, fileEntry: DskFileEntry) =>
    ipcRenderer.invoke('dsk-extract-raw', dskBuffer, fileEntry),

  dskAddBytes: (dskBuffer: Uint8Array, name: string, ext: string, fileType: number, asciiFlag: number, data: Uint8Array) =>
    ipcRenderer.invoke('dsk-add-bytes', dskBuffer, name, ext, fileType, asciiFlag, data),

  dskNewBlank: () =>
    ipcRenderer.invoke('dsk-new-blank'),

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

  saveCartridgeFile: (romBuffer: Uint8Array, defaultName: string, title?: string, filters?: any[]) => 
    ipcRenderer.invoke('save-cartridge-file', romBuffer, defaultName, title, filters),
    
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),

  // Greaseweazle
  gwInfo: (opts: any) => ipcRenderer.invoke('gw-info', opts),
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
