// SDF WRITE (encoder) validation: (1) prove our WD CRC matches a REAL SDF's stored CRCs (so the
// generated disk is FDC-readable on the real CoCoSDC); (2) round-trip rawToSdf → sdfToRaw == raw on a
// real OS-9 disk and on a blank OS-9 disk; (3) the encoded SDF is detected by isSdf with right geometry.
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/sdfrt.js

import * as fs from 'fs';
import { rawToSdf, sdfToRaw, isSdf } from '../src/main/converter/sdf';
import { createBlankOs9, OS9_GEOMETRIES } from '../src/main/converter/os9';

let pass = 0, fail = 0;
const check = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const crc16 = (b: Buffer, s: number, e: number) => { let c = 0xffff; for (let i = s; i < e; i++) { c ^= b[i] << 8; for (let k = 0; k < 8; k++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c & 0xffff; };

function main() {
  // 1) CRC algorithm vs a REAL SDF (FLEX, MFM track 1)
  const flexPath = 'C:/Users/Matte/AppData/Local/Temp/ccc-os9-work/sdf_sample/flex.sdf';
  if (fs.existsSync(flexPath)) {
    const f = fs.readFileSync(flexPath);
    const rec = 512 + 1 * 6656;                       // track 1 (MFM)
    const idOff = (f[rec + 8] | (f[rec + 9] << 8)) & 0x3fff;
    const base = rec + idOff - 4;                      // A1 A1 A1 FE
    const storedId = (f[base + 8] << 8) | f[base + 9];
    check(crc16(f, base, base + 8) === storedId, `WD CRC matches real SDF ID CRC (0x${storedId.toString(16)})`);
    const dataOff = (f[rec + 10] | (f[rec + 11] << 8)) & 0x3fff;
    const ds = rec + dataOff - 4;                      // A1 A1 A1 FB
    const storedData = (f[ds + 4 + 256] << 8) | f[ds + 4 + 256 + 1];
    check(crc16(f, ds, ds + 4 + 256) === storedData, `WD CRC matches real SDF DATA CRC (0x${storedData.toString(16)})`);
  } else console.log('  (no flex.sdf sample — skipping real-CRC check)');

  // 2) round-trip on a REAL OS-9 disk (360K, 40 cyl, 2 sides, 18 spt)
  const os9Path = 'C:/Users/Matte/AppData/Local/Temp/ccc-os9-work/nos9_40d_1.dsk';
  if (fs.existsSync(os9Path)) {
    const raw = fs.readFileSync(os9Path);
    console.log(`\n[real OS-9 360K → SDF → raw]`);
    const sdf = rawToSdf(raw, { sectorsPerTrack: 18, sides: 2 });
    check(isSdf(sdf), `encoded SDF is detected by isSdf (${sdf.length} bytes)`);
    check(sdf[4] === 40 && sdf[5] === 2, `header geometry cyl=40 sides=2 (got ${sdf[4]}/${sdf[5]})`);
    const back = sdfToRaw(sdf).raw;
    check(back.length >= raw.length && back.subarray(0, raw.length).equals(raw), 'sdfToRaw(rawToSdf(raw)) == raw (byte-for-byte)');
    fs.writeFileSync(os9Path.replace(/\.dsk$/i, '.sdf'), sdf);
    console.log(`  wrote ${os9Path.replace(/\.dsk$/i, '.sdf')} for an XRoar/CoCoSDC test`);
  } else console.log('  (no nos9_40d_1.dsk — skipping OS-9 round-trip)');

  // 3) blank OS-9 disks (each geometry) → SDF → raw
  console.log('\n[blank OS-9 → SDF → raw]');
  for (const [key, g] of Object.entries(OS9_GEOMETRIES)) {
    const blank = createBlankOs9(g, { name: 'SDFTEST' });
    const spt = 18; // OS-9 geometrias padrão usam 18 setores/trilha
    const sdf = rawToSdf(blank, { sectorsPerTrack: spt, sides: g.sides });
    const back = sdfToRaw(sdf).raw;
    check(back.length >= blank.length && back.subarray(0, blank.length).equals(blank), `${key} (${g.sides} side) round-trips byte-for-byte`);
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main();
