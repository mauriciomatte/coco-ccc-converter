import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [
      // serialport é um MÓDULO NATIVO: tem que ficar EXTERNO (carregado de node_modules em runtime).
      // Se embutido no bundle, o node-gyp-build procura os prebuilds relativos a out/ → "No native build found".
      // O `external` por string do rollup não basta (o Vite já resolveu o specifier p/ caminho absoluto);
      // este plugin marca external ANTES da resolução, preservando o specifier puro no require().
      {
        name: 'externalize-native-serialport',
        enforce: 'pre' as const,
        resolveId(source: string) {
          if (source === 'serialport' || source === 'node-gyp-build' || source === 'bindings' || source.startsWith('@serialport/')) {
            return { id: source, external: true };
          }
          return null;
        }
      },
      externalizeDepsPlugin()
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()],
    root: resolve(__dirname, 'src/renderer'),
    // Permite importar arquivos da RAIZ do repo (ex.: VERSOES.TXT via ?raw para o changelog) no dev server.
    server: { fs: { allow: [resolve(__dirname)] } }
  }
});
