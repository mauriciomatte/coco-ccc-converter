// Detokenizador de BASIC do Color Computer (e clones como o CP-400 da Prológica).
//
// Formato do arquivo BASIC tokenizado (DECB, imagem de memória gravada no disco):
//   Para cada linha:  [link:2 BE][nº da linha:2 BE][bytes tokenizados...][0x00]
//   Fim do programa:  link == 0x0000
//
// Bytes < 0x80  → caractere ASCII literal.
// Bytes >= 0x80 → token de comando (1 byte)  → tabela CMD.
// Byte  0xFF    → prefixo de função; o próximo byte é o token → tabela FUN.
//
// As tabelas cobrem Color BASIC (alta confiança), Extended e Disk BASIC. Tokens fora das
// tabelas saem como [?XX] para não corromper silenciosamente — se algo aparecer assim, é só
// reportar o código que a tabela é ajustada.

// Comandos: índice 0 = 0x80. Tabelas VERIFICADAS contra os disassemblies oficiais
// (Color/Extended/Disk BASIC Unravelled II, Spectral Associates / W. Zydhek).
const CMD: string[] = [
  // Color BASIC (0x80–0xB4)
  'FOR', 'GO', 'REM', "'", 'ELSE', 'IF', 'DATA', 'PRINT', 'ON', 'INPUT', 'END', 'NEXT',
  'DIM', 'READ', 'RUN', 'RESTORE', 'RETURN', 'STOP', 'POKE', 'CONT', 'LIST', 'CLEAR',
  'NEW', 'CLOAD', 'CSAVE', 'OPEN', 'CLOSE', 'LLIST', 'SET', 'RESET', 'CLS', 'MOTOR',
  'SOUND', 'AUDIO', 'EXEC', 'SKIPF', 'TAB(', 'TO', 'SUB', 'THEN', 'NOT', 'STEP',
  'OFF', '+', '-', '*', '/', '^', 'AND', 'OR', '>', '=', '<',
  // Extended Color BASIC (0xB5–0xCD) — DEL começa em 0xB5; FN=0xCC, USING=0xCD
  'DEL', 'EDIT', 'TRON', 'TROFF', 'DEF', 'LET', 'LINE', 'PCLS', 'PSET', 'PRESET',
  'SCREEN', 'PCLEAR', 'COLOR', 'CIRCLE', 'PAINT', 'GET', 'PUT', 'DRAW', 'PCOPY', 'PMODE',
  'PLAY', 'DLOAD', 'RENUM', 'FN', 'USING',
  // Disk Extended Color BASIC (0xCE–0xE1) — DIR começa em 0xCE; DOS=0xE1
  'DIR', 'DRIVE', 'FIELD', 'FILES', 'KILL', 'LOAD', 'LSET', 'MERGE', 'RENAME', 'RSET',
  'SAVE', 'WRITE', 'VERIFY', 'UNLOAD', 'DSKINI', 'BACKUP', 'COPY', 'DSKI$', 'DSKO$', 'DOS',
];

// Funções (após 0xFF): índice 0 = 0x80. Verificadas contra os mesmos disassemblies.
const FUN: string[] = [
  // Color BASIC (0x80–0x93)
  'SGN', 'INT', 'ABS', 'USR', 'RND', 'SIN', 'PEEK', 'LEN', 'STR$', 'VAL', 'ASC', 'CHR$',
  'EOF', 'JOYSTK', 'LEFT$', 'RIGHT$', 'MID$', 'POINT', 'INKEY$', 'MEM',
  // Extended (0x94–0xA1)
  'ATN', 'COS', 'TAN', 'EXP', 'FIX', 'LOG', 'POS', 'SQR', 'HEX$', 'VARPTR', 'INSTR',
  'TIMER', 'PPOINT', 'STRING$',
  // Disk (0xA2–0xA7)
  'CVN', 'FREE', 'LOC', 'LOF', 'MKN$', 'AS',
];

// ── Dragon 32/64 BASIC (Microsoft) — token VALUES differ from CoCo. Verified against
// dragon32.info (bastoken/dostoken) and the real AIRBALL.BAS listing. Dragon inserts LET (0x8e)
// and DEF (0x98), shifting everything after 0x8d, so the same byte means a different keyword.
const DRAGON_CMD: string[] = [
  // Dragon BASIC (0x80–0xCD)
  'FOR', 'GO', 'REM', "'", 'ELSE', 'IF', 'DATA', 'PRINT', 'ON', 'INPUT', 'END', 'NEXT',
  'DIM', 'READ', 'LET', 'RUN', 'RESTORE', 'RETURN', 'STOP', 'POKE', 'CONT', 'LIST', 'CLEAR',
  'NEW', 'DEF', 'CLOAD', 'CSAVE', 'OPEN', 'CLOSE', 'LLIST', 'SET', 'RESET', 'CLS', 'MOTOR',
  'SOUND', 'AUDIO', 'EXEC', 'SKIPF', 'DEL', 'EDIT', 'TRON', 'TROFF', 'LINE', 'PCLS', 'PSET',
  'PRESET', 'SCREEN', 'PCLEAR', 'COLOR', 'CIRCLE', 'PAINT', 'GET', 'PUT', 'DRAW', 'PCOPY',
  'PMODE', 'PLAY', 'DLOAD', 'RENUM', 'TAB(', 'TO', 'SUB', 'FN', 'THEN', 'NOT', 'STEP', 'OFF',
  '+', '-', '*', '/', '^', 'AND', 'OR', '>', '=', '<', 'USING',
  // Dragon DOS BASIC (0xCE–0xE7)
  'AUTO', 'BACKUP', 'BEEP', 'BOOT', 'CHAIN', 'COPY', 'CREATE', 'DIR', 'DRIVE', 'DSKINIT',
  'FREAD', 'FWRITE', 'ERROR', 'KILL', 'LOAD', 'MERGE', 'PROTECT', 'WAIT', 'RENAME', 'SAVE',
  'SREAD', 'SWRITE', 'VERIFY', 'FROM', 'FLREAD', 'SWAP',
];

