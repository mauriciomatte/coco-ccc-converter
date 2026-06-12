// Round-trip do nome SIDEKICK: disco em branco -> writeSidekickName -> doubling (como imageWriteSlot) ->
// readSidekickName. Garante que renomear um disco LIMPO persiste o nome legível.
//   npx tsc -p tsconfig.tools.json && node out-tools/tools/sknametest.js
import { encodeDsk } from '../src/main/converter/export';
import { writeSidekickName, readSidekickName } from '../src/main/converter/dsk';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, info = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${info ? ' — ' + info : ''}`); c ? pass++ : fail++; };

const blank = encodeDsk([], 35);                          // disco RS-DOS 35T formatado em branco (161280)
check('disco em branco = 161280', blank.length === 161280, `${blank.length}`);

for (const nm of ['DISCO-MM', 'GAMES06', 'A']) {
  const named = writeSidekickName(blank, nm);             // grava o nome no LSN 322 (de-doubled 82432)
  // double como o imageWriteSlot: cada setor de-doubled (256B) -> metade PAR de um par de 512B.
  const slot = Buffer.alloc(322560);
  for (let i = 0; i < 630; i++) named.copy(slot, i * 512, i * 256, i * 256 + 256);
  const read = readSidekickName(slot, 0);                 // lê do doubled (322*512 = metade PAR)
  check(`round-trip "${nm}"`, read === nm.toUpperCase().slice(0, 8), `leu="${read}"`);
}

console.log(`\n${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
