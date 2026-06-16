// ScreenToolbar.tsx — barra de ferramentas enxuta do editor de tela ASCII/SG4.
// Presentational: recebe o estado/handlers do ScreenEditorModal. (Escrita do zero — o EditorToolbar do
// CGS é acoplado ao multimodo; aqui só precisamos do essencial p/ a tela de 512B.)

import React from 'react';
import {
  Pencil, Eraser, Minus, Square, Circle, PaintBucket, BoxSelect, ClipboardPaste,
  Undo2, Redo2, Trash2, ZoomIn, ZoomOut, Grid3x3, ImagePlus,
} from 'lucide-react';

export type ScreenTool = 'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'fill' | 'select' | 'paste';

interface Props {
  tool: ScreenTool;
  setTool: (t: ScreenTool) => void;
  zoom: number;
  onZoom: (factor: number) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onImportImage: () => void;
  t: (pt: string, en: string) => string;
}

const ACCENT = 'var(--accent-yellow)';

export default function ScreenToolbar(props: Props) {
  const { tool, setTool, zoom, onZoom, showGrid, setShowGrid, canUndo, canRedo, onUndo, onRedo, onClear, onImportImage, t } = props;

  const tbtn = (key: ScreenTool, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setTool(key)}
      title={label}
      className="dsk-tool"
      style={{ padding: '5px 6px', color: tool === key ? ACCENT : undefined, borderColor: tool === key ? ACCENT : undefined }}
    >
      {icon}
    </button>
  );
  const abtn = (icon: React.ReactNode, label: string, onClick: () => void, enabled = true, color?: string) => (
    <button onClick={onClick} disabled={!enabled} title={label} className="dsk-tool" style={{ padding: '5px 6px', color, opacity: enabled ? 1 : 0.4 }}>
      {icon}
    </button>
  );
  const sep = <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-color)', margin: '0 2px' }} />;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', flexShrink: 0 }}>
      {tbtn('pen', <Pencil size={15} />, t('Caneta — pinta caractere/bloco (clique-direito = cor de fundo)', 'Pen — paints char/block (right-click = background color)'))}
      {tbtn('eraser', <Eraser size={15} />, t('Borracha — apaga (espaço)', 'Eraser — clears (space)'))}
      {tbtn('fill', <PaintBucket size={15} />, t('Balde — preenche a região', 'Bucket — flood fill'))}
      {sep}
      {tbtn('line', <Minus size={15} />, t('Linha', 'Line'))}
      {tbtn('rect', <Square size={15} />, t('Retângulo (clique-direito = preenchido)', 'Rectangle (right-click = filled)'))}
      {tbtn('circle', <Circle size={15} />, t('Círculo (clique-direito = preenchido)', 'Circle (right-click = filled)'))}
      {sep}
      {tbtn('select', <BoxSelect size={15} />, t('Selecionar (Ctrl+C/X/V)', 'Select (Ctrl+C/X/V)'))}
      {tbtn('paste', <ClipboardPaste size={15} />, t('Colar a seleção', 'Paste the selection'))}
      {sep}
      {abtn(<Undo2 size={15} />, t('Desfazer', 'Undo'), onUndo, canUndo)}
      {abtn(<Redo2 size={15} />, t('Refazer', 'Redo'), onRedo, canRedo)}
      {abtn(<Trash2 size={15} />, t('Limpar a tela (cor de fundo)', 'Clear the screen (background color)'), onClear, true, '#f87171')}
      {sep}
      {abtn(<ImagePlus size={15} />, t('Importar imagem (PNG/JPG) → dither SG4', 'Import image (PNG/JPG) → SG4 dither'), onImportImage)}
      {sep}
      {abtn(<ZoomOut size={15} />, t('Afastar', 'Zoom out'), () => onZoom(1 / 1.25))}
      <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 30, textAlign: 'center' }}>{zoom.toFixed(1)}×</span>
      {abtn(<ZoomIn size={15} />, t('Aproximar', 'Zoom in'), () => onZoom(1.25))}
      <button onClick={() => setShowGrid(!showGrid)} title={t('Grade', 'Grid')} className="dsk-tool" style={{ padding: '5px 6px', color: showGrid ? ACCENT : undefined }}>
        <Grid3x3 size={15} />
      </button>
    </div>
  );
}
