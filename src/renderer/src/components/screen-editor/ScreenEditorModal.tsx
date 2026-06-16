// ScreenEditorModal.tsx — invólucro REUTILIZÁVEL do editor de tela ASCII/SG4.
// Contrato: entra Uint8Array(512) VRAM (ou null = manter a sessão anterior), sai Uint8Array(512) no Aplicar.
// Qualquer aba pode chamar: K7 (telas SoftKristian / loaders próprios), e futuramente outras.
//
// É dono do estado de ferramenta/zoom/grade/cor e os passa por props ao ScreenEditor (espelha o que o
// TelaEditor do CGS fazia), mantendo o núcleo (ScreenEditor.jsx) verbatim.

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Check, FolderOpen, Save, Rocket } from 'lucide-react';
// @ts-ignore — núcleo portado em JSX (sem tipos), resolvido pelo Vite.
import ScreenEditor from './ScreenEditor.jsx';
import { SG_COLORS } from './utils/cocoColors';
import { readTelaSettings, immediateWriteTelaSettings } from './utils/screenSettings';
import ScreenToolbar, { ScreenTool } from './ScreenToolbar';

export const SCREEN_VRAM_SIZE = 512;

interface Props {
  open: boolean;
  title?: string;
  /** 512 bytes VRAM p/ editar; null/ausente = mantém o conteúdo da sessão anterior do editor. */
  initialBytes?: Uint8Array | null;
  lang: string;
  onApply: (bytes: Uint8Array) => void;
  onClose: () => void;
  /** Rótulo do botão de injeção (ex.: "Injetar no loader" / "Criar loader próprio"); ausente = oculto. */
  injectLabel?: string;
  /** Chamado com os 512B quando o usuário clica em injetar (além do "Aplicar"). */
  onInject?: (bytes: Uint8Array) => void;
}

