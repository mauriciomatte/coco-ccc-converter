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
}

export interface ParsedDsk {
  files: DskFileEntry[];
  fat: Buffer;
}

/**
 * Parses a standard TRS-80 Color Computer RS-DOS .DSK disk image.
 * Extracts the file directory and FAT chain maps.
 */
export function parseDsk(dskBuffer: Buffer): ParsedDsk {
  if (dskBuffer.length !== 161280) {
    throw new Error(`Invalid DSK image size: ${dskBuffer.length} bytes (Expected 161,280 bytes).`);
  }

  const track17Offset = 17 * 18 * 256; // 78,336
  const fatOffset = track17Offset + 256; // Track 17, Sector 2 (78,592)
  const fat = dskBuffer.slice(fatOffset, fatOffset + 256);

  const files: DskFileEntry[] = [];
  
  // RS-DOS directory sectors can extend from Sector 3 to Sector 18.
  // Sector 3 starts at track17Offset + 2 * 256 = 78,848.
  // Sector 18 ends at track17Offset + 18 * 256 = 82,944.
  const dirStartOffset = track17Offset + 2 * 256;
  const dirEndOffset = track17Offset + 18 * 256;

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

    while (currentGranule >= 0 && currentGranule < 68 && loopProtect < 100) {
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
      if (granuleChain.includes(nextGranule) || nextGranule < 0 || nextGranule >= 68) {
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
      index: entryIndex++
    });
  }

  return {
    files,
    fat
  };
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
