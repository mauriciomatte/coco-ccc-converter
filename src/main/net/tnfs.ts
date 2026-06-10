// Cliente TNFS (Trivial Network File System) — protocolo do FujiNet sobre UDP 16384.
// Implementação limpa em Node puro (dgram). Suporta o necessário p/ NAVEGAR e BAIXAR:
//   MOUNT(0x00) UMOUNT(0x01) OPENDIR(0x10) READDIR(0x11) CLOSEDIR(0x12) STAT(0x24)
//   OPEN(0x29) READ(0x21) CLOSE(0x23).
// Tudo little-endian. Cabeçalho de cada pacote: connId(u16 LE) · seq(u8) · cmd(u8).
import * as dgram from 'dgram';

const TNFS_PORT = 16384;
// Timeout de retransmissão ADAPTATIVO (algoritmo de Jacobson/Karels, o mesmo do TCP): mantemos o RTT suavizado
// (srtt) E a variância (rttvar) por sessão, e o timeout (RTO) = srtt + 4×rttvar. Assim, num servidor estável e
// lento (coconet, RTT ~1,8 s) o RTO fica ~2 s (detecta perda rápido, sem retransmitir à toa); num servidor
// rápido (RTT 50 ms) cai p/ o piso (500 ms) — um FIXO de 3 s desperdiçava 3 s a cada pacote perdido. Só medimos
// de respostas de 1ª tentativa (regra de Karn); o RTO inicial (3×DEFAULT) cobre o RTT do 1º MOUNT.
const DEFAULT_RTT = 700;    // RTO inicial = 700 + 4×350 = 2100 ms (cobre o coconet ~1,8 s no 1º comando)
// MAX_TO=3000 = o MESMO teto do timeout fixo antigo → o caso lento (coconet) NUNCA fica pior que antes; o caso
// rápido (RTT 50 ms) cai p/ o piso de 500 ms. MIN baixo + backoff moderado p/ não estourar a cauda em perdas.
const MIN_TO = 500, MAX_TO = 3000, MAX_BACKOFF = 6000;
const RETRIES = 6;          // mais tentativas (cada espera agora é mais curta) p/ aguentar links com perda
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// RTO da sessão a partir do srtt/rttvar medidos (ou o inicial, se ainda não mediu).
function rtoOf(s: { srtt?: number; rttvar?: number }): number {
  if (s.srtt == null || s.rttvar == null) return Math.min(MAX_TO, DEFAULT_RTT + 4 * (DEFAULT_RTT / 2));
  return clamp(s.srtt + 4 * s.rttvar, MIN_TO, MAX_TO);
}
const EOF = 0x21;           // código TNFS de fim-de-diretório / fim-de-arquivo
const MAX_ENTRIES = 600;    // teto de itens por pasta (segurança)
// Bytes por READ. 1024 ≈ dobro do antigo (512) → metade das idas-e-voltas no download, sem fragmentar UDP
// (datagrama ~1031 B, bem abaixo da MTU). O servidor devolve no máx. o que couber no buffer dele.
const READ_CHUNK = 1024;

interface Session { sock: dgram.Socket; host: string; port: number; connId: number; seq: number; aborted?: boolean; abortHook?: (() => void) | null; srtt?: number; rttvar?: number }
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
    const t0 = Date.now();
    let tries = 0; let timer: NodeJS.Timeout;
    let timeout = rtoOf(sess);     // RTO adaptativo (srtt + 4×rttvar) da sessão
    const onMsg = (msg: Buffer) => {
      if (msg.length < 4 || msg[2] !== seq || msg[3] !== cmd) return; // não é a nossa resposta
      cleanup();
      if (tries === 0) {            // resposta de 1ª tentativa = amostra de RTT limpa (regra de Karn) → Jacobson/Karels
        const sample = Date.now() - t0;
        if (sess.srtt == null || sess.rttvar == null) { sess.srtt = sample; sess.rttvar = sample / 2; }
        else { sess.rttvar = 0.75 * sess.rttvar + 0.25 * Math.abs(sample - sess.srtt); sess.srtt = 0.875 * sess.srtt + 0.125 * sample; }
      }
      resolve(msg);
    };
    const cleanup = () => { clearTimeout(timer); sess.sock.removeListener('message', onMsg); sess.abortHook = null; };
    // gancho de cancelamento: o abortSession() chama isto p/ interromper esta espera imediatamente
    sess.abortHook = () => { cleanup(); reject(new Error('TNFS: cancelado.')); };
    const send = () => {
      if (sess.aborted) { cleanup(); reject(new Error('TNFS: cancelado.')); return; }
      sess.sock.send(pkt, sess.port, sess.host, (err) => { if (err && !sess.aborted) { cleanup(); reject(err); } });
      timer = setTimeout(() => {
        if (++tries >= RETRIES) { cleanup(); reject(new Error('TNFS: tempo esgotado (servidor não respondeu).')); return; }
        timeout = Math.min(timeout * 1.5, MAX_BACKOFF); // backoff nas retransmissões (Karn)
        send();
      }, timeout);
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

const sortEntries = (e: TnfsEntry[]) => e.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));

