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

// Comandos (tokens PRIMÁRIos): índice 0 = 0x80. Tabelas VERIFICADAS BYTE-A-BYTE contra os
// disassemblies oficiais *Unravelled II* (Spectral Associates / Walter K. Zydhek): Color BASIC 1.2,
// Extended BASIC 1.1, Disk BASIC 1.0/1.1 e Super Extended BASIC 2.0 (CoCo 3). Os valores vêm das
// DISPATCH TABLES (FDB sequencial), não dos comentários ao lado dos FCC (que o pdftotext desalinha).
// Faixas: Color 0x80–0xB4 · Extended 0xB5–0xCD · Disk 0xCE–0xE1 · Super Extended/CoCo3 0xE2–0xF8.
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
  // Super Extended Color BASIC — CoCo 3 / BASIC 2.0 (0xE2–0xF8). WIDTH começa em 0xE2; ATTR=0xF8.
  'WIDTH', 'PALETTE', 'HSCREEN', 'LPOKE', 'HCLS', 'HCOLOR', 'HPAINT', 'HCIRCLE', 'HLINE', 'HGET',
  'HPUT', 'HBUFF', 'HPRINT', 'ERR', 'BRK', 'LOCATE', 'HSTAT', 'HSET', 'HRESET', 'HDRAW',
  'CMP', 'RGB', 'ATTR',
];

