// Disassembler do Motorola 6809 (somente leitura) para a visão ao lado do editor hexadecimal.
// Cobre página 1 + páginas 2 ($10) e 3 ($11), todos os modos de endereçamento (inerente,
// imediato 8/16, direto, estendido, indexado com postbyte, relativo 8/16, TFR/EXG e PSH/PUL).
// Opcodes indefinidos saem como "FCB $xx". Referências: datasheets MC6809E / livros 6809.

type Mode =
  | 'inh' | 'imm8' | 'imm16' | 'dir' | 'ext' | 'idx'
  | 'rel8' | 'rel16' | 'exg' | 'pshs' | 'pshu';

interface Op { m: string; mode: Mode }

const hx2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
const hx4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');

// --- Página 1 ---
const P1: Record<number, Op> = {
  0x00: { m: 'NEG', mode: 'dir' }, 0x03: { m: 'COM', mode: 'dir' }, 0x04: { m: 'LSR', mode: 'dir' },
  0x06: { m: 'ROR', mode: 'dir' }, 0x07: { m: 'ASR', mode: 'dir' }, 0x08: { m: 'LSL', mode: 'dir' },
  0x09: { m: 'ROL', mode: 'dir' }, 0x0A: { m: 'DEC', mode: 'dir' }, 0x0C: { m: 'INC', mode: 'dir' },
  0x0D: { m: 'TST', mode: 'dir' }, 0x0E: { m: 'JMP', mode: 'dir' }, 0x0F: { m: 'CLR', mode: 'dir' },
  0x12: { m: 'NOP', mode: 'inh' }, 0x13: { m: 'SYNC', mode: 'inh' }, 0x16: { m: 'LBRA', mode: 'rel16' },
  0x17: { m: 'LBSR', mode: 'rel16' }, 0x19: { m: 'DAA', mode: 'inh' }, 0x1A: { m: 'ORCC', mode: 'imm8' },
  0x1C: { m: 'ANDCC', mode: 'imm8' }, 0x1D: { m: 'SEX', mode: 'inh' }, 0x1E: { m: 'EXG', mode: 'exg' },
  0x1F: { m: 'TFR', mode: 'exg' },
  0x20: { m: 'BRA', mode: 'rel8' }, 0x21: { m: 'BRN', mode: 'rel8' }, 0x22: { m: 'BHI', mode: 'rel8' },
  0x23: { m: 'BLS', mode: 'rel8' }, 0x24: { m: 'BCC', mode: 'rel8' }, 0x25: { m: 'BCS', mode: 'rel8' },
  0x26: { m: 'BNE', mode: 'rel8' }, 0x27: { m: 'BEQ', mode: 'rel8' }, 0x28: { m: 'BVC', mode: 'rel8' },
  0x29: { m: 'BVS', mode: 'rel8' }, 0x2A: { m: 'BPL', mode: 'rel8' }, 0x2B: { m: 'BMI', mode: 'rel8' },
  0x2C: { m: 'BGE', mode: 'rel8' }, 0x2D: { m: 'BLT', mode: 'rel8' }, 0x2E: { m: 'BGT', mode: 'rel8' },
  0x2F: { m: 'BLE', mode: 'rel8' },
  0x30: { m: 'LEAX', mode: 'idx' }, 0x31: { m: 'LEAY', mode: 'idx' }, 0x32: { m: 'LEAS', mode: 'idx' },
  0x33: { m: 'LEAU', mode: 'idx' }, 0x34: { m: 'PSHS', mode: 'pshs' }, 0x35: { m: 'PULS', mode: 'pshs' },
  0x36: { m: 'PSHU', mode: 'pshu' }, 0x37: { m: 'PULU', mode: 'pshu' }, 0x39: { m: 'RTS', mode: 'inh' },
  0x3A: { m: 'ABX', mode: 'inh' }, 0x3B: { m: 'RTI', mode: 'inh' }, 0x3C: { m: 'CWAI', mode: 'imm8' },
  0x3D: { m: 'MUL', mode: 'inh' }, 0x3F: { m: 'SWI', mode: 'inh' },
  0x40: { m: 'NEGA', mode: 'inh' }, 0x43: { m: 'COMA', mode: 'inh' }, 0x44: { m: 'LSRA', mode: 'inh' },
  0x46: { m: 'RORA', mode: 'inh' }, 0x47: { m: 'ASRA', mode: 'inh' }, 0x48: { m: 'LSLA', mode: 'inh' },
  0x49: { m: 'ROLA', mode: 'inh' }, 0x4A: { m: 'DECA', mode: 'inh' }, 0x4C: { m: 'INCA', mode: 'inh' },
  0x4D: { m: 'TSTA', mode: 'inh' }, 0x4F: { m: 'CLRA', mode: 'inh' },
  0x50: { m: 'NEGB', mode: 'inh' }, 0x53: { m: 'COMB', mode: 'inh' }, 0x54: { m: 'LSRB', mode: 'inh' },
  0x56: { m: 'RORB', mode: 'inh' }, 0x57: { m: 'ASRB', mode: 'inh' }, 0x58: { m: 'LSLB', mode: 'inh' },
  0x59: { m: 'ROLB', mode: 'inh' }, 0x5A: { m: 'DECB', mode: 'inh' }, 0x5C: { m: 'INCB', mode: 'inh' },
  0x5D: { m: 'TSTB', mode: 'inh' }, 0x5F: { m: 'CLRB', mode: 'inh' },
  0x60: { m: 'NEG', mode: 'idx' }, 0x63: { m: 'COM', mode: 'idx' }, 0x64: { m: 'LSR', mode: 'idx' },
  0x66: { m: 'ROR', mode: 'idx' }, 0x67: { m: 'ASR', mode: 'idx' }, 0x68: { m: 'LSL', mode: 'idx' },
  0x69: { m: 'ROL', mode: 'idx' }, 0x6A: { m: 'DEC', mode: 'idx' }, 0x6C: { m: 'INC', mode: 'idx' },
  0x6D: { m: 'TST', mode: 'idx' }, 0x6E: { m: 'JMP', mode: 'idx' }, 0x6F: { m: 'CLR', mode: 'idx' },
  0x70: { m: 'NEG', mode: 'ext' }, 0x73: { m: 'COM', mode: 'ext' }, 0x74: { m: 'LSR', mode: 'ext' },
  0x76: { m: 'ROR', mode: 'ext' }, 0x77: { m: 'ASR', mode: 'ext' }, 0x78: { m: 'LSL', mode: 'ext' },
  0x79: { m: 'ROL', mode: 'ext' }, 0x7A: { m: 'DEC', mode: 'ext' }, 0x7C: { m: 'INC', mode: 'ext' },
  0x7D: { m: 'TST', mode: 'ext' }, 0x7E: { m: 'JMP', mode: 'ext' }, 0x7F: { m: 'CLR', mode: 'ext' },
  0x80: { m: 'SUBA', mode: 'imm8' }, 0x81: { m: 'CMPA', mode: 'imm8' }, 0x82: { m: 'SBCA', mode: 'imm8' },
  0x83: { m: 'SUBD', mode: 'imm16' }, 0x84: { m: 'ANDA', mode: 'imm8' }, 0x85: { m: 'BITA', mode: 'imm8' },
  0x86: { m: 'LDA', mode: 'imm8' }, 0x88: { m: 'EORA', mode: 'imm8' }, 0x89: { m: 'ADCA', mode: 'imm8' },
  0x8A: { m: 'ORA', mode: 'imm8' }, 0x8B: { m: 'ADDA', mode: 'imm8' }, 0x8C: { m: 'CMPX', mode: 'imm16' },
  0x8D: { m: 'BSR', mode: 'rel8' }, 0x8E: { m: 'LDX', mode: 'imm16' },
  0x90: { m: 'SUBA', mode: 'dir' }, 0x91: { m: 'CMPA', mode: 'dir' }, 0x92: { m: 'SBCA', mode: 'dir' },
  0x93: { m: 'SUBD', mode: 'dir' }, 0x94: { m: 'ANDA', mode: 'dir' }, 0x95: { m: 'BITA', mode: 'dir' },
  0x96: { m: 'LDA', mode: 'dir' }, 0x97: { m: 'STA', mode: 'dir' }, 0x98: { m: 'EORA', mode: 'dir' },
  0x99: { m: 'ADCA', mode: 'dir' }, 0x9A: { m: 'ORA', mode: 'dir' }, 0x9B: { m: 'ADDA', mode: 'dir' },
  0x9C: { m: 'CMPX', mode: 'dir' }, 0x9D: { m: 'JSR', mode: 'dir' }, 0x9E: { m: 'LDX', mode: 'dir' },
  0x9F: { m: 'STX', mode: 'dir' },
  0xA0: { m: 'SUBA', mode: 'idx' }, 0xA1: { m: 'CMPA', mode: 'idx' }, 0xA2: { m: 'SBCA', mode: 'idx' },
  0xA3: { m: 'SUBD', mode: 'idx' }, 0xA4: { m: 'ANDA', mode: 'idx' }, 0xA5: { m: 'BITA', mode: 'idx' },
  0xA6: { m: 'LDA', mode: 'idx' }, 0xA7: { m: 'STA', mode: 'idx' }, 0xA8: { m: 'EORA', mode: 'idx' },
  0xA9: { m: 'ADCA', mode: 'idx' }, 0xAA: { m: 'ORA', mode: 'idx' }, 0xAB: { m: 'ADDA', mode: 'idx' },
  0xAC: { m: 'CMPX', mode: 'idx' }, 0xAD: { m: 'JSR', mode: 'idx' }, 0xAE: { m: 'LDX', mode: 'idx' },
  0xAF: { m: 'STX', mode: 'idx' },
  0xB0: { m: 'SUBA', mode: 'ext' }, 0xB1: { m: 'CMPA', mode: 'ext' }, 0xB2: { m: 'SBCA', mode: 'ext' },
  0xB3: { m: 'SUBD', mode: 'ext' }, 0xB4: { m: 'ANDA', mode: 'ext' }, 0xB5: { m: 'BITA', mode: 'ext' },
  0xB6: { m: 'LDA', mode: 'ext' }, 0xB7: { m: 'STA', mode: 'ext' }, 0xB8: { m: 'EORA', mode: 'ext' },
  0xB9: { m: 'ADCA', mode: 'ext' }, 0xBA: { m: 'ORA', mode: 'ext' }, 0xBB: { m: 'ADDA', mode: 'ext' },
  0xBC: { m: 'CMPX', mode: 'ext' }, 0xBD: { m: 'JSR', mode: 'ext' }, 0xBE: { m: 'LDX', mode: 'ext' },
  0xBF: { m: 'STX', mode: 'ext' },
  0xC0: { m: 'SUBB', mode: 'imm8' }, 0xC1: { m: 'CMPB', mode: 'imm8' }, 0xC2: { m: 'SBCB', mode: 'imm8' },
  0xC3: { m: 'ADDD', mode: 'imm16' }, 0xC4: { m: 'ANDB', mode: 'imm8' }, 0xC5: { m: 'BITB', mode: 'imm8' },
  0xC6: { m: 'LDB', mode: 'imm8' }, 0xC8: { m: 'EORB', mode: 'imm8' }, 0xC9: { m: 'ADCB', mode: 'imm8' },
  0xCA: { m: 'ORB', mode: 'imm8' }, 0xCB: { m: 'ADDB', mode: 'imm8' }, 0xCC: { m: 'LDD', mode: 'imm16' },
  0xCE: { m: 'LDU', mode: 'imm16' },
  0xD0: { m: 'SUBB', mode: 'dir' }, 0xD1: { m: 'CMPB', mode: 'dir' }, 0xD2: { m: 'SBCB', mode: 'dir' },
  0xD3: { m: 'ADDD', mode: 'dir' }, 0xD4: { m: 'ANDB', mode: 'dir' }, 0xD5: { m: 'BITB', mode: 'dir' },
  0xD6: { m: 'LDB', mode: 'dir' }, 0xD7: { m: 'STB', mode: 'dir' }, 0xD8: { m: 'EORB', mode: 'dir' },
  0xD9: { m: 'ADCB', mode: 'dir' }, 0xDA: { m: 'ORB', mode: 'dir' }, 0xDB: { m: 'ADDB', mode: 'dir' },
  0xDC: { m: 'LDD', mode: 'dir' }, 0xDD: { m: 'STD', mode: 'dir' }, 0xDE: { m: 'LDU', mode: 'dir' },
  0xDF: { m: 'STU', mode: 'dir' },
  0xE0: { m: 'SUBB', mode: 'idx' }, 0xE1: { m: 'CMPB', mode: 'idx' }, 0xE2: { m: 'SBCB', mode: 'idx' },
  0xE3: { m: 'ADDD', mode: 'idx' }, 0xE4: { m: 'ANDB', mode: 'idx' }, 0xE5: { m: 'BITB', mode: 'idx' },
  0xE6: { m: 'LDB', mode: 'idx' }, 0xE7: { m: 'STB', mode: 'idx' }, 0xE8: { m: 'EORB', mode: 'idx' },
  0xE9: { m: 'ADCB', mode: 'idx' }, 0xEA: { m: 'ORB', mode: 'idx' }, 0xEB: { m: 'ADDB', mode: 'idx' },
  0xEC: { m: 'LDD', mode: 'idx' }, 0xED: { m: 'STD', mode: 'idx' }, 0xEE: { m: 'LDU', mode: 'idx' },
  0xEF: { m: 'STU', mode: 'idx' },
  0xF0: { m: 'SUBB', mode: 'ext' }, 0xF1: { m: 'CMPB', mode: 'ext' }, 0xF2: { m: 'SBCB', mode: 'ext' },
  0xF3: { m: 'ADDD', mode: 'ext' }, 0xF4: { m: 'ANDB', mode: 'ext' }, 0xF5: { m: 'BITB', mode: 'ext' },
  0xF6: { m: 'LDB', mode: 'ext' }, 0xF7: { m: 'STB', mode: 'ext' }, 0xF8: { m: 'EORB', mode: 'ext' },
  0xF9: { m: 'ADCB', mode: 'ext' }, 0xFA: { m: 'ORB', mode: 'ext' }, 0xFB: { m: 'ADDB', mode: 'ext' },
  0xFC: { m: 'LDD', mode: 'ext' }, 0xFD: { m: 'STD', mode: 'ext' }, 0xFE: { m: 'LDU', mode: 'ext' },
  0xFF: { m: 'STU', mode: 'ext' },
};

