import React, { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Folder, FolderOpen, FileText, FolderPlus, Pencil, Download, Save, HardDrive,
  ChevronRight, ChevronDown, FolderOpen as OpenIcon, Plus, Loader, FileInput, Trash2, Unlock, AlertTriangle,
} from 'lucide-react';
import { Os9MediaPanel, Os9MediaLegend } from './Os9MediaPanel';

// Aba OS-9 / NitrOS-9 (RBF): DOIS explorers empilhados (Os9Explorer) — estilo Explorer do Windows,
// ÁRVORE à esquerda, ARQUIVOS à direita, toolbar no topo, status bar embaixo, painel de mídia à direita.
// Cada um trabalha num buffer em memória:
//  • EDITÁVEL (Novo / Abrir .os9 / drag-drop): criar pasta, renomear, extrair, inserir/excluir (O4), Salvar.
//  • LEITURA (partição de container via filePath+base): só ver/extrair.
// Arquivos podem ser ARRASTADOS de um explorer para o outro (copia via extract→insert) e do Windows (abre).

export interface Os9ExplorerHandle {
  getInfo: () => { panelId: string; editable: boolean; hasDisk: boolean; fileName?: string };
  extractFile: (fdLsn: number) => Promise<Uint8Array | null>;
  insertData: (name: string, data: Uint8Array) => Promise<boolean>;
  readTree: (fdLsn: number, name: string) => Promise<any | null>;
  applyTree: (tree: any) => Promise<boolean>;
}
interface CrossDrop { fromPanelId: string; fdLsn: number; name: string; isDir: boolean; }

