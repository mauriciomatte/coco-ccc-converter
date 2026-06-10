// Cliente TNFS (Trivial Network File System) — protocolo do FujiNet sobre UDP 16384.
// Implementação limpa em Node puro (dgram). Suporta o necessário p/ NAVEGAR e BAIXAR:
//   MOUNT(0x00) UMOUNT(0x01) OPENDIR(0x10) READDIR(0x11) CLOSEDIR(0x12) STAT(0x24)
//   OPEN(0x29) READ(0x21) CLOSE(0x23).
// Tudo little-endian. Cabeçalho de cada pacote: connId(u16 LE) · seq(u8) · cmd(u8).
import * as dgram from 'dgram';

const TNFS_PORT = 16384;
const TIMEOUT_MS = 3000;
const RETRIES = 4;
const EOF = 0x21;           // código TNFS de fim-de-diretório / fim-de-arquivo
const MAX_ENTRIES = 600;    // teto de itens por pasta (segurança)
const READ_CHUNK = 512;     // bytes por READ (cabe num datagrama)

interface Session { sock: dgram.Socket; host: string; port: number; connId: number; seq: number; aborted?: boolean; abortHook?: (() => void) | null }
export interface TnfsEntry { name: string; isDir: boolean; size: number }
export interface CommunityServer { host: string; tcpUp: boolean; udpUp: boolean }

// Faz o parse da tabela HTML de https://fujinet.online/tnfs-server-status/ (plugin "tnfs-monitor").
// Cada <tr> tem: <td text-align:left>HOST</td> + img alt="up"/"down" (TCP) + img alt (UDP) + downtime.
export function parseTnfsStatusHtml(html: string): CommunityServer[] {
  const out: CommunityServer[] = [];
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const row = m[1];
    const hostM = row.match(/<td[^>]*text-align:\s*left[^>]*>\s*([^<\s][^<]*?)\s*<\/td>/i);
    if (!hostM) continue;
    const host = hostM[1].trim();
    if (!host || !host.includes('.')) continue;
    const alts = [...row.matchAll(/alt="(up|down)"/gi)].map(a => a[1].toLowerCase());
    out.push({ host, tcpUp: alts[0] === 'up', udpUp: alts[1] === 'up' });
  }
  return out;
}

const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff, 0); return b; };
const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.from([0])]);

// Envia UMA requisição e aguarda a resposta (casa por seq+cmd), com retransmissão.
// Cancelável: se a sessão for abortada (abortSession), rejeita NA HORA e larga as retransmissões.
function transact(sess: Session, cmd: number, payload: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (sess.aborted) { reject(new Error('TNFS: cancelado.')); return; }
    const seq = sess.seq & 0xff;
    sess.seq = (sess.seq + 1) & 0xff;
    const pkt = Buffer.concat([u16le(sess.connId), Buffer.from([seq, cmd]), payload]);
    let tries = 0; let timer: NodeJS.Timeout;
    const onMsg = (msg: Buffer) => {
      if (msg.length < 4 || msg[2] !== seq || msg[3] !== cmd) return; // não é a nossa resposta
      cleanup(); resolve(msg);
    };
    const cleanup = () => { clearTimeout(timer); sess.sock.removeListener('message', onMsg); sess.abortHook = null; };
    // gancho de cancelamento: o abortSession() chama isto p/ interromper esta espera imediatamente
    sess.abortHook = () => { cleanup(); reject(new Error('TNFS: cancelado.')); };
    const send = () => {
      if (sess.aborted) { cleanup(); reject(new Error('TNFS: cancelado.')); return; }
      sess.sock.send(pkt, sess.port, sess.host, (err) => { if (err && !sess.aborted) { cleanup(); reject(err); } });
      timer = setTimeout(() => {
        if (++tries >= RETRIES) { cleanup(); reject(new Error('TNFS: tempo esgotado (servidor não respondeu).')); return; }
        send();
      }, TIMEOUT_MS);
    };
    sess.sock.on('message', onMsg);
    send();
  });
}

// Aborta uma sessão: interrompe a espera pendente (abortHook) e fecha o socket.
function abortSession(sess: Session) {
  sess.aborted = true;
  try { sess.abortHook?.(); } catch { /* */ }
  try { sess.sock.close(); } catch { /* */ }
}

// Abre só o socket UDP (sem MOUNT) — permite registrar o abort ANTES da etapa de rede.
async function openSocket(host: string, port = TNFS_PORT): Promise<Session> {
  const sock = dgram.createSocket('udp4');
  await new Promise<void>((res, rej) => { sock.once('error', rej); sock.bind(() => { sock.removeListener('error', rej); res(); }); });
  return { sock, host, port, connId: 0, seq: 0 };
}

async function mountSess(sess: Session, mountpoint = '/'): Promise<void> {
  // MOUNT: version(u16 LE = 0x0102 → v1.2) + mountpoint\0 + user\0 + password\0
  const reply = await transact(sess, 0x00, Buffer.concat([u16le(0x0102), cstr(mountpoint), cstr(''), cstr('')]));
  if (reply[4] !== 0) { try { sess.sock.close(); } catch { /* */ } throw new Error(`TNFS: MOUNT falhou (status 0x${reply[4].toString(16)}).`); }
  sess.connId = reply.readUInt16LE(0); // o servidor devolve o connId da sessão no cabeçalho
}