// --- Página 2 ($10 ..) ---
const P2: Record<number, Op> = {
  0x21: { m: 'LBRN', mode: 'rel16' }, 0x22: { m: 'LBHI', mode: 'rel16' }, 0x23: { m: 'LBLS', mode: 'rel16' },
  0x24: { m: 'LBCC', mode: 'rel16' }, 0x25: { m: 'LBCS', mode: 'rel16' }, 0x26: { m: 'LBNE', mode: 'rel16' },
  0x27: { m: 'LBEQ', mode: 'rel16' }, 0x28: { m: 'LBVC', mode: 'rel16' }, 0x29: { m: 'LBVS', mode: 'rel16' },
  0x2A: { m: 'LBPL', mode: 'rel16' }, 0x2B: { m: 'LBMI', mode: 'rel16' }, 0x2C: { m: 'LBGE', mode: 'rel16' },
  0x2D: { m: 'LBLT', mode: 'rel16' }, 0x2E: { m: 'LBGT', mode: 'rel16' }, 0x2F: { m: 'LBLE', mode: 'rel16' },
  0x3F: { m: 'SWI2', mode: 'inh' },
  0x83: { m: 'CMPD', mode: 'imm16' }, 0x8C: { m: 'CMPY', mode: 'imm16' }, 0x8E: { m: 'LDY', mode: 'imm16' },
  0x93: { m: 'CMPD', mode: 'dir' }, 0x9C: { m: 'CMPY', mode: 'dir' }, 0x9E: { m: 'LDY', mode: 'dir' }, 0x9F: { m: 'STY', mode: 'dir' },
  0xA3: { m: 'CMPD', mode: 'idx' }, 0xAC: { m: 'CMPY', mode: 'idx' }, 0xAE: { m: 'LDY', mode: 'idx' }, 0xAF: { m: 'STY', mode: 'idx' },
  0xB3: { m: 'CMPD', mode: 'ext' }, 0xBC: { m: 'CMPY', mode: 'ext' }, 0xBE: { m: 'LDY', mode: 'ext' }, 0xBF: { m: 'STY', mode: 'ext' },
  0xCE: { m: 'LDS', mode: 'imm16' },
  0xDE: { m: 'LDS', mode: 'dir' }, 0xDF: { m: 'STS', mode: 'dir' },
  0xEE: { m: 'LDS', mode: 'idx' }, 0xEF: { m: 'STS', mode: 'idx' },
  0xFE: { m: 'LDS', mode: 'ext' }, 0xFF: { m: 'STS', mode: 'ext' },
};

