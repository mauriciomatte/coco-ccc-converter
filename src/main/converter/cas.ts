export interface CasBlock {
  type: number;
  typeName: string;
  length: number;
  payload: Buffer;
  checksum: number;
  checksumValid: boolean;
}

export interface ParsedCas {
  name: string;
  fileType: number; // 0=BASIC, 1=Data, 2=Machine Code
  asciiFlag: number; // 0=Binary, 0xFF=ASCII
  loadAddr: number;
  execAddr: number;
  payload: Buffer;
  blocks: CasBlock[];
}

/**
 * Parses CoCo CAS cassette byte stream into game components.
 */
export function parseCas(casBuffer: Buffer): ParsedCas {
  let offset = 0;
  const blocks: CasBlock[] = [];
  let name = 'UNKNOWN';
  let fileType = 2; // Default to Machine Code
  let asciiFlag = 0;
  let loadAddr = 0x1000; // Default CoCo RAM start
  let execAddr = 0x1000;
  
  const payloadChunks: Buffer[] = [];

  while (offset < casBuffer.length) {
    const syncIndex = casBuffer.indexOf(0x3C, offset);
    if (syncIndex === -1) {
      break;
    }

    // Attempt to parse block starting after sync byte
    if (syncIndex + 3 > casBuffer.length) {
      break; // Truncated block header
    }

    const blockType = casBuffer[syncIndex + 1];
    const length = casBuffer[syncIndex + 2];
    const headerSize = 3;

    if (syncIndex + headerSize + length + 1 > casBuffer.length) {
      // Not enough bytes for this block, might be false sync. Skip 1 and try again.
      offset = syncIndex + 1;
      continue;
    }

    const payload = casBuffer.slice(syncIndex + headerSize, syncIndex + headerSize + length);
    const checksum = casBuffer[syncIndex + headerSize + length];

    // Verify checksum: sum of blockType + length + payload bytes, mod 256
    let sum = blockType + length;
    for (let i = 0; i < payload.length; i++) {
      sum += payload[i];
    }
    sum &= 0xFF;

    const checksumValid = (sum === checksum);

    if (!checksumValid) {
      // False sync or corrupted block. Skip sync byte and retry.
      offset = syncIndex + 1;
      continue;
    }

    // Checksum is valid, register block!
    let typeName = 'Unknown';
    if (blockType === 0x00) {
      typeName = 'Namefile';
      if (length >= 15) {
        name = payload.slice(0, 8).toString('ascii').trim();
        fileType = payload[8];
        asciiFlag = payload[9];
        // Read big endian 16-bit addresses
        loadAddr = payload.readUInt16BE(11);
        execAddr = payload.readUInt16BE(13);
      }
    } else if (blockType === 0x01) {
      typeName = 'Data';
      payloadChunks.push(payload);
    } else if (blockType === 0xFF) {
      typeName = 'EOF';
    }

    blocks.push({
      type: blockType,
      typeName,
      length,
      payload,
      checksum,
      checksumValid
    });

    // Advance offset past the parsed block
    offset = syncIndex + headerSize + length + 1;

    if (blockType === 0xFF) {
      // EOF block processed, we can stop
      break;
    }
  }

  return {
    name,
    fileType,
    asciiFlag,
    loadAddr,
    execAddr,
    payload: Buffer.concat(payloadChunks),
    blocks
  };
}
