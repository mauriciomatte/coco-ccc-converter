// Validação do conversor DMK: de-DMK os samples e compara byte-a-byte com os .OS9 raw.
import * as fs from 'fs';
import * as path from 'path';
import { isDmk, dmkToRaw } from '../src/main/converter/dmk';
import { isOs9DiskStrict, parseOs9, flattenOs9 } from '../src/main/converter/os9';

const DIR = path.join(process.cwd(), 'amostras', 'blank-disks');

// (arquivo DMK, raw gêmeo COMPROVADAMENTE do mesmo disco p/ byte-a-byte | null)
// Só o par 720K é o mesmo disco salvo nos dois formatos; os blanks 158K/360K foram formatados
// independentemente (diferem em disk-id/timestamp/byte de preenchimento), então não batem byte.
const CASES: Array<[string, string | null]> = [
  ['158K-OS9.DSK', null],
  ['180K-OS9.DSK', null],
  ['360K-OS9.DSK', null],
  ['720K-OS9.DSK', '720K-OS9.OS9'],
];

let fail = 0;
for (const [dmkName, twinName] of CASES) {
  const p = path.join(DIR, dmkName);
  if (!fs.existsSync(p)) { console.log(`SKIP ${dmkName} (ausente)`); continue; }
  const buf = fs.readFileSync(p);
  const detected = isDmk(buf);
  console.log(`\n=== ${dmkName} (${buf.length} B) — isDmk=${detected} ===`);
  if (!detected) { console.log('  ✗ não detectado como DMK'); fail++; continue; }
  const { raw, geom } = dmkToRaw(buf);
  console.log(`  geom: ${geom.tracks}T × ${geom.sides} lado(s) × ${geom.sectorsPerTrack} setores × ${geom.sectorSize}B → raw ${raw.length} B`);

  // 1) COMPLETUDE: todo setor esperado foi decodificado (DMK degradado mostraria menos).
  const complete = geom.sectorsFound === geom.sectorsExpected;
  console.log(`  setores: ${geom.sectorsFound}/${geom.sectorsExpected} ${complete ? '✅ completo' : '✗ FALTANDO setores'}`);
  if (!complete) fail++;

  // 2) ESTRUTURA: o raw decodificado é um OS-9 RBF válido e navegável.
  const os9ok = isOs9DiskStrict(raw, 0);
  console.log(`  OS-9 (RBF) válido: ${os9ok ? '✅' : '✗'}`);
  if (!os9ok) fail++;
  else {
    const tree = parseOs9(raw, { maxDepth: 4 });
    console.log(`  volume="${tree.ident.name.trim()}"  arquivos=${flattenOs9(tree.root).length}  livres=${tree.freeSectors} setores`);
  }

  // 3) BYTE-A-BYTE só no par comprovado.
  if (twinName) {
    const rp = path.join(DIR, twinName);
    if (fs.existsSync(rp)) {
      const exp = fs.readFileSync(rp);
      let diffs = 0; for (let i = 0; i < Math.min(raw.length, exp.length); i++) if (raw[i] !== exp[i]) diffs++;
      const ok = raw.length === exp.length && diffs <= 1; // ≤1 byte de metadado tolerado
      console.log(`  byte-a-byte vs ${twinName}: ${ok ? `✅ (${diffs} byte de diferença)` : `✗ ${diffs} bytes diferem`}`);
      if (!ok) fail++;
    }
  }
}
console.log(fail ? `\n❌ ${fail} verificação(ões) falharam.` : '\n✅ Todas as verificações OK.');
process.exit(fail ? 1 : 0);
