// Real-file FAT write validation (D12) against a COPY of the actual CoCoSDC/RetroRewind .img.
// SAFETY: only ever creates/modifies/deletes ITS OWN test file; it also hashes a sample of EXISTING
// user files before/after every op to prove zero collateral damage. Run ONLY on a throwaway copy.
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/fatreal.js <copy.img>

import * as fs from 'fs';
import * as crypto from 'crypto';
import { readFatVolume, listFatFiles, readFatFile, fatAddFile, fatReplaceFile, fatDeleteFile, Reader, Writer } from '../src/main/converter/fat';

let pass = 0, fail = 0;
const check = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const rnd = (n: number, seed: number) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * 37 + seed * 101) & 0xff; return b; };

function main() {
  const path = process.argv[2];
  if (!path) { console.log('usage: fatreal <copy.img>'); process.exit(2); }
  if (/retrorewind_03112025|CoCoSDC_RetroRewind_03112025\.img$/i.test(path)) { console.log('REFUSING to run on what looks like the ORIGINAL image. Use a copy.'); process.exit(2); }
  const fd = fs.openSync(path, 'r+');
  const read: Reader = (off, len) => { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, off); return b; };
  const write: Writer = (off, data) => { fs.writeSync(fd, data, 0, data.length, off); };
  try {
    const vol = readFatVolume(read);
    if (!vol) { console.log('FAIL: no FAT volume'); process.exit(1); }
    console.log(`Volume: ${vol.type}  base=${vol.baseOffset}  spc=${vol.sectorsPerCluster}  bytes/sec=${vol.bytesPerSector}  clusterBytes=${vol.sectorsPerCluster * vol.bytesPerSector}`);

    const files = listFatFiles(read, vol, ['dsk']).filter(f => !f.name.startsWith('._') && f.size >= 4608);
    console.log(`Existing .dsk files: ${files.length}`);
    if (!files.length) { console.log('No .dsk to sample — abort.'); process.exit(1); }

    // sample up to 40 existing files, hash their contents (the "untouched" witnesses)
    const step = Math.max(1, Math.floor(files.length / 40));
    const sample = files.filter((_, i) => i % step === 0).slice(0, 40);
    const hash = (b: Buffer) => crypto.createHash('sha1').update(b).digest('hex');
    const before = sample.map(f => ({ f, h: hash(readFatFile(read, vol, f)) }));
    console.log(`Sampled ${before.length} witness files.`);
    const witnessesOk = (tag: string) => {
      let ok = true, bad = '';
      // re-resolve by path each time (cluster/size may move only for the file WE touch, never these)
      const cur = listFatFiles(read, vol, ['dsk']);
      for (const { f, h } of before) {
        const now = cur.find(x => x.path === f.path);
        if (!now || hash(readFatFile(read, vol, now)) !== h) { ok = false; bad = f.path; break; }
      }
      check(ok, `[${tag}] all ${before.length} witness files intact${ok ? '' : ' — DIFF: ' + bad}`);
    };

    // pick an existing file and do a content-IDENTICAL write-back (exercises the replace path on a real
    // existing chain without changing logical content)
    const victim = files[Math.floor(files.length / 2)];
    const vbytes = readFatFile(read, vol, victim);
    console.log(`\n[A] identical write-back of an existing file: ${victim.path} (${vbytes.length} B)`);
    fatReplaceFile(read, write, vol, victim.path, vbytes);
    let rv = listFatFiles(read, vol, ['dsk']).find(x => x.path === victim.path);
    check(!!rv && readFatFile(read, vol, rv).equals(vbytes), 'existing file identical after self write-back');
    witnessesOk('A');

    // insert OUR OWN new test file
    const testName = 'CCCFATTEST.DSK';
    const dataA = rnd(161280, 1);
    console.log(`\n[B] insert ${testName} (${dataA.length} B)`);
    fatAddFile(read, write, vol, '', testName, dataA);
    let t = listFatFiles(read, vol, ['dsk']).find(x => x.name.toUpperCase() === testName);
    check(!!t && readFatFile(read, vol, t).equals(dataA), 'inserted test file reads back byte-for-byte');
    witnessesOk('B');

    // grow it
    console.log('\n[C] replace test file with LARGER data');
    const dataB = rnd(368640, 2);
    fatReplaceFile(read, write, vol, testName, dataB);
    t = listFatFiles(read, vol, ['dsk']).find(x => x.name.toUpperCase() === testName);
    check(!!t && readFatFile(read, vol, t).equals(dataB), 'grown test file reads back byte-for-byte');
    witnessesOk('C');

    // shrink it
    console.log('\n[D] replace test file with SMALLER data');
    const dataC = rnd(40000, 3);
    fatReplaceFile(read, write, vol, testName, dataC);
    t = listFatFiles(read, vol, ['dsk']).find(x => x.name.toUpperCase() === testName);
    check(!!t && readFatFile(read, vol, t).equals(dataC), 'shrunk test file reads back byte-for-byte');
    witnessesOk('D');

    // delete it
    console.log('\n[E] delete the test file');
    fatDeleteFile(read, write, vol, testName);
    check(!listFatFiles(read, vol, ['dsk']).some(x => x.name.toUpperCase() === testName), 'test file gone after delete');
    witnessesOk('E');

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  } finally { fs.closeSync(fd); }
  process.exit(fail ? 1 : 0);
}

main();
