// DMK floppy-image support — READ-ONLY (de-DMK → raw sector image).
//
// DMK (David Keil's disk format) is a low-level, track-oriented image: instead of a clean
// dump of sector payloads (like .dsk/.os9/.vdk), it stores each track almost exactly as the
// FDC sees it — sync bytes, address marks, gaps and CRCs included. Many CoCo/NitrOS-9 and
// Dragon disks (and the OS-9 "blank disks" in our corpus) are distributed as DMK. Our disk
// parsers (RS-DOS, OS-9/RBF, Dragon) all expect a RAW sector image, so the job here is to
// DECODE a DMK back into that raw image; detection/parsing then proceeds unchanged.
//
// On-disk layout (all multi-byte fields are LITTLE-ENDIAN):
//
//   Disk header — 16 bytes
//     [0]      write-protect: 0xFF = protected, 0x00 = not
//     [1]      number of tracks (per side)
//     [2..3]   track length in bytes, INCLUDING the 128-byte IDAM table at the track start
//     [4]      option flags: bit4 (0x10) = single-sided; bit6 (0x40) = single-density only;
//              bit7 (0x80) = ignore density
//     [5..11]  reserved
//     [12..15] 0x00000000 (virtual disk) or 0x12345678 (image taken from a real drive)
//
//   Each track — `trackLen` bytes; tracks are stored head-interleaved:
//     (trk0,head0)(trk0,head1)(trk1,head0)… for a double-sided disk.
//     [0..127] IDAM table: 64 little-endian entries. Each entry:
//                bits 0..13  = byte offset of the sector's IDAM (0xFE) from the START of the
//                              track (i.e. including this 128-byte table)
//                bit 15 (0x8000) = 1 → double density (MFM); 0 → single density (FM)
//                0x0000          = empty slot
//     [128..]  the raw (FM/MFM) track bytes. A sector reads as:
//                A1 A1 A1 FE  trk side sec sizecode  crcHi crcLo   (the ID field)
//                …gap…  A1 A1 A1 (FB|F8)  data[128<<sizecode]  crcHi crcLo
//              In single density (FM) every track byte is stored TWICE; we step by 2 there.
//
// Validated byte-for-byte: de-DMK of the corpus DMKs (158K/180K SS, 360K/720K DS OS-9 blanks)
// reproduces the matching raw .OS9 images exactly. No third-party code is used; only the
// on-disk format (a non-copyrightable fact) is reimplemented here.

import { isSdf, sdfToRaw } from './sdf';

const DMK_HEADER = 16;
const IDAM_TABLE = 128;          // 64 entries × 2 bytes at the start of every track
const IDAM_COUNT = 64;
const ID_MARK = 0xfe;            // ID Address Mark
const DATA_MARK = 0xfb;          // normal Data Address Mark
const DELETED_MARK = 0xf8;       // deleted-data Address Mark (still copied; treated as data)
const SYNC = 0xa1;               // MFM sync byte preceding an address mark

function le16(buf: Buffer, off: number): number {
  return (buf[off] | (buf[off + 1] << 8)) >>> 0;
}
function le32(buf: Buffer, off: number): number {
  return (buf[off] + buf[off + 1] * 0x100 + buf[off + 2] * 0x10000 + buf[off + 3] * 0x1000000) >>> 0;
}

export interface DmkGeometry {
  tracks: number;       // tracks per side
  sides: number;        // 1 or 2
  sectorsPerTrack: number;
  sectorSize: number;   // bytes (CoCo standard = 256)
  firstSector: number;  // lowest sector id seen (usually 1)
  sectorsFound: number;    // sectors successfully decoded
  sectorsExpected: number; // tracks × sides × sectorsPerTrack — fewer found ⇒ damaged/short tracks
}

/**
 * Is `buf` a DMK image? Uses the header magic AND an EXACT size match
 * (16 + tracks × sides × trackLen) so a raw .dsk/.os9 never false-positives.
 */
export function isDmk(buf: Buffer): boolean {
  if (buf.length < DMK_HEADER + IDAM_TABLE + 256) return false;
  const wp = buf[0];
  if (wp !== 0x00 && wp !== 0xff) return false;
  const nTracks = buf[1];
  if (nTracks < 1 || nTracks > 96) return false;
  const trackLen = le16(buf, 2);
  if (trackLen < 0x0a00 || trackLen > 0x3fff) return false;   // ~2.5 KB .. 16 KB per track
  const magic = le32(buf, 12);
  if (magic !== 0x00000000 && magic !== 0x12345678) return false;
  // Decisive check: the file size must be exactly the header + every track image.
  for (const sides of [1, 2]) {
    if (buf.length === DMK_HEADER + nTracks * sides * trackLen) return true;
  }
  return false;
}

