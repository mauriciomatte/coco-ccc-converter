export interface BinSegment {
  type: 0x00 | 0xFF;
  length: number;
  loadAddr: number;
  data: Buffer;
}

export interface ParsedBin {
  segments: BinSegment[];
  loadAddr: number;
  execAddr: number;
  payload: Buffer; // Contiguous payload from loadAddr to maxAddr (with gaps filled)
  totalPayloadSize: number;
  gapBytes: number; // filler bytes inserted to bridge non-contiguous segments
}

/**
 * Parses CoCo BIN (LOADM format) files containing data segments and execution postamble.
 */
export function parseBin(binBuffer: Buffer, fillerByte: number = 0xFF): ParsedBin {
  let offset = 0;
  const segments: BinSegment[] = [];
  let execAddr = 0x1000;
  let minLoadAddr = 0xFFFF;
  let maxEndAddr = 0;

  while (offset < binBuffer.length) {
    if (offset >= binBuffer.length) break;

    const blockType = binBuffer[offset];
    if (blockType === 0x00) {
      // Data Segment
      if (offset + 5 > binBuffer.length) {
        throw new Error(`Truncated BIN segment header at offset ${offset}`);
      }
      const length = binBuffer.readUInt16BE(offset + 1);
      const loadAddr = binBuffer.readUInt16BE(offset + 3);
      offset += 5;

      if (offset + length > binBuffer.length) {
        throw new Error(`Truncated BIN segment data at offset ${offset}. Expected ${length} bytes.`);
      }

      const data = binBuffer.slice(offset, offset + length);
      offset += length;

      segments.push({
        type: 0x00,
        length,
        loadAddr,
        data
      });

      if (loadAddr < minLoadAddr) {
        minLoadAddr = loadAddr;
      }
      if (loadAddr + length > maxEndAddr) {
        maxEndAddr = loadAddr + length;
      }
    } else if (blockType === 0xFF) {
      // Postamble
      if (offset + 5 > binBuffer.length) {
        throw new Error(`Truncated BIN postamble at offset ${offset}`);
      }
      const length = binBuffer.readUInt16BE(offset + 1);
      execAddr = binBuffer.readUInt16BE(offset + 3);
      offset += 5;

      segments.push({
        type: 0xFF,
        length,
        loadAddr: execAddr,
        data: Buffer.alloc(0)
      });
      break; // Stop parsing after postamble
    } else {
      // Sometimes there are trailing zeros or garbage before a segment.
      // If we see an invalid byte, we try to scan forward for a 0x00 or 0xFF.
      offset++;
    }
  }

  if (segments.length === 0) {
    throw new Error('No valid LOADM segments found in BIN file.');
  }

  // If minLoadAddr was not updated (e.g. only postamble found)
  if (minLoadAddr === 0xFFFF) {
    minLoadAddr = execAddr;
    maxEndAddr = execAddr;
  }

  // Construct a contiguous payload buffer mapping segments to memory positions
  const totalSize = maxEndAddr - minLoadAddr;
  const payload = Buffer.alloc(totalSize, fillerByte);

  let dataBytes = 0;
  for (const seg of segments) {
    if (seg.type === 0x00) {
      const targetOffset = seg.loadAddr - minLoadAddr;
      seg.data.copy(payload, targetOffset);
      dataBytes += seg.data.length;
    }
  }

  return {
    segments,
    loadAddr: minLoadAddr,
    execAddr,
    payload,
    totalPayloadSize: totalSize,
    gapBytes: Math.max(0, totalSize - dataBytes)
  };
}
