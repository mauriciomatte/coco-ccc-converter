export interface DskFileEntry {
  name: string;
  ext: string;
  fullName: string;
  fileType: number; // 0=BASIC, 1=Data, 2=Machine Code, 3=Source
  fileTypeName: string;
  asciiFlag: number; // 0=Binary, 0xFF=ASCII
  asciiName: string;
  firstGranule: number;
  bytesInLastSector: number;
  granuleChain: number[];
  sectorsInLastGranule: number;
  totalSize: number;
  index: number; // Index in directory scan
  dirOffset: number; // byte offset of this 32-byte directory entry in the image
}

export interface ParsedDsk {
  files: DskFileEntry[];
  fat: Buffer;
  totalGranules: number;
  freeGranules: number;
}

/**
 * Parses a standard TRS-80 Color Computer RS-DOS .DSK disk image.
 * Extracts the file directory and FAT chain maps.
 */
export function parseDsk(dskBuffer: Buffer): ParsedDsk {
  // RS-DOS images are a whole number of tracks of 18 sectors x 256 bytes (4,608 bytes/track).
  // Track 17 is always the directory track regardless of total track count, so 35-track
  // (161,280) and 40-track (184,320) single-sided images are both supported.
  const BYTES_PER_TRACK = 18 * 256; // 4,608
  if (dskBuffer.length < 18 * BYTES_PER_TRACK || dskBuffer.length % BYTES_PER_TRACK !== 0) {
    throw new Error(
      `Invalid DSK image size: ${dskBuffer.length} bytes (expected a whole number of ` +
      `4,608-byte tracks, e.g. 161,280 for 35 tracks or 184,320 for 40 tracks).`
    );
  }

  const tracksPerDisk = dskBuffer.length / BYTES_PER_TRACK;
  // Two granules per track, excluding the reserved directory track 17.
  const totalGranules = (tracksPerDisk - 1) * 2;

  const track17Offset = 17 * BYTES_PER_TRACK; // 78,336
  const fatOffset = track17Offset + 256; // Track 17, Sector 2 (78,592)
  const fat = dskBuffer.slice(fatOffset, fatOffset + 256);

  const files: DskFileEntry[] = [];
  
  // The RS-DOS directory occupies ONLY Track 17, Sectors 3-11 (9 sectors x 8 = 72 entry
  // slots). Sector 2 holds the FAT; Sectors 12-18 are NOT part of the directory and may
  // contain stale leftover bytes from a previous disk state. Reading past Sector 11 would
  // surface those as phantom "files", so the scan stops at the end of Sector 11.
  // Sector 3 starts at track17Offset + 2 * 256 = 78,848.
  // Sector 11 ends at track17Offset + 11 * 256 = 81,152.
  const dirStartOffset = track17Offset + 2 * 256;
  const dirEndOffset = track17Offset + 11 * 256;

  let entryIndex = 0;

  for (let offset = dirStartOffset; offset < dirEndOffset; offset += 32) {
    const entry = dskBuffer.slice(offset, offset + 32);
    
    // An entry starting with 0x00 is empty/unused. 0xFF marks end of directory in some systems.
    if (entry[0] === 0x00 || entry[0] === 0xFF) {
      continue;
    }

    // Clean up filename and extension
    const rawName = entry.slice(0, 8);
    const rawExt = entry.slice(8, 11);
    const name = rawName.toString('ascii').trim();
    const ext = rawExt.toString('ascii').trim();
    const fullName = `${name}.${ext}`;

    // Validate that the filename has at least some printable characters to prevent garbage parsing
    const hasPrintable = /[\x20-\x7E]/.test(name);
    if (!hasPrintable || name.length === 0) {
      continue;
    }

    const fileType = entry[11];
    const asciiFlag = entry[12];
    const firstGranule = entry[13];
    const bytesInLastSector = entry.readUInt16BE(14);

    let fileTypeName = 'Unknown';
    if (fileType === 0) fileTypeName = 'BASIC';
    else if (fileType === 1) fileTypeName = 'Data';
    else if (fileType === 2) fileTypeName = 'Machine Code';
    else if (fileType === 3) fileTypeName = 'Source';

    const asciiName = asciiFlag === 0 ? 'Binary' : 'ASCII';

    // Trace the FAT granule chain
    const granuleChain: number[] = [];
    let currentGranule = firstGranule;
    let sectorsInLastGranule = 9;
    let loopProtect = 0;
    let validChain = true;

    while (currentGranule >= 0 && currentGranule < totalGranules && loopProtect < 100) {
      granuleChain.push(currentGranule);
      const nextGranule = fat[currentGranule];

      if (nextGranule >= 0xC0) {
        // End of chain
        sectorsInLastGranule = nextGranule - 0xC0;
        if (sectorsInLastGranule <= 0 || sectorsInLastGranule > 9) {
          sectorsInLastGranule = 9; // Fallback
        }
        break;
      }

      // Check for self-loops or invalid granules
      if (granuleChain.includes(nextGranule) || nextGranule < 0 || nextGranule >= totalGranules) {
        validChain = false;
        break;
      }

      currentGranule = nextGranule;
      loopProtect++;
    }

    if (!validChain || granuleChain.length === 0) {
      continue; // Skip corrupt/broken entries
    }

    // Calculate file size based on granule chain
    let totalSize = 0;
    if (granuleChain.length > 1) {
      totalSize += (granuleChain.length - 1) * 2304; // 2304 bytes per granule
    }
    const lastGranuleSectors = sectorsInLastGranule;
    const lastSectorBytes = bytesInLastSector === 0 ? 256 : bytesInLastSector;
    totalSize += (lastGranuleSectors - 1) * 256 + lastSectorBytes;

    files.push({
      name,
      ext,
      fullName,
      fileType,
      fileTypeName,
      asciiFlag,
      asciiName,
      firstGranule,
      bytesInLastSector,
      granuleChain,
      sectorsInLastGranule,
      totalSize,
      index: entryIndex++,
      dirOffset: offset
    });
  }

  let freeGranules = 0;
  for (let g = 0; g < totalGranules; g++) {
    if (fat[g] === 0xFF) freeGranules++;
  }

  return {
    files,
    fat,
    totalGranules,
    freeGranules
  };
}

