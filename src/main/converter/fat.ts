// Minimal read-only FAT12/16/32 reader, used to browse/extract .dsk files from a CoCoSDC
// SD-card image. Works through a `Reader` callback (offset,length)=>Buffer so it can read
// regions on demand from a large image file without loading the whole thing into memory.

export type Reader = (offset: number, length: number) => Buffer;

export interface FatVolume {
  type: 'FAT12' | 'FAT16' | 'FAT32';
  baseOffset: number;        // byte offset of this volume in the image (0, or a partition start)
  bytesPerSector: number;
  sectorsPerCluster: number;
  reservedSectors: number;
  numFATs: number;
  fatSize: number;           // sectors per FAT
  rootEntryCount: number;    // FAT12/16 only
  rootCluster: number;       // FAT32 only
  firstDataSector: number;
  rootDirSectors: number;
  firstRootDirSector: number; // FAT12/16
  totalSectors: number;
}

export interface FatFile {
  name: string;        // long name if present, else 8.3
  path: string;        // full path inside the volume
  firstCluster: number;
  size: number;
}

/** Parses a BIOS Parameter Block at `base`. Returns null if it is not a valid FAT BPB. */
function parseBpbAt(read: Reader, base: number): FatVolume | null {
  const bs = read(base, 512);
  if (bs.length < 512 || bs[510] !== 0x55 || bs[511] !== 0xAA) return null;
  const bytesPerSector = bs.readUInt16LE(0x0B);
  const sectorsPerCluster = bs[0x0D];
  if (![512, 1024, 2048, 4096].includes(bytesPerSector)) return null;
  if (![1, 2, 4, 8, 16, 32, 64, 128].includes(sectorsPerCluster)) return null;
  const reservedSectors = bs.readUInt16LE(0x0E);
  const numFATs = bs[0x10];
  if (numFATs < 1 || numFATs > 2 || reservedSectors === 0) return null;
  const rootEntryCount = bs.readUInt16LE(0x11);
  const totalSectors16 = bs.readUInt16LE(0x13);
  const fatSize16 = bs.readUInt16LE(0x16);
  const totalSectors32 = bs.readUInt32LE(0x20);
  const fatSize32 = bs.readUInt32LE(0x24);
  const rootCluster = bs.readUInt32LE(0x2C);

  const fatSize = fatSize16 !== 0 ? fatSize16 : fatSize32;
  const totalSectors = totalSectors16 !== 0 ? totalSectors16 : totalSectors32;
  if (!fatSize || !totalSectors) return null;

  const rootDirSectors = Math.ceil((rootEntryCount * 32) / bytesPerSector);
  const firstDataSector = reservedSectors + numFATs * fatSize + rootDirSectors;
  const firstRootDirSector = reservedSectors + numFATs * fatSize;
  const dataSectors = totalSectors - firstDataSector;
  if (dataSectors <= 0) return null;
  const countOfClusters = Math.floor(dataSectors / sectorsPerCluster);
  const type: FatVolume['type'] = countOfClusters < 4085 ? 'FAT12' : countOfClusters < 65525 ? 'FAT16' : 'FAT32';

  return {
    type, baseOffset: base, bytesPerSector, sectorsPerCluster, reservedSectors, numFATs, fatSize,
    rootEntryCount, rootCluster, firstDataSector, rootDirSectors, firstRootDirSector, totalSectors,
  };
}

/**
 * Locates a FAT volume: tries a bare BPB at offset 0, then (if the image starts with an MBR
 * partition table) tries each partition's start sector. Returns null if no FAT volume found.
 */
