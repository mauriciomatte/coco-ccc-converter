// OS-9 / NitrOS-9 RBF (Random Block File) disk support — READ-ONLY.
//
// RBF is the hierarchical filesystem used by Microware OS-9 Level 1/2 and NitrOS-9 on
// the CoCo (and Dragon). Unlike RS-DOS (dsk.ts, flat directory + granule FAT) or Dragon
// DOS (dragondos.ts), RBF has SUBDIRECTORIES, a per-file descriptor, and a bit-per-cluster
// allocation map. Everything is addressed by LSN (Logical Sector Number), 256 bytes/sector;
// byte offset = LSN * 256.
//
// Format reference (clean-room): the field offsets below were derived from the public
// OS-9 symbol table (`OS9Defs`) and Todd Wallace's permissively-licensed `dosdir.asm`
// directory lister, then VALIDATED byte-for-byte against 19 real OS-9 disk images
// (see docs/test-corpus.md → "Corpus OS-9"). No GPL/Toolshed code is used; only the
// on-disk format (a non-copyrightable fact) is reimplemented here.
//
// On-disk layout (all multi-byte fields are BIG-ENDIAN):
//
//   LSN0 — Identification Sector (DD.*)
//     $00 DD.TOT 3B  total sectors on the device
//     $03 DD.TKS 1B  track size (sectors per track)
//     $04 DD.MAP 2B  number of bytes in the allocation bitmap (at LSN1)
//     $06 DD.BIT 2B  sectors per allocation bit (cluster size)
//     $08 DD.DIR 3B  LSN of the root directory's File Descriptor
//     $0B DD.OWN 2B  owner id        $0D DD.ATT 1B  attributes
//     $0E DD.DSK 2B  disk id         $10 DD.FMT 1B  format (bit0 sides, bit1 density)
//     $11 DD.SPT 2B  sectors per track (logical)
//     $1F DD.NAM     volume name, last char has bit 7 set
//
//   File Descriptor (FD) — one sector, pointed to by an LSN
//     $00 FD.ATT 1B  attributes; bit7 = directory (D), then S/PE/PW/PR/E/W/R
//     $01 FD.OWN 2B  owner
//     $03 FD.DAT 5B  last-modified: year-1900, month, day, hour, minute
//     $08 FD.LNK 1B  link count
//     $09 FD.SIZ 4B  file size in bytes
//     $0D FD.DCR 3B  creation date: year-1900, month, day
//     $10 FD.SEG     segment list: up to 48 × {LSN 3B, sector-count 2B}; terminates on a
//                    zero entry. A file's data is the concatenation of its segments,
//                    truncated to FD.SIZ (files may be fragmented across segments).
//
//   Directory — a regular file whose data is an array of 32-byte entries
//     $00..$1C 29B  name, last char has bit 7 set; first byte 0 = empty/unused slot
//     $1D..$1F  3B  LSN of this entry's File Descriptor
//                   ("." and ".." are always present; stale slots may read 0xFFFFFF)

const SEC = 256;
const FD_ATT = 0x00;
const FD_DAT = 0x03;
const FD_LNK = 0x08;
const FD_SIZ = 0x09;
const FD_DCR = 0x0d;
const FD_SEG = 0x10;
const MAX_SEGMENTS = 48; // (256 - FD_SEG) / 5
const DIR_ENTRY_SIZE = 32;
const ATTR_DIR = 0x80;

// ---- big-endian readers (bounds-safe: out-of-range reads return 0) ----------

function r8(buf: Buffer, off: number): number {
  return off >= 0 && off < buf.length ? buf[off] : 0;
}
function r16(buf: Buffer, off: number): number {
  return (r8(buf, off) << 8) | r8(buf, off + 1);
}
function r24(buf: Buffer, off: number): number {
  return (r8(buf, off) << 16) | (r8(buf, off + 1) << 8) | r8(buf, off + 2);
}
function r32(buf: Buffer, off: number): number {
  // > 2^31 stays positive: use multiplication rather than <<24 (which would go negative)
  return r8(buf, off) * 0x1000000 + (r8(buf, off + 1) << 16) + (r8(buf, off + 2) << 8) + r8(buf, off + 3);
}

/** Read an OS-9 high-bit-terminated name (max `maxLen` chars) starting at `off`. */
function os9Name(buf: Buffer, off: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const c = r8(buf, off + i);
    if (c === 0) break;
    s += String.fromCharCode(c & 0x7f);
    if (c & 0x80) break; // high bit marks the final char
  }
  return s;
}

