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

// ─────────────────────────── W5 — FIXCAS (validar/reparar .CAS) ───────────────────────────

export interface FixCasReport {
  blocks: number;        // blocos recuperados (namefile + data + EOF)
  files: number;         // arquivos reconstruídos na fita
  checksumsFixed: number; // blocos cujo checksum estava errado e foi recalculado
  falseSyncsSkipped: number; // bytes 0x3C que não eram cabeçalho de bloco válido
  eofAdded: number;      // arquivos que não tinham EOF e ganharam um
  bytesIn: number;
  bytesOut: number;
  changed: boolean;      // true se a saída difere da entrada
}

interface RecoveredBlock { type: number; payload: Buffer; csFixed: boolean; }

/**
 * Valida e REPARA um .CAS: varre o stream tolerando lixo, recupera os blocos (namefile/data/EOF)
 * mesmo com checksum errado e reemite uma fita CANÔNICA — leader $55 + sync $3C corretos, checksums
 * recalculados, e EOF garantido por arquivo. Resolve os defeitos comuns (leader/sync ausente ou
 * deformado entre blocos, checksum corrompido, EOF faltando). Não inventa dados: blocos cuja
 * estrutura não fecha (tipo inválido / tamanho que estoura o buffer) são tratados como falso-sync.
 */
export function fixCas(input: Buffer): { output: Buffer; report: FixCasReport } {
  const recovered: RecoveredBlock[] = [];
  let checksumsFixed = 0, falseSyncsSkipped = 0;

  // 1) Varredura tolerante. O leader é 0x55 (≠ 0x3C), então indexOf(0x3C) pula leaders naturalmente.
  let off = 0;
  while (off < input.length) {
    const sync = input.indexOf(0x3c, off);
    if (sync < 0 || sync + 3 > input.length) break;       // sem mais sync / cabeçalho truncado
    const type = input[sync + 1];
    const len = input[sync + 2];
    // Só 3 tipos são válidos numa fita CoCo/Dragon. Qualquer outro = falso sync (0x3C dentro de leader/dado).
    if (type !== 0x00 && type !== 0x01 && type !== 0xff) { off = sync + 1; falseSyncsSkipped++; continue; }
    if (sync + 3 + len + 1 > input.length) { off = sync + 1; falseSyncsSkipped++; continue; } // não cabe → falso sync
    const payload = input.subarray(sync + 3, sync + 3 + len);
    const stored = input[sync + 3 + len];
    let sum = (type + len) & 0xff;
    for (let i = 0; i < payload.length; i++) sum = (sum + payload[i]) & 0xff;
    const csFixed = sum !== stored;
    if (csFixed) checksumsFixed++;
    recovered.push({ type, payload: Buffer.from(payload), csFixed });
    off = sync + 3 + len + 1;                              // pula este bloco (0x3C dentro do payload não confunde)
  }

  // 2) Reemissão canônica. leader(128) · namefile · leader(128) · [data · leader(2)]… · EOF · leader(2).
  const out: number[] = [];
  const leader = (n: number) => { for (let k = 0; k < n; k++) out.push(0x55); };
  const emit = (type: number, data: Buffer) => {
    out.push(0x3c, type & 0xff, data.length & 0xff);
    let s = (type + data.length) & 0xff;
    for (const b of data) { out.push(b & 0xff); s = (s + b) & 0xff; }
    out.push(s & 0xff);                                    // checksum SEMPRE recalculado
  };

  let files = 0, eofAdded = 0;
  const emitFile = (namefile: Buffer | null, datas: Buffer[], hadEof: boolean) => {
    files++;
    leader(128);
    if (namefile) { emit(0x00, namefile); leader(128); }
    for (const d of datas) { emit(0x01, d); leader(2); }
    emit(0xff, Buffer.alloc(0));
    if (!hadEof) eofAdded++;
    leader(2);
  };

  let i = 0;
  while (i < recovered.length) {
    const b = recovered[i];
    if (b.type === 0x00) {                                 // namefile → começa um arquivo
      const nf = b.payload; i++;
      const datas: Buffer[] = [];
      while (i < recovered.length && recovered[i].type === 0x01) { datas.push(recovered[i].payload); i++; }
      let hadEof = false;
      if (i < recovered.length && recovered[i].type === 0xff) { hadEof = true; i++; }
      emitFile(nf, datas, hadEof);
    } else if (b.type === 0x01) {                          // data órfão (sem namefile) → arquivo anônimo
      const datas: Buffer[] = [];
      while (i < recovered.length && recovered[i].type === 0x01) { datas.push(recovered[i].payload); i++; }
      let hadEof = false;
      if (i < recovered.length && recovered[i].type === 0xff) { hadEof = true; i++; }
      emitFile(null, datas, hadEof);
    } else {                                               // EOF avulso (sem arquivo aberto) → descarta
      i++;
    }
  }

  const output = Buffer.from(out);
  const changed = output.length !== input.length || !output.equals(input);
  return {
    output,
    report: {
      blocks: recovered.length, files, checksumsFixed, falseSyncsSkipped, eofAdded,
      bytesIn: input.length, bytesOut: output.length, changed,
    },
  };
}
