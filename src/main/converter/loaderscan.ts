// loaderscan.ts — DETECTOR de loaders de fita (multi-softhouse, PLUGÁVEL).
//   Família A — SoftKristian (scanSoftKristian): tela 512B + CLOADM ×2 → conversível p/ BIN/DSK sem loader.
//   Família B — PLAN-SOFT/GAMEPACK (scanPlanSoft): multi-parte, controle de motor em assembly + leitura de
//     bloco própria (JSR $A70B BLKIN) + menu interativo + encadeamento de EXEC. Jogos all-RAM (>32K): o .CAS
//     FIEL roda em tempo real no XRoar; a conversão p/ DISCO desta família é PROJETO FUTURO (precisa do
//     flip-flop SAM TY $FFDE/$FFDF). Aqui só DETECTAMOS e informamos.
//   `scanLoaders()` roda os perfis em ordem e devolve o resultado unificado (+ família + conversível).
//
// Família A — As fitas SoftKristian com tela de abertura seguem todas o mesmo método (confirmado em 41 amostras):
//   - 4 segmentos (namefile / loader / tela+código / programa);
//   - reentram no CLOADM da ROM via `JSR $A529` (ou irmão `$A511`, ambos dentro de $A4FE–$A53D) DUAS
//     vezes: 1ª lê a tela+código, 2ª lê o programa;
//   - a TELA são 512 bytes copiados para $0400 (idioma `LDU #$0400` = CE 04 00);
//   - o ENDEREÇO DE CARGA do programa vem do `LDX #imm` (8E hh ll) antes da 2ª leitura — e VARIA por
//     título (ex.: QUASAR $3FFE, STINGER $0F00, grabber $1E00…);
//   - o EXEC é o `JMP ,X` (6E 84) final do estágio, ~= endereço de carga do programa.
// Este módulo só EXTRAI os endereços; o `loaderpak.ts` monta o BIN/DSK (stub+trap+assinatura).
// Futuro (memory/loader-conversion-roadmap.md): perfis de outras softhouses; recuperação de fita ruim.

import { decodeCasTapeGapAware } from './wav';

export interface SoftKristianProfile {
  isSoftKristian: boolean; // fingerprint bateu?
  confidence: number;      // 0..1
  telaLoad: number;        // sempre $0400
  telaLen: number;         // 512
  screen: Buffer;          // os 512 bytes da tela
  progLoad: number;        // detectado (varia por título)
  progExec: number;        // detectado (~= progLoad)
  program: Buffer;         // bytes do programa principal
  cloadmCalls: number;     // nº de JSR para o CLOADM ($A4FE–$A53D)
  name: string;            // nome do arquivo na fita (namefile)
  notes: string[];
}

// Concatena os bytes de DATA (type 1) de um segmento gap-aware.
function segBytes(blocks: Array<{ type: number; data: number[] | Buffer }>): Buffer {
  const a: number[] = [];
  for (const b of blocks) if (b.type === 1) a.push(...(b.data as any));
  return Buffer.from(a);
}

// É uma chamada de leitura de fita (reentrada no CLOADM)? JSR ($BD) com alvo em $A4FE–$A53D.
function isCloadmJsr(p: Buffer, i: number): number | null {
  if (p[i] !== 0xBD) return null;
  const t = (p[i + 1] << 8) | p[i + 2];
  return t >= 0xA4FE && t <= 0xA53D ? t : null;
}

// Procura o `LDX #imm` (8E hh ll) mais próximo ANTES da posição `pos` (até `win` bytes atrás) cujo
// imediato seja um endereço de RAM plausível (>= $0400). Devolve o endereço ou null.
function ldxBefore(p: Buffer, pos: number, win = 12): number | null {
  for (let b = 2; b <= win; b++) {
    const i = pos - b;
    if (i < 0) break;
    if (p[i] === 0x8E) {
      const v = (p[i + 1] << 8) | p[i + 2];
      if (v >= 0x0400 && v < 0x8000) return v;
    }
  }
  return null;
}

