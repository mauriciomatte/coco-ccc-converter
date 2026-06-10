// Round-trip de RENOMEAR arquivo: RS-DOS (dsk.ts) e Dragon DOS (dragondos.ts).
// Cria disco em branco → adiciona arquivos → renomeia → reparse → confere nome novo, dados intactos,
// vizinhos intactos e rejeição de colisão. Compile com tsconfig.tools.json e rode com node out-tools/...
import { formatRsDosDisk, addDskFile, parseDsk, renameDskFile, extractDskFile } from '../src/main/converter/dsk';
import { encodeDragonBlank, addDragonFile, parseDragonDos, renameDragonFile, extractDragonFile, stripVdk } from '../src/main/converter/dragondos';

let pass = 0, fail = 0;
const ok = (c: boolean, msg: string) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const eqBuf = (a: Buffer, b: Buffer) => a.length === b.length && a.equals(b);

// ───────── RS-DOS ─────────
console.log('RS-DOS:');
{
  let img = formatRsDosDisk(Buffer.alloc(161280), 'full');
  img = addDskFile(img, 'HELLO', 'BAS', 0, 0xFF, Buffer.from('10 PRINT"HI"\r', 'latin1'));
  img = addDskFile(img, 'DATA', 'BIN', 2, 0, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  const before = parseDsk(img);
  ok(before.files.length === 2, 'dois arquivos adicionados');
  const hello = before.files.find(f => f.name === 'HELLO')!;
  const dataBytes = extractDskFile(img, before.files.find(f => f.name === 'DATA')!);

  // renomeia HELLO.BAS → WORLD.TXT
  const img2 = renameDskFile(img, hello, 'WORLD', 'TXT');
  const after = parseDsk(img2);
  ok(after.files.some(f => f.name === 'WORLD' && f.ext === 'TXT'), 'renomeado p/ WORLD.TXT');
  ok(!after.files.some(f => f.name === 'HELLO'), 'nome antigo sumiu');
  // conteúdo do renomeado idêntico
  const wEntry = after.files.find(f => f.name === 'WORLD')!;
  ok(eqBuf(extractDskFile(img2, wEntry), Buffer.from('10 PRINT"HI"\r', 'latin1')), 'dados do renomeado intactos');
  // vizinho DATA.BIN intacto
  const dEntry = after.files.find(f => f.name === 'DATA')!;
  ok(!!dEntry && eqBuf(extractDskFile(img2, dEntry), dataBytes), 'vizinho DATA.BIN intacto');

  // colisão: renomear DATA.BIN → WORLD.TXT deve falhar
  let threw = false;
  try { renameDskFile(img2, dEntry, 'WORLD', 'TXT'); } catch { threw = true; }
  ok(threw, 'colisão rejeitada');

  // nome vazio rejeitado
  let threw2 = false;
  try { renameDskFile(img2, wEntry, '', 'TXT'); } catch { threw2 = true; }
  ok(threw2, 'nome vazio rejeitado');
}

// ───────── Dragon DOS ─────────
console.log('Dragon DOS:');
{
  // encodeDragonBlank devolve com wrapper VDK; rename/add tratam o VDK, mas parse/extract precisam do raw.
  let raw = encodeDragonBlank(40, 18);
  raw = addDragonFile(raw, 'ALPHA', 'BAS', Buffer.from('10 PRINT\r', 'latin1'));
  raw = addDragonFile(raw, 'BETA', 'BIN', Buffer.from([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]));
  const before = parseDragonDos(stripVdk(raw));
  ok(before.files.length === 2, 'dois arquivos adicionados');
  const alpha = before.files.find(f => f.name === 'ALPHA')!;
  const betaBytes = extractDragonFile(stripVdk(raw), before.files.find(f => f.name === 'BETA')!);

  const raw2 = renameDragonFile(raw, alpha, 'GAMMA', 'TXT');
  const after = parseDragonDos(stripVdk(raw2));
  ok(after.files.some(f => f.name === 'GAMMA' && f.ext === 'TXT'), 'renomeado p/ GAMMA.TXT');
  ok(!after.files.some(f => f.name === 'ALPHA'), 'nome antigo sumiu');
  const gEntry = after.files.find(f => f.name === 'GAMMA')!;
  ok(eqBuf(extractDragonFile(stripVdk(raw2), gEntry), Buffer.from('10 PRINT\r', 'latin1')), 'dados do renomeado intactos');
  const bEntry = after.files.find(f => f.name === 'BETA')!;
  ok(!!bEntry && eqBuf(extractDragonFile(stripVdk(raw2), bEntry), betaBytes), 'vizinho BETA.BIN intacto');

  let threw = false;
  try { renameDragonFile(raw2, bEntry, 'GAMMA', 'TXT'); } catch { threw = true; }
  ok(threw, 'colisão rejeitada');
}

console.log(`\nrenamert: ${pass} OK, ${fail} FALHA(S)`);
process.exit(fail ? 1 : 0);