/**
 * Heuristically decides whether a buffer is a single, well-formed RS-DOS disk by
 * validating its FAT (granule allocation table). Every granule entry must be a free
 * marker (0xFF), a forward chain link (< totalGranules) or an end-of-file marker
 * (0xC0-0xC9). Random/non-RS-DOS data (e.g. OS-9 sectors or the unused second half of
 * a double-sized HDBDOS slot) almost never satisfies all entries, so this reliably tells
 * a genuine multi-disk container apart from a single disk stored in an oversized slot.
 */
export function isRsDosDisk(buf: Buffer): boolean {
  const TRACK = 18 * 256; // 4,608
  if (buf.length < 18 * TRACK || buf.length % TRACK !== 0) return false;
  const tracks = buf.length / TRACK;
  const totalGranules = (tracks - 1) * 2;
  const fatOffset = 17 * TRACK + 256; // Track 17, Sector 2
  for (let g = 0; g < totalGranules; g++) {
    const v = buf[fatOffset + g];
    if (v === 0xFF) continue;           // free granule
    if (v < totalGranules) continue;    // forward chain link
    if (v >= 0xC0 && v <= 0xC9) continue; // end-of-file (1-9 sectors in last granule)
    return false;                       // anything else: not a valid RS-DOS FAT
  }
  return true;
}