export function readFatVolume(read: Reader): FatVolume | null {
  const direct = parseBpbAt(read, 0);
  if (direct) return direct;
  // MBR partition table: 4 entries of 16 bytes at 0x1BE; LBA start (u32 LE) at +8.
  const mbr = read(0, 512);
  if (mbr.length < 512 || mbr[510] !== 0x55 || mbr[511] !== 0xAA) return null;
  for (let i = 0; i < 4; i++) {
    const e = 0x1BE + i * 16;
    const type = mbr[e + 4];
    const lbaStart = mbr.readUInt32LE(e + 8);
    const numSecs = mbr.readUInt32LE(e + 12);
    if (type === 0 || lbaStart === 0 || numSecs === 0) continue;
    const vol = parseBpbAt(read, lbaStart * 512);
    if (vol) return vol;
  }
  return null;
}

function loadFat(read: Reader, vol: FatVolume): Buffer {
  return read(vol.baseOffset + vol.reservedSectors * vol.bytesPerSector, vol.fatSize * vol.bytesPerSector);
}

function fatEntry(fat: Buffer, vol: FatVolume, cluster: number): number {
  if (vol.type === 'FAT32') return fat.readUInt32LE(cluster * 4) & 0x0FFFFFFF;
  if (vol.type === 'FAT16') return fat.readUInt16LE(cluster * 2);
  // FAT12
  const idx = Math.floor(cluster * 3 / 2);
  const v = fat.readUInt16LE(idx);
  return cluster & 1 ? v >> 4 : v & 0x0FFF;
}

function isEoc(vol: FatVolume, v: number): boolean {
  if (vol.type === 'FAT32') return v >= 0x0FFFFFF8;
  if (vol.type === 'FAT16') return v >= 0xFFF8;
  return v >= 0xFF8;
}

function clusterChain(fat: Buffer, vol: FatVolume, start: number): number[] {
  const chain: number[] = [];
  let c = start, guard = 0;
  while (c >= 2 && !isEoc(vol, c) && guard++ < 5_000_000) {
    chain.push(c);
    c = fatEntry(fat, vol, c);
  }
  return chain;
}

function clusterOffset(vol: FatVolume, cluster: number): number {
  const sector = (cluster - 2) * vol.sectorsPerCluster + vol.firstDataSector;
  return vol.baseOffset + sector * vol.bytesPerSector;
}

function readClusters(read: Reader, vol: FatVolume, fat: Buffer, start: number): Buffer {
  const clusterBytes = vol.sectorsPerCluster * vol.bytesPerSector;
  const parts = clusterChain(fat, vol, start).map(c => read(clusterOffset(vol, c), clusterBytes));
  return Buffer.concat(parts);
}

// Long-filename reassembly from a run of 0x0F (LFN) entries that precede the 8.3 entry.
function lfnChars(entry: Buffer): string {
  const ranges = [[1, 11], [14, 26], [28, 32]];
  let s = '';
  for (const [a, b] of ranges) {
    for (let i = a; i < b; i += 2) {
      const code = entry.readUInt16LE(i);
      if (code === 0x0000 || code === 0xFFFF) return s;
      s += String.fromCharCode(code);
    }
  }
  return s;
}

function short83(entry: Buffer): string {
  const name = entry.toString('latin1', 0, 8).replace(/ +$/, '');
  const ext = entry.toString('latin1', 8, 11).replace(/ +$/, '');
  return ext ? `${name}.${ext}` : name;
}

