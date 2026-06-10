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
const EOF = 0x21, EINVAL = 0x16, ENOENT = 0x02, EBADF = 0x09, EACCES = 0x0d, EIO = 0x05;
// flags do OPEN (TNFS, estilo POSIX): acesso nos 2 bits baixos + criação/truncamento
const O_ACCMODE = 0x0003, O_WRONLY = 0x0002, O_RDWR = 0x0003, O_APPEND = 0x0008, O_CREAT = 0x0100, O_TRUNC = 0x0200;
const DBL_SLOT = 322560;       // slot HDBDOS de um disco RS-DOS 35T "dobrado" (MiniIDE)
const STD_DISK = 161280;       // disco RS-DOS 35T (DriveWire)
const MAX_WHOLE = 512 * 1024 * 1024; // teto p/ carregar container inteiro na memória (MiniIDE/DriveWire)

export interface SrvEntry { name: string; isDir: boolean; size: number }
export interface TnfsProvider {
  describe: string;
  writable?: boolean;               // true → aceita OPEN/WRITE de gravação (só modo PASTA)
  list(p: string): SrvEntry[];
  stat(p: string): { isDir: boolean; size: number } | null;
  read(p: string): Buffer | null;   // bytes COMPLETOS do arquivo (discos são pequenos)
  writeFile?(p: string, data: Buffer): boolean;  // grava o arquivo INTEIRO de volta (flush no CLOSE)
  dispose?(): void;
}

const norm = (p: string) => ('/' + (p || '')).replace(/\/+/g, '/').replace(/\/$/, '') || '/';

// Glob simples (* e ?), case-insensitive — usado tanto p/ o filtro de arquivos ocultos quanto p/ o
// padrão de OPENDIRX. Casa o NOME do arquivo inteiro (ancorado).
const globToRe = (pat: string) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');

// Arquivos de SISTEMA/lixo (Windows + macOS + Linux) que NÃO devem ir para a FujiNet por padrão. A placa às
// vezes auto-seleciona o 1º arquivo da pasta e acabava pegando o `desktop.ini` em vez do disco. O filtro é
// por NOME do ARQUIVO FINAL (case-insensitive), aplicado na LISTAGEM e também no stat/read/writeFile → a placa
// não consegue nem pedir por nome. Exportado p/ a UI exibir os padrões.
export const DEFAULT_HIDDEN_NAMES: string[] = [
  // Windows
  'desktop.ini', 'thumbs.db', 'ehthumbs.db', 'ehthumbs_vista.db', 'folder.htt', 'desktop.lnk',
  'autorun.inf', 'system volume information', '$recycle.bin', 'recycler',
  // macOS
  '.ds_store', '.localized', '.apdisk', '.trashes', '.spotlight-v100', '.fseventsd',
  '.documentrevisions-v100', '.temporaryitems', '.appledouble', '.appledb', '.appledesktop',
  'network trash folder', 'temporary items', '.com.apple.timemachine.donotpresent',
  // Linux / Unix
  'lost+found', '.directory', '.trash', '.trash-1000',
];
// Além dos nomes acima, qualquer DOTFILE (começa com ".") é oculto por padrão — CoCo/Dragon nunca usam
// nomes começando com ".". O usuário pode adicionar mais padrões (hideExtra) e abrir exceções (hideAllow).
const DEFAULT_SET = new Set(DEFAULT_HIDDEN_NAMES.map(s => s.toLowerCase()));

// Constrói o predicado "este nome deve ficar OCULTO?" com base nos padrões do usuário:
//  • hideAllow (exceções) VENCE tudo — nunca oculta o que casar aqui (libera um nome hardcoded que atrapalhe).
//  • depois: nomes hardcoded + dotfiles + hideExtra (também ocultar) → oculto.
// Padrões aceitam curingas * e ? (ex.: "*.tmp", "~$*").
export type HideRules = { extra?: string[]; allow?: string[] };
export function makeHideFilter(rules?: HideRules): (name: string) => boolean {
  const norm2 = (arr?: string[]) => (arr || []).map(s => s.trim()).filter(Boolean);
  const allowRes = norm2(rules?.allow).map(globToRe);
  const extraRes = norm2(rules?.extra).map(globToRe);
  return (name: string): boolean => {
    const base = (name.split(/[\\/]/).pop() || '').toLowerCase();
    if (!base) return false;                                   // raiz "/" (segmento vazio) NÃO é oculta
    if (allowRes.some(re => re.test(base))) return false;      // exceção do usuário tem prioridade
    if (DEFAULT_SET.has(base)) return true;                    // nome de sistema conhecido
    if (base.startsWith('.')) return true;                     // dotfile Unix
    if (extraRes.some(re => re.test(base))) return true;       // padrão extra do usuário
    return false;
  };
}

