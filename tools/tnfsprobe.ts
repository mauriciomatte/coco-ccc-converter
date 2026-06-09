// Testa o cliente TNFS contra um hub real: lista uma pasta.
//   compile: npx tsc -p tsconfig.tools.json    run: node out-tools/tools/tnfsprobe.js [host] [path]
import { tnfsList } from '../src/main/net/tnfs';

async function main() {
  const host = process.argv[2] || 'tnfs.fujinet.online';
  const path = process.argv[3] || '/';
  console.log(`TNFS list ${host}:${path}`);
  const entries = await tnfsList(host, path);
  console.log(`${entries.length} itens:`);
  for (const e of entries) console.log(`  ${e.isDir ? '[D]' : '   '} ${e.name}${e.isDir ? '' : '  (' + e.size + ' B)'}`);
}
main().then(() => process.exit(0)).catch(e => { console.error('ERRO:', e.message); process.exit(1); });
