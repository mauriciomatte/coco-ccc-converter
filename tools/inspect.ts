/*
 * Validation harness: runs OUR converter parsers against real sample files and
 * cross-checks the results. Usage (after compiling, see tsconfig.tools.json):
 *   node out-tools/tools/inspect.js "amostras/Canyon Climber"
 *
 * It reports, per game folder: parsed metadata (name/load/exec/size) and a
 * SHA-256 of the extracted payload for each format, flags whether the payloads
 * agree across formats, inspects the real .ccc autostart, and compiles a .ccc
 * from one payload to compare its head against the real cartridge.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { parseCas } from '../src/main/converter/cas';
import { parseDsk, extractDskFile } from '../src/main/converter/dsk';
import { parseBin } from '../src/main/converter/bin';
import { decodeWav } from '../src/main/converter/wav';
import { compileBootstrap } from '../src/main/converter/bootstrap';

const hex4 = (n: number) => '$' + n.toString(16).toUpperCase().padStart(4, '0');
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const head = (b: Buffer, n = 16) =>
  Array.from(b.subarray(0, n)).map(x => x.toString(16).padStart(2, '0')).join(' ');

interface PayloadResult { source: string; name: string; load: number; exec: number; payload: Buffer; }

function inspectFolder(dir: string) {
  const files = fs.readdirSync(dir);
  const byExt = (ext: string) => files.find(f => f.toLowerCase().endsWith(ext));
  const read = (f: string) => fs.readFileSync(path.join(dir, f));

  console.log('\n' + '='.repeat(70));
  console.log('JOGO:', path.basename(dir));
  console.log('='.repeat(70));

  const results: PayloadResult[] = [];

  // --- CAS ---
  const casF = byExt('.cas');
  if (casF) {
    try {
      const p = parseCas(read(casF));
      console.log(`\n[CAS] ${casF}`);
      console.log(`  nome=${p.name} tipo=${p.fileType} load=${hex4(p.loadAddr)} exec=${hex4(p.execAddr)} payload=${p.payload.length}B sha=${sha(p.payload)}`);
      const bad = p.blocks.filter(b => !b.checksumValid).length;
      console.log(`  blocos=${p.blocks.length} checksums_invalidos=${bad}`);
      results.push({ source: 'CAS', name: p.name, load: p.loadAddr, exec: p.execAddr, payload: p.payload });
    } catch (e: any) { console.log(`\n[CAS] ${casF} -> ERRO: ${e.message}`); }
  }

  // --- WAV ---
  const wavF = byExt('.wav');
  if (wavF) {
    try {
      const dec = decodeWav(read(wavF));
      const p = parseCas(dec.bytes);
      console.log(`\n[WAV] ${wavF}`);
      console.log(`  ${dec.metadata.sampleRate}Hz ${dec.metadata.bitsPerSample}bit ch=${dec.metadata.channels} invertido=${dec.isInverted}`);
      console.log(`  nome=${p.name} load=${hex4(p.loadAddr)} exec=${hex4(p.execAddr)} payload=${p.payload.length}B sha=${sha(p.payload)}`);
      results.push({ source: 'WAV', name: p.name, load: p.loadAddr, exec: p.execAddr, payload: p.payload });
    } catch (e: any) { console.log(`\n[WAV] ${wavF} -> ERRO: ${e.message}`); }
  }

  // --- DSK ---
  const dskF = byExt('.dsk');
  if (dskF) {
    try {
      const buf = read(dskF);
      const d = parseDsk(buf);
      console.log(`\n[DSK] ${dskF}  arquivos=${d.files.length}`);
      for (const fe of d.files) {
        let info = `  ${fe.fullName} tipo=${fe.fileTypeName} tam=${fe.totalSize}B granulos=[${fe.granuleChain.join(',')}]`;
        if (fe.fileType === 2) {
          try {
            const raw = extractDskFile(buf, fe);
            const b = parseBin(raw);
            info += ` -> load=${hex4(b.loadAddr)} exec=${hex4(b.execAddr)} payload=${b.payload.length}B sha=${sha(b.payload)}`;
            if (b.gapBytes > 0) info += ` (gaps=${b.gapBytes}B)`;
            results.push({ source: `DSK:${fe.fullName}`, name: fe.name, load: b.loadAddr, exec: b.execAddr, payload: b.payload });
          } catch (e: any) { info += ` -> BIN ERRO: ${e.message}`; }
        }
        console.log(info);
      }
    } catch (e: any) { console.log(`\n[DSK] ${dskF} -> ERRO: ${e.message}`); }
  }

  // --- Real .CCC (gabarito) ---
  const cccF = byExt('.ccc');
  let realCcc: Buffer | null = null;
  if (cccF) {
    realCcc = read(cccF);
    const hasDk = realCcc[0] === 0x44 && realCcc[1] === 0x4B;
    console.log(`\n[CCC real] ${cccF}  tamanho=${realCcc.length}B (${realCcc.length / 1024}K)`);
    console.log(`  primeiros 16 bytes: ${head(realCcc)}`);
    console.log(`  assinatura 'DK' em $C000? ${hasDk ? 'SIM' : 'NAO -> autostart entra direto em $C000'}`);
  }

  // --- Comparação cruzada de payloads ---
  if (results.length > 1) {
    console.log('\n[CROSS-CHECK] payloads entre formatos:');
    const shas = new Map<string, string[]>();
    for (const r of results) {
      const s = sha(r.payload);
      if (!shas.has(s)) shas.set(s, []);
      shas.get(s)!.push(`${r.source}(${r.payload.length}B,${hex4(r.load)})`);
    }
    if (shas.size === 1) console.log('  ✓ TODOS os formatos produziram o MESMO payload.');
    else {
      console.log(`  ✗ ${shas.size} payloads distintos:`);
      for (const [s, srcs] of shas) console.log(`     ${s}  <- ${srcs.join(', ')}`);
    }
  }

  // --- Compila um .ccc com o nosso bootstrap e compara o cabeçalho com o real ---
  if (results.length > 0) {
    const r = results[0];
    // Pick the smallest EPROM whose 16K-capped bank holds loader+payload.
    const need = r.payload.length + 64;
    const sizeKb = need <= 4096 ? 4 : need <= 8192 ? 8 : need <= 16128 ? 16 : 32;
    try {
      const c = compileBootstrap(r.payload, {
        targetRamLoadAddr: r.load, targetRamExecAddr: r.exec, payloadSize: r.payload.length,
        useTwoStage: (r.load >= 0x8000) || (r.load + r.payload.length > 0x8000),
        cartridgeSizeKb: sizeKb, fillerByte: 0xFF
      });
      console.log(`\n[CCC gerado] a partir de ${r.source}, ${sizeKb}K, loader=${c.loaderSize}B, bancos=${c.numBanks}`);
      console.log(`  primeiros 16 bytes: ${head(c.romBuffer)}`);
      if (realCcc) console.log(`  (real)            : ${head(realCcc)}`);
    } catch (e: any) { console.log(`\n[CCC gerado] ERRO: ${e.message}`); }
  }
}

const target = process.argv[2];
const base = path.resolve(__dirname, '..', '..');
if (target) {
  inspectFolder(path.isAbsolute(target) ? target : path.resolve(base, target));
} else {
  const amostras = path.resolve(base, 'amostras');
  for (const e of fs.readdirSync(amostras, { withFileTypes: true })) {
    if (e.isDirectory()) inspectFolder(path.join(amostras, e.name));
  }
}