// --- Página 3 ($11 ..) ---
const P3: Record<number, Op> = {
  0x3F: { m: 'SWI3', mode: 'inh' },
  0x83: { m: 'CMPU', mode: 'imm16' }, 0x8C: { m: 'CMPS', mode: 'imm16' },
  0x93: { m: 'CMPU', mode: 'dir' }, 0x9C: { m: 'CMPS', mode: 'dir' },
  0xA3: { m: 'CMPU', mode: 'idx' }, 0xAC: { m: 'CMPS', mode: 'idx' },
  0xB3: { m: 'CMPU', mode: 'ext' }, 0xBC: { m: 'CMPS', mode: 'ext' },
};

const IDX_REG = ['X', 'Y', 'U', 'S'];
const TFR_REG: Record<number, string> = { 0: 'D', 1: 'X', 2: 'Y', 3: 'U', 4: 'S', 5: 'PC', 8: 'A', 9: 'B', 0xA: 'CC', 0xB: 'DP' };

// Símbolos de hardware do CoCo (endereços FIXOS por hardware — fatos, não código de terceiros).
// Operandos absolutos que caem aqui são nomeados (ex.: STA $FFDF → STA MAPRAM). Rotinas da ROM
// NÃO entram aqui de propósito: seus endereços devem sair das disassemblies "Unravelled" (docs do
// usuário), para não arriscar nomes errados. Ver [[coco-docs-and-basic-tokens]].
const SYMBOLS: Record<number, string> = {
  // PIA0 — teclado / joystick / HSYNC
  0xFF00: 'PIA0DA', 0xFF01: 'PIA0CA', 0xFF02: 'PIA0DB', 0xFF03: 'PIA0CB',
  // PIA1 — DAC / cassete / controle do VDG / impressora
  0xFF20: 'PIA1DA', 0xFF21: 'PIA1CA', 0xFF22: 'PIA1DB', 0xFF23: 'PIA1CB',
  // Controlador de disco / cartucho (também o registrador de banco do CocoFLASH)
  0xFF40: 'DSKREG',
  // GIME (CoCo 3): init / IRQ-FIRQ / timer / vídeo
  0xFF90: 'INIT0', 0xFF91: 'INIT1', 0xFF92: 'IRQENR', 0xFF93: 'FIRQENR',
  0xFF94: 'TMRMSB', 0xFF95: 'TMRLSB', 0xFF98: 'VMODE', 0xFF99: 'VRES',
  0xFF9A: 'BORDER', 0xFF9C: 'VSCROLL', 0xFF9D: 'VOFFMSB', 0xFF9E: 'VOFFLSB', 0xFF9F: 'HVOFF',
  // GIME MMU (páginas de 8K) — task 0 ($FFA0-7) e task 1 ($FFA8-F)
  0xFFA0: 'MMU0', 0xFFA1: 'MMU1', 0xFFA2: 'MMU2', 0xFFA3: 'MMU3',
  0xFFA4: 'MMU4', 0xFFA5: 'MMU5', 0xFFA6: 'MMU6', 0xFFA7: 'MMU7',
  0xFFA8: 'MMU8', 0xFFA9: 'MMU9', 0xFFAA: 'MMU10', 0xFFAB: 'MMU11',
  0xFFAC: 'MMU12', 0xFFAD: 'MMU13', 0xFFAE: 'MMU14', 0xFFAF: 'MMU15',
  // GIME paleta (16 registradores)
  0xFFB0: 'PAL0', 0xFFB1: 'PAL1', 0xFFB2: 'PAL2', 0xFFB3: 'PAL3', 0xFFB4: 'PAL4', 0xFFB5: 'PAL5',
  0xFFB6: 'PAL6', 0xFFB7: 'PAL7', 0xFFB8: 'PAL8', 0xFFB9: 'PAL9', 0xFFBA: 'PAL10', 0xFFBB: 'PAL11',
  0xFFBC: 'PAL12', 0xFFBD: 'PAL13', 0xFFBE: 'PAL14', 0xFFBF: 'PAL15',
  // SAM (MC6883): velocidade da CPU e tipo de mapa de memória (ROM x all-RAM — usado no loader 2 estágios)
  0xFFD8: 'SAMSLOW', 0xFFD9: 'SAMFAST', 0xFFDE: 'MAPROM', 0xFFDF: 'MAPRAM',
  // Vetores de interrupção do 6809
  0xFFF2: 'VSWI3', 0xFFF4: 'VSWI2', 0xFFF6: 'VFIRQ', 0xFFF8: 'VIRQ',
  0xFFFA: 'VSWI', 0xFFFC: 'VNMI', 0xFFFE: 'VRESET',
};