/**
 * "De-doubles" a sector-doubled RS-DOS disk. MiniIDE/HDBDOS images store each 256-byte
 * logical sector TWICE in a row (S0 S0 S1 S1 …), so a 161,280-byte disk occupies 322,560
 * physical bytes. Taking one sector of each consecutive pair recovers the standard image
 * our engine reads. (Verified lossless on real MiniIDE disks: every sector pair is identical.)
 */
export function deDoubleDisk(buf: Buffer): Buffer {
  const half = Math.floor(buf.length / 2);
  const sectors = Math.floor(half / 256);
  const out = Buffer.alloc(half);
  for (let i = 0; i < sectors; i++) {
    buf.copy(out, i * 256, i * 2 * 256, i * 2 * 256 + 256);
  }
  return out;
}

/**
 * Inverse of deDoubleDisk: re-doubles a standard RS-DOS disk for write-back into a MiniIDE/HDBDOS
 * slot — each 256-byte sector is written TWICE in a row (S0 S0 S1 S1 …). A 161,280-byte disk
 * becomes 322,560 physical bytes (DBL_SLOT). Used to update one disk in place inside a .img.
 */
export function reDoubleDisk(buf: Buffer): Buffer {
  const sectors = Math.floor(buf.length / 256);
  const out = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < sectors; i++) {
    buf.copy(out, i * 2 * 256, i * 256, i * 256 + 256);        // primeira cópia do setor
    buf.copy(out, i * 2 * 256 + 256, i * 256, i * 256 + 256);  // duplicata (igual à 1ª)
  }
  return out;
}

// Doubled-disk on-disk offsets (35-track, sector-doubled): de-doubled Track-17 Sector-2
// (FAT) lives at physical 614*256, Sector-3 (first directory page) at 616*256.
const DBL_FAT_OFF = 614 * 256;   // 157,184
const DBL_DIR_OFF = 616 * 256;   // 157,696
const DBL_SLOT = 2 * 35 * 18 * 256; // 322,560 (a doubled 35-track single-sided disk)

/**
 * Cheap probe: is there a sector-doubled 35-track RS-DOS disk starting at `off` in `buf`?
 * Validates the de-doubled FAT (68 granules) and requires at least one printable directory
 * entry — without allocating a de-doubled copy, so it is fast enough to slide across a
 * whole multi-hundred-MB image one sector at a time.
 */
export function isDoubledRsDosDiskAt(buf: Buffer, off: number): boolean {
  if (off < 0 || off + DBL_SLOT > buf.length) return false;
  for (let g = 0; g < 68; g++) {
    const v = buf[off + DBL_FAT_OFF + g];
    if (v === 0xFF) continue;
    if (v < 68) continue;
    if (v >= 0xC0 && v <= 0xC9) continue;
    return false;
  }
  for (let e = 0; e < 8; e++) {
    const o = off + DBL_DIR_OFF + e * 32;
    const b0 = buf[o];
    if (b0 === 0x00 || b0 === 0xFF) continue;
    let printable = true;
    for (let i = 0; i < 8; i++) {
      const c = buf[o + i];
      if (!(c === 0x20 || (c >= 0x21 && c <= 0x7e))) { printable = false; break; }
    }
    if (printable && buf[o + 11] <= 3) return true;
  }
  return false;
}

export interface MiniIdeDisk {
  index: number;
  offset: number;     // byte offset of the doubled slot in the source image
  label: string;      // first few file names, for display
  fileCount: number;
  freeGranules: number;
}

/**
 * Scans an HDBDOS/MiniIDE image for sector-doubled RS-DOS disks and returns their locations.
 * Each hit advances by a full doubled slot (322,560) so a disk is reported once.
 */
