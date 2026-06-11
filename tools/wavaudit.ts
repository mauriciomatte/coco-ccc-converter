// Auditoria dos exportadores .wav: gera cada um para um BASIC simples e mostra a estrutura, para
// comparar com o padrão de época (silêncio inicial · leader+namefile · GAP · dados · silêncio).
//   npx tsc -p tsconfig.tools.json && node out-tools/tools/wavaudit.js
import { tokenizeBasic } from '../src/renderer/src/basicDetokenize';
import { encodeCas } from '../src/main/converter/export';
import { buildEraTapeWav, encodeCasToWav, decodeCasTapeGapAware, buildCleanWav } from '../src/main/converter/wav';
import * as fs from 'fs';

const prog = '5 CLS\n10 PRINT "MAURICIO - TESTE"\n20 GOTO 10';
const img = tokenizeBasic(prog);
const dir = 'amostras';

// 1) Aba BASIC "→ WAV" (buildEraTapeWav)
fs.writeFileSync(`${dir}/_audit_era.wav`, buildEraTapeWav('TESTE', img, { sampleRate: 9600 }));

// 2) cas→wav cru (encodeCasToWav) — usado p/ exibir a onda; NÃO é export salvo
const cas = encodeCas([{ name: 'TESTE', fileType: 0, asciiFlag: 0, loadAddr: 0, execAddr: 0, payload: Buffer.from(img) }]);
fs.writeFileSync(`${dir}/_audit_rawcas.wav`, encodeCasToWav(cas, 9600));

// 3) K7 "→ WAV (limpo)" (buildCleanWav) a partir do áudio cru decodificado
const rawWav = encodeCasToWav(cas, 22050);
const dec = decodeCasTapeGapAware(Buffer.from(rawWav), {});
console.log(`decode do cas→wav: foundSync=${dec.foundSync} segs=${dec.segs.length} segTimes=${JSON.stringify(dec.segTimes?.map(s => ({ s: +s.start.toFixed(2), e: +s.end.toFixed(2) })))}`);
if (dec.segs.length) fs.writeFileSync(`${dir}/_audit_clean.wav`, buildCleanWav(dec.segs, dec.segTimes, 9600));

// 4) buildCleanWav a partir do ÁUDIO DE ÉPOCA decodificado (tem o gap real)
const eraWav = buildEraTapeWav('TESTE', img, { sampleRate: 22050 });
const dec2 = decodeCasTapeGapAware(eraWav, {});
console.log(`decode do era-wav: foundSync=${dec2.foundSync} segs=${dec2.segs.length} segTimes=${JSON.stringify(dec2.segTimes?.map(s => ({ s: +s.start.toFixed(2), e: +s.end.toFixed(2) })))}`);
if (dec2.segs.length) fs.writeFileSync(`${dir}/_audit_clean_fromera.wav`, buildCleanWav(dec2.segs, dec2.segTimes, 9600));

console.log('gerados _audit_*.wav em amostras/ — rode o wavanalyze neles');
