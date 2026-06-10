import React from 'react';
import { BookOpen, X, HelpCircle } from 'lucide-react';

// Sistema de AJUDA POR ABA. O conteúdo de cada aba mora num arquivo .md (manual), importado como texto
// cru (?raw) e convertido para HTML por um mini-renderizador Markdown (sem dependências externas).
//
// DIRETRIZ DO PROJETO: ao adicionar/alterar uma funcionalidade de uma aba, ATUALIZE o .md correspondente
// em src/renderer/src/help/ — a Ajuda deve refletir sempre o app atual.

import os9PtMd from '../help/os9.pt.md?raw';
import os9EnMd from '../help/os9.en.md?raw';
import dskPtMd from '../help/dsk.pt.md?raw';
import dskEnMd from '../help/dsk.en.md?raw';
import k7PtMd from '../help/k7.pt.md?raw';
import k7EnMd from '../help/k7.en.md?raw';
import gwPtMd from '../help/gw.pt.md?raw';
import gwEnMd from '../help/gw.en.md?raw';
import basicPtMd from '../help/basic.pt.md?raw';
import basicEnMd from '../help/basic.en.md?raw';
import xroarPtMd from '../help/xroar.pt.md?raw';
import xroarEnMd from '../help/xroar.en.md?raw';
import fujinetPtMd from '../help/fujinet.pt.md?raw';
import fujinetEnMd from '../help/fujinet.en.md?raw';

export type HelpTopic = 'os9' | 'dsk' | 'k7' | 'gw' | 'basic' | 'xroar' | 'fujinet';
type Lang = 'pt-br' | 'en-us';

const DOCS: Record<HelpTopic, { pt: string; en: string }> = {
  os9: { pt: os9PtMd, en: os9EnMd }, dsk: { pt: dskPtMd, en: dskEnMd }, k7: { pt: k7PtMd, en: k7EnMd },
  gw: { pt: gwPtMd, en: gwEnMd }, basic: { pt: basicPtMd, en: basicEnMd }, xroar: { pt: xroarPtMd, en: xroarEnMd },
  fujinet: { pt: fujinetPtMd, en: fujinetEnMd },
};
const TITLES: Record<HelpTopic, { pt: string; en: string }> = {
  os9: { pt: 'Aba OS-9 / NitrOS-9', en: 'OS-9 / NitrOS-9 Tab' },
  dsk: { pt: 'Aba DSK (Disquetes RS-DOS / Dragon)', en: 'DSK Tab (RS-DOS / Dragon Floppies)' },
  k7: { pt: 'Aba K7 (Fita Cassete)', en: 'K7 Tab (Cassette Tape)' },
  gw: { pt: 'Aba GW (Greaseweazle)', en: 'GW Tab (Greaseweazle)' },
  basic: { pt: 'Aba BASIC', en: 'BASIC Tab' },
  xroar: { pt: 'Aba XRoar (Emulador)', en: 'XRoar Tab (Emulator)' },
  fujinet: { pt: 'Aba FujiNet / Acesso Direto Online', en: 'FujiNet / Direct Online Access Tab' },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// inline: **negrito**, `código`
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-[12px]">$1</code>');

/** Mini-Markdown → HTML (cabeçalhos, listas, tabelas, citações, regra, parágrafos). Conteúdo é nosso. */
function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  const flushPara = (buf: string[]) => { if (buf.length) { out.push(`<p class="mb-3 leading-relaxed text-justify">${buf.map(inline).join(' ')}</p>`); buf.length = 0; } };
  let para: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flushPara(para); i++; continue; }
    // headings
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara(para);
      const lvl = m[1].length, txt = inline(m[2]);
      const cls = lvl === 1 ? 'text-xl font-bold text-white mt-1 mb-4'
        : lvl === 2 ? 'text-lg font-bold text-cyan-400 mt-6 mb-3 border-b border-slate-800 pb-1'
        : lvl === 3 ? 'text-[15px] font-bold text-purple-300 mt-5 mb-2'
        : 'text-[13px] font-bold text-amber-300 mt-4 mb-1.5';
      out.push(`<h${lvl} class="${cls}">${txt}</h${lvl}>`);
      i++; continue;
    }
    if (/^---+$/.test(t)) { flushPara(para); out.push('<hr class="my-4 border-slate-800" />'); i++; continue; }
    // table: header row + separator row
    if (t.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1].trim())) {
      flushPara(para);
      const cells = (r: string) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const head = cells(t); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i].trim())); i++; }
      let tb = '<div class="overflow-x-auto mb-4"><table class="w-full text-[12px] border-collapse">';
      tb += '<thead><tr>' + head.map(h => `<th class="text-left font-bold text-cyan-300 border-b border-slate-700 px-2 py-1.5">${inline(h)}</th>`).join('') + '</tr></thead><tbody>';
      for (const r of rows) tb += '<tr class="border-b border-slate-800/60">' + r.map(c => `<td class="align-top px-2 py-1.5 text-slate-300">${inline(c)}</td>`).join('') + '</tr>';
      tb += '</tbody></table></div>';
      out.push(tb); continue;
    }
    // unordered list
    if (/^[-*]\s+/.test(t)) {
      flushPara(para);
      let lst = '<ul class="list-disc list-outside ml-5 mb-3 space-y-1">';
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { lst += `<li class="leading-relaxed">${inline(lines[i].trim().replace(/^[-*]\s+/, ''))}</li>`; i++; }
      lst += '</ul>'; out.push(lst); continue;
    }
    // ordered list
    if (/^\d+\.\s+/.test(t)) {
      flushPara(para);
      let lst = '<ol class="list-decimal list-outside ml-5 mb-3 space-y-1">';
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { lst += `<li class="leading-relaxed">${inline(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`; i++; }
      lst += '</ol>'; out.push(lst); continue;
    }
    // blockquote
    if (t.startsWith('>')) {
      flushPara(para);
      let q = '';
      while (i < lines.length && lines[i].trim().startsWith('>')) { q += ' ' + lines[i].trim().replace(/^>\s?/, ''); i++; }
      out.push(`<blockquote class="border-l-2 border-cyan-700 pl-3 my-3 text-slate-400 italic">${inline(q.trim())}</blockquote>`); continue;
    }
    para.push(t); i++;
  }
  flushPara(para);
  return out.join('\n');
}