interface Os9Date { year: number; month: number; day: number; hour: number; minute: number; }
interface Os9Node { name: string; fdLsn: number; isDir: boolean; size: number; attrString: string; modified?: Os9Date | null; children?: Os9Node[]; truncated?: boolean; segs?: Array<{ lsn: number; sectors: number }>; }
interface Os9Ident { name: string; totalSectors: number; sectorsPerTrack: number; sides: number; sectorsPerCluster: number; }
export interface Os9Doc { buffer?: Uint8Array; filePath?: string; base?: number; fileName: string; editable: boolean; }

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d?: Os9Date | null) => (d ? `${d.year}-${pad(d.month)}-${pad(d.day)} ${pad(d.hour)}:${pad(d.minute)}` : '');
const fmtSize = (n: number) => (n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B');
const sanitizeName = (s: string) => s.replace(/[\/\\]/g, '').replace(/[^\x20-\x7e]/g, '').slice(0, 28).trim();

const GEOMS: { key: string; label: string }[] = [
  { key: '158k', label: '158K (35T)' }, { key: '180k', label: '180K (40T)' },
  { key: '360k', label: '360K (DS)' }, { key: '720k', label: '720K (DS)' },
];

function findByLsn(node: Os9Node, lsn: number): Os9Node | null {
  if (node.fdLsn === lsn) return node;
  for (const c of node.children ?? []) { const r = findByLsn(c, lsn); if (r) return r; }
  return null;
}

const Os9Explorer = forwardRef<Os9ExplorerHandle, { doc: Os9Doc | null; lang: string; onDirtyChange?: (d: boolean) => void; panelId: string; label: string; onCrossDropFile?: (d: CrossDrop) => void; dragSrcRef: React.MutableRefObject<string | null> }>(
  function Os9Explorer({ doc, lang, onDirtyChange, panelId, label, onCrossDropFile, dragSrcRef }, ref) {
  const pt = lang === 'pt-br';
  const [buf, setBuf] = useState<Uint8Array | null>(null);
  const [src, setSrc] = useState<{ filePath?: string; base?: number; editable: boolean; fileName: string } | null>(null);
  const [srcPath, setSrcPath] = useState<string | null>(null); // caminho do .os9 aberto (p/ "Salvar"/sobrescrever)
  const [pendingAction, setPendingAction] = useState<{ type: 'open' } | { type: 'new'; geom: string } | { type: 'drop'; filePath: string } | null>(null); // confirmação de "não salvo"
  const [ident, setIdent] = useState<Os9Ident | null>(null);
  const [stats, setStats] = useState<{ files: number; dirs: number; freeBytes: number } | null>(null);
  const [usage, setUsage] = useState<any>(null); // bitmap de ocupação p/ o painel de mídia
  const [root, setRoot] = useState<Os9Node | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selDir, setSelDir] = useState<number>(-1);   // fdLsn da pasta mostrada à direita
  const [selItem, setSelItem] = useState<number>(-1); // fdLsn do item selecionado na lista
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [mkdirVal, setMkdirVal] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState<{ old: string; val: string } | null>(null);
  const [delConfirm, setDelConfirm] = useState<Os9Node | null>(null); // confirmação de exclusão (O4)
  const [dragOver, setDragOver] = useState<null | 'open' | 'copy'>(null); // realce ao arrastar (abrir do Windows / copiar entre explorers)

  const editable = !!src?.editable;
  // Partição OS-9 de CONTAINER (filePath+base, sem buffer em memória) → edição grava DIRETO no arquivo (O5).
  const containerMode = !!(src?.filePath && !buf);
  const [containerEdit, setContainerEdit] = useState(false); // edição de container habilitada (após aviso)
  const [containerWarn, setContainerWarn] = useState(false);  // modal de aviso "grava no arquivo"
  const canEdit = editable || (containerMode && containerEdit);
  const [hoverFd, setHoverFd] = useState<number | null>(null); // item sob o mouse (lista/árvore) → realça clusters

  // log de diagnóstico no DevTools (antes não havia referência de OS-9 no console)
  const logOs9 = (tag: string, res: any, extra?: Record<string, any>) => {
    try {
      console.info('%c[OS-9] ' + tag, 'color:#a78bfa;font-weight:bold', {
        volume: res?.ident?.name?.trim(), totalSectors: res?.ident?.totalSectors,
        files: res?.totalFiles, dirs: res?.totalDirs,
        clusters: res?.usage ? `${res.usage.usedClusters}/${res.usage.totalClusters}` : undefined,
        clusterSize: res?.usage?.sectorsPerCluster, ...extra,
      });
    } catch { /* noop */ }
  };

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);

  // ---- mapeamento arquivo ⇆ clusters (para realçar no painel de mídia) ----
  const spc = usage?.sectorsPerCluster || 0;
  const nodeClusters = (n: Os9Node): Set<number> => {
    const set = new Set<number>();
    if (!spc) return set;
    set.add(Math.floor(n.fdLsn / spc));                                   // setor do próprio FD
    for (const s of n.segs || []) for (let l = s.lsn; l < s.lsn + s.sectors; l++) set.add(Math.floor(l / spc));
    return set;
  };
  // cluster → { arquivo, pasta-pai, ancestrais a expandir } (1º dono vence)
  const clusterIndex = React.useMemo(() => {
    const m = new Map<number, { fd: number; parent: number; ancestors: number[] }>();
    if (!root || !spc) return m;
    const own = (n: Os9Node, parent: number, anc: number[]) => { for (const c of nodeClusters(n)) if (!m.has(c)) m.set(c, { fd: n.fdLsn, parent, ancestors: anc }); };
    own(root, root.fdLsn, []);
    const walk = (n: Os9Node, anc: number[]) => { for (const ch of n.children ?? []) { own(ch, n.fdLsn, anc); walk(ch, [...anc, n.fdLsn]); } };
    walk(root, [root.fdLsn]);
    return m;
  }, [root, spc]);
  // arquivos fragmentados (mais de 1 segmento) — para os botões de defrag
  const fragCount = React.useMemo(() => {
    let n = 0;
    const walk = (x?: Os9Node | null) => { if (!x) return; if (!x.isDir && (x.segs?.length || 0) > 1) n++; x.children?.forEach(walk); };
    walk(root);
    return n;
  }, [root]);

  // clusters realçados = item sob o mouse > item selecionado > pasta selecionada
  const activeFd = hoverFd ?? (selItem >= 0 ? selItem : selDir >= 0 ? selDir : -1);
  const highlightClusters = React.useMemo(() => {
    if (!root || activeFd < 0 || !spc) return null;
    const n = findByLsn(root, activeFd);
    return n ? nodeClusters(n) : null;
  }, [root, activeFd, spc]);
  // clicar uma célula do platter → seleciona o arquivo que a ocupa (navega/expande até ele)
  const pickCell = (start: number, end: number) => {
    for (let c = start; c < end; c++) {
      const o = clusterIndex.get(c);
      if (!o) continue;
      setExpanded(s => { const n = new Set(s); o.ancestors.forEach(a => n.add(a)); n.add(o.parent); return n; });
      setSelDir(o.parent);
      setSelItem(o.fd === o.parent ? -1 : o.fd);
      return;
    }
  };

  // aplica um resultado de parse (mesma forma p/ buffer, os9Read e os9ContainerEdit) ao estado da UI
  const applyOs9Result = (res: any, keepSel = true) => {
    setErr(''); setIdent(res.ident); setStats({ files: res.totalFiles, dirs: res.totalDirs, freeBytes: res.freeBytes });
    setRoot(res.root); setUsage(res.usage);
    if (!keepSel || selDir < 0 || !findByLsn(res.root, selDir)) { setSelDir(res.root.fdLsn); setExpanded(new Set([res.root.fdLsn])); }
  };
  // parse o estado atual (buffer ou arquivo) → árvore
  const reparse = async (b?: Uint8Array, keepSel = true) => {
    const res = src?.editable
      ? await window.cocoApi.os9ParseBuffer(b ?? buf)
      : await window.cocoApi.os9Read(src?.filePath, src?.base ?? 0);
    if (!res?.success) { setErr(res?.error || 'erro'); return; }
    logOs9('reparse', res, { editable: src?.editable, base: src?.base });
    applyOs9Result(res, keepSel);
  };
  // O5 — operação de edição numa PARTIÇÃO DE CONTAINER (grava direto no arquivo, com guarda de sistema).
  const containerEditOp = async (op: string, args: any, okMsg?: string): Promise<boolean> => {
    if (!src?.filePath) return false;
    setBusy(true);
    try {
      const r = await window.cocoApi.os9ContainerEdit(src.filePath, src.base ?? 0, op, args);
      if (r?.cancelled) return false;
      if (!r.success) { setNote((pt ? 'Erro: ' : 'Error: ') + r.error); return false; }
      logOs9('container ' + op, r, { base: src.base, changedSectors: r.changedSectors });
      applyOs9Result(r, true); setSelItem(-1); if (okMsg) setNote(okMsg);
      return true;
    } finally { setBusy(false); }
  };

  // (re)carrega quando o doc externo muda
  useEffect(() => {
    let alive = true;
    setContainerEdit(false); // novo doc → edição de container começa desabilitada (precisa reconfirmar)
    (async () => {
      if (!doc) { setBuf(null); setSrc(null); setRoot(null); setIdent(null); setDirty(false); return; }
      setLoading(true); setDirty(false); setNote('');
      setSrc({ filePath: doc.filePath, base: doc.base, editable: doc.editable, fileName: doc.fileName });
      setSrcPath(doc.editable && doc.buffer && doc.filePath ? doc.filePath : null); // .os9 aberto editável → "Salvar" sobrescreve o arquivo
      const b = doc.buffer ? new Uint8Array(doc.buffer) : null; setBuf(b);
      const res = doc.editable
        ? await window.cocoApi.os9ParseBuffer(b)
        : await window.cocoApi.os9Read(doc.filePath, doc.base ?? 0);
      if (!alive) return;
      setLoading(false);
      if (!res?.success) { setErr(res?.error || 'erro'); return; }
      logOs9('load ' + (doc.fileName || ''), res, { editable: doc.editable, base: doc.base, filePath: doc.filePath });
      setErr(''); setIdent(res.ident); setStats({ files: res.totalFiles, dirs: res.totalDirs, freeBytes: res.freeBytes });
      setRoot(res.root); setUsage(res.usage); setSelDir(res.root.fdLsn); setExpanded(new Set([res.root.fdLsn])); setSelItem(-1);
    })();
    return () => { alive = false; };
  }, [doc]);

  const curDir = root && selDir >= 0 ? findByLsn(root, selDir) : null;
  const items = (curDir?.children ?? []).slice().sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));

  // ---- ações internas (toolbar) ----
  // Abrir/Novo: se houver edição não salva, pede confirmação ANTES (não perde silenciosamente).
  const requestOpen = () => { if (dirty) setPendingAction({ type: 'open' }); else openPick(); };
  const requestNew = (geom: string) => { if (dirty) setPendingAction({ type: 'new', geom }); else createNew(geom); };
  const requestDrop = (filePath: string) => { if (dirty) setPendingAction({ type: 'drop', filePath }); else openByPath(filePath); };
  const resolvePending = async (choice: 'save' | 'discard' | 'cancel') => {
    const act = pendingAction; setPendingAction(null);
    if (choice === 'cancel' || !act) return;
    if (choice === 'save') { const ok = srcPath ? await doSaveOverwrite() : await doSave(); if (!ok) return; } // save cancelado → não prossegue
    if (act.type === 'open') await openPick(); else if (act.type === 'new') await createNew(act.geom); else await openByPath(act.filePath);
  };

  // abre um disco OS-9 por CAMINHO (drag-and-drop). Faz o parse ANTES de trocar o estado (não quebra o atual se inválido).
  const openByPath = async (filePath: string) => {
    setBusy(true);
    try {
      const r = await window.cocoApi.os9OpenPath(filePath);
      if (!r?.success) { setNote((pt ? 'Erro: ' : 'Error: ') + r?.error); return; }
      const b = new Uint8Array(r.image);
      const p = await window.cocoApi.os9ParseBuffer(b);
      if (!p?.success) { setNote((pt ? 'Não é um disco OS-9 válido: ' : 'Not a valid OS-9 disk: ') + (r.fileName)); return; }
      logOs9('drop ' + r.fileName, p, { filePath: r.filePath });
      setBuf(b); setSrc({ editable: true, fileName: r.fileName }); setSrcPath(r.filePath || null); setDirty(false); setErr(''); setNote('');
      setIdent(p.ident); setStats({ files: p.totalFiles, dirs: p.totalDirs, freeBytes: p.freeBytes });
      setRoot(p.root); setUsage(p.usage); setSelDir(p.root.fdLsn); setExpanded(new Set([p.root.fdLsn])); setSelItem(-1);
    } finally { setBusy(false); }
  };
  // handlers de drag-and-drop: arquivo do Windows (abre disco) OU arquivo de OUTRO explorer (copia).
  const onDragOver = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types || []);
    if (types.includes('application/x-os9-file')) {
      if (dragSrcRef.current === panelId) { if (dragOver) setDragOver(null); return; } // arrasto da PRÓPRIA lista → não é alvo
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (dragOver !== 'copy') setDragOver('copy');
    } else if (types.includes('Files')) { e.preventDefault(); if (dragOver !== 'open') setDragOver('open'); }
  };
  const onDragLeave = (e: React.DragEvent) => { if (e.currentTarget === e.target) setDragOver(null); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null);
    const internal = e.dataTransfer.getData('application/x-os9-file');
    if (internal) { // copiar de outro explorer
      try { const p = JSON.parse(internal); if (p.panelId !== panelId) onCrossDropFile?.({ fromPanelId: p.panelId, fdLsn: p.fdLsn, name: p.name, isDir: !!p.isDir }); } catch { /* noop */ }
      dragSrcRef.current = null;
      return;
    }
    const f = e.dataTransfer.files?.[0]; if (!f) return; // abrir do Windows
    const fp = (window.cocoApi.getPathForFile ? window.cocoApi.getPathForFile(f) : (f as any).path) || '';
    if (!fp) { setNote(pt ? 'Não consegui ler o caminho do arquivo.' : 'Could not read the file path.'); return; }
    requestDrop(fp);
  };
  // limpa o estado de drag em QUALQUER término/cancelamento (inclui ESC, que dispara só 'dragend')
  useEffect(() => {
    const clear = () => { dragSrcRef.current = null; setDragOver(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clear(); };
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('dragend', clear); window.removeEventListener('drop', clear); window.removeEventListener('keydown', onKey); };
  }, []);
  const dropOverlay = dragOver ? (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(52,211,153,0.10)', border: '2px dashed #34d399', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ background: 'rgba(2,6,12,0.9)', padding: '10px 18px', borderRadius: 8, color: '#34d399', fontWeight: 700, fontSize: 13 }}>
        <FileInput size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: '-3px' }} />
        {dragOver === 'copy' ? (pt ? 'Solte para COPIAR o arquivo aqui' : 'Drop to COPY the file here') : (pt ? 'Solte para abrir o disco OS-9' : 'Drop to open the OS-9 disk')}
      </div>
    </div>
  ) : null;

  // ---- API exposta ao Os9Tab (orquestra a cópia entre explorers) ----
  const extractFileBytes = async (fdLsn: number): Promise<Uint8Array | null> => {
    if (src?.editable && buf) { const r = await window.cocoApi.os9ReadFileBuffer(buf, fdLsn); return r?.success ? new Uint8Array(r.data) : null; }
    if (src?.filePath != null) { const r = await window.cocoApi.os9ReadFilePath(src.filePath, src.base ?? 0, fdLsn); return r?.success ? new Uint8Array(r.data) : null; }
    return null;
  };
  const insertDataHere = async (name: string, data: Uint8Array): Promise<boolean> => {
    if (!buf || selDir < 0 || !src?.editable) { setNote(pt ? 'Destino somente-leitura — abra/crie um disco editável aqui.' : 'Read-only target — open/create an editable disk here.'); return false; }
    setBusy(true);
    try {
      const r = await window.cocoApi.os9InsertBuffer(buf, selDir, { name, data });
      if (!r.success) { setNote((pt ? 'Erro ao copiar: ' : 'Copy error: ') + r.error); return false; }
      const nb = new Uint8Array(r.image); setBuf(nb); setDirty(true); await reparse(nb); setNote((pt ? 'Copiado: ' : 'Copied: ') + r.name); return true;
    } finally { setBusy(false); }
  };
  const readTreeHere = async (fdLsn: number, name: string): Promise<any | null> => {
    if (src?.editable && buf) { const r = await window.cocoApi.os9ReadTreeBuffer(buf, fdLsn, name); return r?.success ? r.tree : null; }
    if (src?.filePath != null) { const r = await window.cocoApi.os9ReadTreePath(src.filePath, src.base ?? 0, fdLsn, name); return r?.success ? r.tree : null; }
    return null;
  };
  const applyTreeHere = async (tree: any): Promise<boolean> => {
    if (!buf || selDir < 0 || !src?.editable) { setNote(pt ? 'Destino somente-leitura — abra/crie um disco editável aqui.' : 'Read-only target — open/create an editable disk here.'); return false; }
    setBusy(true);
    try {
      const r = await window.cocoApi.os9ApplyTreeBuffer(buf, selDir, tree);
      if (!r.success) { setNote((pt ? 'Erro ao copiar pasta: ' : 'Folder copy error: ') + r.error); return false; }
      const nb = new Uint8Array(r.image); setBuf(nb); setDirty(true); await reparse(nb);
      setNote((pt ? 'Pasta copiada: ' : 'Folder copied: ') + `${tree?.name} (${r.dirs} ${pt ? 'pasta(s)' : 'dir(s)'}, ${r.files} ${pt ? 'arq' : 'files'})`); return true;
    } finally { setBusy(false); }
  };
  useImperativeHandle(ref, () => ({
    getInfo: () => ({ panelId, editable: !!src?.editable, hasDisk: !!buf || !!src, fileName: src?.fileName }),
    extractFile: extractFileBytes,
    insertData: insertDataHere,
    readTree: readTreeHere,
    applyTree: applyTreeHere,
  }), [buf, src, selDir, panelId]);

  const openPick = async () => {
    const r = await window.cocoApi.os9PickBuffer();
    if (r?.cancelled) return;
    if (!r?.success) { setNote((pt ? 'Erro: ' : 'Error: ') + r?.error); return; }
    const b = new Uint8Array(r.image);
    setBuf(b); setSrc({ editable: true, fileName: r.fileName }); setSrcPath(r.filePath || null); setDirty(false); setNote('');
    const p = await window.cocoApi.os9ParseBuffer(b);
    if (p?.success) { logOs9('open/new', p); setIdent(p.ident); setStats({ files: p.totalFiles, dirs: p.totalDirs, freeBytes: p.freeBytes }); setRoot(p.root); setUsage(p.usage); setSelDir(p.root.fdLsn); setExpanded(new Set([p.root.fdLsn])); setErr(''); }
  };
  const createNew = async (geomKey: string) => {
    const r = await window.cocoApi.os9CreateBlank(geomKey);
    if (!r?.success) { setNote((pt ? 'Erro: ' : 'Error: ') + r?.error); return; }
    const b = new Uint8Array(r.image);
    setBuf(b); setSrc({ editable: true, fileName: 'NOVO.OS9' }); setSrcPath(null); setDirty(false); setNote(pt ? 'Disco OS-9 novo criado.' : 'New OS-9 disk created.');
    const p = await window.cocoApi.os9ParseBuffer(b);
    if (p?.success) { logOs9('open/new', p); setIdent(p.ident); setStats({ files: p.totalFiles, dirs: p.totalDirs, freeBytes: p.freeBytes }); setRoot(p.root); setUsage(p.usage); setSelDir(p.root.fdLsn); setExpanded(new Set([p.root.fdLsn])); setErr(''); }
  };
  const doMkdir = async (name: string) => {
    setMkdirVal(null); const nm = sanitizeName(name); if (!nm || selDir < 0) return;
    if (containerMode) { await containerEditOp('mkdir', { parentFdLsn: selDir, name: nm }, (pt ? 'Pasta criada (gravada no container): ' : 'Folder created (saved to container): ') + nm); return; }
    if (!buf) return;
    setBusy(true);
    try {
      const r = await window.cocoApi.os9MkdirBuffer(buf, selDir, nm);
      if (!r.success) { setNote((pt ? 'Erro: ' : 'Error: ') + r.error); return; }
      const nb = new Uint8Array(r.image); setBuf(nb); setDirty(true); await reparse(nb); setNote((pt ? 'Pasta criada: ' : 'Folder created: ') + nm);
    } finally { setBusy(false); }
  };
  const doRename = async (oldName: string, newName: string) => {
    setRenameVal(null); const nm = sanitizeName(newName); if (!nm || nm === oldName || selDir < 0) return;
    if (containerMode) { await containerEditOp('rename', { dirFdLsn: selDir, oldName, newName: nm }, (pt ? 'Renomeado (gravado) → ' : 'Renamed (saved) → ') + nm); return; }
    if (!buf) return;
    setBusy(true);
    try {
      const r = await window.cocoApi.os9RenameBuffer(buf, selDir, oldName, nm);
      if (!r.success) { setNote((pt ? 'Erro: ' : 'Error: ') + r.error); return; }
      const nb = new Uint8Array(r.image); setBuf(nb); setDirty(true); await reparse(nb); setNote((pt ? 'Renomeado → ' : 'Renamed → ') + nm);
    } finally { setBusy(false); }
  };
  // O4 — inserir arquivo do PC na pasta atual (escolhe o arquivo no diálogo do main) ou via drag-drop (data/srcPath).
  const doInsert = async (opts?: { name?: string; data?: Uint8Array; srcPath?: string }) => {
    if (selDir < 0) return;
    if (containerMode) { await containerEditOp('insert', { parentFdLsn: selDir, name: opts?.name, data: opts?.data }, (pt ? 'Inserido (gravado no container).' : 'Inserted (saved to container).')); return; }
    if (!buf) return;
    setBusy(true);
    try {
      const r = await window.cocoApi.os9InsertBuffer(buf, selDir, opts);
      if (r?.cancelled) return;
      if (!r.success) { setNote((pt ? 'Erro: ' : 'Error: ') + r.error); return; }
      const nb = new Uint8Array(r.image); setBuf(nb); setDirty(true); await reparse(nb); setNote((pt ? 'Inserido: ' : 'Inserted: ') + r.name);
    } finally { setBusy(false); }
  };
  // O4 — excluir arquivo, ou diretório VAZIO, da pasta atual.
  const doDelete = async (node: Os9Node) => {
    setDelConfirm(null);
    if (selDir < 0 || !node) return;
    if (containerMode) { await containerEditOp('delete', { parentFdLsn: selDir, name: node.name }, (pt ? 'Excluído (gravado no container): ' : 'Deleted (saved to container): ') + node.name); return; }
    if (!buf) return;
    setBusy(true);
    try {
      const r = await window.cocoApi.os9DeleteBuffer(buf, selDir, node.name);
      if (!r.success) { setNote((pt ? 'Erro: ' : 'Error: ') + r.error); return; }
      const nb = new Uint8Array(r.image); setBuf(nb); setDirty(true); setSelItem(-1); await reparse(nb); setNote((pt ? 'Excluído: ' : 'Deleted: ') + node.name);
    } finally { setBusy(false); }
  };
  // Defrag — compacta o arquivo selecionado, ou todos os fragmentados do disco.
  const doDefragFile = async () => {
    if (!buf || selItem < 0) return;
    setBusy(true);
    try {
      const r = await window.cocoApi.os9DefragFileBuffer(buf, selItem);
      if (!r.success) { setNote((pt ? 'Erro: ' : 'Error: ') + r.error); return; }
      if (!r.changed) { setNote(r.reason === 'no-space' ? (pt ? 'Sem espaço contíguo para compactar.' : 'No contiguous space to compact.') : (pt ? 'Arquivo já está contíguo.' : 'File already contiguous.')); return; }
      const nb = new Uint8Array(r.image); setBuf(nb); setDirty(true); await reparse(nb); setNote(pt ? 'Arquivo compactado (defrag).' : 'File compacted (defrag).');
    } finally { setBusy(false); }
  };
  const doDefragDisk = async () => {
    if (!buf) return;
    setBusy(true);
    try {
      const r = await window.cocoApi.os9DefragAllBuffer(buf);
      if (!r.success) { setNote((pt ? 'Erro: ' : 'Error: ') + r.error); return; }
      if (r.defragged === 0) { setNote(r.failed > 0 ? (pt ? `Sem espaço para compactar ${r.failed} arquivo(s).` : `No space to compact ${r.failed} file(s).`) : (pt ? 'Nada a desfragmentar.' : 'Nothing to defragment.')); return; }
      const nb = new Uint8Array(r.image); setBuf(nb); setDirty(true); await reparse(nb);
      setNote(pt ? `Defrag: ${r.defragged} compactado(s)${r.failed ? `, ${r.failed} sem espaço` : ''}.` : `Defrag: ${r.defragged} compacted${r.failed ? `, ${r.failed} no space` : ''}.`);
    } finally { setBusy(false); }
  };
  // Salvar Como (diálogo) → retorna true se gravou (atualiza o caminho de origem p/ "Salvar").
  const doSave = async (): Promise<boolean> => {
    if (!buf) return false; setBusy(true);
    try {
      const r = await window.cocoApi.os9SaveBuffer(buf, src?.fileName || srcPath || 'DISCO.OS9');
      if (r?.cancelled) return false;
      if (r?.success) { setDirty(false); setSrcPath(r.path); setSrc(s => s ? { ...s, fileName: (r.path.split(/[\\/]/).pop() || s.fileName) } : s); setNote((pt ? 'Salvo: ' : 'Saved: ') + r.path); return true; }
      setNote((pt ? 'Erro ao salvar: ' : 'Save error: ') + (r?.error || '?')); return false;
    } finally { setBusy(false); }
  };
  // Salvar (sobrescreve o .os9 de origem, sem diálogo). Sem caminho → cai no Salvar Como.
  const doSaveOverwrite = async (): Promise<boolean> => {
    if (!buf) return false; if (!srcPath) return doSave();
    setBusy(true);
    try {
      const r = await window.cocoApi.os9SaveOverwrite(srcPath, buf);
      if (r?.success) { setDirty(false); setNote((pt ? 'Salvo (sobrescrito): ' : 'Saved (overwritten): ') + r.path); return true; }
      setNote((pt ? 'Erro ao salvar: ' : 'Save error: ') + (r?.error || '?')); return false;
    } finally { setBusy(false); }
  };
  const extract = async (node: Os9Node) => {
    setBusy(true);
    try {
      const r = editable
        ? await window.cocoApi.os9ExtractBuffer(buf, node.fdLsn, node.name)
        : await window.cocoApi.os9Extract(src?.filePath, src?.base ?? 0, node.fdLsn, node.name);
      if (r?.cancelled) return;
      if (r?.success) setNote((pt ? 'Extraído: ' : 'Extracted: ') + r.path); else setNote((pt ? 'Erro: ' : 'Error: ') + (r?.error || '?'));
    } finally { setBusy(false); }
  };

  const toggleExpand = (lsn: number) => setExpanded(s => { const n = new Set(s); n.has(lsn) ? n.delete(lsn) : n.add(lsn); return n; });
  const selItemNode = curDir?.children?.find(c => c.fdLsn === selItem) || null;

  // ---- árvore (recursiva) ----
  const TreeNode: React.FC<{ node: Os9Node; depth: number }> = ({ node, depth }) => {
    const subdirs = (node.children ?? []).filter(c => c.isDir);
    const isOpen = expanded.has(node.fdLsn);
    const isSel = selDir === node.fdLsn;
    return (
      <div>
        <div onClick={() => { setSelDir(node.fdLsn); setSelItem(-1); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', paddingLeft: 4 + depth * 12, cursor: 'pointer', borderRadius: 4, background: isSel ? 'rgba(167,139,250,0.18)' : 'transparent', color: isSel ? '#c4b5fd' : 'var(--text-secondary)', fontSize: 12 }}
          onMouseEnter={e => { setHoverFd(node.fdLsn); if (!isSel) e.currentTarget.style.background = 'rgba(167,139,250,0.07)'; }}
          onMouseLeave={e => { setHoverFd(null); if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
          {subdirs.length > 0
            ? <button onClick={e => { e.stopPropagation(); toggleExpand(node.fdLsn); }} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer', display: 'flex' }}>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
            : <span style={{ width: 13, display: 'inline-block' }} />}
          {isOpen ? <FolderOpen size={14} className="text-[#c4b5fd]" /> : <Folder size={14} className="text-[#c4b5fd]" />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{depth === 0 ? (ident?.name?.trim() || '/') : node.name}</span>
        </div>
        {isOpen && subdirs.map(s => <TreeNode key={s.fdLsn} node={s} depth={depth + 1} />)}
      </div>
    );
  };

  // ---- empty state ----
  if (!doc && !buf && !src) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ position: 'relative' }} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        {dropOverlay}
        <HardDrive size={40} className="text-[var(--primary)] opacity-70" />
        <div className="text-sm font-bold text-white">{pt ? 'OS-9 / NitrOS-9 (RBF)' : 'OS-9 / NitrOS-9 (RBF)'}</div>
        <div className="text-[12px] text-[var(--text-secondary)] max-w-[460px] leading-relaxed">
          {pt ? 'Abra um disco OS-9 (.os9/.dsk) ou crie um novo para navegar a árvore, criar pastas, renomear e extrair arquivos.'
              : 'Open an OS-9 disk (.os9/.dsk) or create a new one to browse the tree, make folders, rename and extract files.'}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={requestOpen} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase flex items-center gap-1.5"><OpenIcon size={14} /> {pt ? 'Abrir OS-9' : 'Open OS-9'}</button>
          <select onChange={e => { if (e.target.value) { requestNew(e.target.value); e.currentTarget.selectedIndex = 0; } }} className="input-select text-xs" style={{ padding: '6px 8px' }} defaultValue="">
            <option value="" disabled>{pt ? 'Novo OS-9…' : 'New OS-9…'}</option>
            {GEOMS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ minHeight: 0, position: 'relative' }} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {dropOverlay}
      {/* TOOLBAR */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--border)] flex-wrap flex-shrink-0">
        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded" style={{ color: '#a78bfa', border: '1px solid #a78bfa55', flexShrink: 0 }}>{label}</span>
        <button onClick={requestOpen} className="dsk-tool flex items-center gap-1" title={pt ? 'Abrir disco OS-9' : 'Open OS-9 disk'}><OpenIcon size={14} /> {pt ? 'Abrir' : 'Open'}</button>
        <select onChange={e => { if (e.target.value) { requestNew(e.target.value); e.currentTarget.selectedIndex = 0; } }} className="input-select text-[11px]" style={{ padding: '3px 5px' }} defaultValue="" title={pt ? 'Criar disco OS-9 novo' : 'Create new OS-9 disk'}>
          <option value="">{pt ? '＋ Novo…' : '＋ New…'}</option>
          {GEOMS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <button onClick={doSaveOverwrite} disabled={!editable || busy || !dirty} className="dsk-tool flex items-center gap-1" style={{ color: editable && dirty ? '#34d399' : undefined }} title={srcPath ? (pt ? `Salvar (sobrescrever ${srcPath.split(/[\\/]/).pop()})` : `Save (overwrite ${srcPath.split(/[\\/]/).pop()})`) : (pt ? 'Salvar (abre "Salvar Como" na 1ª vez)' : 'Save (opens "Save As" the first time)')}><Save size={14} /> {pt ? 'Salvar' : 'Save'}</button>
        <button onClick={doSave} disabled={!editable || busy} className="dsk-tool flex items-center gap-1" style={{ color: editable ? '#c4b5fd' : undefined }} title={pt ? 'Salvar como novo .os9' : 'Save as a new .os9'}><Save size={14} /> {pt ? 'Salvar Como' : 'Save As'}</button>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <button onClick={() => setMkdirVal('')} disabled={!canEdit || busy} className="dsk-tool flex items-center gap-1" style={{ color: canEdit ? '#34d399' : undefined }} title={pt ? 'Criar pasta na pasta atual' : 'Create folder in current dir'}><FolderPlus size={14} /> {pt ? 'Nova pasta' : 'New folder'}</button>
        <button onClick={() => selItemNode && setRenameVal({ old: selItemNode.name, val: selItemNode.name })} disabled={!canEdit || busy || !selItemNode} className="dsk-tool flex items-center gap-1" title={pt ? 'Renomear o item selecionado' : 'Rename selected item'}><Pencil size={14} /> {pt ? 'Renomear' : 'Rename'}</button>
        <button onClick={() => selItemNode && !selItemNode.isDir && extract(selItemNode)} disabled={busy || !selItemNode || selItemNode.isDir} className="dsk-tool flex items-center gap-1" title={pt ? 'Extrair o arquivo selecionado' : 'Extract selected file'}><Download size={14} /> {pt ? 'Extrair' : 'Extract'}</button>
        <button onClick={() => doInsert()} disabled={!canEdit || busy || selDir < 0} className="dsk-tool flex items-center gap-1" style={{ color: canEdit ? '#34d399' : undefined }} title={pt ? 'Inserir arquivo do PC na pasta atual' : 'Insert a file from the PC into the current folder'}><FileInput size={14} /> {pt ? 'Inserir' : 'Insert'}</button>
        <button onClick={() => selItemNode && setDelConfirm(selItemNode)} disabled={!canEdit || busy || !selItemNode} className="dsk-tool flex items-center gap-1" style={{ color: canEdit && selItemNode ? '#f87171' : undefined }} title={pt ? 'Excluir o item selecionado' : 'Delete the selected item'}><Trash2 size={14} /> {pt ? 'Excluir' : 'Delete'}</button>
        {containerMode && !containerEdit && (
          <button onClick={() => setContainerWarn(true)} disabled={busy} className="dsk-tool flex items-center gap-1" style={{ marginLeft: 'auto', color: '#fbbf24', borderColor: '#fbbf2455' }} title={pt ? 'Habilitar edição da partição (grava DIRETO no arquivo do container)' : 'Enable partition editing (writes DIRECTLY to the container file)'}><Unlock size={14} /> {pt ? 'Habilitar edição' : 'Enable editing'}</button>
        )}
        {containerMode && containerEdit && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#fbbf24', border: '1px solid #fbbf2455', borderRadius: 4, padding: '2px 7px' }}>⚠ {pt ? 'edição grava no arquivo' : 'edits write to file'}</span>
        )}
      </div>

      {/* input nova pasta / renomear */}
      {canEdit && (mkdirVal != null || renameVal != null) && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] flex-shrink-0" style={{ background: 'rgba(52,211,153,0.06)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{mkdirVal != null ? (pt ? 'Nome da pasta:' : 'Folder name:') : (pt ? 'Novo nome:' : 'New name:')}</span>
          <input autoFocus value={mkdirVal != null ? mkdirVal : renameVal!.val} maxLength={28}
            onChange={e => { const v = e.target.value; if (mkdirVal != null) setMkdirVal(v); else setRenameVal(r => r ? { ...r, val: v } : r); }}
            onKeyDown={e => { if (e.key === 'Enter') { mkdirVal != null ? doMkdir(mkdirVal) : doRename(renameVal!.old, renameVal!.val); } if (e.key === 'Escape') { setMkdirVal(null); setRenameVal(null); } }}
            className="input-text py-1 px-2 text-xs font-mono" style={{ width: 240 }} placeholder={pt ? 'até 28 caracteres' : 'up to 28 chars'} />
          <button onClick={() => mkdirVal != null ? doMkdir(mkdirVal) : doRename(renameVal!.old, renameVal!.val)} className="btn btn-primary py-1 px-3 text-[11px] font-bold uppercase">OK</button>
          <button onClick={() => { setMkdirVal(null); setRenameVal(null); }} className="btn btn-secondary py-1 px-3 text-[11px] font-bold uppercase">{pt ? 'Cancelar' : 'Cancel'}</button>
        </div>
      )}

      {/* CORPO: árvore | lista */}
      <div className="flex-1 flex" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-[var(--text-secondary)] text-sm"><Loader size={16} className="spin" /> {pt ? 'Lendo OS-9…' : 'Reading OS-9…'}</div>
        ) : err ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#f87171' }}>⚠ {err}</div>
        ) : (
          <>
            <div style={{ width: 240, borderRight: '1px solid var(--border)', overflow: 'auto', flexShrink: 0, padding: 6 }}>
              {root && <TreeNode node={root} depth={0} />}
            </div>
            <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary, #1a1a24)', color: 'var(--text-secondary)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>{pt ? 'Nome' : 'Name'}</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>{pt ? 'Atributos' : 'Attributes'}</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600 }}>{pt ? 'Tamanho' : 'Size'}</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>{pt ? 'Modificado' : 'Modified'}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && <tr><td colSpan={4} style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--text-secondary)' }}>{pt ? '(pasta vazia)' : '(empty folder)'}</td></tr>}
                  {items.map((node, i) => (
                    <tr key={node.fdLsn + ':' + i}
                      draggable
                      onDragStart={e => { dragSrcRef.current = panelId; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('application/x-os9-file', JSON.stringify({ panelId, fdLsn: node.fdLsn, name: node.name, isDir: node.isDir })); }}
                      onDragEnd={() => { dragSrcRef.current = null; setDragOver(null); }}
                      onClick={() => setSelItem(node.fdLsn)}
                      onDoubleClick={() => { if (node.isDir) { setSelDir(node.fdLsn); setExpanded(s => new Set(s).add(node.fdLsn)); setSelItem(-1); } else extract(node); }}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'grab', background: selItem === node.fdLsn ? 'rgba(167,139,250,0.14)' : 'transparent' }}
                      onMouseEnter={e => { setHoverFd(node.fdLsn); if (selItem !== node.fdLsn) e.currentTarget.style.background = 'rgba(167,139,250,0.06)'; }}
                      onMouseLeave={e => { setHoverFd(null); if (selItem !== node.fdLsn) e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ padding: '5px 10px' }}>
                        <span className="flex items-center gap-2">
                          {/* alça de arraste-para-fora (Windows Explorer) — só arquivos; usa startDrag NATIVO */}
                          {!node.isDir && (
                            <span draggable
                              onMouseDown={e => { const tr = (e.currentTarget as HTMLElement).closest('tr'); if (tr) tr.setAttribute('draggable', 'false'); }}
                              onMouseUp={e => { const tr = (e.currentTarget as HTMLElement).closest('tr'); if (tr) tr.setAttribute('draggable', 'true'); }}
                              onDragStart={e => { e.stopPropagation(); e.preventDefault(); const tr = (e.currentTarget as HTMLElement).closest('tr');
                                window.cocoApi.startOs9FileDrag?.({ buf: buf ?? undefined, filePath: src?.filePath, base: src?.base ?? 0, fdLsn: node.fdLsn, name: node.name });
                                if (tr) setTimeout(() => tr.setAttribute('draggable', 'true'), 0); }}
                              onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
                              title={pt ? 'Arrastar para o Windows (Explorer)' : 'Drag out to Windows (Explorer)'}
                              className="cursor-grab select-none" style={{ color: 'var(--text-muted)', padding: '0 2px', fontSize: 12 }}>⠿</span>
                          )}
                          {node.isDir ? <Folder size={14} className="text-[#c4b5fd]" /> : <FileText size={14} className="text-[var(--text-secondary)]" />}
                          <span style={{ color: node.isDir ? '#c4b5fd' : 'var(--text-primary, #e5e5e5)' }}>{node.name}{node.isDir ? '/' : ''}{node.truncated ? ' …' : ''}</span>
                        </span>
                      </td>
                      <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{node.attrString}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{node.isDir ? '—' : fmtSize(node.size)}</td>
                      <td style={{ padding: '5px 10px', color: 'var(--text-secondary)' }}>{fmtDate(node.modified)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Os9MediaPanel usage={usage} ident={ident} fileName={src?.fileName || ''} editable={canEdit} dirty={dirty} lang={lang} highlight={highlightClusters} onPickCell={pickCell}
              onDefragDisk={containerMode ? undefined : doDefragDisk} onDefragFile={containerMode ? undefined : doDefragFile} fragCount={fragCount} canDefragFile={!!(selItemNode && !selItemNode.isDir && (selItemNode.segs?.length || 0) > 1)} busy={busy} />
          </>
        )}
      </div>

      {/* STATUS BAR — esquerda: volume/contagens/aviso · direita: cartão do disco + ocupação */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[var(--border)] flex-shrink-0" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {ident && (() => { const tk = Math.round(ident.totalSectors * 256 / 1024); return (
          <span>{ident.name?.trim() || '(sem volume)'} · {tk >= 1024 ? (tk / 1024).toFixed(1) + ' MB' : tk + ' KB'} · {ident.sides === 2 ? (pt ? '2 lados' : '2 sides') : (pt ? '1 lado' : '1 side')}</span>
        ); })()}
        {stats && <span>{stats.files} {pt ? 'arq' : 'files'} · {stats.dirs} dirs · {(stats.freeBytes / 1024).toFixed(0)}K {pt ? 'livres' : 'free'}</span>}
        <span style={{ color: note.toLowerCase().includes(pt ? 'erro' : 'error') ? '#f87171' : 'inherit' }}>{note}</span>
        {usage && <span className="ml-auto"><Os9MediaLegend lang={lang} /></span>}
        {ident && stats && (() => {
          const total = ident.totalSectors * 256, used = Math.max(0, total - stats.freeBytes), pct = total ? Math.round(used / total * 100) : 0;
          return (
            <span className="flex items-center gap-2">
              <HardDrive size={13} className="text-[var(--primary)]" />
              {editable
                ? <span style={{ color: dirty ? '#fbbf24' : '#34d399' }}>● {dirty ? (pt ? 'não salvo' : 'unsaved') : (pt ? 'salvo' : 'saved')}</span>
                : <span style={{ color: '#a78bfa' }}>{pt ? 'leitura' : 'read-only'}</span>}
              <span title={`${(used / 1024).toFixed(0)}K / ${(total / 1024).toFixed(0)}K (${pct}%)`} className="flex items-center gap-1">
                <span style={{ display: 'inline-block', width: 64, height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: pct + '%', height: '100%', background: pct > 90 ? '#f87171' : pct > 70 ? '#fbbf24' : '#34d399' }} />
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
              </span>
            </span>
          );
        })()}
      </div>

      {/* confirmação de alterações não salvas (antes de Abrir/Novo) */}
      {pendingAction && (
        <div className="glass-modal-overlay" onClick={() => resolvePending('cancel')}>
          <div className="glass-panel p-5 flex flex-col gap-3" style={{ width: 440, maxWidth: '92%' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">{pt ? 'Alterações não salvas' : 'Unsaved changes'}</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {pt ? `Este disco OS-9 tem alterações não salvas. O que fazer antes de ${pendingAction.type === 'open' ? 'abrir outro disco' : 'criar um novo'}?`
                  : `This OS-9 disk has unsaved changes. What to do before ${pendingAction.type === 'open' ? 'opening another disk' : 'creating a new one'}?`}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => resolvePending('cancel')} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{pt ? 'Cancelar' : 'Cancel'}</button>
              <button onClick={() => resolvePending('discard')} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{pt ? 'Descartar' : 'Discard'}</button>
              <button onClick={() => resolvePending('save')} className="btn btn-primary py-2 px-4 text-xs font-bold uppercase">{pt ? 'Salvar e continuar' : 'Save & continue'}</button>
            </div>
          </div>
        </div>
      )}

      {/* confirmação de exclusão (O4) */}
      {/* aviso: habilitar edição da partição de container (grava direto no arquivo) */}
      {containerWarn && (
        <div className="glass-modal-overlay" onClick={() => setContainerWarn(false)}>
          <div className="glass-panel p-5 flex flex-col gap-3" style={{ width: 480, maxWidth: '92%' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2"><AlertTriangle size={18} style={{ color: '#fbbf24' }} /><h3 className="text-sm font-bold text-white uppercase tracking-wide">{pt ? 'Habilitar edição da partição?' : 'Enable partition editing?'}</h3></div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {pt ? 'As edições (nova pasta, renomear, inserir, excluir) gravam DIRETO no arquivo do container — não há "Salvar/Desfazer". A partição de SISTEMA (OS9Boot/SYS/CMDS/DEFS) é protegida: só pastas de usuário podem ser alteradas. Cada gravação é validada antes de escrever. RECOMENDADO: trabalhe numa CÓPIA do container.'
                  : 'Edits (new folder, rename, insert, delete) write DIRECTLY to the container file — there is no "Save/Undo". The SYSTEM partition (OS9Boot/SYS/CMDS/DEFS) is protected: only user folders can change. Each write is validated before writing. RECOMMENDED: work on a COPY of the container.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setContainerWarn(false)} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{pt ? 'Cancelar' : 'Cancel'}</button>
              <button onClick={() => { setContainerEdit(true); setContainerWarn(false); setNote(pt ? 'Edição da partição habilitada — grava no arquivo.' : 'Partition editing enabled — writes to file.'); }} className="btn btn-primary py-2 px-4 text-xs font-bold uppercase" style={{ background: '#d97706' }}><Unlock size={13} /> {pt ? 'Habilitar' : 'Enable'}</button>
            </div>
          </div>
        </div>
      )}

      {delConfirm && (
        <div className="glass-modal-overlay" onClick={() => setDelConfirm(null)}>
          <div className="glass-panel p-5 flex flex-col gap-3" style={{ width: 420, maxWidth: '92%' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white uppercase tracking-wide" style={{ color: '#f87171' }}>{pt ? 'Excluir' : 'Delete'} {delConfirm.isDir ? (pt ? 'pasta' : 'folder') : (pt ? 'arquivo' : 'file')}</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {pt ? `Excluir "${delConfirm.name}"${delConfirm.isDir ? ' (precisa estar vazia)' : ''}? Os clusters serão liberados. Lembre de Salvar para gravar no disco.`
                  : `Delete "${delConfirm.name}"${delConfirm.isDir ? ' (must be empty)' : ''}? Its clusters will be freed. Remember to Save to write the disk.`}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDelConfirm(null)} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{pt ? 'Cancelar' : 'Cancel'}</button>
              <button onClick={() => doDelete(delConfirm)} className="btn btn-primary py-2 px-4 text-xs font-bold uppercase" style={{ background: '#dc2626' }}>{pt ? 'Excluir' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ====================================================================================
// Os9Tab — shell que empilha DOIS Os9Explorer (TOPO recebe o doc externo; BASE começa vazio).
// Divisória arrastável entre eles; arquivos podem ser copiados de um para o outro por drag-and-drop.
// ====================================================================================
export function Os9Tab({ doc, lang, onDirtyChange }: { doc: Os9Doc | null; lang: string; onDirtyChange?: (d: boolean) => void }) {
  const pt = lang === 'pt-br';
  const topRef = useRef<Os9ExplorerHandle>(null);
  const botRef = useRef<Os9ExplorerHandle>(null);
  const [dirtyTop, setDirtyTop] = useState(false);
  const [dirtyBot, setDirtyBot] = useState(false);
  const [topPct, setTopPct] = useState(52);          // % de altura do explorer de cima
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragSrcRef = useRef<string | null>(null);     // qual explorer iniciou o arrasto de arquivo
  const [xfer, setXfer] = useState('');               // aviso de cópia entre explorers

  useEffect(() => { onDirtyChange?.(dirtyTop || dirtyBot); }, [dirtyTop, dirtyBot]);

  // divisória arrastável
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const r = wrapRef.current?.getBoundingClientRect(); if (!r) return;
      const pct = ((e.clientY - r.top) / r.height) * 100;
      setTopPct(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => setDragging(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDragging(false); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('keydown', onKey); };
  }, [dragging]);

  // cópia entre explorers: extrai os bytes na origem e insere no destino (que recebeu o drop)
  const handleCrossDrop = async (toPanel: 'top' | 'bottom', d: CrossDrop) => {
    const from = d.fromPanelId === 'top' ? topRef.current : botRef.current;
    const to = toPanel === 'top' ? topRef.current : botRef.current;
    if (!from || !to) return;
    if (!to.getInfo().editable) { setXfer(pt ? '✗ Destino somente-leitura.' : '✗ Read-only target.'); return; }
    if (d.isDir) { // cópia recursiva de PASTA
      setXfer(pt ? `Copiando pasta "${d.name}"…` : `Copying folder "${d.name}"…`);
      const tree = await from.readTree(d.fdLsn, d.name);
      if (!tree) { setXfer(pt ? '✗ Falha ao ler a pasta de origem.' : '✗ Failed to read source folder.'); return; }
      const ok = await to.applyTree(tree);
      setXfer(ok ? (pt ? `✓ Pasta "${d.name}" copiada. Lembre de Salvar.` : `✓ Folder "${d.name}" copied. Remember to Save.`)
                : (pt ? '✗ Falha ao copiar a pasta.' : '✗ Failed to copy the folder.'));
      return;
    }
    setXfer(pt ? `Copiando "${d.name}"…` : `Copying "${d.name}"…`);
    const bytes = await from.extractFile(d.fdLsn);
    if (!bytes) { setXfer(pt ? '✗ Falha ao ler a origem.' : '✗ Failed to read source.'); return; }
    const ok = await to.insertData(d.name, bytes);
    setXfer(ok ? (pt ? `✓ "${d.name}" copiado (${(bytes.length / 1024).toFixed(1)} KB). Lembre de Salvar.` : `✓ "${d.name}" copied (${(bytes.length / 1024).toFixed(1)} KB). Remember to Save.`)
              : (pt ? '✗ Falha ao inserir no destino.' : '✗ Failed to insert into target.'));
  };

  return (
    <div ref={wrapRef} className="h-full flex flex-col" style={{ minHeight: 0, position: 'relative' }}>
      <div style={{ height: `${topPct}%`, minHeight: 0, overflow: 'hidden' }}>
        <Os9Explorer ref={topRef} doc={doc} lang={lang} panelId="top" label={pt ? 'Topo' : 'Top'} dragSrcRef={dragSrcRef}
          onDirtyChange={setDirtyTop} onCrossDropFile={d => handleCrossDrop('top', d)} />
      </div>
      {/* divisória */}
      <div onMouseDown={() => setDragging(true)}
        style={{ height: 7, flexShrink: 0, cursor: 'row-resize', background: dragging ? 'var(--primary)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title={pt ? 'Arraste para redimensionar' : 'Drag to resize'}>
        <div style={{ width: 36, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.35)' }} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Os9Explorer ref={botRef} doc={null} lang={lang} panelId="bottom" label={pt ? 'Base' : 'Bottom'} dragSrcRef={dragSrcRef}
          onDirtyChange={setDirtyBot} onCrossDropFile={d => handleCrossDrop('bottom', d)} />
      </div>
      {xfer && (
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'rgba(2,6,12,0.94)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', fontSize: 11, color: xfer.startsWith('✗') ? '#f87171' : '#34d399', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}
          onClick={() => setXfer('')}>{xfer}</div>
      )}
    </div>
  );
}