// ---- types ------------------------------------------------------------------

export interface Os9Date {
  year: number; month: number; day: number; hour: number; minute: number;
}
export interface Os9Ident {
  totalSectors: number;
  trackSize: number;
  mapBytes: number;          // DD.MAP — bytes in the allocation bitmap
  sectorsPerCluster: number; // DD.BIT
  rootDirLsn: number;        // DD.DIR
  owner: number;
  attributes: number;
  diskId: number;
  format: number;            // DD.FMT
  sectorsPerTrack: number;   // DD.SPT
  sides: number;             // derived from DD.FMT bit0
  name: string;              // DD.NAM (volume label)
}
export interface Os9Segment { lsn: number; sectors: number; }
export interface Os9FD {
  lsn: number;
  attributes: number;
  isDir: boolean;
  attrString: string;        // e.g. "d-ewrewr"
  size: number;              // FD.SIZ (bytes)
  modified: Os9Date | null;  // FD.DAT
  created: Os9Date | null;   // FD.DCR
  links: number;             // FD.LNK
  segments: Os9Segment[];    // FD.SEG (data extents)
}
export interface Os9Node {
  name: string;
  fdLsn: number;
  isDir: boolean;
  size: number;
  attrString: string;
  modified: Os9Date | null;
  children?: Os9Node[];      // present iff isDir
  truncated?: boolean;       // dir not expanded (cycle/depth guard)
}
export interface ParsedOs9 {
  ident: Os9Ident;
  root: Os9Node;
  totalFiles: number;
  totalDirs: number;         // excludes the root itself
  freeSectors: number;
  usedSectors: number;
  freeBytes: number;
}

// ---- identification sector (LSN0) ------------------------------------------

/** Parse the LSN0 identification sector. `base` lets you point at a partition offset. */
export function parseIdent(raw: Buffer, base = 0): Os9Ident {
  const b = base;
  const format = r8(raw, b + 0x10);
  return {
    totalSectors: r24(raw, b + 0x00),
    trackSize: r8(raw, b + 0x03),
    mapBytes: r16(raw, b + 0x04),
    sectorsPerCluster: r16(raw, b + 0x06),
    rootDirLsn: r24(raw, b + 0x08),
    owner: r16(raw, b + 0x0b),
    attributes: r8(raw, b + 0x0d),
    diskId: r16(raw, b + 0x0e),
    format,
    sectorsPerTrack: r16(raw, b + 0x11),
    sides: (format & 0x01) ? 2 : 1,
    name: os9Name(raw, b + 0x1f, 32),
  };
}

/**
 * Heuristic: does `raw` (optionally at partition offset `base`) look like an OS-9 RBF disk?
 * Validates internal LSN0 consistency AND that the root directory's FD is actually a
 * directory — a strong discriminator that rejects RS-DOS / Dragon / random data.
 */
export function isOs9Disk(raw: Buffer, base = 0): boolean {
  if (raw.length - base < 2 * SEC) return false;
  const id = parseIdent(raw, base);
  if (id.totalSectors < 4) return false;
  if (id.trackSize < 1 || id.trackSize > 255) return false;
  if (id.mapBytes < 1 || id.mapBytes > 0x10000) return false;
  if (id.sectorsPerCluster < 1) return false;
  if (id.rootDirLsn < 1 || id.rootDirLsn >= id.totalSectors) return false;
  if (id.sectorsPerTrack < 1 || id.sectorsPerTrack > 255) return false;
  // root FD must exist within the device and carry the directory attribute bit
  const fdOff = base + id.rootDirLsn * SEC;
  if (fdOff + SEC > raw.length) return false;
  return (r8(raw, fdOff) & ATTR_DIR) !== 0;
}

/**
 * Stricter than {@link isOs9Disk}: also requires a power-of-two cluster size, sane geometry,
 * the disk to fit the region, AND that the root directory genuinely begins with "." / ".."
 * entries pointing at the root FD. Use this to DETECT an OS-9 partition (at offset 0 or a known
 * partition offset) inside a container, or to discriminate a loose .dsk.
 *
 * IMPORTANT (proven against blank disks): a freshly-formatted OS-9 disk ALSO passes the RS-DOS
 * check (isRsDosDisk), but an RS-DOS disk never passes this. So any format discriminator MUST
 * test isOs9DiskStrict BEFORE the RS-DOS check. Order: OS-9 → Dragon → RS-DOS → unknown.
 *
 * `regionLen` is the number of bytes available from `base` (e.g. the file size, or image size
 * minus the partition offset). Pass it so detection can run on a partial buffer of a huge image
 * without the "disk fits the region" check failing.
 */
