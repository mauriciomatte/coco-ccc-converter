// Inspeciona a estrutura de uma trilha MFM de um SDF real (FLEX) para o encoder rawToSdf replicar
// o layout (address marks, gaps, posições, CRCs) — garantindo compatibilidade com o CoCoSDC real.
import * as fs from 'fs';
const path = process.argv[2] || 'C:/Users/Matte/AppData/Local/Temp/ccc-os9-work/sdf_sample/flex.sdf';
const trackIndex = parseInt(process.argv[3] || '1', 10);
const b = fs.readFileSync(path);
const le16 = (o: number) => b[o] | (b[o + 1] << 8);
const rec = 512 + trackIndex * 6656;
const count = b[rec];
console.log(`SDF ${path}  trackIndex=${trackIndex}  recOff=0x${rec.toString(16)}  sectorCount=${count}`);
for (let i = 0; i < Math.min(count, 6); i++) {
  const e = rec + 8 + i * 8;
  const idRaw = le16(e), dataRaw = le16(e + 2);
  console.log(`  entry${i}: idOff=${idRaw & 0x3fff}(FM${(idRaw >> 14) & 1},CRC${(idRaw >> 15) & 1})  dataOff=${dataRaw & 0x3fff}(del${(dataRaw >> 14) & 1},CRC${(dataRaw >> 15) & 1})  cyl=${b[e + 4]} side=${b[e + 5]} sec=${b[e + 6]} size=${128 << b[e + 7]}`);
}
// hex around the first sector's ID and DATA fields (relative to record start → absolute)
const e0 = rec + 8;
const idOff = le16(e0) & 0x3fff, dataOff = le16(e0 + 2) & 0x3fff;
const dump = (label: string, off: number, n: number) => {
  const a = rec + off;
  console.log(`  ${label} @rec+0x${off.toString(16)} (abs 0x${a.toString(16)}):`);
  for (let r = 0; r < n; r += 16) {
    const row = [...b.subarray(a + r, a + r + 16)].map(x => x.toString(16).padStart(2, '0')).join(' ');
    console.log('    ' + (off + r).toString(16).padStart(4, '0') + ': ' + row);
  }
};
console.log('\n-- ID field of sector 0 --');
dump('ID', idOff - 4, 24);   // some bytes before the ID header (sync A1 A1 A1 FE)
console.log('\n-- DATA field of sector 0 --');
dump('DATA', dataOff - 4, 16); // sync + FB then data start
console.log('\n-- gap between sec0 data end and sec1 id --');
const e1 = rec + 8 + 8;
const id1 = le16(e1) & 0x3fff;
console.log(`  sec0 dataOff=${dataOff}, sec0 data ends ~${dataOff + 256 + 2}(+crc), sec1 idOff=${id1}, gap≈${id1 - (dataOff + 256 + 2)} bytes`);
console.log(`  spacing sec0.id→sec1.id = ${id1 - idOff} bytes`);