// Funções (tokens SECUNDÁRIos, após 0xFF): índice 0 = 0x80. Mesmas fontes/método das DISPATCH TABLES.
// Faixas: Color 0x80–0x93 · Extended 0x94–0xA1 · Disk 0xA2–0xA7 · (0xA8 vago) · CoCo3 0xA9–0xAD.
const FUN: string[] = [
  // Color BASIC (0x80–0x93)
  'SGN', 'INT', 'ABS', 'USR', 'RND', 'SIN', 'PEEK', 'LEN', 'STR$', 'VAL', 'ASC', 'CHR$',
  'EOF', 'JOYSTK', 'LEFT$', 'RIGHT$', 'MID$', 'POINT', 'INKEY$', 'MEM',
  // Extended (0x94–0xA1)
  'ATN', 'COS', 'TAN', 'EXP', 'FIX', 'LOG', 'POS', 'SQR', 'HEX$', 'VARPTR', 'INSTR',
  'TIMER', 'PPOINT', 'STRING$',
  // Disk (0xA2–0xA7)
  'CVN', 'FREE', 'LOC', 'LOF', 'MKN$', 'AS',
  // 0xA8 — slot reservado/vago entre Disk e Super Extended (o dispatch do CoCo3 começa em 0xA9).
  '',
  // Super Extended Color BASIC — CoCo 3 / BASIC 2.0 (0xA9–0xAD)
  'LPEEK', 'BUTTON', 'HPOINT', 'ERNO', 'ERLIN',
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

// ─────────────────────────── TOKENIZADOR (crunch: texto → imagem tokenizada) ───────────────────────────
// Espelha o CRUNCH do ROM (Color BASIC $B821): tokeniza palavras reservadas FORA de strings/REM/'/DATA,
// com a flag "illegal token" que impede casar keyword NO MEIO de um identificador (ex.: "XOR" fica literal),
// mas casa no INÍCIO da palavra (ex.: "GOTO" → GO+TO). Os ponteiros de link são placeholders: o CoCo os
// RECALCULA no CLOAD/LOAD (rotina LACEF "compute start of next line addresses"), varrendo os terminadores.
// Validado por round-trip com `detokenizeBasic`; o chamador deve cair p/ ASCII se o round-trip falhar.

interface KwMatch { word: string; bytes: number[]; token: number }
function buildMatchList(cmd: string[], fun: string[]): KwMatch[] {
  const list: KwMatch[] = [];
  cmd.forEach((w, i) => { if (w) list.push({ word: w, bytes: [0x80 + i], token: 0x80 + i }); });
  fun.forEach((w, i) => { if (w) list.push({ word: w, bytes: [0xFF, 0x80 + i], token: 0x80 + i }); });
  // Ordena por comprimento DECRESCENTE → casamento mais longo primeiro (evita casar prefixo curto).
  return list.sort((a, b) => b.word.length - a.word.length);
}
const isUpperAlpha = (c: number) => c >= 0x41 && c <= 0x5A;
const isAlnum = (c: number) => isUpperAlpha(c) || (c >= 0x30 && c <= 0x39);

function crunchStatement(s: string, matches: KwMatch[]): number[] {
  const out: number[] = [];
  let illegal = false; // V43 — suprime casamento no meio de identificador
  let inData = false;  // V44 — após DATA, literal até ':'
  let i = 0;
  while (i < s.length) {
    const code = s.charCodeAt(i) & 0xFF;
    if (illegal) {                                   // dentro de um identificador não-keyword: copia alnum
      if (isAlnum(code)) { out.push(code); i++; continue; }
      illegal = false;                               // delimitador zera a flag
    }
    if (code === 0x20) { out.push(0x20); i++; continue; }      // espaço: preservado (ROM não remove)
    if (code === 0x22) {                                       // string: copia literal até a aspas final
      out.push(0x22); i++;
      while (i < s.length && s.charCodeAt(i) !== 0x22) { out.push(s.charCodeAt(i) & 0xFF); i++; }
      if (i < s.length) { out.push(0x22); i++; }
      continue;
    }
    if (inData) {                                              // DATA: literal até ':'
      if (code !== 0x3A) { out.push(code); i++; continue; }
      inData = false;                                          // ':' encerra o DATA
    }
    // tenta casar uma palavra reservada nesta posição (início de palavra)
    let m: KwMatch | null = null;
    for (const k of matches) { if (s.startsWith(k.word, i)) { m = k; break; } }
    if (m) {
      // ELSE (0x84) e o apóstrofo-REM ' (0x83) são gravados com um ':' implícito (o LIST o esconde).
      if ((m.token === 0x84 || m.token === 0x83) && out[out.length - 1] !== 0x3A) out.push(0x3A);
      for (const b of m.bytes) out.push(b);
      i += m.word.length;
      if (m.token === 0x82 || m.token === 0x83) {              // REM / ' → resto da linha literal
        while (i < s.length) { out.push(s.charCodeAt(i) & 0xFF); i++; }
      } else if (m.token === 0x86) inData = true;              // DATA → literal até ':'
    } else {
      out.push(code); i++;
      if (isUpperAlpha(code)) illegal = true;                  // começou identificador não-keyword
      else if (code === 0x3A) { illegal = false; inData = false; } // ':' zera flags (novo sub-statement)
    }
  }
  return out;
}

// Endereço-base clássico do início do texto BASIC (CoCo 16K). Os LINKS são recalculados pelo CoCo no
// CLOAD/LOAD (rechain), então o valor exato não importa para o hardware — mas devem ser NÃO-ZERO (zero =
// fim do programa) para o detokenizador e para o loader não pararem na 1ª linha.
const BASIC_TEXT_BASE = 0x1E01;

/** Tokeniza (crunch) um programa BASIC em texto → imagem de memória `[link:2][nº:2][tokens][0]…[0,0]`. */
export function tokenizeBasic(text: string, dialect: BasicDialect = 'coco'): Uint8Array {
  const matches = buildMatchList(dialect === 'dragon' ? DRAGON_CMD : CMD, dialect === 'dragon' ? DRAGON_FUN : FUN);
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').toUpperCase();
  // 1) crunch de cada linha → corpo `[nº:2][tokens][0]` (sem o link ainda)
  const bodies: number[][] = [];
  for (const rawLine of src.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    const m = /^\s*(\d{1,5})\s?/.exec(line);              // nº de linha + 1 espaço opcional (consumido)
    if (!m) continue;                                    // linha sem número → ignora
    const lineNo = parseInt(m[1], 10) & 0xFFFF;
    const toks = crunchStatement(line.slice(m[0].length), matches);
    bodies.push([(lineNo >> 8) & 0xFF, lineNo & 0xFF, ...toks, 0x00]);
  }
  // 2) monta com LINKS = endereço da PRÓXIMA linha (cada linha = 2 link + corpo); fim = link 0,0
  let addr = BASIC_TEXT_BASE;
  const image: number[] = [];
  for (const body of bodies) {
    const next = (addr + 2 + body.length) & 0xFFFF;     // endereço da próxima linha (ou do marcador final)
    image.push((next >> 8) & 0xFF, next & 0xFF, ...body);
    addr = next;
  }
  image.push(0x00, 0x00);                                // fim do programa (link zero)
  return Uint8Array.from(image);
}

/** Round-trip de segurança: o crunch é fiel SE detokenizar a imagem reproduz o texto (normalizado). */
export function tokenizeRoundTripOk(text: string, dialect: BasicDialect = 'coco'): boolean {
  try {
    const img = tokenizeBasic(text, dialect);
    const back = detokenizeBasic(img, dialect);
    if (!back.ok) return false;
    const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').toUpperCase()
      .split('\n').map(l => l.replace(/\s+$/, '')).filter(l => /^\s*\d/.test(l)).join('\n').trim();
    return norm(back.text) === norm(text);
  } catch { return false; }
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
    // O CRUNCH do BASIC só tokeniza FORA de texto literal. Dentro de aspas ("…"), após REM/' (resto
    // da linha) e após DATA (até o próximo ':'), os bytes ficam LITERAIS — inclusive os ≥0x80 (ex.:
    // caracteres gráficos digitados num PRINT"…"). Sem rastrear esse estado, um byte ≥0x80 literal
    // seria confundido com um token e a linha sairia com lixo. Rastreamos os três contextos:
    let inStr = false;       // dentro de "…"
    let restLiteral = false; // após REM (0x82) ou ' (0x83) → resto da linha é literal
    let inData = false;      // após DATA (0x86) → literal até o ':' (fora de aspas)
    const lit = (b: number) => { line += String.fromCharCode(b); }; // byte cru (literal)
    while (p < bytes.length && bytes[p] !== 0x00) {
      const b = bytes[p];
      if (restLiteral) { lit(b); p += 1; continue; }          // REM/' : tudo literal até o fim da linha
      if (b === 0x22) { inStr = !inStr; line += '"'; p += 1; continue; } // alterna aspas
      if (inStr) { lit(b); p += 1; continue; }                // dentro de string: literal
      if (inData) {
        if (b !== 0x3A) { lit(b); p += 1; continue; }         // DATA: literal até o ':'
        inData = false;                                       // ':' encerra o DATA → trata normalmente
      }
      // O ':' (0x3A) gravado antes de ELSE (0x84) ou do apóstrofo-REM ' (0x83) é suprimido
      // pelo LIST do CoCo. Ex.: ":ELSE" → "ELSE", ":'" → "'".
      if (b === 0x3A && (bytes[p + 1] === 0x84 || bytes[p + 1] === 0x83)) {
        p += 1; // pula o ':' implícito
        continue;
      }
      if (b === 0xFF && p + 1 < bytes.length) {
        const f = bytes[p + 1];
        line += fun[f - 0x80] || `[?FF${hx(f)}]`;             // '' (slot vago) também cai no desconhecido
        p += 2;
      } else if (b >= 0x80) {
        line += cmd[b - 0x80] || `[?${hx(b)}]`;
        if (b === 0x82 || b === 0x83) restLiteral = true;     // REM ou ' → resto literal
        else if (b === 0x86) inData = true;                   // DATA → literal até ':'
        p += 1;
      } else {
        lit(b);
        p += 1;
      }
    }
    p += 1; // pula o 0x00 terminador da linha
    lines.push(line);
  }
  // Considera bem-sucedido se extraiu ao menos uma linha plausível.
  return { text: lines.join('\n'), ok: lines.length > 0 };
}
