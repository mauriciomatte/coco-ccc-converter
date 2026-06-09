// Diagnoses why a made-bootable disk fails to boot: lists the SYSTEM content of each disk
// (OS9Boot/CMDS/SYS/sysgo/startup) and simulates make-bootable vs clone-bootable.
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/os9bootdiag.js
import * as fs from 'fs';
import { parseOs9, os9BootInfo, os9MakeBootable, os9CloneBootable, createBlankOs9, OS9_GEOMETRIES } from '../src/main/converter/os9';
import { normalizeDiskImage } from '../src/main/converter/dmk';

function names(node: any): string[] {
  return (node.children ?? []).map((c: any) => c.name + (c.isDir ? '/' : ''));
}
function findChild(node: any, name: string): any {
  return (node.children ?? []).find((c: any) => c.name.toLowerCase() === name.toLowerCase());
}
function report(label: string, raw: Buffer) {
  let p: any;
  try { p = parseOs9(raw, { base: 0 }); } catch (e: any) { console.log(`\n### ${label}\n  parseOs9 ERRO: ${e.message}`); return; }
  const bi = os9BootInfo(raw, 0);
  const root = p.root;
  const cmds = findChild(root, 'CMDS');
  const sys = findChild(root, 'SYS');
  console.log(`\n### ${label}`);
  console.log(`  boot=${bi.bootable ? 'Y' : 'n'} DD.BT(LSN)=${bi.bootLsn} DD.BSZ=${bi.bootSize}  arquivos=${p.totalFiles} pastas=${p.totalDirs}`);
  console.log(`  raiz: ${names(root).join('  ') || '(vazia)'}`);
  console.log(`  OS9Boot? ${findChild(root, 'OS9Boot') ? 'SIM' : 'NÃO'} · startup? ${findChild(root, 'startup') ? 'SIM' : 'NÃO'}`);
  console.log(`  CMDS/ ? ${cmds ? 'SIM (' + (cmds.children?.length ?? 0) + ' arq)' : 'NÃO'} · SYS/ ? ${sys ? 'SIM' : 'NÃO'}`);
  if (cmds) {
    const c = names(cmds);
    console.log(`    CMDS contém sysgo? ${c.some(n => n.toLowerCase().startsWith('sysgo')) ? 'SIM' : 'NÃO'} · shell? ${c.some(n => n.toLowerCase().startsWith('shell')) ? 'SIM' : 'NÃO'}`);
    console.log(`    CMDS: ${c.slice(0, 24).join(' ')}${c.length > 24 ? ' …' : ''}`);
  }
}

const DIR = 'C:/Users/Matte/Desktop/CCC-converter';
const seed = normalizeDiskImage(fs.readFileSync(`${DIR}/resources/os9seed/seed_360k.os9`));
const made = normalizeDiskImage(fs.readFileSync(`${DIR}/amostras/os9/nitros9-v3.3.0-6809-L2/MADE_BOOTABLE_360k.dsk`));
const real = normalizeDiskImage(fs.readFileSync(`${DIR}/amostras/os9/nitros9-v3.3.0-6809-L2/nos9_40d_1.dsk`));

console.log('===== DISCOS DE PARTIDA =====');
report('seed_360k.os9 (gabarito embutido = NitrOS-9 L1 coco1)', seed);
report('MADE_BOOTABLE_360k.dsk (a referência que o usuário escolheu)', made);
report('nos9_40d_1.dsk (NitrOS-9 L2 real, disco 1)', real);

console.log('\n\n===== SIMULAÇÃO DOS DOIS CAMINHOS =====');
const blank = createBlankOs9(OS9_GEOMETRIES['360k']);
try {
  const mk = os9MakeBootable(Buffer.from(blank), made, 0);
  report('CAMINHO DO USUÁRIO: blank 360K → botão "Bootável" (make-bootable) ref=MADE_BOOTABLE', mk);
} catch (e: any) { console.log('make-bootable ERRO:', e.message); }
try {
  const cl = os9CloneBootable(seed, [], 0);
  report('CAMINHO RECOMENDADO: Novo → Bootável → 360K ✓ gabarito (clone do seed)', cl);
} catch (e: any) { console.log('clone ERRO:', e.message); }
