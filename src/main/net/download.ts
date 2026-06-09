// FujiNet / Online — M1a: baixar um arquivo por URL (HTTP/HTTPS) para dentro do app.
// Roda no MAIN (Node). Segue redirecionamentos, com timeout e limite de tamanho. Sem dependências nativas.
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

const MAX_BYTES = 64 * 1024 * 1024; // 64 MB — protege contra downloads gigantes acidentais
const MAX_REDIRECTS = 6;

export interface DownloadResult { success: boolean; name?: string; data?: Buffer; error?: string; bytes?: number }

export function downloadUrl(rawUrl: string): Promise<DownloadResult> {
  return new Promise((resolve) => {
    let redirects = 0;
    const go = (u: string) => {
      let parsed: URL;
      try { parsed = new URL(u); } catch { return resolve({ success: false, error: 'URL inválida.' }); }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        return resolve({ success: false, error: 'Use apenas http:// ou https://.' });
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.get(u, { timeout: 30000, headers: { 'User-Agent': 'CCC-converter' } }, (res) => {
        const sc = res.statusCode || 0;
        // redirecionamento
        if (sc >= 300 && sc < 400 && res.headers.location) {
          res.resume();
          if (++redirects > MAX_REDIRECTS) return resolve({ success: false, error: 'Redirecionamentos demais.' });
          try { return go(new URL(res.headers.location, u).href); } catch { return resolve({ success: false, error: 'Redirecionamento inválido.' }); }
        }
        if (sc !== 200) { res.resume(); return resolve({ success: false, error: `HTTP ${sc || '???'}` }); }
        const chunks: Buffer[] = []; let total = 0;
        res.on('data', (c: Buffer) => {
          total += c.length;
          if (total > MAX_BYTES) { req.destroy(); resolve({ success: false, error: 'Arquivo grande demais (>64 MB).' }); return; }
          chunks.push(c);
        });
        res.on('end', () => {
          const base = (parsed.pathname.split('/').pop() || '').trim();
          let name = 'download.bin';
          try { name = decodeURIComponent(base) || 'download.bin'; } catch { name = base || 'download.bin'; }
          const data = Buffer.concat(chunks);
          resolve({ success: true, name, data, bytes: data.length });
        });
      });
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Tempo esgotado (30s).' }); });
      req.on('error', (e: any) => resolve({ success: false, error: e?.message || 'Falha de rede.' }));
    };
    go(rawUrl);
  });
}