export function isOs9DiskStrict(raw: Buffer, base = 0, regionLen?: number): boolean {
  if (!isOs9Disk(raw, base)) return false;
  const id = parseIdent(raw, base);
  const c = id.sectorsPerCluster;
  if (c < 1 || c > 256 || (c & (c - 1)) !== 0) return false; // cluster must be a power of two
  if (id.sectorsPerTrack > 256 || id.trackSize > 256) return false;
  const region = regionLen ?? raw.length - base;
  if (id.totalSectors * SEC > region) return false;
  const fd = readFD(raw, id.rootDirLsn, base);
  if (!fd.isDir || fd.segments.length === 0) return false;
  const data = readFileData(raw, fd, base);
  if (data.length < 64) return false;
  const n0 = os9Name(data, 0, 29), n1 = os9Name(data, 32, 29);
  const dotLsn = n0 === '.' ? r24(data, 29) : n1 === '.' ? r24(data, 61) : -1;
  return (n0 === '.' || n0 === '..') && (n1 === '.' || n1 === '..') && n0 !== n1 && dotLsn === id.rootDirLsn;
}

// ---- file descriptors -------------------------------------------------------

// OS-9 stores the year as an offset from 1900 (so 88 → 1988, 124 → 2024). A zero year
// byte means the date was never set.
function decodeDate5(buf: Buffer, off: number): Os9Date | null {
  const y = r8(buf, off);
  if (y === 0) return null;
  return {
    year: 1900 + y,
    month: r8(buf, off + 1),
    day: r8(buf, off + 2),
    hour: r8(buf, off + 3),
    minute: r8(buf, off + 4),
  };
}
function decodeDate3(buf: Buffer, off: number): Os9Date | null {
  const y = r8(buf, off);
  if (y === 0) return null;
  return { year: 1900 + y, month: r8(buf, off + 1), day: r8(buf, off + 2), hour: 0, minute: 0 };
}

/** Format FD.ATT as the conventional OS-9 "dsewrewr" flag string. */
export function attrString(att: number): string {
  const f = (bit: number, ch: string) => (att & bit ? ch : '-');
  return f(0x80, 'd') + f(0x40, 's') + f(0x20, 'e') + f(0x10, 'w') +
         f(0x08, 'r') + f(0x04, 'e') + f(0x02, 'w') + f(0x01, 'r');
}

/** Read the File Descriptor at `lsn` (segment list, size, dates, attributes). */
export function readFD(raw: Buffer, lsn: number, base = 0): Os9FD {
  const o = base + lsn * SEC;
  const att = r8(raw, o + FD_ATT);
  const segments: Os9Segment[] = [];
  for (let i = 0; i < MAX_SEGMENTS; i++) {
    const so = o + FD_SEG + i * 5;
    const segLsn = r24(raw, so);
    const segCnt = r16(raw, so + 3);
    if (segLsn === 0 || segCnt === 0) break; // zero entry terminates the list
    segments.push({ lsn: segLsn, sectors: segCnt });
  }
  return {
    lsn,
    attributes: att,
    isDir: (att & ATTR_DIR) !== 0,
    attrString: attrString(att),
    size: r32(raw, o + FD_SIZ),
    modified: decodeDate5(raw, o + FD_DAT),
    created: decodeDate3(raw, o + FD_DCR),
    links: r8(raw, o + FD_LNK),
    segments,
  };
}

/** Extract a file's full contents by concatenating its segments, truncated to FD.SIZ. */
export function readFileData(raw: Buffer, fd: Os9FD, base = 0): Buffer {
  const out = Buffer.alloc(fd.size);
  let pos = 0;
  for (const seg of fd.segments) {
    for (let s = 0; s < seg.sectors && pos < fd.size; s++) {
      const src = base + (seg.lsn + s) * SEC;
      const n = Math.min(SEC, fd.size - pos);
      if (src + n <= raw.length) raw.copy(out, pos, src, src + n);
      pos += n;
    }
    if (pos >= fd.size) break;
  }
  return out;
}

