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
    
  decodeWavAudio: (wavBuffer: Uint8Array) => 
    ipcRenderer.invoke('decode-wav-audio', wavBuffer),
    
  parseCasPayload: (casBuffer: Uint8Array) => 
    ipcRenderer.invoke('parse-cas-payload', casBuffer),
    
  parseBinPayload: (binBuffer: Uint8Array) => 
    ipcRenderer.invoke('parse-bin-payload', binBuffer),
    
  compileCartridge: (payloadBuffer: Uint8Array, config: BootstrapConfig) => 
    ipcRenderer.invoke('compile-cartridge', payloadBuffer, config),
    
  saveCartridgeFile: (romBuffer: Uint8Array, defaultName: string) => 
    ipcRenderer.invoke('save-cartridge-file', romBuffer, defaultName),
    
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config)
};

// Safe Context Bridge exposure
contextBridge.exposeInMainWorld('cocoApi', api);

// Declare window types for TS
declare global {
  interface Window {
    cocoApi: typeof api;
  }
}
