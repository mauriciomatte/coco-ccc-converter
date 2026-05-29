export interface BootstrapConfig {
  targetRamLoadAddr: number;
  targetRamExecAddr: number;
  payloadSize: number;
  useTwoStage: boolean;
  cartridgeSizeKb: number; // physical EPROM size: 4, 8, 16, 32, 64
  fillerByte: number; // usually 0xFF
  customLoaderBytes?: Uint8Array; // allow injecting custom modified hex
  // Emulator mode: ignore CoCoEPROMpak physical constraints (no chip-size rounding,
  // no bank mirroring). Emits an exact-size image (loader+payload) for use with -cart
  // in XRoar/MAME. The 16K cartridge window ($C000-$FEFF) still applies (it is the CoCo).
  emulatorMode?: boolean;
}

export interface CompiledCartridge {
  romBuffer: Buffer;
  loaderSize: number;
  payloadRomOffset: number;
  numBanks: number;
  bankUsableBytes: number;
}

// --- CoCoEPROMpak hardware constraints ---
// The CoCo cartridge window decodes ROM only at $C000-$FEFF (16,128 bytes).
// $FF00-$FFFF is I/O / vector space and is NEVER visible as cartridge ROM.
// On the board, EPROMs larger than 16K are split into 16K banks selected by
// jumper (no software bank-switch register); the CoCo only ever sees one bank.
const CART_BASE = 0xC000;
const CART_WINDOW_END = 0xFEFF;
const BANK_USABLE_BYTES = CART_WINDOW_END - CART_BASE + 1; // 16,128 ($3F00)
const BANK_PHYSICAL_BYTES = 0x4000; // 16K per physical EPROM bank

/**
 * Compiles a custom 6809E assembly bootstrap loader and prepends it to the game payload.
 * Generates an EPROM-ready .ccc cartridge image padded to the specified target size.
 *
 * The output respects the CoCoEPROMpak's 16K bank model: a single program must fit in
 * one bank ($C000-$FEFF, 16,128 usable bytes). For EPROMs larger than 16K the 16K bank
 * image is mirrored into every bank so the program autostarts regardless of jumper position.
 */