/** Recursively lists files (optionally filtered by extension, e.g. ['dsk']) in the volume. */
export function listFatFiles(read: Reader, vol: FatVolume, exts?: string[]): FatFile[] {
  const fat = loadFat(read, vol);
  const out: FatFile[] = [];
  const wantExt = exts ? exts.map(e => e.toLowerCase()) : null;

  const visit = (dirBytes: Buffer, path: string, depth: number, visitedClusters: Set<number>) => {
    if (depth > 16 || out.length > 20000) return;
    let lfn = '';
    for (let o = 0; o + 32 <= dirBytes.length; o += 32) {
      const first = dirBytes[o];
      if (first === 0x00) break;           // end of directory
      if (first === 0xE5) { lfn = ''; continue; } // deleted
      const attr = dirBytes[o + 0x0B];
      if (attr === 0x0F) { lfn = lfnChars(dirBytes.subarray(o, o + 32)) + lfn; continue; } // LFN part
      if (attr & 0x08) { lfn = ''; continue; } // volume label
      const entry = dirBytes.subarray(o, o + 32);
      let name = lfn || short83(entry);
      lfn = '';
      if (name === '.' || name === '..') continue;
      const cluster = (entry.readUInt16LE(0x14) << 16) | entry.readUInt16LE(0x1A);
      const size = entry.readUInt32LE(0x1C);
      const full = path ? `${path}/${name}` : name;
      if (attr & 0x10) {
        // directory
        if (cluster >= 2 && !visitedClusters.has(cluster)) {
          visitedClusters.add(cluster);
          visit(readClusters(read, vol, fat, cluster), full, depth + 1, visitedClusters);
        }
      } else {
        const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
        if (!wantExt || wantExt.includes(ext)) out.push({ name, path: full, firstCluster: cluster, size });
      }
    }
  };

  let rootBytes: Buffer;
  if (vol.type === 'FAT32') {
    rootBytes = readClusters(read, vol, fat, vol.rootCluster);
  } else {
    rootBytes = read(vol.baseOffset + vol.firstRootDirSector * vol.bytesPerSector, vol.rootDirSectors * vol.bytesPerSector);
  }
  visit(rootBytes, '', 0, new Set());
  return out;
}

/** Reads a file's bytes by following its cluster chain, truncated to its directory size. */
export function readFatFile(read: Reader, vol: FatVolume, file: FatFile): Buffer {
  const fat = loadFat(read, vol);
  if (file.firstCluster < 2) return Buffer.alloc(0);
  const data = readClusters(read, vol, fat, file.firstCluster);
  return data.subarray(0, file.size);
}

// =============================================================================
//  FAT WRITE ENGINE (D12) — add / replace / delete files in an EXISTING FAT
//  volume (CoCoSDC SD card / RetroRewind .img). All I/O goes through random-access
//  read()/write() callbacks → never loads the whole (multi-GB) image. Updates BOTH
//  FAT copies. Caller MUST work on a COPY and validate before trusting a real card.
// =============================================================================

/** A random-access writer mirroring {@link Reader}: writes `data` at byte `offset`. */
export type Writer = (offset: number, data: Buffer) => void;

const EOC_VALUE = (vol: FatVolume): number =>
  vol.type === 'FAT32' ? 0x0fffffff : vol.type === 'FAT16' ? 0xffff : 0xfff;

/** Number of the highest valid cluster index + 1 (clusters are 2..count-1). */
function clusterCount(vol: FatVolume): number {
  const dataSectors = vol.totalSectors - vol.firstDataSector;
  return Math.floor(dataSectors / vol.sectorsPerCluster) + 2;
}

function setFatEntry(fat: Buffer, vol: FatVolume, cluster: number, value: number): void {
  if (vol.type === 'FAT32') {
    const cur = fat.readUInt32LE(cluster * 4);
    fat.writeUInt32LE((cur & 0xf0000000) | (value & 0x0fffffff), cluster * 4); // preserve top 4 reserved bits
  } else if (vol.type === 'FAT16') {
    fat.writeUInt16LE(value & 0xffff, cluster * 2);
  } else {
    const idx = Math.floor((cluster * 3) / 2);
    let v = fat.readUInt16LE(idx);
    if (cluster & 1) v = (v & 0x000f) | ((value & 0x0fff) << 4);
    else v = (v & 0xf000) | (value & 0x0fff);
    fat.writeUInt16LE(v, idx);
  }
}

/** Writes the in-memory FAT buffer back to every FAT copy on the device. */
function flushFat(write: Writer, vol: FatVolume, fat: Buffer): void {
  for (let i = 0; i < vol.numFATs; i++) {
    write(vol.baseOffset + (vol.reservedSectors + i * vol.fatSize) * vol.bytesPerSector, fat);
  }
}