export function scanMiniIdeImage(buf: Buffer, onProgress?: (loaded: number, total: number) => void): MiniIdeDisk[] {
  const S = DBL_SLOT; // 322,560 — uniform HDBDOS slot for a doubled 35-track disk
  const step = 8 * 1024 * 1024;

  // 1) Find an anchor: the first offset that starts a run of 3 consecutive doubled disks one
  //    slot apart. HDBDOS packs the disks on a uniform 322,560-byte grid, so any run member
  //    fixes the grid phase. A lone OS-9/garbage false positive almost never has two more
  //    valid doubled disks at exactly +S and +2S, so this reliably skips the OS-9 partition.
  let anchor = -1;
  let nextReport = step;
  for (let off = 0; off + 3 * S <= buf.length; off += 256) {
    if (isDoubledRsDosDiskAt(buf, off) && isDoubledRsDosDiskAt(buf, off + S) && isDoubledRsDosDiskAt(buf, off + 2 * S)) {
      anchor = off;
      break;
    }
    if (onProgress && off >= nextReport) { onProgress(off, buf.length); nextReport += step; }
  }
  if (anchor < 0) return [];

  // 2) Walk the whole image on the grid (phase = anchor mod S) and validate each slot with a
  //    full parse. Grid points inside the OS-9 partition or past the HDBDOS region don't parse
  //    as RS-DOS, so they drop out; this catches the boot/system disk and every game disk,
  //    tolerating empty slots in between.
  const phase = anchor % S;
  const disks: MiniIdeDisk[] = [];
  let idx = 0;
  for (let off = phase; off + S <= buf.length; off += S) {
    if (onProgress && off >= nextReport) { onProgress(off, buf.length); nextReport += step; }
    if (!isDoubledRsDosDiskAt(buf, off)) continue;
    try {
      const p = parseDsk(deDoubleDisk(buf.subarray(off, off + S)));
      if (p.files.length >= 1) {
        disks.push({
          index: idx++, offset: off,
          label: p.files.slice(0, 4).map(f => f.fullName).join(', '),
          fileCount: p.files.length, freeGranules: p.freeGranules,
        });
      }
    } catch { /* not a clean disk here */ }
  }
  return disks;
}

/**
 * Extracts a file payload from a .DSK image by following its directory entry.
 */
export function extractDskFile(dskBuffer: Buffer, entry: DskFileEntry): Buffer {
  const chunks: Buffer[] = [];

  for (let i = 0; i < entry.granuleChain.length; i++) {
    const gran = entry.granuleChain[i];
    let track = Math.floor(gran / 2);
    if (gran >= 34) {
      track += 1; // Skip track 17 reserved space
    }
    const isSecondHalf = gran % 2 === 1;
    const offset = track * 18 * 256 + (isSecondHalf ? 9 * 256 : 0);

    let size = 2304; // Full granule
    if (i === entry.granuleChain.length - 1) {
      // Last granule uses specific sectors and bytes in the final sector
      const sectorsUsed = entry.sectorsInLastGranule;
      const lastSectorBytes = entry.bytesInLastSector === 0 ? 256 : entry.bytesInLastSector;
      size = (sectorsUsed - 1) * 256 + lastSectorBytes;
    }

    chunks.push(dskBuffer.slice(offset, offset + size));
  }

  return Buffer.concat(chunks);
}

const BYTES_PER_TRACK = 18 * 256; // 4608
const GRANULE_BYTES = 2304; // 9 sectors

function granuleToOffset(g: number): number {
  const track = Math.floor(g / 2) + (g >= 34 ? 1 : 0); // skip directory track 17
  return track * BYTES_PER_TRACK + (g % 2 ? GRANULE_BYTES : 0);
}

/**
 * Adds a file's raw bytes to an existing RS-DOS .dsk image (e.g. a .BIN LOADM or a
 * tokenized .BAS). Allocates free granules and the first free directory slot.
 * Returns a NEW modified image buffer (the input is not mutated).
 */
