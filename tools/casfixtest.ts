// Teste do W5 (fixCas) e W3 (disco → .cas). Compila via tsconfig.tools.json e roda com node.
//   npx tsc -p tsconfig.tools.json && node out-tools/tools/casfixtest.js
import { encodeCas, encodeDsk } from '../src/main/converter/export';
import { parseCas, fixCas } from '../src/main/converter/cas';
import { parseDsk, extractDskFile } from '../src/main/converter/dsk';
import { parseBin } from '../src/main/converter/bin';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name} ${extra}`); } };

// ───────── W5 — FIXCAS ─────────
console.log('W5 — FIXCAS');

// Programa de ML de exemplo (payload 600 B → 3 data blocks de 255/255/90).
const prog = Buffer.alloc(600); for (let i = 0; i < prog.length; i++) prog[i] = (i * 7 + 3) & 0xff;
const good = encodeCas([{ name: 'GAME', fileType: 2, asciiFlag: 0, loadAddr: 0x3e00, execAddr: 0x3e00, payload: prog }]);

// (a) .cas já íntegro → fixCas mantém os dados e devolve algo que parseia limpo.
{
  const { output, report } = fixCas(good);
  const p = parseCas(output);
  ok('íntegro: parseia', p.files.length === 1);
  ok('íntegro: todos os blocos com checksum válido', p.blocks.every(b => b.checksumValid));
  ok('íntegro: payload preservado', Buffer.compare(p.files[0].payload, prog) === 0);
  ok('íntegro: 0 checksums corrigidos', report.checksumsFixed === 0, `(=${report.checksumsFixed})`);
  ok('íntegro: load/exec preservados', p.files[0].loadAddr === 0x3e00 && p.files[0].execAddr === 0x3e00);
}

// (b) Checksum corrompido em 2 blocos → fixCas recalcula.
{
  const bad = Buffer.from(good);
  // acha os offsets de checksum: percorre blocos via sync 0x3C
  const csOffs: number[] = [];
  let o = 0;
  while (o < bad.length) { const s = bad.indexOf(0x3c, o); if (s < 0 || s + 3 > bad.length) break; const len = bad[s + 2]; if (s + 3 + len + 1 > bad.length) break; csOffs.push(s + 3 + len); o = s + 3 + len + 1; }
  bad[csOffs[0]] ^= 0xff; bad[csOffs[1]] ^= 0xff;                    // corrompe 2 checksums
  const { output, report } = fixCas(bad);
  const p = parseCas(output);
  ok('checksum: 2 corrigidos', report.checksumsFixed === 2, `(=${report.checksumsFixed})`);
  ok('checksum: saída íntegra', p.blocks.every(b => b.checksumValid));
  ok('checksum: payload preservado', Buffer.compare(p.files[0].payload, prog) === 0);
  ok('checksum: marcado como alterado', report.changed);
}

// (c) EOF ausente → fixCas adiciona.
{
  // remove o último bloco (EOF) cortando antes dele
  const p0 = parseCas(good);
  const eof = p0.blocks[p0.blocks.length - 1];
  ok('setup: último bloco é EOF', eof.type === 0xff);
  // reconstrói um .cas SEM o EOF: leader + namefile + leader + data… (sem EOF)
  const out: number[] = [];
  const leader = (n: number) => { for (let k = 0; k < n; k++) out.push(0x55); };
  const blk = (type: number, data: Buffer) => { out.push(0x3c, type, data.length); let s = (type + data.length) & 0xff; for (const b of data) { out.push(b); s = (s + b) & 0xff; } out.push(s); };
  leader(128); blk(0x00, p0.blocks[0].payload); leader(128);
  for (const b of p0.blocks.filter(b => b.type === 0x01)) { blk(0x01, b.payload); leader(2); }
  const noEof = Buffer.from(out);
  ok('setup: noEof não tem EOF', !parseCas(noEof).blocks.some(b => b.type === 0xff));
  const { output, report } = fixCas(noEof);
  const p = parseCas(output);
  ok('eof: 1 EOF adicionado', report.eofAdded === 1, `(=${report.eofAdded})`);
  ok('eof: saída tem EOF', p.blocks.some(b => b.type === 0xff));
  ok('eof: payload preservado', Buffer.compare(p.files[0].payload, prog) === 0);
}

// (d) Lixo (falso 0x3C) entre os blocos → ignorado, dados intactos.
{
  const p0 = parseCas(good);
  const out: number[] = [];
  const leader = (n: number) => { for (let k = 0; k < n; k++) out.push(0x55); };
  const blk = (type: number, data: Buffer) => { out.push(0x3c, type, data.length); let s = (type + data.length) & 0xff; for (const b of data) { out.push(b); s = (s + b) & 0xff; } out.push(s); };
  leader(64); out.push(0x3c, 0x7e, 0x05, 1, 2, 3); // sync falso (tipo 0x7e inválido) + bytes soltos
  leader(128); blk(0x00, p0.blocks[0].payload); leader(128);
  for (const b of p0.blocks.filter(b => b.type === 0x01)) { blk(0x01, b.payload); leader(2); }
  blk(0xff, Buffer.alloc(0)); leader(2);
  const dirty = Buffer.from(out);
  const { output, report } = fixCas(dirty);
  const p = parseCas(output);
  ok('lixo: falso sync contabilizado', report.falseSyncsSkipped >= 1, `(=${report.falseSyncsSkipped})`);
  ok('lixo: 1 arquivo recuperado', p.files.length === 1);
  ok('lixo: payload preservado', Buffer.compare(p.files[0].payload, prog) === 0);
}

// (e) Multi-arquivo na mesma fita → ambos reconstruídos.
{
  const a = Buffer.from([1, 2, 3, 4, 5]); const b = Buffer.alloc(300, 0xaa);
  const two = encodeCas([
    { name: 'ONE', fileType: 1, asciiFlag: 0, loadAddr: 0, execAddr: 0, payload: a },
    { name: 'TWO', fileType: 2, asciiFlag: 0, loadAddr: 0x600, execAddr: 0x600, payload: b },
  ]);
  const { output, report } = fixCas(two);
  const p = parseCas(output);
  ok('multi: 2 arquivos', p.files.length === 2 && report.files === 2, `(files=${p.files.length})`);
  ok('multi: payloads preservados', Buffer.compare(p.files[0].payload, a) === 0 && Buffer.compare(p.files[1].payload, b) === 0);
}

// ───────── W3 — disco → .cas (lógica do IPC dsk-file-to-cas) ─────────
console.log('W3 — disco → .cas');
{
  // monta um .dsk com um ML; extrai; empacota em .cas exatamente como o IPC; parseia e compara.
  const ml = Buffer.alloc(400); for (let i = 0; i < ml.length; i++) ml[i] = (i * 13 + 1) & 0xff;
  // encodeDsk embrulha o payload em LOADM sozinho → o conteúdo do arquivo no disco JÁ é um LOADM
  // (exatamente como um .BIN real), que é o que o IPC dsk-file-to-cas recebe e passa pelo parseBin.
  const dsk = encodeDsk([{ name: 'PROG.BIN', loadAddr: 0x3f00, execAddr: 0x3f00, payload: ml }]);
  const dir = parseDsk(dsk);
  ok('dsk: 1 arquivo no diretório', dir.files.length === 1, `(=${dir.files.length})`);
  const entry = dir.files[0];
  const raw = extractDskFile(dsk, entry);
  // replica o IPC: ftype 2 → parseBin → encodeCas
  const pbin = parseBin(raw);
  const cas = encodeCas([{ name: 'PROG', fileType: 2, asciiFlag: 0, loadAddr: pbin.loadAddr, execAddr: pbin.execAddr, payload: pbin.payload }]);
  const p = parseCas(cas);
  ok('dsk→cas: parseia 1 arquivo', p.files.length === 1);
  ok('dsk→cas: load/exec do LOADM', p.files[0].loadAddr === 0x3f00 && p.files[0].execAddr === 0x3f00, `(load=${p.files[0].loadAddr.toString(16)})`);
  ok('dsk→cas: payload = imagem de memória crua', Buffer.compare(p.files[0].payload, ml) === 0);
  ok('dsk→cas: checksums válidos', p.blocks.every(b => b.checksumValid));
}

// ───────── BASIC ASCII → .cas (gap flag) ─────────
console.log('BASIC ASCII → .cas (gap flag)');
{
  // "5 CLS\r10 PRINT..\r20 GOTO 10\r" gravado como ASCII (tipo 0, flag 0xFF). O CLOAD precisa ver
  // gap flag (byte 10) = 0xFF, senão carrega como imagem tokenizada (bug "17228 S").
  const txt = Buffer.from('5 CLS\r10 PRINT "X"\r20 GOTO 10\r', 'latin1');
  const cas = encodeCas([{ name: 'TESTE', fileType: 0, asciiFlag: 0xff, loadAddr: 0, execAddr: 0, payload: txt }]);
  // localiza a namefile (1º bloco type 0x00 após um 0x3C)
  const sync = cas.indexOf(0x3c);
  const nf = cas.subarray(sync + 3, sync + 3 + 15);
  ok('ascii: nome = TESTE', nf.subarray(0, 5).toString('ascii') === 'TESTE');
  ok('ascii: byte 8 (tipo) = 0 BASIC', nf[8] === 0x00, `(=${nf[8]})`);
  ok('ascii: byte 9 (ASCII flag) = 0xFF', nf[9] === 0xff, `(=${nf[9].toString(16)})`);
  ok('ascii: byte 10 (GAP flag) = 0xFF (corrige o bug)', nf[10] === 0xff, `(=${nf[10].toString(16)})`);
  const p = parseCas(cas);
  ok('ascii: re-parse devolve o texto', Buffer.compare(p.files[0].payload, txt) === 0);

  // ML/tokenizado continua contíguo (gap = 0).
  const ml = encodeCas([{ name: 'GAME', fileType: 2, asciiFlag: 0, loadAddr: 0x3e00, execAddr: 0x3e00, payload: Buffer.alloc(50, 1) }]);
  const s2 = ml.indexOf(0x3c);
  ok('binário: byte 10 (GAP) = 0x00', ml[s2 + 3 + 10] === 0x00, `(=${ml[s2 + 3 + 10]})`);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passaram, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
