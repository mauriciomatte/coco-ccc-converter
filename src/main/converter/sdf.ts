// SDF (CoCoSDC Structured Disk Format) support — READ-ONLY (de-SDF → raw sector image).
//
// SDF is Darren Atkinson's disk-image format for the CoCoSDC SD-card floppy emulator, used for
// non-standard / copy-protected / mixed-density disks. It is effectively "pre-indexed DMK": each
// track carries a Sector ID Table in its header so the firmware locates sectors by table lookup
// instead of scanning a raw flux stream (the CoCoSDC's ATmega328 lacks the RAM to do the latter in
// real time). Like DMK, our job is to DECODE it into a flat RAW sector image so the existing
// RS-DOS / OS-9 (RBF) / Dragon parsers run unchanged.
//
// Spec validated byte-for-byte against a real sample (FHL Color FLEX 5.0.4, fhl_flex_5_0_4.SDF):
// header 'SDF1', 35 cyl, 1 side; track 0 = 10 FM sectors (256 B), as expected for FLEX.
//
// On-disk layout (multi-byte fields LITTLE-ENDIAN):
//
//   File header — 512 bytes
//     0x000  4   'SDF1' (ASCII) — signature
//     0x004  1   cylinders (max 80)
//     0x005  1   sides / heads (1 or 2)
//     0x006  1   write permission (0x00 = R/W, 0xFF = read-only)
//     0x007  1   nested-sectors flag (0x00 = no, 0x01 = yes; copy-protection decoding)
//     0x008..0x1FF  reserved (zero)
//     Total file size = 512 + (cylinders × sides × 6656).
//
//   Track record — 6656 bytes, in physical order: TrackIndex = cylinder × sides + side
//     0x0000..0x00FF (256)  Track Header
//        byte 0x00 : number of active Sector-ID entries
//        0x01..0x07: reserved (0)
//        0x08..0xFF: Sector ID Table — up to 31 entries × 8 bytes:
//           +0x00 u16 ID Field Offset   : bits0-13 = offset (from track-record start) to the ID
//                                         header; bit14 = single density (FM); bit15 = ID CRC error
//           +0x02 u16 Data Field Offset : bits0-13 = offset to the data field; bit14 = Deleted Data
//                                         Mark; bit15 = data CRC error
//           +0x04 u8  physical cylinder    +0x05 u8 physical side
//           +0x06 u8  logical sector (1..) +0x07 u8 size code (0=128,1=256,2=512,3=1024)
//     0x0100..0x1969 (6250) Raw Track Data (FM: each logical byte stored TWICE — step by 2)
//     0x196A..0x19FF (150)  padding (align to 512)
//
// No third-party code is used; only the on-disk format (a non-copyrightable fact) is reimplemented.

const FILE_HEADER = 512;
const TRACK_RECORD = 6656;
const TRACK_HEADER = 256;
const MAX_ENTRIES = 31;
const ENTRY_SIZE = 8;

function le16(buf: Buffer, off: number): number {
  return (buf[off] | (buf[off + 1] << 8)) >>> 0;
}

export interface SdfGeometry {
  cylinders: number;
  sides: number;
  sectorsPerTrack: number;
  sectorSize: number;
  firstSector: number;
  sectorsFound: number;
  sectorsExpected: number;
  protectedSectors: number; // sectors flagged with bad CRC or a deleted-data mark (copy protection)
}

/**
 * Is `buf` a CoCoSDC SDF image? Detected by the 'SDF1' magic AND an exact size match
 * (512 + cyl × sides × 6656) — never by file extension (`.sdf` clashes with the SAM Coupé format).
 */
export function isSdf(buf: Buffer): boolean {
  if (buf.length < FILE_HEADER + TRACK_RECORD) return false;
  if (buf[0] !== 0x53 || buf[1] !== 0x44 || buf[2] !== 0x46 || buf[3] !== 0x31) return false; // 'SDF1'
  const cyl = buf[4], sides = buf[5];
  if (cyl < 1 || cyl > 80 || sides < 1 || sides > 2) return false;
  return buf.length === FILE_HEADER + cyl * sides * TRACK_RECORD;
}

export interface SdfSector {
  cylinder: number; side: number; sector: number; size: number;
  fm: boolean; idCrcError: boolean; deleted: boolean; dataCrcError: boolean;
  data: Buffer;
}

