/*
 * Emulator export helpers: re-encode parsed programs into loadable .cas (cassette)
 * and .dsk (RS-DOS disk) images. These let programs that do NOT fit a 16K cartridge
 * (multi-part / 64K games) be loaded directly into RAM by XRoar/MAME.
 */

export interface CasFileInput {
  name: string;
  fileType: number; // 0=BASIC, 1=Data, 2=Machine Code
  asciiFlag: number; // 0=binary, 0xFF=ASCII
  loadAddr: number;
  execAddr: number;
  payload: Buffer;
}

const LEADER_LEN = 128; // $55 leader bytes written before namefile and before data

function checksum(type: number, data: Buffer | number[]): number {
  let sum = type + data.length;
  for (const b of data) sum += b;
  return sum & 0xFF;
}

function nameField(name: string): Buffer {
  const buf = Buffer.alloc(8, 0x20); // space-padded
  const up = (name || '').toUpperCase().replace(/[^\x20-\x7E]/g, '').slice(0, 8);
  buf.write(up, 0, 'ascii');
  return buf;
}

/**
 * Encodes one or more files into a CoCo .cas cassette byte stream
 * (leader + sync + namefile + data blocks + EOF, per file).
 */
export function encodeCas(files: CasFileInput[]): Buffer {
  const out: number[] = [];
  const leader = (n: number) => { for (let i = 0; i < n; i++) out.push(0x55); };
  const pushBlock = (type: number, data: Buffer | number[]) => {
    out.push(0x3C, type, data.length);
    for (const b of data) out.push(b);
    out.push(checksum(type, data));
  };

  for (const f of files) {
    // Namefile (15-byte payload): name(8) type(1) ascii(1) gap(1) exec(2 BE) load(2 BE).
    // GAP FLAG (byte 10) é CRÍTICO: o CLOAD do Color BASIC lê CASBUF+10 e, se ZERO, trata o arquivo
    // como IMAGEM TOKENIZADA (binária) — IGNORANDO o flag ASCII. Um BASIC ASCII (flag 0xFF) com gap=0
    // era carregado byte-a-byte como tokens (ex.: "5 CLS" → linha 17228 lixo). Arquivos ASCII (e de
    // dados) são GAPPED: gap=0xFF e cada bloco ganha um LEADER COMPLETO p/ o CoCo re-sincronizar após
    // a parada do motor entre blocos. ML/tokenizado (flag 0) seguem contíguos (gap=0, leader curto).
    const gapped = (f.asciiFlag & 0xFF) !== 0x00;
    const nf = Buffer.alloc(15);
    nameField(f.name).copy(nf, 0);
    nf[8] = f.fileType & 0xFF;
    nf[9] = f.asciiFlag & 0xFF;
    nf[10] = gapped ? 0xFF : 0x00; // gap flag (gapped p/ ASCII/dados; sem gaps p/ binário)
    nf.writeUInt16BE(f.execAddr & 0xFFFF, 11);
    nf.writeUInt16BE(f.loadAddr & 0xFFFF, 13);

    leader(LEADER_LEN);
    pushBlock(0x00, nf);
    leader(LEADER_LEN); // gap between namefile and data

    // Data blocks: até 255 bytes cada. Entre blocos: leader COMPLETO se gapped (o CoCo desliga o motor
    // e precisa re-sincronizar), ou curto se contíguo (formato canônico que o XRoar lê em sequência).
    const interBlock = gapped ? LEADER_LEN : 2;
    for (let i = 0; i < f.payload.length; i += 255) {
      pushBlock(0x01, f.payload.subarray(i, Math.min(i + 255, f.payload.length)));
      leader(interBlock);
    }

    // EOF block
    pushBlock(0xFF, Buffer.alloc(0));
    leader(2);
  }

  return Buffer.from(out);
}

/** Builds a CoCo LOADM (.bin) byte image from a single load segment. */
export function buildLoadmBin(loadAddr: number, execAddr: number, payload: Buffer): Buffer {
  const out = Buffer.alloc(5 + payload.length + 5);
  out[0] = 0x00;
  out.writeUInt16BE(payload.length & 0xFFFF, 1);
  out.writeUInt16BE(loadAddr & 0xFFFF, 3);
  payload.copy(out, 5);
  const post = 5 + payload.length;
  out[post] = 0xFF;
  out.writeUInt16BE(0x0000, post + 1);
  out.writeUInt16BE(execAddr & 0xFFFF, post + 3);
  return out;
}

