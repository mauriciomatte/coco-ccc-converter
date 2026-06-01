import React, { useMemo } from 'react';
import { X, GitCompare } from 'lucide-react';

// Comparador de arquivos: lado A = arquivo de dentro da imagem (painel); lado B = arquivo do PC.
// Mostra um diff hexadecimal byte-a-byte, destacando as diferenças, e colapsa os trechos idênticos
// (mostra só as regiões que mudam + contexto). Útil para "medir" as transformações CoCo↔Dragon.

const hx = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');
const asc = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
const off4 = (n: number) => n.toString(16).toUpperCase().padStart(5, '0');

interface Props {
  lang: 'pt-br' | 'en-us';
  nameA: string; dataA: Uint8Array;  // imagem (painel)
  nameB: string; dataB: Uint8Array;  // PC
  onClose: () => void;
}

const MAX_ROWS = 800; // teto de linhas renderizadas (evita DOM gigante quando tudo difere)

export default function FileCompareModal({ lang, nameA, dataA, nameB, dataB, onClose }: Props) {
  const L = (pt: string, en: string) => (lang === 'pt-br' ? pt : en);
  const a = dataA, b = dataB;
  const maxLen = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);

  const stats = useMemo(() => {
    let diff = 0, firstDiff = -1;
    for (let i = 0; i < maxLen; i++) { if ((a[i] ?? -1) !== (b[i] ?? -2)) { diff++; if (firstDiff < 0) firstDiff = i; } }
    let prefix = 0; while (prefix < minLen && a[prefix] === b[prefix]) prefix++;
    let suffix = 0; while (suffix < minLen - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
    return { diff, firstDiff, prefix, suffix };
  }, [a, b]);

  // Linhas de 16 bytes; marca as que têm diferença; mostra diffs + 2 de contexto, colapsando o resto.
  const items = useMemo(() => {
    const nRows = Math.ceil(maxLen / 16) || 1;
    const hasDiff: boolean[] = [];
    for (let r = 0; r < nRows; r++) {
      let d = false; const off = r * 16;
      for (let i = off; i < off + 16 && i < maxLen; i++) if ((a[i] ?? -1) !== (b[i] ?? -2)) { d = true; break; }
      hasDiff.push(d);
    }
    const show = new Array(nRows).fill(false);
    let anyDiff = false;
    hasDiff.forEach((d, i) => { if (d) { anyDiff = true; for (let j = Math.max(0, i - 2); j <= Math.min(nRows - 1, i + 2); j++) show[j] = true; } });
    if (!anyDiff) for (let i = 0; i < Math.min(nRows, 12); i++) show[i] = true; // idênticos: mostra o começo
    const out: Array<{ type: 'row'; off: number } | { type: 'gap'; n: number }> = [];
    let gap = 0, shown = 0;
    for (let r = 0; r < nRows; r++) {
      if (show[r] && shown < MAX_ROWS) {
        if (gap) { out.push({ type: 'gap', n: gap }); gap = 0; }
        out.push({ type: 'row', off: r * 16 }); shown++;
      } else gap++;
    }
    if (gap) out.push({ type: 'gap', n: gap });
    return { out, truncated: shown >= MAX_ROWS };
  }, [a, b]);

  const cellByte = (val: number | undefined, differ: boolean) => (
    <span style={{ color: val === undefined ? '#475569' : differ ? '#fca5a5' : '#94a3b8', background: differ ? 'rgba(248,113,113,0.18)' : undefined, padding: '0 1px', borderRadius: 1 }}>
      {val === undefined ? '··' : hx(val)}
    </span>
  );

  const renderHalf = (data: Uint8Array, other: Uint8Array, off: number) => {
    const cells = []; const ascii: React.ReactNode[] = [];
    for (let i = off; i < off + 16; i++) {
      const v = i < data.length ? data[i] : undefined;
      const differ = (data[i] ?? -1) !== (other[i] ?? -2);
      cells.push(<React.Fragment key={i}>{cellByte(v, differ)}{i % 16 === 7 ? <span> </span> : null}</React.Fragment>);
      ascii.push(<span key={i} style={{ color: v === undefined ? '#475569' : differ ? '#fca5a5' : '#64748b', background: differ ? 'rgba(248,113,113,0.18)' : undefined }}>{v === undefined ? ' ' : asc(v)}</span>);
    }
    return (
      <span style={{ display: 'inline-flex', gap: 8 }}>
        <span style={{ letterSpacing: '0.5px' }}>{cells}</span>
        <span style={{ color: '#475569' }}>|</span>
        <span>{ascii}</span>
      </span>
    );
  };

  const pct = maxLen ? Math.round((stats.diff / maxLen) * 100) : 0;
  const identical = stats.diff === 0 && a.length === b.length;

  return (
    <div className="glass-modal-overlay" onClick={onClose}>
      <div className="glass-panel p-4 flex flex-col gap-3" style={{ width: 960, maxWidth: '96%', maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><GitCompare size={16} /> {L('Comparador de arquivos', 'File comparator')}</h3>
          <button onClick={onClose} className="dsk-tool" style={{ padding: 6 }}><X size={15} /></button>
        </div>

        {/* Cabeçalho dos dois lados */}
        <div className="flex gap-3 text-[11px]">
          <div className="flex-1 bg-slate-950/40 rounded p-2 border border-[var(--primary)]/30 min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">A · {L('imagem (painel)', 'image (pane)')}</div>
            <div className="text-white font-mono truncate">{nameA}</div>
            <div className="text-[var(--text-secondary)]">{a.length} bytes</div>
          </div>
          <div className="flex-1 bg-slate-950/40 rounded p-2 border border-cyan-500/30 min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">B · PC</div>
            <div className="text-white font-mono truncate">{nameB}</div>
            <div className="text-[var(--text-secondary)]">{b.length} bytes</div>
          </div>
        </div>

        {/* Resumo */}
        <div className="text-[11px] font-mono" style={{ color: identical ? '#86efac' : '#ffb066' }}>
          {identical
            ? L('✓ Arquivos IDÊNTICOS (mesmo tamanho e mesmos bytes).', '✓ Files are IDENTICAL (same size and bytes).')
            : `${L('Diferem', 'Differ')}: ${stats.diff} ${L('bytes', 'bytes')} (${pct}%) · ${L('1ª diferença em', '1st diff at')} 0x${off4(stats.firstDiff < 0 ? 0 : stats.firstDiff)} · ${L('prefixo comum', 'common prefix')} ${stats.prefix}B · ${L('sufixo comum', 'common suffix')} ${stats.suffix}B${a.length !== b.length ? ` · ${L('tamanhos diferentes', 'different sizes')} (Δ${Math.abs(a.length - b.length)}B)` : ''}`}
        </div>

        {/* Diff hexadecimal lado a lado */}
        <div style={{ overflow: 'auto', minHeight: 0, flex: 1, fontFamily: "'Fira Code', monospace", fontSize: 11, lineHeight: 1.5, background: 'rgba(2,6,12,0.6)', borderRadius: 6, border: '1px solid var(--border)', padding: 8 }}>
          {items.out.map((it, idx) => it.type === 'gap'
            ? <div key={'g' + idx} style={{ color: '#475569', textAlign: 'center', padding: '2px 0' }}>··· {it.n} {L('linha(s) idêntica(s)', 'identical line(s)')} ···</div>
            : (
              <div key={'r' + it.off} style={{ display: 'flex', gap: 14, whiteSpace: 'pre' }}>
                <span style={{ color: '#64748b' }}>{off4(it.off)}</span>
                {renderHalf(a, b, it.off)}
                <span style={{ color: '#334155' }}>‖</span>
                {renderHalf(b, a, it.off)}
              </div>
            ))}
          {items.truncated && <div style={{ color: '#fca5a5', textAlign: 'center', padding: 6 }}>{L(`(diff muito grande — mostrando as primeiras ${MAX_ROWS} linhas)`, `(diff too large — showing the first ${MAX_ROWS} rows)`)}</div>}
        </div>
        <div className="text-[9px] text-[var(--text-muted)]">{L('Vermelho = byte diferente. A = arquivo da imagem; B = arquivo do PC. Trechos idênticos são colapsados.', 'Red = differing byte. A = file from the image; B = file from the PC. Identical regions are collapsed.')}</div>
      </div>
    </div>
  );
}