/** Reads all sectors of one track record (by physical index). Skips empty/out-of-bounds entries. */
export function readSdfTrack(buf: Buffer, trackIndex: number): SdfSector[] {
  const recOff = FILE_HEADER + trackIndex * TRACK_RECORD;
  if (recOff + TRACK_RECORD > buf.length) return [];
  const count = Math.min(buf[recOff], MAX_ENTRIES);
  const out: SdfSector[] = [];
  for (let i = 0; i < count; i++) {
    const e = recOff + 8 + i * ENTRY_SIZE;
    const idRaw = le16(buf, e + 0);
    const dataRaw = le16(buf, e + 2);
    const fm = (idRaw & 0x4000) !== 0;
    const idCrcError = (idRaw & 0x8000) !== 0;
    const deleted = (dataRaw & 0x4000) !== 0;
    const dataCrcError = (dataRaw & 0x8000) !== 0;
    const dataOff = dataRaw & 0x3fff;
    const cylinder = buf[e + 4], side = buf[e + 5], sector = buf[e + 6];
    const size = 128 << (buf[e + 7] & 0x03);
    const step = fm ? 2 : 1; // FM stores each byte twice in the raw track buffer
    const start = recOff + dataOff;
    const data = Buffer.alloc(size);
    let ok = true;
    for (let k = 0; k < size; k++) {
      const p = start + k * step;
      if (p >= recOff + TRACK_RECORD || p >= buf.length) { ok = false; break; }
      data[k] = buf[p];
    }
    if (!ok && dataOff === 0) continue; // unwritten/placeholder entry
    out.push({ cylinder, side, sector, size, fm, idCrcError, deleted, dataCrcError, data });
  }
  return out;
}

/**
 * Decode an SDF image into a flat RAW sector image (the format the RS-DOS / OS-9 / Dragon parsers
 * consume). Sectors are placed by physical (cylinder, side) and recorded sector id, normalising
 * interleave — exactly like dmkToRaw. Uniform-geometry disks (e.g. an OS-9/RS-DOS disk stored as
 * SDF) produce a clean linear image; mixed-geometry/protected disks are still decoded sector-by-
 * sector and flagged via the returned geometry counters.
 */
export function sdfToRaw(buf: Buffer): { raw: Buffer; geom: SdfGeometry } {
  if (!isSdf(buf)) throw new Error('Não é uma imagem SDF (CoCoSDC) válida.');
  const cylinders = buf[4], sides = buf[5];
  const sectors: SdfSector[] = [];
  let minSector = 255, maxSector = 0, sectorSize = 256, protectedCount = 0;
  for (let cyl = 0; cyl < cylinders; cyl++) {
    for (let side = 0; side < sides; side++) {
      const trackIndex = cyl * sides + side;
      for (const s of readSdfTrack(buf, trackIndex)) {
        // place by PHYSICAL position; the recorded id only orders within the track
        s.cylinder = cyl; s.side = side;
        sectors.push(s);
        minSector = Math.min(minSector, s.sector);
        maxSector = Math.max(maxSector, s.sector);
        sectorSize = s.size;
        if (s.deleted || s.dataCrcError || s.idCrcError) protectedCount++;
      }
    }
  }
  if (!sectors.length) throw new Error('SDF sem setores legíveis.');
  const firstSector = minSector <= maxSector ? minSector : 1;
  const sectorsPerTrack = maxSector - firstSector + 1;

  const raw = Buffer.alloc(cylinders * sides * sectorsPerTrack * sectorSize, 0);
  let placed = 0;
  for (const s of sectors) {
    const idx = s.sector - firstSector;
    if (idx < 0 || idx >= sectorsPerTrack) continue;
    const lsn = (s.cylinder * sides + s.side) * sectorsPerTrack + idx;
    const pos = lsn * sectorSize;
    if (s.size === sectorSize && pos + s.size <= raw.length) { s.data.copy(raw, pos); placed++; }
  }
  const geom: SdfGeometry = {
    cylinders, sides, sectorsPerTrack, sectorSize, firstSector,
    sectorsFound: placed, sectorsExpected: cylinders * sides * sectorsPerTrack,
    protectedSectors: protectedCount,
  };
  return { raw, geom };
}

// =============================================================================
//  SDF WRITE ENGINE — encode a flat RAW sector image into a CoCoSDC SDF file.
//  Builds standard MFM (double-density) tracks whose byte layout matches a real SDF
//  (FHL FLEX 5.0.4 sample), so the result is readable by the real CoCoSDC firmware:
//  per sector  A1 A1 A1 FE <cyl side sec size> CRC  gap(22×4E,12×00)  A1 A1 A1 FB <data> CRC  gap.
//  The Sector ID Table points at the ID content (after FE) and the data content (after FB).
//  Standard OS-9/RS-DOS/Dragon disks are uniform MFM 256-byte sectors → encode cleanly. (FM /
//  copy-protected layouts are not generated; SDF reading still handles them.)
// =============================================================================

const GAP_BYTE = 0x4e, SYNC0 = 0x00, A1 = 0xa1, FE = 0xfe, FB = 0xfb, IAM = 0xfc, C2 = 0xc2;
const SEC_UNIT = 340; // bytes per MFM sector in the track (for 256-byte sectors)