// Dragon functions (after 0xFF): index 0 = 0x80.
const DRAGON_FUN: string[] = [
  // Dragon BASIC (0x80–0xA1)
  'SGN', 'INT', 'ABS', 'POS', 'RND', 'SQR', 'LOG', 'EXP', 'SIN', 'COS', 'TAN', 'ATN',
  'PEEK', 'LEN', 'STR$', 'VAL', 'ASC', 'CHR$', 'EOF', 'JOYSTK', 'FIX', 'HEX$', 'LEFT$',
  'RIGHT$', 'MID$', 'POINT', 'INKEY$', 'MEM', 'VARPTR', 'INSTR', 'TIMER', 'PPOINT',
  'STRING$', 'USR',
  // Dragon DOS BASIC (0xA2–0xA8)
  'LOF', 'FREE', 'ERL', 'ERR', 'HIMEM', 'LOC', 'FRE$',
];

const hx = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');

// Localiza o início da imagem de linhas, tolerando os diferentes cabeçalhos (CoCo 0xFF+tam = 3 bytes;
// Dragon DOS = 9 bytes). Testa cada offset contando quantas linhas têm número crescente e plausível.
function findBasicStart(bytes: Uint8Array): number {
  const u16 = (i: number) => ((bytes[i] << 8) | bytes[i + 1]) & 0xFFFF;
  // Conta quantas linhas consecutivas têm número crescente e plausível a partir de `start`.
  const test = (start: number, maxFirst: number): number => {
    let p = start, prev = -1, n = 0;
    for (let k = 0; k < 6 && p + 4 <= bytes.length; k++) {
      const link = u16(p), ln = u16(p + 2);
      if (link === 0) break;                 // fim do programa
      if (ln > 63999 || ln <= prev) break;   // número de linha inválido / não-crescente
      if (k === 0 && ln > maxFirst) return 0; // primeira linha alta demais → offset errado
      prev = ln; n++; p += 4;
      while (p < bytes.length && bytes[p] !== 0x00) p++;
      p++;                                    // pula o 0x00 terminador
    }
    return n;
  };
  const std = bytes[0] === 0xFF ? 3 : 0;      // cabeçalho padrão CoCo / imagem pura
  let best = std, bestN = test(std, 63999);
  if (bestN >= 3) return std;                 // caso comum (CoCo) já casa → mantém
  // Cabeçalho exótico (ex.: Dragon DOS = 9 bytes): escolhe o offset com MAIS linhas crescentes
  // (assim 10,20,30,40… vence um par coincidente como 257,8240).
  for (let o = 0; o <= 16; o++) {
    const n = test(o, o === std ? 63999 : 1000);
    if (n > bestN) { bestN = n; best = o; }
  }
  return bestN >= 2 ? best : std;
}

export interface DetokResult { text: string; ok: boolean }

export type BasicDialect = 'coco' | 'dragon';

export function detokenizeBasic(bytes: Uint8Array, dialect: BasicDialect = 'coco'): DetokResult {
  const cmd = dialect === 'dragon' ? DRAGON_CMD : CMD;
  const fun = dialect === 'dragon' ? DRAGON_FUN : FUN;
  const u16 = (i: number) => ((bytes[i] << 8) | bytes[i + 1]) & 0xFFFF;
  const lines: string[] = [];
  // Cabeçalho do BASIC tokenizado gravado em disco pelo Disk BASIC: 0xFF + tamanho (2 bytes BE),
  // seguido da imagem de memória (lista de linhas). Mas os formatos de cabeçalho variam: o Disk
  // BASIC do CoCo usa 0xFF+tam (3 bytes); o Dragon DOS prefixa um cabeçalho de 9 bytes
  // (55 01 [load:2] [tam:2] 8B 8D AA). Em vez de fixar, localizamos o INÍCIO real do programa
  // procurando o primeiro offset cujas linhas têm números pequenos e CRESCENTES.
  let p = findBasicStart(bytes);
  let guard = 0;
  while (p + 4 <= bytes.length && guard++ < 20000) {
    const link = u16(p);
    if (link === 0) break; // fim do programa
    const lineNo = u16(p + 2);
    p += 4;
    let line = `${lineNo} `;
    while (p < bytes.length && bytes[p] !== 0x00) {
      const b = bytes[p];
      // O ':' (0x3A) gravado antes de ELSE (0x84) ou do apóstrofo-REM ' (0x83) é suprimido
      // pelo LIST do CoCo. Ex.: ":ELSE" → "ELSE", ":'" → "'".
      if (b === 0x3A && (bytes[p + 1] === 0x84 || bytes[p + 1] === 0x83)) {
        p += 1; // pula o ':' implícito
        continue;
      }
      if (b === 0xFF && p + 1 < bytes.length) {
        const f = bytes[p + 1];
        line += fun[f - 0x80] ?? `[?FF${hx(f)}]`;
        p += 2;
      } else if (b >= 0x80) {
        line += cmd[b - 0x80] ?? `[?${hx(b)}]`;
        p += 1;
      } else {
        line += String.fromCharCode(b);
        p += 1;
      }
    }
    p += 1; // pula o 0x00 terminador da linha
    lines.push(line);
  }
  // Considera bem-sucedido se extraiu ao menos uma linha plausível.
  return { text: lines.join('\n'), ok: lines.length > 0 };
}