// Analisa uma fita (.wav já em buffer) e, se for o loader SoftKristian, devolve o perfil com os
// endereços. Retorna null se não houver dados decodificáveis.
export function scanSoftKristian(wavBuffer: Buffer, opts?: any): SoftKristianProfile | null {
  const r = decodeCasTapeGapAware(wavBuffer, opts || {});
  if (!r.foundSync || !r.payload || !r.payload.length) return null;
  const notes: string[] = [];

  // bytes por segmento (só DATA): [loader, tela+código, programa]
  const segData = (r.segs as any[]).map(segBytes).filter((b: Buffer) => b.length > 0);

  // TELA: segmento cujos 1os 512B são majoritariamente semigráficos ($80–$FF).
  let screenSeg: Buffer | null = null, screen: Buffer | null = null;
  for (const d of segData) {
    if (d.length >= 512) { let hi = 0; for (let i = 0; i < 512; i++) if (d[i] >= 0x80) hi++; if (hi > 300) { screenSeg = d; screen = d.subarray(0, 512); break; } }
  }
  // PROGRAMA = maior segmento que NÃO é a tela.
  let program: Buffer = Buffer.alloc(0);
  for (const d of segData) if (d.length > program.length && d !== screenSeg) program = d;

  // CÓDIGO DO LOADER = todos os segmentos exceto o programa, e da tela só o RABO de código (sem os 512B
  // de pixels). É AQUI que os idiomas de endereço vivem — escopar evita pegar `6E 84`/`8E` em dados.
  const code = Buffer.concat(segData
    .filter(d => d !== program)
    .map(d => d === screenSeg ? d.subarray(512) : d));

  // Fingerprint + endereços, SÓ no código do loader.
  const cloadmPos: Array<{ pos: number; tgt: number }> = [];
  for (let i = 0; i < code.length - 2; i++) { const t = isCloadmJsr(code, i); if (t !== null) cloadmPos.push({ pos: i, tgt: t }); }
  let hasScreenCopy = false;
  for (let i = 0; i < code.length - 2; i++) if (code[i] === 0xCE && code[i + 1] === 0x04 && code[i + 2] === 0x00) { hasScreenCopy = true; break; }

  // carga do programa = LDX# antes da ÚLTIMA chamada ao CLOADM.
  let progLoad = 0;
  if (cloadmPos.length) { const v = ldxBefore(code, cloadmPos[cloadmPos.length - 1].pos); if (v) progLoad = v; }
  // EXEC = LDX# antes do `JMP ,X` (6E 84) — agora só no código; senão = progLoad.
  let progExec = 0;
  for (let i = 0; i < code.length - 1; i++) if (code[i] === 0x6E && code[i + 1] === 0x84) { const v = ldxBefore(code, i); if (v) progExec = v; }
  if (!progExec) progExec = progLoad;

  // Assinatura FORTE do loader SoftKristian (1º estágio, idêntico em todos os títulos): `LDX #$0600`
  // (8E 06 00) + `JMP $0800` (7E 08 00), com a leitura CLOADM no meio. Confirma SoftKristian mesmo
  // quando a tela/programa só decodificaram em parte (fita degradada).
  const has3 = (a: number, b: number, c: number) => { for (let i = 0; i < code.length - 2; i++) if (code[i] === a && code[i + 1] === b && code[i + 2] === c) return true; return false; };
  const stubSig = has3(0x8E, 0x06, 0x00) && has3(0x7E, 0x08, 0x00);

  // confiança: assinatura do stub OU (>=2 CLOADM + cópia de tela + tela completa).
  const fp = stubSig || (cloadmPos.length >= 2 && hasScreenCopy && !!screen);
  if (stubSig) notes.push('assinatura do loader SoftKristian (LDX #$0600 / JMP $0800)');
  if (!fp) notes.push('fingerprint parcial — confirmar manualmente');
  if (fp && (!screen || screen.length < 512)) notes.push('TELA incompleta (fita possivelmente degradada) — pode não gerar corretamente');
  if (!progLoad) notes.push('endereço de carga do programa não detectado — informar manualmente');
  if (cloadmPos.length) notes.push(`${cloadmPos.length} chamada(s) ao CLOADM (${[...new Set(cloadmPos.map(c => '$' + c.tgt.toString(16).toUpperCase()))].join(',')})`);
  let confidence = 0;
  if (stubSig) confidence += 0.4;
  if (cloadmPos.length >= 2) confidence += 0.3;
  if (hasScreenCopy && screen && screen.length >= 512) confidence += 0.2;
  if (progLoad) confidence += 0.1;

  return {
    isSoftKristian: fp,
    confidence: Math.min(1, confidence),
    telaLoad: 0x0400,
    telaLen: screen ? screen.length : 0,
    screen: screen || Buffer.alloc(0),
    progLoad, progExec, program,
    cloadmCalls: cloadmPos.length,
    name: (r.files && r.files[0] && r.files[0].name) ? String(r.files[0].name) : 'FILE',
    notes,
  };
}

