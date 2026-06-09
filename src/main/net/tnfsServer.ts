// Servidor TNFS (UDP 16384) — lado SERVIDOR do protocolo do FujiNet. Read-only.
// Serve um "provedor": (a) PASTA real, ou (b) CONTAINER (MiniIDE/CoCoSDC-FAT/DriveWire) cujos discos
// internos viram arquivos .dsk. Implementa MOUNT/UMOUNT/OPENDIR/READDIR/CLOSEDIR/STAT/OPEN/READ/CLOSE/LSEEK.
// LSEEK é essencial: o driver do FujiNet lê SETORES por posição (random access) nas imagens de disco.
import * as dgram from 'dgram';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deDoubleDisk, scanMiniIdeImage } from '../converter/dsk';
import { Reader, readFatVolume, listFatFiles, readFatFile } from '../converter/fat';

const PORT = 16384;
const EOF = 0x21, EINVAL = 0x16, ENOENT = 0x02, EBADF = 0x09;
const DBL_SLOT = 322560;       // slot HDBDOS de um disco RS-DOS 35T "dobrado" (MiniIDE)
const STD_DISK = 161280;       // disco RS-DOS 35T (DriveWire)
const MAX_WHOLE = 512 * 1024 * 1024; // teto p/ carregar container inteiro na memória (MiniIDE/DriveWire)

export interface SrvEntry { name: string; isDir: boolean; size: number }
export interface TnfsProvider {
  describe: string;
  list(p: string): SrvEntry[];
  stat(p: string): { isDir: boolean; size: number } | null;
  read(p: string): Buffer | null;   // bytes COMPLETOS do arquivo (discos são pequenos)
  dispose?(): void;
}

const norm = (p: string) => ('/' + (p || '')).replace(/\/+/g, '/').replace(/\/$/, '') || '/';

// ---------- Provedor de PASTA ----------
export function folderProvider(root: string): TnfsProvider {
  const base = path.resolve(root);
  const real = (p: string) => {
    const r = path.resolve(base, '.' + norm(p));      // norm começa com '/'
    if (r !== base && !r.startsWith(base + path.sep)) return null; // anti path-traversal
    return r;
  };
  return {
    describe: `pasta: ${base}`,
    list(p) {
      const dir = real(p); if (!dir) return [];
      try {
        return fs.readdirSync(dir).map(name => {
          try { const st = fs.statSync(path.join(dir, name)); return { name, isDir: st.isDirectory(), size: st.size }; }
          catch { return { name, isDir: false, size: 0 }; }
        });
      } catch { return []; }
    },
    stat(p) {
      const f = real(p); if (!f) return null;
      try { const st = fs.statSync(f); return { isDir: st.isDirectory(), size: st.size }; } catch { return null; }
    },
    read(p) {
      const f = real(p); if (!f) return null;
      try { const st = fs.statSync(f); if (st.isDirectory()) return null; return fs.readFileSync(f); } catch { return null; }
    },
  };
}

// ---------- Provedor de CONTAINER (lista plana de discos como .dsk) ----------
export function containerProvider(file: string): TnfsProvider {
  const entries = new Map<string, () => Buffer>();
  const sizes = new Map<string, number>();
  let label = 'container';
  let fd = -1;

  const add = (name: string, size: number, get: () => Buffer) => { entries.set(name, get); sizes.set(name, size); };

  // 1) CoCoSDC (FAT) — acesso aleatório por arquivo (não carrega tudo na memória).
  fd = fs.openSync(file, 'r');
  const read: Reader = (off, len) => { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, off); return b; };
  const vol = (() => { try { return readFatVolume(read); } catch { return null; } })();
  if (vol) {
    label = 'CoCoSDC (FAT)';
    const files = listFatFiles(read, vol, ['dsk', 'os9', 'vdk', 'jvc', 'dmk', 'sdf', 'ccc', 'cas']);
    for (const f of files) add(f.name, f.size, () => readFatFile(read, vol, f));
    return { describe: `${label} · ${entries.size} discos`, ...flat(entries, sizes), dispose: () => { try { fs.closeSync(fd); } catch { /* */ } } };
  }
  try { fs.closeSync(fd); } catch { /* */ } fd = -1;

  // 2) MiniIDE / DriveWire — precisa do conteúdo; carrega inteiro (com teto).
  const stat = fs.statSync(file);
  if (stat.size > MAX_WHOLE) throw new Error('Container grande demais para servir inteiro; sirva uma PASTA.');
  const buf = fs.readFileSync(file);

  const mini = (() => { try { return scanMiniIdeImage(buf); } catch { return []; } })();
  const occupied = mini.filter(d => d.state === 'occupied');
  if (occupied.length > 0) {
    label = 'MiniIDE (HDBDOS)';
    for (const d of occupied) {
      const nm = `${String(d.slot).padStart(3, '0')}_${(d.name || d.label || 'DISK').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 16) || 'DISK'}.dsk`;
      const off = d.offset;
      add(nm, STD_DISK, () => deDoubleDisk(buf.subarray(off, off + DBL_SLOT)));
    }
    return { describe: `${label} · ${entries.size} discos`, ...flat(entries, sizes) };
  }

  // 3) DriveWire — concatenação de discos de 161.280 B.
  if (buf.length >= STD_DISK && buf.length % STD_DISK === 0) {
    label = 'DriveWire';
    const n = buf.length / STD_DISK;
    for (let i = 0; i < n; i++) {
      const off = i * STD_DISK;
      add(`disk${String(i).padStart(3, '0')}.dsk`, STD_DISK, () => Buffer.from(buf.subarray(off, off + STD_DISK)));
    }
    return { describe: `${label} · ${n} discos`, ...flat(entries, sizes) };
  }

  // 4) imagem única → serve como um arquivo só.
  const single = path.basename(file);
  add(single, buf.length, () => buf);
  return { describe: `imagem única (${single})`, ...flat(entries, sizes) };
}

