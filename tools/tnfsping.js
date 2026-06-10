// Manda um MOUNT TNFS (cmd 0x00) p/ host:16384 e espera resposta. Uso: node tnfsping.js <ip>
const dgram = require('dgram');
const host = process.argv[2] || '127.0.0.1';
const PORT = 16384;
const sock = dgram.createSocket('udp4');
// header: connId(2 LE)=0, seq(1)=0, cmd(1)=0x00 MOUNT ; payload: ver(2)=0x0102, mountpoint cstr "/", user cstr, pass cstr
const hdr = Buffer.from([0x00, 0x00, 0x00, 0x00]);
const body = Buffer.from([0x01, 0x00, 0x2f, 0x00, 0x00, 0x00]); // ver 0x0001, "/", user "", pass ""
const pkt = Buffer.concat([hdr, body]);
let done = false;
sock.on('message', (msg, rinfo) => {
  done = true;
  console.log(`RESPOSTA de ${rinfo.address}:${rinfo.port} -> ${msg.toString('hex')} (status byte4=${msg[4]})`);
  sock.close(); process.exit(0);
});
sock.on('error', (e) => { console.log('ERRO socket:', e.message); process.exit(1); });
sock.send(pkt, PORT, host, (e) => {
  if (e) { console.log('ERRO send:', e.message); process.exit(1); }
  console.log(`MOUNT enviado p/ ${host}:${PORT}, aguardando 3s...`);
});
setTimeout(() => { if (!done) { console.log(`SEM RESPOSTA de ${host}:${PORT} (timeout 3s)`); process.exit(2); } }, 3000);