export function addDskFile(
  dskBuffer: Buffer,
  name: string,
  ext: string,
  fileType: number,
  asciiFlag: number,
  data: Buffer
): Buffer {
  const img = Buffer.from(dskBuffer); // copy
  const tracks = img.length / BYTES_PER_TRACK;
  const totalGranules = (tracks - 1) * 2;
  const fatOffset = 17 * BYTES_PER_TRACK + 256;

  const need = Math.max(1, Math.ceil(data.length / GRANULE_BYTES));
  const free: number[] = [];
  for (let g = 0; g < totalGranules && free.length < need; g++) {
    if (img[fatOffset + g] === 0xFF) free.push(g);
  }
  if (free.length < need) {
    throw new Error(`Not enough free space: need ${need} granules, ${free.length} free.`);
  }

  const dirStart = 17 * BYTES_PER_TRACK + 2 * 256;
  const dirEnd = 17 * BYTES_PER_TRACK + 11 * 256; // Track 17, Sectors 3-11 (directory only)
  let dirOff = -1;
  for (let o = dirStart; o < dirEnd; o += 32) {
    if (img[o] === 0x00 || img[o] === 0xFF) { dirOff = o; break; }
  }
  if (dirOff < 0) throw new Error('Directory is full (no free entry).');

  // Write data across the allocated granules and chain them in the FAT.
  for (let i = 0; i < need; i++) {
    const g = free[i];
    const off = granuleToOffset(g);
    img.fill(0x00, off, off + GRANULE_BYTES);
    data.copy(img, off, i * GRANULE_BYTES, Math.min((i + 1) * GRANULE_BYTES, data.length));
    img[fatOffset + g] = i < need - 1 ? free[i + 1] : 0;
  }
  const lastGranuleBytes = data.length - (need - 1) * GRANULE_BYTES;
  const sectorsInLastGranule = Math.max(1, Math.ceil(lastGranuleBytes / 256));
  img[fatOffset + free[need - 1]] = 0xC0 + sectorsInLastGranule;

  // Directory entry
  img.fill(0x00, dirOff, dirOff + 32);
  const nm = Buffer.alloc(8, 0x20);
  nm.write(name.toUpperCase().replace(/[^\x20-\x7E]/g, '').slice(0, 8), 'ascii');
  nm.copy(img, dirOff);
  const ex = Buffer.alloc(3, 0x20);
  ex.write(ext.toUpperCase().replace(/[^\x20-\x7E]/g, '').slice(0, 3), 'ascii');
  ex.copy(img, dirOff + 8);
  img[dirOff + 11] = fileType & 0xFF;
  img[dirOff + 12] = asciiFlag & 0xFF;
  img[dirOff + 13] = free[0];
  img.writeUInt16BE(data.length % 256, dirOff + 14); // bytes in last sector (0 -> 256)

  return img;
}

/**
 * Desfragmenta UM arquivo no lugar: realoca os granules dele para o menor trecho LIVRE CONTÍGUO
 * (≥ tamanho do arquivo), reescrevendo os dados, a cadeia da FAT e o ponteiro de primeiro granule
 * no diretório. O conteúdo e o tamanho do arquivo não mudam. Se não houver trecho contíguo grande
 * o suficiente (espaço livre também fragmentado), lança erro — aí o caminho é a desfragmentação
 * total. Retorna um NOVO buffer (a entrada não é mutada).
 */
