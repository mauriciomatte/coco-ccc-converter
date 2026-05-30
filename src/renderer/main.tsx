import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './src/App';
import './index.css';

// 1. Polyfill Buffer for browser environment
import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;

// Direct imports of conversion modules for the web compatibility layer
import { decodeWav } from '../main/converter/wav';
import { parseCas } from '../main/converter/cas';
import { parseDsk, extractDskFile, sortDskDirectory, isRsDosDisk } from '../main/converter/dsk';
import { parseBin } from '../main/converter/bin';
import { compileBootstrap } from '../main/converter/bootstrap';

// 2. Web browser-only compatibility fallback layer
if (!(window as any).cocoApi) {
  (window as any).cocoApi = {
    selectFile: () => {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.wav,.cas,.dsk,.bin,.ccc,.hex';
        input.onchange = (e: any) => {
          const file = e.target.files[0];
          if (!file) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const buffer = Buffer.from(reader.result as ArrayBuffer);
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            resolve({
              filePath: file.name,
              fileName: file.name,
              fileExt: ext,
              size: buffer.length,
              buffer: buffer
            });
          };
          reader.readAsArrayBuffer(file);
        };
        input.click();
      });
    },

    readDskDirectory: async (dskUint8Array: Uint8Array) => {
      try {
        const buffer = Buffer.from(dskUint8Array);
        const parsed = parseDsk(buffer);
        return { success: true, files: parsed.files };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    dskSortDirectory: async (dskUint8Array: Uint8Array) => {
      try {
        const img = sortDskDirectory(Buffer.from(dskUint8Array));
        return { success: true, image: new Uint8Array(img) };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    xroarPickFile: async () => ({ cancelled: true }),
    imageAnalyze: async () => ({ success: false, error: 'Importação de imagem disponível apenas no app desktop.' }),
    imageExtract: async () => ({ success: false, error: 'Extração disponível apenas no app desktop.' }),

    dskDetectContainer: async (dskUint8Array: Uint8Array, stdDisk: number) => {
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
    },

    extractDskProgram: async (dskUint8Array: Uint8Array, fileEntry: any) => {
      try {
        const dskBuffer = Buffer.from(dskUint8Array);
        const rawFileContent = extractDskFile(dskBuffer, fileEntry);
        
        let loadAddr = 0x1000;
        let execAddr = 0x1000;
        let payload = rawFileContent;

        if (fileEntry.fileType === 2) {
          try {
            const binParsed = parseBin(rawFileContent);
            loadAddr = binParsed.loadAddr;
            execAddr = binParsed.execAddr;
            payload = binParsed.payload;
          } catch (err) {}
        }

        return {
          success: true,
          loadAddr,
          execAddr,
          payload: new Uint8Array(payload),
          rawExtractedSize: rawFileContent.length
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    decodeWavAudio: async (wavUint8Array: Uint8Array) => {
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
          blocks: parsedCas.blocks.map((b: any) => ({
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
    },

    parseCasPayload: async (casUint8Array: Uint8Array) => {
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
          blocks: parsed.blocks.map((b: any) => ({
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
    },

    parseBinPayload: async (binUint8Array: Uint8Array) => {
      try {
        const binBuffer = Buffer.from(binUint8Array);
        const parsed = parseBin(binBuffer);
        return {
          success: true,
          loadAddr: parsed.loadAddr,
          execAddr: parsed.execAddr,
          payload: new Uint8Array(parsed.payload),
          segments: parsed.segments.map((s: any) => ({
            type: s.type,
            length: s.length,
            loadAddr: s.loadAddr,
            data: new Uint8Array(s.data)
          }))
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    compileCartridge: async (payloadUint8Array: Uint8Array, config: any) => {
      try {
        const payload = Buffer.from(payloadUint8Array);
        const compiled = compileBootstrap(payload, config);
        return {
          success: true,
          romBuffer: new Uint8Array(compiled.romBuffer),
          loaderSize: compiled.loaderSize,
          payloadRomOffset: compiled.payloadRomOffset
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    saveCartridgeFile: async (romUint8Array: Uint8Array, defaultName: string) => {
      try {
        const blob = new Blob([romUint8Array], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { success: true, filePath: `Browser Downloads/${defaultName}` };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },

    loadConfig: async () => {
      try {
        const data = localStorage.getItem('coco-config');
        return data ? JSON.parse(data) : null;
      } catch (err) {
        console.error('Error loading config from localStorage:', err);
        return null;
      }
    },

    saveConfig: async (config: any) => {
      try {
        localStorage.setItem('coco-config', JSON.stringify(config));
        return { success: true };
      } catch (err: any) {
        console.error('Error saving config to localStorage:', err);
        return { success: false, error: err.message };
      }
    }
  };
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
