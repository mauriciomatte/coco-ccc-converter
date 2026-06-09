// Leitor de ZIP minimalista em Node PURO (sem dependência): usa o central directory + zlib.inflateRawSync.
// Suficiente p/ os .zip do Color Computer Archive (entradas STORED=0 ou DEFLATE=8, sem ZIP64).
import * as zlib from 'zlib';

export interface ZipEntry { name: string; size: number; method: number; compSize: number; localOffset: number; isDir: boolean }

export function isZip(b: Buffer | Uint8Array): boolean {
  return b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04; // "PK\x03\x04"
}

// Localiza o End Of Central Directory (assinatura PK\x05\x06), varrendo do fim (até 64 KB de comentário).
function findEOCD(buf: Buffer): { count: number; cdOffset: number } | null {
  const SIG = 0x06054b50, MIN = 22;
  const start = Math.max(0, buf.length - 65557);
  for (let i = buf.length - MIN; i >= start; i--) {
    if (buf.readUInt32LE(i) === SIG) {
      return { count: buf.readUInt16LE(i + 10), cdOffset: buf.readUInt32LE(i + 16) };
    }
  }
  return null;
}

/** Lista as entradas do ZIP a partir do central directory. */
export function listZip(buf: Buffer): ZipEntry[] {
  const eocd = findEOCD(buf);
  if (!eocd) throw new Error('ZIP inválido (EOCD não encontrado).');
  const entries: ZipEntry[] = [];
  let p = eocd.cdOffset;
  for (let n = 0; n < eocd.count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break; // central dir file header
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.push({ name, size: uncompSize, method, compSize, localOffset, isDir: name.endsWith('/') });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Extrai os bytes de UMA entrada (descomprime se DEFLATE). */
export function extractZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  let p = entry.localOffset;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error('Cabeçalho local do ZIP inválido.');
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const dataStart = p + 30 + nameLen + extraLen;
  const comp = buf.subarray(dataStart, dataStart + entry.compSize);
  if (entry.method === 0) return Buffer.from(comp);               // STORED
  if (entry.method === 8) return zlib.inflateRawSync(comp);        // DEFLATE
  throw new Error(`Método de compressão ZIP não suportado: ${entry.method}`);
}

/** Extrai pelo NOME (helper p/ IPC). */
export function extractZipByName(buf: Buffer, name: string): Buffer {
  const e = listZip(buf).find(x => x.name === name);
  if (!e) throw new Error(`Entrada não encontrada no ZIP: ${name}`);
  return extractZipEntry(buf, e);
}