export function defragFileInPlace(dskBuffer: Buffer, entry: DskFileEntry): Buffer {
  const img = Buffer.from(dskBuffer); // cópia
  const tracks = img.length / BYTES_PER_TRACK;
  const totalGranules = (tracks - 1) * 2;
  const fatOffset = 17 * BYTES_PER_TRACK + 256;
  const chain = entry.granuleChain || [];
  const need = chain.length;
  if (need <= 1) return img; // 1 granule nunca fragmenta

  // Já contíguo? Não mexe.
  let contiguous = true;
  for (let i = 1; i < chain.length; i++) if (chain[i] !== chain[i - 1] + 1) { contiguous = false; break; }
  if (contiguous) return img;

  const data = extractDskFile(img, entry); // captura os dados ANTES de liberar os granules
  for (const g of chain) if (g >= 0 && g < totalGranules) img[fatOffset + g] = 0xFF; // libera os atuais

  // Menor trecho contíguo de `need` granules livres (inclui os recém-liberados, se contíguos).
  let runStart = -1;
  for (let g = 0; g + need <= totalGranules; g++) {
    let ok = true;
    for (let k = 0; k < need; k++) if (img[fatOffset + g + k] !== 0xFF) { ok = false; break; }
    if (ok) { runStart = g; break; }
  }
  if (runStart < 0) throw new Error(`No contiguous free run of ${need} granules for this file.`);

  for (let i = 0; i < need; i++) {
    const g = runStart + i;
    const off = granuleToOffset(g);
    img.fill(0x00, off, off + GRANULE_BYTES);
    data.copy(img, off, i * GRANULE_BYTES, Math.min((i + 1) * GRANULE_BYTES, data.length));
    img[fatOffset + g] = i < need - 1 ? g + 1 : (0xC0 + Math.max(1, entry.sectorsInLastGranule));
  }
  img[entry.dirOffset + 13] = runStart; // novo primeiro granule (bytesInLastSector não muda)
  return img;
}

/**
 * Reorders the directory entries of an RS-DOS .dsk image alphabetically (A→Z, with
 * digits before letters per ASCII order) by file name then extension. Only the 32-byte
 * directory records in track 17 are rearranged — the file data and the FAT granule
 * chains are left completely untouched, so every file still reads back identically.
 * Returns a NEW modified image buffer (the input is not mutated).
 */
export function sortDskDirectory(dskBuffer: Buffer): Buffer {
  const img = Buffer.from(dskBuffer);
  const track17Offset = 17 * BYTES_PER_TRACK;
  const dirStartOffset = track17Offset + 2 * 256;
  const dirEndOffset = track17Offset + 11 * 256; // Track 17, Sectors 3-11 (directory only)

  // Collect the raw 32-byte records of every active directory entry, with a sort key.
  const active: { key: string; bytes: Buffer }[] = [];
  for (let offset = dirStartOffset; offset < dirEndOffset; offset += 32) {
    const first = img[offset];
    if (first === 0x00 || first === 0xFF) continue; // empty / deleted slot

    const name = img.slice(offset, offset + 8).toString('ascii').trim();
    const ext = img.slice(offset + 8, offset + 11).toString('ascii').trim();
    if (!/[\x20-\x7E]/.test(name) || name.length === 0) continue; // skip garbage

    active.push({
      key: `${name.toUpperCase()}.${ext.toUpperCase()}`,
      bytes: Buffer.from(img.slice(offset, offset + 32))
    });
  }

  // ASCII order puts digits (0-9) before letters (A-Z), exactly the requested 0→Z order.
  active.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // Rewrite the directory region: sorted entries first, the rest cleared to 0x00.
  img.fill(0x00, dirStartOffset, dirEndOffset);
  let writeOffset = dirStartOffset;
  for (const e of active) {
    e.bytes.copy(img, writeOffset);
    writeOffset += 32;
  }

  return img;
}

/**
 * Deletes a file from an RS-DOS .dsk image: frees its granule chain in the FAT and
 * marks its directory entry as available. Returns a NEW modified image buffer.
 */
export function deleteDskFile(dskBuffer: Buffer, entry: DskFileEntry): Buffer {
  const img = Buffer.from(dskBuffer);
  const fatOffset = 17 * BYTES_PER_TRACK + 256;
  for (const g of entry.granuleChain) {
    if (g >= 0 && g < 256) img[fatOffset + g] = 0xFF; // free
  }
  if (typeof entry.dirOffset === 'number' && entry.dirOffset >= 0) {
    img[entry.dirOffset] = 0x00; // mark entry as deleted/available
  }
  return img;
}
