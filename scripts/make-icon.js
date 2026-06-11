// Gera os ícones do app a partir de amostras/icone.png usando o nativeImage do Electron
// (não há sharp/imagemagick no projeto). Roda com: npx electron scripts/make-icon.js
// Produz: resources/icon.png (256px, p/ a janela em runtime) e resources/icon-512.png
// (p/ o electron-builder converter em .ico/.icns/.png dos instaladores).
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'amostras', 'icone.png');
const OUT = path.join(__dirname, '..', 'resources');

app.whenReady().then(() => {
  try {
    const img = nativeImage.createFromPath(SRC);
    if (img.isEmpty()) throw new Error('não consegui ler ' + SRC);
    const i256 = img.resize({ width: 256, height: 256, quality: 'best' });
    const i512 = img.resize({ width: 512, height: 512, quality: 'best' });
    fs.writeFileSync(path.join(OUT, 'icon.png'), i256.toPNG());
    fs.writeFileSync(path.join(OUT, 'icon-512.png'), i512.toPNG());
    console.log('OK: resources/icon.png (256) e resources/icon-512.png (512) gerados');
  } catch (e) {
    console.error('ERRO:', e.message);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