function s8(b: number) { return b < 0x80 ? b : b - 0x100; }
function s16(w: number) { return w < 0x8000 ? w : w - 0x10000; }
function soff(n: number) { return (n < 0 ? '-$' + hx2(-n) : '$' + hx2(n)); }

export interface DisasmLine {
  addr: number;
  bytes: number[];
  text: string;
  target?: number;  // endereço absoluto referenciado (desvio/chamada/ext) — substituído no operando
  ref?: number;     // endereço referenciado via ,PCR — anotado como comentário "; →NOME" (operando é offset)
  label?: string;   // se preenchido com bytes vazios, a linha é um marcador de label "NOME:"
  run?: number;     // linha de dados colapsada — nº de repetições (a coluna de bytes vira "N×…")
  period?: number;  // bytes por unidade repetida (1 = byte idêntico; 2-4 = tile periódico de gráfico)
}

// Decodifica o operando indexado (postbyte em p[i]); retorna [texto, bytesConsumidos, offsetPCR?].
// offsetPCR (com sinal) só vem nos modos ,PCR — o chamador soma ao PC pra achar o alvo absoluto.
function decodeIndexed(p: Uint8Array, i: number): [string, number, number?] {
  const pb = p[i]; let n = 1;
  const reg = IDX_REG[(pb >> 5) & 3];
  if ((pb & 0x80) === 0) { // offset de 5 bits com sinal
    let off = pb & 0x1F; if (off & 0x10) off -= 0x20;
    return [`${soff(off)},${reg}`, n];
  }
  const indirect = (pb & 0x10) !== 0;
  const type = pb & 0x0F;
  let inner = ''; let pcrOff: number | undefined;
  switch (type) {
    case 0x0: inner = `,${reg}+`; break;
    case 0x1: inner = `,${reg}++`; break;
    case 0x2: inner = `,-${reg}`; break;
    case 0x3: inner = `,--${reg}`; break;
    case 0x4: inner = `,${reg}`; break;
    case 0x5: inner = `B,${reg}`; break;
    case 0x6: inner = `A,${reg}`; break;
    case 0x8: { const o = s8(p[i + 1]); inner = `${soff(o)},${reg}`; n += 1; break; }
    case 0x9: { const o = s16((p[i + 1] << 8) | p[i + 2]); inner = `${o < 0 ? '-$' + hx4(-o) : '$' + hx4(o)},${reg}`; n += 2; break; }
    case 0xB: inner = `D,${reg}`; break;
    case 0xC: { const o = s8(p[i + 1]); inner = `${soff(o)},PCR`; pcrOff = o; n += 1; break; }
    case 0xD: { const o = s16((p[i + 1] << 8) | p[i + 2]); inner = `${o < 0 ? '-$' + hx4(-o) : '$' + hx4(o)},PCR`; pcrOff = o; n += 2; break; }
    case 0xF: { const a = (p[i + 1] << 8) | p[i + 2]; inner = `$${hx4(a)}`; n += 2; break; } // só indireto: [$addr]
    default: inner = `?${hx2(pb)}`; break;
  }
  return [indirect ? `[${inner}]` : inner, n, pcrOff];
}

