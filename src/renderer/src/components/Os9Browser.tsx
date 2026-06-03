import React, { useEffect, useState } from 'react';
import { Folder, FileText, Download, X, ChevronRight, ArrowUp, HardDrive, Loader } from 'lucide-react';

// Browser hierárquico SOMENTE-LEITURA para partições OS-9 / NitrOS-9 (RBF). Recebe um arquivo e um
// offset de partição (base) e usa window.cocoApi.os9Read para obter a árvore de diretórios, e
// os9Extract para salvar um arquivo no PC (seguindo a lista de segmentos FD.SEG no processo main).

interface Os9Date { year: number; month: number; day: number; hour: number; minute: number; }
interface Os9Node {
  name: string; fdLsn: number; isDir: boolean; size: number;
  attrString: string; modified?: Os9Date | null; children?: Os9Node[]; truncated?: boolean;
}
interface Os9Ident {
  name: string; totalSectors: number; sectorsPerTrack: number; sides: number; sectorsPerCluster: number;
}

interface Props { filePath: string; base: number; fileName: string; lang: string; onClose: () => void; }

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d?: Os9Date | null) => (d ? `${d.year}-${pad(d.month)}-${pad(d.day)} ${pad(d.hour)}:${pad(d.minute)}` : '');
const fmtSize = (n: number) => (n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B');

export function Os9Browser({ filePath, base, fileName, lang, onClose }: Props) {
  const pt = lang === 'pt-br';
  const [ident, setIdent] = useState<Os9Ident | null>(null);
  const [stats, setStats] = useState<{ files: number; dirs: number; freeBytes: number } | null>(null);
  const [stack, setStack] = useState<Os9Node[]>([]); // pilha de diretórios; [0] = raiz
  const [err, setErr] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const res = await window.cocoApi.os9Read(filePath, base);
      if (!alive) return;
      setLoading(false);
      if (!res?.success) { setErr(res?.error || (pt ? 'Falha ao ler OS-9.' : 'Failed to read OS-9.')); return; }
      setIdent(res.ident);
      setStats({ files: res.totalFiles, dirs: res.totalDirs, freeBytes: res.freeBytes });
      setStack([res.root]);
    })();
    return () => { alive = false; };
  }, [filePath, base]);

  const current = stack.length ? stack[stack.length - 1] : null;
  const children = (current?.children ?? []).slice().sort((a, b) =>
    a.isDir === b.isDir ? a.name.localeCompare(b.name) : (a.isDir ? -1 : 1));

  const enter = (node: Os9Node) => { if (node.isDir) setStack(s => [...s, node]); };
  const up = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s));
  const gotoCrumb = (i: number) => setStack(s => s.slice(0, i + 1));

  const extract = async (node: Os9Node) => {
    if (busy) return;
    setBusy(true); setNote('');
    try {
      const r = await window.cocoApi.os9Extract(filePath, base, node.fdLsn, node.name);
      if (r?.cancelled) return;
      if (r?.success) setNote((pt ? 'Extraído: ' : 'Extracted: ') + r.path);
      else setNote((pt ? 'Erro ao extrair: ' : 'Extract error: ') + (r?.error || '?'));
    } finally { setBusy(false); }
  };

  // caminho da raiz até o diretório atual (para o breadcrumb)
  const crumbs = stack.map((n, i) => (i === 0 ? (ident?.name?.trim() || '/') : n.name));

  return (
    <div className="glass-modal-overlay" onClick={onClose}>
      <div className="glass-panel flex flex-col" style={{ width: 820, maxWidth: '95%', height: '84vh', maxHeight: '84vh' }} onClick={e => e.stopPropagation()}>
        {/* cabeçalho */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] flex-shrink-0">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
            <HardDrive size={16} className="text-[var(--primary)]" />
            OS-9 / NitrOS-9 · {fileName}
            <span style={{ fontSize: 10, fontWeight: 600, color: '#a78bfa', border: '1px solid #a78bfa55', borderRadius: 4, padding: '1px 6px', textTransform: 'none' }}>
              {pt ? 'somente-leitura' : 'read-only'}
            </span>
          </h3>
          <button onClick={onClose} className="dsk-tool" style={{ padding: '4px 7px' }} aria-label="Fechar"><X size={15} /></button>
        </div>

        {/* sub-cabeçalho: volume + estatísticas */}
        {ident && (
          <div className="px-5 py-2 border-b border-[var(--border)] flex-shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            <span><b style={{ color: '#c4b5fd' }}>{ident.name?.trim() || '(sem volume)'}</b></span>
            <span>{ident.totalSectors} {pt ? 'setores' : 'sectors'} · SPT {ident.sectorsPerTrack} · {ident.sides === 2 ? (pt ? '2 lados' : '2 sides') : (pt ? '1 lado' : '1 side')} · cluster {ident.sectorsPerCluster}</span>
            {stats && <span>{stats.files} {pt ? 'arquivos' : 'files'} · {stats.dirs} {pt ? 'dirs' : 'dirs'} · {(stats.freeBytes / 1024).toFixed(0)} KB {pt ? 'livres' : 'free'}</span>}
          </div>
        )}

        {/* breadcrumb */}
        <div className="px-5 py-2 border-b border-[var(--border)] flex-shrink-0 flex items-center gap-1 flex-wrap" style={{ fontSize: 12 }}>
          <button onClick={up} disabled={stack.length <= 1} className="dsk-tool" style={{ padding: '2px 6px', opacity: stack.length <= 1 ? 0.4 : 1 }} title={pt ? 'Subir' : 'Up'}><ArrowUp size={13} /></button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-[var(--text-secondary)]" />}
              <button onClick={() => gotoCrumb(i)} className="dsk-tool" style={{ padding: '2px 7px', fontWeight: i === crumbs.length - 1 ? 700 : 400, color: i === crumbs.length - 1 ? '#c4b5fd' : 'var(--text-secondary)' }}>{c}</button>
            </span>
          ))}
        </div>

        {/* corpo: lista do diretório atual */}
        <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
          {loading && <div className="flex items-center justify-center gap-2 py-12 text-[var(--text-secondary)] text-sm"><Loader size={16} className="spin" /> {pt ? 'Lendo partição OS-9…' : 'Reading OS-9 partition…'}</div>}
          {err && <div className="px-5 py-8 text-center text-sm" style={{ color: '#f87171' }}>⚠ {err}</div>}
          {!loading && !err && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary, #1a1a24)', color: 'var(--text-secondary)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>{pt ? 'Nome' : 'Name'}</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>{pt ? 'Atributos' : 'Attributes'}</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600 }}>{pt ? 'Tamanho' : 'Size'}</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>{pt ? 'Modificado' : 'Modified'}</th>
                  <th style={{ padding: '6px 10px' }}></th>
                </tr>
              </thead>
              <tbody>
                {children.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--text-secondary)' }}>{pt ? '(diretório vazio)' : '(empty directory)'}</td></tr>
                )}
                {children.map((node, i) => (
                  <tr key={node.fdLsn + ':' + i}
                    onDoubleClick={() => enter(node)}
                    style={{ borderTop: '1px solid var(--border)', cursor: node.isDir ? 'pointer' : 'default' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.07)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '5px 10px' }}>
                      <span className="flex items-center gap-2">
                        {node.isDir ? <Folder size={14} className="text-[#c4b5fd]" /> : <FileText size={14} className="text-[var(--text-secondary)]" />}
                        <button onClick={() => node.isDir && enter(node)} style={{ background: 'none', border: 'none', color: node.isDir ? '#c4b5fd' : 'var(--text-primary, #e5e5e5)', cursor: node.isDir ? 'pointer' : 'default', padding: 0, font: 'inherit', textAlign: 'left' }}>
                          {node.name}{node.isDir ? '/' : ''}{node.truncated ? ' …' : ''}
                        </button>
                      </span>
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{node.attrString}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{node.isDir ? '—' : fmtSize(node.size)}</td>
                    <td style={{ padding: '5px 10px', color: 'var(--text-secondary)' }}>{fmtDate(node.modified)}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                      {!node.isDir && (
                        <button onClick={() => extract(node)} disabled={busy} className="dsk-tool" style={{ padding: '2px 7px' }} title={pt ? 'Extrair para o PC' : 'Extract to PC'}><Download size={12} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* rodapé */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--border)] flex-shrink-0">
          <span style={{ fontSize: 11, color: note.startsWith(pt ? 'Erro' : 'Extract error') ? '#f87171' : 'var(--text-secondary)' }}>{note}</span>
          <button onClick={onClose} className="btn btn-primary py-2 px-5 text-xs font-bold uppercase">{pt ? 'Fechar' : 'Close'}</button>
        </div>
      </div>
    </div>
  );
}
