// OS-9 write round-trip against a REAL bootable NitrOS-9 disk (downloaded from sourceforge).
// Proves os9.ts reads the real disk, that an insert reads back, and that EVERY pre-existing file
// stays byte-identical (no collateral corruption). Also dumps the bootstrap fields (DD.BT/DD.BSZ)
// and OS9Boot location, to inform the "make bootable" (DD.BT) work.
//
//   compile: npx tsc -p tsconfig.tools.json     run: node out-tools/tools/os9real.js <disk.dsk>

import * as fs from 'fs';
import * as crypto from 'crypto';
import {
  isOs9DiskStrict, parseOs9, parseIdent, readFD, readFileData, flattenOs9, listDir, os9Insert,
} from '../src/main/converter/os9';

const r24 = (b: Buffer, o: number) => (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];
const r16 = (b: Buffer, o: number) => (b[o] << 8) | b[o + 1];

function fileHashes(raw: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  const parsed = parseOs9(raw, {});
  for (const { path, node } of flattenOs9(parsed.root)) {
    if (node.isDir) continue;
    const fd = readFD(raw, node.fdLsn, 0);
    const data = readFileData(raw, fd, 0);
    out.set(path, crypto.createHash('sha1').update(data).digest('hex'));
  }
  return out;
}

let pass = 0, fail = 0;
const check = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

function main() {
  const path = process.argv[2] || 'C:/Users/Matte/AppData/Local/Temp/ccc-os9-work/nos9_40d_1.dsk';
  const raw = fs.readFileSync(path);
  console.log(`Disk: ${path} (${raw.length} bytes)`);

  // 1) detection + identification
  check(isOs9DiskStrict(raw, 0), 'isOs9DiskStrict accepts the real NitrOS-9 disk');
  const id = parseIdent(raw, 0);
  console.log(`  volume="${id.name}" totalSectors=${id.totalSectors} SPT=${id.sectorsPerTrack} cluster=${id.sectorsPerCluster} rootDirLsn=${id.rootDirLsn} fmt=0x${id.format.toString(16)}`);
  const ddBt = r24(raw, 0x15), ddBsz = r16(raw, 0x18);
  console.log(`  DD.BT (bootstrap LSN)=${ddBt}  DD.BSZ (bootstrap size)=${ddBsz} bytes  → ${ddBt ? 'BOOTABLE (has OS9Boot)' : 'NOT bootable (no bootstrap)'}`);

  const parsed = parseOs9(raw, {});
  console.log(`  files=${parsed.totalFiles} dirs=${parsed.totalDirs} freeBytes=${parsed.freeBytes}`);
  const rootEntries = listDir(raw, readFD(raw, id.rootDirLsn, 0), 0).map(e => e.name);
  console.log(`  root entries: ${rootEntries.join(', ')}`);

  // 2) snapshot every file's content hash BEFORE the write
  const before = fileHashes(raw);
  console.log(`\n[insert round-trip] hashed ${before.size} existing files`);

  // 3) insert a NEW file into the root on a COPY, re-parse, verify
  const probe = Buffer.from('CCC-CONVERTER OS-9 WRITE TEST — '.repeat(40)); // ~1.2 KB
  const name = 'CCCTEST.TXT';
  let out: Buffer;
  try { out = os9Insert(raw, id.rootDirLsn, name, probe, 0, { date: { year: 2026, month: 6, day: 7, hour: 23, minute: 0 } }); }
  catch (e: any) { console.log('  ✗ insert threw: ' + e.message); console.log(`\n=== ${pass} passed, ${fail + 1} failed ===`); process.exit(1); }

  check(isOs9DiskStrict(out, 0), 'image still valid OS-9 after insert');
  const re = parseOs9(out, {});
  check(re.totalFiles === parsed.totalFiles + 1, `file count grew by 1 (${parsed.totalFiles} → ${re.totalFiles})`);
  const inserted = flattenOs9(re.root).find(x => x.node.name === name);
  check(!!inserted, `"${name}" is present after insert`);
  if (inserted) {
    const fd = readFD(out, inserted.node.fdLsn, 0);
    check(readFileData(out, fd, 0).equals(probe), `"${name}" reads back byte-for-byte`);
  }

  // 4) every PRE-EXISTING file must be byte-identical (no collateral damage)
  const after = fileHashes(out);
  let intact = true, firstBad = '';
  for (const [p, h] of before) { if (after.get(p) !== h) { intact = false; firstBad = p; break; } }
  check(intact, `all ${before.size} original files byte-identical after insert${intact ? '' : ' — FIRST DIFF: ' + firstBad}`);

  // 5) bootstrap fields preserved (DD.BT/DD.BSZ untouched → still bootable)
  check(r24(out, 0x15) === ddBt && r16(out, 0x18) === ddBsz, 'DD.BT/DD.BSZ (bootstrap) preserved after write');

  // write the modified copy out for an optional XRoar boot test by the user
  const outPath = path.replace(/\.dsk$/i, '_WRITTEN.dsk');
  fs.writeFileSync(outPath, out);
  console.log(`\nWrote modified copy → ${outPath} (mount in XRoar drive 1 and "dir /d1" after booting d0 to confirm)`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main();
