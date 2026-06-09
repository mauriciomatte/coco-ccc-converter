// Auto-teste do servidor TNFS: sobe o servidor sobre uma PASTA e usa o nosso cliente (loopback).
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/tnfsservetest.js
import * as fs from 'fs'; import * as os from 'os'; import * as path from 'path';
import { startTnfsServer, folderProvider } from '../src/main/net/tnfsServer';
import { tnfsList, tnfsReadFile } from '../src/main/net/tnfs';

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnfssrv-'));
  const src = 'C:/Users/Matte/Desktop/CCC-converter/resources/os9seed/seed_360k.os9';
  const data = fs.readFileSync(src);
  fs.writeFileSync(path.join(dir, 'TEST.OS9'), data);
  fs.writeFileSync(path.join(dir, 'hello.txt'), Buffer.from('oi mundo'));
  const srv = await startTnfsServer(folderProvider(dir), (pt) => console.log('[srv]', pt));
  console.log('servidor:', srv.ip + ':' + srv.port, '·', srv.describe);
  const list = await tnfsList('127.0.0.1', '/');
  console.log('LIST /:', list.map(e => `${e.name}${e.isDir ? '/' : ' (' + e.size + ')'}`).join('  '));
  const got = await tnfsReadFile('127.0.0.1', '/TEST.OS9');
  console.log('READ TEST.OS9:', got.length, 'bytes · idêntico ao original?', got.equals(data));
  srv.stop();
  process.exit(0);
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
