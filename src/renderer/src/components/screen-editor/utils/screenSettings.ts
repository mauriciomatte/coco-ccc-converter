// screenSettings.ts — persistência do editor de tela em localStorage (chave dedicada).
// Substitui o `useTelaSettings` do CGS (que gravava nas settings do Electron). Mantemos a MESMA
// superfície de API (readTelaSettings/writeTelaSettings/debounced/immediate + helpers base64) para
// que o núcleo do editor (.jsx portado) só precise trocar o caminho do import.
// Isolado em `fiu:screenEditor` — não toca no config principal do app.

const STORAGE_KEY = 'fiu:screenEditor';

// ─── Helpers VRAM ↔ base64 ──────────────────────────────────────────────────
export function vramToBase64(uint8: Uint8Array | null): string {
  if (!uint8 || uint8.length === 0) return '';
  let binary = '';
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  return btoa(binary);
}

export function base64ToVram(b64: string, expectedSize: number): Uint8Array | null {
  if (!b64) return null;
  try {
    const binary = atob(b64);
    if (binary.length !== expectedSize) return null;
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  } catch {
    return null;
  }
}

// ─── Leitura/escrita ────────────────────────────────────────────────────────
export async function readTelaSettings(): Promise<any> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export async function writeTelaSettings(partial: any): Promise<void> {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const merged = deepMerge(existing, partial);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* silencioso */
  }
}

// Deep-merge raso (um nível) — espelha o esquema { ascii_sg4: {...} }.
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null
    ) {
      result[key] = { ...target[key], ...source[key] };
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ─── Debounce ───────────────────────────────────────────────────────────────
const _debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export function debouncedWriteTelaSettings(key: string, partial: any, delay = 800): void {
  if (_debounceTimers[key]) clearTimeout(_debounceTimers[key]);
  _debounceTimers[key] = setTimeout(() => {
    delete _debounceTimers[key];
    writeTelaSettings(partial);
  }, delay);
}

export function immediateWriteTelaSettings(partial: any): void {
  writeTelaSettings(partial);
}