// ---------- Provedor de PASTA ----------
export function folderProvider(root: string, opts?: { writable?: boolean; hideExtra?: string[]; hideAllow?: string[] }): TnfsProvider {
  const base = path.resolve(root);
  const isHiddenName = makeHideFilter({ extra: opts?.hideExtra, allow: opts?.hideAllow }); // filtro por instância
  const real = (p: string) => {
    const r = path.resolve(base, '.' + norm(p));      // norm começa com '/'
    if (r !== base && !r.startsWith(base + path.sep)) return null; // anti path-traversal
    return r;
  };
  return {
    describe: `pasta: ${base}${opts?.writable ? ' (leitura-escrita)' : ''}`,
    writable: !!opts?.writable,
    writeFile(p, data) {
      if (!opts?.writable) return false;
      if (isHiddenName(p)) return false;                 // não deixa gravar por cima de arquivo de sistema
      const f = real(p); if (!f) return false;           // anti path-traversal
      try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return true; }
      catch { return false; }
    },
    list(p) {
      const dir = real(p); if (!dir) return [];
      try {
        return fs.readdirSync(dir)
          .filter(name => !isHiddenName(name))           // esconde desktop.ini/Thumbs.db/dotfiles… da placa
          .map(name => {
            try { const st = fs.statSync(path.join(dir, name)); return { name, isDir: st.isDirectory(), size: st.size }; }
            catch { return { name, isDir: false, size: 0 }; }
          });
      } catch { return []; }
    },
    stat(p) {
      if (isHiddenName(p)) return null;                  // nem por nome direto
      const f = real(p); if (!f) return null;
      try { const st = fs.statSync(f); return { isDir: st.isDirectory(), size: st.size }; } catch { return null; }
    },
    read(p) {
      if (isHiddenName(p)) return null;
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
interface OpenFile { data: Buffer; pos: number; path?: string; writable?: boolean; dirty?: boolean }
interface Session { dirs: Map<number, { items: SrvEntry[]; idx: number }>; files: Map<number, OpenFile>; nextH: number }

export interface TnfsServerHandle {
  port: number; ip: string; describe: string;
  stop(): void;
}

// Todos os IPv4 reais (exclui loopback e APIPA 169.254.*) com o nome do adaptador e se é WiFi.
const isWifiName = (name: string) => /wi[\s-]?fi|wlan|wireless|wi-?fi direct/i.test(name);
export interface LocalIp { ip: string; iface: string; isWifi: boolean; routable?: boolean }
export function localIPv4s(): LocalIp[] {
  const out: LocalIp[] = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) for (const ni of ifs[name] || [])
    if (ni.family === 'IPv4' && !ni.internal && !ni.address.startsWith('169.254.'))
      out.push({ ip: ni.address, iface: name, isWifi: isWifiName(name) });
  out.sort((a, b) => (a.isWifi === b.isWifi ? 0 : a.isWifi ? -1 : 1)); // WiFi no topo
  return out;
}

// IP de ORIGEM que o SO usaria para alcançar a internet = o IP da interface com a ROTA DEFAULT
// (a única realmente roteável p/ a FujiNet). Truque clássico: um socket UDP "connect" a um IP público
// faz só o lookup de rota (NÃO envia pacote) e expõe o endereço local escolhido. Resolve o caso real
// em que a WiFi tem um IP estático/hotspot SEM gateway (ex.: 192.168.137.1) que não alcança ninguém.
export function primaryRoutableIp(): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ip: string | null) => { if (!done) { done = true; resolve(ip); } };
    try {
      const s = dgram.createSocket('udp4');
      s.once('error', () => { try { s.close(); } catch { /* */ } finish(null); });
      s.connect(53, '8.8.8.8', () => {
        let ip: string | null = null;
        try { ip = s.address().address; } catch { /* */ }
        try { s.close(); } catch { /* */ }
        finish(ip && ip !== '0.0.0.0' ? ip : null);
      });
      setTimeout(() => finish(null), 400); // nunca trava se o connect não chamar o callback
    } catch { finish(null); }
  });
}