interface RawSector { track: number; side: number; sector: number; size: number; data: Buffer; }

/** Pull one sector out of a track image starting at its IDAM. Returns null on inconsistency. */
function readSector(buf: Buffer, idamPos: number, doubleDensity: boolean, trackEnd: number): RawSector | null {
  const step = doubleDensity ? 1 : 2;          // FM stores each byte twice
  if (buf[idamPos] !== ID_MARK) return null;
  const at = (n: number) => buf[idamPos + step * n];
  const track = at(1), side = at(2), sector = at(3), sizeCode = at(4);
  const size = 128 << (sizeCode & 0x03);
  // Find the Data Address Mark after the ID field (skip the 6-byte ID + a short gap).
  let p = idamPos + step * 7;
  const limit = Math.min(trackEnd, idamPos + step * 60);
  let dataStart = -1;
  for (; p < limit; p += step) {
    const b = buf[p];
    if ((b === DATA_MARK || b === DELETED_MARK) && (!doubleDensity || buf[p - step] === SYNC)) {
      dataStart = p + step;
      break;
    }
  }
  if (dataStart < 0) return null;
  const data = Buffer.alloc(size);
  for (let k = 0; k < size; k++) data[k] = buf[dataStart + k * step] ?? 0;
  return { track, side, sector, size, data };
}

/**
 * Decode a DMK image into a flat RAW sector image (the format the RS-DOS / OS-9 / Dragon
 * parsers consume). Sectors are placed by physical (track, head) and their recorded sector
 * id, so interleave is normalised. Returns the raw buffer and the detected geometry.
 */
export function dmkToRaw(buf: Buffer): { raw: Buffer; geom: DmkGeometry } {
  if (!isDmk(buf)) throw new Error('Não é uma imagem DMK válida.');
  const nTracks = buf[1];
  const trackLen = le16(buf, 2);
  const singleSided = (buf[4] & 0x10) !== 0;
  // Trust the size math over the flag: pick the side count that matches the file exactly.
  const sides = buf.length === DMK_HEADER + nTracks * 1 * trackLen ? 1 : (singleSided ? 1 : 2);

  const sectors: RawSector[] = [];
  let maxSector = 0, minSector = 255, sectorSize = 256;
  for (let ti = 0; ti < nTracks; ti++) {
    for (let hi = 0; hi < sides; hi++) {
      const trackBase = DMK_HEADER + (ti * sides + hi) * trackLen;
      const trackEnd = trackBase + trackLen;
      if (trackEnd > buf.length) break;
      for (let e = 0; e < IDAM_COUNT; e++) {
        const entry = le16(buf, trackBase + e * 2);
        if (entry === 0) continue;
        const doubleDensity = (entry & 0x8000) !== 0;
        const offset = entry & 0x3fff;
        const sec = readSector(buf, trackBase + offset, doubleDensity, trackEnd);
        if (!sec) continue;
        // Place by PHYSICAL position; the recorded sector id only orders within the track.
        sec.track = ti; sec.side = hi;
        sectors.push(sec);
        maxSector = Math.max(maxSector, sec.sector);
        minSector = Math.min(minSector, sec.sector);
        sectorSize = sec.size;
      }
    }
  }
  if (!sectors.length) throw new Error('DMK sem setores legíveis.');
  const firstSector = minSector <= maxSector ? minSector : 1;
  const sectorsPerTrack = maxSector - firstSector + 1;

  const raw = Buffer.alloc(nTracks * sides * sectorsPerTrack * sectorSize, 0);
  let placed = 0;
  for (const s of sectors) {
    const idx = s.sector - firstSector;
    if (idx < 0 || idx >= sectorsPerTrack) continue;       // stray/duplicate sector id → ignore
    const lsn = (s.track * sides + s.side) * sectorsPerTrack + idx;
    const pos = lsn * sectorSize;
    if (pos + s.size <= raw.length) { s.data.copy(raw, pos); placed++; }
  }
  const geom: DmkGeometry = {
    tracks: nTracks, sides, sectorsPerTrack, sectorSize, firstSector,
    sectorsFound: placed, sectorsExpected: nTracks * sides * sectorsPerTrack,
  };
  return { raw, geom };
}

/** Convenience: if `buf` is a track-level image (DMK or SDF), return its decoded raw sector image;
 *  otherwise return `buf` unchanged. SDF (CoCoSDC) is detected by its own 'SDF1' magic. */
export function normalizeDiskImage(buf: Buffer): Buffer {
  if (isDmk(buf)) return dmkToRaw(buf).raw;
  if (isSdf(buf)) return sdfToRaw(buf).raw;
  return buf;
}
