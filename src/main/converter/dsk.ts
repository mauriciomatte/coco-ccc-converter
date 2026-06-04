export interface DskFileEntry {
  name: string;      // display name (printable kept, non-ASCII bytes shown as ▓)
  ext: string;       // display extension
  fullName: string;  // `${name}.${ext}` for display
  rawName: number[]; // EXACT 8 filename bytes (lossless — for byte-perfect write-back)
  rawExt: number[];  // EXACT 3 extension bytes
  hasGraphics: boolean; // filename/ext uses non-ASCII (VDG semigraphic / "DIR art") bytes
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

    // Filename & extension. We KEEP the exact bytes (rawName/rawExt) for lossless write-back, and
    // build a sanitized DISPLAY string. We do NOT use 'ascii' (which masks bit 7 and corrupts VDG
    // semigraphic "DIR art" names), and we do NOT drop entries with non-printable names — a real
    // file is identified by its valid granule chain (checked below), not by a readable name.
    // Dropping/mangling here silently lost files (e.g. a semigraphic-named file between two normal
    // ones) and corrupted them on any directory rewrite.
    const rawNameBytes = Array.from(entry.slice(0, 8));
    const rawExtBytes = Array.from(entry.slice(8, 11));
    const sanitize = (bytes: number[]) => bytes.map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '▓').join('');
    const name = sanitize(rawNameBytes).replace(/\s+$/, '');
    const ext = sanitize(rawExtBytes).replace(/\s+$/, '');
    const fullName = `${name}.${ext}`;
    const hasGraphics = rawNameBytes.concat(rawExtBytes).some(b => b !== 0x20 && (b < 0x20 || b > 0x7e));

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
      rawName: rawNameBytes,
      rawExt: rawExtBytes,
      hasGraphics,
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
// SIDEKICK stores the drive name (8 bytes) at de-doubled LSN 322 (track 17, sector 17 — unused by
// standard RS-DOS, so it is never file data). In the DOUBLED slot that is byte offset 322*512.
const DBL_NAME_OFF = 322 * 512;  // 164,864
// HDBDOS addresses RS-DOS/Dragon virtual disks as drives 000–255 (a fixed 256-slot grid).
const MINIIDE_MAX_SLOTS = 256;

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

/**
 * Relaxed sibling of {@link isDoubledRsDosDiskAt}: recognizes a doubled RS-DOS disk by a valid FAT
 * plus at least one real directory entry, WITHOUT requiring a printable filename. Some HDBDOS
 * disks use VDG semigraphic / control bytes in their filenames to draw "art" in the DIR (a trick
 * borrowed from 8-bit machines like the C64); the strict probe drops them, which both hides those
 * disks AND shifts the numbering of every disk after them. This probe keeps them.
 */
export function looksDoubledRsDosSlot(buf: Buffer, off: number): boolean {
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
    if (b0 === 0x00 || b0 === 0xFF) continue; // unused / deleted slot
    if (buf[o + 11] <= 3) return true;        // a real file entry — any filename bytes allowed
  }
  return false;
}

/**
 * Read the SIDEKICK drive name (8-byte field at the start of de-doubled LSN 322). Returns a trimmed
 * ASCII name, or null when the slot has no name (most drives are unnamed → caller falls back to
 * filenames). Defensive: a single non-printable byte makes it null, so non-SIDEKICK images degrade
 * gracefully instead of showing garbage.
 */
export function readSidekickName(buf: Buffer, off: number): string | null {
  const o = off + DBL_NAME_OFF;
  if (o + 8 > buf.length) return null;
  let s = '';
  for (let i = 0; i < 8; i++) {
    const c = buf[o + i];
    if (c === 0x00 || c === 0xFF) break;
    if (c < 0x20 || c > 0x7e) return null; // not a clean ASCII name
    s += String.fromCharCode(c);
  }
  s = s.trim();
  return s || null;
}

export interface MiniIdeDisk {
  slot: number;            // physical drive number 0..255 (matches SIDEKICK / hardware)
  offset: number;          // byte offset of the doubled slot in the source image
  state: 'occupied' | 'empty' | 'nonrsdos'; // disk present / blank slot / non-RS-DOS leftover
  name: string | null;     // SIDEKICK drive name, if the drive was named
  label: string;           // best display label: name → filenames → "(arte gráfica)" / "(vazio)"
  filePreview: string;     // sanitized first filenames (for a secondary line)
  graphicsArt: boolean;    // directory uses non-ASCII / semigraphic filenames ("DIR art")
  fileCount: number;
  freeGranules: number;
}