function regList(pb: number, stackU: boolean): string {
  const names = ['CC', 'A', 'B', 'DP', 'X', 'Y', stackU ? 'U' : 'S', 'PC'];
  const out: string[] = [];
  for (let b = 0; b < 8; b++) if (pb & (1 << b)) out.push(names[b]);
  return out.join(',');
}

// Desmonta uma instrução a partir do offset i (p = bytes, base = endereço de carga).
// Retorna [DisasmLine, próximoOffset].
function decodeOne(p: Uint8Array, i: number, base: number): [DisasmLine, number] {
  const start = i;
  const addr = base + i;
  let op = P1[p[i]]; let i2 = i + 1;
  if (p[i] === 0x10) { op = P2[p[i + 1]]; i2 = i + 2; }
  else if (p[i] === 0x11) { op = P3[p[i + 1]]; i2 = i + 2; }

  if (!op) { // opcode indefinido → FCB
    return [{ addr, bytes: [p[i]], text: `FCB   $${hx2(p[i])}` }, i + 1 ];
  }

  let operand = '';
  let target: number | undefined;  // alvo absoluto p/ ext e relativos (vira label/símbolo no operando)
  let ref: number | undefined;     // alvo absoluto p/ ,PCR (vira comentário "; →NOME")
  let j = i2;
  switch (op.mode) {
    case 'inh': break;
    case 'imm8': operand = `#$${hx2(p[j])}`; j += 1; break;
    case 'imm16': operand = `#$${hx4((p[j] << 8) | p[j + 1])}`; j += 2; break;
    case 'dir': operand = `<$${hx2(p[j])}`; j += 1; break;  // dir depende do DP → não vira label
    case 'ext': { const a = ((p[j] << 8) | p[j + 1]) & 0xFFFF; operand = `$${hx4(a)}`; target = a; j += 2; break; }
    case 'idx': {
      const [t, n, pcrOff] = decodeIndexed(p, j); operand = t;
      // ,PCR: alvo = PC após a instrução (base + fim) + offset
      if (pcrOff !== undefined) ref = (base + j + n + pcrOff) & 0xFFFF;
      j += n; break;
    }
    case 'rel8': { const t = (base + (j + 1) + s8(p[j])) & 0xFFFF; operand = `$${hx4(t)}`; target = t; j += 1; break; }
    case 'rel16': { const t = (base + (j + 2) + s16((p[j] << 8) | p[j + 1])) & 0xFFFF; operand = `$${hx4(t)}`; target = t; j += 2; break; }
    case 'exg': operand = `${TFR_REG[(p[j] >> 4) & 0xF] || '?'},${TFR_REG[p[j] & 0xF] || '?'}`; j += 1; break;
    case 'pshs': operand = regList(p[j], true); j += 1; break;
    case 'pshu': operand = regList(p[j], false); j += 1; break;
  }
  const bytes: number[] = [];
  for (let k = start; k < j; k++) bytes.push(p[k]);
  const text = operand ? `${op.m.padEnd(5)} ${operand}` : op.m;
  return [{ addr, bytes, text, target, ref }, j];
}

