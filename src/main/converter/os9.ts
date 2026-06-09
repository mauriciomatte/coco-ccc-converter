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
  segs?: Array<{ lsn: number; sectors: number }>; // FD.SEG extents (para mapear arquivo→clusters no painel de mídia)
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
    segs: fd.segments.map(s => ({ lsn: s.lsn, sectors: s.sectors })),
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

/** Lê o bitmap de alocação (LSN1) → bytes do mapa + total/usados de clusters (para o painel de mídia). */
export function readClusterBitmap(raw: Buffer, base = 0): { totalClusters: number; usedClusters: number; sectorsPerCluster: number; bitmap: number[] } {
  const id = parseIdent(raw, base);
  const tot = Math.max(1, Math.ceil(id.totalSectors / Math.max(1, id.sectorsPerCluster)));
  const bytes = Math.min(id.mapBytes || Math.ceil(tot / 8), Math.ceil(tot / 8) + 1);
  const start = base + SEC;
  const bitmap: number[] = new Array(bytes);
  for (let i = 0; i < bytes; i++) bitmap[i] = r8(raw, start + i);
  let used = 0;
  for (let c = 0; c < tot; c++) if (bitmap[c >> 3] & (0x80 >> (c & 7))) used++;
  return { totalClusters: tot, usedClusters: used, sectorsPerCluster: id.sectorsPerCluster, bitmap };
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

// =============================================================================
//  WRITE ENGINE (RBF) — O1: primitivas | O2: criar disco | O3: renomear / mkdir
//  Tudo opera num Buffer `raw` (base=0 = o disco/partição inteira), mutando in-place.
//  Validado por round-trip (escreve → relê com as funções de leitura acima → confere).
// =============================================================================

// ---- big-endian writers -----------------------------------------------------
function w8(b: Buffer, o: number, v: number) { b[o] = v & 0xff; }
function w16(b: Buffer, o: number, v: number) { b[o] = (v >> 8) & 0xff; b[o + 1] = v & 0xff; }
function w24(b: Buffer, o: number, v: number) { b[o] = (v >> 16) & 0xff; b[o + 1] = (v >> 8) & 0xff; b[o + 2] = v & 0xff; }
function w32(b: Buffer, o: number, v: number) { b[o] = Math.floor(v / 0x1000000) & 0xff; b[o + 1] = (v >> 16) & 0xff; b[o + 2] = (v >> 8) & 0xff; b[o + 3] = v & 0xff; }

/** Escreve um nome OS-9 (último char com bit-7) em `fieldLen` bytes, zerando o campo antes. */
function writeOs9Name(buf: Buffer, off: number, fieldLen: number, name: string) {
  for (let i = 0; i < fieldLen; i++) buf[off + i] = 0;
  const s = name.slice(0, fieldLen);
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i) & 0x7f;
    if (i === s.length - 1) c |= 0x80; // terminador
    buf[off + i] = c;
  }
}

function dateToBytes5(d?: Os9Date | null): number[] {
  if (!d) return [0, 0, 0, 0, 0];
  return [(d.year - 1900) & 0xff, d.month & 0xff, d.day & 0xff, d.hour & 0xff, d.minute & 0xff];
}

// ---- allocation bitmap (LSN1) ----------------------------------------------
function totalClusters(id: Os9Ident): number { return Math.ceil(id.totalSectors / id.sectorsPerCluster); }
function clusterUsed(buf: Buffer, base: number, cluster: number): boolean {
  const o = base + SEC + (cluster >> 3);
  return (buf[o] & (0x80 >> (cluster & 7))) !== 0;
}
function setCluster(buf: Buffer, base: number, cluster: number, used: boolean) {
  const o = base + SEC + (cluster >> 3);
  const m = 0x80 >> (cluster & 7);
  if (used) buf[o] |= m; else buf[o] &= ~m;
}
/** Acha um corrido de `n` clusters LIVRES (a partir de `from`); -1 se não houver. */
function findFreeRun(buf: Buffer, base: number, id: Os9Ident, n: number, from = 0): number {
  const tot = totalClusters(id);
  for (let c = Math.max(from, 1); c + n <= tot; c++) {
    let ok = true;
    for (let k = 0; k < n; k++) if (clusterUsed(buf, base, c + k)) { ok = false; c += k; break; }
    if (ok) return c;
  }
  return -1;
}
function allocRun(buf: Buffer, base: number, id: Os9Ident, n: number): number {
  const c = findFreeRun(buf, base, id, n);
  if (c < 0) return -1;
  for (let k = 0; k < n; k++) setCluster(buf, base, c + k, true);
  return c;
}

