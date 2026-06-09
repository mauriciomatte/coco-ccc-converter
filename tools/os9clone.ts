// Round-trip test for os9CloneBootable (the "New > Bootable [+ programs]" dropdown engine).
// Clones a real bootable NitrOS-9 reference disk, inserts a program into CMDS + writes a startup,
// and verifies: still valid OS-9 + bootable, program present in CMDS, startup lists it, and every
// original file is byte-identical. STRUCTURE only; real boot/run needs XRoar.
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/os9clone.js [ref.dsk]

import * as fs from 'fs';
import * as crypto from 'crypto';
import {
  os9CloneBootable, os9BootInfo, isOs9DiskStrict, parseOs9, parseIdent, readFD, readFileData,
  flattenOs9, listDir,
} from '../src/main/converter/os9';

let pass = 0, fail = 0;
const check = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const hashes = (raw: Buffer) => {
  const m = new Map<string, string>();
  for (const { path, node } of flattenOs9(parseOs9(raw, {}).root)) {
    if (node.isDir) continue;
    m.set(path, crypto.createHash('sha1').update(readFileData(raw, readFD(raw, node.fdLsn, 0), 0)).digest('hex'));
  }
  return m;
};
const findFile = (raw: Buffer, name: string) => flattenOs9(parseOs9(raw, {}).root).find(x => x.node.name.toLowerCase() === name.toLowerCase());

function main() {
  const refPath = process.argv[2] || 'C:/Users/Matte/AppData/Local/Temp/ccc-os9-work/nos9_40d_1.dsk';
  const ref = fs.readFileSync(refPath);
  const id = parseIdent(ref, 0);
  console.log(`Reference: ${refPath} — ${id.totalSectors} sec / ${id.sides} side(s), bootable=${os9BootInfo(ref, 0).bootable}, free=${parseOs9(ref, {}).freeBytes}B`);
  const before = hashes(ref);

  // 1) clone WITHOUT programs — must be an identical, still-bootable system
  console.log('\n[clone, no programs]');
  const plain = os9CloneBootable(ref, [], 0);
  check(isOs9DiskStrict(plain, 0), 'plain clone is valid OS-9');
  check(os9BootInfo(plain, 0).bootable, 'plain clone is bootable');
  check(plain.equals(ref), 'plain clone is byte-identical to the reference (a faithful copy)');

  // 2) clone WITH a program — goes into CMDS, startup lists it
  console.log('\n[clone + program]');
  const prog = { name: 'HELLO', data: Buffer.from('CCC OS-9 program payload — '.repeat(20)) }; // ~540 B
  const out = os9CloneBootable(ref, [prog], 0);
  check(isOs9DiskStrict(out, 0), 'clone+prog is valid OS-9');
  check(os9BootInfo(out, 0).bootable, 'clone+prog is still bootable (DD.BT preserved)');

  const oid = parseIdent(out, 0);
  const cmds = listDir(out, readFD(out, oid.rootDirLsn, 0), 0).find(e => e.name === 'CMDS');
  check(!!cmds, 'CMDS exists in the clone');
  const inCmds = cmds ? listDir(out, readFD(out, cmds.fdLsn, 0), 0).some(e => e.name === 'HELLO') : false;
  check(inCmds, 'HELLO is present in CMDS');
  const hf = findFile(out, 'HELLO');
  check(!!hf && readFileData(out, readFD(out, hf.node.fdLsn, 0), 0).equals(prog.data), 'HELLO reads back byte-for-byte');

  const refStartup = findFile(ref, 'startup');
  const origLen = refStartup ? readFileData(ref, readFD(ref, refStartup.node.fdLsn, 0), 0).length : 0;
  const sf = findFile(out, 'startup');
  check(!!sf, 'startup file present in root');
  if (sf) {
    const txt = readFileData(out, readFD(out, sf.node.fdLsn, 0), 0).toString('latin1');
    check(txt.endsWith('HELLO\r'), 'startup ends by running the program (HELLO)');
    check(txt.length > origLen, `startup PRESERVES the original (${origLen}B) and appends (now ${txt.length}B)`);
  }

  // 3) every ORIGINAL file still byte-identical, EXCEPT startup (we intentionally append to it)
  const after = hashes(out);
  let intact = true, bad = '';
  for (const [p, h] of before) { if (p === '/startup') continue; if (after.get(p) !== h) { intact = false; bad = p; break; } }
  check(intact, `all original files (except startup) byte-identical${intact ? '' : ' — DIFF: ' + bad}`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main();
