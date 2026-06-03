import React, { useMemo, useState } from 'react';
import { HardDrive } from 'lucide-react';

// Painel de MÍDIA da aba OS-9 (lado direito): cartão do disco + "platter" de ocupação por CLUSTER +
// estatísticas. Adota a ideia do DiskMap (aba DSK), mas para o bitmap de alocação do RBF, que escala
// de 158K (630 clusters) a partições de 128MB (262k clusters) — os clusters são AGREGADOS em células.

interface Usage { totalClusters: number; usedClusters: number; sectorsPerCluster: number; bitmap: number[] }
interface Ident { name: string; totalSectors: number; sectorsPerCluster: number; sides: number; sectorsPerTrack: number }

const C = { free: 'rgba(148,163,184,0.14)', used: 'rgba(20,250,200,0.34)', part: 'rgba(251,191,36,0.5)', hl: '#f0abfc', grid: 'rgba(2,6,12,0.85)', hub: '#0b1220', hubRing: 'rgba(148,163,184,0.35)' };

function arcPath(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(rOut, a0)} A${rOut},${rOut} 0 ${large} 1 ${pt(rOut, a1)} L${pt(rIn, a1)} A${rIn},${rIn} 0 ${large} 0 ${pt(rIn, a0)} Z`;
}

export function Os9MediaPanel({ usage, ident, fileName, editable, dirty, lang, highlight, onPickCell }:
  { usage: Usage | null; ident: Ident | null; fileName: string; editable: boolean; dirty: boolean; lang: string;
    highlight?: Set<number> | null; onPickCell?: (start: number, end: number) => void }) {
  const pt = lang === 'pt-br';
  const [hover, setHover] = useState<{ k: number; x: number; y: number } | null>(null);

  const SECT = 24, S = 196;
  const view = useMemo(() => {
    if (!usage || !usage.totalClusters) return null;
    const tot = usage.totalClusters;
    const maxCells = 36 * SECT;                       // teto de células desenhadas
    const cells = Math.min(tot, maxCells);
    const rings = Math.max(6, Math.ceil(cells / SECT));
    const cpc = Math.ceil(tot / (rings * SECT));      // clusters por célula
    const isUsed = (c: number) => (usage.bitmap[c >> 3] & (0x80 >> (c & 7))) !== 0;
    const frac: number[] = new Array(rings * SECT).fill(-1); // -1 = fora do disco
    for (let k = 0; k < rings * SECT; k++) {
      const start = k * cpc; if (start >= tot) break;
      const end = Math.min(start + cpc, tot); let u = 0;
      for (let c = start; c < end; c++) if (isUsed(c)) u++;
      frac[k] = u / (end - start);
    }
    return { tot, cells, rings, cpc, frac };
  }, [usage]);

  // células realçadas (clusters do arquivo sob o mouse / selecionado) → índice da célula = cluster / cpc
  const hlCells = useMemo(() => {
    const s = new Set<number>();
    if (!view || !highlight) return s;
    for (const c of highlight) s.add(Math.floor(c / view.cpc));
    return s;
  }, [view, highlight]);

  const cx = S / 2, cy = S / 2, rOut = S / 2 - 3, rIn = rOut * 0.16;
  const paths = useMemo(() => {
    if (!view) return null;
    const ring = (rOut - rIn) / view.rings, sectAng = (2 * Math.PI) / SECT, ang0 = -Math.PI / 2;
    const out: React.ReactNode[] = [];
    for (let k = 0; k < view.rings * SECT; k++) {
      const f = view.frac[k]; if (f < 0) continue;
      const t = Math.floor(k / SECT), s = k % SECT;
      const ro = rOut - t * ring, ri = rOut - (t + 1) * ring;
      const a0 = ang0 + s * sectAng, a1 = ang0 + (s + 1) * sectAng;
      const hl = hlCells.has(k);
      const fill = hover?.k === k ? '#fff' : hl ? C.hl : f === 0 ? C.free : f >= 0.999 ? C.used : C.part;
      out.push(<path key={k} d={arcPath(cx, cy, ri, ro, a0, a1)} fill={fill} stroke={hl ? '#fff' : C.grid} strokeWidth={hl ? 0.7 : 0.35} />);
    }
    return out;
  }, [view, hover, hlCells]);

  const pct = usage && usage.totalClusters ? Math.round(usage.usedClusters / usage.totalClusters * 100) : 0;
  const clKB = usage ? (usage.sectorsPerCluster * 256 / 1024) : 0;
  const totKB = ident ? Math.round(ident.totalSectors * 256 / 1024) : 0;
  const freeKB = usage ? Math.round((usage.totalClusters - usage.usedClusters) * usage.sectorsPerCluster * 256 / 1024) : 0;
  const usedKB = totKB - freeKB;

  // posição do mouse → índice da célula (ou null fora do anel/disco)
  const cellAt = (e: React.MouseEvent<SVGSVGElement>): { k: number; lx: number; ly: number } | null => {
    if (!view) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * S - cx, py = (e.clientY - r.top) / r.height * S - cy;
    const d = Math.hypot(px, py); if (d > rOut || d < rIn) return null;
    const ring = (rOut - rIn) / view.rings, t = Math.min(view.rings - 1, Math.floor((rOut - d) / ring));
    let a = Math.atan2(py, px) + Math.PI / 2; a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const s = Math.min(SECT - 1, Math.floor(a / (2 * Math.PI / SECT)));
    const k = t * SECT + s;
    return view.frac[k] >= 0 ? { k, lx: e.clientX - r.left, ly: e.clientY - r.top } : null;
  };
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => { const c = cellAt(e); setHover(c ? { k: c.k, x: c.lx, y: c.ly } : null); };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const c = cellAt(e); if (!c || !view || !onPickCell) return;
    onPickCell(c.k * view.cpc, Math.min((c.k + 1) * view.cpc, view.tot));
  };

  const L = (a: string, b: string) => (pt ? a : b);

  return (
    <div style={{ width: 252, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
      {/* cartão do disco */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
          <HardDrive size={16} className="text-[var(--primary)]" />
          <b style={{ color: '#c4b5fd', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</b>
          <span style={{ marginLeft: 'auto', fontSize: 9, color: editable ? (dirty ? '#fbbf24' : '#34d399') : '#a78bfa', border: `1px solid ${editable ? (dirty ? '#fbbf2455' : '#34d39955') : '#a78bfa55'}`, borderRadius: 4, padding: '0 5px' }}>
            {editable ? (dirty ? (pt ? 'não salvo' : 'unsaved') : (pt ? 'editável' : 'editable')) : (pt ? 'leitura' : 'read-only')}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {ident?.name?.trim() || '(sem volume)'} · {totKB >= 1024 ? (totKB / 1024).toFixed(1) + ' MB' : totKB + ' KB'} · {ident?.sides === 2 ? (pt ? '2 lados' : '2 sides') : (pt ? '1 lado' : '1 side')}
        </div>
      </div>

      {/* platter de ocupação */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 10, gap: 8 }}>
        {view ? (
          <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick} style={{ display: 'block', cursor: onPickCell ? 'pointer' : 'default' }}>
            {paths}
            <circle cx={cx} cy={cy} r={rIn} fill={C.hub} stroke={C.hubRing} strokeWidth={0.8} />
            <text x={cx} y={cy - 1} textAnchor="middle" fontSize={rIn * 0.62} fontWeight={700} fill="#e2e8f0">{pct}%</text>
            <text x={cx} y={cy + rIn * 0.5} textAnchor="middle" fontSize={rIn * 0.3} fill="#94a3b8">{L('cheio', 'full')}</text>
          </svg>
        ) : <div style={{ height: S, display: 'flex', alignItems: 'center', color: 'var(--text-muted)', fontSize: 11 }}>{pt ? '(sem mídia)' : '(no media)'}</div>}
        {/* legenda foi p/ a barra de status (Os9MediaLegend) — aqui em baixo do platter fica livre p/ ações (defrag, futuro) */}
        {hover && view && (
          <div style={{ position: 'absolute', left: Math.min(hover.x + 10, S - 8), top: hover.y + 10, zIndex: 10, pointerEvents: 'none', background: 'rgba(2,6,12,0.96)', border: '1px solid rgba(20,250,200,0.5)', borderRadius: 4, padding: '3px 6px', fontSize: 9, color: '#7dd3fc', whiteSpace: 'nowrap' }}>
            {view.cpc > 1
              ? <>{L('clusters', 'clusters')} {hover.k * view.cpc}–{Math.min((hover.k + 1) * view.cpc, view.tot) - 1} · {Math.round(view.frac[hover.k] * 100)}% {L('usado', 'used')}</>
              : <>cluster {hover.k} · {view.frac[hover.k] ? L('usado', 'used') : L('livre', 'free')}</>}
          </div>
        )}
      </div>

      {/* estatísticas */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 3, columnGap: 8 }}>
        <span>{L('Usado', 'Used')}: <b style={{ color: '#5eead4' }}>{usedKB} KB</b></span>
        <span>{L('Livre', 'Free')}: <b style={{ color: '#94a3b8' }}>{freeKB} KB</b></span>
        <span>{L('Clusters', 'Clusters')}: {usage?.usedClusters}/{usage?.totalClusters}</span>
        <span>{L('Cluster', 'Cluster')}: {usage?.sectorsPerCluster} {L('set', 'sct')} ({clKB}K)</span>
      </div>
    </div>
  );
}

// Legenda do platter (movida p/ a barra de status do explorer — evita transbordar sob o painel de baixo).
export function Os9MediaLegend({ lang }: { lang: string }) {
  const pt = lang === 'pt-br';
  const L = (a: string, b: string) => (pt ? a : b);
  return (
    <span style={{ display: 'inline-flex', gap: 8, fontSize: 9, color: '#94a3b8', alignItems: 'center' }}>
      {([[C.used, L('USO', 'USED')], [C.part, L('PARCIAL', 'PARTIAL')], [C.free, L('LIVRE', 'FREE')]] as [string, string][]).map(([c, l]) => (
        <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, background: c, borderRadius: 1 }} />{l}</span>
      ))}
    </span>
  );
}
