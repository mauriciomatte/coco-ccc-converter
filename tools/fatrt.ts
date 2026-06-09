// FAT write-engine round-trip test (D12). Builds a synthetic, standard 1.44 MB FAT12 floppy image
// in memory and exercises the clean-room writer (fatAddFile / fatReplaceFile / fatDeleteFile) against
// our own reader (readFatVolume / listFatFiles / readFatFile). No external FAT image needed.
//
//   compile: npx tsc -p tsconfig.tools.json      run: node out-tools/tools/fatrt.js
//
// This is the FAT counterpart of os9probe.ts — a consistency harness for the SD-card write path.

import {
  readFatVolume, listFatFiles, readFatFile, fatAddFile, fatReplaceFile, fatDeleteFile, Reader, Writer,
} from '../src/main/converter/fat';

// ---- build an empty standard 1.44 MB FAT12 image ----------------------------
function buildFat12(): Buffer {
  const SEC = 512, TOTAL = 2880; // 1.44 MB
  const img = Buffer.alloc(SEC * TOTAL, 0);
  const bs = img; // boot sector at 0
  bs[0] = 0xeb; bs[1] = 0x3c; bs[2] = 0x90;                 // jmp
  bs.write('MSDOS5.0', 3, 'latin1');                        // OEM
  bs.writeUInt16LE(512, 0x0b);    // bytes/sector
  bs[0x0d] = 1;                   // sectors/cluster
  bs.writeUInt16LE(1, 0x0e);      // reserved sectors
  bs[0x10] = 2;                   // num FATs
  bs.writeUInt16LE(224, 0x11);    // root entries
  bs.writeUInt16LE(2880, 0x13);   // total sectors (16)
  bs[0x15] = 0xf0;                // media
  bs.writeUInt16LE(9, 0x16);      // sectors/FAT
  bs.writeUInt16LE(18, 0x18);     // sectors/track
  bs.writeUInt16LE(2, 0x1a);      // heads
  bs[510] = 0x55; bs[511] = 0xaa; // signature
  // FAT0 + FAT1 first entries: media byte + EOC markers
  const fat0 = 1 * 512, fat1 = (1 + 9) * 512;
  for (const f of [fat0, fat1]) { img[f] = 0xf0; img[f + 1] = 0xff; img[f + 2] = 0xff; }
  return img;
}

// ---- build an empty FAT32 volume (≥65525 clusters) --------------------------
function buildFat32(): Buffer {
  const SEC = 512, spc = 1, reserved = 32, numFATs = 2, N = 70000; // data clusters → FAT32
  const fatSize = Math.ceil(((N + 2) * 4) / SEC);                  // sectors per FAT
  const firstData = reserved + numFATs * fatSize;
  const total = firstData + N * spc;
  const img = Buffer.alloc(total * SEC, 0);
  const bs = img;
  bs[0] = 0xeb; bs[1] = 0x58; bs[2] = 0x90;
  bs.write('MSDOS5.0', 3, 'latin1');
  bs.writeUInt16LE(SEC, 0x0b); bs[0x0d] = spc; bs.writeUInt16LE(reserved, 0x0e); bs[0x10] = numFATs;
  bs.writeUInt16LE(0, 0x11);    // root entries = 0 (FAT32)
  bs.writeUInt16LE(0, 0x13);    // totalSectors16 = 0
  bs[0x15] = 0xf8;              // media (fixed)
  bs.writeUInt16LE(0, 0x16);    // fatSize16 = 0
  bs.writeUInt16LE(63, 0x18); bs.writeUInt16LE(255, 0x1a);
  bs.writeUInt32LE(total, 0x20);   // totalSectors32
  bs.writeUInt32LE(fatSize, 0x24); // fatSize32
  bs.writeUInt32LE(2, 0x2c);       // root cluster
  bs[510] = 0x55; bs[511] = 0xaa;
  // FAT init: entry0 media, entry1 EOC, entry2 (root) EOC (one cluster)
  for (let i = 0; i < numFATs; i++) {
    const f = (reserved + i * fatSize) * SEC;
    img.writeUInt32LE(0x0ffffff8, f); img.writeUInt32LE(0x0fffffff, f + 4); img.writeUInt32LE(0x0fffffff, f + 8);
  }
  return img;
}

function rw(img: Buffer): { read: Reader; write: Writer } {
  return {
    read: (off, len) => img.subarray(off, off + len),
    write: (off, data) => { data.copy(img, off); },
  };
}

let pass = 0, fail = 0;
const check = (cond: boolean, msg: string) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const rnd = (n: number) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 0xff; return b; };

