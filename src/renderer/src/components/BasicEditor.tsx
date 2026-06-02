import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { MC6847_FONT, mc6847Glyph } from '../mc6847font';
import { Scissors, Copy, Clipboard, Search, Replace, Play, RotateCcw, Save, FolderOpen, Disc, FileCode2 } from 'lucide-react';
import { X } from 'lucide-react';

interface Props {
  lang: 'pt-br' | 'en-us';
  text: string;
  onTextChange: (v: string) => void;
  name: string;
  onNameChange: (v: string) => void;
  pane: 'A' | 'B';
  onPaneChange: (p: 'A' | 'B') => void;
  screen: string;
  onScreenChange: (s: string) => void;
  addNew: boolean;
  onAddNewChange: (v: boolean) => void;
  addRun: boolean;
  onAddRunChange: (v: boolean) => void;
  bold: boolean;
  onBoldChange: (v: boolean) => void;
  // Roda o programa no XRoar. reset=true força hard-reset (boot limpo) antes de digitar.
  onRun: (program: string, reset: boolean) => void;
  // Salva como .BAS (ASCII) num painel do editor DSK (A/B). A confirmação fica no App.
  onSaveToDisk: (name: string, program: string) => void;
  // Salva como arquivo de TEXTO (.bas) no sistema de arquivos.
  onSaveTextFile: (name: string, program: string) => void;
  // Abre um arquivo de texto (.bas) do sistema de arquivos para o editor.
  onOpenTextFile: () => void;
  // Rótulo do arquivo aberto a partir de um DSK (ex.: "JOGO.BAS (A)") ou null se não veio de DSK.
  sourceLabel: string | null;
  // Atualiza o arquivo na imagem DSK de origem (in-place).
  onUpdateInDsk: () => void;
}

// Combinações de cores do editor (fundo/letra) selecionáveis por dropdown.
const SCHEMES: Record<string, { bg: string; fg: string; pt: string; en: string }> = {
  'green-black':  { bg: '#1fa81f', fg: '#000000', pt: 'Fundo Verde / Letra Preta',       en: 'Green bg / Black text' },
  'orange-black': { bg: '#e08a1e', fg: '#000000', pt: 'Fundo Laranja / Letra Preta',     en: 'Orange bg / Black text' },
  'black-green':  { bg: '#0a0a0a', fg: '#33d83a', pt: 'Fundo Preto / Letra Verde',       en: 'Black bg / Green text' },
  'black-orange': { bg: '#0a0a0a', fg: '#ff9a33', pt: 'Fundo Preto / Letra Laranja',     en: 'Black bg / Orange text' },
  'blue-white':   { bg: '#000080', fg: '#ffffff', pt: 'Fundo Azul Marinho / Letra Branca', en: 'Navy bg / White text' },
  'black-white':  { bg: '#0a0a0a', fg: '#ffffff', pt: 'Fundo Preto / Letra Branca',      en: 'Black bg / White text' },
};
const schemeOf = (k: string) => SCHEMES[k] || SCHEMES['green-black'];