// ---- File Descriptor write --------------------------------------------------
export interface NewFD {
  attributes: number; owner?: number; size: number;
  modified?: Os9Date | null; created?: Os9Date | null; links: number; segments: Os9Segment[];
}
/** Escreve UM setor de File Descriptor (limpa o setor antes). */
export function writeFDSector(buf: Buffer, base: number, fdLsn: number, fd: NewFD) {
  const o = base + fdLsn * SEC;
  buf.fill(0, o, o + SEC);
  w8(buf, o + FD_ATT, fd.attributes);
  w16(buf, o + 1, fd.owner ?? 0);
  const dm = dateToBytes5(fd.modified); for (let i = 0; i < 5; i++) buf[o + FD_DAT + i] = dm[i];
  w8(buf, o + FD_LNK, fd.links);
  w32(buf, o + FD_SIZ, fd.size);
  if (fd.created) { const dc = dateToBytes5(fd.created); for (let i = 0; i < 3; i++) buf[o + FD_DCR + i] = dc[i]; }
  let so = o + FD_SEG;
  for (const seg of fd.segments) { w24(buf, so, seg.lsn); w16(buf, so + 3, seg.sectors); so += 5; }
}

/** Grava `data` nos setores dos segmentos (em ordem). */
export function writeSegmentsData(buf: Buffer, base: number, segments: Os9Segment[], data: Buffer) {
  let pos = 0;
  for (const seg of segments) {
    for (let s = 0; s < seg.sectors && pos < data.length; s++) {
      const dst = base + (seg.lsn + s) * SEC;
      const n = Math.min(SEC, data.length - pos);
      if (dst + n <= buf.length) data.copy(buf, dst, pos, pos + n);
      pos += n;
    }
  }
}

// ---- directory entry write --------------------------------------------------
/** Offsets absolutos de cada slot de 32 bytes do diretório (em todos os segmentos alocados). */
function dirSlotOffsets(buf: Buffer, base: number, dirFd: Os9FD): number[] {
  const out: number[] = [];
  for (const seg of dirFd.segments) {
    for (let s = 0; s < seg.sectors; s++) {
      const secOff = base + (seg.lsn + s) * SEC;
      for (let e = 0; e < 8; e++) out.push(secOff + e * 32);
    }
  }
  return out;
}

/**
 * Adiciona uma entrada (nome → targetLsn) num diretório. Reusa um slot livre dentro do tamanho
 * atual, ou anexa no fim (crescendo FD.SIZ; aloca +1 cluster e estende o segmento se encher).
 * Retorna true em sucesso.
 */
export function addDirEntry(buf: Buffer, base: number, id: Os9Ident, dirFdLsn: number, name: string, targetLsn: number): boolean {
  let dirFd = readFD(buf, dirFdLsn, base);
  let slots = dirSlotOffsets(buf, base, dirFd);
  let writeOff = -1, newSize = dirFd.size;
  // 1) reusar buraco dentro do tamanho atual (byte0 === 0)
  for (let i = 0; i * 32 < dirFd.size && i < slots.length; i++) {
    if (buf[slots[i]] === 0) { writeOff = slots[i]; break; }
  }
  // 2) anexar no fim
  if (writeOff < 0) {
    const idx = Math.floor(dirFd.size / 32);
    if (idx < slots.length) { writeOff = slots[idx]; newSize = dirFd.size + 32; }
    else {
      // 3) crescer: aloca +1 cluster e estende o último segmento (se contíguo) ou adiciona segmento
      const c = allocRun(buf, base, id, 1);
      if (c < 0) return false;
      const newLsn = c * id.sectorsPerCluster;
      const last = dirFd.segments[dirFd.segments.length - 1];
      const o = base + dirFdLsn * SEC;
      if (last && last.lsn + last.sectors === newLsn) {
        w16(buf, o + FD_SEG + (dirFd.segments.length - 1) * 5 + 3, last.sectors + id.sectorsPerCluster);
      } else {
        const si = dirFd.segments.length;
        if (FD_SEG + si * 5 + 5 > SEC) return false; // sem espaço p/ mais segmentos
        w24(buf, o + FD_SEG + si * 5, newLsn);
        w16(buf, o + FD_SEG + si * 5 + 3, id.sectorsPerCluster);
      }
      buf.fill(0, base + newLsn * SEC, base + (newLsn + id.sectorsPerCluster) * SEC);
      dirFd = readFD(buf, dirFdLsn, base);
      slots = dirSlotOffsets(buf, base, dirFd);
      const idx2 = Math.floor(dirFd.size / 32);
      writeOff = slots[idx2]; newSize = dirFd.size + 32;
    }
  }
  if (writeOff < 0) return false;
  buf.fill(0, writeOff, writeOff + 32);
  writeOs9Name(buf, writeOff, 29, name);
  w24(buf, writeOff + 29, targetLsn);
  if (newSize !== dirFd.size) w32(buf, base + dirFdLsn * SEC + FD_SIZ, newSize);
  return true;
}

/** Renomeia a entrada `oldName` para `newName` num diretório. */
export function renameDirEntry(buf: Buffer, base: number, dirFdLsn: number, oldName: string, newName: string): boolean {
  const dirFd = readFD(buf, dirFdLsn, base);
  for (const off of dirSlotOffsets(buf, base, dirFd)) {
    if (buf[off] === 0) continue;
    if (os9Name(buf, off, 29) === oldName) { writeOs9Name(buf, off, 29, newName); return true; }
  }
  return false;
}

