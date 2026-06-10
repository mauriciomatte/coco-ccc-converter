// Valida OPENDIRX (0x17) + READDIRX (0x18) — os comandos que o FIRMWARE DA FUJINET usa p/ listar.
// Sobe o servidor sobre uma pasta e fala o protocolo "na unha" como a placa faria (MOUNT→OPENDIRX→
// READDIRX→CLOSEDIR), conferindo nomes, tamanhos, flag de pasta, EOF e o filtro por wildcard.
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/tnfsdirxtest.js
import * as fs from 'fs'; import * as os from 'os'; import * as path from 'path'; import * as dgram from 'dgram';
import { startTnfsServer, folderProvider, makeHideFilter } from '../src/main/net/tnfsServer';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

// transação UDP simples (1 envio → 1 resposta)
function tx(sock: dgram.Socket, port: number, pkt: Buffer): Promise<Buffer> {
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout')), 2000);
    sock.once('message', (m) => { clearTimeout(to); res(m); });
    sock.send(pkt, port, '127.0.0.1');
  });
}
const hdr = (conn: number, seq: number, cmd: number, body: Buffer = Buffer.alloc(0)) => {
  const h = Buffer.alloc(4); h.writeUInt16LE(conn, 0); h[2] = seq; h[3] = cmd; return Buffer.concat([h, body]);
};
const readCstr = (b: Buffer, o: number) => { let e = o; while (e < b.length && b[e] !== 0) e++; return { s: b.toString('latin1', o, e), end: e + 1 }; };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnfsdirx-'));
  fs.writeFileSync(path.join(dir, 'ALPHA.DSK'), Buffer.alloc(161280, 1));
  fs.writeFileSync(path.join(dir, 'beta.txt'), Buffer.from('hello world'));      // 11 bytes
  fs.writeFileSync(path.join(dir, 'gamma.bin'), Buffer.alloc(40));
  fs.writeFileSync(path.join(dir, 'desktop.ini'), Buffer.from('[.ShellClassInfo]\n')); // lixo do Windows → deve ser filtrado
  fs.writeFileSync(path.join(dir, 'Thumbs.db'), Buffer.alloc(10));                      // idem
  fs.writeFileSync(path.join(dir, '.hidden'), Buffer.alloc(5));                         // dotfile → filtrado
  fs.mkdirSync(path.join(dir, 'SUBDIR'));
  const srv = await startTnfsServer(folderProvider(dir), undefined, 16399); // porta de teste (evita 16384 do app)
  const sock = dgram.createSocket('udp4');

  // MOUNT
  const mountBody = Buffer.concat([Buffer.from([0x00, 0x01]), Buffer.from('/\0\0\0', 'latin1')]);
  const mr = await tx(sock, srv.port, hdr(0, 0, 0x00, mountBody));
  ok(mr[4] === 0x00, 'MOUNT status 0');
  const conn = mr.readUInt16LE(0);

  // OPENDIRX "/" pattern "*"
  const odxBody = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from('*\0/\0', 'latin1')]); // diropts,sortopts,max(2),pattern,path
  const od = await tx(sock, srv.port, hdr(conn, 1, 0x17, odxBody));
  ok(od[4] === 0x00, 'OPENDIRX status 0');
  const dh = od[5];
  const count = od.readUInt16LE(6);
  ok(count === 4, `OPENDIRX count=4 (got ${count})`);

  // READDIRX (want=0 → todas que couberem)
  const rd = await tx(sock, srv.port, hdr(conn, 2, 0x18, Buffer.from([dh, 0x00])));
  ok(rd[4] === 0x00, 'READDIRX status 0');
  const n = rd[5]; const dirstatus = rd[6]; const telldir = rd.readUInt16LE(7);
  ok(n === 4, `READDIRX retornou 4 entradas (got ${n})`);
  ok((dirstatus & 0x01) === 0x01, 'READDIRX sinaliza EOF na última leva');
  ok(telldir === 0, `telldir=0 (got ${telldir})`);
  // parse das entradas
  const got: Record<string, { size: number; dir: boolean }> = {};
  let off = 9;
  for (let i = 0; i < n; i++) {
    const flags = rd[off]; const size = rd.readUInt32LE(off + 1);
    const { s: name, end } = readCstr(rd, off + 13);
    got[name] = { size, dir: (flags & 0x01) === 1 };
    off = end;
  }
  ok(!('desktop.ini' in got) && !('Thumbs.db' in got) && !('.hidden' in got), 'desktop.ini/Thumbs.db/.hidden NÃO aparecem (filtrados)');
  ok('SUBDIR' in got && got['SUBDIR'].dir, 'SUBDIR presente e marcada como pasta');
  ok('beta.txt' in got && got['beta.txt'].size === 11 && !got['beta.txt'].dir, 'beta.txt size=11, arquivo');
  ok('ALPHA.DSK' in got && got['ALPHA.DSK'].size === 161280, 'ALPHA.DSK size=161280');
  ok('gamma.bin' in got && got['gamma.bin'].size === 40, 'gamma.bin size=40');
  // pastas primeiro (ordenação)
  const firstName = readCstr(rd, 9 + 13).s;
  ok(firstName === 'SUBDIR', `pasta vem primeiro na ordenação (got ${firstName})`);

  // READDIRX de novo → fim de diretório (status 0x21)
  const rd2 = await tx(sock, srv.port, hdr(conn, 3, 0x18, Buffer.from([dh, 0x00])));
  ok(rd2[4] === 0x21, `READDIRX após o fim retorna EOF 0x21 (got 0x${rd2[4].toString(16)})`);

  // OPENDIRX com filtro "*.txt" → só beta.txt
  const odxBody2 = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from('*.txt\0/\0', 'latin1')]);
  const od2 = await tx(sock, srv.port, hdr(conn, 4, 0x17, odxBody2));
  ok(od2.readUInt16LE(6) === 1, `filtro *.txt → 1 entrada (got ${od2.readUInt16LE(6)})`);

  sock.close(); srv.stop();

  // ── Filtro configurável (hideExtra / hideAllow) ──
  const lst = (opts?: any) => folderProvider(dir, opts).list('/').map(e => e.name.toLowerCase());
  ok(!lst().includes('desktop.ini') && !lst().includes('thumbs.db'), 'padrão: oculta desktop.ini/Thumbs.db');
  ok(!lst({ hideExtra: ['*.bin'] }).includes('gamma.bin'), 'hideExtra "*.bin" oculta gamma.bin');
  ok(lst().includes('gamma.bin'), 'sem regra, gamma.bin aparece');
  ok(lst({ hideAllow: ['thumbs.db'] }).includes('thumbs.db'), 'hideAllow "thumbs.db" reexibe Thumbs.db');
  // predicado direto
  const f = makeHideFilter({ extra: ['*.log'], allow: ['desktop.ini'] });
  ok(f('a.log') === true, 'extra *.log → oculto');
  ok(f('desktop.ini') === false, 'allow desktop.ini → exceção vence o hardcoded');
  ok(f('.hidden') === true, 'dotfile → oculto');
  ok(f('/') === false, 'raiz não é oculta');

  console.log(`\ntnfsdirxtest: ${pass} OK, ${fail} FALHA(S)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
