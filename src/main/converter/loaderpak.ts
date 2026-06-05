// loaderpak.ts — converte uma fita "tela de abertura + loader multi-estágio" (datacorder) num binário
// DECB que roda em .BIN/.DSK SEM o loader de fita. Estratégia validada com o QUASAR:
//   - a TELA (dado) vai direto ao seu endereço final ($0400, 512B);
//   - o PROGRAMA fica no SEU endereço ORIGINAL de carga (ex.: $3FFE) — NUNCA relocado, pois os
//     endereçamentos absolutos do 6809 (JMP/JSR estendido, página direta…) quebrariam;
//   - um STUB position-independent (em RAM alta, fora de $0600–$25FF reservada pelo Disk BASIC)
//     reproduz a "espera do loader" (tecla OU delay) e salta para o EXEC original.
// Cada binário leva uma ASSINATURA "CDCU" no bloco do stub, permitindo ao app reconhecer arquivos
// próprios e, em conversões de volta (→ CAS/WAV/programa puro), descartar os extras de disco.
// Ref. de mapa de memória: Disk ROM @ $C000–$DFFF; RAM do DOS $0600–$25FF; RSTVEC $71/$72; ver
// memory/disk-rom-memmap-and-loader-conversion.md.

export const CDCU_MAGIC = 'CDCU';
export const CDCU_VERSION = 1;
export const CDCU_HEADER_LEN = 18; // magic(4)+ver(1)+flags(1)+origLoad(2)+origExec(2)+telaLoad(2)+telaLen(2)+progLoad(2)+progLen(2)

export const CDCU_FLAG_WAITKEY = 0x01; // stub espera uma tecla (POLCAT)
export const CDCU_FLAG_DELAY = 0x02;   // stub aguarda um delay (~10s) e segue sozinho
export const CDCU_FLAG_TRAP = 0x04;    // binário grava o trap de autostart em $0176

// RAM hook RVEC8 = "close the file opened to a device number" ($A42D). O LOADM fecha o arquivo ao
// terminar, e esse close dispara o hook → gravar um JMP aqui faz o programa iniciar SOZINHO após o
// LOADM (sem :EXEC). Técnica "trap close vector for autostart". Confirmado empiricamente (QUASAR_A.dsk).
export const RVEC8_CLOSE = 0x0176;

export interface NoLoaderOpts {
  screen: Buffer;        // bytes da tela de abertura (dado)
  screenLoad: number;    // endereço final da tela (ex.: $0400)
  program: Buffer;       // bytes do programa principal (bloco puro)
  progLoad: number;      // endereço ORIGINAL de carga do programa (ex.: $3FFE)
  origExec: number;      // endereço de execução original (ex.: $3FFE)
  stubLoad?: number;     // onde por o stub (default: logo acima do programa, fora da RAM do DOS)
  mode?: 'key' | 'delay';// como "segurar" a tela antes de iniciar (default 'key')
  trap?: boolean;        // grava o trap de autostart em $0176 (default true) → roda só com LOADM
}

// Monta UM segmento DECB: [00][len:2BE][load:2BE][data].
function decbSeg(load: number, data: Buffer): Buffer {
  const h = Buffer.alloc(5);
  h[0] = 0x00; h.writeUInt16BE(data.length & 0xFFFF, 1); h.writeUInt16BE(load & 0xFFFF, 3);
  return Buffer.concat([h, data]);
}
// Pós-âmbulo DECB: [FF][0000][exec:2BE].
function decbTail(exec: number): Buffer {
  const t = Buffer.alloc(5);
  t[0] = 0xFF; t.writeUInt16BE(0, 1); t.writeUInt16BE(exec & 0xFFFF, 3);
  return t;
}

// Código do stub (após o cabeçalho de 18 bytes). Tudo absoluto + 1 branch relativo → position-independent.
// Reproduz o init final do loader do QUASAR ($71=$55, $72=$00A8, $010A=exec) e salta p/ o EXEC.
function stubCode(origExec: number, mode: 'key' | 'delay', trap: boolean): Buffer {
  const lo = origExec & 0xFF, hi = (origExec >> 8) & 0xFF;
  // DESARMA o trap antes de tudo: $0176 := $39 (RTS). O close do LOADM dispara o hook $0176, mas dele
  // o stub roda e NÃO retorna (salta p/ o jogo) — e o close podia chamá-lo 2× (a tela pedia tecla duas
  // vezes). Com $0176=RTS, um 2º `JSR $0176` só retorna, sem repetir a espera. Só quando o trap está on.
  const disarm = trap ? [0x86, 0x39, 0xB7, 0x01, 0x76] : []; // LDA #$39 / STA $0176
  const tail = [0x86, 0x55, 0x97, 0x71, 0x8E, 0x00, 0xA8, 0x9F, 0x72, 0x8E, hi, lo, 0xBF, 0x01, 0x0A, 0x6E, 0x84];
  if (mode === 'delay') {
    // LDB #20 / d1: LDX #0 / d2: LEAX -1,X / BNE d2 / DECB / BNE d1 → ~10s @0.89MHz, depois init+JMP
    return Buffer.from([...disarm, 0xC6, 0x14, 0x8E, 0x00, 0x00, 0x30, 0x1F, 0x26, 0xFC, 0x5A, 0x26, 0xF6, ...tail]);
  }
  // key: JSR [$A000] (POLCAT) / TSTA / BEQ volta / init+JMP
  return Buffer.from([...disarm, 0xAD, 0x9F, 0xA0, 0x00, 0x4D, 0x27, 0xF9, ...tail]);
}

