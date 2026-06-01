import React, { useRef, useState, useLayoutEffect } from 'react';
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

  // Tudo em maiúsculas: o teclado do Color BASIC só produz maiúsculas no prompt.
  const setUpper = (v: string) => onTextChange(v.toUpperCase());

  // Insere texto na posição do cursor (usado por colar e substituir), mantendo maiúsculas.
  const insertAtCursor = (ins: string) => {
    const ta = taRef.current;
    const up = ins.toUpperCase();
    if (!ta) { setUpper(text + up); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const next = (text.slice(0, s) + up + text.slice(e)).toUpperCase();
    caretToRestore.current = { s: s + up.length, e: s + up.length };
    onTextChange(next);
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
  const buildProgram = () => {
    let s = '';
    if (addNew) s += 'NEW\n';
    s += text;
    if (addRun) { if (s.length && !s.endsWith('\n')) s += '\n'; s += 'RUN\n'; }
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
        <button onClick={() => onRun(buildProgram(), false)} disabled={empty} className="btn btn-primary py-1.5 px-3 text-[11px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed" title={t('Digita NEW + programa no XRoar (precisa estar no prompt OK)', 'Types NEW + program into XRoar (must be at the OK prompt)')}>
          <Play size={13} /> {t('Rodar no XRoar', 'Run in XRoar')}
        </button>
        <button onClick={() => onRun(buildProgram(), true)} disabled={empty} className="btn btn-secondary py-1.5 px-3 text-[11px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed" title={t('Reinicia o emulador (boot limpo) e então digita o programa', 'Resets the emulator (clean boot) then types the program')}>
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

      {/* Textarea (digitação livre, sempre maiúscula; cores conforme o esquema selecionado) */}
      <textarea
        ref={taRef}
        value={text}
        onChange={e => {
          const ta = e.currentTarget;
          caretToRestore.current = { s: ta.selectionStart, e: ta.selectionEnd }; // preserva o cursor após o uppercase
          onTextChange(ta.value.toUpperCase());
        }}
        spellCheck={false}
        autoCapitalize="characters"
        placeholder={'10 CLS\n20 PRINT "HELLO WORLD"\n30 GOTO 20'}
        className="flex-1 w-full p-3 font-mono text-sm leading-relaxed resize-none outline-none rounded-lg"
        style={{ minHeight: 0, color: schemeOf(screen).fg, fontWeight: bold ? 700 : 400, textTransform: 'uppercase', background: schemeOf(screen).bg, border: '2px solid rgba(0,0,0,0.35)', caretColor: schemeOf(screen).fg }}
      />

      {/* Footer: opções + esquema de cores + contadores */}
      <div className="flex items-center gap-4 mt-2 text-[10px] text-[var(--text-secondary)] flex-wrap flex-shrink-0">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={addNew} onChange={e => onAddNewChange(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          {t('NEW antes de injetar', 'NEW before injecting')}
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={addRun} onChange={e => onAddRunChange(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          {t('RUN ao final', 'RUN at the end')}
        </label>
        <label className="flex items-center gap-1.5">
          <span className="font-semibold">{t('Cores', 'Colors')}:</span>
          <select value={screen} onChange={e => onScreenChange(e.target.value)} className="input-select text-[11px] py-0.5">
            {Object.keys(SCHEMES).map(k => <option key={k} value={k}>{t(SCHEMES[k].pt, SCHEMES[k].en)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer" title={t('Texto em negrito', 'Bold text')}>
          <input type="checkbox" checked={bold} onChange={e => onBoldChange(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          {t('Negrito', 'Bold')}
        </label>
        <div className="flex-1" />
        <span className="font-mono">{lineCount} {t('linhas', 'lines')} · {text.length} {t('chars', 'chars')}</span>
      </div>
    </div>
  );
}