function runBattery(img: Buffer, expectType: string) {
  const { read, write } = rw(img);
  const vol = readFatVolume(read);
  if (!vol) { console.log('FAIL: could not parse the synthetic BPB'); process.exit(1); }
  check(vol.type === expectType, `parsed as ${expectType} (got ${vol.type})`);
  console.log(`Synthetic volume: ${vol.type}, ${vol.totalSectors} sectors, ${vol.sectorsPerCluster} sec/cluster`);

  // 1) add a short-name file spanning many clusters
  console.log('\n[1] add GAME.DSK (161280 B, multi-cluster)');
  const dataA = rnd(161280);
  fatAddFile(read, write, vol, '', 'GAME.DSK', dataA);
  let files = listFatFiles(read, vol, ['dsk']);
  let g = files.find(f => f.name.toUpperCase() === 'GAME.DSK');
  check(!!g, 'GAME.DSK is listed');
  check(!!g && readFatFile(read, vol, g).equals(dataA), 'GAME.DSK reads back byte-for-byte');

  // 2) add a LONG-name file (forces LFN entries) + read back via the LFN
  console.log('\n[2] add a long-name file (LFN)');
  const longName = 'A Very Long Disk Name v2.dsk';
  const dataB = rnd(50000);
  fatAddFile(read, write, vol, '', longName, dataB);
  files = listFatFiles(read, vol, ['dsk']);
  const lf = files.find(f => f.name === longName);
  check(!!lf, `long name preserved exactly: "${longName}"`);
  check(!!lf && readFatFile(read, vol, lf).equals(dataB), 'long-name file reads back byte-for-byte');

  // 3) replace GAME.DSK with LARGER content (chain must grow)
  console.log('\n[3] replace GAME.DSK with larger data (chain grows)');
  const dataC = rnd(184320);
  fatReplaceFile(read, write, vol, 'GAME.DSK', dataC);
  g = listFatFiles(read, vol, ['dsk']).find(f => f.name.toUpperCase() === 'GAME.DSK');
  check(!!g && g.size === 184320, 'directory size updated to 184320');
  check(!!g && readFatFile(read, vol, g).equals(dataC), 'larger GAME.DSK reads back byte-for-byte');

  // 4) replace with SMALLER content (chain must shrink + free clusters)
  console.log('\n[4] replace GAME.DSK with smaller data (chain shrinks)');
  const dataD = rnd(40000);
  fatReplaceFile(read, write, vol, 'GAME.DSK', dataD);
  g = listFatFiles(read, vol, ['dsk']).find(f => f.name.toUpperCase() === 'GAME.DSK');
  check(!!g && readFatFile(read, vol, g).equals(dataD), 'smaller GAME.DSK reads back byte-for-byte');
  // the long-name file must be UNTOUCHED after all the GAME.DSK churn
  const lf2 = listFatFiles(read, vol, ['dsk']).find(f => f.name === longName);
  check(!!lf2 && readFatFile(read, vol, lf2).equals(dataB), 'long-name file still intact after replaces');

  // 5) delete GAME.DSK, then reuse the freed space with a new file
  console.log('\n[5] delete GAME.DSK + add a fresh file in the freed space');
  fatDeleteFile(read, write, vol, 'GAME.DSK');
  check(!listFatFiles(read, vol, ['dsk']).some(f => f.name.toUpperCase() === 'GAME.DSK'), 'GAME.DSK gone after delete');
  const dataE = rnd(120000);
  fatAddFile(read, write, vol, '', 'NEW.DSK', dataE);
  const ne = listFatFiles(read, vol, ['dsk']).find(f => f.name.toUpperCase() === 'NEW.DSK');
  check(!!ne && readFatFile(read, vol, ne).equals(dataE), 'NEW.DSK reads back byte-for-byte');

  // 6) duplicate-name guard
  console.log('\n[6] duplicate-name guard');
  let threw = false;
  try { fatAddFile(read, write, vol, '', 'NEW.DSK', dataE); } catch { threw = true; }
  check(threw, 'adding a duplicate name throws');

  // 7) force the directory to GROW (many files) — exercises cluster-chain dir growth + non-contiguous
  //    slot handling (FAT32 root is a cluster chain; FAT12 fixed root just fills its region).
  console.log('\n[7] add many files (directory growth)');
  const COUNT = 40;
  const payloads: Buffer[] = [];
  let addErr = '';
  try {
    for (let i = 0; i < COUNT; i++) { const d = rnd(2048 + i); payloads.push(d); fatAddFile(read, write, vol, '', `BULK${i}.DSK`, d); }
  } catch (e: any) { addErr = e.message; }
  check(!addErr, `added ${COUNT} files without error${addErr ? ' — ' + addErr : ''}`);
  let allOk = true;
  for (let i = 0; i < COUNT; i++) {
    const f = listFatFiles(read, vol, ['dsk']).find(x => x.name.toUpperCase() === `BULK${i}.DSK`);
    if (!f || !readFatFile(read, vol, f).equals(payloads[i])) { allOk = false; break; }
  }
  check(allOk, `all ${COUNT} bulk files read back byte-for-byte`);
}

function main() {
  console.log('############ FAT12 (1.44 MB floppy) ############');
  runBattery(buildFat12(), 'FAT12');
  console.log('\n############ FAT32 (~36 MB, CoCoSDC/RetroRewind-like) ############');
  runBattery(buildFat32(), 'FAT32');
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main();
