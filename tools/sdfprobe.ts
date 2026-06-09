// SDF (CoCoSDC) reader validation. Runs against a REAL sample (FHL Color FLEX 5.0.4) and CROSS-CHECKS
// the decoded raw image against the SAME disk captured in DMK form (dmkToRaw), which our existing,
// already-validated DMK decoder produces. Also checks detection (isSdf accepts SDF, rejects DMK/raw).
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/sdfprobe.js [sample.sdf] [twin.dmk]

import * as fs from 'fs';
import { isSdf, sdfToRaw, readSdfTrack } from '../src/main/converter/sdf';
import { isDmk, dmkToRaw } from '../src/main/converter/dmk';

let pass = 0, fail = 0;
const check = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

function main() {
  const sdfPath = process.argv[2] || 'C:/Users/Matte/AppData/Local/Temp/ccc-os9-work/sdf_sample/flex.sdf';
  const dmkPath = process.argv[3] || 'C:/Users/Matte/AppData/Local/Temp/ccc-os9-work/sdf_sample/flex.dmk';
  const sdf = fs.readFileSync(sdfPath);
  console.log(`SDF sample: ${sdfPath} (${sdf.length} bytes)`);

  // 1) detection + header geometry
  check(isSdf(sdf), "isSdf accepts the real .sdf (magic 'SDF1' + exact size)");
  const cyl = sdf[4], sides = sdf[5];
  console.log(`  header: cyl=${cyl} sides=${sides} wperm=0x${sdf[6].toString(16)} nested=${sdf[7]}`);
  check(sdf.length === 512 + cyl * sides * 6656, `size matches 512 + ${cyl}*${sides}*6656`);

  // 2) track 0 decode (FLEX: single density / FM, 10 sectors of 256 B)
  const t0 = readSdfTrack(sdf, 0);
  console.log(`  track 0: ${t0.length} sectors; ids=[${t0.map(s => s.sector).join(',')}]; sizes=[${[...new Set(t0.map(s => s.size))].join(',')}]; fm=${t0[0]?.fm}`);
  check(t0.length > 0, 'track 0 decodes at least one sector');
  check(t0.every(s => s.size === 256), 'track 0 sectors are 256 B');
  check(t0[0]?.fm === true, 'track 0 is FM (single density) — as expected for FLEX');

  // 3) full decode
  const { raw, geom } = sdfToRaw(sdf);
  console.log(`  sdfToRaw: ${geom.cylinders}cyl x ${geom.sides}side, SPT=${geom.sectorsPerTrack}, ${geom.sectorSize}B; found ${geom.sectorsFound}/${geom.sectorsExpected}; protected=${geom.protectedSectors}`);
  check(geom.sectorsFound > 0, 'sdfToRaw placed sectors');

  // 4) CROSS-CHECK vs the twin DMK (same physical disk) — the gold validation
  if (fs.existsSync(dmkPath)) {
    const dmk = fs.readFileSync(dmkPath);
    check(isDmk(dmk), 'twin DMK detected');
    check(!isSdf(dmk), 'isSdf correctly REJECTS the DMK');
    const draw = dmkToRaw(dmk).raw;
    const n = Math.min(raw.length, draw.length);
    let sameSectors = 0, totalSectors = Math.floor(n / 256), firstDiff = -1;
    for (let s = 0; s < totalSectors; s++) {
      const a = raw.subarray(s * 256, s * 256 + 256), b = draw.subarray(s * 256, s * 256 + 256);
      if (a.equals(b)) sameSectors++; else if (firstDiff < 0) firstDiff = s;
    }
    const pct = ((sameSectors / totalSectors) * 100).toFixed(1);
    console.log(`  SDF vs DMK raw: ${sameSectors}/${totalSectors} sectors identical (${pct}%)${firstDiff >= 0 ? `, first diff at sector ${firstDiff}` : ''}`);
    check(sameSectors / totalSectors >= 0.95, `>=95% of sectors match the twin DMK decode (got ${pct}%)`);
  } else {
    console.log('  (no twin DMK provided — skipping cross-check)');
  }

  // 5) detection rejects a plain raw image
  check(!isSdf(Buffer.alloc(161280, 0xe5)), 'isSdf rejects a plain raw .dsk-sized buffer');

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main();