// Pós-processo: nomeia operandos absolutos. Endereços de hardware viram símbolos (SYMBOLS);
// alvos internos (que começam exatamente numa linha) viram labels "L####" com marcador no destino.
// Só substitui quando há um destino real, então o nome nunca é ambíguo (o hex sempre está no L####).
function annotate(out: DisasmLine[]): DisasmLine[] {
  const lineStart = new Set(out.map(l => l.addr));
  const internal = new Set<number>();
  const nameOf = (t: number): string | null => SYMBOLS[t] || (lineStart.has(t) ? 'L' + hx4(t) : null);
  for (const l of out) {
    if (l.target != null) { // ext/relativo: substitui o operando hex pelo símbolo/label
      const sym = SYMBOLS[l.target];
      if (sym) l.text = l.text.replace('$' + hx4(l.target), sym);
      else if (lineStart.has(l.target)) { l.text = l.text.replace('$' + hx4(l.target), 'L' + hx4(l.target)); internal.add(l.target); }
    }
    if (l.ref != null) { // ,PCR: operando é offset → anota o alvo resolvido como comentário
      const name = nameOf(l.ref);
      if (name) { l.text += `  ; →${name}`; if (!SYMBOLS[l.ref]) internal.add(l.ref); }
    }
  }
  if (!internal.size) return out;
  const res: DisasmLine[] = [];
  for (const l of out) {
    if (internal.has(l.addr)) res.push({ addr: l.addr, bytes: [], text: '', label: 'L' + hx4(l.addr) });
    res.push(l);
  }
  return res;
}

/** Desmonta o buffer inteiro (varredura linear) a partir do endereço de carga `base`. */
export function disassemble(buf: Uint8Array, base = 0): DisasmLine[] {
  const out: DisasmLine[] = [];
  let i = 0; let guard = 0;
  while (i < buf.length && guard++ < 200000) {
    // Garante que há bytes suficientes; perto do fim, emite FCB para o que sobrar.
    const before = i;
    try {
      const [line, next] = decodeOne(buf, i, base);
      if (next > buf.length) { // instrução truncada no fim do buffer → FCB do byte
        out.push({ addr: base + i, bytes: [buf[i]], text: `FCB   $${hx2(buf[i])}` });
        i += 1;
      } else { out.push(line); i = next; }
    } catch {
      out.push({ addr: base + i, bytes: [buf[i]], text: `FCB   $${hx2(buf[i])}` });
      i += 1;
    }
    if (i <= before) i = before + 1; // nunca trava
  }
  return annotate(out);
}

// ───────────────────────────────────────────────────────────────────────────
// Desmontagem "inteligente": recursive-descent a partir dos pontos de entrada
// (segue o fluxo) + detecção de dados/strings nos bytes não alcançados por código.
// Reduz drasticamente o problema de texto do jogo (ex.: "LEVEL") virar instruções.
// ───────────────────────────────────────────────────────────────────────────

// Info de fluxo de uma instrução: tamanho, alvos de desvio (abs) e se "cai" na próxima.
function flowInfo(buf: Uint8Array, i: number, base: number): { len: number; targets: number[]; fall: boolean } {
  const [, next] = decodeOne(buf, i, base);
  const len = next - i;
  let op = P1[buf[i]]; let opnd = i + 1;
  if (buf[i] === 0x10) { op = P2[buf[i + 1]]; opnd = i + 2; }
  else if (buf[i] === 0x11) { op = P3[buf[i + 1]]; opnd = i + 2; }
  if (!op) return { len, targets: [], fall: false }; // opcode inválido alcançado → encerra esse fluxo
  const m = op.m; const mode = op.mode;
  const targets: number[] = [];
  let fall = true;
  if (mode === 'rel8' || mode === 'rel16') {
    const t = mode === 'rel8'
      ? (base + (opnd + 1) + s8(buf[opnd])) & 0xFFFF
      : (base + (opnd + 2) + s16(((buf[opnd] << 8) | buf[opnd + 1]))) & 0xFFFF;
    targets.push(t);
    if (m === 'BRA' || m === 'LBRA') fall = false; // desvio incondicional não cai
  } else if (m === 'JMP') {
    fall = false;
    if (mode === 'ext') targets.push(((buf[opnd] << 8) | buf[opnd + 1]) & 0xFFFF);
  } else if (m === 'JSR') {
    if (mode === 'ext') targets.push(((buf[opnd] << 8) | buf[opnd + 1]) & 0xFFFF);
  } else if (m === 'RTS' || m === 'RTI') {
    fall = false;
  }
  return { len, targets, fall };
}

const isPrintable = (b: number) => b >= 0x20 && b <= 0x7E && b !== 0x22; // exclui " p/ FCC simples
const REPEAT_MIN = 6; // ≥6 bytes idênticos → colapsa numa única linha (ex.: padding $FF)
const TILE_MIN = 8;   // ≥8 bytes formando um padrão periódico de 2-4 bytes → dados (linha de gráfico)

const printRun = (buf: Uint8Array, p: number, to: number) => { let r = 0; while (p + r < to && isPrintable(buf[p + r])) r++; return r; };
const sameRun = (buf: Uint8Array, p: number, to: number) => { const v = buf[p]; let r = 0; while (p + r < to && buf[p + r] === v) r++; return r; };