/**
 * Wraps a cartridge ROM image as a CoCo LOADM .bin that loads at $4000 — the format
 * expected by CocoFLASH's PRGFLASH.BAS flashing tool. The ROM content itself is a normal
 * $C000 autostart cartridge (CocoFLASH menu "type 2": IRQ-started game). The flashing tool
 * reads the bytes into RAM at $4000 and programs them into the chosen bank.
 *
 * NOTE: this covers programs that fit one 16K bank. Banked images >16K (CocoFLASH "type 34",
 * RoboCop-style using the $FF40 offset register) are NOT produced here yet.
 */
export function buildCocoFlashBin(romImage: Buffer): Buffer {
  return buildLoadmBin(0x4000, 0x4000, romImage);
}

const DSK_BYTES = 161280; // 35 tracks x 18 sectors x 256
const BYTES_PER_TRACK = 18 * 256; // 4608
const GRANULE_BYTES = 2304; // 9 sectors

function granuleOffset(g: number): number {
  const track = Math.floor(g / 2) + (g >= 34 ? 1 : 0); // skip directory track 17
  const half = g % 2;
  return track * BYTES_PER_TRACK + (half ? GRANULE_BYTES : 0);
}

export interface DskFileInput {
  name: string; // may include extension, e.g. "GAME.BIN"
  loadAddr: number;
  execAddr: number;
  payload: Buffer;
}

/**
 * Writes one or more machine-language files into a fresh RS-DOS .dsk image.
 * `tracks` selects the geometry: 35 (standard DECB, 161,280 B) or 40 (JDOS/CODIMEX, 184,320 B).
 * The directory track is always 17 and there are 2 granules per track except track 17, so the
 * granule count is 2×(tracks−1) (68 for 35T, 78 for 40T). Files are allocated from granule 0 up.
 * Round-trips through parseDsk/extractDskFile (which derive the geometry from the image size).
 */
export function encodeDsk(files: DskFileInput[], tracks = 35): Buffer {
  if (tracks !== 35 && tracks !== 40) throw new Error(`Unsupported track count ${tracks} (use 35 or 40).`);
  const totalGranules = (tracks - 1) * 2; // track 17 reserved → 68 (35T) or 78 (40T)
  const img = Buffer.alloc(tracks * BYTES_PER_TRACK, 0x00);
  const fatOffset = 17 * BYTES_PER_TRACK + 256;
  img.fill(0xFF, fatOffset, fatOffset + 256); // 0xFF = free granule
  const dirBase = 17 * BYTES_PER_TRACK + 2 * 256;

  let nextGranule = 0;
  files.forEach((f, fi) => {
    const bin = buildLoadmBin(f.loadAddr, f.execAddr, f.payload);
    const n = Math.max(1, Math.ceil(bin.length / GRANULE_BYTES));
    if (nextGranule + n > totalGranules) {
      throw new Error(`Not enough room on a ${tracks}-track disk for "${f.name}" (needs ${n} granules; ${totalGranules - nextGranule} free).`);
    }
    const first = nextGranule;

    for (let i = 0; i < n; i++) {
      const g = first + i;
      bin.copy(img, granuleOffset(g), i * GRANULE_BYTES, Math.min((i + 1) * GRANULE_BYTES, bin.length));
      img[fatOffset + g] = (i < n - 1) ? (g + 1) : 0; // placeholder for last, set below
    }
    const lastGranuleBytes = bin.length - (n - 1) * GRANULE_BYTES;
    const sectorsInLastGranule = Math.max(1, Math.ceil(lastGranuleBytes / 256));
    img[fatOffset + first + (n - 1)] = 0xC0 + sectorsInLastGranule; // end-of-chain

    // Directory entry fi
    const dirOffset = dirBase + fi * 32;
    let base = (f.name || `FILE${fi}.BIN`).toUpperCase();
    let name = base, ext = 'BIN';
    const dot = base.lastIndexOf('.');
    if (dot > 0) { name = base.slice(0, dot); ext = base.slice(dot + 1); }
    nameField(name).copy(img, dirOffset);
    const extBuf = Buffer.alloc(3, 0x20);
    extBuf.write(ext.replace(/[^\x20-\x7E]/g, '').slice(0, 3), 0, 'ascii');
    extBuf.copy(img, dirOffset + 8);
    img[dirOffset + 11] = 0x02; // machine code
    img[dirOffset + 12] = 0x00; // binary
    img[dirOffset + 13] = first; // first granule
    img.writeUInt16BE(bin.length % 256, dirOffset + 14); // bytes in last sector (0 -> 256)

    nextGranule += n;
  });

  return img;
}