// helper: transforma o mapa plano de entradas num provedor (raiz lista tudo; arquivos por nome).
function flat(entries: Map<string, () => Buffer>, sizes: Map<string, number>) {
  const nameOf = (p: string) => norm(p).replace(/^\//, '');
  return {
    list(p: string): SrvEntry[] {
      if (norm(p) !== '/') return [];
      return [...sizes].map(([name, size]) => ({ name, isDir: false, size }));
    },
    stat(p: string) {
      if (norm(p) === '/') return { isDir: true, size: 0 };
      const n = nameOf(p); return sizes.has(n) ? { isDir: false, size: sizes.get(n)! } : null;
    },
    read(p: string) { const g = entries.get(nameOf(p)); return g ? g() : null; },
  };
}

// ---------- Servidor ----------
interface Session { dirs: Map<number, { items: SrvEntry[]; idx: number }>; files: Map<number, { data: Buffer; pos: number }>; nextH: number }

export interface TnfsServerHandle {
  port: number; ip: string; describe: string;
  stop(): void;
}

export function localIPv4(): string {
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) for (const ni of ifs[name] || [])
    if (ni.family === 'IPv4' && !ni.internal) return ni.address;
  return '127.0.0.1';
}

const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.from([0])]);
const readCstr = (b: Buffer, o: number) => { let e = o; while (e < b.length && b[e] !== 0) e++; return { s: b.toString('latin1', o, e), end: e + 1 }; };