/** Structural validity of a doubled slot's FAT (68 granules), without requiring any directory entry. */
function doubledFatValid(buf: Buffer, off: number): boolean {
  if (off < 0 || off + DBL_SLOT > buf.length) return false;
  for (let g = 0; g < 68; g++) {
    const v = buf[off + DBL_FAT_OFF + g];
    if (v === 0xFF || v < 68 || (v >= 0xC0 && v <= 0xC9)) continue;
    return false;
  }
  return true;
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

  // 2) Walk the FULL FIXED 256-slot region from the anchor (= physical drive 0). Return ONE entry per
  //    physical slot — occupied, empty (blank/formatted) OR non-RS-DOS — so the UI can navigate the
  //    whole 000–255 range exactly like SIDEKICK (and surface empty slots for format/insert). Indexing
  //    by physical slot also means an empty/skipped slot never shifts the numbering after it.
  const sanitize = (s: string) => s.replace(/[^\x20-\x7e]/g, '').trim();
  const disks: MiniIdeDisk[] = [];
  for (let slot = 0; slot < MINIIDE_MAX_SLOTS; slot++) {
    const off = anchor + slot * S;
    if (off + S > buf.length) break;
    if (onProgress && off >= nextReport) { onProgress(off, buf.length); nextReport += step; }
    const name = readSidekickName(buf, off);
    if (!looksDoubledRsDosSlot(buf, off)) {
      // No listable directory: a blank slot (valid-ish FAT, no files) or non-RS-DOS leftover.
      const state: MiniIdeDisk['state'] = doubledFatValid(buf, off) ? 'empty' : 'nonrsdos';
      disks.push({ slot, offset: off, state, name, label: name || (state === 'empty' ? '(vazio)' : '(não-RS-DOS)'), filePreview: '', graphicsArt: false, fileCount: 0, freeGranules: 0 });
      continue;
    }
    const graphicsArt = !isDoubledRsDosDiskAt(buf, off); // present but no printable filename
    let fileCount = 0, freeGranules = 0, fileLabel = '';
    try {
      const p = parseDsk(deDoubleDisk(buf.subarray(off, off + S)));
      fileCount = p.files.length;
      freeGranules = p.freeGranules;
      fileLabel = p.files.slice(0, 4).map(f => sanitize(f.fullName)).filter(Boolean).join(', ');
    } catch { /* art / odd disk — FAT is valid but parse may be partial */ }
    const label = name || (graphicsArt ? '(arte gráfica)' : (fileLabel || `Disco ${slot}`));
    disks.push({ slot, offset: off, state: 'occupied', name, label, filePreview: fileLabel, graphicsArt, fileCount, freeGranules });
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

    // Sort key from the raw bytes (latin1 = byte-preserving). We do NOT drop entries with
    // non-printable names — they are real files (e.g. semigraphic "DIR art") and the 32-byte
    // record is copied VERBATIM below, so every filename byte round-trips losslessly.
    const name = img.slice(offset, offset + 8).toString('latin1');
    const ext = img.slice(offset + 8, offset + 11).toString('latin1');

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

/**
 * Renomeia um arquivo RS-DOS: reescreve só os campos NOME (8) e EXTENSÃO (3) da entrada de diretório
 * (preenchidos com ESPAÇO, maiúsculo) — dados e cadeia de grânulos intocados. Recusa nome vazio ou
 * colisão com outra entrada ativa. Retorna uma NOVA imagem.
 */
export function renameDskFile(dskBuffer: Buffer, entry: DskFileEntry, newName: string, newExt: string): Buffer {
  const img = Buffer.from(dskBuffer);
  const nm = (newName || '').toUpperCase().replace(/[^\x20-\x7e]/g, '').replace(/[. ]/g, '').slice(0, 8);
  const ex = (newExt || '').toUpperCase().replace(/[^\x20-\x7e]/g, '').replace(/[. ]/g, '').slice(0, 3);
  if (!nm) throw new Error('Nome inválido.');
  const o = entry.dirOffset;
  if (typeof o !== 'number' || o < 0) throw new Error('Entrada de diretório inválida.');
  // colisão com outra entrada ativa
  const t17 = 17 * BYTES_PER_TRACK, dirStart = t17 + 2 * 256, dirEnd = t17 + 11 * 256;
  for (let off = dirStart; off < dirEnd; off += 32) {
    if (off === o) continue;
    const f = img[off]; if (f === 0x00 || f === 0xFF) continue;
    const n = img.slice(off, off + 8).toString('latin1').replace(/ +$/, '').toUpperCase();
    const e = img.slice(off + 8, off + 11).toString('latin1').replace(/ +$/, '').toUpperCase();
    if (n === nm && e === ex) throw new Error(`Já existe "${nm}${ex ? '.' + ex : ''}" no disco.`);
  }
  for (let i = 0; i < 8; i++) img[o + i] = i < nm.length ? nm.charCodeAt(i) : 0x20;
  for (let i = 0; i < 3; i++) img[o + 8 + i] = i < ex.length ? ex.charCodeAt(i) : 0x20;
  return img;
}

// O SIDEKICK guarda o nome do drive na trilha 17, setor ~17 (LSN 322), como um "catálogo": entradas
// de 16 B em passo de 32 B (16 dados + 16 zeros), com a ENTRADA 0 carregando o nome (8 chars + NUL).
const SK_NAME_LSN = 322; // de-doubled offset 82.432

/** Um setor está "em branco" (drive sem nome) se é só 0xFF/0x00? */
function isBlankSector(buf: Buffer, off: number): boolean {
  for (let i = 0; i < 256; i++) { const v = buf[off + i]; if (v !== 0xFF && v !== 0x00) return false; }
  return true;
}

/**
 * Escreve/renomeia o NOME do drive SIDEKICK numa imagem RS-DOS DE-DOUBLED (161.280 B). Retorna NOVO
 * buffer. Se o drive já tem nome (catálogo existe em LSN 322), sobrescreve SÓ o nome (seguro). Se está
 * sem nome (LSN 322 todo 0xFF), CONSTRÓI o catálogo replicando a estrutura observada do SIDEKICK
 * (1ªs 8 entradas do diretório real, 16 B cada, passo 32 B) com a entrada 0 levando o nome.
 * (O caso "sem nome" é EXPERIMENTAL — validar no hardware antes de confiar.)
 */
export function writeSidekickName(disk: Buffer, name: string): Buffer {
  const off = SK_NAME_LSN * 256; // 82.432
  if (disk.length < off + 256) throw new Error('Imagem pequena demais para o nome SIDEKICK.');
  const out = Buffer.from(disk);
  const nm = (name || '').toUpperCase().replace(/[^\x20-\x7e]/g, '').slice(0, 8);
  if (isBlankSector(out, off)) {
    // sem catálogo → construir: copia as 8 primeiras entradas do diretório real (16 B cada).
    out.fill(0x00, off, off + 256);
    const dirBase = 17 * 18 * 256 + 2 * 256; // trilha 17 setor 3 (LSN 308)
    for (let e = 0; e < 8; e++) {
      const src = dirBase + e * 32;
      if (src + 16 <= out.length) out.copy(out, off + e * 32, src, src + 16);
    }
  }
  // entrada 0: grava o nome (bytes 0–7), null-padded; preserva o resto do catálogo.
  for (let i = 0; i < 8; i++) out[off + i] = i < nm.length ? nm.charCodeAt(i) : 0x00;
  return out;
}

/**
 * Formata uma imagem RS-DOS, retornando um NOVO buffer (a entrada não é mutada).
 *  - 'full'  : disco em branco INTEIRO = tudo 0xFF (como o DSKINI/DECB FORMAT — FAT livre, diretório
 *              vazio, dados apagados). Apaga TUDO.
 *  - 'quick' : só zera as REFERÊNCIAS — reseta a FAT (granules → 0xFF livres) e o diretório (entradas
 *              → 0xFF) na trilha 17; os DADOS dos granules permanecem (não-referenciados). Rápido.
 * Observação: NÃO toca a trilha 17 setor ~17 (LSN 322 — onde o SIDEKICK guarda o nome do drive), então
 * o 'quick' preserva o nome automaticamente; no 'full', o chamador restaura o setor do nome se desejar.
 */
export function formatRsDosDisk(dskBuffer: Buffer, mode: 'quick' | 'full'): Buffer {
  const BPT = 18 * 256; // 4608
  if (dskBuffer.length < 18 * BPT || dskBuffer.length % BPT !== 0) {
    throw new Error(`Imagem RS-DOS inválida para formatar: ${dskBuffer.length} bytes (esperado múltiplo de 4.608).`);
  }
  if (mode === 'full') return Buffer.alloc(dskBuffer.length, 0xFF);
  const tracks = dskBuffer.length / BPT;
  const totalGranules = (tracks - 1) * 2;
  const out = Buffer.from(dskBuffer);              // preserva os dados; reseta só FAT + diretório
  const fatOffset = 17 * BPT + 256;                // trilha 17, setor 2
  for (let g = 0; g < totalGranules; g++) out[fatOffset + g] = 0xFF; // granules livres
  out.fill(0xFF, 17 * BPT + 2 * 256, 17 * BPT + 11 * 256);           // diretório vazio (entradas 0xFF)
  return out;
}