/** Returns `n` free cluster numbers (FAT entry == 0), or null if the volume lacks that many. */
function findFreeClusters(fat: Buffer, vol: FatVolume, n: number): number[] | null {
  if (n <= 0) return [];
  const total = clusterCount(vol);
  const out: number[] = [];
  for (let c = 2; c < total && out.length < n; c++) if (fatEntry(fat, vol, c) === 0) out.push(c);
  return out.length === n ? out : null;
}

/** Lays a cluster chain into the FAT (links each to the next; last → EOC). */
function linkChain(fat: Buffer, vol: FatVolume, chain: number[]): void {
  for (let i = 0; i < chain.length; i++) setFatEntry(fat, vol, chain[i], i === chain.length - 1 ? EOC_VALUE(vol) : chain[i + 1]);
}

function writeClusterData(write: Writer, vol: FatVolume, cluster: number, data: Buffer): void {
  const clusterBytes = vol.sectorsPerCluster * vol.bytesPerSector;
  const buf = data.length === clusterBytes ? data : Buffer.alloc(clusterBytes);
  if (buf !== data) data.copy(buf);
  write(clusterOffset(vol, cluster), buf);
}

// ---- directory entry location (absolute byte offsets) -----------------------

interface DirLoc {
  entryOffset: number;        // absolute byte offset of the 8.3 entry
  lfnOffsets: number[];       // absolute offsets of the preceding LFN entries (for delete)
  firstCluster: number;
  size: number;
}

/** Absolute byte offsets of every 32-byte slot of a directory (root or a cluster-chain dir). */
function dirSlotOffsets(read: Reader, vol: FatVolume, dirFirstCluster: number | null): number[] {
  const out: number[] = [];
  if (dirFirstCluster == null) {
    // FAT12/16 fixed root
    const base = vol.baseOffset + vol.firstRootDirSector * vol.bytesPerSector;
    const n = vol.rootDirSectors * vol.bytesPerSector;
    for (let o = 0; o + 32 <= n; o += 32) out.push(base + o);
    return out;
  }
  const fat = loadFat(read, vol);
  const clusterBytes = vol.sectorsPerCluster * vol.bytesPerSector;
  for (const c of clusterChain(fat, vol, dirFirstCluster)) {
    const base = clusterOffset(vol, c);
    for (let o = 0; o + 32 <= clusterBytes; o += 32) out.push(base + o);
  }
  return out;
}

/** Finds the directory entry for `name` (long or 8.3) inside the given directory. */
function findEntryInDir(read: Reader, vol: FatVolume, dirFirstCluster: number | null, name: string): DirLoc | null {
  const slots = dirSlotOffsets(read, vol, dirFirstCluster);
  let lfn = '', lfnOffsets: number[] = [];
  const target = name.toLowerCase();
  for (const off of slots) {
    const e = read(off, 32);
    const first = e[0];
    if (first === 0x00) break;
    if (first === 0xe5) { lfn = ''; lfnOffsets = []; continue; }
    const attr = e[0x0b];
    if (attr === 0x0f) { lfn = lfnChars(e) + lfn; lfnOffsets.unshift(off); continue; }
    if (attr & 0x08) { lfn = ''; lfnOffsets = []; continue; }
    const entryName = lfn || short83(e);
    if (entryName.toLowerCase() === target) {
      return { entryOffset: off, lfnOffsets, firstCluster: (e.readUInt16LE(0x14) << 16) | e.readUInt16LE(0x1a), size: e.readUInt32LE(0x1c) };
    }
    lfn = ''; lfnOffsets = [];
  }
  return null;
}