export function compileBootstrap(payload: Buffer, config: BootstrapConfig): CompiledCartridge {
  const {
    targetRamLoadAddr,
    targetRamExecAddr,
    useTwoStage,
    cartridgeSizeKb,
    fillerByte
  } = config;

  const chipBytes = cartridgeSizeKb * 1024;

  let loaderBytes: number[] = [];
  let payloadRomOffset = 0;

  // --- Cartridge entry point ---
  // Real Tandy autostart Program Paks (verified against 7 commercial .ccc dumps in amostras/,
  // e.g. Canyon Climber, Quasar, Polaris) begin with EXECUTABLE 6809 code directly at $C000
  // and contain NO signature. The CoCo enters the cartridge at $C000 via the cartridge FIRQ
  // (CART line / board jumper JP1) — it does not read a 'DK' signature and does not jump to
  // $C002. So the loader code always starts at $C000.
  const loaderBase = CART_BASE; // absolute address where loader code starts

  if (config.customLoaderBytes && config.customLoaderBytes.length > 0) {
    // --- CUSTOM BOOTSTRAP LOADER ---
    // User provided a custom hex injection for the bootstrap.
    loaderBytes.push(...Array.from(config.customLoaderBytes));
    payloadRomOffset = config.customLoaderBytes.length;
  } else if (!useTwoStage) {
    // --- SINGLE-STAGE BOOTSTRAP LOADER ---
    // Copies payload directly from ROM to RAM, masks interrupts, and jumps to execution address.
    // Size of this stage loader is 23 bytes; payload follows immediately after.
    const loaderSize = 23;
    const romPayloadStart = loaderBase + loaderSize;
    const romPayloadEnd = romPayloadStart + payload.length;

    // ORCC #$50 (Disable interrupts)
    loaderBytes.push(0x1A, 0x50);

    // LDX #ROM_PAYLOAD_START  (8E = LDX immediate)
    loaderBytes.push(0x8E);
    loaderBytes.push((romPayloadStart >> 8) & 0xFF, romPayloadStart & 0xFF);

    // LDY #RAM_DEST  (10 8E = LDY immediate)
    loaderBytes.push(0x10, 0x8E);
    loaderBytes.push((targetRamLoadAddr >> 8) & 0xFF, targetRamLoadAddr & 0xFF);

    // COPY:
    // LDA ,X+ (Read byte from ROM)
    loaderBytes.push(0xA6, 0x80);
    // STA ,Y+ (Write byte to RAM)
    loaderBytes.push(0xA7, 0xA0);
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

    payloadRomOffset = loaderSize;
  } else {
    // --- TWO-STAGE BOOTSTRAP LOADER (All-RAM Mode) ---
    // First stage (at loaderBase) copies the copying subroutine to low safe RAM ($0600) and jumps there.
    // First stage loader is 21 bytes; subroutine payload (30 bytes) follows; game payload follows that.
    const firstStageSize = 21;
    const subSize = 30;

    const subRomStart = loaderBase + firstStageSize;
    const subRomEnd = subRomStart + subSize;

    const romPayloadStart = subRomEnd;
    const romPayloadEnd = romPayloadStart + payload.length;

    // --- First Stage Boot Loader ---
    // ORCC #$50
    loaderBytes.push(0x1A, 0x50);
    // LDX #SUB_ROM_START  (8E = LDX immediate)
    loaderBytes.push(0x8E);
    loaderBytes.push((subRomStart >> 8) & 0xFF, subRomStart & 0xFF);
    // LDY #$0600 (Copy subroutine to low RAM $0600)  (10 8E = LDY immediate)
    loaderBytes.push(0x10, 0x8E, 0x06, 0x00);
    // COPY_SUB: LDA ,X+
    loaderBytes.push(0xA6, 0x80);
    // STA ,Y+
    loaderBytes.push(0xA7, 0xA0);
    // CMPX #SUB_ROM_END
    loaderBytes.push(0x8C);
    loaderBytes.push((subRomEnd >> 8) & 0xFF, subRomEnd & 0xFF);
    // BNE COPY_SUB (offset -9 bytes => 0xF7)
    loaderBytes.push(0x26, 0xF7);
    // JMP $0600
    loaderBytes.push(0x7E, 0x06, 0x00);

    // --- Second Stage Subroutine Bytes (30 bytes total) ---
    // This is copied down to RAM $0600 and executed there.
    const subBytes: number[] = [];

    // ORCC #$50
    subBytes.push(0x1A, 0x50);
    // LDX #ROM_PAYLOAD_START  (8E = LDX immediate)
    subBytes.push(0x8E);
    subBytes.push((romPayloadStart >> 8) & 0xFF, romPayloadStart & 0xFF);
    // LDY #RAM_DEST  (10 8E = LDY immediate)
    subBytes.push(0x10, 0x8E);
    subBytes.push((targetRamLoadAddr >> 8) & 0xFF, targetRamLoadAddr & 0xFF);
    // COPY: STA $FFDE (Switch to ROM map to read)
    subBytes.push(0xB7, 0xFF, 0xDE);
    // LDA ,X+ (Read byte from ROM)
    subBytes.push(0xA6, 0x80);
    // STA $FFDF (Switch to RAM map to write)
    subBytes.push(0xB7, 0xFF, 0xDF);
    // STA ,Y+ (Write byte to RAM)
    subBytes.push(0xA7, 0xA0);
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

    payloadRomOffset = firstStageSize + subSize;
  }

  // Combine loader (incl. header) + payload into a single 16K bank image.
  const loaderBuffer = Buffer.from(loaderBytes);
  const bankContentSize = loaderBuffer.length + payload.length;

  // The program must fit in one 16K bank window. For sub-16K chips the cap is the chip itself.
  const bankUsable = Math.min(chipBytes, BANK_USABLE_BYTES);
  if (bankContentSize > bankUsable) {
    throw new Error(
      `Loader + payload (${bankContentSize} bytes) exceeds the usable cartridge bank window ` +
      `(${bankUsable} bytes, $C000-$FEFF). A single program must fit in one 16K bank. ` +
      `Reduce the payload, or split it across banks.`
    );
  }

  // Emulator mode: exact-size image, no chip rounding, no padding, no bank mirroring.
  if (config.emulatorMode) {
    const romBuffer = Buffer.alloc(bankContentSize, fillerByte);
    loaderBuffer.copy(romBuffer, 0);
    payload.copy(romBuffer, loaderBuffer.length);
    return { romBuffer, loaderSize: loaderBuffer.length, payloadRomOffset, numBanks: 1, bankUsableBytes: bankUsable };
  }

  const romBuffer = Buffer.alloc(chipBytes, fillerByte);
  loaderBuffer.copy(romBuffer, 0);
  payload.copy(romBuffer, loaderBuffer.length);

  // For EPROMs larger than one 16K bank, mirror the bank image into every bank so the
  // program autostarts no matter which bank the CoCoEPROMpak jumpers select.
  let numBanks = 1;
  if (chipBytes > BANK_PHYSICAL_BYTES) {
    numBanks = Math.floor(chipBytes / BANK_PHYSICAL_BYTES);
    const firstBank = romBuffer.subarray(0, BANK_PHYSICAL_BYTES);
    for (let b = 1; b < numBanks; b++) {
      firstBank.copy(romBuffer, b * BANK_PHYSICAL_BYTES);
    }
  }

  return {
    romBuffer,
    loaderSize: loaderBuffer.length,
    payloadRomOffset,
    numBanks,
    bankUsableBytes: bankUsable
  };
}