// Lista ranqueada: a interface ROTEÁVEL (rota default) vem PRIMEIRO e é marcada (routable:true);
// depois WiFi, depois o resto. É o que a UI deve recomendar como host slot da FujiNet.
export async function localIPv4sRanked(): Promise<LocalIp[]> {
  const all = localIPv4s();
  const primary = await primaryRoutableIp();
  if (primary) for (const x of all) if (x.ip === primary) x.routable = true;
  return all.sort((a, b) => {
    if (!!a.routable !== !!b.routable) return a.routable ? -1 : 1; // roteável no topo
    if (a.isWifi !== b.isWifi) return a.isWifi ? -1 : 1;           // depois WiFi
    return 0;
  });
}

export async function localIPv4(): Promise<string> {
  const ranked = await localIPv4sRanked();
  return ranked[0]?.ip || '127.0.0.1';
}

const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.from([0])]);
const readCstr = (b: Buffer, o: number) => { let e = o; while (e < b.length && b[e] !== 0) e++; return { s: b.toString('latin1', o, e), end: e + 1 }; };

// OPENDIRX/READDIRX (comandos ESTENDIDOS — o firmware da FujiNet usa ESTES p/ listar, não o
// OPENDIR/READDIR antigo). Constantes do protocolo (tnfsd):
const TNFS_DIRSTATUS_EOF = 0x01;     // byte de status do diretório: bit0 = fim
const TNFS_DIRENTRY_DIR = 0x01;      // flags da entrada: bit0 = é diretório
const TNFS_MAX_DATAGRAM = 1024;      // teto do datagrama TNFS (igual ao tnfsd) — cabe N entradas por READDIRX
// (globToRe está definido lá em cima, junto do filtro de arquivos ocultos.)
// Ordena como um navegador de arquivos: pastas primeiro, depois arquivos, ambos alfabético (case-insensitive).
const sortEntries = (items: SrvEntry[]) => items.slice().sort((a, b) =>
  (a.isDir === b.isDir ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.isDir ? -1 : 1));