// ───────── Família B — PLAN-SOFT / GAMEPACK (multi-parte, motor + BLKIN) ─────────
// Diferente da SoftKristian: o loader controla o MOTOR da fita em assembly e usa a rotina de leitura de
// BLOCO da ROM (`JSR $A70B` BLKIN) num laço próprio, além de CSRDON/spin-up/motor-off, menu interativo e
// encadeamento de EXEC (`JMP [$009D]`). O jogo é multi-parte (vários namefiles na fita) e tipicamente
// all-RAM (>32K) → a conversão p/ disco NÃO é feita aqui (CAS fiel já roda no XRoar). Só detectamos.
export interface PlanSoftProfile {
  isPlanSoft: boolean;
  confidence: number;   // 0..1
  parts: number;        // nº de namefiles (partes) na fita
  name: string;
  romCalls: string[];   // rotinas de cassete da ROM encontradas (rótulos)
  program: Buffer;      // maior segmento de DATA (referência)
  notes: string[];
}

// Acha a 1ª ocorrência da sequência de bytes `seq` em `p` (ou -1).
function findSeq(p: Buffer, seq: number[]): number {
  outer: for (let i = 0; i + seq.length <= p.length; i++) {
    for (let k = 0; k < seq.length; k++) if (p[i + k] !== seq[k]) continue outer;
    return i;
  }
  return -1;
}

export function scanPlanSoft(wavBuffer: Buffer, opts?: any): PlanSoftProfile | null {
  const r = decodeCasTapeGapAware(wavBuffer, opts || {});
  if (!r.foundSync || !r.payload || !r.payload.length) return null;

  // TODOS os bytes de DATA (o loader vive nas partes; as assinaturas de chamada à ROM de cassete são
  // específicas o bastante para não dar falso-positivo no meio dos dados do jogo).
  const segData = (r.segs as any[]).map(segBytes).filter((b: Buffer) => b.length > 0);
  const code = Buffer.concat(segData);
  let program: Buffer = Buffer.alloc(0);
  for (const d of segData) if (d.length > program.length) program = d;

  const parts = Array.isArray(r.files) ? r.files.length : 0;

  // Assinaturas das rotinas de cassete da ROM (BD = JSR estendido) — o DISCRIMINADOR-CHAVE vs SoftKristian
  // é o BLKIN ($A70B) num laço de leitura próprio + o controle de MOTOR (a SoftKristian não tem nenhum).
  const has = (seq: number[]) => findSeq(code, seq) >= 0;
  const romHits: Array<{ key: string; label: string; strong: boolean }> = [];
  if (has([0xBD, 0xA7, 0x0B])) romHits.push({ key: 'BLKIN', label: 'BLKIN $A70B (leitura de bloco própria)', strong: true });
  if (has([0xBD, 0xA7, 0x7C])) romHits.push({ key: 'CSRDON', label: 'CSRDON $A77C', strong: false });
  if (has([0xBD, 0xA7, 0xD3])) romHits.push({ key: 'SPINUP', label: 'spin-up $A7D3', strong: false });
  if (has([0xBD, 0xA7, 0xE9])) romHits.push({ key: 'MOTOROFF', label: 'motor off $A7E9', strong: false });
  if (has([0xBD, 0xA5, 0x11])) romHits.push({ key: 'CLOADM', label: 'CLOADM $A511', strong: false });
  // Controle de MOTOR em assembly: LDA $FF21 (B6 FF 21) + STA $FF21 (B7 FF 21).
  const motorOn = has([0xB6, 0xFF, 0x21]) && has([0xB7, 0xFF, 0x21]);
  if (motorOn) romHits.push({ key: 'MOTOR', label: 'controle de motor $FF21 (LDA/ORA #$08/STA)', strong: true });
  // Encadeamento de EXEC: JMP [$009D] = 6E 9F 00 9D (indireto estendido pelo vetor de exec).
  const execChain = has([0x6E, 0x9F, 0x00, 0x9D]);
  if (execChain) romHits.push({ key: 'EXECCHAIN', label: 'encadeamento JMP [$009D]', strong: false });

  const blkin = romHits.some(h => h.key === 'BLKIN');
  const strongCount = romHits.filter(h => h.strong).length;       // BLKIN e MOTOR
  const supportive = romHits.length;                              // total de assinaturas

  // Decisão: é PLAN-SOFT se houver os DOIS traços fortes (BLKIN + motor) — ou um forte + multi-parte +
  // ≥2 assinaturas de apoio. Sempre exige BLKIN (a SoftKristian nunca usa $A70B).
  const isPlanSoft = blkin && (motorOn || (parts >= 2 && supportive >= 3));

  const notes: string[] = [];
  if (isPlanSoft) {
    notes.push(`loader PLAN-SOFT/GAMEPACK (multi-parte): ${romHits.map(h => h.label).join('; ')}`);
    if (parts >= 2) notes.push(`${parts} parte(s) na fita (cada uma com seu namefile)`);
    notes.push('jogo all-RAM/multi-parte — o .CAS FIEL roda em tempo real no XRoar; a conversão p/ DISCO desta família ainda NÃO está disponível (projeto futuro: flip-flop SAM TY $FFDE/$FFDF).');
  } else {
    notes.push('assinaturas PLAN-SOFT insuficientes (BLKIN/motor não confirmados).');
  }

  // confiança
  let confidence = 0;
  if (blkin) confidence += 0.4;
  if (motorOn) confidence += 0.3;
  if (execChain) confidence += 0.1;
  if (parts >= 2) confidence += 0.1;
  confidence += Math.min(0.1, Math.max(0, supportive - 2) * 0.05);

  return {
    isPlanSoft,
    confidence: Math.min(1, confidence),
    parts,
    name: (r.files && r.files[0] && r.files[0].name) ? String(r.files[0].name) : 'FILE',
    romCalls: romHits.map(h => h.label),
    program,
    notes,
  };
}