// RÁPIDO: OPENDIRX(0x17)+READDIRX(0x18) — traz VÁRIAS entradas por ida-e-volta JÁ com tamanho e flag de
// pasta (dispensa o STAT por arquivo). Retorna null se o servidor não suportar (status != 0) → cai no método
// antigo. Cada entrada: flags(1)+size(4 LE)+mtime(4)+ctime(4)+nome\0.
type ListProgress = (loaded: number, total: number) => void;
async function listViaOpendirx(sess: Session, p: string, onProgress?: ListProgress): Promise<TnfsEntry[] | null> {
  // OPENDIRX: diropts(1)=0 + sortopts(1)=0 + maxresults(2 LE)=0 (ilimitado) + pattern\0 (""=tudo) + path\0
  const od = await transact(sess, 0x17, Buffer.concat([Buffer.from([0, 0]), u16le(0), cstr(''), cstr(p)]));
  if (od[4] !== 0) return null;          // EINVAL/erro → servidor sem OPENDIRX → fallback
  const handle = od[5];
  const total = od.length >= 8 ? od.readUInt16LE(6) : 0; // OPENDIRX já devolve o TOTAL de entradas → progresso real
  onProgress?.(0, total);
  const entries: TnfsEntry[] = [];
  let guard = 0;
  while (guard++ < 2000) {
    const rd = await transact(sess, 0x18, Buffer.from([handle, 0])); // READDIRX: handle + wantCount(0=quantas couberem)
    if (rd[4] === EOF) break;             // 0x21 = fim do diretório
    if (rd[4] !== 0) break;
    const n = rd[5];
    const dirEof = (rd[6] & 0x01) === 1;  // flag de fim na mesma resposta
    let off = 9;                          // status(1)+count(1)+dirstatus(1)+telldir(2) já consumidos
    for (let i = 0; i < n && off + 13 <= rd.length; i++) {
      const flags = rd[off];
      const size = rd.readUInt32LE(off + 1);
      let e = off + 13; while (e < rd.length && rd[e] !== 0) e++;
      const name = rd.toString('latin1', off + 13, e);
      off = e + 1;
      if (name && name !== '.' && name !== '..') entries.push({ name, isDir: (flags & 0x01) === 1, size });
    }
    onProgress?.(entries.length, Math.max(total, entries.length));
    if (dirEof || n === 0 || entries.length > MAX_ENTRIES) break;
  }
  await transact(sess, 0x12, Buffer.from([handle])).catch(() => {});
  return sortEntries(entries);
}

// COMPATÍVEL (lento): OPENDIR(0x10)+READDIR(0x11) 1 nome por vez + STAT(0x24) por arquivo. Para servidores
// antigos que não têm OPENDIRX. É o gargalo que torna a navegação lenta em pastas grandes.
async function listViaOpendir(sess: Session, p: string, onProgress?: ListProgress): Promise<TnfsEntry[]> {
  const od = await transact(sess, 0x10, cstr(p));
  if (od[4] !== 0) throw new Error(`TNFS: OPENDIR falhou em "${p}" (status 0x${od[4].toString(16)}).`);
  const handle = od[5];
  const names: string[] = [];
  for (let i = 0; i < MAX_ENTRIES; i++) {
    const rd = await transact(sess, 0x11, Buffer.from([handle]));
    if (rd[4] === EOF || rd[4] !== 0) break;
    let end = 5; while (end < rd.length && rd[end] !== 0) end++;
    const name = rd.toString('latin1', 5, end);
    if (name && name !== '.' && name !== '..') names.push(name);
  }
  await transact(sess, 0x12, Buffer.from([handle])).catch(() => {});
  const entries: TnfsEntry[] = [];
  // Aqui o gargalo é 1 STAT por arquivo → o progresso mostra o avanço (X/N) nessa fase lenta.
  onProgress?.(0, names.length);
  for (const name of names) {
    try { const st = await statPath(sess, joinPath(p, name)); entries.push({ name, isDir: st.isDir, size: st.size }); }
    catch { entries.push({ name, isDir: false, size: 0 }); }
    onProgress?.(entries.length, names.length);
  }
  return sortEntries(entries);
}

/** Lista uma pasta (nome + dir? + tamanho). Tenta o método RÁPIDO (OPENDIRX/READDIRX) e cai no antigo
 *  (OPENDIR/READDIR+STAT) se o servidor não suportar. opts.onAbort recebe um cancelamento REAL. */
export async function tnfsList(host: string, path = '/', opts?: { onAbort?: (cancel: () => void) => void; onProgress?: ListProgress }): Promise<TnfsEntry[]> {
  const p = path && path.startsWith('/') ? path : '/' + (path || '');
  const sess = await openSocket(host);
  opts?.onAbort?.(() => abortSession(sess)); // arma o cancelamento ANTES do MOUNT (onde servidor-fora-do-ar trava)
  try {
    await mountSess(sess);
    let entries: TnfsEntry[] | null = null;
    try { entries = await listViaOpendirx(sess, p, opts?.onProgress); } catch { entries = null; } // OPENDIRX falhou → fallback
    if (!entries) entries = await listViaOpendir(sess, p, opts?.onProgress);
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
