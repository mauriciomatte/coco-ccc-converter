// Teste do detector UNIVERSAL de loaders (scanLoaders): valida Família A (SoftKristian) vs
// Família B (PLAN-SOFT/GAMEPACK) contra o corpus real. Sem regressão entre famílias.
//   npx tsc -p tsconfig.tools.json && node out-tools/tools/loaderfamtest.js
import * as fs from 'fs';
import { scanLoaders, scanPlanSoft } from '../src/main/converter/loaderscan';

const BASE = 'G:\\Meu Drive\\EmuCoco\\FitasConvertidas WAV';
// [arquivo, família esperada]  — 'none' = fita SIMPLES (sem loader): NÃO pode ser marcada como loader.
const CASES: Array<[string, 'plansoft' | 'softkristian' | 'none']> = [
  // Família B — PLAN-SOFT / GAMEPACK: a amostra-âncora analisada (SAILOR) — loader multi-parte com motor.
  [`${BASE}\\PLAN-SOFT\\GAMEPACK\\291\\marinheiro_22khz_mono.wav`, 'plansoft'],
  // Família A — SoftKristian boas (tela + CLOADM ×2) → devem detectar e ser CONVERSÍVEIS.
  [`${BASE}\\Softkristian\\Batalha dos Dinossauros\\QUASAR_22khz_mono.wav`, 'softkristian'],
  [`${BASE}\\Softkristian\\Batalha dos Dinossauros\\STINGER_22khz_mono.wav`, 'softkristian'],
  [`${BASE}\\Softkristian\\Conquista no Gelo\\SKIING_22khz_mono.wav`, 'softkristian'],
  [`${BASE}\\Softkristian\\Donkey Kong\\SeaDragon_22khz_mono.wav`, 'softkristian'],
  // Fitas SIMPLES (mesmo na pasta GAMEPACK): CLOADM direto, SEM loader → NÃO devem ser marcadas como loader.
  [`${BASE}\\PLAN-SOFT\\GAMEPACK\\200\\ZAXXON_22khz_mono.wav`, 'none'],
  [`${BASE}\\PLAN-SOFT\\GAMEPACK\\202\\MOONHOPPER_22khz_mono.wav`, 'none'],
  [`${BASE}\\PLAN-SOFT\\GAMEPACK\\101\\FROGGER_22khz_mono.wav`, 'none'],
];

let pass = 0, fail = 0, miss = 0;
for (const [path, want] of CASES) {
  const short = path.split('\\').slice(-2).join('/');
  if (!fs.existsSync(path)) { console.log(`SKIP (não achei) ${short}`); miss++; continue; }
  let r: any = null;
  try { r = scanLoaders(fs.readFileSync(path), { recover: true }); } catch (e: any) { console.log(`ERRO  ${short}: ${e.message}`); fail++; continue; }
  if (!r) { if (want === 'none') { console.log(`PASS  ${short} → sem loader (NO-SYNC)`); pass++; } else { console.log(`FAIL  ${short}: sem decode (NO-SYNC)`); fail++; } continue; }
  const ok = want === 'none' ? !r.detected : (r.detected && r.family === want);
  const extra = r.family === 'plansoft' ? ` partes=${r.parts} [${(r.romCalls || []).map((c: string) => c.split(' ')[0]).join(',')}]`
    : r.family === 'softkristian' ? ` prog=$${(r.progLoad >>> 0).toString(16).toUpperCase()} tela=${r.hasScreen}`
    : ` progLen=${r.progLen}B romCalls=[${(r.romCalls || []).join(',') || '—'}]`;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${short} → família=${r.family || 'nenhuma'} conf=${(r.confidence * 100).toFixed(0)}% conv=${r.convertible}${extra}`);
  if (!ok) { // diagnóstico: o que o detector PLAN-SOFT viu nesta fita?
    try { const b = scanPlanSoft(fs.readFileSync(path), { recover: true }); if (b) console.log(`       ↳ planSoft: detected=${b.isPlanSoft} parts=${b.parts} progLen=${b.program.length}B romCalls=[${b.romCalls.join(',') || '—'}]`); else console.log('       ↳ planSoft: NO-SYNC (sem payload)'); } catch {}
  }
  if (ok) pass++; else fail++;
}
console.log(`\n${pass} PASS · ${fail} FAIL · ${miss} ausentes`);
process.exit(fail ? 1 : 0);
