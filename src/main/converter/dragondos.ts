// Dragon DOS disk + VDK container support (READ-ONLY).
//
// Distinct from RS-DOS (dsk.ts): a Dragon DOS disk keeps its directory on TRACK 20
// (not track 17), uses 25-byte directory entries with NUL-padded 8.3 names, and
// allocates space with Sector Allocation Blocks (big-endian LSN + contiguous count)
// plus a sector bitmap — there is no RS-DOS granule FAT.
//
// Format reference: http://dragon32.info/info/drgndos.html (verified against real .vdk).
//
// VDK is the common on-disk container for Dragon images: a 12-byte (variable) header
// beginning with the ASCII signature "dk", followed by the raw LSN-ordered sectors.

const SEC = 256;
const DIR_TRACK = 20;

export interface DragonFileEntry {
  name: string;
  ext: string;
  fullName: string;
  protected: boolean;
  sectors: number[];          // ordered list of LSNs occupied by the file
  bytesInLastSector: number;  // 1..256
  totalSize: number;          // exact byte length
  index: number;              // directory entry number (0..159)
  fragmented: boolean;        // sectors are not a single contiguous run
}

export interface ParsedDragon {
  files: DragonFileEntry[];
  tracks: number;
  sectorsPerTrack: number;    // 18 (SS) or 36 (DS)
  sides: number;
  totalSectors: number;
  usedSectors: number;
  freeSectors: number;
  used: Uint8Array;           // per-LSN: 1 = used, 0 = free (from the bitmap)
}

/** A VDK container starts with the ASCII signature "dk". */
export function isVdk(buf: Buffer): boolean {
  return buf.length >= 12 && buf[0] === 0x64 /* d */ && buf[1] === 0x6b /* k */;
}

/** VDK header length (bytes 2-3, little-endian); the raw image follows it. */
export function vdkHeaderLen(buf: Buffer): number {
  return buf[2] | (buf[3] << 8);
}

/** Strip a VDK header if present, returning the raw LSN-ordered sector image. */
export function stripVdk(buf: Buffer): Buffer {
  return isVdk(buf) ? buf.subarray(vdkHeaderLen(buf)) : buf;
}

/** Byte offset of a logical sector number in the raw (de-headered) image. */
function lsnOffset(lsn: number): number {
  return lsn * SEC;
}

/**
 * Is `raw` (already de-headered) a Dragon DOS disk? Validates the format-ID field at
 * Track 20, Sector 1, offset 0xFC..0xFF: [tracks][sectors/trk][~tracks][~sectors],
 * where the last two are the one's complement of the first two.
 */
export function isDragonDosDisk(raw: Buffer): boolean {
  const o = lsnOffset(DIR_TRACK * 18); // Track 20, Sector 1 (LSN 360) — SS layout
  if (raw.length < o + SEC) return false;
  const t = raw[o + 0xFC], s = raw[o + 0xFD];
  return (
    ((t + raw[o + 0xFE]) & 0xFF) === 0xFF &&
    ((s + raw[o + 0xFF]) & 0xFF) === 0xFF &&
    (t === 35 || t === 40 || t === 80) &&
    (s === 18 || s === 36)
  );
}

/** Convenience: accepts a VDK or a raw image and tells whether it is Dragon DOS. */
export function looksDragon(buf: Buffer): boolean {
  try { return isDragonDosDisk(stripVdk(buf)); } catch { return false; }
}

// LSN of the directory track's sector 1 (the bitmap/format sector). For SS this is
// 360 (20*18); for DS the directory track is still track 20 but sectors-per-track is 36.
function dirTrackBaseLsn(sectorsPerTrack: number): number {
  return DIR_TRACK * sectorsPerTrack;
}

/** Expand a directory entry number (0..159) to its byte offset in `raw`. */
function entryOffset(raw: Buffer, sectorsPerTrack: number, entryNum: number): number {
  const base = dirTrackBaseLsn(sectorsPerTrack);
  // Directory entries live in sectors 3..18 (1-based) of the directory track:
  // 10 entries per sector. Entry n → sector (3 + floor(n/10)) → LSN base + 2 + floor(n/10).
  const lsn = base + 2 + Math.floor(entryNum / 10);
  return lsnOffset(lsn) + (entryNum % 10) * 25;
}

