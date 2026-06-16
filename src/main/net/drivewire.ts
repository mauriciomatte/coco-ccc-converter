// Servidor DriveWire (serial) — transporte NATIVO do CoCo por cabo. Espelha o papel do servidor TNFS
// (net/tnfsServer.ts), mas em vez de WiFi/UDP fala o protocolo DriveWire por uma porta serial.
//
// O CoCo (com a ROM HDB-DOS/DW correspondente ao modelo) vê até 4 "drives" (0–3); cada um é um .dsk no PC.
// Setores de 256 bytes, LSN de 24 bits. Implementa os opcodes de SERVIR DISCO (não os canais virtuais
// de internet/impressora do DriveWire 4): READ/READEX/REREAD/REREADEX, WRITE/REWRITE, TIME, INIT/TERM/NOP.
//
// Spec: github.com/boisy/DriveWire (DriveWire Specification.md). Validar na PLACA/CABO real (gate humano).
import * as fs from 'fs';
import { createRequire } from 'node:module';

// serialport é MÓDULO NATIVO (node-gyp-build): tem que ser carregado em RUNTIME, de node_modules — NÃO
// estaticamente, senão o bundler (electron-vite) o inlinearia e o node-gyp-build procuraria os prebuilds
// relativos a out/ → "No native build was found for runtime=electron". `createRequire(__filename)` dá um
// require real (não rastreado pelo bundler); carregamos de forma LAZY (só ao usar o DriveWire) para um
// nativo ausente não derrubar o app inteiro no boot — o erro aparece no log ao ligar o servidor.
const nativeRequire = createRequire(__filename);
function loadSerialPort(): typeof import('serialport') {
  return nativeRequire('serialport') as typeof import('serialport');
}

// --- Opcodes (DriveWire Specification) ---
const OP_NOP = 0x00;
const OP_INIT = 0x49;       // 'I'
const OP_TERM = 0x54;       // 'T'
const OP_TIME = 0x23;       // '#'
const OP_READ = 0x52;       // 'R'  → resp: erro(1) + checksum(2 MSB) + 256 dados
const OP_REREAD = 0x72;     // 'r'  idêntico ao READ
const OP_READEX = 0xD2;     //      → resp: 256 dados; CoCo manda checksum(2); resp erro(1)
const OP_REREADEX = 0xF2;   //      idêntico ao READEX
const OP_WRITE = 0x57;      // 'W'  req: drive(1)+LSN(3)+256 dados+checksum(2) → resp erro(1)
const OP_REWRITE = 0x77;    // 'w'  idêntico ao WRITE

// --- Códigos de erro (espelham o OS-9) ---
const E_NONE = 0x00;
const E_CRC = 0xF3;   // 243 — checksum não bateu
const E_WRITE = 0xF5; // 245 — erro de escrita (ex.: drive só-leitura)
const E_NOTRDY = 0xF6;// 246 — drive não pronto (slot vazio)

const SECTOR = 256;

export interface DwDrive {
  slot: number;          // 0..3
  filePath: string;      // .dsk servido
  writable: boolean;
  buffer: Buffer;        // conteúdo em memória (setores crus)
}

export interface DwServerHandle {
  stop: () => void;
  reloadDrive: (slot: number) => { success: boolean; size?: number; error?: string };
  portPath: string;
  baudRate: number;
  drives: { slot: number; filePath: string; writable: boolean; size: number }[];
}

type LogFn = (pt: string, en: string, type?: string) => void;

/**
 * Checksum DriveWire = soma de 16 bits dos 256 bytes do setor (compatível com pyDriveWire, que
 * interopera com hardware real). A spec mostra uma função C com `while(--count)`; mantemos a soma
 * COMPLETA dos 256 bytes — se o hardware real acusar CRC, este é o ÚNICO ponto a revisar.
 */
function dwChecksum(data: Buffer): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum = (sum + data[i]) & 0xffff;
  return sum & 0xffff;
}