// Maior run periódico (período 2..4) a partir de p. Captura tiles de gráfico ("00 C0 00 C0…",
// "55 AA 55 AA…"). Retorna {len, period} com len múltiplo do período (≥TILE_MIN), ou len 0.
// Runs de byte idêntico já foram tratados antes (sameRun), então o período aqui é sempre real.
function tileRun(buf: Uint8Array, p: number, to: number): { len: number; period: number } {
  let best = { len: 0, period: 0 };
  for (let k = 2; k <= 4; k++) {
    if (p + 2 * k > to) continue; // precisa de ao menos 2 unidades
    let r = k;
    while (p + r < to && buf[p + r] === buf[p + (r % k)]) r++;
    const len = Math.floor(r / k) * k;
    if (len >= TILE_MIN && len > best.len) best = { len, period: k };
  }
  return best;
}

// Emite uma string como FCC "...".
function pushStr(buf: Uint8Array, i: number, r: number, base: number, out: DisasmLine[]) {
  const bytes: number[] = []; let s = '';
  for (let k = 0; k < r; k++) { bytes.push(buf[i + k]); s += String.fromCharCode(buf[i + k]); }
  out.push({ addr: base + i, bytes, text: `FCC   "${s}"` });
}
// Emite um run de bytes idênticos de forma compacta (uma linha "N×$XX").
function pushRun(buf: Uint8Array, i: number, r: number, base: number, out: DisasmLine[]) {
  const bytes: number[] = []; for (let k = 0; k < r; k++) bytes.push(buf[i + k]);
  out.push({ addr: base + i, bytes, text: `FCB   $${hx2(buf[i])}`, run: r, period: 1 });
}
// Emite um tile periódico de forma compacta (uma linha "N×[$xx$yy]").
function pushTile(buf: Uint8Array, i: number, len: number, period: number, base: number, out: DisasmLine[]) {
  const bytes: number[] = []; for (let k = 0; k < len; k++) bytes.push(buf[i + k]);
  const unit = bytes.slice(0, period).map(b => '$' + hx2(b)).join(',');
  out.push({ addr: base + i, bytes, text: `FCB   ${unit}`, run: len / period, period });
}

// Emite um run imprimível [i, i+r) como string, mas se ela termina em $00 (forte sinal de string)
// descasca até 2 bytes iniciais "fracos" — minúscula/pontuação, NUNCA dígito/maiúscula/espaço —
// como FCB. Isso remove o prefixo de coordenada (ex.: "hHIGH"→FCB $68 + "HIGH"; "$BONUS"→"BONUS").
const STR_FLOOR = 3; // após descascar, a string ainda precisa ter ≥3 chars
function emitStringRun(buf: Uint8Array, i: number, r: number, to: number, base: number, out: DisasmLine[]) {
  const terminated = (i + r >= to) || buf[i + r] === 0x00;
  let s = i, len = r, peeled = 0;
  while (terminated && peeled < 2 && len - 1 >= STR_FLOOR) {
    const c = buf[s];
    const weak = c >= 0x21 && c <= 0x7E && !(c >= 0x41 && c <= 0x5A) && !(c >= 0x30 && c <= 0x39);
    if (!weak) break;
    out.push({ addr: base + s, bytes: [c], text: `FCB   $${hx2(c)}` });
    s++; len--; peeled++;
  }
  pushStr(buf, s, len, base, out);
}

// Emite os bytes de dados [from,to): strings (≥4) viram FCC; runs longos colapsam; o resto, FCB.
function emitData(buf: Uint8Array, from: number, to: number, base: number, out: DisasmLine[]) {
  const MIN = 4;
  let i = from;
  while (i < to) {
    const same = sameRun(buf, i, to);
    if (same >= REPEAT_MIN) { pushRun(buf, i, same, base, out); i += same; continue; }
    const tile = tileRun(buf, i, to);
    if (tile.len) { pushTile(buf, i, tile.len, tile.period, base, out); i += tile.len; continue; }
    const r = printRun(buf, i, to);
    if (r >= MIN) { emitStringRun(buf, i, r, to, base, out); i += r; continue; }
    const start = i; const bytes: number[] = [];
    while (i < to && bytes.length < 8 && printRun(buf, i, to) < MIN && sameRun(buf, i, to) < REPEAT_MIN) { bytes.push(buf[i]); i++; }
    if (!bytes.length) { bytes.push(buf[i]); i++; } // garante progresso
    out.push({ addr: base + start, bytes, text: `FCB   ${bytes.map(b => '$' + hx2(b)).join(',')}` });
  }
}