/** Read the 3-byte Sector Allocation Blocks from a header/continuation entry. */
function readSabs(raw: Buffer, off: number, isContinuation: boolean): Array<{ lsn: number; count: number }> {
  // Header block: 4 SABs at 0x0C, 0x0F, 0x12, 0x15.
  // Continuation block: 7 SABs at 0x01, 0x04, ... 0x13.
  const starts = isContinuation ? [0x01, 0x04, 0x07, 0x0a, 0x0d, 0x10, 0x13]
                                : [0x0c, 0x0f, 0x12, 0x15];
  const out: Array<{ lsn: number; count: number }> = [];
  for (const s of starts) {
    const lsn = (raw[off + s] << 8) | raw[off + s + 1]; // big-endian LSN
    const count = raw[off + s + 2];
    if (count > 0) out.push({ lsn, count });
  }
  return out;
}

/**
 * Parse a Dragon DOS disk (raw, de-headered). Read-only: returns the file directory,
 * geometry and per-sector occupancy. Throws if not a Dragon DOS disk.
 */
export function parseDragonDos(raw: Buffer): ParsedDragon {
  if (!isDragonDosDisk(raw)) throw new Error('Not a Dragon DOS disk');
  const fmtLsn = DIR_TRACK * 18; // SS format sector
  const fo = lsnOffset(fmtLsn);
  const tracks = raw[fo + 0xFC];
  const sectorsPerTrack = raw[fo + 0xFD];
  const sides = sectorsPerTrack === 36 ? 2 : 1;
  const totalSectors = tracks * sectorsPerTrack;

  // Sector bitmap: track-20 sector 1 covers LSN 0x000-0x59f, sector 2 covers 0x5a0-0xb3f.
  // bit = 0 → used, 1 → free.  used[lsn] = 1 means occupied.
  const used = new Uint8Array(totalSectors);
  const bmp1 = fo;                                   // track20 sector1
  const bmp2 = lsnOffset(dirTrackBaseLsn(sectorsPerTrack) + 1); // track20 sector2
  const bitFree = (byteVal: number, bit: number) => ((byteVal >> bit) & 1) === 1;
  for (let lsn = 0; lsn < totalSectors; lsn++) {
    let byteOff: number, bitIdx: number;
    if (lsn <= 0x59f) { byteOff = bmp1 + (lsn >> 3); bitIdx = lsn & 7; }
    else { const r = lsn - 0x5a0; byteOff = bmp2 + (r >> 3); bitIdx = r & 7; }
    used[lsn] = bitFree(raw[byteOff], bitIdx) ? 0 : 1;
  }

  const files: DragonFileEntry[] = [];
  for (let n = 0; n < 160; n++) {
    const off = entryOffset(raw, sectorsPerTrack, n);
    if (off + 25 > raw.length) break;
    const flag = raw[off];
    if (flag & 0x08) break;          // End of Directory — stop scanning
    if (flag & 0x80) continue;       // Deleted
    if (flag & 0x01) continue;       // Continuation block — consumed via a header's chain

    const name = raw.subarray(off + 1, off + 9).toString('latin1').replace(/\0+$/g, '').trimEnd();
    const ext = raw.subarray(off + 9, off + 12).toString('latin1').replace(/\0+$/g, '').trimEnd();
    if (!/[\x20-\x7E]/.test(name)) continue;

    // Gather allocation across the header + any continuation entries.
    const blocks: Array<{ lsn: number; count: number }> = [];
    let curOff = off;
    let curFlag = flag;
    let cont = false; // is current entry a continuation block?
    let bytesInLastSector = 256;
    let guard = 0;
    const seenEntries = new Set<number>([n]);
    while (guard++ < 170) {
      for (const b of readSabs(raw, curOff, cont)) blocks.push(b);
      if (curFlag & 0x20) {
        // Continued: byte 0x18 = next directory entry number.
        const next = raw[curOff + 0x18];
        if (seenEntries.has(next) || next >= 160) break;
        seenEntries.add(next);
        curOff = entryOffset(raw, sectorsPerTrack, next);
        curFlag = raw[curOff];
        cont = (curFlag & 0x01) === 1;
      } else {
        // Last entry of the file: byte 0x18 = bytes used in last sector (0 == 256).
        bytesInLastSector = raw[curOff + 0x18] === 0 ? 256 : raw[curOff + 0x18];
        break;
      }
    }

    const sectors: number[] = [];
    for (const b of blocks) for (let k = 0; k < b.count; k++) sectors.push(b.lsn + k);
    if (sectors.length === 0) continue;

    const totalSize = (sectors.length - 1) * SEC + bytesInLastSector;
    const fragmented = blocks.length > 1 ||
      sectors.some((s, i) => i > 0 && s !== sectors[i - 1] + 1);

    files.push({
      name, ext,
      fullName: ext ? `${name}.${ext}` : name,
      protected: (flag & 0x02) !== 0,
      sectors,
      bytesInLastSector,
      totalSize,
      index: n,
      fragmented,
    });
  }

  let usedSectors = 0;
  for (let i = 0; i < totalSectors; i++) if (used[i]) usedSectors++;

  return {
    files, tracks, sectorsPerTrack, sides,
    totalSectors, usedSectors, freeSectors: totalSectors - usedSectors, used,
  };
}

