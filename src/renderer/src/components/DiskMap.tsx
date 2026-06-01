import React, { useEffect, useMemo, useRef, useState } from 'react';

// Mapa visual do disquete RS-DOS (CoCo padrão: 35 trilhas × 18 setores, diretório na trilha 17).
// Desenho concêntrico: trilha 0 = anel externo; cada fatia = 1 setor. Cores = ocupação.
// A alocação do RS-DOS é por GRÂNULO (9 setores = meia trilha); a última granule de cada arquivo
// é desenhada com o preenchimento parcial real (a partir do tamanho do arquivo).
// Arquivo fragmentado (cadeia de granules não-contígua) aparece em VERMELHO.
// O disco se AJUSTA ao espaço disponível na coluna (responsivo; nunca estoura o painel).

const SECTORS = 18, DIR_TRACK = 17, GRAN_BYTES = 9 * 256, STD_TRACKS = 35;

// Grânulo → trilha física (2 grânulos/trilha, pulando a trilha 17 do diretório).
function granuleTrack(g: number): number { return Math.floor(g / 2) + (g >= 34 ? 1 : 0); }

// Cadeia contígua? (granules em sequência ascendente, ex.: [5,6,7]). Senão, está fragmentada.
function isFragmented(chain: number[]): boolean {
  for (let i = 1; i < chain.length; i++) if (chain[i] !== chain[i - 1] + 1) return true;
  return false;
}

