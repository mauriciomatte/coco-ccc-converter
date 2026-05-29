export interface CasBlock {
  type: number;
  typeName: string;
  length: number;
  payload: Buffer;
  checksum: number;
  checksumValid: boolean;
}

export interface CasFile {
  name: string;
  fileType: number; // 0=BASIC, 1=Data, 2=Machine Code
  fileTypeName: string;
  asciiFlag: number; // 0=Binary, 0xFF=ASCII
  loadAddr: number;
  execAddr: number;
  payload: Buffer;
  blocks: CasBlock[];
}

export interface ParsedCas {
  // Primary file (backward-compatible top-level fields): first machine-code file, else first file.
  name: string;
  fileType: number;
  asciiFlag: number;
  loadAddr: number;
  execAddr: number;
  payload: Buffer;
  blocks: CasBlock[]; // ALL blocks across the whole tape
  files: CasFile[]; // every file found on the tape (a tape may hold several)
}

function fileTypeName(t: number): string {
  if (t === 0) return 'BASIC';
  if (t === 1) return 'Data';
  if (t === 2) return 'Machine Code';
  return 'Unknown';
}

interface FileAccumulator {
  name: string;
  fileType: number;
  asciiFlag: number;
  loadAddr: number;
  execAddr: number;
  chunks: Buffer[];
  blocks: CasBlock[];
}

/**
 * Parses a CoCo CAS cassette byte stream. A tape may contain MULTIPLE files
 * (namefile + data blocks + EOF, repeated). Each file is returned in `files`;
 * the top-level fields point at the primary (first machine-code) file for
 * backward compatibility.
 */
export function parseCas(casBuffer: Buffer): ParsedCas {
  let offset = 0;
  const allBlocks: CasBlock[] = [];
  const files: FileAccumulator[] = [];
  let current: FileAccumulator | null = null;

  const startFile = (init?: Partial<FileAccumulator>): FileAccumulator => {
    const f: FileAccumulator = {
      name: 'UNKNOWN',
      fileType: 2,
      asciiFlag: 0,
      loadAddr: 0x1000,
      execAddr: 0x1000,
      chunks: [],
      blocks: [],
      ...init
    };
    files.push(f);
    return f;
  };

  while (offset < casBuffer.length) {
    const syncIndex = casBuffer.indexOf(0x3C, offset);
    if (syncIndex === -1) break;
    if (syncIndex + 3 > casBuffer.length) break; // truncated header

    const blockType = casBuffer[syncIndex + 1];
    const length = casBuffer[syncIndex + 2];
    const headerSize = 3;

    if (syncIndex + headerSize + length + 1 > casBuffer.length) {
      // Not enough bytes for this block; likely false sync. Skip one byte and retry.
      offset = syncIndex + 1;
      continue;
    }

    const payload = casBuffer.slice(syncIndex + headerSize, syncIndex + headerSize + length);
    const checksum = casBuffer[syncIndex + headerSize + length];

    // Checksum: (blockType + length + payload bytes) mod 256
    let sum = blockType + length;
    for (let i = 0; i < payload.length; i++) sum += payload[i];
    sum &= 0xFF;
    const checksumValid = sum === checksum;

    if (!checksumValid) {
      // False sync or corrupted block. Skip the sync byte and retry.
      offset = syncIndex + 1;
      continue;
    }

    let typeName = 'Unknown';
    if (blockType === 0x00) {
      typeName = 'Namefile';
    } else if (blockType === 0x01) {
      typeName = 'Data';
    } else if (blockType === 0xFF) {
      typeName = 'EOF';
    }

    const block: CasBlock = { type: blockType, typeName, length, payload, checksum, checksumValid };
    allBlocks.push(block);

    if (blockType === 0x00) {
      // Namefile -> begin a new file on the tape.
      current = startFile({ blocks: [block] });
      if (length >= 15) {
        current.name = payload.slice(0, 8).toString('ascii').trim();
        current.fileType = payload[8];
        current.asciiFlag = payload[9];
        // CoCo namefile order: EXEC (transfer) address at 11-12, LOAD address at 13-14.
        current.execAddr = payload.readUInt16BE(11);
        current.loadAddr = payload.readUInt16BE(13);
      }
    } else if (blockType === 0x01) {
      // Data -> append to the current file (or start an anonymous one if none yet).
      if (!current) current = startFile();
      current.chunks.push(payload);
      current.blocks.push(block);
    } else if (blockType === 0xFF) {
      // EOF -> close the current file but KEEP scanning for more files on the tape.
      if (current) current.blocks.push(block);
      current = null;
    }

    offset = syncIndex + headerSize + length + 1;
  }

  const built: CasFile[] = files.map(f => ({
    name: f.name,
    fileType: f.fileType,
    fileTypeName: fileTypeName(f.fileType),
    asciiFlag: f.asciiFlag,
    loadAddr: f.loadAddr,
    execAddr: f.execAddr,
    payload: Buffer.concat(f.chunks),
    blocks: f.blocks
  }));

  const primary = built.find(f => f.fileType === 2) || built[0];

  return {
    name: primary?.name ?? 'UNKNOWN',
    fileType: primary?.fileType ?? 2,
    asciiFlag: primary?.asciiFlag ?? 0,
    loadAddr: primary?.loadAddr ?? 0x1000,
    execAddr: primary?.execAddr ?? 0x1000,
    payload: primary?.payload ?? Buffer.alloc(0),
    blocks: allBlocks,
    files: built
  };
}
