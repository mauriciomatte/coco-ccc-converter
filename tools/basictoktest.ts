// Teste do detokenizador BASIC (CoCo 1/2/3) — valida os tokens do Super Extended (CoCo 3) e a
// consciência de literais (string/REM/DATA). Compila via tsconfig.tools.json:
//   npx tsc -p tsconfig.tools.json && node out-tools/tools/basictoktest.js
import { detokenizeBasic, tokenizeBasic, tokenizeRoundTripOk } from '../src/renderer/src/basicDetokenize';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${extra}`); } };

// Constrói uma imagem de programa BASIC tokenizado (sem cabeçalho 0xFF): para cada linha
// [link:2 BE não-zero][nº linha:2 BE][bytes][0x00], terminando com [0x00,0x00].
const S = (s: string) => Array.from(s, c => c.charCodeAt(0));
function prog(lines: Array<{ n: number; b: number[] }>): Uint8Array {
  const out: number[] = [];
  for (const ln of lines) {
    out.push(0x1e, 0x01);                 // link fictício (só precisa ser ≠ 0)
    out.push((ln.n >> 8) & 0xff, ln.n & 0xff);
    out.push(...ln.b, 0x00);
  }
  out.push(0x00, 0x00);                    // fim do programa
  return Uint8Array.from(out);
}
const det = (lines: Array<{ n: number; b: number[] }>) => detokenizeBasic(prog(lines), 'coco').text;

// tokens usados
const FOR = 0x80, TO = 0xa5, NEXT = 0x8b, EQ = 0xb3, PRINT = 0x87, DATA = 0x86, REM = 0x82;
const HSCREEN = 0xe4, PALETTE = 0xe3, HCOLOR = 0xe7, HDRAW = 0xf5, ATTR = 0xf8, WIDTH = 0xe2;
const FF = 0xff, LPEEK = 0xa9, BUTTON = 0xaa, HPOINT = 0xab, ERLIN = 0xad;

// 1) Regressão Color BASIC
ok('Color: FOR/TO/NEXT', det([{ n: 60, b: [FOR, ...S(' I'), EQ, ...S('1 '), TO, ...S(' 10:'), NEXT, ...S(' I')] }]) === '60 FOR I=1 TO 10:NEXT I',
  `→ "${det([{ n: 60, b: [FOR, ...S(' I'), EQ, ...S('1 '), TO, ...S(' 10:'), NEXT, ...S(' I')] }])}"`);

// 2) Comandos CoCo 3 (Super Extended) — antes saíam como [?Exx]
{
  const out = det([{ n: 10, b: [HSCREEN, ...S('2:'), PALETTE, ...S('0,63')] }]);
  ok('CoCo3 cmd: HSCREEN/PALETTE', out === '10 HSCREEN2:PALETTE0,63', `→ "${out}"`);
  const out2 = det([{ n: 20, b: [HCOLOR, ...S('1,2:'), HDRAW, ...S('"BM10,10"'), 0x3a, ATTR, ...S('1,1'), 0x3a, WIDTH, ...S('80')] }]);
  ok('CoCo3 cmd: HCOLOR/HDRAW/ATTR/WIDTH', out2 === '20 HCOLOR1,2:HDRAW"BM10,10":ATTR1,1:WIDTH80', `→ "${out2}"`);
}

// 3) Funções CoCo 3 (Super Extended) — secundárias (0xFF prefixo)
{
  const out = det([{ n: 30, b: [...S('X'), EQ, FF, BUTTON, ...S('(0)+'), FF, LPEEK, ...S('(&H7000)')] }]);
  ok('CoCo3 fun: BUTTON/LPEEK', out === '30 X=BUTTON(0)+LPEEK(&H7000)', `→ "${out}"`);
  const out2 = det([{ n: 40, b: [...S('P'), EQ, FF, HPOINT, ...S('(1,1):L'), EQ, FF, ERLIN] }]);
  ok('CoCo3 fun: HPOINT/ERLIN', out2 === '40 P=HPOINT(1,1):L=ERLIN', `→ "${out2}"`);
}

// 4) String literal com byte ≥0x80 → NÃO tokeniza (antes virava keyword). 0x8A = END (cmd), 0x87 = PRINT.
{
  const out = det([{ n: 50, b: [PRINT, ...S('"A'), 0x8a, 0x87, ...S('B"')] }]);
  ok('string: byte alto literal (sem END/PRINT)', !out.includes('END') && !out.includes('PRINT"END'), `→ "${out}"`);
  ok('string: começa PRINT"A', out.startsWith('50 PRINT"A'), `→ "${out}"`);
}

// 5) REM com byte ≥0x80 → resto literal (0x87 não vira PRINT)
{
  const out = det([{ n: 70, b: [REM, ...S(' '), 0x87, 0x80, ...S(' OK')] }]);
  ok('REM: resto literal (sem PRINT/FOR)', out.startsWith('70 REM') && !out.includes('PRINT') && !out.includes('FOR'), `→ "${out}"`);
}

// 6) DATA literal até ':' → depois volta a tokenizar
{
  // 0x99 = OPEN (cmd). Dentro de DATA deve ficar literal; após ':' o PRINT tokeniza.
  const out = det([{ n: 80, b: [DATA, ...S('1,'), 0x99, ...S(',2'), 0x3a, PRINT, ...S('"X"')] }]);
  ok('DATA: literal até ":" depois tokeniza', out.startsWith('80 DATA') && !out.includes('OPEN') && out.includes(':PRINT"X"'), `→ "${out}"`);
}

// 7) Token desconhecido vira marcador honesto (não corrompe). 0xA8 = slot vago de função.
{
  const out = det([{ n: 90, b: [...S('X'), EQ, FF, 0xa8] }]);
  ok('desconhecido: 0xFF 0xA8 → [?FFA8]', out === '90 X=[?FFA8]', `→ "${out}"`);
}

// 8) TOKENIZADOR (crunch) — round-trip pelo detokenizador + tokens esperados
console.log('TOKENIZADOR (crunch)');
{
  // programa do usuário
  const prog = '5 CLS\n10 PRINT "MAURICIO - TESTE"\n20 GOTO 10';
  const img = tokenizeBasic(prog);
  // estrutura: [00 00][00 05][9E][00] [00 00][00 0A][87 20 22..22][00] [00 00][00 14][81 A5 20 31 30][00] [00 00]
  ok('crunch: 5 CLS → 9E', img[4] === 0x9e && img[5] === 0x00, `(b4=${img[4]?.toString(16)})`);
  ok('crunch: round-trip do programa do usuário', tokenizeRoundTripOk(prog), '');
  const back = detokenizeBasic(img).text;
  ok('crunch: detok == original', back === '5 CLS\n10 PRINT "MAURICIO - TESTE"\n20 GOTO 10', `→ "${back.replace(/\n/g, '\\n')}"`);

  // GOTO = GO(81)+TO(A5); GOSUB = GO(81)+SUB(A6)
  const g = tokenizeBasic('10 GOTO 100\n20 GOSUB 200');
  // 1ª linha tokens começam no índice 4
  ok('crunch: GOTO = 81 A5', g[4] === 0x81 && g[5] === 0xa5, `(${g[4]?.toString(16)} ${g[5]?.toString(16)})`);

  // identificador que CONTÉM keyword não deve tokenizar no meio: "XOR" fica literal (X O R)
  const x = tokenizeBasic('10 A=XOR');
  const xback = detokenizeBasic(x).text;
  ok('crunch: XOR fica literal (sem token OR no meio)', xback === '10 A=XOR', `→ "${xback}"`);

  // strings/REM/DATA: bytes que parecem keyword ficam literais
  ok('crunch: REM literal round-trip', tokenizeRoundTripOk('10 REM PRINT GOTO CLS'), '');
  ok('crunch: string round-trip', tokenizeRoundTripOk('10 PRINT "CLS GOTO PRINT"'), '');
  ok('crunch: DATA round-trip', tokenizeRoundTripOk('10 DATA PRINT,CLS,GOTO:PRINT"X"'), '');
  // CoCo3 + funções
  ok('crunch: CoCo3 round-trip', tokenizeRoundTripOk('10 HSCREEN2:HCOLOR1,2\n20 A=LPEEK(&H7000)+BUTTON(0)'), '');
  // múltiplos statements e operadores
  ok('crunch: operadores/multistmt round-trip', tokenizeRoundTripOk('10 FOR I=1 TO 10:A=B+C*2:NEXT I'), '');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passaram, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