// ---- high-level ops ---------------------------------------------------------
export interface Os9Geom { totalSectors: number; mapBytes: number; format: number; sides: number; bytes: number; }
/** Geometrias OS-9 padrão (single-density, SPT=18, cluster=1) p/ "Novo OS-9". */
export const OS9_GEOMETRIES: Record<string, Os9Geom> = {
  '158k': { totalSectors: 630, mapBytes: 79, format: 0x00, sides: 1, bytes: 161280 },
  '180k': { totalSectors: 720, mapBytes: 90, format: 0x00, sides: 1, bytes: 184320 },
  '360k': { totalSectors: 1440, mapBytes: 180, format: 0x01, sides: 2, bytes: 368640 },
  '720k': { totalSectors: 2880, mapBytes: 360, format: 0x03, sides: 2, bytes: 737280 },
};

/** O2 — cria um disco OS-9 RBF em branco (replica a estrutura dos blanks canônicos). */
export function createBlankOs9(geom: Os9Geom, opts?: { name?: string; date?: Os9Date | null }): Buffer {
  const BIT = 1, TKS = 18, SPT = 18, DIR_SECTORS = 7;
  // Setores LIVRES = 0xFF (como o DSKINI/format real); a região de SISTEMA (LSN0..último setor do
  // diretório) é zerada abaixo e recebe as estruturas. Replica o blank canônico byte-a-byte.
  const buf = Buffer.alloc(geom.bytes, 0xFF);
  const bitmapSectors = Math.ceil(geom.mapBytes / SEC);
  const rootFDLsn = 1 + bitmapSectors;
  const dirLsn = rootFDLsn + 1;
  const used = dirLsn + DIR_SECTORS;
  // zera só até a 1ª página do diretório (LSN0..dirLsn); a reserva restante do dir fica 0xFF (como o real)
  buf.fill(0x00, 0, (dirLsn + 1) * SEC);
  // LSN0 (ident)
  w24(buf, 0, geom.totalSectors); w8(buf, 3, TKS); w16(buf, 4, geom.mapBytes); w16(buf, 6, BIT);
  w24(buf, 8, rootFDLsn); w16(buf, 11, 1); w8(buf, 13, 0); w16(buf, 14, 1); w8(buf, 16, geom.format); w16(buf, 17, SPT);
  w8(buf, 103, 0x01); // opção do path descriptor (PD.DTP/RBF) — presente no blank canônico
  if (opts?.name && opts.name.trim()) writeOs9Name(buf, 31, 32, opts.name.toUpperCase()); else buf[31] = 0x80;
  // bitmap: clusters 0..used-1 usados (LSN0 + bitmap + root FD + diretório)
  for (let c = 0; c < used; c++) setCluster(buf, 0, c, true);
  // root FD
  writeFDSector(buf, 0, rootFDLsn, { attributes: 0xBF, owner: 0, size: 64, modified: opts?.date ?? null, created: opts?.date ?? null, links: 2, segments: [{ lsn: dirLsn, sectors: DIR_SECTORS }] });
  // root dir data: ".." (entry0) e "." (entry1) → ambos o FD raiz
  const d = dirLsn * SEC;
  writeOs9Name(buf, d, 29, '..'); w24(buf, d + 29, rootFDLsn);
  writeOs9Name(buf, d + 32, 29, '.'); w24(buf, d + 32 + 29, rootFDLsn);
  return buf;
}

/** O3 — renomeia um arquivo/dir dentro do diretório `dirFdLsn`. */
export function os9Rename(raw: Buffer, dirFdLsn: number, oldName: string, newName: string, base = 0): Buffer {
  const out = Buffer.from(raw);
  if (!renameDirEntry(out, base, dirFdLsn, oldName, newName)) throw new Error(`Entrada "${oldName}" não encontrada no diretório.`);
  return out;
}

/** O3 — cria um subdiretório `name` dentro de `parentFdLsn`. */
export function os9Mkdir(raw: Buffer, parentFdLsn: number, name: string, base = 0, opts?: { date?: Os9Date | null }): Buffer {
  const out = Buffer.from(raw);
  const id = parseIdent(out, base);
  // aloca 1 cluster p/ o FD do novo dir + 1 cluster p/ os dados do dir
  const fdC = allocRun(out, base, id, 1); if (fdC < 0) throw new Error('Sem espaço para o FD do diretório.');
  const newFdLsn = fdC * id.sectorsPerCluster;
  const dataC = allocRun(out, base, id, 1); if (dataC < 0) throw new Error('Sem espaço para os dados do diretório.');
  const newDataLsn = dataC * id.sectorsPerCluster;
  // FD do novo dir
  writeFDSector(out, base, newFdLsn, { attributes: 0xBF, owner: 0, size: 64, modified: opts?.date ?? null, created: opts?.date ?? null, links: 2, segments: [{ lsn: newDataLsn, sectors: id.sectorsPerCluster }] });
  // dados: ".." → pai, "." → o próprio
  const d = base + newDataLsn * SEC;
  out.fill(0, d, d + id.sectorsPerCluster * SEC);
  writeOs9Name(out, d, 29, '..'); w24(out, d + 29, parentFdLsn);
  writeOs9Name(out, d + 32, 29, '.'); w24(out, d + 32 + 29, newFdLsn);
  // entrada no pai + incrementa o link count do pai (por causa do ".." do novo dir)
  if (!addDirEntry(out, base, id, parentFdLsn, name, newFdLsn)) throw new Error('Diretório pai cheio (falha ao adicionar a entrada).');
  const po = base + parentFdLsn * SEC;
  w8(out, po + FD_LNK, (out[po + FD_LNK] + 1) & 0xff);
  return out;
}