/** Map a Dragon file extension to the RS-DOS-style type fields the UI already renders. */
export function dragonTypeFromExt(ext: string): { fileType: number; fileTypeName: string } {
  const e = (ext || '').toUpperCase();
  if (e === 'BAS') return { fileType: 0, fileTypeName: 'BASIC' };
  if (e === 'BIN' || e === 'CMD' || e === 'OBJ') return { fileType: 2, fileTypeName: 'Machine Code' };
  return { fileType: 1, fileTypeName: 'Data' };
}

/**
 * Determine a Dragon file's REAL type from its content, not just the extension. Dragon DOS files
 * saved by BASIC carry a 9-byte load header `55 [type] [load:2] [len:2] [exec:2] AA` where
 * type 1 = tokenised BASIC and type 2 = machine code/binary. Files with no such header (raw
 * sequential data) fall back to the extension hint. `raw` is the de-headered disk image.
 */
export function dragonFileKind(raw: Buffer, sectors: number[], ext: string): { fileType: number; fileTypeName: string } {
  if (sectors.length) {
    const o = lsnOffset(sectors[0]);
    if (o + 9 <= raw.length && raw[o] === 0x55 && raw[o + 8] === 0xAA) {
      const t = raw[o + 1];
      if (t === 1) return { fileType: 0, fileTypeName: 'BASIC' };
      if (t === 2) return { fileType: 2, fileTypeName: 'Machine Code' };
    }
  }
  return dragonTypeFromExt(ext); // sem cabeçalho (dados sequenciais) → palpite por extensão
}

/**
 * Normalized read-only directory result for a Dragon (or VDK-wrapped Dragon) image, shaped
 * to mirror the RS-DOS `readDskDirectory` result so the existing UI consumes it with minimal
 * branching. Returns null when `buf` is not a Dragon disk (caller falls back to RS-DOS).
 */
export function readDragonDirectory(buf: Buffer): any | null {
  let raw: Buffer;
  try { raw = stripVdk(buf); } catch { return null; }
  if (!isDragonDosDisk(raw)) return null;
  const p = parseDragonDos(raw);
  const files = p.files.map((f) => {
    const k = dragonFileKind(raw, f.sectors, f.ext); // tipo pelo cabeçalho do arquivo (fallback: extensão)
    return {
      name: f.name, ext: f.ext, fullName: f.fullName,
      fileType: k.fileType, fileTypeName: k.fileTypeName,
      asciiFlag: 0, asciiName: 'Binary',
      totalSize: f.totalSize,
      sectors: f.sectors, bytesInLastSector: f.bytesInLastSector,
      fragmented: f.fragmented, protected: f.protected,
      index: f.index,
      format: 'dragon',
      // No granuleChain: the list shows '-' for granules and the disk map renders in Dragon
      // (per-sector) mode, so the RS-DOS granule math is bypassed.
    };
  });
  return {
    success: true,
    format: 'dragon',
    files,
    geom: { tracks: p.tracks, sectorsPerTrack: p.sectorsPerTrack, dirTrack: DIR_TRACK, sides: p.sides },
    totalSectors: p.totalSectors, usedSectors: p.usedSectors, freeSectors: p.freeSectors,
    // RS-DOS-compatible aliases (sector-granularity) so status-bar/map fallbacks degrade gracefully.
    totalGranules: p.totalSectors, freeGranules: p.freeSectors,
  };
}