/** Inicia o servidor DriveWire numa porta serial servindo até 4 drives. */
export async function startDriveWireServer(
  opts: { portPath: string; baudRate: number; drives: { slot: number; filePath: string; writable: boolean }[] },
  log: LogFn
): Promise<DwServerHandle> {
  // Carrega cada disco em memória (setores crus). Discos editados em RW são gravados de volta no .dsk.
  const drives = new Map<number, DwDrive>();
  for (const d of opts.drives) {
    if (d.slot < 0 || d.slot > 3 || !d.filePath) continue;
    const buf = fs.readFileSync(d.filePath);
    drives.set(d.slot, { slot: d.slot, filePath: d.filePath, writable: !!d.writable, buffer: Buffer.from(buf) });
  }

  const { SerialPort } = loadSerialPort();
  const port = new SerialPort({ path: opts.portPath, baudRate: opts.baudRate, autoOpen: false });

  await new Promise<void>((resolve, reject) => {
    port.open((err) => (err ? reject(err) : resolve()));
  });

  // --- Parser incremental: acumula bytes e processa mensagens completas ---
  let inbuf = Buffer.alloc(0);
  // Estado para o READEX: após enviar os 256 dados, esperamos 2 bytes de checksum do CoCo.
  let awaitingReadexCk: number | null = null; // checksum que NÓS calculamos (p/ comparar)

  const sectorOf = (drive: DwDrive | undefined, lsn: number): { err: number; data?: Buffer } => {
    if (!drive) return { err: E_NOTRDY };
    const off = lsn * SECTOR;
    const out = Buffer.alloc(SECTOR); // setor fora do fim do disco = zeros (não quebra format/probe)
    if (off < drive.buffer.length) drive.buffer.copy(out, 0, off, Math.min(off + SECTOR, drive.buffer.length));
    return { err: E_NONE, data: out };
  };

  const writeSector = (drive: DwDrive | undefined, lsn: number, data: Buffer): number => {
    if (!drive) return E_NOTRDY;
    if (!drive.writable) return E_WRITE;
    const off = lsn * SECTOR;
    if (off + SECTOR > drive.buffer.length) {
      // cresce o buffer (zero-pad) p/ acomodar — discos DriveWire podem ter qualquer tamanho
      const grown = Buffer.alloc(off + SECTOR);
      drive.buffer.copy(grown, 0);
      drive.buffer = grown;
    }
    data.copy(drive.buffer, off, 0, SECTOR);
    try { fs.writeSync(fs.openSync(drive.filePath, 'r+'), drive.buffer, off, SECTOR, off); } // grava só o setor
    catch { try { fs.writeFileSync(drive.filePath, drive.buffer); } catch { return E_WRITE; } }
    return E_NONE;
  };

  const handleRead = (op: number, drive: number, lsn: number, ex: boolean) => {
    const r = sectorOf(drives.get(drive), lsn);
    if (r.err !== E_NONE || !r.data) { port.write(Buffer.from([r.err])); return; }
    const ck = dwChecksum(r.data);
    if (ex) {
      // READEX: manda só os dados; o CoCo devolve o checksum; respondemos o status depois.
      port.write(r.data);
      awaitingReadexCk = ck;
    } else {
      // READ: erro(1) + checksum(2 MSB) + 256 dados.
      const head = Buffer.from([E_NONE, (ck >> 8) & 0xff, ck & 0xff]);
      port.write(Buffer.concat([head, r.data]));
    }
    log(`DW READ${ex ? 'EX' : ''} drive ${drive} LSN ${lsn}`, `DW READ${ex ? 'EX' : ''} drive ${drive} LSN ${lsn}`, 'info');
  };

  const handleWrite = (drive: number, lsn: number, data: Buffer, ck: number) => {
    const our = dwChecksum(data);
    if (our !== ck) { port.write(Buffer.from([E_CRC])); log(`DW WRITE CRC drive ${drive} LSN ${lsn}`, `DW WRITE CRC drive ${drive} LSN ${lsn}`, 'warn'); return; }
    const err = writeSector(drives.get(drive), lsn, data);
    port.write(Buffer.from([err]));
    log(`DW WRITE drive ${drive} LSN ${lsn}${err ? ' (erro/RO)' : ''}`, `DW WRITE drive ${drive} LSN ${lsn}${err ? ' (err/RO)' : ''}`, err ? 'warn' : 'info');
  };

  const handleTime = () => {
    const d = new Date();
    port.write(Buffer.from([
      (d.getFullYear() - 1900) & 0xff, d.getMonth() + 1, d.getDate(),
      d.getHours(), d.getMinutes(), d.getSeconds(),
    ]));
  };

  const step = (): boolean => {
    if (inbuf.length === 0) return false;
    // Se estamos esperando o checksum do READEX, os próximos 2 bytes são esse checksum.
    if (awaitingReadexCk !== null) {
      if (inbuf.length < 2) return false;
      const got = (inbuf[0] << 8) | inbuf[1];
      const ok = got === awaitingReadexCk;
      port.write(Buffer.from([ok ? E_NONE : E_CRC]));
      awaitingReadexCk = null;
      inbuf = inbuf.subarray(2);
      return true;
    }
    const op = inbuf[0];
    switch (op) {
      case OP_NOP: case OP_INIT: case OP_TERM:
        inbuf = inbuf.subarray(1); return true;
      case OP_TIME:
        inbuf = inbuf.subarray(1); handleTime(); return true;
      case OP_READ: case OP_REREAD: case OP_READEX: case OP_REREADEX: {
        if (inbuf.length < 5) return false;
        const drive = inbuf[1];
        const lsn = (inbuf[2] << 16) | (inbuf[3] << 8) | inbuf[4];
        const ex = (op === OP_READEX || op === OP_REREADEX);
        inbuf = inbuf.subarray(5);
        handleRead(op, drive, lsn, ex);
        return awaitingReadexCk === null; // se READEX, paramos até chegar o checksum
      }
      case OP_WRITE: case OP_REWRITE: {
        if (inbuf.length < 5 + SECTOR + 2) return false;
        const drive = inbuf[1];
        const lsn = (inbuf[2] << 16) | (inbuf[3] << 8) | inbuf[4];
        const data = Buffer.from(inbuf.subarray(5, 5 + SECTOR));
        const ck = (inbuf[5 + SECTOR] << 8) | inbuf[5 + SECTOR + 1];
        inbuf = inbuf.subarray(5 + SECTOR + 2);
        handleWrite(drive, lsn, data, ck);
        return true;
      }
      default:
        // opcode desconhecido (canal serial virtual etc. — fora do escopo): descarta 1 byte.
        inbuf = inbuf.subarray(1); return true;
    }
  };

  port.on('data', (chunk: Buffer) => {
    inbuf = Buffer.concat([inbuf, chunk]);
    // processa todas as mensagens completas disponíveis
    let guard = 0;
    while (step()) { if (++guard > 100000) break; }
  });

  port.on('error', (e) => log(`DriveWire: erro na serial — ${e.message}`, `DriveWire: serial error — ${e.message}`, 'error'));

  log(`Servidor DriveWire LIGADO em ${opts.portPath} @ ${opts.baudRate} baud (${drives.size} drive(s)).`,
      `DriveWire server STARTED on ${opts.portPath} @ ${opts.baudRate} baud (${drives.size} drive(s)).`, 'success');

  return {
    portPath: opts.portPath,
    baudRate: opts.baudRate,
    drives: opts.drives.map(d => ({ slot: d.slot, filePath: d.filePath, writable: d.writable, size: drives.get(d.slot)?.buffer.length || 0 })),
    stop: () => { try { port.close(); } catch { /* */ } },
    // Relê o .dsk do drive (origem) para o buffer em memória — reflete edições feitas no arquivo enquanto
    // o servidor está no ar, sem reabrir a porta serial. O CoCo passa a ler a versão nova no próximo READ.
    reloadDrive: (slot: number) => {
      const drv = drives.get(slot);
      if (!drv) return { success: false, error: 'Drive vazio.' };
      try {
        drv.buffer = Buffer.from(fs.readFileSync(drv.filePath));
        log(`DW drive ${slot}: ${drv.filePath} recarregado da origem (${drv.buffer.length} B).`,
            `DW drive ${slot}: ${drv.filePath} reloaded from source (${drv.buffer.length} B).`, 'info');
        return { success: true, size: drv.buffer.length };
      } catch (e: any) { return { success: false, error: e?.message }; }
    },
  };
}

/** Lista as portas seriais disponíveis (p/ o dropdown da UI). */
export async function listSerialPorts(): Promise<{ path: string; label: string }[]> {
  try {
    const { SerialPort } = loadSerialPort();
    const ports = await SerialPort.list();
    return ports.map(p => ({
      path: p.path,
      label: p.path + (p.manufacturer ? ` — ${p.manufacturer}` : '') + (p.friendlyName ? ` (${p.friendlyName})` : ''),
    }));
  } catch {
    return [];
  }
}
