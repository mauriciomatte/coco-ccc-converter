// Auto-teste de ESCRITA do servidor TNFS (Fase 2). Sobe o servidor gravável sobre uma PASTA e
// usa um cliente UDP CRU (nosso cliente ainda não grava) p/ MOUNT→OPEN(write)→WRITE→CLOSE.
// Cobre: (1) criar arquivo novo, (2) sobrescrever setor via LSEEK+WRITE, (3) servidor RO rejeita escrita.
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/tnfswritetest.js
import * as fs from 'fs'; import * as os from 'os'; import * as path from 'path'; import * as dgram from 'dgram';
import { startTnfsServer, folderProvider } from '../src/main/net/tnfsServer';

const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff, 0); return b; };
const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.from([0])]);

function rawClient(host: string, port: number) {
  const sock = dgram.createSocket('udp4');
  let seq = 0, connId = 0;
  const ready = new Promise<void>(res => sock.bind(() => res()));
  const tx = (cmd: number, payload: Buffer): Promise<Buffer> => new Promise((resolve, reject) => {
    const s = seq & 0xff; seq = (seq + 1) & 0xff;
    const pkt = Buffer.concat([u16(connId), Buffer.from([s, cmd]), payload]);
    const onMsg = (m: Buffer) => { if (m.length < 4 || m[2] !== s || m[3] !== cmd) return; clearTimeout(t); sock.removeListener('message', onMsg); resolve(m); };
    const t = setTimeout(() => { sock.removeListener('message', onMsg); reject(new Error('timeout cmd 0x' + cmd.toString(16))); }, 3000);
    sock.on('message', onMsg); sock.send(pkt, port, host);
  });
  return {
    ready,
    async mount() { const r = await tx(0x00, Buffer.concat([u16(0x0102), cstr('/'), cstr(''), cstr('')])); if (r[4] !== 0) throw new Error('MOUNT status 0x' + r[4].toString(16)); connId = r.readUInt16LE(0); },
    async open(p: string, flags: number) { const r = await tx(0x29, Buffer.concat([u16(flags), u16(0), cstr(p)])); return { status: r[4], fd: r[5] }; },
    async write(fd: number, data: Buffer) { const r = await tx(0x22, Buffer.concat([Buffer.from([fd]), u16(data.length), data])); return { status: r[4], count: r.length >= 7 ? r.readUInt16LE(5) : 0 }; },
    async lseek(fd: number, off: number, whence = 0) { const b = Buffer.alloc(4); b.writeInt32LE(off, 0); const r = await tx(0x25, Buffer.concat([Buffer.from([fd, whence]), b])); return r[4]; },
    async close(fd: number) { const r = await tx(0x23, Buffer.from([fd])); return r[4]; },
    stop() { try { sock.close(); } catch { /* */ } },
  };
}

const F = { O_WRONLY: 0x0002, O_RDWR: 0x0003, O_CREAT: 0x0100, O_TRUNC: 0x0200 };
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

(async () => {
  // ---- servidor GRAVÁVEL ----
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnfsw-'));
  fs.writeFileSync(path.join(dir, 'DISK.DSK'), Buffer.alloc(256, 0xAA)); // "disco" pré-existente
  const srv = await startTnfsServer(folderProvider(dir, { writable: true }), () => { /* quiet */ });
  console.log('servidor RW:', srv.ip + ':' + srv.port);
  const c = rawClient('127.0.0.1', srv.port); await c.ready; await c.mount();

  // (1) criar arquivo novo "NEW.TXT"
  const payload = Buffer.from('HELLO COCO FROM FUJINET');
  let o = await c.open('/NEW.TXT', F.O_WRONLY | F.O_CREAT | F.O_TRUNC);
  ok('OPEN create status=0', o.status === 0);
  const w = await c.write(o.fd, payload);
  ok('WRITE count==len', w.status === 0 && w.count === payload.length);
  ok('CLOSE status=0', (await c.close(o.fd)) === 0);
  const onDisk = fs.existsSync(path.join(dir, 'NEW.TXT')) ? fs.readFileSync(path.join(dir, 'NEW.TXT')) : Buffer.alloc(0);
  ok('arquivo gravado idêntico', onDisk.equals(payload));

  // (2) sobrescrever "setor" de um disco existente via LSEEK+WRITE (RDWR)
  o = await c.open('/DISK.DSK', F.O_RDWR);
  ok('OPEN rdwr existente status=0', o.status === 0);
  ok('LSEEK 128 ok', (await c.lseek(o.fd, 128)) === 0);
  const patch = Buffer.from([1, 2, 3, 4]);
  await c.write(o.fd, patch);
  ok('CLOSE rdwr status=0', (await c.close(o.fd)) === 0);
  const disk = fs.readFileSync(path.join(dir, 'DISK.DSK'));
  ok('disco tamanho preservado (256)', disk.length === 256);
  ok('patch aplicado @128', disk[128] === 1 && disk[129] === 2 && disk[130] === 3 && disk[131] === 4);
  ok('bytes fora do patch intactos', disk[0] === 0xAA && disk[127] === 0xAA && disk[132] === 0xAA);
  c.stop(); srv.stop();

  // ---- servidor SOMENTE-LEITURA: precisa REJEITAR escrita ----
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'tnfsro-'));
  const srv2 = await startTnfsServer(folderProvider(dir2, { writable: false }), () => { /* quiet */ });
  const c2 = rawClient('127.0.0.1', srv2.port); await c2.ready; await c2.mount();
  const o2 = await c2.open('/X.TXT', F.O_WRONLY | F.O_CREAT);
  ok('RO rejeita OPEN-escrita (EACCES 0x0d)', o2.status === 0x0d);
  ok('RO não criou arquivo', !fs.existsSync(path.join(dir2, 'X.TXT')));
  c2.stop(); srv2.stop();

  console.log(`\nRESULTADO: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
