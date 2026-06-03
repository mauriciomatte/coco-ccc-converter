/*
 * OS-9 read validation harness: runs our os9.ts parser against the real OS-9 disk
 * corpus and prints, per disk, the identification record, free-space, and a
 * hierarchical directory tree. Cross-checks DD.TOT*256 against the file size.
 *
 * Build + run (see tsconfig.tools.json):
 *   npx tsc -p tsconfig.tools.json && node out-tools/tools/os9probe.js
 *   node out-tools/tools/os9probe.js amostras/os9/vmicons.dsk   # one disk, full tree
 *
 * With no args it scans amostras/os9 and prints a one-line summary per disk plus a
 * shallow tree; pass explicit file paths to get the full deep tree for those disks.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseOs9, isOs9Disk, Os9Node, Os9Date } from '../src/main/converter/os9';

const SAMPLE_DIR = path.join('amostras', 'os9');

function fmtDate(d: Os9Date | null): string {
  if (!d) return '';
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.year}-${p2(d.month)}-${p2(d.day)} ${p2(d.hour)}:${p2(d.minute)}`;
}

function printTree(node: Os9Node, indent: string, maxLines: { n: number }): void {
  for (const c of node.children ?? []) {
    if (maxLines.n <= 0) return;
    maxLines.n--;
    const tag = c.isDir ? '[DIR] ' : '      ';
    const size = c.isDir ? '' : `  ${c.size} B`;
    const date = c.modified ? `  ${fmtDate(c.modified)}` : '';
    console.log(`${indent}${tag}${c.attrString}  ${c.name}${size}${date}${c.truncated ? '  …(truncated)' : ''}`);
    if (c.isDir) printTree(c, indent + '  ', maxLines);
  }
}

function probe(file: string, deep: boolean): void {
  const raw = fs.readFileSync(file);
  console.log('\n================================================================');
  console.log(`${path.basename(file)}  (${raw.length} bytes)`);
  if (!isOs9Disk(raw)) {
    console.log('  ✗ not recognized as an OS-9 RBF disk (isOs9Disk=false)');
    return;
  }
  const p = parseOs9(raw);
  const id = p.ident;
  const sane = id.totalSectors * 256 === raw.length;
  console.log(`  VOLUME "${id.name}"   ${id.totalSectors} sectors x256 = ${id.totalSectors * 256} ` +
              `${sane ? 'OK' : '(≠ filesize!)'}`);
  console.log(`  geometry: SPT=${id.sectorsPerTrack} trackSize=${id.trackSize} sides=${id.sides} ` +
              `cluster=${id.sectorsPerCluster} sct  rootDir@LSN${id.rootDirLsn}  fmt=0x${id.format.toString(16)}`);
  console.log(`  contents: ${p.totalFiles} files, ${p.totalDirs} dirs   ` +
              `free=${p.freeSectors} sct (${p.freeBytes} B)  used=${p.usedSectors} sct`);
  const limit = { n: deep ? 100000 : 14 };
  printTree(p.root, '    ', limit);
  if (limit.n <= 0) console.log('    …(tree truncated — pass this file as an arg for the full listing)');
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length) {
    for (const f of args) probe(f, true);
    return;
  }
  const files = fs.readdirSync(SAMPLE_DIR)
    .filter(f => /\.(dsk|os9)$/i.test(f))
    .sort()
    .map(f => path.join(SAMPLE_DIR, f));
  let ok = 0, bad = 0;
  for (const f of files) {
    try { probe(f, false); ok++; } catch (e) { console.log(`  ERROR ${(e as Error).message}`); bad++; }
  }
  console.log(`\n================================================================`);
  console.log(`Scanned ${files.length} images.`);
}

main();