/** Resolves a path ("DIR/SUB/FILE.DSK") to the parent dir's first cluster + the file's name. */
function resolveParent(read: Reader, vol: FatVolume, path: string): { parentCluster: number | null; name: string } | null {
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return null;
  const name = parts.pop()!;
  let dirCluster: number | null = vol.type === 'FAT32' ? vol.rootCluster : null;
  for (const part of parts) {
    const loc = findEntryInDir(read, vol, dirCluster, part);
    if (!loc) return null;
    dirCluster = loc.firstCluster; // a subdirectory's first cluster
  }
  return { parentCluster: dirCluster, name };
}

// ---- short-name (8.3) + LFN entry generation --------------------------------

function lfnChecksum(short11: Buffer): number {
  let sum = 0;
  for (let i = 0; i < 11; i++) sum = (((sum & 1) << 7) + (sum >> 1) + short11[i]) & 0xff;
  return sum;
}

/** Builds the 11-byte padded 8.3 short name (UPPER), e.g. "GAME    DSK". */
function makeShort11(name: string, taken: (s: string) => boolean): Buffer {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9_~!#$%&'()@^{}-]/g, '').replace(/\s+/g, '');
  const dot = name.lastIndexOf('.');
  let base = clean(dot >= 0 ? name.slice(0, dot) : name) || 'FILE';
  const ext = clean(dot >= 0 ? name.slice(dot + 1) : '').slice(0, 3);
  const build = (b: string) => {
    const eight = (b + '        ').slice(0, 8);
    const three = (ext + '   ').slice(0, 3);
    return eight + three;
  };
  // try BASE, then BASE~1..~99 until unique
  let candidate = build(base);
  if (taken(candidate)) {
    for (let n = 1; n < 100; n++) {
      const suffix = '~' + n;
      const trimmed = base.slice(0, Math.max(1, 8 - suffix.length)) + suffix;
      candidate = build(trimmed);
      if (!taken(candidate)) break;
    }
  }
  return Buffer.from(candidate, 'latin1');
}

/** All 8.3 short names currently used in a directory (to keep generated names unique). */
function takenShortNames(read: Reader, vol: FatVolume, dirFirstCluster: number | null): Set<string> {
  const set = new Set<string>();
  for (const off of dirSlotOffsets(read, vol, dirFirstCluster)) {
    const e = read(off, 32);
    if (e[0] === 0x00) break;
    if (e[0] === 0xe5 || e[0x0b] === 0x0f || (e[0x0b] & 0x08)) continue;
    set.add(e.toString('latin1', 0, 11));
  }
  return set;
}

/** Builds the run of 32-byte entries (LFN parts + final 8.3) for a new file. */
function buildEntries(name: string, short11: Buffer, firstCluster: number, size: number): Buffer {
  const needsLfn = name !== short83Of(short11);
  const parts: Buffer[] = [];
  if (needsLfn) {
    const chk = lfnChecksum(short11);
    const units: number[] = [];
    for (let i = 0; i < name.length; i++) units.push(name.charCodeAt(i));
    units.push(0x0000); // NUL terminator
    while (units.length % 13 !== 0) units.push(0xffff); // pad with 0xFFFF
    const count = units.length / 13;
    for (let seq = count; seq >= 1; seq--) { // stored in REVERSE order
      const e = Buffer.alloc(32);
      e[0] = seq | (seq === count ? 0x40 : 0x00); // last logical part gets 0x40
      e[0x0b] = 0x0f; e[0x0d] = chk;
      const ranges = [[1, 11], [14, 26], [28, 32]];
      let u = (seq - 1) * 13;
      for (const [a, b] of ranges) for (let i = a; i < b; i += 2) { e.writeUInt16LE(units[u++] ?? 0xffff, i); }
      parts.push(e);
    }
  }
  const main = Buffer.alloc(32);
  short11.copy(main, 0);
  main[0x0b] = 0x20; // archive
  main.writeUInt16LE((firstCluster >> 16) & 0xffff, 0x14);
  main.writeUInt16LE(firstCluster & 0xffff, 0x1a);
  main.writeUInt32LE(size >>> 0, 0x1c);
  parts.push(main);
  return Buffer.concat(parts);
}