// ───────── Detector UNIFICADO (roda os perfis em ordem; devolve a melhor família) ─────────
export type LoaderFamily = 'softkristian' | 'plansoft' | null;
export interface UnifiedLoaderResult {
  detected: boolean;
  family: LoaderFamily;
  familyName: string;
  confidence: number;
  convertible: boolean;   // dá p/ montar BIN/DSK sem loader AGORA? (A: sim; B: ainda não)
  name: string;
  // Campos da Família A (0/vazio nas demais) — usados pelo diálogo de build:
  telaLoad: number; telaLen: number; hasScreen: boolean;
  screen?: Buffer;        // os 512 bytes da tela extraída (p/ semear o editor de tela)
  progLoad: number; progExec: number; progLen: number; progEnd: number;
  cloadmCalls: number;
  // Info da Família B:
  parts?: number;
  romCalls?: string[];
  notes: string[];
}

export function scanLoaders(wavBuffer: Buffer, opts?: any): UnifiedLoaderResult | null {
  // Família A primeiro (tem caminho de conversão completo).
  const a = scanSoftKristian(wavBuffer, opts);
  if (a && a.isSoftKristian) {
    const progEnd = (a.progLoad + a.program.length) & 0xFFFFF;
    return {
      detected: true, family: 'softkristian', familyName: 'SoftKristian', confidence: a.confidence,
      convertible: true, name: a.name,
      telaLoad: a.telaLoad, telaLen: a.telaLen, hasScreen: a.telaLen > 0, screen: a.screen,
      progLoad: a.progLoad, progExec: a.progExec, progLen: a.program.length, progEnd, cloadmCalls: a.cloadmCalls,
      notes: a.notes,
    };
  }
  // Família B.
  const b = scanPlanSoft(wavBuffer, opts);
  if (b && b.isPlanSoft) {
    return {
      detected: true, family: 'plansoft', familyName: 'PLAN-SOFT / GAMEPACK', confidence: b.confidence,
      convertible: false, name: b.name,
      telaLoad: 0, telaLen: 0, hasScreen: false,
      progLoad: 0, progExec: 0, progLen: b.program.length, progEnd: 0, cloadmCalls: 0,
      parts: b.parts, romCalls: b.romCalls, notes: b.notes,
    };
  }
  // Não reconhecido — devolve o melhor parcial da Família A (p/ a UI mostrar avisos), se houver.
  if (a) {
    const progEnd = (a.progLoad + a.program.length) & 0xFFFFF;
    return {
      detected: false, family: null, familyName: '', confidence: a.confidence, convertible: false, name: a.name,
      telaLoad: a.telaLoad, telaLen: a.telaLen, hasScreen: a.telaLen > 0,
      progLoad: a.progLoad, progExec: a.progExec, progLen: a.program.length, progEnd, cloadmCalls: a.cloadmCalls,
      notes: a.notes,
    };
  }
  return null;
}