export default function ScreenEditorModal({ open, title, initialBytes, lang, onApply, onClose, injectLabel, onInject }: Props) {
  const isEN = lang === 'en-us';
  const t = useCallback((pt: string, en: string) => (isEN ? en : pt), [isEN]);

  const editorRef = useRef<any>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const datInputRef = useRef<HTMLInputElement>(null);

  const [tool, setTool] = useState<ScreenTool>('pen');
  const [zoom, setZoom] = useState(2);
  const [showGrid, setShowGrid] = useState(true);
  const [selectedColor, setSelectedColor] = useState(0); // FG: Verde
  const [bgColor, setBgColor] = useState(8);             // BG: Preto
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Persistência dos campos do MODAL (ferramenta/zoom/grade/cores) — sob fiu:screenEditor.modal.
  const modalLoadedRef = useRef(false);
  useEffect(() => {
    if (!open || modalLoadedRef.current) return;
    modalLoadedRef.current = true;
    readTelaSettings().then((s) => {
      const m = s?.modal;
      if (!m) return;
      if (typeof m.tool === 'string') setTool(m.tool);
      if (typeof m.zoom === 'number') setZoom(m.zoom);
      if (typeof m.showGrid === 'boolean') setShowGrid(m.showGrid);
      if (typeof m.selectedColor === 'number') setSelectedColor(m.selectedColor);
      if (typeof m.bgColor === 'number') setBgColor(m.bgColor);
    });
  }, [open]);
  useEffect(() => {
    if (!open || !modalLoadedRef.current) return;
    immediateWriteTelaSettings({ modal: { tool, zoom, showGrid, selectedColor, bgColor } });
  }, [open, tool, zoom, showGrid, selectedColor, bgColor]);

  // Semeia a tela a editar APÓS o editor montar e restaurar suas settings (localStorage é síncrono →
  // resolve antes deste timeout). Sem initialBytes, preserva o que o editor restaurou da sessão anterior.
  useEffect(() => {
    if (!open) return;
    if (initialBytes && initialBytes.length) {
      const id = setTimeout(() => editorRef.current?.loadVRAM(initialBytes), 90);
      return () => clearTimeout(id);
    }
  }, [open, initialBytes]);

  const onZoom = useCallback((factor: number) => {
    setZoom((z) => {
      const nz = Math.max(0.5, Math.min(8, z * factor));
      // applyZoom ajusta o scroll (centraliza, pois não passamos coords do mouse).
      editorRef.current?.applyZoom(nz);
      return nz;
    });
  }, []);

  const onHistoryChange = useCallback((u: boolean, r: boolean) => { setCanUndo(u); setCanRedo(r); }, []);

  // Ctrl+roda do mouse = zoom in/out (sempre centralizando, pois applyZoom sem coords centraliza).
  const onBodyWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    onZoom(e.deltaY < 0 ? 1.25 : 1 / 1.25);
  }, [onZoom]);

  // Ctrl+Z / Ctrl+Y (e Ctrl+Shift+Z) = desfazer/refazer, via API imperativa (sempre atual). Capture para
  // rodar antes dos handlers internos do editor; ignora quando o foco está num input/textarea.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA') && tg.getAttribute('aria-hidden') !== 'true') return;
      if (!e.ctrlKey && !e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) editorRef.current?.redo(); else editorRef.current?.undo(); }
      else if (k === 'y') { e.preventDefault(); editorRef.current?.redo(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const handleImportClick = () => imgInputRef.current?.click();
  const handleImgFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) editorRef.current?.importFile(f);
    e.target.value = '';
  };

  // Abrir um .DAT (512 bytes crus de VRAM ASCII/SG4) do PC → carrega no editor.
  const handleOpenDat = () => datInputRef.current?.click();
  const handleDatFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const buf = new Uint8Array(await f.arrayBuffer());
    if (buf.length < SCREEN_VRAM_SIZE) { alert(t('Arquivo .DAT inválido: precisa ter 512 bytes.', 'Invalid .DAT file: it must be 512 bytes.')); return; }
    editorRef.current?.loadVRAM(buf.subarray(0, SCREEN_VRAM_SIZE));
  };

  // Salvar a tela atual como .DAT (512 bytes crus) no PC.
  const handleSaveDat = async () => {
    const bytes: Uint8Array | undefined = editorRef.current?.getVRAM();
    if (!bytes || bytes.length !== SCREEN_VRAM_SIZE) return;
    try {
      await (window as any).cocoApi?.saveCartridgeFile(new Uint8Array(bytes), 'TELA.dat',
        t('Salvar tela (.dat — 512B VRAM ASCII/SG4)', 'Save screen (.dat — 512B ASCII/SG4 VRAM)'),
        [{ name: 'CoCo screen (.dat)', extensions: ['dat'] }, { name: 'All Files', extensions: ['*'] }]);
    } catch { /* silencioso */ }
  };

  const handleApply = () => {
    const bytes: Uint8Array | undefined = editorRef.current?.getVRAM();
    if (bytes && bytes.length === SCREEN_VRAM_SIZE) onApply(new Uint8Array(bytes));
    onClose();
  };
  const handleInject = () => {
    const bytes: Uint8Array | undefined = editorRef.current?.getVRAM();
    if (bytes && bytes.length === SCREEN_VRAM_SIZE && onInject) onInject(new Uint8Array(bytes));
  };

  if (!open) return null;

  return (
    <div className="glass-modal-overlay flex items-center justify-center p-6" style={{ zIndex: 80 }} onClick={onClose}>
      <div
        className="screen-editor glass-panel"
        style={{ width: 980, maxWidth: '96%', height: '88%', maxHeight: '92%', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-active)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          <h3 className="text-sm font-bold text-white" style={{ flex: 1 }}>{title || t('Editor de tela (ASCII / SG4)', 'Screen editor (ASCII / SG4)')}</h3>
          <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('32×16 · 512 bytes · $0400', '32×16 · 512 bytes · $0400')}</span>
          <button onClick={onClose} className="dsk-tool" style={{ padding: '3px 6px' }} title={t('Fechar', 'Close')}><X size={14} /></button>
        </div>

        {/* Toolbar */}
        <ScreenToolbar
          tool={tool} setTool={setTool}
          zoom={zoom} onZoom={onZoom}
          showGrid={showGrid} setShowGrid={setShowGrid}
          canUndo={canUndo} canRedo={canRedo}
          onUndo={() => editorRef.current?.undo()}
          onRedo={() => editorRef.current?.redo()}
          onClear={() => editorRef.current?.clearCanvas(bgColor)}
          onImportImage={handleImportClick}
          t={t}
        />

        {/* Corpo — o editor (canvas + sidebar de caracteres/cores). Ctrl+roda = zoom centralizado. */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }} onWheel={onBodyWheel}>
          <ScreenEditor
            ref={editorRef}
            css={0}
            tool={tool}
            showGrid={showGrid}
            zoom={zoom}
            palette={SG_COLORS}
            selectedColor={selectedColor}
            bgColor={bgColor}
            onColorChange={setSelectedColor}
            onBgColorChange={setBgColor}
            onHistoryChange={onHistoryChange}
          />
        </div>

        {/* Rodapé */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
          <button onClick={handleOpenDat} className="dsk-tool text-[12px]" style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }} title={t('Carregar uma tela .DAT (512B) do PC', 'Load a .DAT screen (512B) from the PC')}>
            <FolderOpen size={14} /> {t('Abrir .DAT', 'Open .DAT')}
          </button>
          <button onClick={handleSaveDat} className="dsk-tool text-[12px]" style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }} title={t('Salvar a tela atual como .DAT (512B crus) no PC', 'Save the current screen as .DAT (raw 512B) on the PC')}>
            <Save size={14} /> {t('Salvar .DAT', 'Save .DAT')}
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
            {t('ALT+arrastar = mover · Ctrl+roda = zoom · Ctrl+Z/Y · clique-direito = fundo', 'ALT+drag = pan · Ctrl+wheel = zoom · Ctrl+Z/Y · right-click = background')}
          </span>
          <span style={{ flex: 1 }} />
          {injectLabel && onInject && (
            <button onClick={handleInject} className="dsk-tool text-[12px]" style={{ padding: '5px 14px', color: 'var(--vdg-green)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Rocket size={14} /> {injectLabel}
            </button>
          )}
          <button onClick={onClose} className="dsk-tool text-[12px]" style={{ padding: '5px 14px' }}>{t('Cancelar', 'Cancel')}</button>
          <button onClick={handleApply} className="dsk-tool text-[12px]" style={{ padding: '5px 14px', color: 'var(--accent-yellow)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Check size={14} /> {t('Aplicar tela', 'Apply screen')}
          </button>
        </div>

        <input ref={imgInputRef} type="file" accept="image/*" onChange={handleImgFile} style={{ display: 'none' }} />
        <input ref={datInputRef} type="file" accept=".dat" onChange={handleDatFile} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