// ---- O4: inserir / excluir arquivo -----------------------------------------

/** Aloca `clustersNeeded` clusters, preferindo corridas contíguas (fragmenta se preciso). Devolve
 *  os segmentos (em setores) ou null se não couber; em falha desfaz toda a alocação. Máx. 48 segmentos. */
function allocSegments(buf: Buffer, base: number, id: Os9Ident, clustersNeeded: number): Os9Segment[] | null {
  const spc = id.sectorsPerCluster;
  const segs: Os9Segment[] = [];
  const undo = () => { for (const s of segs) for (let k = 0; k < s.sectors / spc; k++) setCluster(buf, base, s.lsn / spc + k, false); };
  let remaining = clustersNeeded, from = 0;
  while (remaining > 0) {
    let placed = false;
    for (let want = remaining; want >= 1; want--) {
      const c = findFreeRun(buf, base, id, want, from);
      if (c < 0) continue;
      for (let k = 0; k < want; k++) setCluster(buf, base, c + k, true);
      segs.push({ lsn: c * spc, sectors: want * spc });
      remaining -= want; from = c + want; placed = true; break;
    }
    if (!placed || segs.length > 48) { undo(); return null; }
  }
  return segs;
}

/** Localiza a entrada `name` num diretório → seu FD LSN, ou -1. */
function findDirEntry(buf: Buffer, base: number, dirFd: Os9FD, name: string): number {
  for (const off of dirSlotOffsets(buf, base, dirFd)) {
    if (buf[off] === 0) continue;
    if (os9Name(buf, off, 29) === name) return r24(buf, off + 29);
  }
  return -1;
}

/** Remove a entrada `name` (marca byte0=0, como o OS-9). Devolve o FD LSN removido, ou -1. */
function removeDirEntry(buf: Buffer, base: number, dirFdLsn: number, name: string): number {
  const dirFd = readFD(buf, dirFdLsn, base);
  for (const off of dirSlotOffsets(buf, base, dirFd)) {
    if (buf[off] === 0) continue;
    if (os9Name(buf, off, 29) === name) { const t = r24(buf, off + 29); buf[off] = 0; return t; }
  }
  return -1;
}

/** O4 — insere um arquivo regular (`data`) em `parentFdLsn` com o nome `name`. Devolve nova imagem. */
export function os9Insert(raw: Buffer, parentFdLsn: number, name: string, data: Buffer, base = 0, opts?: { date?: Os9Date | null; attributes?: number }): Buffer {
  const out = Buffer.from(raw);
  const id = parseIdent(out, base);
  const parent = readFD(out, parentFdLsn, base);
  if (!parent.isDir) throw new Error('O destino não é um diretório.');
  if (findDirEntry(out, base, parent, name) >= 0) throw new Error(`Já existe "${name}" no diretório.`);
  const spc = id.sectorsPerCluster;
  // 1) FD do arquivo (1 cluster)
  const fdC = allocRun(out, base, id, 1); if (fdC < 0) throw new Error('Sem espaço para o FD do arquivo.');
  const fdLsn = fdC * spc;
  // 2) clusters de dados (fragmenta se preciso)
  const dataClusters = Math.ceil(Math.ceil(data.length / SEC) / spc);
  let segs: Os9Segment[] = [];
  if (dataClusters > 0) {
    const s = allocSegments(out, base, id, dataClusters);
    if (!s) {
      setCluster(out, base, fdC, false);
      // allocSegments fragmenta (até 48 segmentos) → a falha é por espaço TOTAL insuficiente ou por
      // fragmentação extrema. Reporta o espaço livre real para a mensagem ser acionável.
      const freeSec = countFreeSectors(out, id, base);
      const needSec = dataClusters * spc;
      throw new Error(
        `Espaço insuficiente para "${name}" (${data.length} bytes ≈ ${needSec} setores; ` +
        `livres: ${freeSec}). Escolha um disco de referência com mais espaço livre, ` +
        `ou um programa menor.`
      );
    }
    segs = s;
  }
  // 3) FD + dados
  writeFDSector(out, base, fdLsn, { attributes: opts?.attributes ?? 0x03, owner: 0, size: data.length, modified: opts?.date ?? null, created: opts?.date ?? null, links: 1, segments: segs });
  if (data.length) writeSegmentsData(out, base, segs, data);
  // 4) entrada no diretório pai (cresce o dir se preciso)
  if (!addDirEntry(out, base, id, parentFdLsn, name, fdLsn)) {
    setCluster(out, base, fdC, false);
    for (const sg of segs) for (let k = 0; k < sg.sectors / spc; k++) setCluster(out, base, sg.lsn / spc + k, false);
    throw new Error('Diretório pai cheio (falha ao adicionar a entrada).');
  }
  return out;
}

