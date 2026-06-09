// Studies the OS9Boot/bootstrap layout of a real bootable NitrOS-9 disk, to ground the
// "make bootable" (DD.BT/DD.BSZ) feature. Confirms whether OS9Boot is a normal contiguous file
// whose data LSN == DD.BT and byte size == DD.BSZ.
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/os9boot.js <disk.dsk>

import * as fs from 'fs';
import { parseIdent, readFD, readFileData, listDir } from '../src/main/converter/os9';

const r24 = (b: Buffer, o: number) => (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];
const r16 = (b: Buffer, o: number) => (b[o] << 8) | b[o + 1];

function main() {
  const path = process.argv[2] || 'C:/Users/Matte/AppData/Local/Temp/ccc-os9-work/nos9_40d_1.dsk';
  const raw = fs.readFileSync(path);
  const id = parseIdent(raw, 0);
  const ddBt = r24(raw, 0x15), ddBsz = r16(raw, 0x18);
  console.log(`${path}`);
  console.log(`DD.BT=${ddBt}  DD.BSZ=${ddBsz}  totalSectors=${id.totalSectors} cluster=${id.sectorsPerCluster}`);

  const root = readFD(raw, id.rootDirLsn, 0);
  const boot = listDir(raw, root, 0).find(e => e.name.toLowerCase() === 'os9boot');
  if (!boot) { console.log('No OS9Boot file in root.'); return; }
  const fd = readFD(raw, boot.fdLsn, 0);
  console.log(`OS9Boot FD@LSN ${boot.fdLsn}  size=${fd.size}  attr=${fd.attrString}  segments=${JSON.stringify(fd.segments)}`);
  const firstDataLsn = fd.segments[0]?.lsn;
  console.log(`OS9Boot first data LSN = ${firstDataLsn}`);
  console.log(`Contiguous (1 segment)?  ${fd.segments.length === 1 ? 'YES' : 'NO (' + fd.segments.length + ' segments)'}`);
  console.log(`DD.BT == OS9Boot data LSN?  ${ddBt === firstDataLsn ? 'YES' : 'NO'}`);
  console.log(`DD.BSZ == OS9Boot size?     ${ddBsz === fd.size ? 'YES' : `NO (DD.BSZ=${ddBsz} fileSize=${fd.size})`}`);

  // dump first 16 bytes of the boot module (OS-9 module header sync = 0x87 0xCD)
  const data = readFileData(raw, fd, 0);
  console.log(`OS9Boot first bytes: ${[...data.subarray(0, 8)].map(b => b.toString(16).padStart(2, '0')).join(' ')}  (module sync 0x87CD expected)`);
  // save the boot module for reuse by os9MakeBootable
  const outBoot = path.replace(/\.dsk$/i, '_OS9Boot.mod');
  fs.writeFileSync(outBoot, data);
  console.log(`Saved OS9Boot module → ${outBoot} (${data.length} bytes)`);
}

main();