async function mount(host: string, port = TNFS_PORT, mountpoint = '/'): Promise<Session> {
  const sess = await openSocket(host, port);
  await mountSess(sess, mountpoint);
  return sess;
}

async function umount(sess: Session) {
  try { await transact(sess, 0x01, Buffer.alloc(0)); } catch { /* best-effort */ }
  try { sess.sock.close(); } catch { /* ignore */ }
}

const joinPath = (dir: string, name: string) => (dir.endsWith('/') ? dir + name : dir + '/' + name).replace(/\/+/g, '/');

async function statPath(sess: Session, path: string): Promise<{ isDir: boolean; size: number }> {
  const r = await transact(sess, 0x24, cstr(path));
  if (r[4] !== 0) throw new Error(`TNFS: STAT falhou (status 0x${r[4].toString(16)}).`);
  const mode = r.readUInt16LE(5);          // struct: mode(2) uid(2) gid(2) size(4) ...
  const size = r.length >= 15 ? r.readUInt32LE(11) : 0;
  return { isDir: (mode & 0xf000) === 0x4000, size };
}

/** Lista uma pasta (nome + dir? + tamanho). Faz mount→opendir→readdir(loop)→stat(cada)→closedir→umount.
 *  opts.onAbort recebe uma função de cancelamento REAL (fecha o socket e interrompe a espera/MOUNT). */
export async function tnfsList(host: string, path = '/', opts?: { onAbort?: (cancel: () => void) => void }): Promise<TnfsEntry[]> {
  const p = path && path.startsWith('/') ? path : '/' + (path || '');
  const sess = await openSocket(host);
  opts?.onAbort?.(() => abortSession(sess)); // arma o cancelamento ANTES do MOUNT (onde servidor-fora-do-ar trava)
  try {
    await mountSess(sess);
    const od = await transact(sess, 0x10, cstr(p));
    if (od[4] !== 0) throw new Error(`TNFS: OPENDIR falhou em "${p}" (status 0x${od[4].toString(16)}).`);
    const handle = od[5];
    const names: string[] = [];
    for (let i = 0; i < MAX_ENTRIES; i++) {
      const rd = await transact(sess, 0x11, Buffer.from([handle]));
      if (rd[4] === EOF) break;
      if (rd[4] !== 0) break;
      let end = 5; while (end < rd.length && rd[end] !== 0) end++;
      const name = rd.toString('latin1', 5, end);
      if (name && name !== '.' && name !== '..') names.push(name);
    }
    await transact(sess, 0x12, Buffer.from([handle])).catch(() => {});
    const entries: TnfsEntry[] = [];
    for (const name of names) {
      try { const st = await statPath(sess, joinPath(p, name)); entries.push({ name, isDir: st.isDir, size: st.size }); }
      catch { entries.push({ name, isDir: false, size: 0 }); }
    }
    // pastas primeiro, depois alfabético
    entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return entries;
  } finally { await umount(sess); }
}

/** Baixa um arquivo inteiro. opts.onProgress(got) reporta bytes; opts.shouldAbort() cancela. */
export async function tnfsReadFile(host: string, path: string, opts?: { onProgress?: (got: number) => void; shouldAbort?: () => boolean }): Promise<Buffer> {
  const p = path.startsWith('/') ? path : '/' + path;
  const sess = await mount(host);
  try {
    // OPEN: flags(u16 LE = 0x0001 RDONLY) + mode(u16 LE = 0) + path\0
    const op = await transact(sess, 0x29, Buffer.concat([u16le(0x0001), u16le(0), cstr(p)]));
    if (op[4] !== 0) throw new Error(`TNFS: OPEN falhou (status 0x${op[4].toString(16)}).`);
    const fd = op[5];
    const chunks: Buffer[] = []; let guard = 0; let got = 0;
    try {
      // Lê até o EOF REAL do servidor (status 0x21 ou count 0). NÃO confia no tamanho do STAT —
      // alguns servidores reportam tamanho errado; assim a leitura nunca trunca.
      while (guard++ < 5000000) {
        if (opts?.shouldAbort?.()) throw new Error('Download cancelado.');
        const rd = await transact(sess, 0x21, Buffer.concat([Buffer.from([fd]), u16le(READ_CHUNK)]));
        if (rd[4] === EOF) break;
        if (rd[4] !== 0) throw new Error(`TNFS: READ falhou (status 0x${rd[4].toString(16)}).`);
        const count = rd.readUInt16LE(5);
        if (count === 0) break;
        chunks.push(Buffer.from(rd.subarray(7, 7 + count)));
        got += count; opts?.onProgress?.(got);
      }
    } finally { await transact(sess, 0x23, Buffer.from([fd])).catch(() => {}); }
    return Buffer.concat(chunks);
  } finally { await umount(sess); }
}