function short83Of(short11: Buffer): string {
  const name = short11.toString('latin1', 0, 8).replace(/ +$/, '');
  const ext = short11.toString('latin1', 8, 11).replace(/ +$/, '');
  return ext ? `${name}.${ext}` : name;
}

// ---- public write ops -------------------------------------------------------

export interface FatWriteResult { firstCluster: number; clusters: number; }

/** Writes `data` into an existing chain starting at `firstCluster` (0 = none yet), reusing/
 *  extending/truncating clusters as needed. Updates the FAT; returns the new first cluster. */
function putData(read: Reader, write: Writer, vol: FatVolume, fat: Buffer, firstCluster: number, data: Buffer): FatWriteResult {
  const clusterBytes = vol.sectorsPerCluster * vol.bytesPerSector;
  const needed = Math.max(1, Math.ceil(data.length / clusterBytes));
  let chain = firstCluster >= 2 ? clusterChain(fat, vol, firstCluster) : [];
  if (chain.length < needed) {
    const extra = findFreeClusters(fat, vol, needed - chain.length);
    if (!extra) throw new Error('Sem espaço livre suficiente no cartão FAT.');
    chain = chain.concat(extra);
  } else if (chain.length > needed) {
    for (const c of chain.slice(needed)) setFatEntry(fat, vol, c, 0); // free the tail
    chain = chain.slice(0, needed);
  }
  linkChain(fat, vol, chain);
  for (let i = 0; i < chain.length; i++) writeClusterData(write, vol, chain[i], data.subarray(i * clusterBytes, (i + 1) * clusterBytes));
  return { firstCluster: chain[0], clusters: chain.length };
}

/** Reserves `count` free 32-byte directory slots, GROWING the dir (a new cluster) if needed. Returns
 *  the absolute byte offsets of each reserved slot. The run is kept WITHIN a single cluster so a multi-
 *  entry record (LFN + 8.3) never straddles a (possibly non-contiguous) cluster boundary. FAT12/16
 *  fixed root cannot grow. */
function reserveDirSlots(read: Reader, write: Writer, vol: FatVolume, fat: Buffer, dirFirstCluster: number | null, count: number): number[] {
  const slotsPerCluster = (vol.sectorsPerCluster * vol.bytesPerSector) / 32;
  if (dirFirstCluster != null && count > slotsPerCluster) throw new Error('Nome de arquivo longo demais para o diretório.');
  const slots = dirSlotOffsets(read, vol, dirFirstCluster);
  // find a run of `count` consecutive free/deleted slots that does NOT cross a cluster boundary
  let runStart = -1, run = 0;
  for (let i = 0; i < slots.length; i++) {
    const sameCluster = dirFirstCluster == null || Math.floor(i / slotsPerCluster) === Math.floor(runStart / slotsPerCluster);
    const first = read(slots[i], 1)[0];
    if ((first === 0x00 || first === 0xe5) && (run === 0 || sameCluster)) {
      if (run === 0) runStart = i;
      if (++run >= count) return slots.slice(runStart, runStart + count);
    } else if (first === 0x00 || first === 0xe5) {
      runStart = i; run = 1; // boundary crossed: restart the run here
      if (run >= count) return slots.slice(runStart, runStart + count);
    } else { run = 0; }
  }
  // not enough room — must grow (FAT32 / subdir only)
  if (dirFirstCluster == null) throw new Error('Diretório-raiz FAT12/16 cheio.');
  const extra = findFreeClusters(fat, vol, 1);
  if (!extra) throw new Error('Sem espaço para crescer o diretório.');
  const tail = clusterChain(fat, vol, dirFirstCluster);
  setFatEntry(fat, vol, tail[tail.length - 1], extra[0]);
  setFatEntry(fat, vol, extra[0], EOC_VALUE(vol));
  flushFat(write, vol, fat); // persistir a nova ligação da cadeia do diretório
  writeClusterData(write, vol, extra[0], Buffer.alloc(vol.sectorsPerCluster * vol.bytesPerSector)); // zero new dir cluster
  // o novo cluster cabe `slotsPerCluster` slots (>= count para nomes razoáveis)
  const base = clusterOffset(vol, extra[0]);
  return Array.from({ length: count }, (_, k) => base + k * 32);
}