// Cabeçalho de assinatura CDCU (18 bytes) gravado no início do bloco do stub.
function cdcuHeader(opts: NoLoaderOpts, flags: number): Buffer {
  const h = Buffer.alloc(CDCU_HEADER_LEN);
  h.write(CDCU_MAGIC, 0, 'ascii');
  h[4] = CDCU_VERSION; h[5] = flags;
  h.writeUInt16BE(opts.progLoad & 0xFFFF, 6);   // origLoad (= progLoad)
  h.writeUInt16BE(opts.origExec & 0xFFFF, 8);
  h.writeUInt16BE(opts.screenLoad & 0xFFFF, 10);
  h.writeUInt16BE(opts.screen.length & 0xFFFF, 12);
  h.writeUInt16BE(opts.progLoad & 0xFFFF, 14);
  h.writeUInt16BE(opts.program.length & 0xFFFF, 16);
  return h;
}

// Constrói o binário DECB sem loader (tela + programa + stub-assinado). O EXEC final aponta para o
// stub (logo após o cabeçalho de assinatura).
export function buildNoLoaderBin(opts: NoLoaderOpts): Buffer {
  const mode = opts.mode || 'key';
  const trap = opts.trap !== false; // default: liga o autostart $0176
  let flags = mode === 'delay' ? CDCU_FLAG_DELAY : CDCU_FLAG_WAITKEY;
  if (trap) flags |= CDCU_FLAG_TRAP;
  const header = cdcuHeader(opts, flags);
  const code = stubCode(opts.origExec, mode, trap);
  const stub = Buffer.concat([header, code]);
  // Onde por o stub: fora da área do Disk BASIC ($0600–$25FF) E longe da PILHA do sistema (~$7E00+ no
  // topo da RAM). Padrão = logo ACIMA do programa; mas se isso invadir a pilha (programa grande, ex.:
  // Zaxxon termina em $7F0F), poe ABAIXO do programa. Carregar o stub na pilha trava o LOADM.
  const STACK_FLOOR = 0x7E00;
  let stubLoad = opts.stubLoad ?? 0;
  if (!opts.stubLoad) {
    const above = (opts.progLoad + opts.program.length + 0xF) & ~0xF;
    stubLoad = (above + stub.length <= STACK_FLOOR)
      ? above
      : (opts.progLoad - stub.length - 0x10) & ~0xF; // abaixo do programa, longe da pilha
  }
  const stubExec = stubLoad + CDCU_HEADER_LEN; // exec pula o cabeçalho de assinatura
  const segs = [
    decbSeg(opts.screenLoad, opts.screen),
    decbSeg(opts.progLoad, opts.program),
    decbSeg(stubLoad, stub),
  ];
  // Autostart: JMP <stub> no hook de close $0176 → o LOADM, ao fechar o arquivo, salta para o stub.
  if (trap) segs.push(decbSeg(RVEC8_CLOSE, Buffer.from([0x7E, (stubExec >> 8) & 0xFF, stubExec & 0xFF])));
  segs.push(decbTail(stubExec)); // exec do pós-âmbulo = fallback para :EXEC se o trap não disparar
  return Buffer.concat(segs);
}

export interface CdcuInfo {
  version: number; flags: number;
  origLoad: number; origExec: number;
  screenLoad: number; screenLen: number;
  progLoad: number; progLen: number;
}

// Percorre os segmentos de um binário DECB. Retorna [{load,data}] e o exec do pós-âmbulo.
export function parseDecb(buf: Buffer): { segs: Array<{ load: number; data: Buffer }>; exec: number | null } {
  const segs: Array<{ load: number; data: Buffer }> = [];
  let i = 0, exec: number | null = null;
  while (i + 5 <= buf.length) {
    const flag = buf[i];
    if (flag === 0xFF) { exec = buf.readUInt16BE(i + 3); break; }
    if (flag !== 0x00) break;
    const len = buf.readUInt16BE(i + 1), load = buf.readUInt16BE(i + 3);
    const data = buf.subarray(i + 5, i + 5 + len);
    segs.push({ load, data: Buffer.from(data) });
    i += 5 + len;
  }
  return { segs, exec };
}

// Reconhece a assinatura CDCU num binário DECB (.bin) — retorna o mapa ou null se não for nosso.
export function readCdcuInfo(buf: Buffer): CdcuInfo | null {
  const { segs } = parseDecb(buf);
  for (const s of segs) {
    if (s.data.length >= CDCU_HEADER_LEN && s.data.subarray(0, 4).toString('ascii') === CDCU_MAGIC) {
      return {
        version: s.data[4], flags: s.data[5],
        origLoad: s.data.readUInt16BE(6), origExec: s.data.readUInt16BE(8),
        screenLoad: s.data.readUInt16BE(10), screenLen: s.data.readUInt16BE(12),
        progLoad: s.data.readUInt16BE(14), progLen: s.data.readUInt16BE(16),
      };
    }
  }
  return null;
}

// Conversão de VOLTA: de um binário CDCU recupera o PROGRAMA PURO (sem tela/stub) + endereços, para
// reexportar em .CAS/.WAV/etc. Retorna null se não houver assinatura.
export function stripToProgram(buf: Buffer): { program: Buffer; load: number; exec: number } | null {
  const info = readCdcuInfo(buf);
  if (!info) return null;
  const { segs } = parseDecb(buf);
  const prog = segs.find(s => s.load === info.progLoad && s.data.length === info.progLen);
  if (!prog) return null;
  return { program: prog.data, load: info.progLoad, exec: info.origExec };
}