// memoiza a conversão (uma vez por tópico+idioma)
const htmlCache: Partial<Record<string, string>> = {};
const getHtml = (topic: HelpTopic, lang: Lang) => {
  const key = topic + (lang === 'en-us' ? ':en' : ':pt');
  return (htmlCache[key] ??= mdToHtml(lang === 'en-us' ? DOCS[topic].en : DOCS[topic].pt));
};

/** Botão "?" compacto para a barra de ferramentas de uma aba. */
export function HelpButton({ onClick, lang, label }: { onClick: () => void; lang?: Lang; label?: string }) {
  const txt = label ?? (lang === 'en-us' ? 'Help' : 'Ajuda');
  return (
    <button onClick={onClick} className="dsk-tool flex items-center gap-1" title={lang === 'en-us' ? 'Help for this tab' : 'Ajuda desta aba'} aria-label="Help">
      <HelpCircle size={14} /> {txt}
    </button>
  );
}

/** Modal que mostra o manual (.md) de uma aba, no idioma atual. */
export function TabHelpModal({ topic, lang, onClose }: { topic: HelpTopic; lang?: Lang; onClose: () => void }) {
  const l: Lang = lang === 'en-us' ? 'en-us' : 'pt-br';
  return (
    <div className="glass-modal-overlay flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-slate-900 border border-[var(--border)] rounded-xl shadow-2xl flex flex-col w-full max-w-3xl max-h-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border)] bg-slate-950/50">
          <div className="flex items-center gap-3">
            <BookOpen className="text-[var(--primary)] glow-text-primary" size={22} />
            <h2 className="text-base font-bold text-white uppercase tracking-wider">{l === 'en-us' ? 'Help' : 'Ajuda'} — {l === 'en-us' ? TITLES[topic].en : TITLES[topic].pt}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-rose-900/50 transition-colors"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-7 text-[13px] text-slate-300 leading-relaxed custom-scrollbar" dangerouslySetInnerHTML={{ __html: getHtml(topic, l) }} />
      </div>
    </div>
  );
}