/**
 * Build a fresh, empty Dragon DOS disk image (raw, no VDK header) of the given geometry.
 * Default: 40 tracks, single-sided, 18 sectors/track (the standard Dragon disk). The
 * directory track (20) is marked used in the bitmap; every other existing sector is free;
 * non-existent sectors (LSN ≥ total) are marked used so they are never allocated.
 */
export function encodeDragonBlank(tracks = 40, sectorsPerTrack = 18): Buffer {
  const totalSectors = tracks * sectorsPerTrack;
  const img = Buffer.alloc(totalSectors * SEC); // all zero
  const fmtLsn = DIR_TRACK * 18;                 // SS format/bitmap sector (LSN 360)
  const fo = lsnOffset(fmtLsn);

  // Bitmap (sector 1 covers LSN 0..0x59f; sector 2 covers 0x5a0..0xb3f). bit=1 free, 0 used.
  // Start everything FREE, then mark the directory track and out-of-range sectors used.
  const bmp1 = fo;
  const bmp2 = lsnOffset(dirTrackBaseLsn(sectorsPerTrack) + 1);
  for (let i = 0; i < 0xb4; i++) { img[bmp1 + i] = 0xff; img[bmp2 + i] = 0xff; }
  const setUsed = (lsn: number) => {
    let byteOff: number, bitIdx: number;
    if (lsn <= 0x59f) { byteOff = bmp1 + (lsn >> 3); bitIdx = lsn & 7; }
    else { const r = lsn - 0x5a0; byteOff = bmp2 + (r >> 3); bitIdx = r & 7; }
    img[byteOff] &= ~(1 << bitIdx) & 0xff;        // clear bit = used
  };
  const dirBase = dirTrackBaseLsn(sectorsPerTrack);
  for (let s = 0; s < sectorsPerTrack; s++) setUsed(dirBase + s);   // directory track
  for (let lsn = totalSectors; lsn <= 0xb3f; lsn++) setUsed(lsn);   // non-existent sectors

  // Format-ID field at Track 20 Sector 1, bytes 0xFC..0xFF.
  img[fo + 0xfc] = tracks & 0xff;
  img[fo + 0xfd] = sectorsPerTrack & 0xff;
  img[fo + 0xfe] = (~tracks) & 0xff;
  img[fo + 0xff] = (~sectorsPerTrack) & 0xff;

  // Mark directory entry 0 as End-of-Directory so an empty disk scans cleanly.
  img[entryOffset(img, sectorsPerTrack, 0)] = 0x08;

  // Wrap in a minimal valid VDK container ("dk" + 12-byte header) so the new disk is a proper
  // .vdk — loadable in XRoar and other Dragon tools (a raw image named .vdk would be rejected).
  const vdkHeader = Buffer.from([0x64, 0x6b, 0x0c, 0x00, 0x10, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  return Buffer.concat([vdkHeader, img]);
}

// ── Write support (single-sided Dragon DOS) ───────────────────────────────────
// All write helpers assume the standard SS layout (format/bitmap at Track 20 = LSN 360/361,
// 18 sectors/track). DS images aren't detected as Dragon by isDragonDosDisk, so they never
// reach these paths.

const BMP1 = lsnOffset(DIR_TRACK * 18);       // Track 20 Sector 1 (bitmap part 1) = 0x16800
const BMP2 = lsnOffset(DIR_TRACK * 18 + 1);   // Track 20 Sector 2 (bitmap part 2)

function bmpLoc(lsn: number): [number, number] {
  if (lsn <= 0x59f) return [BMP1 + (lsn >> 3), lsn & 7];
  const r = lsn - 0x5a0; return [BMP2 + (r >> 3), r & 7];
}
function bmpIsFree(raw: Buffer, lsn: number): boolean {
  const [o, b] = bmpLoc(lsn); return ((raw[o] >> b) & 1) === 1;
}
function bmpSet(raw: Buffer, lsn: number, used: boolean): void {
  const [o, b] = bmpLoc(lsn);
  if (used) raw[o] &= ~(1 << b) & 0xff; else raw[o] |= (1 << b);
}

/** Set of directory entry numbers currently in use (non-deleted headers + their continuations). */
function occupiedEntries(raw: Buffer, spt: number): Set<number> {
  const used = new Set<number>();
  for (let n = 0; n < 160; n++) {
    const off = entryOffset(raw, spt, n);
    const flag = raw[off];
    if (flag & 0x08) break;       // end of directory
    if (flag & 0x80) continue;    // deleted → free
    if (flag & 0x01) continue;    // continuation → counted via its header
    used.add(n);
    let o = off, f = flag, guard = 0;
    const seen = new Set([n]);
    while ((f & 0x20) && guard++ < 170) {
      const nx = raw[o + 0x18];
      if (seen.has(nx) || nx >= 160) break;
      seen.add(nx); used.add(nx);
      o = entryOffset(raw, spt, nx); f = raw[o];
    }
  }
  return used;
}

/**
 * Add a file to a Dragon DOS disk (SS). Allocates free sectors from the bitmap (largest runs
 * first to minimise allocation blocks), writes a header (+continuation) directory entry, and
 * updates the bitmap. Preserves a VDK header if present. Returns the new image.
 */
export function addDragonFile(raw0: Buffer, name: string, ext: string, data: Buffer): Buffer {
  const vdkLen = isVdk(raw0) ? vdkHeaderLen(raw0) : 0;
  const raw = Buffer.from(stripVdk(raw0));   // mutable copy of the disk image
  if (!isDragonDosDisk(raw)) throw new Error('Not a Dragon DOS disk');
  const fo = lsnOffset(DIR_TRACK * 18);
  const tracks = raw[fo + 0xfc], spt = raw[fo + 0xfd];
  if (spt !== 18) throw new Error('Dragon write supports single-sided (18 sec/track) only');
  const totalSectors = tracks * spt;

  const nm = (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const ex = (ext || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  if (!nm) throw new Error('Invalid Dragon file name');
  if (parseDragonDos(raw).files.some(f => f.name === nm && f.ext === ex))
    throw new Error(`File "${nm}${ex ? '.' + ex : ''}" already exists on the disk`);

  const sectorsNeeded = Math.max(1, Math.ceil(data.length / SEC));

  // Build the list of free contiguous runs (skip the directory track / out-of-range, which are
  // marked used in the bitmap), largest first.
  const runs: Array<{ lsn: number; len: number }> = [];
  for (let lsn = 0; lsn < totalSectors;) {
    if (!bmpIsFree(raw, lsn)) { lsn++; continue; }
    let len = 0; while (lsn + len < totalSectors && bmpIsFree(raw, lsn + len)) len++;
    runs.push({ lsn, len }); lsn += len;
  }
  runs.sort((a, b) => b.len - a.len);
  const totalFree = runs.reduce((a, r) => a + r.len, 0);
  if (totalFree < sectorsNeeded) throw new Error(`Disk full: need ${sectorsNeeded} sectors, ${totalFree} free`);

  // Allocate, preferring a single run that fits (1 block); otherwise greedily largest-first.
  const sabs: Array<{ lsn: number; count: number }> = [];
  let remaining = sectorsNeeded;
  const exact = runs.find(r => r.len >= remaining);
  if (exact) { sabs.push({ lsn: exact.lsn, count: remaining }); remaining = 0; }
  else for (const r of runs) {
    if (remaining <= 0) break;
    const take = Math.min(r.len, remaining);
    sabs.push({ lsn: r.lsn, count: take }); remaining -= take;
  }
  if (remaining > 0) throw new Error('Allocation failed');

  // Directory slots: 1 header (4 SABs) + continuation entries (7 SABs each).
  const nCont = sabs.length <= 4 ? 0 : Math.ceil((sabs.length - 4) / 7);
  const occupied = occupiedEntries(raw, spt);
  const free: number[] = [];
  for (let n = 0; n < 160 && free.length < 1 + nCont; n++) if (!occupied.has(n)) free.push(n);
  if (free.length < 1 + nCont) throw new Error('Directory full');
  const headerSlot = free[0];
  const contSlots = free.slice(1, 1 + nCont);

  // Write the file data into the allocated sectors, in SAB order.
  let dpos = 0;
  for (const s of sabs) for (let k = 0; k < s.count; k++) {
    const off = lsnOffset(s.lsn + k);
    const n = Math.min(SEC, data.length - dpos);
    if (n > 0) data.copy(raw, off, dpos, dpos + n);
    for (let z = n; z < SEC; z++) raw[off + z] = 0; // pad tail of last sector
    dpos += SEC;
    bmpSet(raw, s.lsn + k, true);
  }
  const bytesInLast = data.length % SEC; // 0 ⇒ full 256-byte last sector

  // Header directory entry.
  const hOff = entryOffset(raw, spt, headerSlot);
  for (let i = 0; i < 25; i++) raw[hOff + i] = 0;
  raw[hOff] = nCont > 0 ? 0x20 : 0x00; // Continued? else simple header
  for (let i = 0; i < 8; i++) raw[hOff + 1 + i] = i < nm.length ? nm.charCodeAt(i) : 0;
  for (let i = 0; i < 3; i++) raw[hOff + 9 + i] = i < ex.length ? ex.charCodeAt(i) : 0;
  const writeSab = (base: number, slot: number, idx: number) => {
    const s = sabs[idx];
    raw[base + slot * 3] = (s.lsn >> 8) & 0xff;
    raw[base + slot * 3 + 1] = s.lsn & 0xff;
    raw[base + slot * 3 + 2] = s.count & 0xff;
  };
  let sabIdx = 0;
  for (let slot = 0; slot < 4 && sabIdx < sabs.length; slot++, sabIdx++) writeSab(hOff + 0x0c, slot, sabIdx);
  raw[hOff + 0x18] = nCont > 0 ? contSlots[0] : bytesInLast;

  // Continuation entries.
  for (let c = 0; c < nCont; c++) {
    const cOff = entryOffset(raw, spt, contSlots[c]);
    for (let i = 0; i < 25; i++) raw[cOff + i] = 0;
    const more = c < nCont - 1;
    raw[cOff] = 0x01 | (more ? 0x20 : 0x00); // continuation block (+continued if more)
    for (let slot = 0; slot < 7 && sabIdx < sabs.length; slot++, sabIdx++) writeSab(cOff + 0x01, slot, sabIdx);
    raw[cOff + 0x18] = more ? contSlots[c + 1] : bytesInLast;
  }

  // Maintain the End-of-Directory marker just past the highest used entry.
  const maxIdx = Math.max(headerSlot, ...contSlots, ...occupied);
  if (maxIdx + 1 < 160) raw[entryOffset(raw, spt, maxIdx + 1)] = 0x08;

  return vdkLen ? Buffer.concat([raw0.subarray(0, vdkLen), raw]) : raw;
}

/** Delete a file from a Dragon DOS disk: mark its directory entries deleted and free its sectors. */
export function deleteDragonFile(raw0: Buffer, entry: { index: number; sectors?: number[] }): Buffer {
  const vdkLen = isVdk(raw0) ? vdkHeaderLen(raw0) : 0;
  const raw = Buffer.from(stripVdk(raw0));
  if (!isDragonDosDisk(raw)) throw new Error('Not a Dragon DOS disk');
  const spt = raw[lsnOffset(DIR_TRACK * 18) + 0xfd];
  for (const lsn of entry.sectors || []) bmpSet(raw, lsn, false); // free data sectors
  // Mark the header and any continuation entries deleted.
  let o = entryOffset(raw, spt, entry.index);
  let f = raw[o], guard = 0;
  const seen = new Set([entry.index]);
  raw[o] |= 0x80;
  while ((f & 0x20) && guard++ < 170) {
    const nx = raw[o + 0x18];
    if (seen.has(nx) || nx >= 160) break;
    seen.add(nx); o = entryOffset(raw, spt, nx); f = raw[o]; raw[o] |= 0x80;
  }
  return vdkLen ? Buffer.concat([raw0.subarray(0, vdkLen), raw]) : raw;
}

/** Extract a Dragon file's raw bytes (read-only) following its sector list. */
export function extractDragonFile(raw: Buffer, entry: DragonFileEntry): Buffer {
  const out = Buffer.alloc(entry.totalSize);
  let pos = 0;
  for (let i = 0; i < entry.sectors.length; i++) {
    const src = lsnOffset(entry.sectors[i]);
    const n = i === entry.sectors.length - 1 ? entry.bytesInLastSector : SEC;
    if (src + n <= raw.length) raw.copy(out, pos, src, src + n);
    pos += n;
  }
  return out;
}
