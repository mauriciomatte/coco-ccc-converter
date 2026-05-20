export interface BootstrapConfig {
  targetRamLoadAddr: number;
  targetRamExecAddr: number;
  payloadSize: number;
  useTwoStage: boolean;
  useDragonHeader: boolean;
  cartridgeSizeKb: number; // 8, 16, 32
  fillerByte: number; // usually 0xFF
}

export interface CompiledCartridge {
  romBuffer: Buffer;
  loaderSize: number;
  payloadRomOffset: number;
}

/**
 * Compiles a custom 6809E assembly bootstrap loader and prepends it to the game payload.
 * Generates an EPROM-ready .ccc cartridge image padded to the specified target size.
 */
export function compileBootstrap(payload: Buffer, config: BootstrapConfig): CompiledCartridge {
  const {
    targetRamLoadAddr,
    targetRamExecAddr,
    useTwoStage,
    useDragonHeader,
    cartridgeSizeKb,
    fillerByte
  } = config;

  const targetSizeBytes = cartridgeSizeKb * 1024;
  
  let loaderBytes: number[] = [];
  let payloadRomOffset = 0;

  if (useDragonHeader) {
    // Add Dragon 32/64 Compatibility Header: 'D', 'K', followed by execution vector
    // 'D', 'K' at $C000-$C001, and the boot vector pointing to $C004 at $C002-$C003
    loaderBytes.push(0x44, 0x4B); // 'D', 'K'
    loaderBytes.push(0xC0, 0x04); // boot vector pointing to $C004
  } else {
    // Standard CoCo cartridge start vector (normally still uses 'DK' signature for Color BASIC autostart)
    loaderBytes.push(0x44, 0x4B); // 'D', 'K'
    loaderBytes.push(0xC0, 0x04); // boot vector
  }

  if (!useTwoStage) {
    // --- SINGLE-STAGE BOOTSTRAP LOADER ---
    // Copies payload directly from ROM to RAM, masks interrupts, and jumps to execution address.
    // Size of this stage loader is 23 bytes.
    // ROM payload starts immediately after the loader: $C000 + 4 (header) + 23 (loader) = $C01B.
    const loaderSize = 23;
    const romPayloadStart = 0xC000 + 4 + loaderSize;
    const romPayloadEnd = romPayloadStart + payload.length;

    // ORCC #$50 (Disable interrupts)
    loaderBytes.push(0x1A, 0x50);
    
    // LDX #ROM_PAYLOAD_START
    loaderBytes.push(0xCE);
    loaderBytes.push((romPayloadStart >> 8) & 0xFF, romPayloadStart & 0xFF);
    
    // LDY #RAM_DEST
    loaderBytes.push(0x10, 0xCE);
    loaderBytes.push((targetRamLoadAddr >> 8) & 0xFF, targetRamLoadAddr & 0xFF);

    // COPY:
    // LDA ,X+ (Read byte from ROM)
    loaderBytes.push(0xA6, 0x80);
    // STA ,Y+ (Write byte to RAM)
    loaderBytes.push(0xA7, 0x88);
    // CMPX #ROM_PAYLOAD_END
    loaderBytes.push(0x8C);
    loaderBytes.push((romPayloadEnd >> 8) & 0xFF, romPayloadEnd & 0xFF);
    // BNE COPY (offset -9 bytes => 0xF7)
    loaderBytes.push(0x26, 0xF7);

    // ANDCC #$AF (Restore interrupts)
    loaderBytes.push(0x1C, 0xAF);

    // JMP EXEC_ADDR
    loaderBytes.push(0x7E);
    loaderBytes.push((targetRamExecAddr >> 8) & 0xFF, targetRamExecAddr & 0xFF);

    payloadRomOffset = 4 + loaderSize;
  } else {
    // --- TWO-STAGE BOOTSTRAP LOADER (All-RAM Mode) ---
    // First stage (at $C004) copies the copying subroutine to low safe RAM ($0600) and jumps there.
    // First stage loader is 21 bytes.
    // Subroutine payload (30 bytes) starts at $C019.
    // Game payload starts at $C000 + 4 (header) + 21 (first stage) + 30 (subroutine) = $C037.
    const firstStageSize = 21;
    const subSize = 30;
    
    const subRomStart = 0xC000 + 4 + firstStageSize;
    const subRomEnd = subRomStart + subSize;

    const romPayloadStart = subRomEnd;
    const romPayloadEnd = romPayloadStart + payload.length;

    // --- First Stage Boot Loader ---
    // ORCC #$50
    loaderBytes.push(0x1A, 0x50);
    // LDX #SUB_ROM_START
    loaderBytes.push(0xCE);
    loaderBytes.push((subRomStart >> 8) & 0xFF, subRomStart & 0xFF);
    // LDY #$0600 (Copy subroutine to low RAM $0600)
    loaderBytes.push(0x10, 0xCE, 0x06, 0x00);
    // COPY_SUB: LDA ,X+
    loaderBytes.push(0xA6, 0x80);
    // STA ,Y+
    loaderBytes.push(0xA7, 0x88);
    // CMPX #SUB_ROM_END
    loaderBytes.push(0x8C);
    loaderBytes.push((subRomEnd >> 8) & 0xFF, subRomEnd & 0xFF);
    // BNE COPY_SUB (offset -9 bytes => 0xF7)
    loaderBytes.push(0x26, 0xF7);
    // JMP $0600
    loaderBytes.push(0x7E, 0x06, 0x00);

    // --- Second Stage Subroutine Bytes (30 bytes total) ---
    // This is copied down to RAM $0600 and executed there
    const subBytes: number[] = [];
    
    // ORCC #$50
    subBytes.push(0x1A, 0x50);
    // LDX #ROM_PAYLOAD_START
    subBytes.push(0xCE);
    subBytes.push((romPayloadStart >> 8) & 0xFF, romPayloadStart & 0xFF);
    // LDY #RAM_DEST
    subBytes.push(0x10, 0xCE);
    subBytes.push((targetRamLoadAddr >> 8) & 0xFF, targetRamLoadAddr & 0xFF);
    // COPY: STA $FFDE (Switch to ROM map to read)
    subBytes.push(0xB7, 0xFF, 0xDE);
    // LDA ,X+ (Read byte from ROM)
    subBytes.push(0xA6, 0x80);
    // STA $FFDF (Switch to RAM map to write)
    subBytes.push(0xB7, 0xFF, 0xDF);
    // STA ,Y+ (Write byte to RAM)
    subBytes.push(0xA7, 0x88);
    // CMPX #ROM_PAYLOAD_END
    subBytes.push(0x8C);
    subBytes.push((romPayloadEnd >> 8) & 0xFF, romPayloadEnd & 0xFF);
    // BNE COPY (offset -15 bytes => 0xF1)
    subBytes.push(0x26, 0xF1);
    // STA $FFDF (Ensure RAM map remains active)
    subBytes.push(0xB7, 0xFF, 0xDF);
    // JMP EXEC_ADDR
    subBytes.push(0x7E);
    subBytes.push((targetRamExecAddr >> 8) & 0xFF, targetRamExecAddr & 0xFF);

    // Push subroutine bytes into main loader
    loaderBytes.push(...subBytes);

    payloadRomOffset = 4 + firstStageSize + subSize;
  }

  // Combine loader + payload
  const loaderBuffer = Buffer.from(loaderBytes);
  const totalNeededSize = loaderBuffer.length + payload.length;

  if (totalNeededSize > targetSizeBytes) {
    throw new Error(
      `Payload + Loader size (${totalNeededSize} bytes) exceeds target EPROM size (${targetSizeBytes} bytes). Please select a larger cartridge size.`
    );
  }

  const romBuffer = Buffer.alloc(targetSizeBytes, fillerByte);
  loaderBuffer.copy(romBuffer, 0);
  payload.copy(romBuffer, loaderBuffer.length);

  return {
    romBuffer,
    loaderSize: loaderBuffer.length,
    payloadRomOffset
  };
}