export function startTnfsServer(provider: TnfsProvider, onLog?: (pt: string, en: string, type?: string) => void): Promise<TnfsServerHandle> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const sessions = new Map<number, Session>();
    let nextConn = 1;

    const reply = (rinfo: dgram.RemoteInfo, connId: number, seq: number, cmd: number, body: Buffer) => {
      const hdr = Buffer.alloc(4); hdr.writeUInt16LE(connId & 0xffff, 0); hdr[2] = seq; hdr[3] = cmd;
      sock.send(Buffer.concat([hdr, body]), rinfo.port, rinfo.address);
    };
    const err = (rinfo: dgram.RemoteInfo, connId: number, seq: number, cmd: number, code: number) => reply(rinfo, connId, seq, cmd, Buffer.from([code]));

    sock.on('message', (msg, rinfo) => {
      if (msg.length < 4) return;
      const connId = msg.readUInt16LE(0), seq = msg[2], cmd = msg[3];
      const payload = msg.subarray(4);
      try {
        if (cmd === 0x00) { // MOUNT
          const id = nextConn++; if (nextConn > 0xfffe) nextConn = 1;
          sessions.set(id, { dirs: new Map(), files: new Map(), nextH: 1 });
          onLog?.(`Servidor TNFS: cliente ${rinfo.address} conectou (sessão ${id}).`, `TNFS server: client ${rinfo.address} connected (session ${id}).`, 'info');
          // status=0 + versão do servidor (1.2) + retry mínimo (ms)
          reply(rinfo, id, seq, cmd, Buffer.from([0x00, 0x02, 0x01, 0xe8, 0x03]));
          return;
        }
        const sess = sessions.get(connId);
        if (!sess) { err(rinfo, connId, seq, cmd, EBADF); return; }
        switch (cmd) {
          case 0x01: { sessions.delete(connId); reply(rinfo, connId, seq, cmd, Buffer.from([0x00])); break; } // UMOUNT
          case 0x10: { // OPENDIR
            const { s: p } = readCstr(payload, 0);
            const st = provider.stat(p);
            if (!st || !st.isDir) { err(rinfo, connId, seq, cmd, ENOENT); break; }
            const h = sess.nextH++ & 0xff; sess.dirs.set(h, { items: provider.list(p), idx: 0 });
            reply(rinfo, connId, seq, cmd, Buffer.from([0x00, h])); break;
          }
          case 0x11: { // READDIR
            const h = payload[0]; const d = sess.dirs.get(h);
            if (!d) { err(rinfo, connId, seq, cmd, EBADF); break; }
            if (d.idx >= d.items.length) { err(rinfo, connId, seq, cmd, EOF); break; }
            const name = d.items[d.idx++].name;
            reply(rinfo, connId, seq, cmd, Buffer.concat([Buffer.from([0x00]), cstr(name)])); break;
          }
          case 0x12: { sess.dirs.delete(payload[0]); reply(rinfo, connId, seq, cmd, Buffer.from([0x00])); break; } // CLOSEDIR
          case 0x24: { // STAT
            const { s: p } = readCstr(payload, 0);
            const st = provider.stat(p);
            if (!st) { err(rinfo, connId, seq, cmd, ENOENT); break; }
            const b = Buffer.alloc(1 + 24, 0);
            b[0] = 0x00;
            b.writeUInt16LE(st.isDir ? 0x41ff : 0x81a4, 1); // mode (dir 0x4000|0777 / reg 0x8000|0644)
            b.writeUInt32LE(st.size >>> 0, 7);              // size @ +6 do struct
            reply(rinfo, connId, seq, cmd, b); break;
          }
          case 0x29: case 0x20: { // OPEN (novo/antigo)
            const off = cmd === 0x29 ? 4 : 2; // 0x29: flags(2)+mode(2)+path; 0x20: flags(2)+path
            const { s: p } = readCstr(payload, off);
            const data = provider.read(p);
            if (!data) { err(rinfo, connId, seq, cmd, ENOENT); break; }
            const h = sess.nextH++ & 0xff; sess.files.set(h, { data, pos: 0 });
            reply(rinfo, connId, seq, cmd, Buffer.from([0x00, h])); break;
          }
          case 0x21: { // READ
            const fdn = payload[0]; const want = payload.readUInt16LE(1); const f = sess.files.get(fdn);
            if (!f) { err(rinfo, connId, seq, cmd, EBADF); break; }
            if (f.pos >= f.data.length) { err(rinfo, connId, seq, cmd, EOF); break; }
            const chunk = f.data.subarray(f.pos, Math.min(f.data.length, f.pos + want)); f.pos += chunk.length;
            const head = Buffer.alloc(3); head[0] = 0x00; head.writeUInt16LE(chunk.length, 1);
            reply(rinfo, connId, seq, cmd, Buffer.concat([head, chunk])); break;
          }
          case 0x25: { // LSEEK: fd(1) whence(1) offset(4 LE, signed)
            const fdn = payload[0], whence = payload[1]; const offv = payload.readInt32LE(2); const f = sess.files.get(fdn);
            if (!f) { err(rinfo, connId, seq, cmd, EBADF); break; }
            f.pos = whence === 1 ? f.pos + offv : whence === 2 ? f.data.length + offv : offv;
            if (f.pos < 0) f.pos = 0; if (f.pos > f.data.length) f.pos = f.data.length;
            reply(rinfo, connId, seq, cmd, Buffer.from([0x00])); break;
          }
          case 0x23: { sess.files.delete(payload[0]); reply(rinfo, connId, seq, cmd, Buffer.from([0x00])); break; } // CLOSE
          default: err(rinfo, connId, seq, cmd, EINVAL);
        }
      } catch { err(rinfo, connId, seq, cmd, EINVAL); }
    });

    sock.on('error', (e) => { try { sock.close(); } catch { /* */ } reject(e); });
    sock.bind(PORT, () => {
      const ip = localIPv4();
      resolve({
        port: PORT, ip, describe: provider.describe,
        stop() { try { sock.close(); } catch { /* */ } try { provider.dispose?.(); } catch { /* */ } },
      });
    });
  });
}