/** O4 — exclui um arquivo, ou um diretório VAZIO, de `parentFdLsn`. Libera os clusters. Devolve nova imagem. */
export function os9Delete(raw: Buffer, parentFdLsn: number, name: string, base = 0): Buffer {
  if (name === '.' || name === '..') throw new Error('Não é permitido excluir "." ou "..".');
  const out = Buffer.from(raw);
  const id = parseIdent(out, base);
  const parent = readFD(out, parentFdLsn, base);
  const targetLsn = findDirEntry(out, base, parent, name);
  if (targetLsn < 0) throw new Error(`"${name}" não encontrado no diretório.`);
  const fd = readFD(out, targetLsn, base);
  if (fd.isDir) {
    // só permite excluir diretório VAZIO (apenas "." e "..")
    let realEntries = 0;
    for (const off of dirSlotOffsets(out, base, fd)) {
      if (out[off] === 0) continue;
      const nm = os9Name(out, off, 29);
      if (nm !== '.' && nm !== '..') realEntries++;
    }
    if (realEntries > 0) throw new Error('Diretório não está vazio.');
  }
  // libera clusters dos dados + do próprio FD
  const spc = id.sectorsPerCluster;
  for (const sg of fd.segments) for (let k = 0; k < Math.ceil(sg.sectors / spc); k++) setCluster(out, base, Math.floor(sg.lsn / spc) + k, false);
  setCluster(out, base, Math.floor(targetLsn / spc), false);
  // remove a entrada do pai
  removeDirEntry(out, base, parentFdLsn, name);
  // se era diretório, o ".." dele apontava p/ o pai → decrementa o link count do pai
  if (fd.isDir) { const po = base + parentFdLsn * SEC; if (out[po + FD_LNK] > 0) w8(out, po + FD_LNK, out[po + FD_LNK] - 1); }
  return out;
}