// Emite a região [from,to) de forma LINEAR: desmonta como código, mas detecta strings e runs
// de dados. Usado quando o fluxo praticamente falhou (loader que remapeia/relocaliza), para
// não esconder o corpo do programa como um "mar de FCB". Instruções que cruzam `to` viram FCB.
function emitLinear(buf: Uint8Array, from: number, to: number, base: number, out: DisasmLine[]) {
  let i = from; let guard = 0;
  while (i < to && guard++ < 200000) {
    const same = sameRun(buf, i, to);
    if (same >= REPEAT_MIN) { pushRun(buf, i, same, base, out); i += same; continue; }
    const tile = tileRun(buf, i, to);
    if (tile.len) { pushTile(buf, i, tile.len, tile.period, base, out); i += tile.len; continue; }
    const r = printRun(buf, i, to);
    if (r >= 5) { emitStringRun(buf, i, r, to, base, out); i += r; continue; } // limiar maior p/ não comer código
    try {
      const [line, next] = decodeOne(buf, i, base);
      // Guarda anti-engolir: se a instrução cruzaria o início de uma string clara logo à frente,
      // não a decodifica inteira — emite os bytes até a string como FCB (ex.: "1E 50" EXG não come o 'P').
      let cut = next;
      for (let j = i + 1; j < next; j++) { if (printRun(buf, j, to) >= 5) { cut = j; break; } }
      if (cut < next) {
        const bytes: number[] = []; for (let k = i; k < cut; k++) bytes.push(buf[k]);
        out.push({ addr: base + i, bytes, text: `FCB   ${bytes.map(b => '$' + hx2(b)).join(',')}` });
        i = cut; continue;
      }
      if (next > to) { out.push({ addr: base + i, bytes: [buf[i]], text: `FCB   $${hx2(buf[i])}` }); i += 1; }
      else { out.push(line); i = next > i ? next : i + 1; }
    } catch { out.push({ addr: base + i, bytes: [buf[i]], text: `FCB   $${hx2(buf[i])}` }); i += 1; }
  }
}

/**
 * Desmontagem por fluxo: parte de `entries` (endereços absolutos; ex.: exec do .BIN) e do
 * offset 0, seguindo desvios/chamadas; o que não é alcançado vira dados (FCB/FCC).
 */
export interface DisasmOpts {
  dataRanges?: Array<[number, number]>; // intervalos de OFFSET forçados como dados (marcação manual)
  codeOffsets?: number[];               // OFFSETs extras forçados como início de código (entradas manuais)
}

export function disassembleSmart(buf: Uint8Array, base = 0, entries: number[] = [], opts: DisasmOpts = {}): DisasmLine[] {
  const n = buf.length;
  const codeStart = new Set<number>();
  const seen = new Uint8Array(n);
  // Bytes marcados manualmente como DADOS: o fluxo não entra neles (nunca viram código).
  const forced = new Uint8Array(n);
  for (const [s, e] of opts.dataRanges || []) {
    const a = Math.max(0, Math.min(s, e)); const b = Math.min(n - 1, Math.max(s, e));
    for (let k = a; k <= b; k++) forced[k] = 1;
  }
  const stack: number[] = [];
  const push = (off: number) => { if (off >= 0 && off < n && !seen[off] && !forced[off]) stack.push(off); };
  for (const e of entries) push(e - base);
  for (const o of opts.codeOffsets || []) push(o); // entradas de código marcadas pelo usuário
  push(0); // .BIN normalmente começa com código
  let guard = 0;
  while (stack.length && guard++ < 500000) {
    const i = stack.pop() as number;
    if (i < 0 || i >= n || seen[i] || forced[i]) continue;
    seen[i] = 1; codeStart.add(i);
    const { len, targets, fall } = flowInfo(buf, i, base);
    for (const t of targets) push(t - base);
    if (fall) push(i + len);
  }
  // Cobertura: fração do buffer alcançada como código pelo fluxo. Se for muito baixa, o fluxo
  // praticamente falhou (ex.: loader que remapeia via MMU e dá JMP p/ fora) — nesse caso as
  // regiões não-alcançadas são desmontadas LINEARMENTE em vez de viram um "mar de FCB".
  let codeBytes = 0;
  for (const s of codeStart) { const [ln] = decodeOne(buf, s, base); codeBytes += ln.bytes.length; }
  const coverage = n ? codeBytes / n : 0;
  const sparse = coverage < 0.15; // limiar (ajustável): abaixo disso, varre o resto como código

  const out: DisasmLine[] = [];
  let i = 0; let g = 0;
  while (i < n && g++ < 500000) {
    if (codeStart.has(i)) {
      const [line, next] = decodeOne(buf, i, base);
      out.push(line); i = next > i ? next : i + 1;
    } else {
      let j = i; while (j < n && !codeStart.has(j)) j++;
      (sparse ? emitLinear : emitData)(buf, i, j, base, out); i = j;
    }
  }
  const res = annotate(out) as DisasmLine[] & { coverage: number; sparse: boolean };
  res.coverage = coverage; res.sparse = sparse;
  return res;
}

// Largura fixa da coluna de bytes — cabe a maior instrução do 6809 (5 bytes = "XX XX XX XX XX").
// Linhas de dados com mais bytes são capadas com "…" para os mnemônicos/diretivas sempre alinharem.
const BYTECOL = 15;

/** Formata uma linha como texto "ADDR  BYTES(fixo)  MNEM OPERAND" (ou "NOME:" p/ marcadores de label). */
export function formatLine(l: DisasmLine): string {
  if (l.bytes.length === 0 && l.label) return `${l.label}:`;
  let col: string;
  if (l.run) { // dado colapsado: "N×$XX" (byte) ou "N×[$xx$yy]" (tile) em vez de despejar tudo
    const period = l.period || 1;
    col = period === 1
      ? `${l.run}×$${hx2(l.bytes[0])}`
      : `${l.run}×[${l.bytes.slice(0, period).map(hx2).join('')}]`;
  } else if (l.bytes.length > 5) { // dado longo (FCC/FCB): mostra os 4 primeiros + "…"
    col = l.bytes.slice(0, 4).map(hx2).join(' ') + '…';
  } else {
    col = l.bytes.map(hx2).join(' ');
  }
  const tail = l.run ? `  ; ×${l.run}` : '';
  return `${hx4(l.addr)}  ${col.padEnd(BYTECOL)}  ${l.text}${tail}`;
}
