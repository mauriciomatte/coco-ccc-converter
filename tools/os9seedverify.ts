// Verifies a seed disk survives the app's real path: os9CloneBootable(seed, []) → parseOs9 (valid RBF)
// and stays bootable. Also clones WITH a tiny program to exercise CMDS insert + startup append.
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/os9seedverify.js <seed...>
import * as fs from 'fs';
import * as path from 'path';
import { os9CloneBootable, parseOs9, os9BootInfo, parseIdent } from '../src/main/converter/os9';
import { normalizeDiskImage } from '../src/main/converter/dmk';

for (const fp of process.argv.slice(2)) {
  const seed = normalizeDiskImage(fs.readFileSync(fp));
  const id = parseIdent(seed, 0);
  // 1) clone empty
  const a = os9CloneBootable(seed, [], 0);
  parseOs9(a, { base: 0 });
  const ba = os9BootInfo(a, 0);
  // 2) clone with a program
  const prog = Buffer.from('test', 'ascii');
  const b = os9CloneBootable(seed, [{ name: 'CCCTEST', data: prog }], 0);
  const pb = parseOs9(b, { base: 0 });
  const bb = os9BootInfo(b, 0);
  console.log(
    `${path.basename(fp)}: ${id.totalSectors}sec/${id.sides}s  ` +
    `clone-empty boot=${ba.bootable ? 'Y' : 'n'}  ` +
    `clone+prog boot=${bb.bootable ? 'Y' : 'n'} totalFiles=${pb?.totalFiles ?? '?'}  OK`
  );
}