// ---- Tornar um disco BOOTÁVEL (clona o aparato de boot de um disco de referência) ----
//
// Bootar OS-9/NitrOS-9 no CoCo tem DUAS partes (confirmado por engenharia reversa do
// NOS9_6809_L2_v030300_coco3_40d_1.dsk e pelo wiki do NitrOS-9):
//   1) BOOT TRACK (KERNELFILE): o comando DOS do Disk BASIC carrega o **track 34** (1 track = SPT
//      setores, side 0) em $2600 e SALTA para $2602. Esse track contém REL+KRN (o bootstrap). Ele
//      NÃO é um arquivo do filesystem — fica reservado direto no bitmap. (No disco real: LSN 1224..1241
//      = "OS -"+módulos; o LSN 1242+ já é arquivo /DEFS/coco3vtio.d.)
//   2) OS9Boot (BOOTFILE): arquivo CONTÍGUO na raiz com os demais módulos; DD.BT=LSN dos dados dele,
//      DD.BSZ=tamanho. O KRN (já rodando) lê LSN0, acha DD.BT e carrega o OS9Boot na RAM.
// `os9MakeBootable` antiga (só DD.BT+OS9Boot) gerava disco que o DOS não bootava (track 34 vazio).
//
// Aqui CLONAMOS os dois de um disco-referência bootável da MESMA geometria (mesmo totalSectors/SPT/
// lados → mesmo LSN de track 34). É o que o `os9 gen -t KERNELFILE -b BOOTFILE` do Toolshed faz.
// ⚠️ A ESTRUTURA é validada por round-trip (tools/os9mkboot.ts); o BOOT real precisa de confirmação
// no XRoar/hardware (montar no drive 0, digitar DOS).
export function os9MakeBootable(raw: Buffer, refDisk: Buffer, base = 0): Buffer {
  const id = parseIdent(raw, base);
  const ref = parseIdent(refDisk, 0);
  // geometria precisa bater (senão o track 34 cai em LSN diferente e o boot track não casa)
  if (id.totalSectors !== ref.totalSectors || id.sectorsPerTrack !== ref.sectorsPerTrack || id.sides !== ref.sides || id.sectorsPerCluster !== ref.sectorsPerCluster)
    throw new Error(`Geometria do disco difere da referência (alvo ${id.totalSectors}/${id.sectorsPerTrack}/${id.sides}L vs ref ${ref.totalSectors}/${ref.sectorsPerTrack}/${ref.sides}L). Use um disco bootável do MESMO tamanho.`);
  const refBoot = os9BootInfo(refDisk, 0);
  if (!refBoot.bootable) throw new Error('O disco de referência não é bootável (DD.BT/DD.BSZ = 0).');
  const spc = id.sectorsPerCluster;
  // BOOT TRACK = track 34, side 0 → começa no LSN da cilindro 34 e ocupa SPT setores
  const bootTrackLsn = 34 * id.sectorsPerTrack * id.sides;
  const bootTrackSectors = id.sectorsPerTrack;
  if ((bootTrackLsn + bootTrackSectors) * SEC > refDisk.length || (bootTrackLsn + bootTrackSectors) * SEC > raw.length)
    throw new Error('Disco pequeno demais para um boot track no track 34.');
  // sanidade: a referência tem boot no track 34? (assinatura "OS" do REL, ou módulo 0x87CD)
  const sig0 = r8(refDisk, bootTrackLsn * SEC), sig1 = r8(refDisk, bootTrackLsn * SEC + 1);
  if (!((sig0 === 0x4f && sig1 === 0x53) || (sig0 === 0x87 && sig1 === 0xcd)))
    throw new Error('A referência não tem um boot track reconhecível no track 34.');

  let out: Buffer = Buffer.from(raw);
  // remove OS9Boot anterior (re-gerar) — libera seus clusters
  if (findDirEntry(out, base, readFD(out, id.rootDirLsn, base), 'OS9Boot') >= 0) out = os9Delete(out, id.rootDirLsn, 'OS9Boot', base);
  // 1) RESERVA os clusters do boot track ANTES de inserir o OS9Boot (senão o alocador poderia usá-los)
  for (let lsn = bootTrackLsn; lsn < bootTrackLsn + bootTrackSectors; lsn++) setCluster(out, base, Math.floor(lsn / spc), true);
  // 2) copia o boot track (KERNELFILE) verbatim da referência
  refDisk.copy(out, base + bootTrackLsn * SEC, bootTrackLsn * SEC, (bootTrackLsn + bootTrackSectors) * SEC);
  // 3) extrai o OS9Boot da referência e o insere como arquivo contíguo na raiz do alvo
  const refRoot = readFD(refDisk, ref.rootDirLsn, 0);
  const refBootLsn = findDirEntry(refDisk, 0, refRoot, 'OS9Boot');
  if (refBootLsn < 0) throw new Error('Referência sem arquivo OS9Boot na raiz.');
  const bootModule = readFileData(refDisk, readFD(refDisk, refBootLsn, 0), 0);
  out = os9Insert(out, id.rootDirLsn, 'OS9Boot', bootModule, base, { attributes: 0x03 });
  const fd = readFD(out, findDirEntry(out, base, readFD(out, id.rootDirLsn, base), 'OS9Boot'), base);
  if (fd.segments.length !== 1) throw new Error('OS9Boot ficou fragmentado (sem run contíguo). Desfragmente o disco e tente de novo.');
  // 4) DD.BT = LSN dos dados do OS9Boot; DD.BSZ = tamanho; DD.FMT = densidade da referência
  w24(out, base + 0x15, fd.segments[0].lsn);
  w16(out, base + 0x18, fd.size);
  w8(out, base + 0x10, ref.format);
  return out;
}

