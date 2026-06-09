// Scans candidate OS-9 disks and reports geometry + bootability + boot-track presence,
// to pick valid bootable SEEDS (gabaritos) for each geometry the app offers.
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/os9seedscan.js <dir-or-file...>
import * as fs from 'fs';
import * as path from 'path';
import { isOs9DiskStrict, parseIdent, os9BootInfo } from '../src/main/converter/os9';
import { normalizeDiskImage } from '../src/main/converter/dmk';

const SEC = 256;
const want: Record<string, { totalSectors: number; sides: number }> = {
  '158k': { totalSectors: 630, sides: 1 },
  '180k': { totalSectors: 720, sides: 1 },
  '360k': { totalSectors: 1440, sides: 2 },
  '720k': { totalSectors: 2880, sides: 2 },
};

function geomKey(totalSectors: number, sides: number): string {
  for (const [k, v] of Object.entries(want))
    if (v.totalSectors === totalSectors && v.sides === sides) return k;
  return `?(${totalSectors}/${sides}s)`;
}

function bootTrackOk(raw: Buffer, id: any): boolean {
  const bootTrackLsn = 34 * id.sectorsPerTrack * id.sides;
  const off = bootTrackLsn * SEC;
  if (off + SEC > raw.length) return false;
  const a = raw[off], b = raw[off + 1];
  // REL "OS" signature or OS-9 module sync 0x87CD
  return (a === 0x4f && b === 0x53) || (a === 0x87 && b === 0xcd);
}

function scanOne(fp: string) {
  let raw: Buffer;
  try { raw = normalizeDiskImage(fs.readFileSync(fp)); } catch { return; }
  if (!isOs9DiskStrict(raw, 0)) return;
  let id: any;
  try { id = parseIdent(raw, 0); } catch { return; }
  const gk = geomKey(id.totalSectors, id.sides);
  const bi = os9BootInfo(raw, 0);
  const bt = bootTrackOk(raw, id);
  const flag = (gk in want && bi.bootable && bt) ? '  <== SEED CANDIDATE' : '';
  console.log(
    `[${gk.padEnd(6)}] boot=${bi.bootable ? 'Y' : 'n'} btrack=${bt ? 'Y' : 'n'} ` +
    `bt=${bi.bootLsn} bsz=${bi.bootSize}  ${path.basename(fp)}${flag}`
  );
}

function walk(p: string) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e));
  else if (/\.(dsk|os9|dmk|jvc|sdf|img)$/i.test(p)) scanOne(p);
}

const args = process.argv.slice(2);
if (!args.length) args.push('C:/Users/Matte/Desktop/CCC-converter/amostras');
for (const a of args) { try { walk(a); } catch (e: any) { console.error(a, e.message); } }
