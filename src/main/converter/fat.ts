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
