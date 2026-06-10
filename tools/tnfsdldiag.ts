// DIAGNÓSTICO de lentidão TNFS: mede o tempo de CADA comando e conta RETRANSMISSÕES.
// Uso: node out-tools/tools/tnfsdldiag.js <host> [path]
// Testa: MOUNT, OPENDIRX (responde? quanto tempo?), OPENDIR+READDIR+STAT, e READs de um arquivo (512 vs 1024).
import * as dgram from 'dgram';

const host = process.argv[2] || 'coconet.ddns.net';
const startPath = process.argv[3] || '/';
const PORT = 16384;
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff, 0); return b; };
const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.from([0])]);
const now = () => Number(process.hrtime.bigint() / 1000000n);

let connId = 0, seq = 0;
const sock = dgram.createSocket('udp4');

// transact instrumentado: loga tempo e cada retransmissão. timeout curto (1500ms) p/ não travar o diagnóstico.
function tx(cmd: number, payload: Buffer, label: string, timeoutMs = 1500, maxTries = 3): Promise<{ msg: Buffer | null; ms: number; tries: number }> {
  return new Promise((resolve) => {
    const s = seq & 0xff; seq = (seq + 1) & 0xff;
    const pkt = Buffer.concat([u16(connId), Buffer.from([s, cmd]), payload]);
    const t0 = now(); let tries = 0; let timer: NodeJS.Timeout; let done = false;
    const onMsg = (msg: Buffer) => {
      if (msg.length < 4 || msg[2] !== s || msg[3] !== cmd) return;
      if (done) return; done = true; clearTimeout(timer); sock.removeListener('message', onMsg);
      resolve({ msg, ms: now() - t0, tries });
    };
    const send = () => {
      sock.send(pkt, PORT, host);
      timer = setTimeout(() => {
        if (++tries >= maxTries) { done = true; sock.removeListener('message', onMsg); resolve({ msg: null, ms: now() - t0, tries }); return; }
        console.log(`    … ${label}: sem resposta em ${timeoutMs}ms, RETRANSMITINDO (tentativa ${tries + 1})`);
        send();
      }, timeoutMs);
    };
    sock.on('message', onMsg);
    send();
  });
}

(async () => {
  await new Promise<void>((res) => sock.bind(() => res()));
  console.log(`=== Diagnóstico TNFS: ${host}:${startPath} ===\n`);

  // MOUNT
  let r = await tx(0x00, Buffer.concat([u16(0x0102), cstr('/'), cstr(''), cstr('')]), 'MOUNT', 2000, 4);
  if (!r.msg) { console.log('MOUNT: SEM RESPOSTA — servidor inacessível.'); process.exit(1); }
  connId = r.msg.readUInt16LE(0);
  console.log(`MOUNT: ${r.ms}ms (retransmissões: ${r.tries}) connId=${connId}`);

  // OPENDIRX — o teste-chave: o servidor RESPONDE a esse comando novo?
  r = await tx(0x17, Buffer.concat([Buffer.from([0, 0]), u16(0), cstr(''), cstr(startPath)]), 'OPENDIRX', 1500, 3);
  if (!r.msg) console.log(`OPENDIRX: *** SEM RESPOSTA *** após ${r.ms}ms e ${r.tries} retransmissões → o servidor IGNORA o comando (não suporta). Cada listagem desperdiça esse tempo antes do fallback!`);
  else console.log(`OPENDIRX: ${r.ms}ms (retx ${r.tries}) status=0x${r.msg[4].toString(16)}${r.msg[4] === 0 ? ` count=${r.msg.readUInt16LE(6)}` : ' (erro → fallback rápido, OK)'}`);

  // OPENDIR (método antigo)
  r = await tx(0x10, cstr(startPath), 'OPENDIR', 1500, 3);
  if (!r.msg || r.msg[4] !== 0) { console.log(`OPENDIR: status ${r.msg ? '0x' + r.msg[4].toString(16) : 'SEM RESPOSTA'} — abortando.`); process.exit(0); }
  const dh = r.msg[5];
  console.log(`OPENDIR: ${r.ms}ms (retx ${r.tries}) handle=${dh}`);

  // READDIR + STAT de cada (mede o gargalo do método antigo)
  const names: string[] = [];
  for (let i = 0; i < 50; i++) {
    r = await tx(0x11, Buffer.from([dh]), `READDIR#${i}`, 1500, 3);
    if (!r.msg || r.msg[4] === 0x21 || r.msg[4] !== 0) break;
    let e = 5; while (e < r.msg.length && r.msg[e] !== 0) e++;
    const nm = r.msg.toString('latin1', 5, e);
    console.log(`  READDIR "${nm}": ${r.ms}ms (retx ${r.tries})`);
    if (nm && nm !== '.' && nm !== '..') names.push(nm);
  }
  for (const nm of names.slice(0, 3)) {
    const path = (startPath.endsWith('/') ? startPath : startPath + '/') + nm;
    r = await tx(0x24, cstr(path), `STAT ${nm}`, 1500, 3);
    console.log(`  STAT "${nm}": ${r.ms}ms (retx ${r.tries}) ${r.msg ? 'status 0x' + r.msg[4].toString(16) : 'SEM RESPOSTA'}`);
  }
  await tx(0x12, Buffer.from([dh]), 'CLOSEDIR', 1500, 2);

  // READ de um arquivo: compara 512 vs 1024 bytes por leitura (10 leituras cada)
  const firstFile = names.find(n => /\.(dsk|os9|bin|cas)$/i.test(n));
  if (firstFile) {
    const fpath = (startPath.endsWith('/') ? startPath : startPath + '/') + firstFile;
    for (const chunk of [512, 1024]) {
      const op = await tx(0x29, Buffer.concat([u16(0x0001), u16(0), cstr(fpath)]), 'OPEN', 1500, 3);
      if (!op.msg || op.msg[4] !== 0) { console.log(`OPEN ${firstFile}: falhou`); continue; }
      const fd = op.msg[5];
      let total = 0, totMs = 0, retx = 0; const N = 10;
      for (let i = 0; i < N; i++) {
        r = await tx(0x21, Buffer.concat([Buffer.from([fd]), u16(chunk)]), `READ ${chunk}`, 1500, 3);
        if (!r.msg || r.msg[4] !== 0) { console.log(`  READ(${chunk}) #${i}: ${r.msg ? 'status 0x' + r.msg[4].toString(16) : 'SEM RESPOSTA'} (${r.ms}ms, retx ${r.tries})`); break; }
        const cnt = r.msg.readUInt16LE(5); total += cnt; totMs += r.ms; retx += r.tries;
      }
      await tx(0x23, Buffer.from([fd]), 'CLOSE', 1500, 2);
      console.log(`READ chunk=${chunk}: ${N} leituras, ${total} B, ${totMs}ms total (média ${(totMs / N).toFixed(0)}ms/leitura, retransmissões ${retx}) → ${(total / (totMs / 1000) / 1024).toFixed(1)} KB/s`);
    }
  } else console.log('(nenhum arquivo .dsk/.os9/.bin/.cas na raiz p/ testar READ)');

  await tx(0x01, Buffer.alloc(0), 'UMOUNT', 1000, 1);
  sock.close(); process.exit(0);
})();
