// Round-trip test for os9MakeBootable (phase C, v2 — clones BOTH the boot track and OS9Boot from a
// reference bootable disk). Verifies the generated disk matches how a real NitrOS-9 disk is laid out:
//   - boot track (track 34, side 0) bytes copied verbatim from the reference
//   - those sectors marked USED in the allocation bitmap
//   - OS9Boot present, contiguous; DD.BT = its data LSN; DD.BSZ = its size; DD.FMT = ref's
// NOTE: proves the on-disk STRUCTURE; an actual boot must still be confirmed in XRoar by the user.
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/os9mkboot.js [refDisk.dsk]

import * as fs from 'fs';
import {
  createBlankOs9, OS9_GEOMETRIES, os9MakeBootable, os9BootInfo, isOs9DiskStrict, parseOs9,
  parseIdent, readFD, readFileData, flattenOs9, os9Insert,
} from '../src/main/converter/os9';

let pass = 0, fail = 0;
const check = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const findFile = (raw: Buffer, name: string) => flattenOs9(parseOs9(raw, {}).root).find(x => x.node.name.toLowerCase() === name.toLowerCase());
const r24 = (b: Buffer, o: number) => (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];

function main() {
  const refPath = process.argv[2] || 'C:/Users/Matte/AppData/Local/Temp/ccc-os9-work/nos9_40d_1.dsk';
  const ref = fs.readFileSync(refPath);
  const refId = parseIdent(ref, 0);
  console.log(`Reference: ${refPath} — ${refId.totalSectors} sectors, SPT=${refId.sectorsPerTrack}, ${refId.sides} side(s), bootable=${os9BootInfo(ref, 0).bootable}`);

  // blank disk of the SAME geometry as the reference (so track 34 lands at the same LSN)
  const geomKey = Object.keys(OS9_GEOMETRIES).find(k => OS9_GEOMETRIES[k].totalSectors === refId.totalSectors && OS9_GEOMETRIES[k].sides === refId.sides);
  if (!geomKey) { console.log('No matching blank geometry for the reference; abort.'); process.exit(1); }
  console.log(`\n[make a blank ${geomKey} disk bootable by cloning the reference]`);
  const blank = createBlankOs9(OS9_GEOMETRIES[geomKey], { name: 'BOOTTEST' });
  check(!os9BootInfo(blank, 0).bootable, 'fresh blank disk is NOT bootable');

  const booted = os9MakeBootable(blank, ref, 0);
  check(isOs9DiskStrict(booted, 0), 'image still valid OS-9 after make-bootable');
  const info = os9BootInfo(booted, 0);
  check(info.bootable, `os9BootInfo reports bootable (DD.BT=${info.bootLsn}, DD.BSZ=${info.bootSize})`);

  // boot track (track 34 side 0) must be copied verbatim from the reference
  const bootTrackLsn = 34 * refId.sectorsPerTrack * refId.sides;
  const bootTrackSectors = refId.sectorsPerTrack;
  const a = booted.subarray(bootTrackLsn * 256, (bootTrackLsn + bootTrackSectors) * 256);
  const b = ref.subarray(bootTrackLsn * 256, (bootTrackLsn + bootTrackSectors) * 256);
  check(a.equals(b), `boot track (LSN ${bootTrackLsn}..${bootTrackLsn + bootTrackSectors - 1}) copied verbatim from reference`);
  check(a[0] === 0x4f && a[1] === 0x53, 'boot track starts with "OS" (DOS bootstrap signature)');

  // those sectors must be marked USED in the allocation bitmap (cluster bit set)
  const spc = refId.sectorsPerCluster;
  const clusterUsed = (c: number) => (booted[256 + (c >> 3)] & (0x80 >> (c & 7))) !== 0;
  let allUsed = true;
  for (let lsn = bootTrackLsn; lsn < bootTrackLsn + bootTrackSectors; lsn++) if (!clusterUsed(Math.floor(lsn / spc))) { allUsed = false; break; }
  check(allUsed, 'boot-track clusters are reserved (marked used) in the bitmap');

  // OS9Boot must be present, contiguous, byte-identical to the reference's, and DD.BT must point to it
  const refBootData = readFileData(ref, readFD(ref, findFileLsn(ref, 'OS9Boot'), 0), 0);
  const f = findFile(booted, 'OS9Boot');
  check(!!f, 'OS9Boot file present in root');
  if (f) {
    const fd = readFD(booted, f.node.fdLsn, 0);
    check(fd.segments.length === 1, `OS9Boot is contiguous (${JSON.stringify(fd.segments)})`);
    check(fd.segments[0].lsn === info.bootLsn, 'DD.BT == OS9Boot data LSN');
    check(readFileData(booted, fd, 0).equals(refBootData), 'OS9Boot data identical to the reference');
  }
  check(booted[0x10] === ref[0x10], `DD.FMT (density) copied from reference (0x${ref[0x10].toString(16)})`);

  // OS9Boot must NOT overlap the boot track (allocator placed it elsewhere)
  if (f) { const seg = readFD(booted, f.node.fdLsn, 0).segments[0]; check(seg.lsn + seg.sectors <= bootTrackLsn || seg.lsn >= bootTrackLsn + bootTrackSectors, 'OS9Boot does not overlap the boot track'); }

  // a later user write must preserve the bootstrap
  const withFile = os9Insert(booted, parseIdent(booted, 0).rootDirLsn, 'HELLO.TXT', Buffer.from('hi'), 0);
  const i2 = os9BootInfo(withFile, 0);
  check(i2.bootable && i2.bootLsn === info.bootLsn && i2.bootSize === info.bootSize, 'DD.BT/DD.BSZ preserved after inserting another file');

  const outPath = 'C:/Users/Matte/AppData/Local/Temp/ccc-os9-work/MADE_BOOTABLE_360k.dsk';
  fs.writeFileSync(outPath, withFile);
  console.log(`\nWrote a made-bootable disk → ${outPath}`);
  console.log('  STRUCTURE validated against the real reference. BOOT still UNVERIFIED — test in XRoar (CoCo3, drive 0, type DOS).');
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

// helper: LSN of a root file's FD by name
function findFileLsn(raw: Buffer, name: string): number {
  const id = parseIdent(raw, 0);
  const rootData = readFileData(raw, readFD(raw, id.rootDirLsn, 0), 0);
  for (let o = 0; o + 32 <= rootData.length; o += 32) {
    if (rootData[o] === 0) continue;
    let s = '';
    for (let i = 0; i < 29; i++) { const c = rootData[o + i]; if (c === 0) break; s += String.fromCharCode(c & 0x7f); if (c & 0x80) break; }
    if (s.toLowerCase() === name.toLowerCase()) return r24(rootData, o + 29);
  }
  return -1;
}

main();
