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

const hx = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');

export interface DetokResult { text: string; ok: boolean }

export function detokenizeBasic(bytes: Uint8Array): DetokResult {
  const u16 = (i: number) => ((bytes[i] << 8) | bytes[i + 1]) & 0xFFFF;
  const lines: string[] = [];
  // Cabeçalho do BASIC tokenizado gravado em disco pelo Disk BASIC: 0xFF + tamanho (2 bytes BE),
  // seguido da imagem de memória (lista de linhas). Sem o FF inicial, assume imagem pura (offset 0).
  let p = (bytes[0] === 0xFF) ? 3 : 0;
  let guard = 0;
  while (p + 4 <= bytes.length && guard++ < 20000) {
    const link = u16(p);
    if (link === 0) break; // fim do programa
    const lineNo = u16(p + 2);
    p += 4;
    let line = `${lineNo} `;
    while (p < bytes.length && bytes[p] !== 0x00) {
      const b = bytes[p];
      if (b === 0xFF && p + 1 < bytes.length) {
        const f = bytes[p + 1];
        line += FUN[f - 0x80] ?? `[?FF${hx(f)}]`;
        p += 2;
      } else if (b >= 0x80) {
        line += CMD[b - 0x80] ?? `[?${hx(b)}]`;
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