// Caminho SVG de um setor anular (anel entre rIn..rOut, ângulo a0..a1).
function arcPath(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(rOut, a0)} A${rOut},${rOut} 0 ${large} 1 ${pt(rOut, a1)} L${pt(rIn, a1)} A${rIn},${rIn} 0 ${large} 0 ${pt(rIn, a0)} Z`;
}

// Compacta números em faixas para o tooltip: [0,1,2,4] -> "0-2, 4".
function ranges(nums: number[]): string {
  const s = Array.from(new Set(nums)).sort((a, b) => a - b);
  if (!s.length) return '-';
  const out: string[] = []; let a = s[0], p = s[0];
  for (let i = 1; i <= s.length; i++) {
    if (i < s.length && s[i] === p + 1) { p = s[i]; continue; }
    out.push(a === p ? `${a}` : `${a}-${p}`); if (i < s.length) { a = s[i]; p = s[i]; }
  }
  return out.join(', ');
}

const C = {
  free: 'rgba(148,163,184,0.14)', used: 'rgba(20,250,200,0.34)', frag: 'rgba(248,113,113,0.50)',
  dir: 'rgba(168,85,247,0.55)', sel: '#ff8c1a', grid: 'rgba(2,6,12,0.85)', hub: '#0b1220', hubRing: 'rgba(148,163,184,0.35)',
};

interface DiskFile { fullName: string; name?: string; ext?: string; granuleChain?: number[]; totalSize?: number; sectors?: number[]; fragmented?: boolean }
interface Props {
  files: DiskFile[]; totalGranules?: number; selectedNames?: Set<string>;
  lang: 'pt-br' | 'en-us'; onSelectFile?: (f: DiskFile) => void;
  // Dragon DOS mode: per-SECTOR allocation, directory on a different track (20), variable
  // geometry. When mode==='dragon' the granule math is bypassed in favour of file.sectors (LSNs).
  mode?: 'rsdos' | 'dragon';
  tracks?: number; sectorsPerTrack?: number; dirTrack?: number;
  usedSectors?: number; totalSectors?: number;
}

export default function DiskMap({ files, totalGranules, selectedNames, lang, onSelectFile, mode, tracks, sectorsPerTrack, dirTrack, usedSectors, totalSectors }: Props) {
  const DRAGON = mode === 'dragon';
  const SECT = DRAGON ? (sectorsPerTrack || 18) : SECTORS;       // setores por trilha
  const DIRT = DRAGON ? (dirTrack ?? 20) : DIR_TRACK;            // trilha do diretório
  // Nº de trilhas pela GEOMETRIA. RS-DOS: 68 granules = 35T; 78 = 40T (diretório na trilha 17).
  // Dragon: trilhas vêm do formato (40 SS / 80 DS), diretório na trilha 20.
  const TRACKS = DRAGON
    ? (tracks || 40)
    : (totalGranules && totalGranules > 0 ? Math.round(totalGranules / 2) + 1 : STD_TRACKS);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ fi: number; x: number; y: number } | null>(null);
  const [box, setBox] = useState({ w: 180, h: 220 });

  // Mede a área disponível e dimensiona o disco para caber (maior possível, sem estourar).
  useEffect(() => {
    const el = wrapRef.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);

  const LEGEND_H = 30; // reserva vertical para a legenda abaixo do disco
  const S = Math.max(120, Math.min(box.w, box.h - LEGEND_H));
  const cx = S / 2, cy = S / 2;
  const rOut = S / 2 - 3, rIn = rOut * 0.18, ring = (rOut - rIn) / TRACKS;
  const sectAng = (2 * Math.PI) / SECT, ang0 = -Math.PI / 2;

  // Assinatura estável dos nomes selecionados: evita reconstruir a base (630 arcos) quando o
  // chamador passa um Set novo com o MESMO conteúdo a cada render (ex.: na animação de defrag).
  const selKey = selectedNames ? Array.from(selectedNames).sort().join('') : '';
  const selIdx = useMemo(() => {
    const set = new Set<number>();
    if (selectedNames) files.forEach((f, i) => { if (selectedNames.has(f.fullName)) set.add(i); });
    return set;
  }, [files, selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fragIdx = useMemo(() => {
    const set = new Set<number>();
    files.forEach((f, i) => { if (DRAGON ? !!f.fragmented : isFragmented(f.granuleChain || [])) set.add(i); });
    return set;
  }, [files, DRAGON]);

  // Grade célula → dono: -1 livre, -2 diretório, ≥0 índice do arquivo.
  const owner = useMemo(() => {
    const g: number[][] = Array.from({ length: TRACKS }, () => new Array(SECT).fill(-1));
    if (DIRT >= 0 && DIRT < TRACKS) for (let s = 0; s < SECT; s++) g[DIRT][s] = -2;
    if (DRAGON) {
      // Dragon: alocação por SETOR. LSN → trilha = ⌊LSN/SECT⌋, setor = LSN mod SECT.
      files.forEach((f, fi) => {
        (f.sectors || []).forEach((lsn) => {
          const t = Math.floor(lsn / SECT), s = lsn % SECT;
          if (t < 0 || t >= TRACKS) return;
          if (g[t][s] !== -2) g[t][s] = fi;
        });
      });
    } else {
      // RS-DOS: alocação por GRÂNULO; última granule = preenchimento parcial real.
      files.forEach((f, fi) => {
        const chain = f.granuleChain || []; if (!chain.length) return;
        const lastSecs = Math.max(1, Math.min(9, Math.ceil(((f.totalSize || 0) - (chain.length - 1) * GRAN_BYTES) / 256) || 1));
        chain.forEach((gr, k) => {
          const t = granuleTrack(gr); if (t < 0 || t >= TRACKS || t === DIR_TRACK) return;
          const base = (gr % 2) * 9, used = k === chain.length - 1 ? lastSecs : 9;
          for (let s = 0; s < used && base + s < SECT; s++) if (g[t][base + s] !== -2) g[t][base + s] = fi;
        });
      });
    }
    return g;
  }, [files, DRAGON, TRACKS, SECT, DIRT]);

  const rOf = (t: number) => [rOut - (t + 1) * ring, rOut - t * ring] as const;
  const aOf = (s: number) => [ang0 + s * sectAng, ang0 + (s + 1) * sectAng] as const;

  // Camada base (ocupação + fragmentação + seleção) — refaz quando arquivos/seleção/tamanho mudam.
  const base = useMemo(() => {
    const cells: React.ReactNode[] = [];
    for (let t = 0; t < TRACKS; t++) {
      const [ri, ro] = rOf(t);
      for (let s = 0; s < SECT; s++) {
        const o = owner[t][s];
        const fill = o === -2 ? C.dir
          : o >= 0 ? (selIdx.has(o) ? C.sel : fragIdx.has(o) ? C.frag : C.used)
          : C.free;
        const [a0, a1] = aOf(s);
        cells.push(<path key={`${t}-${s}`} d={arcPath(cx, cy, ri, ro, a0, a1)} fill={fill} stroke={C.grid} strokeWidth={0.4} />);
      }
    }
    return cells;
  }, [owner, selIdx, fragIdx, S]);

  const overlay = useMemo(() => {
    if (!hover) return null;
    const cells: React.ReactNode[] = [];
    for (let t = 0; t < TRACKS; t++) for (let s = 0; s < SECT; s++) {
      if (owner[t][s] !== hover.fi) continue;
      const [ri, ro] = rOf(t), [a0, a1] = aOf(s);
      cells.push(<path key={`h-${t}-${s}`} d={arcPath(cx, cy, ri, ro, a0, a1)} fill="rgba(255,255,255,0.32)" stroke="#fff" strokeWidth={0.9} />);
    }
    return cells;
  }, [hover, owner, S]);

  // Descobre o arquivo sob o ponteiro (geometria: raio→trilha, ângulo→setor). -1 se vazio.
  const fileAt = (e: React.MouseEvent): number => {
    const svg = svgRef.current; if (!svg) return -1;
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * S - cx, py = (e.clientY - r.top) / r.height * S - cy;
    const d = Math.hypot(px, py);
    if (d > rOut || d < rIn) return -1;
    const t = Math.min(TRACKS - 1, Math.max(0, Math.floor((rOut - d) / ring)));
    let a = Math.atan2(py, px) - ang0; a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const s = Math.min(SECT - 1, Math.floor(a / sectAng));
    return owner[t]?.[s] ?? -1;
  };

  const onMove = (e: React.MouseEvent) => {
    const o = fileAt(e);
    if (o >= 0) { const r = svgRef.current!.getBoundingClientRect(); setHover({ fi: o, x: e.clientX - r.left, y: e.clientY - r.top }); }
    else if (hover) setHover(null);
  };
  const onClick = (e: React.MouseEvent) => { const o = fileAt(e); if (o >= 0 && onSelectFile) onSelectFile(files[o]); };

  const usedCells = DRAGON
    ? (usedSectors ?? files.reduce((a, f) => a + (f.sectors?.length || 0), 0))
    : files.reduce((a, f) => a + (f.granuleChain?.length || 0), 0);
  const total = DRAGON ? (totalSectors || TRACKS * SECT) : (totalGranules || 68);
  const pct = total ? Math.round((usedCells / total) * 100) : 0;
  const hf = hover ? files[hover.fi] : null;
  const L = (pt: string, en: string) => (lang === 'pt-br' ? pt : en);

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 6, overflow: 'hidden' }}>
      <svg
        ref={svgRef} width={S} height={S} viewBox={`0 0 ${S} ${S}`}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick}
        style={{ cursor: 'pointer', display: 'block', flexShrink: 0 }}
      >
        {base}
        {overlay}
        <circle cx={cx} cy={cy} r={rIn} fill={C.hub} stroke={C.hubRing} strokeWidth={0.8} />
        <circle cx={cx} cy={cy} r={rIn * 0.36} fill="none" stroke={C.hubRing} strokeWidth={0.8} />
        <text x={cx} y={cy - 1} textAnchor="middle" fontSize={rIn * 0.55} fontWeight={700} fill="#e2e8f0">{pct}%</text>
        <text x={cx} y={cy + rIn * 0.45} textAnchor="middle" fontSize={rIn * 0.28} fill="#94a3b8">{L('cheio', 'full')}</text>
      </svg>

      {/* legenda (abaixo da mídia) */}
      <div style={{ display: 'flex', gap: 9, fontSize: 9, color: '#94a3b8', flexWrap: 'wrap', justifyContent: 'center', flexShrink: 0 }}>
        {[['used', C.used, L('ocupado', 'used')], ['frag', C.frag, L('fragment.', 'fragm.')], ['free', C.free, L('livre', 'free')], ['dir', C.dir, 'DIR'], ['sel', C.sel, L('sel.', 'sel.')]].map(([k, c, lbl]) => (
          <span key={k as string} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 8, height: 8, background: c as string, borderRadius: 1, display: 'inline-block' }} />{lbl}
          </span>
        ))}
      </div>

      {/* tooltip do arquivo sob o cursor */}
      {hf && (
        <div style={{
          position: 'absolute', left: Math.min(hover!.x + 12, S - 4), top: hover!.y + 12, zIndex: 20, pointerEvents: 'none',
          background: 'rgba(2,6,12,0.96)', border: '1px solid rgba(255,140,26,0.6)', borderRadius: 4, padding: '4px 7px',
          fontSize: 9, color: '#ffb066', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,0.6)',
          transform: hover!.x > S * 0.6 ? 'translateX(-100%)' : undefined,
        }}>
          <div style={{ fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
            {hf.fullName}{fragIdx.has(hover!.fi) ? ' ⚠' : ''}
          </div>
          <div style={{ color: '#94a3b8' }}>
            {DRAGON
              ? <>{L('trilhas', 'tracks')} {ranges((hf.sectors || []).map((l) => Math.floor(l / SECT)))} · {(hf.sectors?.length || 0)}s · {hf.totalSize ?? 0} B</>
              : <>{L('trilhas', 'tracks')} {ranges((hf.granuleChain || []).map(granuleTrack))} · {(hf.granuleChain?.length || 0)}g · {hf.totalSize ?? 0} B</>}
            {fragIdx.has(hover!.fi) ? ` · ${L('fragmentado', 'fragmented')}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