// Editor de BASIC do Color Computer: texto livre, SEMPRE em maiúsculas (o Color BASIC não
// aceita minúsculas), com toolbar (abrir/salvar/recortar/copiar/colar/procurar/substituir),
// injeção no XRoar e gravação como .BAS (ASCII) num painel DSK.
export default function BasicEditor({
  lang, text, onTextChange, name, onNameChange, pane, onPaneChange, screen, onScreenChange,
  addNew, onAddNewChange, addRun, onAddRunChange, bold, onBoldChange,
  onRun, onSaveToDisk, onSaveTextFile, onOpenTextFile, sourceLabel, onUpdateInDsk,
}: Props) {
  const t = (pt: string, en: string) => (lang === 'pt-br' ? pt : en);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Posição do cursor a restaurar após uma mudança de valor (uppercase/colar). Sem isto, a
  // textarea CONTROLADA reposiciona o cursor no FIM ao reaplicar o value (bug: pulava p/ última linha).
  const caretToRestore = useRef<{ s: number; e: number } | null>(null);
  useLayoutEffect(() => {
    const ta = taRef.current; const c = caretToRestore.current;
    if (ta && c) { ta.selectionStart = c.s; ta.selectionEnd = c.e; caretToRestore.current = null; }
  });

  const [findOpen, setFindOpen] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [findStr, setFindStr] = useState('');
  const [replStr, setReplStr] = useState('');

  const empty = !text.trim();
  const focusTA = () => taRef.current?.focus();

  // Auto-maiúsculas: ligado por padrão (o Color BASIC clássico só produz maiúsculas no prompt),
  // mas pode ser DESLIGADO para permitir minúsculas (CoCo 3 / Disk BASIC aceitam). Persistido.
  const [autoUpper, setAutoUpper] = useState(() => { try { return localStorage.getItem('basicUpper') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('basicUpper', autoUpper ? '1' : '0'); } catch { /* ignore */ } }, [autoUpper]);
  const applyCase = (v: string) => (autoUpper ? v.toUpperCase() : v);
  const setUpper = (v: string) => onTextChange(applyCase(v));
  // "Maiúsculas auto" maiusculiza SÓ o trecho RECÉM-DIGITADO/COLADO, preservando o que já existia
  // (inclusive minúsculas anteriores). Diff por prefixo/sufixo comum entre o texto antigo e o novo.
  const applyCaseDelta = (oldText: string, newText: string): string => {
    if (!autoUpper) return newText;
    let i = 0;
    while (i < oldText.length && i < newText.length && oldText[i] === newText[i]) i++;
    let j = 0;
    while (j < oldText.length - i && j < newText.length - i && oldText[oldText.length - 1 - j] === newText[newText.length - 1 - j]) j++;
    return newText.slice(0, i) + newText.slice(i, newText.length - j).toUpperCase() + newText.slice(newText.length - j);
  };

  // ── Modo de tela do editor (persistido): 'normal' (editor de sempre, com temas de cor),
  // 'vdg' (aparência VDG do CoCo com a fonte monospace do sistema) e 'vdg6847' (idem, com a fonte
  // autêntica do MC6847 quando disponível). Nos modos VDG: maiúsculas/símbolos = letra PRETA sobre
  // fundo VERDE; minúsculas = vídeo INVERSO (verde-claro sobre verde-escuro), pois o VDG não tem
  // glifos minúsculos — mostra a maiúscula invertida. Edição DIRETA via overlay (textarea
  // transparente sobre a camada de render; a camada está no fluxo e dá a altura → cursor alinha e
  // o scroll acompanha sozinho).
  const [display, setDisplay] = useState<'normal' | 'vdg' | 'vdg6847'>(() => { try { const d = localStorage.getItem('basicDisplay'); return d === 'vdg' || d === 'vdg6847' ? d : 'normal'; } catch { return 'normal'; } });
  useEffect(() => { try { localStorage.setItem('basicDisplay', display); } catch { /* ignore */ } }, [display]);

  // Velocidade de digitação do código no XRoar (persistente). 'fast' = 12ms/tecla, 'normal' = 25ms.
  // O XRoarPanel lê esta preferência (localStorage 'xroarTypeSpeed') na hora de digitar.
  const [typeSpeed, setTypeSpeed] = useState<'fast' | 'normal'>(() => { try { return localStorage.getItem('xroarTypeSpeed') === 'fast' ? 'fast' : 'normal'; } catch { return 'normal'; } });
  useEffect(() => { try { localStorage.setItem('xroarTypeSpeed', typeSpeed); } catch { /* ignore */ } }, [typeSpeed]);

  // "ENTER ao final" (persistente, padrão LIGADO): se a última linha do editor for código sem quebra
  // final, acrescenta um ENTER (CR) ao injetar, validando/inserindo essa última linha no emulador.
  const [addEnter, setAddEnter] = useState(() => { try { return localStorage.getItem('basicEnterEnd') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('basicEnterEnd', addEnter ? '1' : '0'); } catch { /* ignore */ } }, [addEnter]);

  // 32 colunas (persistente): quebra a tela na largura real do CoCo (32 col) nos modos VDG, em vez de
  // não-quebrar + rolagem horizontal. A textarea sobreposta quebra junto (largura = 32 células).
  const COLS = 32;
  const [wrap32, setWrap32] = useState(() => { try { return localStorage.getItem('basicWrap32') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('basicWrap32', wrap32 ? '1' : '0'); } catch { /* ignore */ } }, [wrap32]);
  // Escala da fonte autêntica VDG 6847 (persistente): P/M/G → tamanho da célula do canvas.
  const [vdgScale, setVdgScale] = useState<'sm' | 'md' | 'lg'>(() => { try { const v = localStorage.getItem('basicVdgScale'); return v === 'sm' || v === 'lg' ? v : 'md'; } catch { return 'md'; } });
  useEffect(() => { try { localStorage.setItem('basicVdgScale', vdgScale); } catch { /* ignore */ } }, [vdgScale]);

  // Quebra o texto em linhas VISUAIS de 32 colunas (cada linha lógica vira ceil(len/32) linhas de tela).
  const wrapForDisplay = (raw: string): string[] => {
    const out: string[] = [];
    for (const line of (raw ?? '').split('\n')) {
      if (!wrap32 || line.length <= COLS) { out.push(line); continue; }
      for (let i = 0; i < line.length; i += COLS) out.push(line.slice(i, i + COLS));
    }
    return out;
  };

  const isVdg = display !== 'normal';
  const VDG_GREEN = '#3fcf3f', VDG_DARK = '#06320a';
  const vdgFontFamily = "'Courier New', monospace";
  // No VDG, o '^' (exponenciação) é mostrado como a SETA PARA CIMA (↑), como no teclado/tela do CoCo.
  const toVdgText = (s: string) => s.replace(/\^/g, '↑');
  // Renderiza o texto (modo VDG-mono) agrupando trechos contíguos de mesma "caixa" (poucos spans).
  const renderVdg = (s: string): React.ReactNode[] => {
    const out: React.ReactNode[] = []; let k = 0;
    const lines = s.length ? s.split('\n') : [''];
    lines.forEach((line, li) => {
      let i = 0;
      while (i < line.length) {
        const lower = line[i] >= 'a' && line[i] <= 'z';
        let run = '';
        while (i < line.length && ((line[i] >= 'a' && line[i] <= 'z') === lower)) { run += line[i]; i++; }
        out.push(lower
          ? <span key={k++} style={{ background: VDG_DARK, color: VDG_GREEN }}>{toVdgText(run.toUpperCase())}</span>
          : <span key={k++} style={{ color: '#000' }}>{toVdgText(run)}</span>);
      }
      if (li < lines.length - 1) out.push('\n');
    });
    return out;
  };

  // ── Modo 'vdg6847': desenha os glifos PIXELADOS do MC6847 num canvas. A célula é a largura de
  // avanço REAL do monospace (medida), e o canvas usa essa mesma célula → alinha com a textarea
  // transparente (editável). Sem quebra de linha (cada linha do texto = 1 linha de tela; rola na
  // horizontal). A seta-para-cima já vem do glifo 0x1E (mc6847Glyph mapeia '^' → ela).
  const measurePx = vdgScale === 'sm' ? 20 : vdgScale === 'lg' ? 34 : 26; // px da fonte autêntica (escala P/M/G)
  const measureRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cellW, setCellW] = useState(15.6);
  const cellH = Math.round(cellW * 1.5);
  useLayoutEffect(() => {
    if (display !== 'vdg6847') return;
    const canvas = canvasRef.current; if (!canvas) return;
    // Mede o avanço REAL do monospace agora (evita usar uma célula obsoleta no 1º desenho, o que
    // bagunçava os glifos/minúsculas). Usa A no desenho e sincroniza a textarea (line-height).
    const span = measureRef.current;
    let A = cellW;
    if (span) { const w = span.getBoundingClientRect().width / 20; if (w > 4) A = w; }
    if (Math.abs(A - cellW) > 0.05) setCellW(A);
    const LH = Math.round(A * 1.5);
    const lines = wrapForDisplay(text);                                 // 32 col → quebra; senão 1 linha lógica = 1 linha
    const cols = wrap32 ? COLS : Math.max(1, ...lines.map(l => l.length));
    // No modo 32 col damos a PROPORÇÃO da tela do CoCo (mín. 16 linhas) → quadro 32×16 centralizado,
    // em vez de uma faixa fininha. Sem 32 col, a altura segue o texto (rolagem horizontal).
    const rows = wrap32 ? Math.max(16, lines.length) : Math.max(1, lines.length);
    const W = Math.ceil(cols * A) + 2, H = rows * LH;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = VDG_GREEN; ctx.fillRect(0, 0, W, H);
    const dw = A / 8, dh = LH / 12;
    for (let row = 0; row < lines.length; row++) {
      const line = lines[row];
      for (let col = 0; col < line.length; col++) {
        const g = mc6847Glyph(line.charCodeAt(col));
        const x0 = col * A, y0 = row * LH;
        if (g.inverse) { ctx.fillStyle = VDG_DARK; ctx.fillRect(Math.floor(x0), y0, Math.ceil(A) + 1, LH); }
        ctx.fillStyle = g.inverse ? VDG_GREEN : '#000';
        const base = g.idx * 12;
        for (let r = 0; r < 12; r++) { const b = MC6847_FONT[base + r]; if (!b) continue;
          for (let c = 0; c < 8; c++) if ((b >> (7 - c)) & 1) ctx.fillRect(Math.floor(x0 + c * dw), Math.floor(y0 + r * dh), Math.ceil(dw), Math.ceil(dh)); }
      }
    }
  }, [text, cellW, display, wrap32, measurePx]); // measurePx = escala; re-mede a célula e redesenha ao mudar

  // Insere texto na posição do cursor (usado por colar e substituir). Maiusculiza SÓ o texto inserido
  // (up), preservando o restante (inclusive minúsculas que já existiam).
  const insertAtCursor = (ins: string) => {
    const ta = taRef.current;
    const up = applyCase(ins);
    if (!ta) { onTextChange(text + up); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const next = text.slice(0, s) + up + text.slice(e);
    caretToRestore.current = { s: s + up.length, e: s + up.length };
    onTextChange(next);
  };

  // Seta-pra-cima do CoCo (↑ = '^', exponenciação). A tecla ↑ navega, então oferecemos Alt+↑ e um botão.
  const insertUpArrow = () => { focusTA(); insertAtCursor('^'); };
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowUp' || e.code === 'ArrowUp')) {
      e.preventDefault();
      insertAtCursor('^');
    }
  };

  const doCut = () => { focusTA(); document.execCommand('cut'); };
  const doCopy = () => { focusTA(); document.execCommand('copy'); };
  const doPaste = async () => {
    focusTA();
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) insertAtCursor(clip);
    } catch { document.execCommand('paste'); }
  };

  // Procurar: seleciona a próxima ocorrência a partir do cursor (com wrap).
  const findNext = () => {
    const ta = taRef.current; const needle = findStr.toUpperCase();
    if (!ta || !needle) return;
    const from = ta.selectionEnd;
    let idx = text.indexOf(needle, from);
    if (idx === -1) idx = text.indexOf(needle, 0); // wrap
    if (idx === -1) return;
    ta.focus();
    ta.setSelectionRange(idx, idx + needle.length);
  };

  // Substituir: se a seleção atual já for o alvo, troca; depois pula para a próxima.
  const replaceOne = () => {
    const ta = taRef.current; const needle = findStr.toUpperCase();
    if (!ta || !needle) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    if (text.slice(s, e).toUpperCase() === needle) {
      const repl = replStr.toUpperCase();
      const next = (text.slice(0, s) + repl + text.slice(e)).toUpperCase();
      onTextChange(next);
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + repl.length, s + repl.length); findNext(); });
    } else {
      findNext();
    }
  };

  const replaceAll = () => {
    const needle = findStr.toUpperCase();
    if (!needle) return;
    const next = text.split(needle).join(replStr.toUpperCase()).toUpperCase();
    onTextChange(next);
  };

  // Monta o texto a injetar: NEW (opcional) + programa + RUN (opcional). O xroar.html
  // converte \n em \r (ENTER do CoCo) automaticamente.
  //   omitNew=true: usado pelo "Rodar com reset" — o hard reset já LIMPA a RAM, então o NEW é
  //   redundante e é dispensado (vai só o programa + RUN opcional).
  const buildProgram = (omitNew = false) => {
    let s = '';
    if (addNew && !omitNew) s += 'NEW\n';
    s += text;
    if (addRun) { if (s.length && !s.endsWith('\n')) s += '\n'; s += 'RUN\n'; }
    // ENTER ao final: garante a quebra final (insere a última linha) quando não há RUN nem \n no fim.
    else if (addEnter && s.length && !s.endsWith('\n')) s += '\n';
    return s;
  };

  const safeName = () => (name || 'PRGNOME').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PRGNOME';
  const lineCount = text.length ? text.split('\n').length : 0;

  const toolBtn = 'dsk-tool';
  const sep = <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />;

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-3" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap flex-shrink-0">
        {/* Arquivo de TEXTO (.bas) no sistema de arquivos */}
        <button onClick={onOpenTextFile} title={t('Abrir arquivo .BAS (texto)', 'Open .BAS text file')} className={toolBtn}><FolderOpen size={15} /></button>
        <button onClick={() => onSaveTextFile(safeName(), text)} disabled={empty} title={t('Salvar como arquivo .BAS (texto)', 'Save as .BAS text file')} className={`${toolBtn} disabled:opacity-30 disabled:cursor-not-allowed`}><Save size={15} /></button>
        {sep}
        <button onClick={doCut} title={t('Recortar', 'Cut')} className={toolBtn}><Scissors size={15} /></button>
        <button onClick={doCopy} title={t('Copiar', 'Copy')} className={toolBtn}><Copy size={15} /></button>
        <button onClick={doPaste} title={t('Colar', 'Paste')} className={toolBtn}><Clipboard size={15} /></button>
        {sep}
        <button onClick={() => { setFindOpen(true); setShowReplace(false); }} title={t('Procurar', 'Find')} className={toolBtn}><Search size={15} /></button>
        <button onClick={() => { setFindOpen(true); setShowReplace(true); }} title={t('Procurar e substituir', 'Find & replace')} className={toolBtn}><Replace size={15} /></button>
        {sep}
        {/* Seta-pra-cima do CoCo (↑ = '^', exponenciação). A tecla ↑ navega; aqui inserimos por botão ou Alt+↑. */}
        <button onClick={insertUpArrow} title={t('Inserir ↑ (seta-pra-cima do CoCo = ^, exponenciação) — atalho: Alt+↑', 'Insert ↑ (CoCo up-arrow = ^, exponentiation) — shortcut: Alt+↑')} className={`${toolBtn} font-bold`} style={{ fontSize: 15, lineHeight: 1 }}>↑</button>
        {sep}
        <button onClick={() => onRun(buildProgram(), false)} disabled={empty} className="btn btn-primary py-1.5 px-3 text-[11px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed" title={t('Digita NEW + programa no XRoar (precisa estar no prompt OK)', 'Types NEW + program into XRoar (must be at the OK prompt)')}>
          <Play size={13} /> {t('Rodar no XRoar', 'Run in XRoar')}
        </button>
        <button onClick={() => onRun(buildProgram(true), true)} disabled={empty} className="btn btn-secondary py-1.5 px-3 text-[11px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed" title={t('Reinicia o emulador (boot limpo, sem NEW — o reset já limpa a RAM) e então digita o programa', 'Resets the emulator (clean boot, no NEW — reset already clears RAM) then types the program')}>
          <RotateCcw size={13} /> {t('Rodar com reset', 'Run + reset')}
        </button>
        <div className="flex-1" />
        {/* Badge "EDITANDO": identifica que o conteúdo veio de um arquivo de disco */}
        {sourceLabel && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md flex items-center gap-1"
            style={{ color: 'var(--primary)', border: '1px solid var(--primary)', background: 'var(--primary-glow)' }}
            title={`${t('Editando', 'Editing')}: ${sourceLabel}`}
          >
            <FileCode2 size={12} /> {t('Editando', 'Editing')}
          </span>
        )}
        {/* SALVAR in-place: atualiza o arquivo na imagem DSK de onde foi aberto */}
        {sourceLabel && (
          <button onClick={onUpdateInDsk} disabled={empty} className="btn btn-primary py-1.5 px-3 text-[11px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed" title={t(`Atualiza "${sourceLabel}" na imagem DSK de origem`, `Update "${sourceLabel}" in its source DSK image`)}>
            <Disc size={13} /> {t('Salvar', 'Save')}
          </button>
        )}
        {/* Gravar como .BAS (ASCII) num painel do editor DSK (cria/usa o disco do painel) */}
        <span className="text-[10px] text-[var(--text-secondary)] font-semibold">{t('Painel', 'Pane')}</span>
        <select value={pane} onChange={e => onPaneChange(e.target.value as 'A' | 'B')} className="input-select text-xs py-1" style={{ width: 72, paddingRight: 22 }} title={t('Painel DSK de destino do .BAS', 'Target DSK pane for the .BAS')}>
          <option value="A">A</option>
          <option value="B">B</option>
        </select>
        <input
          value={name}
          onChange={e => onNameChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
          placeholder="PRG-NOME"
          className="input-text py-1.5 text-xs"
          style={{ width: 110 }}
          title={t('Nome do arquivo .BAS — máximo 8 caracteres, apenas A-Z e 0-9 (sem espaços/símbolos)', '.BAS file name — max 8 chars, only A-Z and 0-9 (no spaces/symbols)')}
        />
        <button onClick={() => onSaveToDisk(safeName(), text)} disabled={empty} className="btn btn-secondary py-1.5 px-3 text-[11px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed" title={t(`Cria/usa o disco do Painel ${pane} e grava como .BAS (ASCII)`, `Create/use Pane ${pane}'s disk and save as ASCII .BAS`)}>
          <Disc size={13} /> {t('Novo DSK + Salvar', 'New DSK + Save')} → {pane}
        </button>
      </div>

      {/* Find / Replace bar */}
      {findOpen && (
        <div className="flex items-center gap-2 mb-2 p-2 glass-panel flex-wrap flex-shrink-0">
          <Search size={13} className="text-[var(--text-muted)]" />
          <input
            value={findStr}
            onChange={e => setFindStr(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') findNext(); if (e.key === 'Escape') setFindOpen(false); }}
            placeholder={t('Procurar…', 'Find…')}
            className="input-text py-1 text-xs"
            style={{ width: 180 }}
            autoFocus
          />
          <button onClick={findNext} className="dsk-tool text-[11px] px-2">{t('Próximo', 'Next')}</button>
          {showReplace && (
            <>
              <Replace size={13} className="text-[var(--text-muted)] ml-1" />
              <input
                value={replStr}
                onChange={e => setReplStr(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') replaceOne(); if (e.key === 'Escape') setFindOpen(false); }}
                placeholder={t('Substituir por…', 'Replace with…')}
                className="input-text py-1 text-xs"
                style={{ width: 180 }}
              />
              <button onClick={replaceOne} className="dsk-tool text-[11px] px-2">{t('Substituir', 'Replace')}</button>
              <button onClick={replaceAll} className="dsk-tool text-[11px] px-2">{t('Todos', 'All')}</button>
            </>
          )}
          {!showReplace && (
            <button onClick={() => setShowReplace(true)} className="dsk-tool text-[11px] px-2">{t('Substituir…', 'Replace…')}</button>
          )}
          <div className="flex-1" />
          <button onClick={() => setFindOpen(false)} className="dsk-tool" title={t('Fechar', 'Close')}><X size={14} /></button>
        </div>
      )}

      {/* Área de edição. Modos VDG: EDITÁVEL via overlay — a camada de render fica NO FLUXO (define a
          altura) e a textarea transparente é absoluta por cima (mesmo estilo/medida → cursor alinha;
          o container rola e leva as duas juntas). Modo normal: a textarea de sempre. */}
      {display === 'vdg' ? (
        (() => {
          // 32 col: largura fixa ≈32 colunas (32 avanços + 32 letter-spacings). As DUAS camadas usam a
          // MESMA largura/CSS → quebram igual e o cursor continua alinhado, mesmo que a coluna exata varie.
          const wrapW = wrap32 ? 'calc(32ch + 32px)' : undefined;
          const vdgFont: React.CSSProperties = { margin: 0, padding: 12, fontFamily: vdgFontFamily, fontSize: 14, lineHeight: 1.55, letterSpacing: '1px', whiteSpace: 'pre-wrap', wordBreak: wrap32 ? 'break-all' : 'break-word', width: wrapW, fontWeight: bold ? 700 : 400 };
          // 32 col: a tela verde vira um quadro centralizado (proporção ~32×16) num bezel escuro.
          const screenH = Math.round(16 * 1.55 * 14) + 24; // 16 linhas + padding
          return (
            <div className="flex-1 rounded-lg overflow-auto" style={{ minHeight: 0, background: wrap32 ? '#0b1018' : VDG_GREEN, border: '2px solid rgba(0,0,0,0.45)', padding: wrap32 ? 12 : 0, display: wrap32 ? 'flex' : 'block', justifyContent: wrap32 ? 'center' : undefined, alignItems: wrap32 ? 'flex-start' : undefined }}>
              <div style={{ position: 'relative', minHeight: wrap32 ? screenH : '100%', width: wrapW, margin: wrap32 ? '0 auto' : undefined, flex: wrap32 ? '0 0 auto' : undefined, background: wrap32 ? VDG_GREEN : undefined, boxShadow: wrap32 ? '0 0 0 2px rgba(0,0,0,0.5), 0 6px 22px rgba(0,0,0,0.55)' : undefined }}>
                <div aria-hidden style={{ ...vdgFont, minHeight: '100%', pointerEvents: 'none' }}>
                  {text ? renderVdg(text) : <span style={{ color: 'rgba(0,0,0,0.35)' }}>{'10 CLS\n20 PRINT "HELLO WORLD"\n30 GOTO 20'}</span>}
                  {'​'}
                </div>
                <textarea
                  ref={taRef}
                  className="vdg-input"
                  value={text}
                  onChange={e => { const ta = e.currentTarget; caretToRestore.current = { s: ta.selectionStart, e: ta.selectionEnd }; onTextChange(applyCaseDelta(text, ta.value)); }}
                  onKeyDown={handleEditorKeyDown}
                  spellCheck={false}
                  autoCapitalize="characters"
                  style={{ ...vdgFont, position: 'absolute', inset: 0, color: 'transparent', caretColor: '#000', background: 'transparent', border: 0, outline: 'none', resize: 'none', overflow: 'hidden' }}
                />
              </div>
            </div>
          );
        })()
      ) : display === 'vdg6847' ? (
        // Canvas pixelado (glifos reais do MC6847) + textarea transparente alinhada (editável).
        // 32 col: largura fixa de 32 células (canvas + textarea quebram juntos em 32). Senão: max-content + rolagem.
        (() => {
          const wrapW = Math.ceil(COLS * cellW) + 2;
          // 32 col: a tela vira um quadro 32×16 CENTRALIZADO num bezel escuro (não a área verde inteira).
          return (
        <div className="flex-1 rounded-lg overflow-auto" style={{ minHeight: 0, background: wrap32 ? '#0b1018' : VDG_GREEN, border: '2px solid rgba(0,0,0,0.45)', position: 'relative', padding: wrap32 ? 12 : 0, display: wrap32 ? 'flex' : 'block', justifyContent: wrap32 ? 'center' : undefined, alignItems: wrap32 ? 'flex-start' : undefined }}>
          <div style={{ position: 'relative', width: wrap32 ? wrapW : 'max-content', minWidth: wrap32 ? undefined : '100%', minHeight: wrap32 ? undefined : '100%', margin: wrap32 ? '0 auto' : undefined, flex: wrap32 ? '0 0 auto' : undefined, boxShadow: wrap32 ? '0 0 0 2px rgba(0,0,0,0.5), 0 6px 22px rgba(0,0,0,0.55)' : undefined }}>
            <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
            <textarea
              ref={taRef}
              className="vdg-input"
              value={text}
              onChange={e => { const ta = e.currentTarget; caretToRestore.current = { s: ta.selectionStart, e: ta.selectionEnd }; onTextChange(applyCaseDelta(text, ta.value)); }}
              onKeyDown={handleEditorKeyDown}
              spellCheck={false}
              autoCapitalize="characters"
              style={{ position: 'absolute', inset: 0, margin: 0, padding: 0, fontFamily: vdgFontFamily, fontSize: measurePx, lineHeight: `${cellH}px`, letterSpacing: 0, whiteSpace: wrap32 ? 'pre-wrap' : 'pre', wordBreak: wrap32 ? 'break-all' : 'normal', width: wrap32 ? wrapW : undefined, color: 'transparent', caretColor: '#000', background: 'transparent', border: 0, outline: 'none', resize: 'none', overflow: 'hidden' }}
            />
          </div>
          <span ref={measureRef} aria-hidden style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', top: 0, left: 0, fontFamily: vdgFontFamily, fontSize: measurePx, letterSpacing: 0, whiteSpace: 'pre' }}>00000000000000000000</span>
        </div>
          );
        })()
      ) : (
        <textarea
          ref={taRef}
          value={text}
          onChange={e => { const ta = e.currentTarget; caretToRestore.current = { s: ta.selectionStart, e: ta.selectionEnd }; onTextChange(applyCaseDelta(text, ta.value)); }}
          onKeyDown={handleEditorKeyDown}
          spellCheck={false}
          autoCapitalize="characters"
          placeholder={'10 CLS\n20 PRINT "HELLO WORLD"\n30 GOTO 20'}
          className="flex-1 w-full p-3 font-mono text-sm leading-relaxed resize-none outline-none rounded-lg"
          style={{ minHeight: 0, color: schemeOf(screen).fg, fontWeight: bold ? 700 : 400, textTransform: 'none', background: schemeOf(screen).bg, border: '2px solid rgba(0,0,0,0.35)', caretColor: schemeOf(screen).fg }}
        />
      )}

      {/* Footer: opções + esquema de cores + contadores */}
      <div className="flex items-center gap-4 mt-2 text-[10px] text-[var(--text-secondary)] flex-wrap flex-shrink-0">
        <label className="flex items-center gap-1.5 cursor-pointer" title={t('Injeta NEW antes do programa (limpa a memória). Só vale em "Rodar no XRoar" (sem reset); em "Rodar com reset" o hard reset já limpa a RAM e o NEW é ignorado.', 'Injects NEW before the program (clears memory). Only applies to "Run in XRoar" (no reset); with "Run + reset" the hard reset already clears RAM, so NEW is ignored.')}>
          <input type="checkbox" checked={addNew} onChange={e => onAddNewChange(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          {t('NEW antes de injetar', 'NEW before injecting')}
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={addRun} onChange={e => onAddRunChange(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          {t('RUN ao final', 'RUN at the end')}
        </label>
        {/* ENTER ao final: dá um ENTER quando a última linha é código sem quebra, inserindo-a no emulador. */}
        <label className="flex items-center gap-1.5 cursor-pointer" title={t('Dá um ENTER no fim quando a última linha do editor é código (sem quebra final), garantindo que ela seja inserida no emulador. Dispensável se "RUN ao final" estiver ligado (o RUN já gera o ENTER).', 'Adds a final ENTER when the last editor line is code (no trailing newline), so it gets entered into the emulator. Not needed if "RUN at the end" is on (RUN already provides the ENTER).')}>
          <input type="checkbox" checked={addEnter} onChange={e => setAddEnter(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          {t('ENTER ao final', 'ENTER at the end')}
        </label>
        {/* Modo de tela: Normal (com temas) / VDG (fonte do sistema) / VDG 6847 (fonte autêntica). */}
        <label className="flex items-center gap-1.5" title={t('Aparência do editor. VDG = visual do CoCo (maiúscula preta no verde, minúscula em vídeo inverso). Editável nos 3 modos.', 'Editor look. VDG = CoCo screen (black uppercase on green, lowercase inverse video). Editable in all 3 modes.')}>
          <span className="font-semibold">{t('Tela', 'Screen')}:</span>
          <select value={display} onChange={e => setDisplay(e.target.value as 'normal' | 'vdg' | 'vdg6847')} className="input-select text-[11px] py-0.5">
            <option value="normal">{t('Normal', 'Normal')}</option>
            <option value="vdg">{t('VDG', 'VDG')}</option>
            <option value="vdg6847">{t('VDG 6847 (autêntica)', 'VDG 6847 (authentic)')}</option>
          </select>
        </label>
        {!isVdg && (
          <label className="flex items-center gap-1.5">
            <span className="font-semibold">{t('Cores', 'Colors')}:</span>
            <select value={screen} onChange={e => onScreenChange(e.target.value)} className="input-select text-[11px] py-0.5">
              {Object.keys(SCHEMES).map(k => <option key={k} value={k}>{t(SCHEMES[k].pt, SCHEMES[k].en)}</option>)}
            </select>
          </label>
        )}
        {/* 32 colunas: quebra na largura real da tela do CoCo (só nos modos VDG). */}
        {isVdg && (
          <label className="flex items-center gap-1.5 cursor-pointer" title={t('Quebra a tela em 32 colunas (largura real do CoCo) em vez de não-quebrar com rolagem horizontal.', 'Wrap the screen at 32 columns (the real CoCo width) instead of no-wrap with horizontal scroll.')}>
            <input type="checkbox" checked={wrap32} onChange={e => setWrap32(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
            {t('32 colunas', '32 columns')}
          </label>
        )}
        {/* Escala da fonte autêntica VDG 6847 (P/M/G). */}
        {display === 'vdg6847' && (
          <label className="flex items-center gap-1.5" title={t('Tamanho da fonte autêntica VDG 6847 no canvas.', 'Size of the authentic VDG 6847 font on the canvas.')}>
            <span className="font-semibold">{t('Escala', 'Scale')}:</span>
            <select value={vdgScale} onChange={e => setVdgScale(e.target.value as 'sm' | 'md' | 'lg')} className="input-select text-[11px] py-0.5">
              <option value="sm">{t('Pequena', 'Small')}</option>
              <option value="md">{t('Média', 'Medium')}</option>
              <option value="lg">{t('Grande', 'Large')}</option>
            </select>
          </label>
        )}
        {/* No VDG 6847 autêntico a fonte é bitmap fixo do MC6847 → negrito não se aplica: desabilita e mostra desmarcado. */}
        <label
          className="flex items-center gap-1.5"
          style={display === 'vdg6847' ? { opacity: 0.4, cursor: 'not-allowed' } : { cursor: 'pointer' }}
          title={display === 'vdg6847'
            ? t('A fonte VDG 6847 autêntica é bitmap fixo do MC6847 — negrito não se aplica.', 'The authentic VDG 6847 font is a fixed MC6847 bitmap — bold does not apply.')
            : t('Texto em negrito', 'Bold text')}
        >
          <input type="checkbox" checked={display === 'vdg6847' ? false : bold} disabled={display === 'vdg6847'} onChange={e => onBoldChange(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          {t('Negrito', 'Bold')}
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer" title={t('Converte tudo para MAIÚSCULAS (Color BASIC clássico). Desligue para permitir minúsculas.', 'Force UPPERCASE (classic Color BASIC). Turn off to allow lowercase.')}>
          <input type="checkbox" checked={autoUpper} onChange={e => setAutoUpper(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          {t('Maiúsculas auto', 'Auto uppercase')}
        </label>
        {/* Velocidade da digitação do programa no XRoar. Rápido pode perder caractere em máquinas lentas. */}
        <label className="flex items-center gap-1.5" title={t('Velocidade com que o programa é digitado no XRoar. Rápido = 12ms/tecla; Padrão = 25ms/tecla (mais seguro).', 'Speed the program is typed into XRoar. Fast = 12ms/key; Standard = 25ms/key (safer).')}>
          <span className="font-semibold">{t('Vel.Export.Código', 'Code export speed')}:</span>
          <select value={typeSpeed} onChange={e => setTypeSpeed(e.target.value as 'fast' | 'normal')} className="input-select text-[11px] py-0.5">
            <option value="fast">{t('Rápido (12ms)', 'Fast (12ms)')}</option>
            <option value="normal">{t('Padrão (25ms)', 'Standard (25ms)')}</option>
          </select>
        </label>
        <div className="flex-1" />
        <span className="font-mono">{lineCount} {t('linhas', 'lines')} · {text.length} {t('chars', 'chars')}</span>
      </div>
    </div>
  );
}