// ---- Criar disco BOOTÁVEL a partir de um disco de SISTEMA de referência ----
//
// Um disco OS-9 bootável e USÁVEL precisa do aparato de boot (boot track + OS9Boot, ver
// os9MakeBootable) E dos arquivos de sistema (sysgo/startup/CMDS/SYS). Esses são blobs binários
// específicos de geometria/versão que NÃO dá p/ sintetizar — então a forma robusta de "criar um
// disco bootável" é CLONAR um disco de sistema de referência (que já tem tudo) e, opcionalmente,
// inserir programas + escrever um `startup` que os executa no boot.
//
// `programs`: cada um vira um arquivo executável (attr 0x2D = exec+read público/dono) inserido em
// CMDS (se existir no destino) ou na raiz, e seu nome entra no `startup`. ⚠️ devem ser MÓDULOS OS-9
// executáveis; o BOOT/execução real precisa de confirmação no XRoar/hardware.
export interface Os9Program { name: string; data: Buffer; }
export function os9CloneBootable(refDisk: Buffer, programs: Os9Program[] = [], base = 0): Buffer {
  if (!isOs9Disk(refDisk, base)) throw new Error('A referência não é um disco OS-9 válido.');
  if (!os9BootInfo(refDisk, base).bootable) throw new Error('A referência não é bootável (DD.BT/DD.BSZ = 0). Escolha um disco de SISTEMA bootável.');
  let out: Buffer = Buffer.from(refDisk); // o disco de referência JÁ é um sistema bootável completo
  const id = parseIdent(out, base);
  // diretório-alvo dos programas: CMDS (se for um dir) — está no PATH de execução — senão a raiz
  const cmdsLsn = findDirEntry(out, base, readFD(out, id.rootDirLsn, base), 'CMDS');
  const target = (cmdsLsn > 0 && readFD(out, cmdsLsn, base).isDir) ? cmdsLsn : id.rootDirLsn;
  const names: string[] = [];
  for (const p of programs) {
    const nm = p.name.replace(/[\/\\]/g, '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 28);
    if (!nm) continue;
    if (findDirEntry(out, base, readFD(out, target, base), nm) >= 0) out = os9Delete(out, target, nm, base); // substitui
    out = os9Insert(out, target, nm, p.data, base, { attributes: 0x2d, date: null });
    names.push(nm);
  }
  if (names.length) {
    // startup = script do shell executado pelo sysgo no boot (linhas terminadas em CR 0x0D). PRESERVA
    // a inicialização original (do disco de sistema) e ANEXA os programas no fim — não substitui, senão
    // a configuração de boot (setime/tmode/shell…) seria perdida.
    const existingLsn = findDirEntry(out, base, readFD(out, id.rootDirLsn, base), 'startup');
    let prefix = '';
    if (existingLsn >= 0) {
      prefix = readFileData(out, readFD(out, existingLsn, base), base).toString('latin1');
      if (prefix.length && !prefix.endsWith('\r')) prefix += '\r';
      out = os9Delete(out, id.rootDirLsn, 'startup', base);
    }
    const startup = Buffer.from(prefix + names.join('\r') + '\r', 'latin1');
    out = os9Insert(out, id.rootDirLsn, 'startup', startup, base, { attributes: 0x03, date: null });
  }
  return out;
}

/** Lê os campos de bootstrap (DD.BT/DD.BSZ) — disco é bootável se DD.BT > 0 e DD.BSZ > 0. */
export function os9BootInfo(raw: Buffer, base = 0): { bootable: boolean; bootLsn: number; bootSize: number } {
  const bootLsn = r24(raw, base + 0x15);
  const bootSize = r16(raw, base + 0x18);
  return { bootable: bootLsn > 0 && bootSize > 0, bootLsn, bootSize };
}

// ---- Defrag (compactar segmentos fragmentados) -----------------------------

/** Quantos segmentos REAIS (sectors>0) um FD tem. */
function realSegments(fd: Os9FD): Os9Segment[] { return fd.segments.filter(s => s.sectors > 0); }

/**
 * Defragmenta UM arquivo: move seus dados para um único run contíguo de clusters e reescreve a
 * lista de segmentos do FD com 1 segmento (preserva todo o resto do FD: attr/owner/datas/tamanho).
 * Não toca diretórios nem o LSN do FD (entradas de diretório continuam válidas).
 * Devolve { image, changed, reason } — `changed=false` se já contíguo (reason='contiguous') ou
 * sem espaço contíguo (reason='no-space', e nesse caso NADA é alterado).
 */
export function os9DefragFile(raw: Buffer, fdLsn: number, base = 0): { image: Buffer; changed: boolean; reason?: string } {
  const out = Buffer.from(raw);
  const id = parseIdent(out, base);
  const spc = id.sectorsPerCluster;
  const fd = readFD(out, fdLsn, base);
  if (fd.isDir) return { image: out, changed: false, reason: 'dir' };
  const segs = realSegments(fd);
  if (segs.length <= 1) return { image: out, changed: false, reason: 'contiguous' };
  const data = readFileData(out, fd, base);                          // já truncado a FD.SIZ
  const clustersNeeded = Math.max(1, Math.ceil(Math.ceil(data.length / SEC) / spc));
  const freeOld = () => { for (const s of segs) for (let k = 0; k < Math.ceil(s.sectors / spc); k++) setCluster(out, base, Math.floor(s.lsn / spc) + k, false); };
  const allocOld = () => { for (const s of segs) for (let k = 0; k < Math.ceil(s.sectors / spc); k++) setCluster(out, base, Math.floor(s.lsn / spc) + k, true); };
  // libera os clusters atuais p/ que o run contíguo possa reaproveitá-los
  freeOld();
  const c = findFreeRun(out, base, id, clustersNeeded);
  if (c < 0) { allocOld(); return { image: out, changed: false, reason: 'no-space' }; } // restaura, nada muda
  for (let k = 0; k < clustersNeeded; k++) setCluster(out, base, c + k, true);
  const newSeg: Os9Segment = { lsn: c * spc, sectors: clustersNeeded * spc };
  writeSegmentsData(out, base, [newSeg], data);                      // `data` está em buffer próprio (ok se sobrepor o antigo)
  // reescreve SÓ a lista de segmentos (FD.SEG..fim do setor) — preserva o cabeçalho do FD
  const o = base + fdLsn * SEC;
  out.fill(0, o + FD_SEG, o + SEC);
  w24(out, o + FD_SEG, newSeg.lsn); w16(out, o + FD_SEG + 3, newSeg.sectors);
  return { image: out, changed: true };
}

/** Defragmenta TODOS os arquivos fragmentados do disco. Devolve a imagem + contagens. */
export function os9DefragAll(raw: Buffer, base = 0): { image: Buffer; defragged: number; failed: number; alreadyOk: number } {
  let out: Buffer = Buffer.from(raw);
  const flat = flattenOs9(parseOs9(out, { base }).root);
  let defragged = 0, failed = 0, alreadyOk = 0;
  for (const { node } of flat) {
    if (node.isDir) continue;
    if (!node.segs || node.segs.length <= 1) { alreadyOk++; continue; }
    const r = os9DefragFile(out, node.fdLsn, base);
    if (r.changed) { out = r.image; defragged++; }
    else if (r.reason === 'no-space') failed++;
    else alreadyOk++;
  }
  return { image: out, defragged, failed, alreadyOk };
}

// ---- Área de SISTEMA (proteção para escrita em partição de container) -------

/** Nomes de entrada na RAIZ tratados como SISTEMA do OS-9/NitrOS-9 (intocáveis em edição de container). */
const OS9_SYSTEM_NAMES = new Set(['OS9BOOT', 'SYS', 'CMDS', 'DEFS', 'STARTUP', 'BOOTOBJS', 'MODULES']);

/**
 * Conjunto de FD LSNs que pertencem ao SISTEMA: os arquivos/pastas de nome de sistema na RAIZ
 * (OS9Boot, SYS, CMDS, DEFS, …) e TODO o seu conteúdo recursivo. Usado para BLOQUEAR escrita na
 * partição de sistema de um container (só pastas de usuário são editáveis). A raiz em si NÃO entra
 * (criar pasta de usuário na raiz é permitido); só as subárvores de sistema.
 */
export function os9SystemArea(raw: Buffer, base = 0): Set<number> {
  const set = new Set<number>();
  let id: Os9Ident;
  try { id = parseIdent(raw, base); } catch { return set; }
  let rootFd: Os9FD;
  try { rootFd = readFD(raw, id.rootDirLsn, base); } catch { return set; }
  for (const e of listDir(raw, rootFd, base)) {
    if (e.name === '.' || e.name === '..') continue;
    if (!OS9_SYSTEM_NAMES.has(e.name.toUpperCase())) continue;
    // marca a entrada de sistema + toda a subárvore
    const stack = [e.fdLsn]; let guard = 0;
    while (stack.length && guard++ < 100000) {
      const lsn = stack.pop()!;
      if (set.has(lsn)) continue;
      set.add(lsn);
      let fd: Os9FD; try { fd = readFD(raw, lsn, base); } catch { continue; }
      if (fd.isDir) for (const c of listDir(raw, fd, base)) { if (c.name !== '.' && c.name !== '..') stack.push(c.fdLsn); }
    }
  }
  return set;
}

/** Resolve o FD LSN de um filho `name` em `parentFdLsn` (ou -1) — usado pelas guardas de container. */
export function os9ChildLsn(raw: Buffer, parentFdLsn: number, name: string, base = 0): number {
  return findDirEntry(raw, base, readFD(raw, parentFdLsn, base), name);
}

// ---- Copiar subárvore (pasta recursiva) entre discos ------------------------

export interface Os9Tree { name: string; isDir: boolean; data?: Buffer; children?: Os9Tree[] }

/** Lê recursivamente uma subárvore (arquivo ou pasta) → estrutura serializável com os dados dos arquivos. */
export function os9ReadTree(raw: Buffer, fdLsn: number, name: string, base = 0, depth = 0): Os9Tree {
  const fd = readFD(raw, fdLsn, base);
  if (!fd.isDir) return { name, isDir: false, data: readFileData(raw, fd, base) };
  const children: Os9Tree[] = [];
  if (depth < 32) {
    for (const e of listDir(raw, fd, base)) {
      if (e.name === '.' || e.name === '..' || e.fdLsn === fdLsn) continue;
      children.push(os9ReadTree(raw, e.fdLsn, e.name, base, depth + 1));
    }
  }
  return { name, isDir: true, children };
}

/** Acha o FD LSN de um filho `name` dentro de `parentFdLsn`, ou -1. */
function childFdLsn(buf: Buffer, base: number, parentFdLsn: number, name: string): number {
  return findDirEntry(buf, base, readFD(buf, parentFdLsn, base), name);
}

/** Recria recursivamente uma subárvore (`tree`) dentro de `dstParentFdLsn`. Devolve a nova imagem + contagens. */
export function os9ApplyTree(dst: Buffer, dstParentFdLsn: number, tree: Os9Tree, base = 0, opts?: { date?: Os9Date | null }): { image: Buffer; files: number; dirs: number } {
  let out: Buffer = Buffer.from(dst);
  let files = 0, dirs = 0;
  if (childFdLsn(out, base, dstParentFdLsn, tree.name) >= 0) throw new Error(`Já existe "${tree.name}" no diretório de destino.`);
  const apply = (parentFdLsn: number, node: Os9Tree) => {
    if (!node.isDir) {
      out = os9Insert(out, parentFdLsn, node.name, Buffer.from(node.data ?? Buffer.alloc(0)), base, { date: opts?.date ?? null });
      files++;
    } else {
      out = os9Mkdir(out, parentFdLsn, node.name, base, { date: opts?.date ?? null });
      const newFd = childFdLsn(out, base, parentFdLsn, node.name);
      if (newFd < 0) throw new Error(`Falha ao criar a pasta "${node.name}".`);
      dirs++;
      for (const c of node.children ?? []) apply(newFd, c);
    }
  };
  apply(dstParentFdLsn, tree);
  return { image: out, files, dirs };
}