/** WD279x CRC-CCITT (poly 0x1021, init 0xFFFF), computed over [start,end) including the A1 sync. */
function crc16(buf: Buffer, start: number, end: number): number {
  let crc = 0xffff;
  for (let i = start; i < end; i++) {
    crc ^= buf[i] << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc & 0xffff;
}

export interface SdfEncodeGeom { sectorsPerTrack: number; sides: number; sectorSize?: number; firstSector?: number; writeProtect?: boolean; }

/** Encode a raw sector image (LSN order) into an SDF (CoCoSDC) buffer. Uniform MFM geometry only. */
export function rawToSdf(raw: Buffer, geom: SdfEncodeGeom): Buffer {
  const spt = geom.sectorsPerTrack, sides = geom.sides, secSize = geom.sectorSize ?? 256, first = geom.firstSector ?? 1;
  if (secSize !== 256) throw new Error('rawToSdf: só setores de 256 bytes (geometria padrão CoCo) são suportados.');
  const unit = SEC_UNIT;
  const sizeCode = Math.log2(secSize / 128) | 0; // 256 → 1
  const bytesPerTrack = spt * secSize;
  if (raw.length % bytesPerTrack !== 0) throw new Error('rawToSdf: tamanho do disco não casa com a geometria informada.');
  const cylinders = raw.length / (bytesPerTrack * sides);
  if (!Number.isInteger(cylinders) || cylinders < 1 || cylinders > 80) throw new Error('rawToSdf: nº de cilindros inválido p/ a geometria.');
  if (8 + spt * ENTRY_SIZE > TRACK_HEADER) throw new Error('rawToSdf: setores demais por trilha para a tabela (máx. 31).');

  const out = Buffer.alloc(FILE_HEADER + cylinders * sides * TRACK_RECORD, 0);
  out.write('SDF1', 0, 'latin1');
  out[4] = cylinders; out[5] = sides; out[6] = geom.writeProtect ? 0xff : 0x00; out[7] = 0x00; // header

  // leading gap (86 B): 20×4E, 12×00, C2C2C2FC (IAM), 38×4E, 12×00 (sync p/ o 1º setor)
  const writeLeading = (recOff: number) => {
    let p = recOff + TRACK_HEADER; // raw track data start (0x100)
    out.fill(GAP_BYTE, p, p + 20); p += 20;
    out.fill(SYNC0, p, p + 12); p += 12;
    out[p++] = C2; out[p++] = C2; out[p++] = C2; out[p++] = IAM;
    out.fill(GAP_BYTE, p, p + 38); p += 38;
    out.fill(SYNC0, p, p + 12); p += 12;
    return p - recOff; // offset (within record) of the first sector's A1
  };

  for (let cyl = 0; cyl < cylinders; cyl++) {
    for (let side = 0; side < sides; side++) {
      const trackIndex = cyl * sides + side;
      const recOff = FILE_HEADER + trackIndex * TRACK_RECORD;
      out[recOff] = spt; // Info Record: active sector count
      // fill the whole track-data region with the gap byte first (so trailing gap is 4E)
      out.fill(GAP_BYTE, recOff + TRACK_HEADER, recOff + TRACK_HEADER + 6250);
      let base = recOff + writeLeading(recOff); // base = offset of first A1 (absolute)
      for (let p = 0; p < spt; p++) {
        const sec = first + p;
        const lsn = trackIndex * spt + p;
        const dataSrc = lsn * secSize;
        // --- ID field ---
        out[base] = A1; out[base + 1] = A1; out[base + 2] = A1; out[base + 3] = FE;
        out[base + 4] = cyl; out[base + 5] = side; out[base + 6] = sec; out[base + 7] = sizeCode;
        const idc = crc16(out, base, base + 8); out[base + 8] = idc >> 8; out[base + 9] = idc & 0xff;
        out.fill(GAP_BYTE, base + 10, base + 32); out.fill(SYNC0, base + 32, base + 44);
        // --- DATA field ---
        const ds = base + 44;
        out[ds] = A1; out[ds + 1] = A1; out[ds + 2] = A1; out[ds + 3] = FB;
        if (dataSrc + secSize <= raw.length) raw.copy(out, ds + 4, dataSrc, dataSrc + secSize);
        const dc = crc16(out, ds, ds + 4 + secSize);
        out[ds + 4 + secSize] = dc >> 8; out[ds + 4 + secSize + 1] = dc & 0xff;
        out.fill(GAP_BYTE, ds + 6 + secSize, ds + 6 + secSize + 22); out.fill(SYNC0, ds + 6 + secSize + 22, ds + 6 + secSize + 34);
        // --- Sector ID Table entry ---
        const e = recOff + 8 + p * ENTRY_SIZE;
        const idOff = (base + 4) - recOff, dataOff = (ds + 4) - recOff; // offsets relative to record start
        out[e] = idOff & 0xff; out[e + 1] = (idOff >> 8) & 0x3f;        // MFM (bit14=0), no CRC err
        out[e + 2] = dataOff & 0xff; out[e + 3] = (dataOff >> 8) & 0x3f;
        out[e + 4] = cyl; out[e + 5] = side; out[e + 6] = sec; out[e + 7] = sizeCode;
        base += unit;
      }
    }
  }
  return out;
}