/** Overwrites an EXISTING file's contents (found by path), adjusting its cluster chain + dir size. */
export function fatReplaceFile(read: Reader, write: Writer, vol: FatVolume, path: string, data: Buffer): FatWriteResult {
  const loc = (() => {
    const rp = resolveParent(read, vol, path);
    if (!rp) return null;
    return findEntryInDir(read, vol, rp.parentCluster, rp.name);
  })();
  if (!loc) throw new Error(`Arquivo não encontrado no FAT: ${path}`);
  const fat = loadFat(read, vol);
  const res = putData(read, write, vol, fat, loc.firstCluster, data);
  flushFat(write, vol, fat);
  // update the 8.3 entry: first cluster + size
  const e = read(loc.entryOffset, 32);
  e.writeUInt16LE((res.firstCluster >> 16) & 0xffff, 0x14);
  e.writeUInt16LE(res.firstCluster & 0xffff, 0x1a);
  e.writeUInt32LE(data.length >>> 0, 0x1c);
  write(loc.entryOffset, e);
  return res;
}

/** Adds a NEW file `name` with `data` to the directory at `dirPath` ("" = root). */
export function fatAddFile(read: Reader, write: Writer, vol: FatVolume, dirPath: string, name: string, data: Buffer): FatWriteResult {
  let dirCluster: number | null = vol.type === 'FAT32' ? vol.rootCluster : null;
  for (const part of dirPath.split('/').filter(Boolean)) {
    const loc = findEntryInDir(read, vol, dirCluster, part);
    if (!loc) throw new Error(`Pasta não encontrada no FAT: ${part}`);
    dirCluster = loc.firstCluster;
  }
  if (findEntryInDir(read, vol, dirCluster, name)) throw new Error(`Já existe "${name}" no cartão.`);
  const fat = loadFat(read, vol);
  const res = putData(read, write, vol, fat, 0, data);
  flushFat(write, vol, fat);
  const taken = takenShortNames(read, vol, dirCluster);
  const short11 = makeShort11(name, s => taken.has(s));
  const entries = buildEntries(name, short11, res.firstCluster, data.length);
  const slotCount = entries.length / 32;
  const offs = reserveDirSlots(read, write, vol, loadFat(read, vol), dirCluster, slotCount);
  for (let i = 0; i < slotCount; i++) write(offs[i], entries.subarray(i * 32, i * 32 + 32)); // 1 slot por vez (não cruza cluster)
  return res;
}

/** Deletes a file (marks its dir entries 0xE5 and frees its clusters). */
export function fatDeleteFile(read: Reader, write: Writer, vol: FatVolume, path: string): void {
  const rp = resolveParent(read, vol, path);
  if (!rp) throw new Error(`Caminho inválido: ${path}`);
  const loc = findEntryInDir(read, vol, rp.parentCluster, rp.name);
  if (!loc) throw new Error(`Arquivo não encontrado no FAT: ${path}`);
  const fat = loadFat(read, vol);
  if (loc.firstCluster >= 2) { for (const c of clusterChain(fat, vol, loc.firstCluster)) setFatEntry(fat, vol, c, 0); flushFat(write, vol, fat); }
  for (const off of [...loc.lfnOffsets, loc.entryOffset]) { const e = read(off, 32); e[0] = 0xe5; write(off, e); }
}