// `port` é opcional (default 16384, o que a FujiNet exige) — só os testes usam outra porta.
export function startTnfsServer(provider: TnfsProvider, onLog?: (pt: string, en: string, type?: string) => void, port: number = PORT): Promise<TnfsServerHandle> {
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
            // ORDENA igual ao OPENDIRX → a POSIÇÃO no diretório (TELLDIR/SEEKDIR) é a MESMA seja qual
            // comando a placa use p/ navegar e p/ montar (senão a FujiNet seleciona o arquivo errado).
            const h = sess.nextH++ & 0xff; sess.dirs.set(h, { items: sortEntries(provider.list(p)), idx: 0 });
            onLog?.(`Servidor TNFS: OPENDIR "${p}" (handle ${h}).`, `TNFS server: OPENDIR "${p}" (handle ${h}).`, 'info');
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
          case 0x15: { // TELLDIR — posição atual do diretório (a FujiNet GUARDA isto p/ o arquivo escolhido)
            const d = sess.dirs.get(payload[0]);
            if (!d) { err(rinfo, connId, seq, cmd, EBADF); break; }
            const b = Buffer.alloc(5); b[0] = 0x00; b.writeUInt32LE(d.idx >>> 0, 1); // status + posição (u32 LE)
            reply(rinfo, connId, seq, cmd, b); break;
          }
          case 0x16: { // SEEKDIR — posiciona o diretório (a FujiNet faz isto p/ MONTAR o arquivo escolhido)
            const d = sess.dirs.get(payload[0]);
            if (!d) { err(rinfo, connId, seq, cmd, EBADF); break; }
            const pos = payload.readUInt32LE(1);
            d.idx = Math.max(0, Math.min(pos, d.items.length));   // clampa ao tamanho do diretório
            onLog?.(`Servidor TNFS: SEEKDIR p/ posição ${pos} → "${d.items[d.idx]?.name ?? '(fim)'}".`,
                    `TNFS server: SEEKDIR to position ${pos} → "${d.items[d.idx]?.name ?? '(end)'}".`, 'info');
            reply(rinfo, connId, seq, cmd, Buffer.from([0x00])); break;
          }
          case 0x17: { // OPENDIRX — abre o diretório com opções (diropts, sortopts, maxresults, padrão, caminho)
            const maxResults = payload.readUInt16LE(2);            // bytes 2-3 (LE); 0 = ilimitado
            const r1 = readCstr(payload, 4); const pattern = r1.s; // padrão wildcard ('' ou '*' = tudo)
            const r2 = readCstr(payload, r1.end); const p = r2.s;   // caminho absoluto
            const st = provider.stat(p);
            if (!st || !st.isDir) { err(rinfo, connId, seq, cmd, ENOENT); break; }
            let items = sortEntries(provider.list(p));
            if (pattern && pattern !== '*') { const re = globToRe(pattern); items = items.filter(e => re.test(e.name)); }
            if (maxResults > 0 && items.length > maxResults) items = items.slice(0, maxResults);
            const h = sess.nextH++ & 0xff; sess.dirs.set(h, { items, idx: 0 });
            onLog?.(`Servidor TNFS: OPENDIRX "${p}" → ${items.length} itens (handle ${h}).`, `TNFS server: OPENDIRX "${p}" → ${items.length} items (handle ${h}).`, 'info');
            // corpo: status(1) + handle(1) + nº de entradas (2, LE)
            const body = Buffer.alloc(4); body[0] = 0x00; body[1] = h; body.writeUInt16LE(items.length & 0xffff, 2);
            reply(rinfo, connId, seq, cmd, body); break;
          }
          case 0x18: { // READDIRX — lê VÁRIAS entradas de uma vez (flags+tamanho+datas+nome)
            const h = payload[0]; const want = payload[1]; const d = sess.dirs.get(h); // want=0 → quantas couberem
            if (!d) { err(rinfo, connId, seq, cmd, EBADF); break; }
            if (d.idx >= d.items.length) { err(rinfo, connId, seq, cmd, EOF); break; } // fim: status 0x21, sem corpo
            const telldir = d.idx;
            const entries: Buffer[] = [];
            let total = 4 /*hdr*/ + 5 /*status+count+dirstatus+telldir(2)*/;
            let packed = 0;
            while (d.idx < d.items.length) {
              const e = d.items[d.idx];
              const nameBuf = Buffer.from(e.name, 'latin1');
              const entryLen = 1 + 4 + 4 + 4 + nameBuf.length + 1; // flags+size+mtime+ctime+nome+NUL
              if (total + entryLen > TNFS_MAX_DATAGRAM) break;       // respeita o teto do datagrama
              if (want !== 0 && packed >= want) break;               // respeita o nº pedido
              const eb = Buffer.alloc(entryLen);
              eb[0] = e.isDir ? TNFS_DIRENTRY_DIR : 0x00;
              eb.writeUInt32LE(e.size >>> 0, 1);                      // tamanho
              eb.writeUInt32LE(0, 5);                                 // mtime (desconhecido → 0)
              eb.writeUInt32LE(0, 9);                                 // ctime
              nameBuf.copy(eb, 13); eb[13 + nameBuf.length] = 0;      // nome + NUL
              entries.push(eb); total += entryLen; packed++; d.idx++;
            }
            const dirstatus = d.idx >= d.items.length ? TNFS_DIRSTATUS_EOF : 0x00;
            const head = Buffer.alloc(5);
            head[0] = 0x00;                              // status sucesso
            head[1] = packed & 0xff;                     // nº de entradas neste pacote
            head[2] = dirstatus;                         // flags do diretório (bit0 = EOF)
            head.writeUInt16LE(telldir & 0xffff, 3);     // posição (TELLDIR) da 1ª entrada
            reply(rinfo, connId, seq, cmd, Buffer.concat([head, ...entries])); break;
          }
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
            const flags = payload.readUInt16LE(0);
            const { s: p } = readCstr(payload, off);
            const acc = flags & O_ACCMODE;
            const wantWrite = acc === O_WRONLY || acc === O_RDWR || (flags & O_CREAT) !== 0;
            if (wantWrite) {
              if (!provider.writable || !provider.writeFile) { err(rinfo, connId, seq, cmd, EACCES); break; }
              const existing = provider.read(p);
              let data: Buffer;
              if (flags & O_TRUNC) data = Buffer.alloc(0);          // O_TRUNC: zera
              else if (existing) data = Buffer.from(existing);      // abre p/ atualizar/append
              else if (flags & O_CREAT) data = Buffer.alloc(0);     // O_CREAT: arquivo novo
              else { err(rinfo, connId, seq, cmd, ENOENT); break; }
              const h = sess.nextH++ & 0xff;
              sess.files.set(h, { data, pos: (flags & O_APPEND) ? data.length : 0, path: p, writable: true, dirty: !!(flags & (O_CREAT | O_TRUNC)) });
              reply(rinfo, connId, seq, cmd, Buffer.from([0x00, h])); break;
            }
            const data = provider.read(p);
            if (!data) { err(rinfo, connId, seq, cmd, ENOENT); break; }
            const h = sess.nextH++ & 0xff; sess.files.set(h, { data, pos: 0 });
            // LOG-CHAVE p/ diagnóstico: mostra EXATAMENTE qual arquivo a placa abriu (o que ela vai montar).
            onLog?.(`Servidor TNFS: ABRIR (ler) "${p}" — ${data.length} B.`, `TNFS server: OPEN (read) "${p}" — ${data.length} B.`, 'success');
            reply(rinfo, connId, seq, cmd, Buffer.from([0x00, h])); break;
          }
          case 0x22: { // WRITE: fd(1) size(2 LE) data… → grava no buffer em memória (flush no CLOSE)
            const fdn = payload[0]; const count = payload.readUInt16LE(1); const f = sess.files.get(fdn);
            if (!f) { err(rinfo, connId, seq, cmd, EBADF); break; }
            if (!f.writable) { err(rinfo, connId, seq, cmd, EACCES); break; }
            const chunk = payload.subarray(3, 3 + count);
            if (f.pos + chunk.length > f.data.length) {           // cresce o buffer se necessário
              const grown = Buffer.alloc(f.pos + chunk.length); f.data.copy(grown, 0); f.data = grown;
            }
            chunk.copy(f.data, f.pos); f.pos += chunk.length; f.dirty = true;
            const wh = Buffer.alloc(3); wh[0] = 0x00; wh.writeUInt16LE(chunk.length, 1);
            reply(rinfo, connId, seq, cmd, wh); break;
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
            if (f.pos < 0) f.pos = 0;
            if (!f.writable && f.pos > f.data.length) f.pos = f.data.length; // leitura: clampa; escrita: permite estender (esparso)
            reply(rinfo, connId, seq, cmd, Buffer.from([0x00])); break;
          }
          case 0x23: { // CLOSE — se gravável e "sujo", faz flush do buffer p/ o arquivo real
            const f = sess.files.get(payload[0]); sess.files.delete(payload[0]);
            if (f?.writable && f.dirty && f.path && provider.writeFile) {
              const ok = provider.writeFile(f.path, f.data);
              onLog?.(ok ? `Servidor TNFS: gravado ${f.path} (${f.data.length} B).` : `Servidor TNFS: FALHA ao gravar ${f.path}.`,
                      ok ? `TNFS server: wrote ${f.path} (${f.data.length} B).` : `TNFS server: FAILED to write ${f.path}.`, ok ? 'success' : 'error');
              reply(rinfo, connId, seq, cmd, Buffer.from([ok ? 0x00 : EIO])); break;
            }
            reply(rinfo, connId, seq, cmd, Buffer.from([0x00])); break;
          }
          default: err(rinfo, connId, seq, cmd, EINVAL);
        }
      } catch { err(rinfo, connId, seq, cmd, EINVAL); }
    });

    sock.on('error', (e) => { try { sock.close(); } catch { /* */ } reject(e); });
    sock.bind(port, () => {
      // IP recomendado = o roteável (rota default); cai p/ WiFi/primeiro se não houver.
      localIPv4().then((ip) => {
        resolve({
          port, ip, describe: provider.describe,
          stop() { try { sock.close(); } catch { /* */ } try { provider.dispose?.(); } catch { /* */ } },
        });
      });
    });
  });
}