// ---- directories ------------------------------------------------------------

export interface Os9DirEntry { name: string; fdLsn: number; }

/** List the entries of a directory (skips ".", "..", empty and stale slots). */
export function listDir(raw: Buffer, dirFd: Os9FD, base = 0): Os9DirEntry[] {
  const data = readFileData(raw, dirFd, base);
  const out: Os9DirEntry[] = [];
  for (let off = 0; off + DIR_ENTRY_SIZE <= data.length; off += DIR_ENTRY_SIZE) {
    if (r8(data, off) === 0) continue; // unused slot
    const name = os9Name(data, off, 29);
    if (!name || name === '.' || name === '..') continue;
    const fdLsn = r24(data, off + 29);
    if (fdLsn === 0 || fdLsn === 0xffffff) continue; // stale/blank
    out.push({ name, fdLsn });
  }
  return out;
}

interface Stats { files: number; dirs: number; }

function buildNode(
  raw: Buffer, base: number, name: string, fdLsn: number,
  ancestors: Set<number>, depth: number, maxDepth: number, stats: Stats,
): Os9Node {
  const fd = readFD(raw, fdLsn, base);
  const node: Os9Node = {
    name, fdLsn, isDir: fd.isDir, size: fd.size,
    attrString: fd.attrString, modified: fd.modified,
  };
  if (!fd.isDir) {
    stats.files++;
    return node;
  }
  if (depth > 0) stats.dirs++; // don't count the root itself
  // cycle / depth guard: don't descend into a directory already on our path
  if (depth >= maxDepth || ancestors.has(fdLsn)) {
    node.children = [];
    node.truncated = true;
    return node;
  }
  ancestors.add(fdLsn);
  node.children = listDir(raw, fd, base).map(e =>
    buildNode(raw, base, e.name, e.fdLsn, ancestors, depth + 1, maxDepth, stats));
  ancestors.delete(fdLsn);
  return node;
}

// ---- allocation bitmap (free space) ----------------------------------------

/** Count free sectors from the allocation bitmap at LSN1 (a clear bit = free cluster). */
export function countFreeSectors(raw: Buffer, id: Os9Ident, base = 0): number {
  let freeClusters = 0;
  const start = base + 1 * SEC; // bitmap begins at LSN1
  for (let i = 0; i < id.mapBytes; i++) {
    const byte = r8(raw, start + i);
    for (let bit = 0; bit < 8; bit++) {
      if ((byte & (0x80 >> bit)) === 0) freeClusters++;
    }
  }
  // the bitmap may cover more clusters than the disk has; clamp to real total
  const totalClusters = Math.ceil(id.totalSectors / id.sectorsPerCluster);
  freeClusters = Math.min(freeClusters, totalClusters);
  return freeClusters * id.sectorsPerCluster;
}

// ---- top-level --------------------------------------------------------------

export interface ParseOptions { base?: number; maxDepth?: number; }

/** Parse an OS-9 RBF disk into an identification record + a hierarchical directory tree. */
export function parseOs9(raw: Buffer, opts: ParseOptions = {}): ParsedOs9 {
  const base = opts.base ?? 0;
  const maxDepth = opts.maxDepth ?? 32;
  const ident = parseIdent(raw, base);
  const stats: Stats = { files: 0, dirs: 0 };
  const root = buildNode(raw, base, ident.name || '/', ident.rootDirLsn, new Set(), 0, maxDepth, stats);
  root.name = ident.name || '/';
  const freeSectors = countFreeSectors(raw, ident, base);
  return {
    ident,
    root,
    totalFiles: stats.files,
    totalDirs: stats.dirs,
    freeSectors,
    usedSectors: Math.max(0, ident.totalSectors - freeSectors),
    freeBytes: freeSectors * SEC,
  };
}

/** Flatten the tree into POSIX-style paths (e.g. "/CMDS/dir"); dirs end with "/". */
export function flattenOs9(root: Os9Node): Array<{ path: string; node: Os9Node }> {
  const out: Array<{ path: string; node: Os9Node }> = [];
  const walk = (node: Os9Node, prefix: string) => {
    for (const c of node.children ?? []) {
      const p = prefix + c.name + (c.isDir ? '/' : '');
      out.push({ path: p, node: c });
      if (c.isDir) walk(c, prefix + c.name + '/');
    }
  };
  walk(root, '/');
  return out;
}
