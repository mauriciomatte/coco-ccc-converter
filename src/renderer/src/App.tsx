import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FileAudio, 
  Disc, 
  Sliders, 
  Binary, 
  Cpu, 
  Download, 
  Terminal, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  FileText,
  HelpCircle,
  Upload,
  LogOut,
  FolderOpen,
  Trash2,
  FilePlus,
  Save,
  Copy,
  Scissors,
  Clipboard,
  Plus,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  HardDrive,
  ArrowDownAZ,
  ArrowRight,
  Layers,
  Database,
  Search,
  X,
  MonitorPlay,
  FileCode2,
  Eraser,
  FileInput
} from 'lucide-react';
import HexEditor from './components/HexEditor';
import XRoarPanel from './components/XRoarPanel';
import BasicEditor from './components/BasicEditor';
import DiskMap from './components/DiskMap';
import { detokenizeBasic } from './basicDetokenize';
import { disassemble, disassembleSmart, formatLine, type DisasmLine } from './disasm6809';

// Persistência (localStorage) das marcas código/dados do disassembly, por arquivo.
// Mapa { fileKey → { data: [[ini,fim]…], code: [offset…] } }. fileKey = nome|tamanho.
const DISASM_MARKS_KEY = 'disasmMarks:v1';
type DisasmMarks = { data: Array<[number, number]>; code: number[]; cvec: Array<[number, number]>; dvec: Array<[number, number]> };
function loadAllDisasmMarks(): Record<string, DisasmMarks> {
  try { return JSON.parse(localStorage.getItem(DISASM_MARKS_KEY) || '{}'); } catch { return {}; }
}
function loadDisasmMarks(key: string): DisasmMarks {
  if (!key) return { data: [], code: [], cvec: [], dvec: [] };
  const m = loadAllDisasmMarks()[key];
  return { data: m?.data || [], code: m?.code || [], cvec: m?.cvec || [], dvec: m?.dvec || [] };
}
function saveDisasmMarks(key: string, m: DisasmMarks): void {
  if (!key) return;
  try {
    const all = loadAllDisasmMarks();
    if (!m.data.length && !m.code.length && !m.cvec.length && !m.dvec.length) delete all[key]; else all[key] = m;
    localStorage.setItem(DISASM_MARKS_KEY, JSON.stringify(all));
  } catch { /* armazenamento indisponível — segue sem persistir */ }
}

// Animação de desfragmentação: delays imitando um disquete físico (motor + seek + leitura/granule).
// Acelerada para ~1/4 do tempo original (a pedido) — rápida, mantendo o apelo visual.
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const DEFRAG_SPINUP_MS = 200; // acionamento do motor
const DEFRAG_SEEK_MS = 33;    // a cabeça "anda" até o arquivo
const DEFRAG_GRAN_MS = 20;    // leitura de cada grânulo (9 setores ≈ meia volta)

interface LogMessage {
  time: string;
  type: 'info' | 'success' | 'warn' | 'error';
  textPt: string;
  textEn: string;
}

const DEFAULT_TRANSLATIONS: Record<string, Record<string, string>> = {
  'pt-br': {
    title: 'CoCo DSK & CCC Utility',
    subtitle: 'MANIPULADOR DE IMAGENS .DSK E CONVERSOR DE ARQUIVOS PARA .CCC',
    tabDsk: 'DSK',
    tabXroar: 'XRoar',
    tabEprom: 'EPROM',
    tabBasic: 'BASIC',
    hexEditorBtn: 'Editor Hexadecimal',
    tabGw: 'GW',
    gwTitle: 'Greaseweazle — Leitura/Gravação de Discos Reais',
    gwFormatLabel: 'Formato (CoCo / Dragon)',
    gwDeviceLabel: 'Dispositivo / Porta',
    gwDriveLabel: 'Drive',
    gwDriveDefault: 'Padrão (auto)',
    gwPathLabel: 'Caminho do gw',
    gwBrowseBtn: 'Procurar…',
    gwExtraLabel: 'Argumentos extras',
    gwDirectLabel: 'Comando direto (opcional)',
    gwUsePaneLabel: 'Use o Painel:',
    gwTestBtn: 'Testar (gw info)',
    gwReadBtn: 'Ler disco → Painel A',
    gwWritePaneBtn: 'Gravar Painel A → disco',
    gwWriteFileBtn: 'Gravar .dsk… → disco',
    gwHint: 'Requer a placa Greaseweazle conectada e o "gw" (host tools) instalado. A leitura carrega a imagem no Painel A da aba DSK; a gravação usa o Painel A ou um arquivo .dsk escolhido. O mapa abaixo mostra a evolução por trilha/lado.',
    gwTrackMap: 'Mapa de Trilhas',
    gwReading: 'lendo',
    gwWriting: 'gravando',
    gwHintFormat: 'Escolha o formato que corresponde ao disco físico. "coco.decb" = disco RS-DOS padrão do CoCo (35 trilhas, 1 lado). Use os formatos Dragon para discos DragonDOS. A geometria (trilhas × lados) define o tamanho do mapa de trilhas abaixo.',
    gwHintDevice: 'Porta/dispositivo da placa Greaseweazle. Deixe vazio para detecção automática; informe (ex.: COM3 no Windows, /dev/ttyACM0 no Linux) se houver mais de uma placa conectada.',
    gwHintDrive: 'Qual drive de disquete no cabo da Greaseweazle. "Padrão" deixa o gw decidir; use A/B (ou 0/1) quando há dois drives no cabo.',
    gwHintPath: 'Caminho do executável "gw" (Greaseweazle host tools). Deixe "gw" se já está no PATH; senão informe o caminho completo (ex.: C:\\gw\\gw.exe). Este valor é salvo nas configurações.',
    gwHintPane: 'Em qual painel (A/B) a imagem lida do disco será carregada — e de qual painel a imagem será gravada no disco. Se o painel já tiver conteúdo, o app pede confirmação antes de sobrescrever (cancele para salvar antes).',
    gwHintExtra: 'Argumentos extras passados ao gw, separados por espaço. Ex.: --no-verify (pula a verificação na gravação), --retries=3, --revs=2 (mais voltas na leitura). Consulte "gw read --help" / "gw write --help".',
    gwHintDirect: 'Comando direto: quando preenchido, o app IGNORA formato/dispositivo/drive/extras e usa SOMENTE esta linha como argumentos do gw (o caminho do arquivo temporário é acrescentado automaticamente no final). Ex.: "read --format coco.decb --device COM7 --drive 0 --revs 3". Não é salvo nas configurações.',
    gwHintActions: 'Testar: roda "gw info" para conferir a placa. Ler disco: lê o disquete físico e carrega a imagem no Painel A da aba DSK. Gravar Painel A: grava no disquete a imagem do Painel A. Gravar .dsk…: escolhe um arquivo .dsk e grava no disquete.',
    gwHintDiag: 'Diagnóstico do drive (saída no log abaixo). "Testar seek" roda "gw seek 0" para exercitar/recalibrar a cabeça — útil contra erros de seek/Track0. "Ver tempos" roda "gw delays" e mostra os tempos atuais (e suas unidades). "Step (µs)" + "Aplicar step" roda "gw delays --step" para alargar o atraso entre passos da cabeça (aumente para ~8000–12000 em drives lentos); o valor fica salvo no dispositivo.',
    gwHintMap: 'Cada quadradinho é uma trilha (coluna) por lado (linha L0/L1). Acende em verde conforme o gw lê/grava cada trilha; a barra mostra o progresso total.',
    exitConfirmTitle: 'Sair do aplicativo?',
    exitConfirmMsg: 'Alterações não salvas em imagens .DSK ou conversões serão perdidas. Deseja realmente sair?',
    dskTabTitle: 'Gerenciador de Imagens DSK',
    dskTabSoon: 'O gerenciador de arquivos DSK (dois painéis, copiar/colar/mover entre imagens, injetar .BIN/.BAS) será construído nas próximas fases.',
    openDskBtn: 'Abrir .DSK',
    openImageBtn: 'Abrir imagem',
    imgFormatsLegend: '.dsk · contêiner DriveWire · MiniIDE · CoCoSDC',
    dskSearchDisk: 'Buscar disco',
    dskToolNew: 'Novo',
    dskToolImport: 'Importar imagem (MiniIDE / CoCoSDC / .dsk)',
    dskToolInject: 'Injetar',
    dskToolCopy: 'Copiar',
    dskToolCut: 'Recortar',
    dskToolPaste: 'Colar',
    dskToolDelete: 'Excluir',
    dskToolUndo: 'Desfazer',
    dskToolRedo: 'Refazer',
    dskToolSort: 'Ordenar A-Z (disco ativo)',
    dskToolSortAll: 'Ordenar Todos os discos do contêiner',
    dskToolXroar: 'Testar painel/DSK no XRoar (drive 0)',
    dskToolXroarShort: 'Testar Painel',
    dskToolGw: 'Gravar painel ativo em disco físico (Greaseweazle)',
    dskToolGwShort: 'Gravar GW',
    dskUnsaved: 'alterações não salvas',
    dskRunHint: 'Duplo-clique: rodar no XRoar',
    dskToolCopyAtoB: 'Copiar Painel A → B (disco ativo)',
    dskToolSave: 'Salvar',
    dskToolSaveAs: 'Salvar Como',
    dskActivePane: 'Painel ativo',
    imgBrowserTitle: 'Navegador de imagem',
    imgFilterPlaceholder: 'Filtrar discos/arquivos…',
    imgOpenHint: 'Clique num item para abri-lo no painel',
    imgEmpty: 'Nenhum item encontrado.',
    imgBusy: 'Lendo imagem…',
    collisionTitle: 'Arquivo já existe',
    collisionMsg: 'Já existe um arquivo com este nome na imagem de destino. O que deseja fazer?',
    collisionOverwrite: 'Sobrescrever',
    collisionRename: 'Renomear (auto)',
    dskPaneEmpty: 'Nenhuma imagem aberta neste painel. Clique no botão ou arraste um arquivo .dsk nele.',
    dskNoImage: 'Sem imagem',
    dskFreeOf: 'livres de',
    dskFilesWord: 'arq.',
    dskUsedWord: 'usado',
    dskFreeWord: 'livre',
    selectFileButton: 'Selecionar Arquivo de Entrada',
    loading: 'Carregando...',
    exitButton: 'Sair',
    inputSourceTitle: 'Imagem de Programa',
    openImageHint: 'Abrir Imagem de Programa',
    clickToBrowse: 'Clique para navegar no seu sistema',
    supportedFormats: 'Formatos CAS, DSK, BIN ou CCC',
    fileNameLabel: 'Nome do Arquivo:',
    sizeLabel: 'Tamanho:',
    cocoProgramNameLabel: 'Nome do Programa CoCo:',
    loadAddrLabel: 'Endereço de Carga (RAM):',
    execAddrLabel: 'Endereço de Execução:',
    payloadSizeLabel: 'Tamanho do Payload:',
    dskFilesTitle: 'Arquivos da Imagem de Disco DSK',
    dskAddBtn: 'Adicionar (.BIN/.BAS)',
    dskSaveBtn: 'Salvar .DSK',
    dskDeleteTitle: 'Apagar do disco',
    dskColName: 'Nome',
    dskColType: 'Tipo',
    dskColSize: 'Tamanho',
    dskColGran: 'Grân.',
    dskColTracks: 'Trilhas',
    dskColKind: 'Formato',
    casBlocksTitle: 'Blocos CAS Demodulados',
    extractedPayloadButton: 'Ver/Editar Programa Extraído',
    exportBinButton: 'Exportar Executável (.BIN)',
    noFileLoadedTitle: 'Nenhum arquivo ou programa carregado',
    noFileLoadedDesc: 'Selecione uma fita, imagem de disco, executável ou arquivo ROM no painel esquerdo para abrir o editor hexadecimal.',
    epromConfigTitle: 'Configurações de EPROM e Inicializador',
    epromSizeLabel: 'Tamanho da EPROM de Destino:',
    eprom4kOption: 'EPROM de 4 KB (2732)',
    eprom8kOption: 'EPROM de 8 KB (2764)',
    eprom16kOption: 'EPROM de 16 KB (27128)',
    eprom32kOption: 'EPROM de 32 KB (27256 · 2 bancos)',
    eprom64kOption: 'EPROM de 64 KB (27512 · 4 bancos)',
    epromSizeHint: 'Define o tamanho do chip EPROM físico. O CoCo só enxerga 16 KB por vez na janela $C000–$FEFF (16.128 bytes úteis); chips de 32K/64K são divididos em bancos de 16K selecionados por jumper na placa. O programa deve caber em um único banco; em chips maiores, o banco é espelhado para dar boot em qualquer posição do jumper.',
    allRamLabel: 'Inicializador All-RAM (Dois Estágios)',
    allRamDesc: 'Alternar paginação de hardware All-RAM',
    allRamHint: 'Mapeia o programa em RAM alta ($8000+), normalmente bloqueada pela ROM básica do CoCo. Copia o código para RAM baixa antes de chavear todo o sistema para RAM (escrevendo em $FFDF) e mascara as interrupções (ORCC #$50), pois em modo All-RAM os vetores em $FFF0+ passam a ser RAM.',
    fillerByteLabel: 'Byte de Preenchimento da ROM:',
    fillerByteHint: 'Byte usado para preencher espaços vazios do chip. O padrão $FF (255) representa células apagadas de EPROMs comuns (2764 a 27256), tornando a gravação muito mais rápida.',
    compileButton: 'Montar e Compilar ROM',
    exportRomButton: 'Exportar Cartucho (.CCC)',
    emuModeLabel: 'Modo Emulador',
    emuModeHint: 'Ignora as restrições físicas do CoCoEPROMpak (tamanhos de chip, bancos por jumper, espelhamento). Gera uma imagem de tamanho exato (loader+payload) para usar com -cart no XRoar/MAME. A janela de 16K do CoCo ($C000–$FEFF) continua valendo. Para programas que passam de 16K (ex.: jogos de 64K multi-parte), use os botões de Exportar para Emulador (.cas/.dsk) abaixo.',
    casFilesTitle: 'Arquivos da Fita',
    emuExportTitle: 'Exportar para Emulador',
    exportEmuCas: 'Exportar Fita (.CAS)',
    exportEmuDsk: 'Exportar Disco (.DSK)',
    cartExportTitle: 'Cartucho (.CCC)',
    exportCocoFlash: 'CocoFLASH (.BIN)',
    cocoFlashGuide: 'Grave com PRGFLASH.BAS (a .BIN carrega em $4000). No MENU.BAS adicione a linha: "NOME",banco,2 (type 2 = jogo com autostart). Bancos 0 e 1 são reservados ao menu; 16K ocupa 4 bancos.',
    emuModeTagline: 'Gera imagem direta para emulador, sem os limites físicos da placa.',
    configLockedHint: 'Carregue um programa no passo ① para liberar as configurações.',
    howItWorksTitle: 'Como funciona',
    howStep1: 'Abra uma fita (.CAS), disco (.DSK) ou executável (.BIN)',
    howStep2: 'Ajuste a EPROM e o inicializador no passo ②',
    howStep3: 'Compile o cartucho (.CCC) ou exporte para o emulador (.CAS/.DSK)',
    memoryMapTitle: 'Mapa de Memória Física (EPROM vs. RAM Baixa)',
    epromLayoutLabel: 'Layout da EPROM',
    freeSpaceLabel: 'LIVRE',
    bootLabel: 'BOOT',
    payloadLabel: 'PAYLOAD',
    consoleTitle: 'Console de Diagnóstico do Sistema',
    clearConsole: 'Limpar',
    consoleMaximize: 'Maximizar console',
    consoleRestore: 'Restaurar console',
    modalTitle: 'Editor Hexadecimal de Sub-arquivo',
    modalSubtitle: 'Explorando bytes extraídos de:',
    modalClose: 'Fechar',
    modalCancel: 'Cancelar',
    modalSave: 'Salvar Alterações',
    // HexEditor translations:
    hexCols: 'Colunas',
    vdgMode: 'Modo de Caracteres VDG',
    vdgGreenOption: 'CoCo VDG Verde (Minúsculo Invertido)',
    vdgOrangeOption: 'CoCo VDG Laranja (Minúsculo Invertido)',
    vdgStandardOption: 'Texto ASCII Padrão',
    searchPlaceholder: 'Buscar Hex (1A 50) ou ASCII...',
    searchBtn: 'Buscar',
    hexHeaderAddress: 'ENDEREÇO',
    hexHeaderValues: 'VALORES HEXADECIMAIS',
    hexHeaderChars: 'CARACTERES ASCII / VDG',
    offsetLabel: 'Deslocamento:',
    romAddressLabel: 'Endereço ROM:',
    valueLabel: 'Valor:',
    hexEditorInstructions: 'Use as Setas para navegar. Digite caracteres hexadecimais para sobrescrever em HEX. ESC para sair.',
  },
  'en-us': {
    title: 'CoCo DSK & CCC Utility',
    subtitle: '.DSK IMAGE MANAGER & FILE-TO-.CCC CONVERTER',
    tabDsk: 'DSK',
    tabXroar: 'XRoar',
    tabEprom: 'EPROM',
    tabBasic: 'BASIC',
    hexEditorBtn: 'Hex Editor',
    tabGw: 'GW',
    gwTitle: 'Greaseweazle — Read/Write Real Disks',
    gwFormatLabel: 'Format (CoCo / Dragon)',
    gwDeviceLabel: 'Device / Port',
    gwDriveLabel: 'Drive',
    gwDriveDefault: 'Default (auto)',
    gwPathLabel: 'gw path',
    gwBrowseBtn: 'Browse…',
    gwExtraLabel: 'Extra arguments',
    gwDirectLabel: 'Direct command (optional)',
    gwUsePaneLabel: 'Use pane:',
    gwTestBtn: 'Test (gw info)',
    gwReadBtn: 'Read disk → Pane A',
    gwWritePaneBtn: 'Write Pane A → disk',
    gwWriteFileBtn: 'Write .dsk… → disk',
    gwHint: 'Requires the Greaseweazle board connected and "gw" (host tools) installed. Reading loads the image into Pane A of the DSK tab; writing uses Pane A or a chosen .dsk file. The map below shows per track/side progress.',
    gwTrackMap: 'Track Map',
    gwReading: 'reading',
    gwWriting: 'writing',
    gwHintFormat: 'Pick the format matching the physical disk. "coco.decb" = standard CoCo RS-DOS disk (35 tracks, 1 side). Use the Dragon formats for DragonDOS disks. The geometry (tracks × sides) sets the size of the track map below.',
    gwHintDevice: 'Greaseweazle board port/device. Leave empty for auto-detect; set it (e.g. COM3 on Windows, /dev/ttyACM0 on Linux) if more than one board is connected.',
    gwHintDrive: 'Which floppy drive on the Greaseweazle ribbon. "Default" lets gw decide; use A/B (or 0/1) when two drives share the cable.',
    gwHintPath: 'Path to the "gw" executable (Greaseweazle host tools). Leave "gw" if it is on PATH; otherwise give the full path (e.g. C:\\gw\\gw.exe). This value is saved in settings.',
    gwHintPane: 'Which pane (A/B) the disk image read will load into — and which pane is written back to the disk. If the pane already has content, the app asks to confirm before overwriting (cancel to save first).',
    gwHintExtra: 'Extra arguments passed to gw, space-separated. E.g. --no-verify (skip write verification), --retries=3, --revs=2 (more read revolutions). See "gw read --help" / "gw write --help".',
    gwHintDirect: 'Direct command: when filled, the app IGNORES format/device/drive/extras and uses ONLY this line as the gw arguments (the temp file path is appended automatically at the end). E.g. "read --format coco.decb --device COM7 --drive 0 --revs 3". Not saved in settings.',
    gwHintActions: 'Test: runs "gw info" to check the board. Read disk: reads the physical floppy and loads the image into Pane A of the DSK tab. Write Pane A: writes Pane A\'s image to the floppy. Write .dsk…: pick a .dsk file and write it to the floppy.',
    gwHintDiag: 'Drive diagnostics (output in the log below). "Seek test" runs "gw seek 0" to exercise/recalibrate the head — useful against seek/Track0 errors. "Show delays" runs "gw delays" and prints the current timings (and their units). "Step (µs)" + "Apply step" runs "gw delays --step" to widen the delay between head steps (raise to ~8000–12000 for slow drives); the value is stored on the device.',
    gwHintMap: 'Each little square is a track (column) per side (row L0/L1). It turns green as gw reads/writes each track; the bar shows overall progress.',
    exitConfirmTitle: 'Quit the application?',
    exitConfirmMsg: 'Unsaved changes to .DSK images or conversions will be lost. Do you really want to quit?',
    dskTabTitle: 'DSK Image Manager',
    dskTabSoon: 'The DSK file manager (dual pane, copy/paste/move between images, inject .BIN/.BAS) will be built in the next phases.',
    openDskBtn: 'Open .DSK',
    openImageBtn: 'Open image',
    imgFormatsLegend: '.dsk · DriveWire container · MiniIDE · CoCoSDC',
    dskSearchDisk: 'Find disk',
    dskToolNew: 'New',
    dskToolImport: 'Import image (MiniIDE / CoCoSDC / .dsk)',
    dskToolInject: 'Inject',
    dskToolCopy: 'Copy',
    dskToolCut: 'Cut',
    dskToolPaste: 'Paste',
    dskToolDelete: 'Delete',
    dskToolUndo: 'Undo',
    dskToolRedo: 'Redo',
    dskToolSort: 'Sort A-Z (active disk)',
    dskToolSortAll: 'Sort All container disks',
    dskToolXroar: 'Test pane/DSK in XRoar (drive 0)',
    dskToolXroarShort: 'Test Pane',
    dskToolGw: 'Write active pane to physical disk (Greaseweazle)',
    dskToolGwShort: 'Write GW',
    dskUnsaved: 'unsaved changes',
    dskRunHint: 'Double-click: run in XRoar',
    dskToolCopyAtoB: 'Copy Pane A → B (active disk)',
    dskToolSave: 'Save',
    dskToolSaveAs: 'Save As',
    dskActivePane: 'Active pane',
    imgBrowserTitle: 'Image browser',
    imgFilterPlaceholder: 'Filter disks/files…',
    imgOpenHint: 'Click an item to open it in the pane',
    imgEmpty: 'No items found.',
    imgBusy: 'Reading image…',
    collisionTitle: 'File already exists',
    collisionMsg: 'A file with this name already exists in the target image. What do you want to do?',
    collisionOverwrite: 'Overwrite',
    collisionRename: 'Rename (auto)',
    dskPaneEmpty: 'No image open in this pane. Click the button or drag a .dsk file onto it.',
    dskNoImage: 'No image',
    dskFreeOf: 'free of',
    dskFilesWord: 'files',
    dskUsedWord: 'used',
    dskFreeWord: 'free',
    selectFileButton: 'Select Input File',
    loading: 'Loading...',
    exitButton: 'Exit',
    inputSourceTitle: 'Program Image',
    openImageHint: 'Open Program Image',
    clickToBrowse: 'Click to browse your system',
    supportedFormats: 'CAS, DSK, BIN or CCC formats',
    fileNameLabel: 'File Name:',
    sizeLabel: 'Size:',
    cocoProgramNameLabel: 'CoCo Program Name:',
    loadAddrLabel: 'Load Address (RAM):',
    execAddrLabel: 'Execution Address:',
    payloadSizeLabel: 'Payload Size:',
    dskFilesTitle: 'DSK Disk Image Files',
    dskAddBtn: 'Add (.BIN/.BAS)',
    dskSaveBtn: 'Save .DSK',
    dskDeleteTitle: 'Delete from disk',
    dskColGran: 'Gran.',
    dskColTracks: 'Tracks',
    dskColName: 'Name',
    dskColType: 'Type',
    dskColSize: 'Size',
    dskColKind: 'Format',
    casBlocksTitle: 'Demodulated CAS Blocks',
    extractedPayloadButton: 'View/Edit Extracted Program',
    exportBinButton: 'Export Executable (.BIN)',
    noFileLoadedTitle: 'No file or program loaded',
    noFileLoadedDesc: 'Select a tape, disk image, executable or ROM file in the left panel to open the hex editor.',
    epromConfigTitle: 'EPROM & Bootstrap Settings',
    epromSizeLabel: 'Target EPROM Size:',
    eprom4kOption: '4 KB EPROM (2732)',
    eprom8kOption: '8 KB EPROM (2764)',
    eprom16kOption: '16 KB EPROM (27128)',
    eprom32kOption: '32 KB EPROM (27256 · 2 banks)',
    eprom64kOption: '64 KB EPROM (27512 · 4 banks)',
    epromSizeHint: 'Sets the physical EPROM chip size. The CoCo only sees 16 KB at a time through the $C000–$FEFF window (16,128 usable bytes); 32K/64K chips are split into 16K banks selected by a jumper on the board. A program must fit in a single bank; on larger chips the bank is mirrored so it boots at any jumper position.',
    allRamLabel: 'All-RAM Bootstrap (Two Stages)',
    allRamDesc: 'Toggle All-RAM hardware paging',
    allRamHint: 'Maps the program above $8000 in high RAM, which normally collides with the CoCo ROM. Relocates the bootloader to low RAM before page-switching the system to All-RAM mode (writing $FFDF) and masks interrupts (ORCC #$50), since in All-RAM mode the vectors at $FFF0+ become RAM.',
    fillerByteLabel: 'ROM Filler Byte:',
    fillerByteHint: 'Byte used to pad unused areas of the EPROM. The default $FF (255) represents the erased state of physical EPROMs, allowing much faster UV-chip programming.',
    compileButton: 'Assemble & Compile ROM',
    exportRomButton: 'Export Cartridge (.CCC)',
    emuModeLabel: 'Emulator Mode',
    emuModeHint: 'Ignores the CoCoEPROMpak physical constraints (chip sizes, jumper banks, mirroring). Emits an exact-size image (loader+payload) for use with -cart in XRoar/MAME. The CoCo 16K window ($C000–$FEFF) still applies. For programs larger than 16K (e.g. multi-part 64K games), use the Export for Emulator (.cas/.dsk) buttons below.',
    casFilesTitle: 'Tape Files',
    emuExportTitle: 'Export for Emulator',
    exportEmuCas: 'Export Tape (.CAS)',
    exportEmuDsk: 'Export Disk (.DSK)',
    cartExportTitle: 'Cartridge (.CCC)',
    exportCocoFlash: 'CocoFLASH (.BIN)',
    cocoFlashGuide: 'Flash with PRGFLASH.BAS (the .BIN loads at $4000). In MENU.BAS add the line: "NAME",bank,2 (type 2 = autostart game). Banks 0 and 1 are reserved for the menu; 16K uses 4 banks.',
    emuModeTagline: 'Builds a direct emulator image, without the board\'s physical limits.',
    configLockedHint: 'Load a program in step ① to unlock the settings.',
    howItWorksTitle: 'How it works',
    howStep1: 'Open a tape (.CAS), disk (.DSK) or executable (.BIN)',
    howStep2: 'Adjust the EPROM and bootstrap in step ②',
    howStep3: 'Compile the cartridge (.CCC) or export for the emulator (.CAS/.DSK)',
    memoryMapTitle: 'Physical Memory Map (EPROM vs. Low RAM)',
    epromLayoutLabel: 'EPROM Layout',
    freeSpaceLabel: 'FREE',
    bootLabel: 'BOOT',
    payloadLabel: 'PAYLOAD',
    consoleTitle: 'System Diagnostic Console',
    clearConsole: 'Clear',
    consoleMaximize: 'Maximize console',
    consoleRestore: 'Restore console',
    modalTitle: 'Sub-file Hex Editor',
    modalSubtitle: 'Exploring bytes extracted from:',
    modalClose: 'Close',
    modalCancel: 'Cancel',
    modalSave: 'Save Changes',
    // HexEditor translations:
    hexCols: 'Columns',
    vdgMode: 'VDG Character Mode',
    vdgGreenOption: 'CoCo VDG Green (Inverse Lowercase)',
    vdgOrangeOption: 'CoCo VDG Orange (Inverse Lowercase)',
    vdgStandardOption: 'Standard ASCII Text',
    searchPlaceholder: 'Search Hex (1A 50) or ASCII...',
    searchBtn: 'Search',
    hexHeaderAddress: 'ADDRESS',
    hexHeaderValues: 'HEXADECIMAL VALUES',
    hexHeaderChars: 'ASCII / VDG CHARACTERS',
    offsetLabel: 'Offset:',
    romAddressLabel: 'ROM Address:',
    valueLabel: 'Value:',
    hexEditorInstructions: 'Use Arrow keys to navigate. Type hex values to overwrite in HEX. ESC to exit.',
  }
};

// Formatos Greaseweazle (gw --format) suportados, com geometria p/ o mapa de trilhas
const GW_FORMATS = [
  { id: 'coco.decb', label: 'CoCo RS-DOS · 35 trilhas (1 lado)', cyls: 35, heads: 1 },
  { id: 'coco.decb.40t', label: 'CoCo RS-DOS · 40 trilhas (1 lado)', cyls: 40, heads: 1 },
  { id: 'coco.os9.40ss', label: 'CoCo OS-9 · 40T 1 lado', cyls: 40, heads: 1 },
  { id: 'coco.os9.40ds', label: 'CoCo OS-9 · 40T 2 lados', cyls: 40, heads: 2 },
  { id: 'coco.os9.80ss', label: 'CoCo OS-9 · 80T 1 lado', cyls: 80, heads: 1 },
  { id: 'coco.os9.80ds', label: 'CoCo OS-9 · 80T 2 lados', cyls: 80, heads: 2 },
  { id: 'dragon.40ss', label: 'Dragon · 40T 1 lado', cyls: 40, heads: 1 },
  { id: 'dragon.40ds', label: 'Dragon · 40T 2 lados', cyls: 40, heads: 2 },
  { id: 'dragon.80ss', label: 'Dragon · 80T 1 lado', cyls: 80, heads: 1 },
  { id: 'dragon.80ds', label: 'Dragon · 80T 2 lados', cyls: 80, heads: 2 },
];

// Grânulo -> trilha física (2 grânulos/trilha, pulando a trilha 17 do diretório)
function granuleToTrack(g: number): number {
  return Math.floor(g / 2) + (g >= 34 ? 1 : 0);
}

// Compacta uma lista de números em faixas: [0,1,2,4,7,8] -> "0-2, 4, 7-8"
function compressRanges(nums: number[]): string {
  const s = Array.from(new Set(nums)).sort((a, b) => a - b);
  if (!s.length) return '';
  const parts: string[] = [];
  let start = s[0], prev = s[0];
  for (let i = 1; i <= s.length; i++) {
    if (i < s.length && s[i] === prev + 1) { prev = s[i]; continue; }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    if (i < s.length) { start = s[i]; prev = s[i]; }
  }
  return parts.join(', ');
}

// Trilhas ocupadas por um arquivo. RS-DOS: a partir da cadeia de grânulos. Dragon: a partir
// da lista de setores (LSN → trilha = ⌊LSN/18⌋, formato SS de 18 setores/trilha).
function fileTracks(entry: any): string {
  if (!entry) return '';
  if (entry.format === 'dragon' && entry.sectors) return compressRanges(entry.sectors.map((l: number) => Math.floor(l / 18)));
  if (!entry.granuleChain) return '';
  return compressRanges(entry.granuleChain.map(granuleToTrack));
}

export default function App() {
  // Estado de idioma e configurações
  const [currentLang, setCurrentLang] = useState<'pt-br' | 'en-us'>('pt-br');
  const [activeTab, setActiveTab] = useState<'dsk' | 'xroar' | 'gw' | 'basic' | 'eprom'>('dsk');
  const [xroarLoad, setXroarLoad] = useState<{ name: string; ext: string; data: Uint8Array; key: number; drive?: number; runCmd?: string } | null>(null);
  // Injeção de texto/BASIC no XRoar (aba BASIC). reset=true força boot limpo antes de digitar.
  const [xroarType, setXroarType] = useState<{ text: string; key: number; reset?: boolean } | null>(null);
  // Editor BASIC: conteúdo e nome do arquivo persistem mesmo ao trocar de aba.
  const [basicText, setBasicText] = useState<string>('');
  const [basicName, setBasicName] = useState<string>('');
  const [basicPane, setBasicPane] = useState<'A' | 'B'>('A');          // painel DSK destino do .BAS
  const [basicScreen, setBasicScreen] = useState<string>('green-black'); // esquema de cores (fundo/letra) do editor
  const [basicAddNew, setBasicAddNew] = useState<boolean>(true);       // prepende NEW ao injetar
  const [basicAddRun, setBasicAddRun] = useState<boolean>(true);       // anexa RUN ao injetar
  const [basicBold, setBasicBold] = useState<boolean>(true);          // fonte do editor em negrito
  // Origem do programa aberto no editor (se veio de um arquivo num DSK) — habilita o "Salvar" in-place.
  // Guarda também a identidade do disco (nome + índice no contêiner) p/ detectar troca de imagem.
  type BasicSrc = { pane: 'A' | 'B'; entry: any; diskName?: string; containerIndex?: number };
  const [basicSource, setBasicSource] = useState<BasicSrc | null>(null);
  // Modais do editor BASIC
  const [basicSaveConfirm, setBasicSaveConfirm] = useState<{ name: string; program: string; pane: 'A' | 'B' } | null>(null);
  const [basicOpenPending, setBasicOpenPending] = useState<{ text: string; label: string; source: BasicSrc | null; name: string } | null>(null);
  // Modal: o arquivo de origem sumiu / disco foi trocado ao tentar "Salvar" in-place.
  const [basicUpdateConfirm, setBasicUpdateConfirm] = useState<{ which: 'A' | 'B'; name: string; reason: 'missing' | 'diskChanged' } | null>(null);
  const [dskDirty, setDskDirty] = useState<{ A: boolean; B: boolean }>({ A: false, B: false }); // alterações não salvas por painel
  const [consoleMax, setConsoleMax] = useState<boolean>(false);

  // Plataforma-alvo persistente (CoCo x Dragon). Define o PADRÃO de "Novo disco", a máquina
  // padrão do XRoar e o formato padrão do Greaseweazle. Cada painel/disco aberto continua
  // respeitando o seu formato real; o toggle é só o contexto/padrão.
  const [platform, setPlatform] = useState<'coco' | 'dragon'>('coco');

  // Greaseweazle (aba GW)
  const [gwPath, setGwPath] = useState<string>('gw');
  const [gwFormat, setGwFormat] = useState<string>('coco.decb');
  const [gwDevice, setGwDevice] = useState<string>('');
  const [gwDrive, setGwDrive] = useState<string>('');
  const [gwExtra, setGwExtra] = useState<string>('');
  const [gwDirect, setGwDirect] = useState<string>(''); // comando direto (NÃO persistente): substitui todos os args construídos
  const [gwStep, setGwStep] = useState<string>('3000'); // step delay (µs) p/ "gw delays --step" (diagnóstico do drive)
  const [gwPane, setGwPane] = useState<'A' | 'B'>('A'); // painel-alvo da leitura GW (e usado na gravação)
  const [gwReadConfirm, setGwReadConfirm] = useState<boolean>(false); // modal: sobrescrever painel ao ler
  const [dskGwConfirm, setDskGwConfirm] = useState<boolean>(false); // modal: confirmar gravação no GW a partir da aba DSK
  const [dskNewConfirm, setDskNewConfirm] = useState<'A' | 'B' | null>(null); // modal: confirmar "Novo" sobre painel com conteúdo
  const [gwBusy, setGwBusy] = useState<boolean>(false);
  const [gwOp, setGwOp] = useState<'' | 'info' | 'read' | 'write'>('');
  const [gwDone, setGwDone] = useState<Set<string>>(new Set());

  // Aba DSK — dois painéis (A em cima, B embaixo)
  const [paneA, setPaneA] = useState<any>(null); // { buffer, fileName, size, files, freeGranules, totalGranules }
  const [paneB, setPaneB] = useState<any>(null);
  const [selectedDsk, setSelectedDsk] = useState<{ pane: 'A' | 'B'; entries: any[] } | null>(null);
  const [hexEditTarget, setHexEditTarget] = useState<any>(null); // { pane, entry } quando o hexa edita um arquivo do .dsk
  const [activePane, setActivePane] = useState<'A' | 'B'>('A');
  const [dskClipboard, setDskClipboard] = useState<any>(null); // { name, ext, fileType, asciiFlag, data, cut, sourcePane, sourceEntry }
  const [dskCollision, setDskCollision] = useState<any>(null); // pending add awaiting overwrite/rename/cancel
  const [dskUndo, setDskUndo] = useState<any[]>([]); // pilha de snapshots {A,B}
  const [dskRedo, setDskRedo] = useState<any[]>([]);
  const [dskTopHeight, setDskTopHeight] = useState<number>(266); // -5% para dar folga à barra de ferramentas do DSK
  const [diskPicker, setDiskPicker] = useState<{ which: 'A' | 'B' } | null>(null); // modal de busca/salto de disco do contêiner
  const [defragModal, setDefragModal] = useState<{ which: 'A' | 'B' } | null>(null); // modal de desfragmentação total
  const [defragOrder, setDefragOrder] = useState<'dir' | 'alpha' | 'size'>('dir'); // ordem dos arquivos na desfrag
  // Estado da animação de desfragmentação (modal nostálgico estilo defrag).
  const [defragRun, setDefragRun] = useState<{
    which: 'A' | 'B'; diskName: string; files: any[]; totalGranules: number; currentName: string;
    doneGranules: number; totalWork: number; status: 'spinup' | 'running' | 'confirm' | 'done' | 'cancelled';
    startFrag: number; endFrag: number; processed: number; skipped: number;
  } | null>(null);
  const defragCtl = useRef<{ pause: boolean; decision: 'all' | 'current' | null }>({ pause: false, decision: null });
  // Índice de nomes de arquivo por disco do contêiner (p/ a busca por arquivo no "Buscar disco").
  const fileIndexRef = useRef<Record<string, Record<number, string[]>>>({});
  const [fileIndex, setFileIndex] = useState<{ key: string; map: Record<number, string[]>; done: number; total: number; building: boolean } | null>(null);
  const [imageBusy, setImageBusy] = useState<boolean>(false);
  const [imageFilter, setImageFilter] = useState<string>('');
  const [imageProgress, setImageProgress] = useState<any>(null); // { phase, loaded, total }
  const dskDragItem = useRef<{ pane: 'A' | 'B'; entries: any[]; srcBuffer?: Uint8Array } | null>(null);
  const dskAnchor = useRef<{ pane: 'A' | 'B'; index: number } | null>(null);
  const dskKbdRef = useRef<any>({});
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>(DEFAULT_TRANSLATIONS);

  // Estado do arquivo de entrada
  const [fileDetails, setFileDetails] = useState<any>(null);
  const [fileLoading, setFileLoading] = useState<boolean>(false);
  
  // Componentes analisados
  const [dskFiles, setDskFiles] = useState<any[]>([]);
  const [dskBuffer, setDskBuffer] = useState<Uint8Array | null>(null); // imagem .dsk ativa (editável)
  const [selectedDskFile, setSelectedDskFile] = useState<any>(null);
  const [casBlocks, setCasBlocks] = useState<any[]>([]);
  const [casFileList, setCasFileList] = useState<any[]>([]); // todos os arquivos de uma fita multi-arquivo
  const [selectedCasFile, setSelectedCasFile] = useState<string | null>(null);
  
  // Buffers separados: buffer do arquivo bruto (editor principal) e payload extraído (bootstrap/EPROM)
  const [rawFileBuffer, setRawFileBuffer] = useState<Uint8Array | null>(null);
  const [extractedPayload, setExtractedPayload] = useState<Uint8Array | null>(null);

  const [loadAddr, setLoadAddr] = useState<number>(0x1000);
  const [execAddr, setExecAddr] = useState<number>(0x1000);
  const [programName, setProgramName] = useState<string>('COCOGAME');

  // Configurações do Loader e EPROM
  const [epromSizeKb, setEpromSizeKb] = useState<number>(16);
  const [useTwoStage, setUseTwoStage] = useState<boolean>(false);
  const [fillerByte, setFillerByte] = useState<number>(0xFF);
  const [emulatorMode, setEmulatorMode] = useState<boolean>(false);
  const [activeHint, setActiveHint] = useState<string | null>(null);

  const toggleHint = (hintKey: string) => {
    setActiveHint(prev => prev === hintKey ? null : hintKey);
  };

  // Estados do Modal do Sub-editor Hexadecimal
  const [isHexModalOpen, setIsHexModalOpen] = useState<boolean>(false);
  const [showDisasm, setShowDisasm] = useState<boolean>(true);    // painel de disassembly 6809 (sempre aberto junto do hexa)
  const [disasmWidth, setDisasmWidth] = useState<number>(420);    // largura do painel disasm (split ajustável)
  const [disasmOrigin, setDisasmOrigin] = useState<string>('');   // endereço de origem (hex) p/ o disassembly
  const [disasmFlow, setDisasmFlow] = useState<boolean>(true);    // seguir fluxo (recursive-descent) vs linear
  const disasmPreRef = useRef<HTMLDivElement>(null);              // contêiner do disassembly (p/ rolagem sincronizada)
  const disasmLinesRef = useRef<DisasmLine[]>([]);                // linhas atuais do disassembly
  const [hexSel, setHexSel] = useState<number | null>(null);     // offset selecionado no hexa (destaca ASCII + disasm)
  const [hexRange, setHexRange] = useState<[number, number]>([-1, -1]); // intervalo selecionado no hexa (p/ marcar)
  const [disasmData, setDisasmData] = useState<Array<[number, number]>>([]); // intervalos marcados como DADOS
  const [disasmCode, setDisasmCode] = useState<number[]>([]);    // offsets marcados como entrada de CÓDIGO
  const [disasmCvec, setDisasmCvec] = useState<Array<[number, number]>>([]); // tabela de vetores de CÓDIGO (FDB)
  const [disasmDvec, setDisasmDvec] = useState<Array<[number, number]>>([]); // tabela de vetores de DADOS (FDB)
  // Painéis rolam de forma autônoma; ao selecionar um byte no hexa, traz a instrução
  // correspondente do disassembly para a vista (só rola se estiver fora da tela) e destaca.
  useEffect(() => {
    if (!showDisasm || hexSel == null) return;
    const pre = disasmPreRef.current; const lines = disasmLinesRef.current;
    if (!pre || !lines.length) return;
    const origin = (parseInt(disasmOrigin, 16) || loadAddr || 0) & 0xFFFF;
    const target = origin + hexSel;
    const idx = lines.findIndex(l => target >= l.addr && target < l.addr + l.bytes.length);
    if (idx < 0) return;
    const child = pre.children[idx] as HTMLElement | undefined;
    if (child) child.scrollIntoView({ block: 'nearest' });
  }, [hexSel, showDisasm, disasmOrigin, loadAddr]);
  const [isExitModalOpen, setIsExitModalOpen] = useState<boolean>(false);
  const [modalBuffer, setModalBuffer] = useState<Uint8Array | null>(null);
  const [modalFileName, setModalFileName] = useState<string>('');
  // Marcas código/dados do disassembly PERSISTEM por arquivo (localStorage), chaveadas por
  // nome + tamanho. (Não uso checksum de conteúdo de propósito: as marcas são por OFFSET, então
  // devem sobreviver a edições de byte no hexa — que mantêm o tamanho e os offsets válidos.)
  const disasmFileKey = useMemo(
    () => (modalBuffer && modalBuffer.length ? `${modalFileName}|${modalBuffer.length}` : ''),
    [modalFileName, modalBuffer]
  );
  useEffect(() => {
    const m = loadDisasmMarks(disasmFileKey);
    setDisasmData(m.data); setDisasmCode(m.code); setDisasmCvec(m.cvec); setDisasmDvec(m.dvec);
  }, [disasmFileKey]);
  // Mutações das marcas: atualizam o estado E gravam (a chave é estável durante a edição).
  const persistMarks = (data: Array<[number, number]>, code: number[], cvec: Array<[number, number]>, dvec: Array<[number, number]>) =>
    saveDisasmMarks(disasmFileKey, { data, code, cvec, dvec });
  const addDisasmDataMark = () => {
    if (hexRange[0] < 0) return;
    const nd: Array<[number, number]> = [...disasmData, [hexRange[0], hexRange[1]]];
    setDisasmData(nd); persistMarks(nd, disasmCode, disasmCvec, disasmDvec);
  };
  const addDisasmCodeMark = () => {
    if (hexRange[0] < 0) return;
    const nc = [...disasmCode, hexRange[0]];
    setDisasmCode(nc); persistMarks(disasmData, nc, disasmCvec, disasmDvec);
  };
  const addDisasmCvecMark = () => {
    if (hexRange[0] < 0) return;
    const nv: Array<[number, number]> = [...disasmCvec, [hexRange[0], hexRange[1]]];
    setDisasmCvec(nv); persistMarks(disasmData, disasmCode, nv, disasmDvec);
  };
  const addDisasmDvecMark = () => {
    if (hexRange[0] < 0) return;
    const nv: Array<[number, number]> = [...disasmDvec, [hexRange[0], hexRange[1]]];
    setDisasmDvec(nv); persistMarks(disasmData, disasmCode, disasmCvec, nv);
  };
  const clearDisasmMarks = () => {
    setDisasmData([]); setDisasmCode([]); setDisasmCvec([]); setDisasmDvec([]);
    persistMarks([], [], [], []);
  };

  // Resultados de compilação
  const [compiledRom, setCompiledRom] = useState<Uint8Array | null>(null);
  const [loaderSize, setLoaderSize] = useState<number>(0);
  const [payloadRomOffset, setPayloadRomOffset] = useState<number>(0);
  const [numBanks, setNumBanks] = useState<number>(1);
  const [compilationSuccess, setCompilationSuccess] = useState<boolean>(false);

  // CoCo cartridge window ($C000-$FEFF). $FF00-$FFFF is I/O, never ROM.
  const BANK_USABLE_BYTES = 0x3F00; // 16,128 bytes usable per 16K bank

    // Logs do Console de Diagnóstico
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Rolagem automática do console
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Progresso de leitura/varredura de imagens grandes (MiniIDE/CoCoSDC/contêiner)
  useEffect(() => {
    if (!window.cocoApi || typeof window.cocoApi.onImageProgress !== 'function') return;
    const off = window.cocoApi.onImageProgress((p: any) => setImageProgress(p));
    return () => { if (typeof off === 'function') off(); };
  }, []);

  // O X da janela dispara o MESMO modal de "Sair" (confirma + avisa sobre salvar).
  useEffect(() => {
    if (!window.cocoApi || typeof window.cocoApi.onAppCloseRequest !== 'function') return;
    const off = window.cocoApi.onAppCloseRequest(() => setIsExitModalOpen(true));
    return () => { if (typeof off === 'function') off(); };
  }, []);

  // Atalhos de teclado da aba DSK (lê os handlers atuais via ref)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = dskKbdRef.current;
      if (!k || k.activeTab !== 'dsk') return;
      const tag = ((e.target as HTMLElement)?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey && key === 'c') { e.preventDefault(); k.handleDskCopy(false); }
      else if (e.ctrlKey && key === 'x') { e.preventDefault(); k.handleDskCopy(true); }
      else if (e.ctrlKey && key === 'v') { e.preventDefault(); k.handleDskPaste(); }
      else if (key === 'delete') { e.preventDefault(); k.handleDskDelete(); }
      else if (e.ctrlKey && key === 'y') { e.preventDefault(); k.handleDskRedo(); }
      else if (e.ctrlKey && key === 'z') { e.preventDefault(); if (e.shiftKey) k.handleDskRedo(); else k.handleDskUndo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Stream do output do Greaseweazle -> console + mapa de trilhas
  useEffect(() => {
    if (!window.cocoApi || typeof window.cocoApi.onGwLog !== 'function') return;
    const off = window.cocoApi.onGwLog((chunk: string) => {
      chunk.split(/\r?\n/).forEach((l: string) => {
        const t = l.replace(/\s+$/, '');
        if (t.length) addLog(t, t, /erro|error|fail|exception/i.test(t) ? 'error' : 'info');
        const m = t.match(/T(\d+)\.(\d+)/) || t.match(/[cC]yl(?:inder)?\s*=?\s*(\d+)[ ,]+[hH]ead\s*=?\s*(\d+)/);
        if (m) {
          const key = `${parseInt(m[1], 10)}.${parseInt(m[2], 10)}`;
          setGwDone(prev => { const s = new Set(prev); s.add(key); return s; });
        }
      });
    });
    return () => { if (off) off(); };
  }, []);

  const addLog = (textPt: string, textEn: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    setLogs(prev => [...prev, { time, type, textPt, textEn }]);
  };

  // Carrega as configurações do app (idioma, GW, etc.) e marca como carregado
  const settingsLoaded = useRef<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        if (window.cocoApi && typeof window.cocoApi.loadConfig === 'function') {
          const s = await window.cocoApi.loadConfig();
          if (s) {
            if (s.currentLang) setCurrentLang(s.currentLang);
            if (typeof s.gwPath === 'string') setGwPath(s.gwPath);
            if (typeof s.gwFormat === 'string') setGwFormat(s.gwFormat);
            if (typeof s.gwDevice === 'string') setGwDevice(s.gwDevice);
            if (typeof s.gwDrive === 'string') setGwDrive(s.gwDrive);
            if (typeof s.gwExtra === 'string') setGwExtra(s.gwExtra);
            if (s.gwPane === 'A' || s.gwPane === 'B') setGwPane(s.gwPane);
            if (typeof s.fillerByte === 'number') setFillerByte(s.fillerByte);
            if (typeof s.basicText === 'string') setBasicText(s.basicText);
            if (typeof s.basicName === 'string') setBasicName(s.basicName);
            if (s.basicPane === 'A' || s.basicPane === 'B') setBasicPane(s.basicPane);
            if (typeof s.basicScreen === 'string') setBasicScreen(s.basicScreen === 'green' ? 'green-black' : s.basicScreen === 'orange' ? 'orange-black' : s.basicScreen);
            if (typeof s.basicAddNew === 'boolean') setBasicAddNew(s.basicAddNew);
            if (typeof s.basicAddRun === 'boolean') setBasicAddRun(s.basicAddRun);
            if (typeof s.basicBold === 'boolean') setBasicBold(s.basicBold);
            if (typeof s.gwStep === 'string') setGwStep(s.gwStep);
            if (s.platform === 'coco' || s.platform === 'dragon') setPlatform(s.platform);
            addLog('Configurações carregadas do arquivo de configuração.', 'Settings loaded from the configuration file.', 'success');
          } else if (typeof window.cocoApi.saveConfig === 'function') {
            await window.cocoApi.saveConfig({ currentLang: 'pt-br', gwPath: 'gw', gwFormat: 'coco.decb', gwDevice: '', gwDrive: '', gwExtra: '', fillerByte: 0xFF });
            addLog('Arquivo de configurações criado com os padrões.', 'Configuration file created with defaults.', 'info');
          }
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      }
      settingsLoaded.current = true;
    })();
  }, []);

  // Salva as configurações automaticamente quando algo persistido muda (após a carga inicial)
  useEffect(() => {
    if (!settingsLoaded.current) return;
    if (window.cocoApi && typeof window.cocoApi.saveConfig === 'function') {
      window.cocoApi.saveConfig({ currentLang, gwPath, gwFormat, gwDevice, gwDrive, gwExtra, gwPane, fillerByte, basicText, basicName, basicPane, basicScreen, basicAddNew, basicAddRun, basicBold, gwStep, platform });
    }
  }, [currentLang, gwPath, gwFormat, gwDevice, gwDrive, gwExtra, gwPane, fillerByte, basicText, basicName, basicPane, basicScreen, basicAddNew, basicAddRun, basicBold, gwStep, platform]);

  const changeLanguage = (lang: 'pt-br' | 'en-us') => {
    setCurrentLang(lang);
    addLog(
      'Idioma alterado para Português (Brasil).',
      'Language changed to English (United States).',
      'success'
    );
  };

  // Formato GW (gw --format) que casa com a geometria de um disco/painel já carregado.
  const gwFormatForDisk = (p: any): string => {
    if (!p) return platform === 'dragon' ? 'dragon.40ss' : 'coco.decb';
    if (p.format === 'dragon') {
      const ds = p.geom?.sides === 2, t80 = (p.geom?.tracks || 40) >= 80;
      return t80 ? (ds ? 'dragon.80ds' : 'dragon.80ss') : (ds ? 'dragon.40ds' : 'dragon.40ss');
    }
    return p.size === 184320 ? 'coco.decb.40t' : 'coco.decb';
  };

  // Troca a plataforma-alvo persistente. Ajusta o FORMATO GW para o padrão da plataforma; a
  // máquina do XRoar e o padrão de "Novo disco" seguem via prop/estado de `platform`.
  const changePlatform = (pf: 'coco' | 'dragon') => {
    setPlatform(pf);
    setGwFormat(pf === 'dragon' ? 'dragon.40ss' : 'coco.decb');
    addLog(
      pf === 'dragon'
        ? 'Plataforma: DRAGON. Padrão de Novo disco, máquina do XRoar e formato GW ajustados para Dragon (40T).'
        : 'Plataforma: CoCo. Padrão de Novo disco, máquina do XRoar e formato GW ajustados para CoCo (RS-DOS).',
      pf === 'dragon'
        ? 'Platform: DRAGON. New-disk default, XRoar machine and GW format set to Dragon (40T).'
        : 'Platform: CoCo. New-disk default, XRoar machine and GW format set to CoCo (RS-DOS).',
      'info'
    );
  };

  const t = (key: string): string => {
    const dict = translations[currentLang] || DEFAULT_TRANSLATIONS[currentLang] || DEFAULT_TRANSLATIONS['pt-br'];
    return dict[key] || DEFAULT_TRANSLATIONS['pt-br'][key] || key;
  };

  useEffect(() => {
    addLog(
      'Bem-vindo ao CoCo DSK & CCC Utility. Use a aba DSK para manipular imagens de disco e a aba EPROM para converter e gravar cartuchos.',
      'Welcome to CoCo DSK & CCC Utility. Use the DSK tab to manage disk images and the EPROM tab to convert and build cartridges.',
      'info'
    );
    addLog(
      'Formatos suportados: .CAS, .DSK, .BIN, .CCC.',
      'Supported formats: .CAS, .DSK, .BIN, .CCC.',
      'info'
    );
  }, [currentLang]);

  // Assistente Inteligente
  useEffect(() => {
    if (extractedPayload) {
      const endAddr = loadAddr + extractedPayload.length;
      if (loadAddr >= 0x8000 || endAddr > 0x8000) {
        if (!useTwoStage) {
          setUseTwoStage(true);
          addLog(
            `Assistente Inteligente: O programa mapeia para a RAM acima de $8000 (Carga: $${loadAddr.toString(16).toUpperCase()}). O inicializador de dois estágios All-RAM foi ativado automaticamente para evitar colisão com a ROM.`,
            `Smart Assistant: Program maps to RAM above $8000 (Load: $${loadAddr.toString(16).toUpperCase()}). The two-stage All-RAM bootstrap was automatically enabled to avoid collision with ROM.`,
            'warn'
          );
        }
      }
    }
  }, [loadAddr, extractedPayload]);

  // Estado e métodos para Drag & Drop
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Estados para reajuste de layout (Splitters)
  const [width1, setWidth1] = useState<number>(420); // Largura padrão da Coluna 1 (abrir arquivo)
  const [consoleHeight, setConsoleHeight] = useState<number>(91); // Altura do terminal no rodapé (~35% menor)
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const startResizing1 = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
    const startX = mouseDownEvent.clientX;
    const startWidth = width1;

    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const deltaX = mouseMoveEvent.clientX - startX;
      setWidth1(Math.max(300, Math.min(600, startWidth + deltaX)));
    };

    const stopDrag = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const startResizingConsole = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
    const startY = mouseDownEvent.clientY;
    const startHeight = consoleHeight;

    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const currentDeltaY = mouseMoveEvent.clientY - startY;
      setConsoleHeight(Math.max(80, Math.min(350, startHeight - currentDeltaY)));
    };

    const stopDrag = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = async () => {
        const buffer = reader.result as ArrayBuffer;
        const name = file.name;
        const ext = '.' + name.split('.').pop()?.toLowerCase();
        await processFileData(name, ext, file.size, buffer);
      };
      reader.onerror = () => {
        addLog(
          'Erro ao ler arquivo arrastado.',
          'Error reading dragged file.',
          'error'
        );
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // Auto-configura as opções com base no payload carregado
  const applyAutoConfig = (payloadLen: number, lAddr: number, isCcc: boolean = false) => {
    if (!isCcc) {
      // 1. Auto EPROM size. A single program must fit in ONE 16K bank window
      // ($C000-$FEFF, 16,128 usable bytes). Reserve ~64 bytes for DK header + loader.
      const needed = payloadLen + 64;
      if (needed <= 4096) setEpromSizeKb(4);
      else if (needed <= 8192) setEpromSizeKb(8);
      else setEpromSizeKb(16); // one 16K bank is the max for a single program
      if (needed > BANK_USABLE_BYTES) {
        addLog(
          `Aviso: o programa (${payloadLen} bytes) + inicializador excede um banco de 16K (${BANK_USABLE_BYTES} bytes úteis em $C000–$FEFF). Ele não cabe em um único banco e a compilação falhará. Reduza o payload ou divida em bancos.`,
          `Warning: the program (${payloadLen} bytes) + bootstrap exceeds one 16K bank (${BANK_USABLE_BYTES} usable bytes at $C000–$FEFF). It will not fit in a single bank and compilation will fail. Reduce the payload or split across banks.`,
          'warn'
        );
      }

      // 2. Auto All-RAM (Two-Stage Bootloader)
      if (lAddr >= 0x8000 || (lAddr + payloadLen) > 0x8000) {
        setUseTwoStage(true);
      } else {
        setUseTwoStage(false);
      }

      // 3. Filler byte
      setFillerByte(255);
    }
  };

  // Lógica unificada de processamento de arquivo
  const processFileData = async (fileName: string, fileExt: string, size: number, buffer: ArrayBuffer) => {
    try {
      setFileLoading(true);
      addLog(
        `Carregando arquivo: ${fileName} (${(size / 1024).toFixed(2)} KB)`,
        `Loading file: ${fileName} (${(size / 1024).toFixed(2)} KB)`,
        'info'
      );
      setFileDetails({
        filePath: fileName,
        fileName,
        fileExt,
        size,
        buffer
      });

      // Limpar estados anteriores
      setDskFiles([]);
      setDskBuffer(null);
      setSelectedDskFile(null);
      setCasBlocks([]);
      setCasFileList([]);
      setSelectedCasFile(null);
      setCompiledRom(null);
      setCompilationSuccess(false);

      const ext = fileExt.toLowerCase();
      const uint8 = new Uint8Array(buffer);

      // Sempre exibe o buffer bruto do arquivo carregado imediatamente no editor hexadecimal principal
      setRawFileBuffer(uint8);
      setExtractedPayload(null);
      setLoadAddr(0x0000);
      setExecAddr(0x0000);
      setProgramName(fileName.split('.')[0].toUpperCase().substring(0, 8));

      if (ext === '.wav') {
        addLog(
          'Aplicando demodulador de frequência FSK DSP por cruzamento por zero...',
          'Applying zero-crossing FSK DSP frequency demodulator...',
          'info'
        );
        const res = await window.cocoApi.decodeWavAudio(uint8);
        if (res.success) {
          addLog(
            `Sucesso no DSP: Demodulados ${res.blocks.length} blocos de fita! Fase invertida: ${res.isInverted}. Índice do bit de sincronia: ${res.syncBitIndex}`,
            `DSP Success: Demodulated ${res.blocks.length} tape blocks! Inverted phase: ${res.isInverted}. Sync bit index: ${res.syncBitIndex}`,
            'success'
          );
          setProgramName(res.name);
          setLoadAddr(res.loadAddr);
          setExecAddr(res.execAddr);
          setExtractedPayload(res.payload); // Código extraído
          setCasBlocks(res.blocks);
          setCasFileList(res.files || []);
          if (res.files && res.files.length > 1) {
            addLog(
              `Fita multi-arquivo: ${res.files.length} arquivos detectados. O programa ativo é "${res.name}". Para jogos multi-parte, use "Exportar para Emulador" (.cas/.dsk) — um cartucho de banco único não comporta todas as partes.`,
              `Multi-file tape: ${res.files.length} files detected. Active program is "${res.name}". For multi-part games use "Export for Emulator" (.cas/.dsk) — a single-bank cartridge cannot hold all parts.`,
              'warn'
            );
          }
          applyAutoConfig(res.payload.length, res.loadAddr);
          
          addLog(
            `Detalhes do programa: Nome: "${res.name}", Carga: $${res.loadAddr.toString(16).toUpperCase()}, Execução: $${res.execAddr.toString(16).toUpperCase()}`,
            `Program details: Name: "${res.name}", Load: $${res.loadAddr.toString(16).toUpperCase()}, Exec: $${res.execAddr.toString(16).toUpperCase()}`,
            'success'
          );
          addLog(
            `Payload extraído: ${res.payload.length} bytes de código de máquina prontos para visualização e edição.`,
            `Extracted payload: ${res.payload.length} machine code bytes ready for viewing and editing.`,
            'info'
          );
        } else {
          addLog(`FSK DSP: ${res.error}`, `FSK DSP: ${res.error}`, 'error');
        }
      } else if (ext === '.cas') {
        addLog(
          'Analisando fluxo de bytes de pacotes CAS...',
          'Parsing CAS raw tape packets...',
          'info'
        );
        const res = await window.cocoApi.parseCasPayload(uint8);
        if (res.success) {
          addLog(
            `Sucesso: ${res.blocks.length} blocos analisados com sucesso!`,
            `Success: ${res.blocks.length} blocks successfully parsed!`,
            'success'
          );
          setProgramName(res.name);
          setLoadAddr(res.loadAddr);
          setExecAddr(res.execAddr);
          setExtractedPayload(res.payload);
          setCasBlocks(res.blocks);
          setCasFileList(res.files || []);
          if (res.files && res.files.length > 1) {
            addLog(
              `Fita multi-arquivo: ${res.files.length} arquivos detectados. O programa ativo é "${res.name}". Para jogos multi-parte, use "Exportar para Emulador" (.cas/.dsk) — um cartucho de banco único não comporta todas as partes.`,
              `Multi-file tape: ${res.files.length} files detected. Active program is "${res.name}". For multi-part games use "Export for Emulator" (.cas/.dsk) — a single-bank cartridge cannot hold all parts.`,
              'warn'
            );
          }
          applyAutoConfig(res.payload.length, res.loadAddr);

          addLog(
            `Detalhes do programa: Nome: "${res.name}", Carga: $${res.loadAddr.toString(16).toUpperCase()}, Execução: $${res.execAddr.toString(16).toUpperCase()}`,
            `Program details: Name: "${res.name}", Load: $${res.loadAddr.toString(16).toUpperCase()}, Exec: $${res.execAddr.toString(16).toUpperCase()}`,
            'success'
          );
        } else {
          addLog(`CAS Parse: ${res.error}`, `CAS Parse: ${res.error}`, 'error');
        }
      } else if (ext === '.dsk') {
        addLog(
          'Escaneando a Trilha 17 e percorrendo os setores FAT do RS-DOS...',
          'Scanning Track 17 and traversing RS-DOS FAT sectors...',
          'info'
        );
        const res = await window.cocoApi.readDskDirectory(uint8);
        if (res.success) {
          addLog(
            `Encontrados ${res.files.length} arquivos ativos na imagem do disquete!`,
            `Found ${res.files.length} active files in the diskette image!`,
            'success'
          );
          setDskFiles(res.files);
          setDskBuffer(uint8);
        } else {
          addLog(`DSK Directory Scan: ${res.error}`, `DSK Directory Scan: ${res.error}`, 'error');
        }
      } else if (ext === '.bin') {
        addLog(
          'Analisando blocos de segmento LOADM autônomos...',
          'Parsing autonomous LOADM segment blocks...',
          'info'
        );
        const res = await window.cocoApi.parseBinPayload(uint8);
        if (res.success) {
          addLog(
            `Sucesso: Encontrados ${res.segments.length} blocos de segmento!`,
            `Success: Found ${res.segments.length} segment blocks!`,
            'success'
          );
          setLoadAddr(res.loadAddr);
          setExecAddr(res.execAddr);
          setExtractedPayload(res.payload);
          setProgramName(fileName.split('.')[0].toUpperCase().substring(0, 8));
          applyAutoConfig(res.payload.length, res.loadAddr);
          
          addLog(
            `Endereço de Carga: $${res.loadAddr.toString(16).toUpperCase()}, Execução: $${res.execAddr.toString(16).toUpperCase()}, Tamanho: ${res.payload.length} bytes`,
            `Load Address: $${res.loadAddr.toString(16).toUpperCase()}, Exec: $${res.execAddr.toString(16).toUpperCase()}, Size: ${res.payload.length} bytes`,
            'success'
          );
          if (res.gapBytes && res.gapBytes > 0) {
            addLog(
              `Aviso: segmentos não-contíguos. ${res.gapBytes} bytes de preenchimento foram inseridos entre os segmentos para formar um payload contíguo (isso aumenta o tamanho ocupado na EPROM).`,
              `Warning: non-contiguous segments. ${res.gapBytes} filler bytes were inserted between segments to form a contiguous payload (this increases the size occupied in the EPROM).`,
              'warn'
            );
          }
        } else {
          addLog(`BIN segment parser: ${res.error}`, `BIN segment parser: ${res.error}`, 'error');
        }
      } else if (ext === '.ccc') {
        addLog(
          'Carregando imagem ROM. Exibindo diretamente no editor hexadecimal...',
          'Loading ROM image. Displaying directly in the hex editor...',
          'info'
        );
        setExtractedPayload(uint8);
        setLoadAddr(0xC000);
        setExecAddr(0xC000);
        setProgramName('ROMIMAGE');
        applyAutoConfig(uint8.length, 0xC000, true);
      }

    } catch (err: any) {
      addLog(
        `Erro ao carregar arquivo: ${err.message}`,
        `Error loading file: ${err.message}`,
        'error'
      );
    } finally {
      setFileLoading(false);
    }
  };

  // Carrega um arquivo usando o seletor nativo
  const handleSelectFile = async () => {
    try {
      const file = await window.cocoApi.selectFile();
      if (!file) {
        return;
      }
      await processFileData(file.fileName, file.fileExt, file.size, file.buffer);
    } catch (err: any) {
      addLog(
        `Erro ao carregar arquivo: ${err.message}`,
        `Error loading file: ${err.message}`,
        'error'
      );
    }
  };

  // Extrai um sub-arquivo específico do DSK e abre o modal flutuante
  const handleExtractDskFile = async (entry: any) => {
    if (!dskBuffer) return;
    try {
      addLog(
        `Extraindo "${entry.fullName}" da cadeia de grânulos [${entry.granuleChain.join(', ')}]...`,
        `Extracting "${entry.fullName}" from granule chain [${entry.granuleChain.join(', ')}]...`,
        'info'
      );
      setSelectedDskFile(entry);

      const res = await window.cocoApi.extractDskProgram(dskBuffer, entry);
      if (res.success) {
        setProgramName(entry.name);
        setLoadAddr(res.loadAddr);
        setExecAddr(res.execAddr);
        
        // Abre o modal flutuante com o editor hexadecimal dedicado ao sub-arquivo
        setModalBuffer(res.payload);
        setModalFileName(entry.fullName);
        setIsHexModalOpen(true);

        // Define também como payload ativo padrão para compilação posterior
        setExtractedPayload(res.payload);
        setCompiledRom(null);
        setCompilationSuccess(false);
        applyAutoConfig(res.payload.length, res.loadAddr);

        addLog(
          `Extração Concluída: ${entry.fullName} (${res.payload.length} bytes de payload).`,
          `Extraction Completed: ${entry.fullName} (${res.payload.length} payload bytes).`,
          'success'
        );
        addLog(
          `Mapeamento de Memória: Endereço de Carga $${res.loadAddr.toString(16).toUpperCase()}, Execução $${res.execAddr.toString(16).toUpperCase()}`,
          `Memory Mapping: Load Address $${res.loadAddr.toString(16).toUpperCase()}, Execution $${res.execAddr.toString(16).toUpperCase()}`,
          'info'
        );
        if (res.gapBytes && res.gapBytes > 0) {
          addLog(
            `Aviso: segmentos não-contíguos. ${res.gapBytes} bytes de preenchimento foram inseridos entre os segmentos para formar um payload contíguo.`,
            `Warning: non-contiguous segments. ${res.gapBytes} filler bytes were inserted between segments to form a contiguous payload.`,
            'warn'
          );
        }

        if (entry.fileType !== 2) {
          addLog(
            `Aviso: O tipo de arquivo de destino é "${entry.fileTypeName}" (esperado Código de Máquina). A inicialização pode precisar de ajustes manuais de execução.`,
            `Warning: Destination file type is "${entry.fileTypeName}" (Machine Code expected). Execution bootstrap might need manual tuning.`,
            'warn'
          );
        }
      } else {
        addLog(`DSK Extract: ${res.error}`, `DSK Extract: ${res.error}`, 'error');
      }
    } catch (err: any) {
      addLog(`DSK Extract Error: ${err.message}`, `DSK Extract Error: ${err.message}`, 'error');
    }
  };

  // Atualiza a lista de arquivos do DSK a partir de uma imagem modificada
  const refreshDskFromImage = async (image: Uint8Array) => {
    setDskBuffer(image);
    setSelectedDskFile(null);
    const res = await window.cocoApi.readDskDirectory(image);
    if (res.success) setDskFiles(res.files);
  };

  // Adiciona um .bin/.bas (escolhido por diálogo) na imagem .dsk ativa
  const handleAddToDsk = async () => {
    if (!dskBuffer) return;
    try {
      const res = await window.cocoApi.dskAddFile(dskBuffer);
      if (res.cancelled) return;
      if (!res.success) { addLog(`DSK Add: ${res.error}`, `DSK Add: ${res.error}`, 'error'); return; }
      await refreshDskFromImage(res.image);
      addLog(
        `Arquivo "${res.addedName}" adicionado à imagem .DSK. Lembre-se de salvar a imagem.`,
        `File "${res.addedName}" added to the .DSK image. Remember to save the image.`,
        'success'
      );
    } catch (err: any) { addLog(`DSK Add Error: ${err.message}`, `DSK Add Error: ${err.message}`, 'error'); }
  };

  // Apaga um arquivo da imagem .dsk ativa
  const handleDeleteDskFile = async (entry: any) => {
    if (!dskBuffer) return;
    try {
      const res = await window.cocoApi.dskDeleteFile(dskBuffer, entry);
      if (!res.success) { addLog(`DSK Delete: ${res.error}`, `DSK Delete: ${res.error}`, 'error'); return; }
      await refreshDskFromImage(res.image);
      addLog(
        `Arquivo "${entry.fullName}" apagado da imagem .DSK. Lembre-se de salvar a imagem.`,
        `File "${entry.fullName}" deleted from the .DSK image. Remember to save the image.`,
        'warn'
      );
    } catch (err: any) { addLog(`DSK Delete Error: ${err.message}`, `DSK Delete Error: ${err.message}`, 'error'); }
  };

  // Salva a imagem .dsk modificada
  const handleSaveDsk = async () => {
    if (!dskBuffer) return;
    try {
      const defaultName = fileDetails ? fileDetails.fileName : 'disk.dsk';
      const res = await window.cocoApi.saveCartridgeFile(
        dskBuffer, defaultName,
        currentLang === 'pt-br' ? 'Salvar imagem .DSK' : 'Save .DSK image',
        [{ name: 'RS-DOS Disk Image (.dsk)', extensions: ['dsk'] }, { name: 'All Files', extensions: ['*'] }]
      );
      if (res.success) addLog(`Imagem .DSK salva em: ${res.filePath}`, `.DSK image saved at: ${res.filePath}`, 'success');
      else if (res.error) addLog(`Save DSK: ${res.error}`, `Save DSK: ${res.error}`, 'error');
    } catch (err: any) { addLog(`Save DSK Error: ${err.message}`, `Save DSK Error: ${err.message}`, 'error'); }
  };

  // --- Aba DSK (dual-pane) ---
  const handleOpenDskPane = async (which: 'A' | 'B') => {
    try {
      const res = await window.cocoApi.openDskPane();
      if (res.cancelled) return;
      if (!res.success) { addLog(`DSK ${which}: ${res.error}`, `DSK ${which}: ${res.error}`, 'error'); return; }
      await loadPaneFromBuffer(which, new Uint8Array(res.buffer), res.fileName, 0, res.filePath);
      setActivePane(which);
      if (selectedDsk?.pane === which) setSelectedDsk(null);
    } catch (err: any) { addLog(`DSK open: ${err.message}`, `DSK open: ${err.message}`, 'error'); }
  };

  const handleSelectDskFile = (which: 'A' | 'B', entry: any, e?: React.MouseEvent) => {
    setActivePane(which);
    const pane = getPane(which);
    if (!pane) return;
    const idx = pane.files.findIndex((f: any) => f.fullName === entry.fullName);
    const curr = selectedDsk && selectedDsk.pane === which ? selectedDsk.entries : [];
    if (e && e.shiftKey && dskAnchor.current && dskAnchor.current.pane === which) {
      const a = dskAnchor.current.index;
      const [lo, hi] = a < idx ? [a, idx] : [idx, a];
      setSelectedDsk({ pane: which, entries: pane.files.slice(lo, hi + 1) });
    } else if (e && (e.ctrlKey || e.metaKey)) {
      const exists = curr.some((x: any) => x.fullName === entry.fullName);
      const entries = exists ? curr.filter((x: any) => x.fullName !== entry.fullName) : [...curr, entry];
      setSelectedDsk(entries.length ? { pane: which, entries } : null);
      dskAnchor.current = { pane: which, index: idx };
    } else {
      setSelectedDsk({ pane: which, entries: [entry] });
      dskAnchor.current = { pane: which, index: idx };
    }
  };

  const getPane = (which: 'A' | 'B') => (which === 'A' ? paneA : paneB);
  const setPane = (which: 'A' | 'B', pane: any) => (which === 'A' ? setPaneA(pane) : setPaneB(pane));
  const markDirty = (which: 'A' | 'B') => setDskDirty(d => ({ ...d, [which]: true }));
  const clearDirty = (which: 'A' | 'B') => setDskDirty(d => ({ ...d, [which]: false }));

  const STD_DISK = 161280; // disco RS-DOS padrão (35 trilhas)

  // Discos Dragon DOS (.vdk) são SOMENTE LEITURA nesta versão (listar/extrair/mapa). Qualquer
  // operação que modifique a imagem é bloqueada com aviso. Retorna true se deve abortar.
  const dragonReadOnlyGuard = (which: 'A' | 'B'): boolean => {
    if (getPane(which)?.format === 'dragon') {
      addLog('Discos Dragon DOS (.vdk) são somente leitura nesta versão — edição não suportada.',
        'Dragon DOS (.vdk) disks are read-only in this version — editing is not supported.', 'info');
      return true;
    }
    return false;
  };

  // Carrega uma imagem nova num painel; detecta contêiner multi-disco (N x 161280) e mostra o disco 0
  const loadPaneFromBuffer = async (which: 'A' | 'B', full: Uint8Array, fileName: string, index = 0, sourcePath?: string): Promise<boolean> => {
    let count = (full.length > 0 && full.length % STD_DISK === 0) ? full.length / STD_DISK : 1;
    if (count > 1) {
      // Um arquivo múltiplo de 161.280 pode ser um contêiner multi-disco OU um disco único
      // num slot maior (ex.: slot HDBDOS de tamanho dobrado, ou imagem OS-9). Só é contêiner
      // se as fatias forem discos RS-DOS válidos; senão, abre como imagem única.
      const det = await window.cocoApi.dskDetectContainer(full, STD_DISK);
      count = det?.count ?? count;
    }
    const slice = count > 1 ? full.slice(index * STD_DISK, (index + 1) * STD_DISK) : full;
    const res = await window.cocoApi.readDskDirectory(slice);
    if (!res.success) { addLog(`DSK: ${res.error}`, `DSK: ${res.error}`, 'error'); return false; }
    setPane(which, {
      buffer: slice, fileName, size: slice.length,
      // Caminho do arquivo de origem só para imagem ÚNICA (não-contêiner) → habilita "Salvar" (sobrescrever).
      sourcePath: count > 1 ? undefined : sourcePath,
      files: res.files, freeGranules: res.freeGranules, totalGranules: res.totalGranules,
      // Formato do disco (RS-DOS x Dragon DOS) + geometria/setores (Dragon é somente leitura).
      format: res.format, geom: res.geom, totalSectors: res.totalSectors, usedSectors: res.usedSectors, freeSectors: res.freeSectors,
      container: count > 1 ? {
        source: 'memory', kind: 'driveWire', full, count, index,
        entries: Array.from({ length: count }, (_, k) => ({ id: k, label: `Disco ${k}`, info: '', locator: { index: k } })),
      } : null
    });
    clearDirty(which); // imagem recém-aberta = sem alterações
    // Ajusta o formato do Greaseweazle para casar com o disco recém-carregado (RS-DOS x Dragon,
    // 35/40T, 1/2 lados) — assim "Gravar GW" já vem com o perfil certo.
    setGwFormat(gwFormatForDisk({ format: res.format, geom: res.geom, size: slice.length }));
    if (count > 1) {
      addLog(`Contêiner multi-disco detectado: ${count} discos de 160 KB. Mostrando o disco ${index} no painel ${which} — use o seletor de disco.`,
        `Multi-disk container detected: ${count} 160 KB disks. Showing disk ${index} in pane ${which} — use the disk selector.`, 'info');
    } else {
      addLog(`Imagem "${fileName}" no painel ${which}: ${res.files.length} arquivos, ${res.freeGranules} grânulos livres.`,
        `Image "${fileName}" in pane ${which}: ${res.files.length} files, ${res.freeGranules} free granules.`, 'success');
    }
    return true;
  };

  // Troca o disco ativo de um contêiner — em memória (DriveWire) fatia o buffer; em arquivo
  // (MiniIDE/CoCoSDC) lê só aquele disco do .img sob demanda (sem recarregar a imagem inteira).
  const handleSelectContainerDisk = async (which: 'A' | 'B', index: number) => {
    const pane = getPane(which);
    if (!pane || !pane.container) return;
    const c = pane.container;
    if (index < 0 || index >= c.count) return;
    let slice: Uint8Array;
    let label = pane.fileName;
    try {
      if (c.source === 'file') {
        const ex = await window.cocoApi.imageExtract(c.filePath, c.entries[index].locator);
        if (!ex.success) { addLog(`Trocar disco: ${ex.error}`, `Switch disk: ${ex.error}`, 'error'); return; }
        slice = new Uint8Array(ex.image);
        label = c.entries[index].label;
      } else {
        slice = c.full.slice(index * STD_DISK, (index + 1) * STD_DISK);
      }
    } catch (err: any) { addLog(`Trocar disco: ${err.message}`, `Switch disk: ${err.message}`, 'error'); return; }
    const res = await window.cocoApi.readDskDirectory(slice);
    if (!res.success) { addLog(`DSK: ${res.error}`, `DSK: ${res.error}`, 'error'); return; }
    if (selectedDsk?.pane === which) setSelectedDsk(null);
    setPane(which, {
      ...pane, buffer: slice, size: slice.length, fileName: label,
      files: res.files, freeGranules: res.freeGranules, totalGranules: res.totalGranules,
      format: res.format, geom: res.geom, totalSectors: res.totalSectors, usedSectors: res.usedSectors, freeSectors: res.freeSectors,
      container: { ...c, index }
    });
    clearDirty(which); // trocou para outro disco (limpo)
  };

  const containerKey = (c: any) => `${c.kind}|${c.fileName || ''}|${c.count}`;

  // Ao abrir o "Buscar disco", indexa em segundo plano os nomes de arquivo de cada disco do
  // contêiner (lendo cada diretório sob demanda), permitindo pesquisar por nome de ARQUIVO além
  // do nome/número do disco. Resultado fica em cache por contêiner; mostra progresso enquanto lê.
  useEffect(() => {
    if (!diskPicker) return;
    const c = getPane(diskPicker.which)?.container;
    if (!c || !c.entries?.length) { setFileIndex(null); return; }
    const key = containerKey(c);
    const cached = fileIndexRef.current[key];
    if (cached) { setFileIndex({ key, map: cached, done: c.entries.length, total: c.entries.length, building: false }); return; }
    let cancelled = false;
    const map: Record<number, string[]> = {};
    setFileIndex({ key, map, done: 0, total: c.entries.length, building: true });
    (async () => {
      for (let i = 0; i < c.entries.length; i++) {
        if (cancelled) return;
        const e = c.entries[i];
        try {
          let slice: Uint8Array | null = null;
          if (c.source === 'file' && c.filePath) {
            const ex = await window.cocoApi.imageExtract(c.filePath, e.locator);
            if (ex.success) slice = new Uint8Array(ex.image);
          } else if (c.full) {
            slice = c.full.slice(e.id * STD_DISK, (e.id + 1) * STD_DISK);
          }
          if (slice) { const dir = await window.cocoApi.readDskDirectory(slice); if (dir.success) map[e.id] = dir.files.map((f: any) => f.fullName); }
        } catch { /* disco ilegível: ignora */ }
        if (!cancelled && (i % 4 === 0 || i === c.entries.length - 1)) {
          setFileIndex({ key, map: { ...map }, done: i + 1, total: c.entries.length, building: i < c.entries.length - 1 });
        }
      }
      if (!cancelled) { fileIndexRef.current[key] = map; setFileIndex({ key, map, done: c.entries.length, total: c.entries.length, building: false }); }
    })();
    return () => { cancelled = true; };
  }, [diskPicker]);

  // Re-parse uma imagem modificada (mutação in-place); mantém e atualiza o contêiner, se houver
  const refreshPane = async (which: 'A' | 'B', image: Uint8Array, fileName?: string, size?: number) => {
    const res = await window.cocoApi.readDskDirectory(image);
    if (!res.success) { addLog(`DSK: ${res.error}`, `DSK: ${res.error}`, 'error'); return; }
    const prev = getPane(which) || {};
    let container = prev.container || null;
    if (container && container.source === 'memory' && container.full) {
      // contêiner em memória (DriveWire): grava o disco editado de volta no buffer completo
      const full = new Uint8Array(container.full);
      full.set(image, container.index * STD_DISK);
      container = { ...container, full };
    }
    // contêiner de arquivo (MiniIDE/CoCoSDC): edição fica só no painel; salvar gera .dsk avulso
    // (não regrava no .img); trocar de disco relê do arquivo.
    setPane(which, {
      buffer: image,
      fileName: fileName ?? prev.fileName ?? (which === 'A' ? 'NOVO_A.DSK' : 'NOVO_B.DSK'),
      size: size ?? image.length,
      sourcePath: prev.sourcePath, // preserva o caminho de origem para o "Salvar" (sobrescrever)
      files: res.files,
      freeGranules: res.freeGranules,
      totalGranules: res.totalGranules,
      format: res.format, geom: res.geom, totalSectors: res.totalSectors, usedSectors: res.usedSectors, freeSectors: res.freeSectors,
      container
    });
    markDirty(which); // refreshPane só é chamado após edições → alteração não salva
  };

  const uniqueNameFromFiles = (files: any[], base: string, ext: string) => {
    const taken = (nm: string) => files.some((f: any) => `${f.name}.${f.ext}`.toUpperCase() === `${nm}.${ext}`.toUpperCase());
    let candidate = base.slice(0, 8);
    let i = 1;
    while (taken(candidate) && i < 100) {
      const suf = '~' + i;
      candidate = base.slice(0, 8 - suf.length) + suf;
      i++;
    }
    return candidate;
  };

  // Inicia a adição de uma LISTA de arquivos a um painel; pergunta se houver colisões
  // % de fragmentação de uma lista de arquivos (transições não-contíguas / total).
  const fragPercent = (files: any[]) => {
    let bad = 0, tot = 0;
    for (const f of files) { const c = f.granuleChain || []; for (let i = 1; i < c.length; i++) { tot++; if (c[i] !== c[i - 1] + 1) bad++; } }
    return tot ? Math.round((bad / tot) * 100) : 0;
  };

  // Pausa a animação e espera a escolha do usuário (cancelar tudo x finalizar arquivo atual).
  const waitForDefragDecision = async (): Promise<'all' | 'current'> => {
    setDefragRun((s) => s && { ...s, status: 'confirm' });
    while (defragCtl.current.decision === null) await sleep(80);
    const d = defragCtl.current.decision;
    defragCtl.current.pause = false; defragCtl.current.decision = null;
    setDefragRun((s) => s && { ...s, status: 'running' });
    return d as 'all' | 'current';
  };

  // Desfragmentação ANIMADA (nostálgica): processa arquivo-por-arquivo IN-PLACE (realoca cada um
  // num trecho contíguo via defragFileInPlace), com delays imitando um disquete físico. A imagem é
  // em memória — a cada passo fica válida (suporta parar no meio, mantendo o que já foi feito).
  const isChainFrag = (c: number[]) => { for (let i = 1; i < (c || []).length; i++) if (c[i] !== c[i - 1] + 1) return true; return false; };
  const startDefragAnimation = async (which: 'A' | 'B', order: 'dir' | 'alpha' | 'size') => {
    if (dragonReadOnlyGuard(which)) return;
    const pane = getPane(which);
    if (!pane || !pane.files.length) return;
    const diskName = pane.fileName || which;
    let working = new Uint8Array(pane.buffer);
    let parsed = await window.cocoApi.readDskDirectory(working);
    if (!parsed.success) { addLog(`DSK: ${parsed.error}`, `DSK: ${parsed.error}`, 'error'); return; }
    if (typeof window.cocoApi.dskDefragFile !== 'function') {
      addLog('Reinicie o app: a função de desfragmentação (preload) não está carregada.', 'Restart the app: the defrag function (preload) is not loaded.', 'error');
      return;
    }
    const startFrag = fragPercent(parsed.files);
    const ordered = [...parsed.files];
    if (order === 'alpha') ordered.sort((a: any, b: any) => a.fullName.localeCompare(b.fullName));
    else if (order === 'size') ordered.sort((a: any, b: any) => (b.totalSize || 0) - (a.totalSize || 0));
    const totalWork = ordered.reduce((a: number, f: any) => a + (f.granuleChain?.length || 0), 0) || 1;
    defragCtl.current = { pause: false, decision: null };
    pushDskUndo();
    setImageBusy(true);
    setDefragRun({ which, diskName, files: parsed.files, totalGranules: parsed.totalGranules, currentName: '', doneGranules: 0, totalWork, status: 'spinup', startFrag, endFrag: startFrag, processed: 0, skipped: 0 });
    // Espera interrompível: dorme em fatias de 40ms e sai cedo se "Cancelar" for clicado.
    const waitChunk = async (ms: number) => { let w = 0; while (w < ms && !defragCtl.current.pause) { const s = Math.min(40, ms - w); await sleep(s); w += s; } };
    const pauseCheck = async (): Promise<'all' | 'current' | null> => (defragCtl.current.pause ? await waitForDefragDecision() : null);

    let done = 0, processed = 0, skipped = 0, aborted = false, stopAfter = false;
    try {
      await waitChunk(DEFRAG_SPINUP_MS);
      setDefragRun((s) => s && { ...s, status: 'running' });
      { const d = await pauseCheck(); if (d === 'all') aborted = true; else if (d === 'current') stopAfter = true; }
      for (const f of ordered) {
        if (aborted || stopAfter) break;
        const rp = await window.cocoApi.readDskDirectory(working); // posições podem ter mudado
        const entry = rp.success ? rp.files.find((x: any) => x.fullName === f.fullName) : null;
        if (!entry) continue;
        const frag = isChainFrag(entry.granuleChain);
        setDefragRun((s) => s && { ...s, currentName: entry.fullName });
        await waitChunk(DEFRAG_SEEK_MS);
        { const d = await pauseCheck(); if (d === 'all') { aborted = true; break; } if (d === 'current') stopAfter = true; }
        if (!stopAfter) {
          for (let g = 0; g < entry.granuleChain.length; g++) {
            await waitChunk(DEFRAG_GRAN_MS);
            done++;
            setDefragRun((s) => s && { ...s, doneGranules: done });
            const d = await pauseCheck();
            if (d === 'all') { aborted = true; break; }
            if (d === 'current') { stopAfter = true; break; }
          }
        }
        if (aborted) break; // "cancelar tudo": arquivo atual NÃO realocado → descarta
        if (frag) { // "finalizar arquivo atual" ainda conclui o arquivo em andamento
          const res = await window.cocoApi.dskDefragFile(working, entry);
          if (res.success) { working = res.image; processed++; const np = await window.cocoApi.readDskDirectory(working); if (np.success) setDefragRun((s) => s && { ...s, files: np.files, processed }); }
          else { skipped++; setDefragRun((s) => s && { ...s, skipped }); }
        }
        if (stopAfter) break;
      }
      if (aborted) { // cancelar tudo: descarta (painel intacto)
        setDefragRun((s) => s && { ...s, status: 'cancelled' });
        addLog(`Desfragmentação do painel ${which} cancelada.`, `Pane ${which} defragmentation cancelled.`, 'info');
        return;
      }
      if (order === 'alpha') { const sr = await window.cocoApi.dskSortDirectory(working); if (sr.success) working = sr.image; }
      await refreshPane(which, working);
      setSelectedDsk(null);
      const fp = await window.cocoApi.readDskDirectory(working);
      const endFrag = fp.success ? fragPercent(fp.files) : 0;
      setDefragRun((s) => s && { ...s, files: fp.success ? fp.files : s.files, endFrag, status: 'done', currentName: '', processed, skipped });
      addLog(`Painel ${which} desfragmentado: ${processed} arquivo(s) movido(s)${skipped ? `, ${skipped} sem espaço contíguo` : ''}, fragmentação ${startFrag}% → ${endFrag}%. Lembre-se de salvar.`,
        `Pane ${which} defragmented: ${processed} file(s) moved${skipped ? `, ${skipped} without contiguous room` : ''}, fragmentation ${startFrag}% → ${endFrag}%. Remember to save.`, 'success');
    } catch (err: any) {
      addLog(`Erro na desfragmentação: ${err?.message || err}`, `Defragment error: ${err?.message || err}`, 'error');
      setDefragRun((s) => s && { ...s, status: 'cancelled' }); // permite fechar com OK
    } finally {
      setImageBusy(false);
    }
  };

  // Desfragmenta APENAS o arquivo selecionado (realoca num trecho contíguo). Se não couber num vão
  // contíguo (espaço livre fragmentado), avisa e sugere a desfragmentação total.
  const handleDefragFile = async (which: 'A' | 'B', entry: any) => {
    if (dragonReadOnlyGuard(which)) return;
    const pane = getPane(which);
    if (!pane || !entry) return;
    try {
      setImageBusy(true);
      pushDskUndo();
      const res = await window.cocoApi.dskDefragFile(pane.buffer, entry);
      if (!res.success) {
        addLog(`Não foi possível desfragmentar "${entry.fullName}": sem vão livre contíguo. Use a desfragmentação total.`,
          `Could not defragment "${entry.fullName}": no contiguous free run. Use full defragment.`, 'warn');
        return;
      }
      await refreshPane(which, res.image);
      addLog(`Arquivo "${entry.fullName}" desfragmentado no painel ${which}. Lembre-se de salvar.`,
        `File "${entry.fullName}" defragmented in pane ${which}. Remember to save.`, 'success');
    } catch (err: any) {
      addLog(`Erro ao desfragmentar arquivo: ${err.message}`, `File defragment error: ${err.message}`, 'error');
    } finally { setImageBusy(false); }
  };

  const beginAddBatch = (which: 'A' | 'B', files: any[]) => {
    if (!files.length) return;
    if (dragonReadOnlyGuard(which)) return;
    const pane = getPane(which);
    // Painel de destino vazio → doAddBatch cria uma imagem nova e adiciona (sem colisões).
    if (!pane) { doAddBatch(which, files, 'add'); return; }
    const collisions = files.filter((file: any) =>
      pane.files.some((f: any) => `${f.name}.${f.ext}`.toUpperCase() === `${file.name}.${file.ext}`.toUpperCase()));
    if (collisions.length > 0) {
      setDskCollision({ which, files, collisionCount: collisions.length });
    } else {
      doAddBatch(which, files, 'add');
    }
  };

  const doAddBatch = async (which: 'A' | 'B', files: any[], mode: 'add' | 'overwrite' | 'rename') => {
    setDskCollision(null);
    const pane = getPane(which);
    pushDskUndo();
    let buffer: Uint8Array;
    if (pane) {
      buffer = pane.buffer;
    } else {
      // Painel vazio: cria uma imagem .dsk nova para receber o(s) arquivo(s) (automatiza o passo manual).
      const blank = await window.cocoApi.dskNewBlank();
      if (!blank.success) { addLog(`Novo disco: ${blank.error}`, `New disk: ${blank.error}`, 'error'); return; }
      buffer = new Uint8Array(blank.image);
      addLog(`Imagem nova criada no painel ${which} para receber o(s) arquivo(s).`, `New image created in pane ${which} to receive the file(s).`, 'info');
    }
    let added = 0;
    try {
      for (const file of files) {
        const dir = await window.cocoApi.readDskDirectory(buffer);
        if (!dir.success) { addLog(`DSK: ${dir.error}`, `DSK: ${dir.error}`, 'error'); break; }
        const existing = dir.files.find((f: any) => `${f.name}.${f.ext}`.toUpperCase() === `${file.name}.${file.ext}`.toUpperCase());
        let name = file.name;
        if (existing) {
          if (mode === 'overwrite') {
            const del = await window.cocoApi.dskDeleteFile(buffer, existing);
            if (!del.success) { addLog(`DSK: ${del.error}`, `DSK: ${del.error}`, 'error'); continue; }
            buffer = del.image;
          } else {
            name = uniqueNameFromFiles(dir.files, file.name, file.ext); // rename (e fallback de 'add')
          }
        }
        const res = await window.cocoApi.dskAddBytes(buffer, name, file.ext, file.fileType, file.asciiFlag || 0, file.data);
        if (!res.success) { addLog(`DSK add: ${res.error}`, `DSK add: ${res.error}`, 'error'); continue; }
        buffer = res.image;
        added++;
      }
      await refreshPane(which, buffer);
      addLog(`${added} arquivo(s) gravado(s) no painel ${which}. Lembre-se de salvar a imagem.`, `${added} file(s) written to pane ${which}. Remember to save the image.`, 'success');

      // Recortar: apaga as origens após colar
      const cuts = files.filter((f: any) => f.cut && f.sourcePane && f.sourceEntry);
      if (cuts.length) {
        const byPane: Record<string, any[]> = {};
        cuts.forEach((f: any) => { (byPane[f.sourcePane] = byPane[f.sourcePane] || []).push(f.sourceEntry); });
        for (const sp of Object.keys(byPane)) {
          const src = getPane(sp as 'A' | 'B');
          if (!src) continue;
          let sb: Uint8Array = src.buffer;
          for (const ent of byPane[sp]) {
            const del = await window.cocoApi.dskDeleteFile(sb, ent);
            if (del.success) sb = del.image;
          }
          await refreshPane(sp as 'A' | 'B', sb);
        }
        setDskClipboard(null);
      }
    } catch (err: any) { addLog(`DSK add: ${err.message}`, `DSK add: ${err.message}`, 'error'); }
  };

  const handleDskCopy = async (cut: boolean) => {
    if (!selectedDsk || !selectedDsk.entries.length) { addLog('Selecione um ou mais arquivos numa imagem.', 'Select one or more files in an image.', 'warn'); return; }
    const pane = getPane(selectedDsk.pane);
    if (!pane) return;
    try {
      const files: any[] = [];
      for (const entry of selectedDsk.entries) {
        const res = await window.cocoApi.dskExtractRaw(pane.buffer, entry);
        if (!res.success) { addLog(`DSK copy: ${res.error}`, `DSK copy: ${res.error}`, 'error'); continue; }
        files.push({ name: entry.name, ext: entry.ext, fileType: entry.fileType, asciiFlag: entry.asciiFlag, data: res.data, sourcePane: selectedDsk.pane, sourceEntry: entry });
      }
      setDskClipboard({ files, cut });
      addLog(`${cut ? 'Recortado(s)' : 'Copiado(s)'}: ${files.length} arquivo(s).`, `${cut ? 'Cut' : 'Copied'}: ${files.length} file(s).`, 'info');
    } catch (err: any) { addLog(`DSK copy: ${err.message}`, `DSK copy: ${err.message}`, 'error'); }
  };

  const handleDskPaste = () => {
    if (!dskClipboard || !dskClipboard.files.length) { addLog('Nada na área de transferência.', 'Clipboard is empty.', 'warn'); return; }
    beginAddBatch(activePane, dskClipboard.files.map((f: any) => ({ ...f, cut: dskClipboard.cut })));
  };

  const handleDskDelete = async () => {
    if (!selectedDsk || !selectedDsk.entries.length) { addLog('Selecione arquivo(s) para excluir.', 'Select file(s) to delete.', 'warn'); return; }
    if (dragonReadOnlyGuard(selectedDsk.pane)) return;
    const pane = getPane(selectedDsk.pane);
    if (!pane) return;
    pushDskUndo();
    try {
      let buffer: Uint8Array = pane.buffer;
      for (const entry of selectedDsk.entries) {
        const res = await window.cocoApi.dskDeleteFile(buffer, entry);
        if (res.success) buffer = res.image;
      }
      const n = selectedDsk.entries.length;
      const sp = selectedDsk.pane;
      await refreshPane(sp, buffer);
      setSelectedDsk(null);
      addLog(`${n} arquivo(s) excluído(s) do painel ${sp}.`, `${n} file(s) deleted from pane ${sp}.`, 'warn');
    } catch (err: any) { addLog(`DSK delete: ${err.message}`, `DSK delete: ${err.message}`, 'error'); }
  };

  const handleDskInject = async () => {
    if (!getPane(activePane)) { addLog('Abra ou crie uma imagem no painel ativo primeiro.', 'Open or create an image in the active pane first.', 'warn'); return; }
    try {
      const res = await window.cocoApi.pickCocoFile();
      if (res.cancelled) return;
      if (!res.success) { addLog(`Inject: ${res.error}`, `Inject: ${res.error}`, 'error'); return; }
      if ((res.ext || '').toLowerCase() === 'cas') {
        const items = await casToInjectables(new Uint8Array(res.data));
        if (items.length) beginAddBatch(activePane, items);
        return;
      }
      beginAddBatch(activePane, [{ name: res.name, ext: res.ext, fileType: res.fileType, asciiFlag: res.asciiFlag, data: res.data }]);
    } catch (err: any) { addLog(`Inject: ${err.message}`, `Inject: ${err.message}`, 'error'); }
  };

  // Ordena alfabeticamente (A→Z) o diretório da imagem no painel ativo
  const handleDskSort = async () => {
    if (dragonReadOnlyGuard(activePane)) return;
    const pane = getPane(activePane);
    if (!pane) { addLog('Painel ativo sem imagem.', 'Active pane has no image.', 'warn'); return; }
    if (!pane.files.length) { addLog('Não há arquivos para ordenar.', 'No files to sort.', 'warn'); return; }
    pushDskUndo();
    try {
      const res = await window.cocoApi.dskSortDirectory(pane.buffer);
      if (!res.success) { addLog(`DSK Ordenar: ${res.error}`, `DSK Sort: ${res.error}`, 'error'); return; }
      if (selectedDsk?.pane === activePane) setSelectedDsk(null);
      await refreshPane(activePane, res.image);
      addLog(
        `Diretório do painel ${activePane} ordenado de A a Z. Lembre-se de salvar a imagem.`,
        `Pane ${activePane} directory sorted A to Z. Remember to save the image.`,
        'success'
      );
    } catch (err: any) { addLog(`DSK Ordenar: ${err.message}`, `DSK Sort: ${err.message}`, 'error'); }
  };

  // Ordena alfabeticamente TODOS os discos de um contêiner multi-disco no painel ativo
  const handleDskSortAll = async () => {
    if (dragonReadOnlyGuard(activePane)) return;
    const pane = getPane(activePane);
    if (!pane) { addLog('Painel ativo sem imagem.', 'Active pane has no image.', 'warn'); return; }
    if (!pane.container) { addLog('Esta imagem não é um contêiner multi-disco.', 'This image is not a multi-disk container.', 'warn'); return; }
    pushDskUndo();
    try {
      const full = new Uint8Array(pane.container.full);
      let sorted = 0;
      for (let i = 0; i < pane.container.count; i++) {
        const slice = full.slice(i * STD_DISK, (i + 1) * STD_DISK);
        const res = await window.cocoApi.dskSortDirectory(slice);
        if (!res.success) { addLog(`DSK Ordenar (disco ${i}): ${res.error}`, `DSK Sort (disk ${i}): ${res.error}`, 'error'); continue; }
        full.set(res.image, i * STD_DISK);
        sorted++;
      }
      // Atualiza a visão do disco atualmente exibido a partir do contêiner já ordenado
      const idx = pane.container.index;
      const cur = full.slice(idx * STD_DISK, (idx + 1) * STD_DISK);
      const dir = await window.cocoApi.readDskDirectory(cur);
      if (selectedDsk?.pane === activePane) setSelectedDsk(null);
      setPane(activePane, {
        ...pane,
        buffer: cur,
        size: cur.length,
        files: dir.success ? dir.files : pane.files,
        freeGranules: dir.success ? dir.freeGranules : pane.freeGranules,
        totalGranules: dir.success ? dir.totalGranules : pane.totalGranules,
        container: { ...pane.container, full }
      });
      addLog(
        `${sorted} disco(s) do contêiner ordenados de A a Z no painel ${activePane}. Lembre-se de salvar a imagem.`,
        `${sorted} container disk(s) sorted A to Z in pane ${activePane}. Remember to save the image.`,
        'success'
      );
    } catch (err: any) { addLog(`DSK Ordenar Todos: ${err.message}`, `DSK Sort All: ${err.message}`, 'error'); }
  };

  // Copia o conteúdo do Painel A para o Painel B. Em contêiner, copia apenas o disco
  // ATIVO (a fatia atual), gerando no B uma imagem .dsk avulsa de um único disco.
  const handleCopyPaneAToB = async () => {
    const src = getPane('A');
    if (!src) { addLog('Painel A está vazio.', 'Pane A is empty.', 'warn'); return; }
    pushDskUndo();
    try {
      const bytes = new Uint8Array(src.buffer); // disco ativo (já fatiado p/ contêiner)
      let name = src.fileName || 'PAINEL_A.DSK';
      if (src.container) {
        const base = name.replace(/\.dsk$/i, '');
        name = `${base}_disco${src.container.index}.dsk`;
      }
      if (selectedDsk?.pane === 'B') setSelectedDsk(null);
      const ok = await loadPaneFromBuffer('B', bytes, name);
      if (!ok) return;
      markDirty('B'); // imagem avulsa nova no painel B (ainda não salva)
      setActivePane('B');
      addLog(
        src.container
          ? `Disco ${src.container.index} do contêiner (Painel A) copiado para o Painel B como imagem avulsa "${name}". Salve para gerar um .dsk de um único disco.`
          : `Conteúdo do Painel A copiado para o Painel B. Lembre-se de salvar a imagem.`,
        src.container
          ? `Disk ${src.container.index} of the container (Pane A) copied to Pane B as a standalone image "${name}". Save to produce a single-disk .dsk.`
          : `Pane A content copied to Pane B. Remember to save the image.`,
        'success'
      );
    } catch (err: any) { addLog(`Painel A→B: ${err.message}`, `Pane A→B: ${err.message}`, 'error'); }
  };

  // Abre QUALQUER imagem no painel: .dsk simples, contêiner DriveWire, MiniIDE ou CoCoSDC.
  // MiniIDE/CoCoSDC viram um contêiner de ARQUIVO (lê cada disco sob demanda, sem recarregar).
  const handleImageImport = async (which: 'A' | 'B') => {
    setImageBusy(true);
    try {
      const res = await window.cocoApi.imageAnalyze();
      if (res?.cancelled) return;
      if (!res?.success) { addLog(`Imagem: ${res?.error}`, `Image: ${res?.error}`, 'error'); return; }

      if (res.kind === 'dsk') {
        // .dsk simples ou contêiner DriveWire (em memória; passa pelo guard de contêiner)
        const ex = await window.cocoApi.imageExtract(res.filePath, { kind: 'dsk' });
        if (ex.success) { if (selectedDsk?.pane === which) setSelectedDsk(null); await loadPaneFromBuffer(which, new Uint8Array(ex.image), res.fileName, 0, res.filePath); setActivePane(which); }
        else addLog(`Imagem: ${ex.error}`, `Image: ${ex.error}`, 'error');
        return;
      }

      // MiniIDE / CoCoSDC: contêiner de arquivo navegável
      if (!res.entries.length) { addLog('Nenhum disco encontrado na imagem.', 'No disk found in the image.', 'warn'); return; }
      const ex = await window.cocoApi.imageExtract(res.filePath, res.entries[0].locator);
      if (!ex.success) { addLog(`Imagem: ${ex.error}`, `Image: ${ex.error}`, 'error'); return; }
      const buf = new Uint8Array(ex.image);
      const dir = await window.cocoApi.readDskDirectory(buf);
      if (!dir.success) { addLog(`Imagem: ${dir.error}`, `Image: ${dir.error}`, 'error'); return; }
      if (selectedDsk?.pane === which) setSelectedDsk(null);
      setPane(which, {
        buffer: buf, fileName: res.entries[0].label, size: buf.length,
        files: dir.files, freeGranules: dir.freeGranules, totalGranules: dir.totalGranules,
        container: { source: 'file', kind: res.kind, fileName: res.fileName, filePath: res.filePath, entries: res.entries, count: res.entries.length, index: 0 },
      });
      clearDirty(which);
      setActivePane(which);
      const noun = res.kind === 'cocosdc' ? (currentLang === 'pt-br' ? '.dsk' : '.dsk') : (currentLang === 'pt-br' ? 'discos' : 'disks');
      addLog(`${res.kind === 'cocosdc' ? 'CoCoSDC' : 'MiniIDE'} "${res.fileName}": ${res.entries.length} ${noun}. Navegue pelo seletor do painel ${which} (◀ ▶ ou 🔍 Buscar).`,
             `${res.kind === 'cocosdc' ? 'CoCoSDC' : 'MiniIDE'} "${res.fileName}": ${res.entries.length} ${noun}. Navigate with the pane ${which} selector (◀ ▶ or 🔍 Search).`, 'success');
    } catch (err: any) { addLog(`Imagem: ${err.message}`, `Image: ${err.message}`, 'error'); }
    finally { setImageBusy(false); setImageProgress(null); }
  };

  // XRoar deduz o formato do disco pela EXTENSÃO do nome do arquivo na sua VFS.
  // Em contêiner (DriveWire/MiniIDE/CoCoSDC) o pane.fileName é um rótulo de disco
  // (sem .dsk, às vezes com espaços/":"), o que faz o XRoar não reconhecer o disco -> erro de I/O.
  // Normaliza para um nome .dsk válido (o buffer já é o disco único de 160 KB).
  const toXroarDiskName = (fn?: string): string => {
    const base = (fn || 'disk')
      .replace(/\.(dsk|vdk|jvc|dmk)$/i, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'disk';
    return `${base}.dsk`;
  };

  // Envia o disco do painel ativo para o emulador XRoar (drive 0) e abre a aba
  const handleTestInXroar = () => {
    const pane = getPane(activePane);
    if (!pane) { addLog('Painel ativo sem imagem.', 'Active pane has no image.', 'warn'); return; }
    setXroarLoad({ name: toXroarDiskName(pane.fileName), ext: 'dsk', data: new Uint8Array(pane.buffer), key: Date.now(), drive: 0 });
    setActiveTab('xroar');
    addLog(`Enviando "${pane.fileName}" para o XRoar (drive 0).`, `Sending "${pane.fileName}" to XRoar (drive 0).`, 'info');
  };

  // Duplo-clique num arquivo: monta o disco do painel no XRoar (drive 0) e AUTO-RODA o arquivo
  // (RUN para BASIC tipo 0; LOADM:EXEC para código de máquina). Usa o buffer atual (inclui edições).
  const handleRunFileInXroar = (which: 'A' | 'B', f: any) => {
    const pane = getPane(which);
    if (!pane) return;
    const cmd = f.fileType === 0 ? `RUN"${f.name}"\r` : `LOADM"${f.name}":EXEC\r`;
    setActivePane(which);
    const diskName = toXroarDiskName(pane.fileName);
    setXroarLoad({ name: diskName, ext: 'dsk', data: new Uint8Array(pane.buffer), key: Date.now(), drive: 0, runCmd: cmd });
    setActiveTab('xroar');
    // Diagnóstico: tamanho do disco (deve ser 161280), tipo do arquivo e comando exato enviado.
    const dbg = `disco=${diskName} ${pane.buffer.length}B${pane.container ? ` (contêiner ${pane.container.kind} #${pane.container.index})` : ''} | ${f.fullName} type=${f.fileType} | cmd=${cmd.replace(/\r/g, '\\r')}`;
    addLog(`Rodando "${f.fullName}" no XRoar (drive 0)… [${dbg}]`, `Running "${f.fullName}" in XRoar (drive 0)… [${dbg}]`, 'info');
  };

  // Aba BASIC: injeta o programa digitado no XRoar (via type_string). reset=true reinicia
  // o emulador para garantir o prompt OK mesmo se algo estiver rodando.
  const handleBasicRun = (program: string, reset: boolean) => {
    if (!program.trim()) { addLog('Editor BASIC vazio.', 'BASIC editor is empty.', 'warn'); return; }
    setActiveTab('xroar');
    setXroarType({ text: program, key: Date.now(), reset });
    addLog(
      reset ? 'BASIC → XRoar: reiniciando e digitando o programa…' : 'BASIC → XRoar: digitando o programa no prompt…',
      reset ? 'BASIC → XRoar: resetting and typing the program…' : 'BASIC → XRoar: typing the program at the prompt…',
      'info'
    );
  };

  // Converte o texto do editor para bytes ASCII BASIC (maiúsculas, linhas terminadas em CR 0x0D),
  // como um SAVE"…",A faria no CoCo.
  const basicTextToAsciiBytes = (program: string): Uint8Array => {
    let ascii = program.toUpperCase().replace(/\r\n/g, '\n').replace(/\n/g, '\r');
    if (ascii.length && !ascii.endsWith('\r')) ascii += '\r';
    const data = new Uint8Array(ascii.length);
    for (let i = 0; i < ascii.length; i++) data[i] = ascii.charCodeAt(i) & 0xFF;
    return data;
  };

  // Lê bytes de um arquivo .BAS e devolve o texto editável. Tokenizado (binário) não é suportado.
  const decodeBasToText = (bytes: Uint8Array, asciiFlag?: number): { text: string; tokenized: boolean } => {
    let printable = 0, total = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0x00) continue; // padding / terminador
      total++;
      if ((b >= 0x20 && b < 0x7F) || b === 0x0D || b === 0x0A || b === 0x09) printable++;
    }
    const ratio = total ? printable / total : 1;
    const tokenized = (asciiFlag === 0 && ratio < 0.95) || ratio < 0.85;
    if (tokenized) {
      // Tokenizado → tenta detokenizar (Color/Extended/Disk BASIC). Se conseguir, vira texto editável.
      const d = detokenizeBasic(bytes);
      if (d.ok) return { text: d.text.toUpperCase(), tokenized: false };
      return { text: '', tokenized: true };
    }
    let s = '';
    for (let i = 0; i < bytes.length; i++) { const b = bytes[i]; if (b !== 0x00) s += String.fromCharCode(b); }
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').toUpperCase().replace(/\s+$/, '');
    return { text: s, tokenized: false };
  };

  // Aba BASIC: grava o texto como .BAS ASCII (tipo 0, flag 0xFF) num painel DSK (A/B). O CoCo
  // carrega esse formato com LOAD"NOME" (re-tokeniza na carga) — sem precisar tokenizar aqui.
  // Se o painel de destino já tiver um disco com arquivos, pede confirmação antes.
  const handleBasicSaveToDisk = (name: string, program: string) => {
    if (!program.trim()) { addLog('Editor BASIC vazio.', 'BASIC editor is empty.', 'warn'); return; }
    const pane = getPane(basicPane);
    if (pane && pane.files && pane.files.length) {
      setBasicSaveConfirm({ name, program, pane: basicPane });
    } else {
      doBasicSaveToDisk(name, program, basicPane);
    }
  };
  const doBasicSaveToDisk = (name: string, program: string, pane: 'A' | 'B') => {
    setBasicSaveConfirm(null);
    beginAddBatch(pane, [{ name, ext: 'BAS', fileType: 0, asciiFlag: 0xFF, data: basicTextToAsciiBytes(program) }]);
  };

  // Aba BASIC: salva o programa como ARQUIVO DE TEXTO (.bas) no sistema de arquivos.
  const handleBasicSaveTextFile = async (name: string, program: string) => {
    if (!program.trim()) { addLog('Editor BASIC vazio.', 'BASIC editor is empty.', 'warn'); return; }
    try {
      const data = basicTextToAsciiBytes(program);
      const res = await window.cocoApi.saveCartridgeFile(
        data, `${name}.bas`,
        currentLang === 'pt-br' ? 'Salvar programa BASIC (texto)' : 'Save BASIC program (text)',
        [{ name: 'BASIC Text (.bas)', extensions: ['bas'] }, { name: 'Text (.txt)', extensions: ['txt'] }, { name: 'All Files', extensions: ['*'] }]
      );
      if (res.success) addLog(`Programa BASIC salvo em: ${res.filePath}`, `BASIC program saved at: ${res.filePath}`, 'success');
      else if (res.error) addLog(`Salvar .BAS: ${res.error}`, `Save .BAS: ${res.error}`, 'error');
    } catch (err: any) { addLog(`Salvar .BAS: ${err.message}`, `Save .BAS: ${err.message}`, 'error'); }
  };

  // Carrega texto no editor BASIC; se o editor já tiver conteúdo, pede confirmação (apaga o atual).
  // source != null quando o programa veio de um arquivo num DSK (habilita o "Salvar" in-place).
  // Nome sugerido a partir da origem (arquivo do painel ou do sistema) → preenche o campo PRG-NOME.
  const suggestNameFrom = (source: BasicSrc | null, label: string): string => {
    const base = source?.entry?.name ? String(source.entry.name) : label.replace(/\.[^.]*$/, '');
    return base.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  };
  const requestLoadBasic = (newText: string, label: string, source: BasicSrc | null = null) => {
    const name = suggestNameFrom(source, label);
    if (basicText.trim()) { setBasicOpenPending({ text: newText, label, source, name }); return; }
    setBasicText(newText);
    setBasicSource(source);
    if (name) setBasicName(name);
    setActiveTab('basic');
    addLog(`"${label}" aberto no editor BASIC.`, `"${label}" opened in the BASIC editor.`, 'success');
  };
  const applyBasicOpen = () => {
    if (!basicOpenPending) return;
    setBasicText(basicOpenPending.text);
    setBasicSource(basicOpenPending.source);
    if (basicOpenPending.name) setBasicName(basicOpenPending.name);
    setActiveTab('basic');
    addLog(`"${basicOpenPending.label}" aberto no editor BASIC (conteúdo anterior substituído).`, `"${basicOpenPending.label}" opened in the BASIC editor (previous content replaced).`, 'success');
    setBasicOpenPending(null);
  };

  // Atualiza o arquivo .BAS DENTRO da imagem DSK de onde foi aberto (in-place). Apaga a versão
  // antiga (libera granules na FAT) e regrava a nova (aloca granules livres) — outros arquivos
  // do disco ficam intactos. Se faltar espaço, nada é comitado (o original é preservado).
  const handleBasicUpdateInDsk = async () => {
    if (!basicSource) return;
    const { pane: which, entry } = basicSource;
    const pane = getPane(which);
    if (!pane) { addLog(`Painel ${which} de origem não está mais carregado.`, `Source pane ${which} is no longer loaded.`, 'warn'); return; }
    if (!basicText.trim()) { addLog('Editor BASIC vazio.', 'BASIC editor is empty.', 'warn'); return; }
    // A imagem/disco do painel mudou desde que o arquivo foi aberto?
    const diskChanged = (pane.fileName !== basicSource.diskName) || ((pane.container?.index ?? -1) !== (basicSource.containerIndex ?? -1));
    if (diskChanged) { setBasicUpdateConfirm({ which, name: entry.fullName, reason: 'diskChanged' }); return; }
    // O arquivo ainda existe no disco atual?
    try {
      const dir = await window.cocoApi.readDskDirectory(pane.buffer);
      const exists = dir.success && dir.files.some((f: any) => `${f.name}.${f.ext}`.toUpperCase() === `${entry.name}.${entry.ext}`.toUpperCase());
      if (!exists) { setBasicUpdateConfirm({ which, name: entry.fullName, reason: 'missing' }); return; }
    } catch { setBasicUpdateConfirm({ which, name: entry.fullName, reason: 'missing' }); return; }
    doBasicUpdateCommit(which, entry);
  };

  // Grava de fato a versão atual do editor sobre o arquivo de origem (delete + add).
  const doBasicUpdateCommit = async (which: 'A' | 'B', entry: any) => {
    setBasicUpdateConfirm(null);
    const pane = getPane(which);
    if (!pane) return;
    pushDskUndo();
    try {
      const data = basicTextToAsciiBytes(basicText);
      const del = await window.cocoApi.dskDeleteFile(pane.buffer, entry);
      const buffer = del.success ? del.image : pane.buffer;
      const res = await window.cocoApi.dskAddBytes(buffer, entry.name, entry.ext, entry.fileType ?? 0, 0xFF, data);
      if (res.success) {
        await refreshPane(which, res.image);
        markDirty(which);
        addLog(`"${entry.fullName}" atualizado na imagem do Painel ${which}. Lembre-se de salvar a imagem (.DSK).`,
               `"${entry.fullName}" updated in Pane ${which}'s image. Remember to save the .DSK image.`, 'success');
      } else {
        // dskAddBytes operou num buffer local; como NÃO chamamos refreshPane, o painel mantém o original.
        addLog(`Atualizar "${entry.fullName}": ${res.error} (provável falta de espaço — o arquivo original foi preservado).`,
               `Update "${entry.fullName}": ${res.error} (likely out of space — the original file was preserved).`, 'error');
      }
    } catch (err: any) { addLog(`Atualizar BAS: ${err.message}`, `Update BAS: ${err.message}`, 'error'); }
  };

  // Aba BASIC: abre um arquivo de texto (.bas/.txt) do sistema de arquivos no editor.
  const handleBasicOpenTextFile = async () => {
    try {
      const f = await window.cocoApi.selectFile();
      if (!f) return;
      const { text, tokenized } = decodeBasToText(new Uint8Array(f.buffer), 0xFF);
      if (tokenized) { addLog(`"${f.fileName}" não parece texto (.bas tokenizado/binário). Abra um .BAS em ASCII.`, `"${f.fileName}" is not text (tokenized/binary .bas). Open an ASCII .BAS.`, 'warn'); return; }
      // Arquivo do sistema de arquivos não tem origem em DSK → sem "Salvar" in-place.
      requestLoadBasic(text, f.fileName || 'arquivo.bas', null);
    } catch (err: any) { addLog(`Abrir .BAS: ${err.message}`, `Open .BAS: ${err.message}`, 'error'); }
  };

  // DSK: botão "Editar" — abre o .BAS selecionado no editor BASIC (somente formato ASCII/texto).
  const handleDskEditBas = async () => {
    if (!selectedDsk || !selectedDsk.entries.length) { addLog('Selecione um arquivo .BAS.', 'Select a .BAS file.', 'warn'); return; }
    const entry = selectedDsk.entries[0];
    if ((entry.ext || '').toUpperCase() !== 'BAS') { addLog('Selecione um arquivo .BAS para editar.', 'Select a .BAS file to edit.', 'warn'); return; }
    const pane = getPane(selectedDsk.pane);
    if (!pane) return;
    try {
      const res = await window.cocoApi.dskExtractRaw(pane.buffer, entry);
      if (!res.success) { addLog(`Editar BAS: ${res.error}`, `Edit BAS: ${res.error}`, 'error'); return; }
      const { text, tokenized } = decodeBasToText(new Uint8Array(res.data), entry.asciiFlag);
      if (tokenized) {
        addLog(`"${entry.fullName}" está em formato TOKENIZADO — o editor abre apenas .BAS em ASCII/texto por enquanto. No CoCo, salve como ASCII (SAVE"NOME",A) e tente de novo.`,
               `"${entry.fullName}" is TOKENIZED — the editor only opens ASCII/text .BAS for now. On the CoCo, save it as ASCII (SAVE"NAME",A) and retry.`, 'warn');
        return;
      }
      requestLoadBasic(text, entry.fullName, { pane: selectedDsk.pane, entry, diskName: pane.fileName, containerIndex: pane.container?.index });
    } catch (err: any) { addLog(`Editar BAS: ${err.message}`, `Edit BAS: ${err.message}`, 'error'); }
  };

  // Limpa um painel (volta ao estado de app recém-aberto para aquele painel).
  const handleClearPane = (which: 'A' | 'B') => {
    setPane(which, null);
    if (selectedDsk?.pane === which) setSelectedDsk(null);
    clearDirty(which);
    addLog(`Painel ${which} limpo.`, `Pane ${which} cleared.`, 'info');
  };

  // "Novo" disco: se o painel ativo já tem uma imagem carregada, confirma antes (vai descartá-la).
  const handleDskNew = () => {
    if (getPane(activePane)) { setDskNewConfirm(activePane); return; }
    doDskNew(activePane);
  };
  const doDskNew = async (which: 'A' | 'B') => {
    setDskNewConfirm(null);
    pushDskUndo();
    try {
      // A plataforma-alvo define o tipo do disco novo: CoCo → RS-DOS 35T; Dragon → Dragon DOS 40T.
      const isDragon = platform === 'dragon';
      const res = isDragon && typeof window.cocoApi.dskNewBlankDragon === 'function'
        ? await window.cocoApi.dskNewBlankDragon()
        : await window.cocoApi.dskNewBlank();
      if (!res.success) { addLog(`New disk: ${res.error}`, `New disk: ${res.error}`, 'error'); return; }
      const ext = isDragon ? 'VDK' : 'DSK';
      await loadPaneFromBuffer(which, new Uint8Array(res.image), which === 'A' ? `NOVO_A.${ext}` : `NOVO_B.${ext}`);
      markDirty(which); // disco novo ainda não salvo
      addLog(
        isDragon ? `Novo disco Dragon (40T) criado no painel ${which}.` : `Novo disco RS-DOS (35T) criado no painel ${which}.`,
        isDragon ? `New Dragon disk (40T) created in pane ${which}.` : `New RS-DOS disk (35T) created in pane ${which}.`,
        'success');
    } catch (err: any) { addLog(`New disk: ${err.message}`, `New disk: ${err.message}`, 'error'); }
  };

  // "Salvar como": abre o diálogo de Salvar e grava num arquivo escolhido (preserva o original).
  // Em imagem única, memoriza o caminho escolhido em sourcePath → o "Salvar" passa a sobrescrever ali.
  const handleDskSaveAs = async () => {
    const pane = getPane(activePane);
    if (!pane) { addLog('Painel ativo sem imagem.', 'Active pane has no image.', 'warn'); return; }
    try {
      // Para contêiner multi-disco, salva o arquivo inteiro (todos os discos); senão o disco único.
      const saveBuf = pane.container ? pane.container.full : pane.buffer;
      const r = await window.cocoApi.saveCartridgeFile(
        saveBuf, pane.fileName || 'disk.dsk',
        currentLang === 'pt-br' ? `Salvar imagem .DSK como… (painel ${activePane})` : `Save .DSK image as… (pane ${activePane})`,
        [{ name: 'RS-DOS Disk Image (.dsk)', extensions: ['dsk'] }, { name: 'All Files', extensions: ['*'] }]
      );
      if (r.success) {
        clearDirty(activePane);
        if (!pane.container && r.filePath) setPane(activePane, { ...getPane(activePane), sourcePath: r.filePath }); // futuras gravações sobrescrevem aqui
        addLog(`Imagem do painel ${activePane} salva em: ${r.filePath}${pane.container ? ` (contêiner com ${pane.container.count} discos)` : ''}`, `Pane ${activePane} image saved at: ${r.filePath}${pane.container ? ` (${pane.container.count}-disk container)` : ''}`, 'success');
      }
      else if (r.error) addLog(`Save: ${r.error}`, `Save: ${r.error}`, 'error');
    } catch (err: any) { addLog(`Save: ${err.message}`, `Save: ${err.message}`, 'error'); }
  };

  // "Salvar": sobrescreve o arquivo de origem (sem diálogo). Sem caminho conhecido (disco novo,
  // leitura GW, contêiner) → cai no "Salvar como".
  const handleDskSaveOverwrite = async () => {
    const pane = getPane(activePane);
    if (!pane) { addLog('Painel ativo sem imagem.', 'Active pane has no image.', 'warn'); return; }
    if (!pane.sourcePath || pane.container) { handleDskSaveAs(); return; }
    try {
      const r = await window.cocoApi.saveDskOverwrite(pane.sourcePath, pane.buffer);
      if (r.success) { clearDirty(activePane); addLog(`Alterações gravadas (sobrescrito): ${r.filePath}`, `Changes saved (overwritten): ${r.filePath}`, 'success'); }
      else addLog(`Salvar: ${r.error}`, `Save: ${r.error}`, 'error');
    } catch (err: any) { addLog(`Salvar: ${err.message}`, `Save: ${err.message}`, 'error'); }
  };

  // Drop externo num painel: .dsk abre a imagem; .bin/.bas injeta (aceita múltiplos)
  // Extrai TODOS os arquivos de um buffer .dsk (ciente de contêiner multi-disco)
  const extractAllFromDsk = async (bytes: Uint8Array): Promise<any[]> => {
    const DISK = 161280;
    const det = (bytes.length % DISK === 0 && bytes.length / DISK > 1)
      ? await window.cocoApi.dskDetectContainer(bytes, DISK) : { count: 1 };
    const isContainer = (det?.count ?? 1) > 1;
    const chunks: Uint8Array[] = isContainer
      ? Array.from({ length: bytes.length / DISK }, (_, i) => bytes.subarray(i * DISK, (i + 1) * DISK))
      : [bytes];
    const out: any[] = [];
    for (const chunk of chunks) {
      const dir = await window.cocoApi.readDskDirectory(chunk);
      if (!dir.success) continue;
      for (const entry of dir.files) {
        const raw = await window.cocoApi.dskExtractRaw(chunk, entry);
        if (raw.success) out.push({ name: entry.name, ext: entry.ext, fileType: entry.fileType, asciiFlag: entry.asciiFlag, data: raw.data });
      }
    }
    return out;
  };

  // Converte um .cas (fita) em arquivos prontos para injetar no .dsk:
  //  - código de máquina (tipo 2): embrulha o payload no formato DECB binário (.BIN: 0x00/len/load … 0xFF/exec)
  //  - BASIC (tipo 0) e dados (tipo 1): o payload já é o conteúdo de disco -> grava como está (.BAS/.DAT)
  const casToInjectables = async (bytes: Uint8Array): Promise<any[]> => {
    const r = await window.cocoApi.parseCasPayload(bytes);
    if (!r.success || !r.files?.length) {
      addLog(`CAS: ${r.error || 'nenhum arquivo na fita'}`, `CAS: ${r.error || 'no files on tape'}`, 'warn');
      return [];
    }
    const sanitize = (n: string, i: number) => ((n || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || `CAS${i}`.slice(0, 8));
    const wrapDecb = (payload: Uint8Array, load: number, exec: number): Uint8Array => {
      const len = payload.length;
      const out = new Uint8Array(5 + len + 5);
      out[0] = 0x00; out[1] = (len >> 8) & 0xFF; out[2] = len & 0xFF; out[3] = (load >> 8) & 0xFF; out[4] = load & 0xFF;
      out.set(payload, 5);
      const t = 5 + len;
      out[t] = 0xFF; out[t + 1] = 0x00; out[t + 2] = 0x00; out[t + 3] = (exec >> 8) & 0xFF; out[t + 4] = exec & 0xFF;
      return out;
    };
    return r.files.map((f: any, i: number) => {
      const payload = new Uint8Array(f.payload);
      if (f.fileType === 2) {
        return { name: sanitize(f.name, i), ext: 'BIN', fileType: 2, asciiFlag: 0, data: wrapDecb(payload, f.loadAddr, f.execAddr) };
      }
      return { name: sanitize(f.name, i), ext: f.fileType === 0 ? 'BAS' : 'DAT', fileType: f.fileType, asciiFlag: f.asciiFlag, data: payload };
    });
  };

  // Drop externo num painel:
  //  - painel VAZIO + .dsk  -> abre a imagem
  //  - painel COM imagem    -> importa os arquivos dos itens soltos (.dsk extrai seu conteúdo; .bin/.bas entram direto)
  const handleDskExternalDrop = (which: 'A' | 'B', e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fileList = e.dataTransfer.files;
    if (!fileList || fileList.length === 0) return;
    setActivePane(which);
    const arr = Array.from(fileList);

    // Painel sem imagem: um .dsk solto ABRE a imagem; outros arquivos caem no fluxo de
    // importação abaixo (que cria uma imagem .dsk nova automaticamente para recebê-los).
    if (!getPane(which)) {
      const dskFile = arr.find((f) => f.name.toLowerCase().endsWith('.dsk'));
      if (dskFile) {
        const reader = new FileReader();
        reader.onload = async () => {
          if (selectedDsk?.pane === which) setSelectedDsk(null);
          await loadPaneFromBuffer(which, new Uint8Array(reader.result as ArrayBuffer), dskFile.name);
        };
        reader.readAsArrayBuffer(dskFile);
        return;
      }
      // sem .dsk → segue para a importação (doAddBatch cria a imagem nova)
    }

    // Painel COM imagem: importa o conteúdo dos itens soltos para a imagem ativa
    const out: any[] = [];
    let pending = arr.length;
    const finish = () => {
      if (--pending > 0) return;
      if (out.length) {
        addLog(`Importando ${out.length} arquivo(s) para o painel ${which}…`, `Importing ${out.length} file(s) into pane ${which}…`, 'info');
        beginAddBatch(which, out);
      } else addLog('Nada para importar dos arquivos soltos.', 'Nothing to import from the dropped files.', 'warn');
    };
    arr.forEach((file) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const bytes = new Uint8Array(reader.result as ArrayBuffer);
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.dsk')) {
          out.push(...await extractAllFromDsk(bytes));
        } else if (lower.endsWith('.cas')) {
          out.push(...await casToInjectables(bytes));
        } else {
          const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
          const base = file.name.replace(/\.[^.]*$/, '');
          out.push({ name: base, ext, fileType: ext === 'bas' ? 0 : 2, asciiFlag: 0, data: bytes });
        }
        finish();
      };
      reader.onerror = () => finish();
      reader.readAsArrayBuffer(file);
    });
  };

  // Snapshot dos dois painéis antes de cada mutação (desfazer/refazer)
  const pushDskUndo = () => {
    setDskUndo(prev => [...prev, { A: paneA, B: paneB }].slice(-30));
    setDskRedo([]);
  };

  const handleDskUndo = () => {
    if (dskUndo.length === 0) return;
    const snap = dskUndo[dskUndo.length - 1];
    setDskRedo(r => [...r, { A: paneA, B: paneB }]);
    setDskUndo(u => u.slice(0, -1));
    setPaneA(snap.A); setPaneB(snap.B);
    setSelectedDsk(null);
    addLog('Desfazer (DSK).', 'Undo (DSK).', 'info');
  };

  const handleDskRedo = () => {
    if (dskRedo.length === 0) return;
    const snap = dskRedo[dskRedo.length - 1];
    setDskUndo(u => [...u, { A: paneA, B: paneB }]);
    setDskRedo(r => r.slice(0, -1));
    setPaneA(snap.A); setPaneB(snap.B);
    setSelectedDsk(null);
    addLog('Refazer (DSK).', 'Redo (DSK).', 'info');
  };

  // Drop de uma ou mais linhas arrastadas de um painel para o outro (cópia A↔B)
  const handleDskInternalDrop = async (targetWhich: 'A' | 'B', source: { pane: 'A' | 'B'; entries: any[]; srcBuffer?: Uint8Array }) => {
    if (source.pane === targetWhich) return;
    const src = getPane(source.pane);
    if (!src) return;
    // Usa o disco EXATO capturado no início do arraste (não o buffer "vivo" do painel, que pode
    // ter mudado de disco no container). Garante que cada arquivo sai do disco onde foi visto.
    const srcBuffer = source.srcBuffer && source.srcBuffer.length ? source.srcBuffer : src.buffer;
    setActivePane(targetWhich);
    try {
      const files: any[] = [];
      for (const entry of source.entries) {
        const res = await window.cocoApi.dskExtractRaw(srcBuffer, entry);
        if (!res.success) { addLog(`Extração falhou: ${entry.fullName} — ${res.error}`, `Extract failed: ${entry.fullName} — ${res.error}`, 'error'); continue; }
        const data: Uint8Array = res.data;
        // Sanidade: um grânulo "vazio" (tudo 0xFF/0x00) indica disco de origem desalinhado/corrompido
        // no container — avisa e PULA, em vez de gravar lixo na nova imagem.
        const blank = data.length === 0 || data.every((b: number) => b === 0xFF) || data.every((b: number) => b === 0x00);
        if (blank) {
          addLog(`"${entry.fullName}" extraiu vazio (${data.length}B) — disco de origem do container parece desalinhado; pulando.`,
                 `"${entry.fullName}" extracted blank (${data.length}B) — source container disk looks misaligned; skipping.`, 'warn');
          continue;
        }
        files.push({ name: entry.name, ext: entry.ext, fileType: entry.fileType, asciiFlag: entry.asciiFlag, data });
      }
      if (files.length) beginAddBatch(targetWhich, files);
      else addLog('Nenhum arquivo válido para copiar (origem vazia/corrompida).', 'No valid file to copy (source blank/corrupt).', 'warn');
    } catch (err: any) { addLog(`DSK drop: ${err.message}`, `DSK drop: ${err.message}`, 'error'); }
  };

  // Roteia o drop num painel: arquivos externos (SO) vs. linha arrastada de outro painel
  const handlePaneDrop = (which: 'A' | 'B', e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleDskExternalDrop(which, e);
      return;
    }
    const item = dskDragItem.current;
    dskDragItem.current = null;
    if (item) handleDskInternalDrop(which, item);
  };

  // Editor hexadecimal global: edita o arquivo .DSK selecionado (1º da seleção), ou o programa extraído (aba EPROM)
  const handleOpenHexEditor = async () => {
    if (selectedDsk && selectedDsk.entries.length) {
      const pane = getPane(selectedDsk.pane);
      if (!pane) return;
      const entry = selectedDsk.entries[0];
      try {
        // bytes RAW armazenados (para edição fiel + write-back)
        const res = await window.cocoApi.dskExtractRaw(pane.buffer, entry);
        if (res.success) {
          setModalBuffer(res.data);
          setModalFileName(entry.fullName);
          setHexEditTarget({ pane: selectedDsk.pane, entry });
          setIsHexModalOpen(true);
        } else addLog(`Hex: ${res.error}`, `Hex: ${res.error}`, 'error');
      } catch (err: any) { addLog(`Hex: ${err.message}`, `Hex: ${err.message}`, 'error'); }
      return;
    }
    // Fallback ao programa extraído (fita/.bin/.rom) SÓ vale no contexto da aba EPROM.
    // Fora dela (ex.: aba DSK sem arquivo selecionado), abrir esse buffer mostraria dados
    // antigos e sem relação com o que está na tela — então exigimos uma seleção real.
    if (activeTab === 'eprom' && extractedPayload) {
      setHexEditTarget(null);
      setModalBuffer(extractedPayload);
      setModalFileName(programName || 'payload');
      setIsHexModalOpen(true);
      return;
    }
    addLog(
      'Selecione um arquivo numa imagem .DSK (aba DSK) ou carregue um programa (aba EPROM) para abrir no editor hexadecimal.',
      'Select a file in a .DSK image (DSK tab) or load a program (EPROM tab) to open in the hex editor.',
      'warn'
    );
  };

  // Salva as edições do hexa: de volta no arquivo do .DSK (item 3) ou no payload da aba EPROM
  const handleHexSave = async () => {
    if (!modalBuffer) { setIsHexModalOpen(false); return; }
    if (hexEditTarget) {
      const pane = getPane(hexEditTarget.pane);
      if (pane) {
        pushDskUndo();
        try {
          const e = hexEditTarget.entry;
          const del = await window.cocoApi.dskDeleteFile(pane.buffer, e);
          const buffer = del.success ? del.image : pane.buffer;
          const res = await window.cocoApi.dskAddBytes(buffer, e.name, e.ext, e.fileType, e.asciiFlag || 0, modalBuffer);
          if (res.success) {
            await refreshPane(hexEditTarget.pane, res.image);
            addLog(`"${e.fullName}" atualizado na imagem do painel ${hexEditTarget.pane}. Lembre-se de salvar a imagem.`, `"${e.fullName}" updated in pane ${hexEditTarget.pane}'s image. Remember to save the image.`, 'success');
          } else addLog(`Hex save: ${res.error}`, `Hex save: ${res.error}`, 'error');
        } catch (err: any) { addLog(`Hex save: ${err.message}`, `Hex save: ${err.message}`, 'error'); }
      }
      setHexEditTarget(null);
      setIsHexModalOpen(false);
      return;
    }
    setExtractedPayload(modalBuffer);
    setCompiledRom(null);
    setCompilationSuccess(false);
    addLog(
      currentLang === 'pt-br'
        ? `Alterações no arquivo "${modalFileName}" salvas no buffer ativo de compilação!`
        : `Changes to file "${modalFileName}" saved into active assembly buffer!`,
      'success'
    );
    setIsHexModalOpen(false);
  };

  const startResizingDskSplit = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
    const startY = mouseDownEvent.clientY;
    const startHeight = dskTopHeight;
    const doDrag = (e: MouseEvent) => {
      setDskTopHeight(Math.max(140, Math.min(620, startHeight + (e.clientY - startY))));
    };
    const stopDrag = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  // Split vertical entre o hexa/ASCII e o painel de disassembly (arrasta p/ esquerda = disasm mais largo).
  const startResizingDisasm = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
    const startX = mouseDownEvent.clientX;
    const startWidth = disasmWidth;
    const doDrag = (e: MouseEvent) => {
      setDisasmWidth(Math.max(240, Math.min(900, startWidth + (startX - e.clientX))));
    };
    const stopDrag = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  // Executa a montagem e compilação do Cartucho EPROM
  const handleCompile = async () => {
    if (!extractedPayload) {
      addLog(
        'Falha ao compilar: Nenhum payload carregado.',
        'Compilation failed: No payload loaded.',
        'error'
      );
      return;
    }

    try {
      addLog(
        'Montando o Inicializador (Bootstrap) do Motorola 6809E e mapeando setores de EPROM...',
        'Assembling Motorola 6809E Bootstrap and mapping EPROM sectors...',
        'info'
      );
      const config = {
        targetRamLoadAddr: loadAddr,
        targetRamExecAddr: execAddr,
        payloadSize: extractedPayload.length,
        useTwoStage,
        cartridgeSizeKb: epromSizeKb,
        fillerByte,
        emulatorMode
      };

      const res = await window.cocoApi.compileCartridge(extractedPayload, config);
      if (res.success) {
        setCompiledRom(res.romBuffer);
        setLoaderSize(res.loaderSize);
        setPayloadRomOffset(res.payloadRomOffset);
        setNumBanks(res.numBanks || 1);
        setCompilationSuccess(true);

        addLog(
          `Sucesso na Montagem! Cartucho compilado com sucesso. Tamanho: ${epromSizeKb}KB (${res.romBuffer.length} bytes).`,
          `Assembly Success! Cartridge successfully compiled. Size: ${epromSizeKb}KB (${res.romBuffer.length} bytes).`,
          'success'
        );
        addLog(
          `Tamanho do bootstrap: ${res.loaderSize} bytes. O payload do jogo começa no deslocamento $${res.payloadRomOffset.toString(16).toUpperCase()}`,
          `Bootstrap size: ${res.loaderSize} bytes. Game payload starts at offset $${res.payloadRomOffset.toString(16).toUpperCase()}`,
          'info'
        );
        if (res.numBanks && res.numBanks > 1) {
          addLog(
            `EPROM de ${epromSizeKb}KB = ${res.numBanks} bancos de 16K. O banco de boot foi espelhado em todos os ${res.numBanks} bancos, então o programa inicia em qualquer posição do jumper de seleção da placa.`,
            `${epromSizeKb}KB EPROM = ${res.numBanks} x 16K banks. The boot bank was mirrored across all ${res.numBanks} banks, so the program starts at any position of the board's bank-select jumper.`,
            'info'
          );
        }
      } else {
        addLog(`Assembly: ${res.error}`, `Assembly: ${res.error}`, 'error');
        setCompilationSuccess(false);
      }
    } catch (err: any) {
      addLog(`Assembly Error: ${err.message}`, `Assembly Error: ${err.message}`, 'error');
      setCompilationSuccess(false);
    }
  };

  // Salva o executável CoCo (.BIN) direto a partir do payload extraído
  const handleExportBin = async () => {
    if (!extractedPayload) return;
    try {
      // Um arquivo BIN executável do CoCo (formato LOADM) consiste em:
      // 1. Cabeçalho de segmento: $00 (1 byte) + tamanho (2 bytes BE) + end. carga (2 bytes BE)
      // 2. Dados do payload: extractedPayload
      // 3. Pós-âmbulo: $FF (1 byte) + $0000 (2 bytes BE) + end. execução (2 bytes BE)
      const len = extractedPayload.length;
      const binData = new Uint8Array(5 + len + 5);
      
      // Cabeçalho do segmento
      binData[0] = 0x00;
      binData[1] = (len >> 8) & 0xFF;
      binData[2] = len & 0xFF;
      binData[3] = (loadAddr >> 8) & 0xFF;
      binData[4] = loadAddr & 0xFF;
      
      // Payload
      binData.set(extractedPayload, 5);
      
      // Pós-âmbulo
      const postIdx = 5 + len;
      binData[postIdx] = 0xFF;
      binData[postIdx + 1] = 0x00;
      binData[postIdx + 2] = 0x00;
      binData[postIdx + 3] = (execAddr >> 8) & 0xFF;
      binData[postIdx + 4] = execAddr & 0xFF;

      const defaultName = `${programName.trim()}.bin`;
      const res = await window.cocoApi.saveCartridgeFile(binData, defaultName);
      if (res.success) {
        addLog(
          `Programa executável CoCo (.BIN) salvo com sucesso em: ${res.filePath}`,
          `CoCo Executable program (.BIN) saved successfully at: ${res.filePath}`,
          'success'
        );
      } else if (res.error) {
        addLog(`Save Bin: ${res.error}`, `Save Bin: ${res.error}`, 'error');
      }
    } catch (err: any) {
      addLog(`Save Bin Error: ${err.message}`, `Save Bin Error: ${err.message}`, 'error');
    }
  };

  // Seleciona um arquivo específico de uma fita multi-arquivo como programa ativo
  const handleSelectCasFile = (f: any) => {
    setSelectedCasFile(f.name);
    setProgramName(f.name);
    setLoadAddr(f.loadAddr);
    setExecAddr(f.execAddr);
    setExtractedPayload(f.payload);
    setCompiledRom(null);
    setCompilationSuccess(false);
    applyAutoConfig(f.payload.length, f.loadAddr);
    addLog(
      `Arquivo "${f.name}" selecionado como programa ativo (Carga $${f.loadAddr.toString(16).toUpperCase()}, ${f.payload.length} bytes).`,
      `File "${f.name}" selected as active program (Load $${f.loadAddr.toString(16).toUpperCase()}, ${f.payload.length} bytes).`,
      'info'
    );
  };

  // Monta a lista de arquivos para exportação ao emulador
  const buildEmuFileList = (): any[] => {
    if (casFileList && casFileList.length > 0) return casFileList;
    if (extractedPayload) {
      return [{ name: programName || 'PROGRAM', fileType: 2, asciiFlag: 0, loadAddr, execAddr, payload: extractedPayload }];
    }
    return [];
  };

  // Exporta para Emulador como fita .cas (preserva todos os arquivos/partes)
  const handleExportEmuCas = async () => {
    const files = buildEmuFileList();
    if (!files.length) return;
    try {
      const res = await window.cocoApi.buildEmulatorCas(files);
      if (!res.success) { addLog(`Export CAS: ${res.error}`, `Export CAS: ${res.error}`, 'error'); return; }
      const r = await window.cocoApi.saveCartridgeFile(
        res.image, `${programName.trim()}.cas`,
        currentLang === 'pt-br' ? 'Exportar para Emulador (.cas)' : 'Export for Emulator (.cas)',
        [{ name: 'CoCo Cassette (.cas)', extensions: ['cas'] }, { name: 'All Files', extensions: ['*'] }]
      );
      if (r.success) addLog(
        `Fita .cas exportada (${files.length} arquivo(s)) em: ${r.filePath}`,
        `.cas tape exported (${files.length} file(s)) at: ${r.filePath}`, 'success');
      else if (r.error) addLog(`Save CAS: ${r.error}`, `Save CAS: ${r.error}`, 'error');
    } catch (err: any) { addLog(`Export CAS Error: ${err.message}`, `Export CAS Error: ${err.message}`, 'error'); }
  };

  // Exporta para Emulador como imagem .dsk RS-DOS (apenas arquivos de código de máquina)
  const handleExportEmuDsk = async () => {
    const files = buildEmuFileList().filter(f => f.fileType === undefined || f.fileType === 2);
    if (!files.length) {
      addLog('Export DSK: nenhum arquivo de código de máquina para gravar.', 'Export DSK: no machine-code files to write.', 'warn');
      return;
    }
    try {
      const res = await window.cocoApi.buildEmulatorDsk(files);
      if (!res.success) { addLog(`Export DSK: ${res.error}`, `Export DSK: ${res.error}`, 'error'); return; }
      const r = await window.cocoApi.saveCartridgeFile(
        res.image, `${programName.trim()}.dsk`,
        currentLang === 'pt-br' ? 'Exportar para Emulador (.dsk)' : 'Export for Emulator (.dsk)',
        [{ name: 'RS-DOS Disk Image (.dsk)', extensions: ['dsk'] }, { name: 'All Files', extensions: ['*'] }]
      );
      if (r.success) addLog(
        `Imagem .dsk exportada (${files.length} arquivo(s)) em: ${r.filePath}`,
        `.dsk image exported (${files.length} file(s)) at: ${r.filePath}`, 'success');
      else if (r.error) addLog(`Save DSK: ${r.error}`, `Save DSK: ${r.error}`, 'error');
    } catch (err: any) { addLog(`Export DSK Error: ${err.message}`, `Export DSK Error: ${err.message}`, 'error'); }
  };

  // Exporta o cartucho compilado como .bin para o CocoFLASH (carrega em $4000)
  const handleExportCocoFlash = async () => {
    if (!compiledRom) {
      addLog('Compile o cartucho (passo ②) antes de exportar para o CocoFLASH.', 'Compile the cartridge (step ②) before exporting to CocoFLASH.', 'warn');
      return;
    }
    try {
      const res = await window.cocoApi.buildCocoFlashBin(compiledRom);
      if (!res.success) { addLog(`CocoFLASH: ${res.error}`, `CocoFLASH: ${res.error}`, 'error'); return; }
      const r = await window.cocoApi.saveCartridgeFile(
        res.image, `${programName.trim()}_cocoflash.bin`,
        currentLang === 'pt-br' ? 'Exportar para CocoFLASH' : 'Export to CocoFLASH',
        [{ name: 'CocoFLASH ROM (.bin)', extensions: ['bin'] }, { name: 'All Files', extensions: ['*'] }]
      );
      if (r.success) {
        addLog(`Imagem CocoFLASH (.bin @ $4000) salva em: ${r.filePath}`, `CocoFLASH image (.bin @ $4000) saved at: ${r.filePath}`, 'success');
        addLog(t('cocoFlashGuide'), t('cocoFlashGuide'), 'info');
      } else if (r.error) addLog(`Save CocoFLASH: ${r.error}`, `Save CocoFLASH: ${r.error}`, 'error');
    } catch (err: any) { addLog(`CocoFLASH Error: ${err.message}`, `CocoFLASH Error: ${err.message}`, 'error'); }
  };

  // Salva o arquivo de ROM montado (.CCC)
  const handleSaveRom = async () => {
    if (!compiledRom) return;
    try {
      const defaultName = `${programName.trim()}.ccc`;
      const res = await window.cocoApi.saveCartridgeFile(compiledRom, defaultName);
      if (res.success) {
        addLog(
          `Arquivo de cartucho EPROM salvo com sucesso em: ${res.filePath}`,
          `EPROM Cartridge image saved successfully at: ${res.filePath}`,
          'success'
        );
      } else if (res.error) {
        addLog(`Save: ${res.error}`, `Save: ${res.error}`, 'error');
      }
    } catch (err: any) {
      addLog(`Save Error: ${err.message}`, `Save Error: ${err.message}`, 'error');
    }
  };

  // --- Greaseweazle (aba GW) ---
  const gwOpts = () => ({ gwPath, format: gwFormat, device: gwDevice.trim(), drive: gwDrive, extra: gwExtra.trim().split(/\s+/).filter(Boolean), direct: gwDirect.trim() });

  // Abre o diálogo para localizar o gw.exe e grava no campo (persiste automaticamente).
  const handleGwPickExe = async () => {
    try {
      const r = await window.cocoApi.gwPickExe();
      if (r?.cancelled) return;
      if (!r?.success) { addLog(`gw: ${r?.error || 'falha ao selecionar'}`, `gw: ${r?.error || 'selection failed'}`, 'error'); return; }
      setGwPath(r.path);
      addLog(`Caminho do gw definido: ${r.path}`, `gw path set: ${r.path}`, 'success');
    } catch (err: any) { addLog(`gw: ${err.message}`, `gw: ${err.message}`, 'error'); }
  };

  const handleGwInfo = async () => {
    setGwBusy(true); setGwOp('info');
    addLog('Greaseweazle: gw info…', 'Greaseweazle: gw info…', 'info');
    const r = await window.cocoApi.gwInfo({ gwPath, device: gwDevice.trim() });
    if (!r.success) addLog('gw info falhou — a placa está conectada e o gw instalado/no PATH?', 'gw info failed — is the board connected and gw installed/on PATH?', 'warn');
    setGwBusy(false); setGwOp('');
  };

  // Diagnóstico do drive: roda comandos gw avulsos (delays/seek), com --device se preenchido.
  const gwDiag = async (args: string[], ptMsg: string, enMsg: string) => {
    setGwBusy(true); setGwOp('info');
    addLog(ptMsg, enMsg, 'info');
    const full = [...args, ...(gwDevice.trim() ? ['--device', gwDevice.trim()] : [])];
    const r = await window.cocoApi.gwRun({ gwPath }, full);
    if (!r.success) addLog(`gw ${args[0]} falhou (código ${r.code}).`, `gw ${args[0]} failed (code ${r.code}).`, 'warn');
    setGwBusy(false); setGwOp('');
  };
  const handleGwShowDelays = () => gwDiag(['delays'], 'Greaseweazle: lendo tempos do drive (gw delays)…', 'Greaseweazle: reading drive timings (gw delays)…');
  const handleGwSetStep = () => {
    const v = parseInt(gwStep, 10);
    if (!Number.isFinite(v) || v <= 0) { addLog('Step inválido (informe µs, ex.: 3000).', 'Invalid step (enter µs, e.g. 3000).', 'warn'); return; }
    gwDiag(['delays', '--step', String(v)], `Greaseweazle: ajustando step para ${v} µs…`, `Greaseweazle: setting step to ${v} µs…`);
  };
  const handleGwSeekTest = () => gwDiag(['seek', ...(gwDrive ? ['--drive', gwDrive] : ['--drive', '0']), '0'], 'Greaseweazle: teste de seek (recalibrar trilha 0)…', 'Greaseweazle: seek test (recalibrate track 0)…');

  // Pede a leitura: se o painel-alvo já tem conteúdo, confirma a sobrescrita antes (permite cancelar p/ salvar).
  const handleGwRead = () => {
    if (getPane(gwPane)) { setGwReadConfirm(true); return; }
    doGwRead();
  };

  const doGwRead = async () => {
    setGwReadConfirm(false);
    setGwBusy(true); setGwOp('read'); setGwDone(new Set());
    addLog(`Greaseweazle: lendo disco (${gwFormat}) → Painel ${gwPane}…`, `Greaseweazle: reading disk (${gwFormat}) → Pane ${gwPane}…`, 'info');
    try {
      const res = await window.cocoApi.gwRead(gwOpts());
      if (res.success) {
        await loadPaneFromBuffer(gwPane, new Uint8Array(res.image), `GW_READ_${gwFormat.replace(/\./g, '_')}.dsk`);
        markDirty(gwPane); // imagem lida ainda não salva em arquivo
        setActivePane(gwPane);
        setActiveTab('dsk'); // leitura OK → vai para a aba DSK com o painel-alvo focado
        addLog(`Leitura concluída: ${res.size} bytes. Imagem carregada no Painel ${gwPane} — revise e salve.`, `Read complete: ${res.size} bytes. Image loaded into Pane ${gwPane} — review and save.`, 'success');
      } else addLog(`Falha na leitura (código ${res.code ?? res.error}).`, `Read failed (code ${res.code ?? res.error}).`, 'error');
    } catch (err: any) { addLog(`gw read: ${err.message}`, `gw read: ${err.message}`, 'error'); }
    setGwBusy(false); setGwOp('');
  };

  // Perfil GW pelo tamanho do buffer RS-DOS: 184320 = 40 trilhas, 161280 = 35 (auto-seleção na gravação).
  const paneGwFormat = (len: number): string | null => (len === 184320 ? 'coco.decb.40t' : len === 161280 ? 'coco.decb' : null);

  const doGwWrite = async (image: Uint8Array, formatOverride?: string) => {
    const fmt = formatOverride || gwFormat;
    setGwBusy(true); setGwOp('write'); setGwDone(new Set());
    addLog(`Greaseweazle: gravando disco (${fmt})…`, `Greaseweazle: writing disk (${fmt})…`, 'info');
    try {
      const res = await window.cocoApi.gwWrite({ ...gwOpts(), format: fmt }, image);
      if (res.success) addLog('Gravação concluída com sucesso.', 'Write completed successfully.', 'success');
      else addLog(`Falha na gravação (código ${res.code}).`, `Write failed (code ${res.code}).`, 'error');
    } catch (err: any) { addLog(`gw write: ${err.message}`, `gw write: ${err.message}`, 'error'); }
    setGwBusy(false); setGwOp('');
  };

  // Auto-seleciona o perfil GW pela geometria do painel (RS-DOS 35/40T) e avisa no log.
  const autoFmtForPane = (buf: Uint8Array): string | undefined => {
    const fmt = paneGwFormat(buf.length);
    if (fmt && fmt !== gwFormat) {
      setGwFormat(fmt);
      const t = buf.length === 184320 ? '40' : '35';
      addLog(`Geometria do disco: ${t} trilhas → perfil ${fmt} (auto).`, `Disk geometry: ${t} tracks → profile ${fmt} (auto).`, 'info');
    }
    return fmt || undefined;
  };

  const handleGwWritePane = () => {
    const pane = getPane(gwPane);
    if (!pane) { addLog(`Painel ${gwPane} sem imagem.`, `Pane ${gwPane} has no image.`, 'warn'); return; }
    doGwWrite(pane.buffer, autoFmtForPane(pane.buffer));
  };

  // Botão "Gravar GW" da aba DSK: confirma antes de gravar (a gravação respeita as configurações da aba GW).
  const handleDskWriteToGw = () => {
    const pane = getPane(activePane);
    if (!pane) { addLog('Painel ativo sem imagem.', 'Active pane has no image.', 'warn'); return; }
    setDskGwConfirm(true);
  };
  // Confirmado: abre a aba GW já apontando para o painel ativo e grava-o.
  const proceedDskWriteToGw = () => {
    setDskGwConfirm(false);
    const pane = getPane(activePane);
    if (!pane) { addLog('Painel ativo sem imagem.', 'Active pane has no image.', 'warn'); return; }
    setGwPane(activePane);
    setActiveTab('gw');
    addLog(`Gravando Painel ${activePane} no disco físico via Greaseweazle…`, `Writing Pane ${activePane} to the physical disk via Greaseweazle…`, 'info');
    doGwWrite(pane.buffer, autoFmtForPane(pane.buffer));
  };
  const handleGwWriteFile = async () => {
    try {
      const f = await window.cocoApi.selectFile();
      if (!f) return;
      doGwWrite(new Uint8Array(f.buffer));
    } catch (err: any) { addLog(`gw write: ${err.message}`, `gw write: ${err.message}`, 'error'); }
  };

  const renderGwTab = () => {
    const geo = GW_FORMATS.find(f => f.id === gwFormat) || { cyls: 35, heads: 1 };
    const total = geo.cyls * geo.heads;
    const pct = total ? Math.round((gwDone.size / total) * 100) : 0;
    const fieldCls = 'input-text py-1.5 text-xs w-full';
    const labelCls = 'flex flex-col gap-1 text-[11px] text-[var(--text-secondary)] font-semibold';
    const gwHelp = (k: string) => (
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); toggleHint(k); }}
        className={`ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full align-middle transition-all ${activeHint === k ? 'text-[var(--primary)]' : 'text-slate-500 hover:text-[var(--primary)]'}`}
        title="?"
      >
        <HelpCircle size={11} />
      </button>
    );
    return (
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center gap-4" style={{ minHeight: 0 }}>
        {/* Opções */}
        <section className="glass-panel p-4 flex flex-col gap-3 animate-slideup" style={{ width: '100%', maxWidth: 820 }}>
          <h2 className="text-sm font-bold text-white border-b border-[var(--border)] pb-2 tracking-wide uppercase flex items-center gap-2">
            <HardDrive className="text-[var(--primary)]" size={16} /> {t('gwTitle')}
          </h2>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className={labelCls} style={{ gridColumn: '1 / span 2' }}>
              <span>{t('gwFormatLabel')}{gwHelp('gwHintFormat')}</span>
              <select className="input-select text-xs py-1.5" value={gwFormat} onChange={e => setGwFormat(e.target.value)}>
                {GW_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label} — {f.id}</option>)}
              </select>
            </label>
            <label className={labelCls}>
              <span>{t('gwDeviceLabel')}{gwHelp('gwHintDevice')}</span>
              <div className="flex gap-1.5 items-center">
                <input className={fieldCls} style={{ flex: 1, minWidth: 0 }} value={gwDevice} placeholder="auto (ex.: COM3)" onChange={e => setGwDevice(e.target.value)} />
                <button type="button" disabled={gwBusy} onClick={handleGwInfo} className="dsk-tool flex-shrink-0" title={t('gwTestBtn')}><RefreshCw size={13} className={gwBusy && gwOp === 'info' ? 'animate-spin' : ''} /> {t('gwTestBtn')}</button>
              </div>
            </label>
            <label className={labelCls}>
              <span>{t('gwDriveLabel')}{gwHelp('gwHintDrive')}</span>
              <select className="input-select text-xs py-1.5" value={gwDrive} onChange={e => setGwDrive(e.target.value)}>
                <option value="">{t('gwDriveDefault')}</option>
                <option value="a">A</option>
                <option value="b">B</option>
                <option value="0">0</option>
                <option value="1">1</option>
              </select>
            </label>
            <label className={labelCls} style={{ gridColumn: '1 / span 2' }}>
              <span>{t('gwPathLabel')}{gwHelp('gwHintPath')}</span>
              <div className="flex gap-1.5 items-center">
                <input className={fieldCls} style={{ flex: 1, minWidth: 0 }} value={gwPath} placeholder="gw  (ou C:\\gw\\gw.exe)" onChange={e => setGwPath(e.target.value)} />
                <button type="button" onClick={handleGwPickExe} className="dsk-tool flex-shrink-0" title={t('gwBrowseBtn')}><FolderOpen size={13} /> {t('gwBrowseBtn')}</button>
              </div>
            </label>
            <label className={labelCls}>
              <span>{t('gwExtraLabel')}{gwHelp('gwHintExtra')}</span>
              <input className={fieldCls} value={gwExtra} placeholder="--no-verify --retries=3" onChange={e => setGwExtra(e.target.value)} />
            </label>
            <label className={labelCls}>
              <span>{t('gwDirectLabel')}{gwHelp('gwHintDirect')}</span>
              <input className={fieldCls} value={gwDirect} placeholder="read --format coco.decb --device COM7 --drive 0 --revs 3"
                style={gwDirect.trim() ? { borderColor: 'var(--primary)', boxShadow: '0 0 6px var(--primary-glow)' } : undefined}
                onChange={e => setGwDirect(e.target.value)} />
            </label>
          </div>
          <div className="flex gap-2 flex-wrap pt-1 items-center">
            {/* Seletor de painel inline (rótulo + dropdown) — ocupa o lugar do antigo botão Testar, sem esticar a linha */}
            <span className="text-[11px] text-[var(--text-secondary)] font-semibold flex items-center">{t('gwUsePaneLabel')}{gwHelp('gwHintPane')}</span>
            <select className="input-select text-xs py-1.5" style={{ minWidth: 88 }} value={gwPane} onChange={e => setGwPane(e.target.value as 'A' | 'B')}>
              <option value="A">{currentLang === 'pt-br' ? 'Painel A' : 'Pane A'}</option>
              <option value="B">{currentLang === 'pt-br' ? 'Painel B' : 'Pane B'}</option>
            </select>
            <button disabled={gwBusy} onClick={handleGwRead} className="dsk-tool" style={{ borderColor: 'var(--border-active)', color: 'var(--primary)' }}><Download size={13} /> {currentLang === 'pt-br' ? `Ler → Painel ${gwPane}` : `Read → Pane ${gwPane}`}</button>
            <button disabled={gwBusy || !getPane(gwPane)} onClick={handleGwWritePane} className="dsk-tool"><Upload size={13} /> {currentLang === 'pt-br' ? `Gravar Painel ${gwPane} → Disco` : `Write Pane ${gwPane} → Disk`}</button>
            <button disabled={gwBusy} onClick={handleGwWriteFile} className="dsk-tool"><Upload size={13} /> {t('gwWriteFileBtn')}</button>
            {gwHelp('gwHintActions')}
          </div>
          {/* Diagnóstico / ajuste do drive — útil quando o seek/verify falha (ver saga GW). */}
          <div className="flex gap-2 flex-wrap items-center pt-1 border-t border-[var(--border)] mt-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)] flex items-center">{currentLang === 'pt-br' ? 'Diagnóstico do drive' : 'Drive diagnostics'}{gwHelp('gwHintDiag')}</span>
            <button disabled={gwBusy} onClick={handleGwSeekTest} className="dsk-tool" title={currentLang === 'pt-br' ? 'gw seek 0 — testa o movimento da cabeça / recalibra' : 'gw seek 0 — test head movement / recalibrate'}><RefreshCw size={13} className={gwBusy && gwOp === 'info' ? 'animate-spin' : ''} /> {currentLang === 'pt-br' ? 'Testar seek' : 'Seek test'}</button>
            <button disabled={gwBusy} onClick={handleGwShowDelays} className="dsk-tool" title="gw delays">{currentLang === 'pt-br' ? 'Ver tempos' : 'Show delays'}</button>
            <span className="text-[10px] text-[var(--text-secondary)] font-semibold ml-1">Step (µs):</span>
            <input value={gwStep} onChange={e => setGwStep(e.target.value.replace(/[^0-9]/g, ''))} className="input-text py-1 text-xs" style={{ width: 70 }} placeholder="3000" title={currentLang === 'pt-br' ? 'Atraso entre passos da cabeça (µs). Aumente (ex.: 8000–12000) para drives lentos.' : 'Delay between head steps (µs). Increase (e.g. 8000–12000) for slow drives.'} />
            <button disabled={gwBusy} onClick={handleGwSetStep} className="dsk-tool" title="gw delays --step">{currentLang === 'pt-br' ? 'Aplicar step' : 'Apply step'}</button>
          </div>
          {activeHint && activeHint.startsWith('gwHint') ? (
            <div className="text-[10px] text-[var(--text-secondary)] bg-slate-950/60 p-2.5 rounded-lg border border-[var(--primary)]/30 leading-relaxed flex gap-2 items-start animate-slideup">
              <HelpCircle size={12} className="text-[var(--primary)] mt-0.5 flex-shrink-0" />
              <span>{t(activeHint)}</span>
            </div>
          ) : (
            <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">{t('gwHint')}</p>
          )}
        </section>

        {/* Mapa de trilhas + progresso */}
        <section className="glass-panel p-4 flex flex-col gap-3 animate-slideup" style={{ width: '100%', maxWidth: 820 }}>
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              {t('gwTrackMap')}{gwHelp('gwHintMap')} {gwOp === 'read' ? `· ${t('gwReading')}` : gwOp === 'write' ? `· ${t('gwWriting')}` : ''}
            </h3>
            <span className="text-[11px] font-mono text-[var(--primary)]">{gwDone.size} / {total} ({pct}%)</span>
          </div>
          <div className="flex flex-col gap-1.5 mt-1">
            {Array.from({ length: geo.heads }).map((_, h) => (
              <div key={h} className="flex items-center gap-2">
                <span className="text-[9px] text-[var(--text-muted)] font-mono flex-shrink-0" style={{ width: 28 }}>L{h}</span>
                <div className="flex flex-1" style={{ gap: 2 }}>
                  {Array.from({ length: geo.cyls }).map((_, c) => (
                    <div
                      key={c}
                      title={`${currentLang === 'pt-br' ? 'Trilha' : 'Track'} ${c} · ${currentLang === 'pt-br' ? 'Lado' : 'Side'} ${h}`}
                      style={{ flex: 1, minWidth: 3, height: 13 }}
                      className={`rounded-[2px] ${gwDone.has(`${c}.${h}`) ? 'bg-[var(--primary)]' : 'bg-slate-800'}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  };

  // Mantém o ref dos atalhos com os handlers/estado atuais
  dskKbdRef.current = { activeTab, handleDskCopy, handleDskPaste, handleDskDelete, handleDskUndo, handleDskRedo };

  // Rótulo do tipo de arquivo lido do header (entrada de diretório): byte 11 = fileType,
  // byte 12 = asciiFlag. 0=BASIC, 1=Dados, 2=Código de Máquina, 3=Fonte; ASCII vs BIN.
  const fileKind = (f: any): string => {
    const labels: Record<number, string> = currentLang === 'pt-br'
      ? { 0: 'BASIC', 1: 'DADOS', 2: 'MÁQUINA', 3: 'FONTE' }
      : { 0: 'BASIC', 1: 'DATA', 2: 'MACHINE', 3: 'SOURCE' };
    return labels[f.fileType] ?? (f.fileTypeName || '?');
  };

  const renderDskPane = (which: 'A' | 'B', pane: any) => {
    // Disco Dragon DOS (.vdk): somente leitura. Alocação por SETOR (256 B), diretório na trilha 20.
    const isDragon = pane?.format === 'dragon';
    const usedGran = pane ? pane.totalGranules - pane.freeGranules : 0;
    const freeKB = pane ? (isDragon ? ((pane.freeSectors || 0) * 256 / 1024) : (pane.freeGranules * 2304 / 1024)).toFixed(1) : '0';
    const usedKB = pane ? (isDragon ? ((pane.usedSectors || 0) * 256 / 1024) : (usedGran * 2304 / 1024)).toFixed(1) : '0';
    const usedPct = pane && pane.totalGranules ? Math.round((usedGran / pane.totalGranules) * 100) : 0;
    // % de fragmentação. RS-DOS: transições não-contíguas nas cadeias de granules. Dragon: % de
    // arquivos marcados fragmentados (alocação em mais de um bloco contíguo).
    const fragPct = pane ? (isDragon
      ? Math.round((pane.files.filter((f: any) => f.fragmented).length / Math.max(1, pane.files.length)) * 100)
      : (() => {
        let bad = 0, tot = 0;
        for (const f of pane.files) { const c = f.granuleChain || []; for (let i = 1; i < c.length; i++) { tot++; if (c[i] !== c[i - 1] + 1) bad++; } }
        return tot ? Math.round((bad / tot) * 100) : 0;
      })()) : 0;
    return (
      <div
        onClick={() => setActivePane(which)}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => handlePaneDrop(which, e)}
        className={`glass-panel h-full flex flex-col overflow-hidden transition-all ${which === activePane ? 'dsk-pane-active' : ''}`}
      >
        <div className="flex-1 flex flex-row overflow-hidden" style={{ minHeight: 0 }}>
          {/* Left: open + image info */}
          <div className="flex flex-col gap-2 p-3 border-r border-[var(--border)] flex-shrink-0" style={{ width: 200, overflowY: 'auto', minHeight: 0 }}>
            <div className="flex items-center justify-center gap-2">
              {/* Badge PAINEL A/B — brilho laranja quando o painel está ativo (distingue ativo/inativo) */}
              <span
                className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md"
                style={which === activePane
                  ? { color: '#000', background: '#ff8c1a', border: '1px solid #ff8c1a', boxShadow: '0 0 10px rgba(255,140,26,0.8)' }
                  : { color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                {currentLang === 'pt-br' ? 'Painel' : 'Pane'} {which}
              </span>
              {/* Limpar painel (somente ícone) — sempre visível; volta ao estado recém-aberto */}
              <button
                onClick={(e) => { e.stopPropagation(); handleClearPane(which); }}
                disabled={!pane}
                className="dsk-tool"
                style={{ padding: '4px 6px' }}
                title={currentLang === 'pt-br' ? `Limpar Painel ${which}` : `Clear Pane ${which}`}
                aria-label={currentLang === 'pt-br' ? `Limpar Painel ${which}` : `Clear Pane ${which}`}
              >
                <Eraser size={14} />
              </button>
            </div>
            <button
              onClick={() => handleImageImport(which)}
              disabled={imageBusy}
              className="btn btn-secondary py-1.5 text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 border-[var(--primary)]/40 text-[var(--primary)] hover:bg-[var(--primary-glow)] disabled:opacity-50"
            >
              <FolderOpen size={12} /> {t('openImageBtn')}
            </button>
            {/* Legenda de formatos só quando vazio; ao carregar, o NOME da imagem sobe nesse lugar
                (libera espaço vertical p/ os controles do contêiner — ex.: "Buscar disco"). */}
            {!pane && <span className="text-[9px] text-[var(--text-muted)] leading-tight">{t('imgFormatsLegend')}</span>}
            {pane ? (
              <div className="flex flex-col gap-1 text-[11px] mt-1">
                <div className="text-white font-mono break-all">{pane.fileName}</div>
                <div className="text-[var(--text-secondary)]">{(pane.size / 1024).toFixed(0)} KB</div>
                {isDragon && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded self-start"
                    style={{ color: '#000', background: '#22d3ee', boxShadow: '0 0 8px rgba(34,211,238,0.6)' }}
                    title={currentLang === 'pt-br' ? 'Imagem Dragon DOS (VDK). Esta versão abre Dragon em SOMENTE LEITURA: listar, extrair e ver o mapa.' : 'Dragon DOS image (VDK). This version opens Dragon READ-ONLY: list, extract and view the map.'}
                  >
                    Dragon · {currentLang === 'pt-br' ? 'somente leitura' : 'read-only'}
                  </span>
                )}
                {pane.container && (
                  <div className="flex flex-col gap-1 mt-1 bg-slate-950/40 rounded p-1.5 border border-[var(--primary)]/30" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                      {pane.container.kind === 'cocosdc' ? 'CoCoSDC' : pane.container.kind === 'miniide' ? 'MiniIDE' : (currentLang === 'pt-br' ? 'Contêiner' : 'Container')} · {pane.container.count} {currentLang === 'pt-br' ? 'discos' : 'disks'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleSelectContainerDisk(which, pane.container.index - 1)} disabled={imageBusy || pane.container.index <= 0} className="dsk-tool" style={{ padding: '2px 7px' }}>◀</button>
                      <span className="text-[11px] font-mono text-[var(--primary)] font-bold flex-1 text-center">{pane.container.index}/{pane.container.count - 1}</span>
                      <button onClick={() => handleSelectContainerDisk(which, pane.container.index + 1)} disabled={imageBusy || pane.container.index >= pane.container.count - 1} className="dsk-tool" style={{ padding: '2px 7px' }}>▶</button>
                    </div>
                    <input
                      type="number" min={0} max={pane.container.count - 1} value={pane.container.index}
                      onChange={(e) => handleSelectContainerDisk(which, Math.max(0, Math.min(pane.container.count - 1, parseInt(e.target.value) || 0)))}
                      className="input-text py-0.5 text-[11px] text-center font-mono"
                    />
                    <button onClick={() => { setActivePane(which); setImageFilter(''); setDiskPicker({ which }); }} disabled={imageBusy} className="dsk-tool" style={{ padding: '3px 7px' }}><Search size={12} /> {t('dskSearchDisk')}</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-[var(--text-muted)] mt-1">{t('dskPaneEmpty')}</div>
            )}
          </div>
          {/* Right: file list */}
          <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
            {pane ? (
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-900 text-[var(--text-muted)] font-bold border-b border-[var(--border)]">
                    <th className="p-2">{t('dskColName')}</th>
                    <th className="p-2 text-center">{t('dskColType')}</th>
                    <th className="p-2 text-right">{t('dskColSize')}</th>
                    <th className="p-2 text-center">{t('dskColGran')}</th>
                    <th className="p-2">{t('dskColTracks')}</th>
                    <th className="p-2">{t('dskColKind')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pane.files.map((f: any, idx: number) => (
                    <tr
                      key={idx}
                      draggable
                      onDragStart={(e) => {
                        const inSel = selectedDsk && selectedDsk.pane === which && selectedDsk.entries.some((x: any) => x.fullName === f.fullName);
                        // Captura o buffer do disco ATUAL no início do arraste (imune a trocar de disco no
                        // container entre arrastar e soltar). Cada arquivo é extraído deste disco exato.
                        dskDragItem.current = { pane: which, entries: inSel ? selectedDsk!.entries : [f], srcBuffer: pane.buffer ? new Uint8Array(pane.buffer) : undefined };
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={(e) => handleSelectDskFile(which, f, e)}
                      onDoubleClick={() => handleRunFileInXroar(which, f)}
                      title={t('dskRunHint')}
                      className={`cursor-pointer border-b border-[var(--border)]/40 hover:bg-slate-800 ${selectedDsk && selectedDsk.pane === which && selectedDsk.entries.some((x: any) => x.fullName === f.fullName) ? 'font-semibold' : 'text-[var(--text-secondary)]'}`}
                      style={selectedDsk && selectedDsk.pane === which && selectedDsk.entries.some((x: any) => x.fullName === f.fullName)
                        ? { background: 'rgba(255,140,26,0.16)', boxShadow: 'inset 0 0 8px rgba(255,140,26,0.45)', color: '#ffb066' }
                        : undefined}
                    >
                      <td className="p-2 font-mono">{f.name}</td>
                      <td className="p-2 text-center">{f.ext}</td>
                      <td className="p-2 text-right font-mono">{f.totalSize} B</td>
                      <td className="p-2 text-center font-mono">{f.granuleChain ? f.granuleChain.length : (f.sectors ? `${f.sectors.length}s` : '-')}</td>
                      <td className="p-2 font-mono text-[10px]">{fileTracks(f)}</td>
                      <td className="p-2 font-mono text-[10px] whitespace-nowrap">{fileKind(f)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="h-full flex items-center justify-center text-[10px] text-[var(--text-muted)] p-4 text-center">{t('dskPaneEmpty')}</div>
            )}
          </div>
          {/* Far right: mapa visual do disquete (ocupação por trilha/setor; hover mostra o arquivo;
              clique seleciona; fragmentados em vermelho). Disco responsivo: ajusta-se à altura. */}
          {pane && (
            <div className="flex-shrink-0" style={{ width: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 10, borderLeft: '1px solid var(--border)', overflow: 'hidden', minHeight: 0 }}>
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>
                {currentLang === 'pt-br' ? 'Mapa do disco' : 'Disk map'}
              </span>
              <DiskMap
                files={pane.files}
                totalGranules={pane.totalGranules}
                selectedNames={selectedDsk?.pane === which ? new Set(selectedDsk.entries.map((e: any) => e.fullName)) : undefined}
                lang={currentLang}
                onSelectFile={(f: any) => handleSelectDskFile(which, f)}
                mode={isDragon ? 'dragon' : 'rsdos'}
                tracks={pane.geom?.tracks} sectorsPerTrack={pane.geom?.sectorsPerTrack} dirTrack={pane.geom?.dirTrack}
                usedSectors={pane.usedSectors} totalSectors={pane.totalSectors}
              />
              {(() => {
                const sel = selectedDsk?.pane === which && selectedDsk.entries.length === 1 ? selectedDsk.entries[0] : null;
                const selFrag = !!sel && (() => { const c = sel.granuleChain || []; for (let i = 1; i < c.length; i++) if (c[i] !== c[i - 1] + 1) return true; return false; })();
                return (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', justifyContent: 'center', flexShrink: 0 }}>
                    <button
                      onClick={() => { setDefragOrder('dir'); setDefragModal({ which }); }}
                      disabled={imageBusy || !pane.files.length || isDragon}
                      className="dsk-tool" style={{ padding: '3px 8px', fontSize: 10, whiteSpace: 'nowrap' }}
                      title={isDragon ? (currentLang === 'pt-br' ? 'Discos Dragon são somente leitura nesta versão' : 'Dragon disks are read-only in this version') : (currentLang === 'pt-br' ? 'Desfragmentar o disco inteiro (reescreve numa imagem nova, contígua)' : 'Defragment the whole disk (rewrite to a fresh contiguous image)')}
                    >DEFRAG</button>
                    <button
                      onClick={() => sel && handleDefragFile(which, sel)}
                      disabled={imageBusy || !selFrag || isDragon}
                      className="dsk-tool" style={{ padding: '3px 8px', fontSize: 10, whiteSpace: 'nowrap' }}
                      title={currentLang === 'pt-br' ? 'Desfragmentar apenas o arquivo selecionado (precisa de um vão contíguo livre)' : 'Defragment only the selected file (needs a contiguous free run)'}
                    >{currentLang === 'pt-br' ? 'DEFRAG ARQ.' : 'DEFRAG FILE'}</button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        {/* Status bar */}
        <div className="dsk-statusbar">
          {pane
            ? (isDragon
              ? `Dragon DOS · ${pane.files.length} ${t('dskFilesWord')} · ${t('dskUsedWord')} ${usedKB} KB (${pane.usedSectors}s · ${usedPct}%) · ${t('dskFreeWord')} ${freeKB} KB (${pane.freeSectors}s) · Frag ${fragPct}%`
              : `${pane.files.length} ${t('dskFilesWord')} · ${t('dskUsedWord')} ${usedKB} KB (${usedGran}g · ${usedPct}%) · ${t('dskFreeWord')} ${freeKB} KB (${pane.freeGranules}g) · ${currentLang === 'pt-br' ? 'Frag' : 'Frag'} ${fragPct}%`)
            : t('dskNoImage')}
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Top Application Bar */}
      <header className="app-header">
        <div className="app-logo">
          <Cpu className="text-[var(--primary)] glow-text-primary" size={28} />
          <div>
            <div className="flex items-end gap-2 flex-nowrap">
              <h1 className="app-title-text" style={{ fontSize: 'calc(1.45rem - 1px)', lineHeight: 1 }}>{t('title')}</h1>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.6rem', fontWeight: 600, lineHeight: 1, letterSpacing: '0.3px', color: 'var(--text-muted)', whiteSpace: 'nowrap', alignSelf: 'flex-end' }}>
                {currentLang === 'pt-br' ? 'por' : 'by'} Mauricio Matte (c) 2026
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] font-medium tracking-wide">{t('subtitle')}</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-slate-900/40 border border-[var(--border)] p-1 rounded-xl backdrop-blur-md">
          <button
            onClick={() => setActiveTab('dsk')}
            className={`tab-btn ${activeTab === 'dsk' ? 'tab-btn-active' : ''}`}
          >
            <Disc size={14} /> {t('tabDsk')}
          </button>
          <button
            onClick={() => setActiveTab('xroar')}
            className={`tab-btn ${activeTab === 'xroar' ? 'tab-btn-active' : ''}`}
          >
            <MonitorPlay size={14} /> {t('tabXroar')}
          </button>
          <button
            onClick={() => setActiveTab('gw')}
            className={`tab-btn ${activeTab === 'gw' ? 'tab-btn-active' : ''}`}
          >
            <HardDrive size={14} /> {t('tabGw')}
          </button>
          <button
            onClick={() => setActiveTab('basic')}
            className={`tab-btn ${activeTab === 'basic' ? 'tab-btn-active' : ''}`}
          >
            <FileCode2 size={14} /> {t('tabBasic')}
          </button>
          {/* Aba EPROM ocultada temporariamente — reativar removendo este comentário.
          <button
            onClick={() => setActiveTab('eprom')}
            className={`tab-btn ${activeTab === 'eprom' ? 'tab-btn-active' : ''}`}
          >
            <Cpu size={14} /> {t('tabEprom')}
          </button>
          */}
        </div>

        {/* Global Toolbar (hex editor + language + exit) */}
        <div className="flex items-center gap-3 bg-slate-900/40 border border-[var(--border)] p-1.5 px-3 rounded-xl backdrop-blur-md">
          {/* Hex Editor (global) — escuro quando fechado, verde quando o modal está aberto */}
          <button
            onClick={handleOpenHexEditor}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              isHexModalOpen
                ? 'bg-[var(--primary)] text-slate-950 shadow-[0_0_10px_var(--primary-glow)] font-extrabold'
                : 'bg-transparent text-[var(--text-secondary)] hover:text-white hover:bg-slate-800/50'
            }`}
            title={t('hexEditorBtn')}
          >
            <Binary size={13} /> HEX/DISASM
          </button>
          <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />

          {/* Plataforma-alvo (CoCo / Dragon) — persistente; define padrão de Novo disco, máquina
              do XRoar e formato GW. Cada disco aberto ainda respeita o seu formato real. */}
          <div className="flex items-center gap-1" title={currentLang === 'pt-br'
            ? 'Plataforma-alvo: define o padrão de "Novo disco", a máquina do XRoar e o formato do Greaseweazle. Discos abertos continuam respeitando o formato real.'
            : 'Target platform: sets the default for "New disk", the XRoar machine and the Greaseweazle format. Opened disks still keep their real format.'}>
            <button
              onClick={() => changePlatform('coco')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                platform === 'coco'
                  ? 'bg-[var(--primary)] text-slate-950 shadow-[0_0_10px_var(--primary-glow)] font-extrabold'
                  : 'bg-transparent text-[var(--text-secondary)] hover:text-white hover:bg-slate-800/50'}`}
            >CoCo</button>
            <button
              onClick={() => changePlatform('dragon')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                platform === 'dragon'
                  ? 'text-slate-950 font-extrabold'
                  : 'bg-transparent text-[var(--text-secondary)] hover:text-white hover:bg-slate-800/50'}`}
              style={platform === 'dragon' ? { background: '#22d3ee', boxShadow: '0 0 10px rgba(34,211,238,0.7)' } : undefined}
            >Dragon</button>
          </div>
          <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />

          {/* BR and US Buttons */}
          <button
            onClick={() => changeLanguage('pt-br')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              currentLang === 'pt-br'
                ? 'bg-[var(--primary)] text-slate-950 shadow-[0_0_10px_var(--primary-glow)] font-extrabold'
                : 'bg-transparent text-[var(--text-secondary)] hover:text-white hover:bg-slate-800/50'
            }`}
            title="Português (Brasil)"
          >
            BR
          </button>
          <button
            onClick={() => changeLanguage('en-us')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              currentLang === 'en-us'
                ? 'bg-[var(--primary)] text-slate-950 shadow-[0_0_10px_var(--primary-glow)] font-extrabold'
                : 'bg-transparent text-[var(--text-secondary)] hover:text-white hover:bg-slate-800/50'
            }`}
            title="English (United States)"
          >
            US
          </button>

          {/* Divider */}
          <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />

          {/* Exit Button */}
          <button
            onClick={() => setIsExitModalOpen(true)}
            className="px-3 py-1 text-xs font-bold text-rose-400 hover:text-white border border-rose-950/40 hover:border-rose-700/60 bg-rose-950/10 hover:bg-rose-950/50 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
            title={t('exitButton')}
          >
            <LogOut size={12} />
            <span>{t('exitButton')}</span>
          </button>
        </div>
      </header>

      {/* Main App Container */}
      <main className={`flex-1 flex flex-col overflow-hidden ${isResizing ? 'select-none' : ''}`} style={{ minHeight: 0 }}>
        
        {/* ===== TAB CONTENT ===== */}
        {activeTab === 'eprom' ? (
        <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
          {/* EPROM tab toolbar (open image + compile) */}
          <div className="flex items-center gap-2 px-4 pt-3">
            <button
              onClick={handleSelectFile}
              className="btn btn-secondary py-1.5 px-3 text-[11px] font-bold uppercase flex items-center gap-1.5 border-[var(--primary)]/40 text-[var(--primary)] hover:bg-[var(--primary-glow)]"
            >
              <FolderOpen size={13} /> {t('openImageHint')}
            </button>
            <button
              disabled={!extractedPayload}
              onClick={handleCompile}
              className="btn btn-primary py-1.5 px-3 text-[11px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Cpu size={13} /> {t('compileButton')}
            </button>
          </div>

          {/* Top Section with resizable vertical panels */}
          <div className="flex-1 flex flex-row overflow-hidden p-4 pb-0 gap-0" style={{ minHeight: 0 }}>
          
          {/* PANEL 1: Input Program Source (Column 1) */}
          <div 
            className="flex flex-col gap-4 overflow-y-auto pr-2 h-full max-h-full flex-shrink-0"
            style={{ width: width1, minHeight: 0 }}
          >
            {/* File Upload card */}
            <section 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`glass-panel p-4 flex flex-col gap-3 animate-slideup relative transition-all duration-300 ${isDragging ? 'border-[var(--primary)] bg-slate-900/80 shadow-[0_0_20px_rgba(20,250,200,0.15)]' : ''}`}
            >
              {isDragging && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm rounded-xl border border-[var(--primary)] flex flex-col items-center justify-center gap-3 z-50 pointer-events-none animate-fadein">
                  <div className="p-4 bg-[var(--primary-glow)] rounded-full text-[var(--primary)] animate-bounce">
                    <Upload size={32} />
                  </div>
                  <div className="text-center px-4">
                    <p className="text-sm text-white font-bold uppercase tracking-wider">
                      {currentLang === 'pt-br' ? 'Solte para Importar' : 'Drop to Import'}
                    </p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                      {currentLang === 'pt-br' ? 'Fita, Imagem de Disco ou Binário CoCo' : 'Tape, Disk Image or CoCo Binary'}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
                <h2 className="text-sm font-bold text-white tracking-wide uppercase flex items-center gap-2">
                  <span className="step-badge">1</span>
                  <Disc className="text-cyan-400" size={16} />
                  {t('inputSourceTitle')}
                </h2>
                {fileDetails && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSelectFile}
                      className="text-[10px] bg-[var(--primary-glow)] hover:bg-[var(--primary)] hover:text-slate-950 text-[var(--primary)] border border-[var(--primary)]/30 font-bold px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Upload size={10} />
                      {currentLang === 'pt-br' ? 'Navegar' : 'Browse'}
                    </button>
                    <span className="text-[10px] bg-slate-800 text-cyan-400 py-0.5 px-2 rounded-full font-bold uppercase">
                      {fileDetails.fileExt}
                    </span>
                  </div>
                )}
              </div>

              {!fileDetails ? (
                <div 
                  onClick={handleSelectFile}
                  className="border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] transition-all cursor-pointer rounded-lg py-5 px-4 flex flex-col items-center justify-center gap-2 bg-slate-950/20"
                >
                  <div className="p-2 bg-slate-900 rounded-full text-slate-500">
                    <Binary size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-white font-semibold">{t('clickToBrowse')}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{t('supportedFormats')}</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-xs bg-slate-950/30 p-2.5 rounded-lg border border-[var(--border)]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">{t('fileNameLabel')}</span>
                    <span className="font-semibold text-white select-all">{fileDetails.fileName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">{t('sizeLabel')}</span>
                    <span className="font-mono text-white">{(fileDetails.size / 1024).toFixed(2)} KB ({fileDetails.size} bytes)</span>
                  </div>
                  {rawFileBuffer && (
                    <>
                      <div className="flex justify-between border-t border-[var(--border)] pt-2 mt-2">
                        <span className="text-[var(--text-secondary)]">{t('cocoProgramNameLabel')}</span>
                        <input 
                          type="text" 
                          maxLength={8}
                          className="input-text py-0 px-2 text-xs font-mono w-24 text-right"
                          value={programName} 
                          onChange={(e) => setProgramName(e.target.value.toUpperCase())}
                        />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">{t('loadAddrLabel')}</span>
                        <span className="font-mono text-cyan-400 font-bold">${loadAddr.toString(16).toUpperCase().padStart(4, '0')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">{t('execAddrLabel')}</span>
                        <span className="font-mono text-purple-400 font-bold">${execAddr.toString(16).toUpperCase().padStart(4, '0')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">{t('payloadSizeLabel')}</span>
                        <span className="font-mono text-white">{extractedPayload ? extractedPayload.length : 0} bytes</span>
                      </div>
                      
                      {/* Botão de abrir modal para o payload extraído */}
                      {extractedPayload && (
                        <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-[var(--border)]">
                          <button
                             onClick={() => {
                              setModalBuffer(extractedPayload);
                              setModalFileName(fileDetails ? fileDetails.fileName : 'extracted_payload');
                              setIsHexModalOpen(true);
                            }}
                            className="btn btn-secondary w-full py-1.5 text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary-glow)]"
                          >
                            <Binary size={12} />
                            {t('extractedPayloadButton')}
                          </button>
                          <button
                            onClick={handleExportBin}
                            className="btn btn-secondary w-full py-1.5 text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 border-cyan-900 text-cyan-400 hover:bg-cyan-950/20"
                          >
                            <Download size={12} />
                            {t('exportBinButton')}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* DSK directory selector */}
              {(dskFiles.length > 0 || dskBuffer) && (
                <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2.5">
                  <h3 className="text-xs font-bold text-white tracking-wider uppercase mb-1 flex items-center gap-1">
                    <Disc size={12} className="text-yellow-400" />
                    {t('dskFilesTitle')} ({dskFiles.length})
                  </h3>
                  <div className="max-h-48 overflow-y-auto border border-[var(--border)] rounded-md">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-900 text-[var(--text-muted)] font-bold border-b border-[var(--border)]">
                          <th className="p-2">{t('dskColName')}</th>
                          <th className="p-2 text-center">{t('dskColType')}</th>
                          <th className="p-2 text-right">{t('dskColSize')}</th>
                          <th className="p-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dskFiles.map((f, idx) => (
                          <tr
                            key={idx}
                            onClick={() => handleExtractDskFile(f)}
                            className={`hover:bg-slate-800 cursor-pointer border-b border-[var(--border)]/40 ${selectedDskFile?.fullName === f.fullName ? 'bg-cyan-950/40 text-cyan-300 font-semibold' : 'text-[var(--text-secondary)]'}`}
                          >
                            <td className="p-2 font-mono">{f.fullName}</td>
                            <td className="p-2 text-center font-semibold">{f.fileTypeName}</td>
                            <td className="p-2 text-right font-mono">{f.totalSize} B</td>
                            <td className="p-2 text-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteDskFile(f); }}
                                className="text-slate-500 hover:text-rose-400 transition-colors"
                                title={t('dskDeleteTitle')}
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={handleAddToDsk}
                      className="btn btn-secondary flex-1 py-1.5 text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 border-[var(--primary)]/40 text-[var(--primary)] hover:bg-[var(--primary-glow)]"
                    >
                      <FilePlus size={12} />
                      {t('dskAddBtn')}
                    </button>
                    <button
                      onClick={handleSaveDsk}
                      className="btn btn-secondary flex-1 py-1.5 text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 border-emerald-900 text-emerald-400 hover:bg-emerald-950/20"
                    >
                      <Save size={12} />
                      {t('dskSaveBtn')}
                    </button>
                  </div>
                </div>
              )}

              {/* Multi-file CAS tape selector */}
              {casFileList.length > 1 && (
                <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2.5">
                  <h3 className="text-xs font-bold text-white tracking-wider uppercase mb-1 flex items-center gap-1">
                    <FileAudio size={12} className="text-purple-400" />
                    {t('casFilesTitle')} ({casFileList.length})
                  </h3>
                  <div className="max-h-48 overflow-y-auto border border-[var(--border)] rounded-md">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-900 text-[var(--text-muted)] font-bold border-b border-[var(--border)]">
                          <th className="p-2">{t('dskColName')}</th>
                          <th className="p-2 text-center">{t('dskColType')}</th>
                          <th className="p-2 text-right">{t('loadAddrLabel')}</th>
                          <th className="p-2 text-right">{t('dskColSize')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {casFileList.map((f, idx) => (
                          <tr
                            key={idx}
                            onClick={() => handleSelectCasFile(f)}
                            className={`hover:bg-slate-800 cursor-pointer border-b border-[var(--border)]/40 ${selectedCasFile === f.name ? 'bg-cyan-950/40 text-cyan-300 font-semibold' : 'text-[var(--text-secondary)]'}`}
                          >
                            <td className="p-2 font-mono">{f.name}</td>
                            <td className="p-2 text-center font-semibold">{f.fileTypeName}</td>
                            <td className="p-2 text-right font-mono">${f.loadAddr.toString(16).toUpperCase().padStart(4, '0')}</td>
                            <td className="p-2 text-right font-mono">{f.size} B</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CAS tape blocks tracker */}
              {casBlocks.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2.5">
                  <h3 className="text-xs font-bold text-white tracking-wider uppercase mb-1 flex items-center gap-1">
                    <FileAudio size={12} className="text-purple-400" />
                    {t('casBlocksTitle')} ({casBlocks.length})
                  </h3>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-slate-950/20 rounded border border-[var(--border)]">
                    {casBlocks.map((b, idx) => (
                      <span 
                        key={idx} 
                        className={`text-[8px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${b.type === 0 ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900' : b.type === 1 ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-900' : 'bg-rose-950/60 text-rose-400 border border-rose-900'}`}
                        title={`Tipo: ${b.typeName}, Tamanho: ${b.length} bytes`}
                      >
                        {b.type === 0 ? 'HDR' : b.type === 1 ? 'DAT' : 'EOF'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* SPLITTER 1 */}
          <div className="splitter-v" onMouseDown={startResizing1} />

          {/* PANEL 2: Settings & Conversions (Column 2) */}
          <div
            className="flex-1 flex flex-col gap-4 overflow-y-auto px-2 h-full max-h-full"
            style={{ minHeight: 0 }}
          >
            {/* Cartridge build configuration card */}
            <section className="glass-panel p-3 flex flex-col gap-2 animate-slideup">
              <h2 className="text-sm font-bold text-white border-b border-[var(--border)] pb-2 tracking-wide uppercase flex items-center gap-2">
                <span className="step-badge">2</span>
                <Sliders className="text-purple-400" size={16} />
                {t('epromConfigTitle')}
              </h2>

              {!extractedPayload ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <Sliders size={26} className="text-slate-500 opacity-30" />
                  <p className="text-xs text-[var(--text-secondary)]" style={{ maxWidth: 220 }}>{t('configLockedHint')}</p>
                </div>
              ) : (
              <div className="flex flex-col gap-1.5 text-xs">
                {/* Emulator mode — destaque no topo (diferencial) */}
                <div className="flex flex-col gap-1 bg-[var(--primary-glow)] border border-[var(--primary)]/40 rounded-lg py-2 px-2.5">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-[var(--primary)] flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                      <Cpu size={13} />
                      {t('emuModeLabel')}
                      <button
                        type="button"
                        onClick={() => toggleHint('emu')}
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${activeHint === 'emu' ? 'bg-[var(--primary-glow)] text-[var(--primary)] border border-[var(--primary)]/30' : 'text-slate-500 hover:text-[var(--primary)] hover:bg-slate-800/40'}`}
                        title="Ajuda"
                      >
                        <HelpCircle size={12} />
                      </button>
                    </span>
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-[var(--primary)] cursor-pointer flex-shrink-0"
                      checked={emulatorMode}
                      onChange={(e) => setEmulatorMode(e.target.checked)}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)]">{t('emuModeTagline')}</span>
                  {activeHint === 'emu' && (
                    <div className="text-[10px] text-[var(--text-secondary)] bg-slate-950/60 p-2.5 rounded-lg border border-[var(--primary)]/30 leading-relaxed mt-1 animate-slideup flex gap-2 items-start">
                      <HelpCircle size={12} className="text-[var(--primary)] mt-0.5 flex-shrink-0" />
                      <span>{t('emuModeHint')}</span>
                    </div>
                  )}
                </div>

                {/* Target ROM Size */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[var(--text-secondary)] font-semibold flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                      {t('epromSizeLabel')}
                      <button 
                        type="button"
                        onClick={() => toggleHint('eprom')}
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${activeHint === 'eprom' ? 'bg-[var(--primary-glow)] text-[var(--primary)] border border-[var(--primary)]/30' : 'text-slate-500 hover:text-[var(--primary)] hover:bg-slate-800/40'}`}
                        title="Ajuda"
                      >
                        <HelpCircle size={12} />
                      </button>
                    </span>
                    <span className="text-white font-mono">{epromSizeKb} KB ({epromSizeKb * 1024} bytes)</span>
                  </label>
                  <select 
                    className="input-select"
                    value={epromSizeKb}
                    onChange={(e) => setEpromSizeKb(parseInt(e.target.value))}
                  >
                    <option value={4}>{t('eprom4kOption')}</option>
                    <option value={8}>{t('eprom8kOption')}</option>
                    <option value={16}>{t('eprom16kOption')}</option>
                    <option value={32}>{t('eprom32kOption')}</option>
                    <option value={64}>{t('eprom64kOption')}</option>
                  </select>
                  {activeHint === 'eprom' && (
                    <div className="text-[10px] text-[var(--text-secondary)] bg-slate-950/60 p-2.5 rounded-lg border border-[var(--primary)]/30 leading-relaxed mt-1 animate-slideup shadow-[0_0_10px_rgba(20,250,200,0.03)] flex gap-2 items-start">
                      <HelpCircle size={12} className="text-[var(--primary)] mt-0.5 flex-shrink-0" />
                      <span>{t('epromSizeHint')}</span>
                    </div>
                  )}
                </div>

                {/* Loader Type Stage */}
                <div className="flex flex-col gap-1.5 bg-slate-900/40 py-1.5 px-2.5 rounded-lg border border-[var(--border)]">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      {t('allRamLabel')}
                      <button 
                        type="button"
                        onClick={() => toggleHint('allRam')}
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${activeHint === 'allRam' ? 'bg-[var(--primary-glow)] text-[var(--primary)] border border-[var(--primary)]/30' : 'text-slate-500 hover:text-[var(--primary)] hover:bg-slate-800/40'}`}
                        title="Ajuda"
                      >
                        <HelpCircle size={12} />
                      </button>
                    </span>
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 accent-[var(--primary)] cursor-pointer flex-shrink-0"
                      checked={useTwoStage}
                      onChange={(e) => setUseTwoStage(e.target.checked)}
                    />
                  </div>
                  {activeHint === 'allRam' && (
                    <div className="text-[10px] text-[var(--text-secondary)] bg-slate-950/60 p-2.5 rounded-lg border border-[var(--primary)]/30 leading-relaxed mt-1 animate-slideup shadow-[0_0_10px_rgba(20,250,200,0.03)] flex gap-2 items-start">
                      <HelpCircle size={12} className="text-[var(--primary)] mt-0.5 flex-shrink-0" />
                      <span>{t('allRamHint')}</span>
                    </div>
                  )}
                </div>

                {/* Filler Byte */}
                <div className="flex flex-col gap-1.5 bg-slate-900/10 py-1.5 px-2.5 rounded-lg border border-[var(--border)]/40">
                  <div className="flex justify-between items-center">
                    <label className="text-[var(--text-secondary)] font-semibold flex items-center gap-1.5">
                      {t('fillerByteLabel')}
                      <button 
                        type="button"
                        onClick={() => toggleHint('fillerByte')}
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${activeHint === 'fillerByte' ? 'bg-[var(--primary-glow)] text-[var(--primary)] border border-[var(--primary)]/30' : 'text-slate-500 hover:text-[var(--primary)] hover:bg-slate-800/40'}`}
                        title="Ajuda"
                      >
                        <HelpCircle size={12} />
                      </button>
                    </label>
                    <input 
                      type="number" 
                      min={0}
                      max={255}
                      className="input-text py-1 w-16 text-center font-mono"
                      value={fillerByte}
                      onChange={(e) => setFillerByte(Math.max(0, Math.min(255, parseInt(e.target.value) || 0)))}
                    />
                  </div>
                  {activeHint === 'fillerByte' && (
                    <div className="text-[10px] text-[var(--text-secondary)] bg-slate-950/60 p-2.5 rounded-lg border border-[var(--primary)]/30 leading-relaxed mt-1 animate-slideup shadow-[0_0_10px_rgba(20,250,200,0.03)] flex gap-2 items-start">
                      <HelpCircle size={12} className="text-[var(--primary)] mt-0.5 flex-shrink-0" />
                      <span>{t('fillerByteHint')}</span>
                    </div>
                  )}
                </div>

                {/* Compile and Save actions */}
                <div className="flex flex-col gap-2 pt-3 border-t border-[var(--border)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">{t('cartExportTitle')}</span>
                  <button
                    disabled={!extractedPayload}
                    onClick={handleCompile}
                    className="btn btn-primary w-full py-2 font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Cpu size={16} />
                    {t('compileButton')}
                  </button>

                  {compilationSuccess && compiledRom && (
                    <button
                      onClick={handleSaveRom}
                      className="btn btn-secondary w-full py-2 font-bold uppercase tracking-wider text-emerald-400 border-emerald-900/60 hover:bg-emerald-950/30 flex items-center justify-center gap-2 pulse-primary"
                    >
                      <Download size={16} />
                      {t('exportRomButton')}
                    </button>
                  )}

                  {compilationSuccess && compiledRom && (
                    <button
                      onClick={handleExportCocoFlash}
                      className="btn btn-secondary w-full py-2 text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 border-[var(--primary)]/40 text-[var(--primary)] hover:bg-[var(--primary-glow)]"
                      title={t('cocoFlashGuide')}
                    >
                      <Cpu size={13} />
                      {t('exportCocoFlash')}
                    </button>
                  )}

                  {/* Export for emulator (.cas / .dsk) */}
                  {extractedPayload && (
                    <div className="flex flex-col gap-1.5 pt-2 mt-1 border-t border-[var(--border)]">
                      <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">{t('emuExportTitle')}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={handleExportEmuCas}
                          className="btn btn-secondary flex-1 py-1.5 text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 border-purple-900 text-purple-300 hover:bg-purple-950/20"
                        >
                          <FileAudio size={12} />
                          {t('exportEmuCas')}
                        </button>
                        <button
                          onClick={handleExportEmuDsk}
                          className="btn btn-secondary flex-1 py-1.5 text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 border-yellow-900 text-yellow-300 hover:bg-yellow-950/20"
                        >
                          <Disc size={12} />
                          {t('exportEmuDsk')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              )}
            </section>

            {/* Visual Memory Map */}
            {extractedPayload && (
              <section className="glass-panel p-4 flex flex-col gap-2 animate-slideup">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sliders size={14} className="text-cyan-400" />
                  {t('memoryMapTitle')}
                </h3>
                
                {/* EPROM Visual Map — shows ONE 16K bank window ($C000-$FEFF), which is all the CoCo sees at a time */}
                {(() => {
                  const chipBytes = epromSizeKb * 1024;
                  const bankBytes = Math.min(chipBytes, 0x4000); // 16K physical bank
                  const usable = Math.min(chipBytes, BANK_USABLE_BYTES); // visible window
                  const windowEnd = 0xC000 + usable - 1;
                  return (
                <div className="flex flex-col gap-1 text-[10px]">
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>{t('epromLayoutLabel')} ($C000 - ${windowEnd.toString(16).toUpperCase()})</span>
                    <span>{epromSizeKb} KB{numBanks > 1 ? ` · ${numBanks}×16K` : ''}</span>
                  </div>
                  <div className="mem-bar mt-1">
                    {/* Loader portion */}
                    <div
                      className="mem-block bg-purple-600 border-r border-purple-800"
                      style={{ width: `${Math.max(5, (loaderSize / bankBytes) * 100)}%` }}
                      title={`Bootstrap: ${loaderSize} bytes`}
                    >
                      {loaderSize > 0 && t('bootLabel')}
                    </div>
                    {/* Game payload portion */}
                    <div
                      className="mem-block bg-cyan-600 border-r border-cyan-800"
                      style={{ width: `${(extractedPayload.length / bankBytes) * 100}%` }}
                      title={`Payload: ${extractedPayload.length} bytes`}
                    >
                      {extractedPayload.length > 2000 ? `${(extractedPayload.length / 1024).toFixed(1)}K ${t('payloadLabel')}` : t('payloadLabel')}
                    </div>
                    {/* Remaining empty space */}
                    <div
                      className="mem-block bg-slate-900 text-slate-500 font-normal"
                      style={{ flex: 1 }}
                      title={`Free space: ${Math.max(0, usable - loaderSize - extractedPayload.length)} bytes`}
                    >
                      {t('freeSpaceLabel')}
                    </div>
                  </div>
                  {numBanks > 1 && (
                    <div className="text-[9px] text-[var(--text-muted)] mt-1">
                      {currentLang === 'pt-br'
                        ? `Banco espelhado em ${numBanks} bancos de 16K — boot em qualquer posição do jumper.`
                        : `Bank mirrored across ${numBanks} 16K banks — boots at any jumper position.`}
                    </div>
                  )}
                </div>
                  );
                })()}
              </section>
            )}
          </div>

          </div>
        </div>
        ) : activeTab === 'gw' ? (
          renderGwTab()
        ) : activeTab === 'basic' ? (
          <BasicEditor
            lang={currentLang}
            text={basicText}
            onTextChange={setBasicText}
            name={basicName}
            onNameChange={setBasicName}
            pane={basicPane}
            onPaneChange={setBasicPane}
            screen={basicScreen}
            onScreenChange={setBasicScreen}
            addNew={basicAddNew}
            onAddNewChange={setBasicAddNew}
            addRun={basicAddRun}
            onAddRunChange={setBasicAddRun}
            bold={basicBold}
            onBoldChange={setBasicBold}
            onRun={handleBasicRun}
            onSaveToDisk={handleBasicSaveToDisk}
            onSaveTextFile={handleBasicSaveTextFile}
            onOpenTextFile={handleBasicOpenTextFile}
            sourceLabel={basicSource ? `${basicSource.entry.fullName} (${basicSource.pane})` : null}
            onUpdateInDsk={handleBasicUpdateInDsk}
          />
        ) : activeTab === 'xroar' ? null : (
          <div className="flex-1 flex flex-col overflow-hidden p-3" style={{ minHeight: 0 }}>
            {/* DSK toolbar — folga simples (mb-3) como na aba BASIC; o brilho do painel ativo
                foi reduzido p/ anel fino (CSS .dsk-pane-active) para não vazar e "colar" na barra. */}
            <div className="flex items-center gap-1.5 mb-3 flex-wrap flex-shrink-0">
              <button onClick={handleDskNew} title={t('dskToolNew')} aria-label={t('dskToolNew')} className="dsk-tool"><Plus size={15} /></button>
              <button onClick={handleDskInject} disabled={getPane(activePane)?.format === 'dragon'} title={t('dskToolInject')} aria-label={t('dskToolInject')} className="dsk-tool"><FileInput size={15} /></button>
              <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
              <button onClick={() => handleDskCopy(false)} disabled={!selectedDsk?.entries.length} title={t('dskToolCopy')} aria-label={t('dskToolCopy')} className="dsk-tool"><Copy size={15} /></button>
              <button onClick={() => handleDskCopy(true)} disabled={!selectedDsk?.entries.length || getPane(selectedDsk?.pane)?.format === 'dragon'} title={t('dskToolCut')} aria-label={t('dskToolCut')} className="dsk-tool"><Scissors size={15} /></button>
              <button onClick={handleDskPaste} disabled={!dskClipboard || getPane(activePane)?.format === 'dragon'} title={t('dskToolPaste')} aria-label={t('dskToolPaste')} className="dsk-tool"><Clipboard size={15} /></button>
              <button onClick={handleDskDelete} disabled={!selectedDsk?.entries.length || getPane(selectedDsk?.pane)?.format === 'dragon'} title={t('dskToolDelete')} aria-label={t('dskToolDelete')} className="dsk-tool dsk-tool-danger"><Trash2 size={15} /></button>
              <button
                onClick={handleDskEditBas}
                disabled={!(selectedDsk?.entries.length && (selectedDsk.entries[0].ext || '').toUpperCase() === 'BAS')}
                title={t('Editar .BAS no editor BASIC', 'Edit .BAS in the BASIC editor')}
                aria-label="Editar BAS"
                className="dsk-tool"
              >
                <FileCode2 size={15} /> {t('Editar', 'Edit')}
              </button>
              <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
              <button onClick={handleCopyPaneAToB} disabled={!paneA} title={t('dskToolCopyAtoB')} aria-label={t('dskToolCopyAtoB')} className="dsk-tool"><ArrowRight size={15} /></button>
              <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
              <button onClick={handleDskUndo} disabled={dskUndo.length === 0} title={t('dskToolUndo')} aria-label={t('dskToolUndo')} className="dsk-tool"><Undo2 size={15} /></button>
              <button onClick={handleDskRedo} disabled={dskRedo.length === 0} title={t('dskToolRedo')} aria-label={t('dskToolRedo')} className="dsk-tool"><Redo2 size={15} /></button>
              <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
              <button onClick={handleDskSort} disabled={!getPane(activePane)?.files.length || getPane(activePane)?.format === 'dragon'} title={t('dskToolSort')} aria-label={t('dskToolSort')} className="dsk-tool"><ArrowDownAZ size={15} /></button>
              {getPane(activePane)?.container && (
                <button onClick={handleDskSortAll} disabled={!getPane(activePane)?.files.length || getPane(activePane)?.format === 'dragon'} title={t('dskToolSortAll')} aria-label={t('dskToolSortAll')} className="dsk-tool"><Layers size={15} /></button>
              )}
              {/* Salvar = sobrescreve o arquivo de origem (sem diálogo). Destaque amarelo se há alterações. */}
              <button
                onClick={handleDskSaveOverwrite}
                disabled={!getPane(activePane)}
                title={dskDirty[activePane] ? `${t('dskToolSave')} • ${t('dskUnsaved')}` : t('dskToolSave')}
                aria-label={t('dskToolSave')}
                className="dsk-tool"
                style={dskDirty[activePane] ? { color: 'hsl(45,95%,62%)', borderColor: 'hsl(45,90%,55%)', boxShadow: '0 0 9px hsla(45,90%,55%,0.65)' } : undefined}
              >
                <Save size={15} /> {t('dskToolSave')}
                {dskDirty[activePane] && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(45,95%,60%)', display: 'inline-block', marginLeft: 4, boxShadow: '0 0 5px hsl(45,95%,60%)' }} />}
              </button>
              {/* Salvar Como = abre o diálogo "Salvar como" e grava numa nova imagem (preserva a anterior). */}
              <button
                onClick={handleDskSaveAs}
                disabled={!getPane(activePane)}
                title={t('dskToolSaveAs')}
                aria-label={t('dskToolSaveAs')}
                className="dsk-tool"
              >
                <Download size={15} /> {t('dskToolSaveAs')}
              </button>
              <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
              <button onClick={handleTestInXroar} disabled={!getPane(activePane)} title={t('dskToolXroar')} aria-label={t('dskToolXroar')} className="dsk-tool" style={{ color: 'var(--primary)' }}><MonitorPlay size={15} /> {t('dskToolXroarShort')}</button>
              <button onClick={handleDskWriteToGw} disabled={!getPane(activePane)} title={t('dskToolGw')} aria-label={t('dskToolGw')} className="dsk-tool"><HardDrive size={15} /> {t('dskToolGwShort')}</button>
              {dskClipboard && <span className="text-[10px] text-[var(--text-secondary)] ml-2">📋 {dskClipboard.name}.{dskClipboard.ext}{dskClipboard.cut ? ' ✂' : ''}</span>}
              <span className="ml-auto flex items-center pl-4 pr-3 -mr-3 flex-shrink-0" style={{ borderLeft: '1px solid var(--border)' }}>
                <span
                  className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-md text-[var(--primary)]"
                  style={{ border: '1px solid var(--primary)', boxShadow: '0 0 8px var(--primary-glow)', background: 'var(--primary-glow)' }}
                >
                  {t('dskActivePane')}: {activePane}
                </span>
              </span>
            </div>
            {/* Região dos painéis: ocupa só o espaço que sobra abaixo da toolbar (que tem altura
                natural garantida por flex-shrink-0), evitando que a toolbar seja cortada. */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
              {/* Pane A (top) */}
              <div style={{ height: dskTopHeight, minHeight: 0 }} className="flex-shrink-0">
                {renderDskPane('A', paneA)}
              </div>
              {/* DSK horizontal splitter */}
              <div className="splitter-h my-1.5" onMouseDown={startResizingDskSplit} />
              {/* Pane B (bottom) */}
              <div className="flex-1" style={{ minHeight: 0 }}>
                {renderDskPane('B', paneB)}
              </div>
            </div>
          </div>
        )}

        {/* XRoar emulator — always mounted (hidden unless active) so it never reboots on tab switch */}
        <div style={{ display: activeTab === 'xroar' ? 'flex' : 'none', flex: '1 1 0%', minHeight: 0, flexDirection: 'column' }}>
          <XRoarPanel lang={currentLang} active={activeTab === 'xroar'} pendingLoad={xroarLoad} pendingType={xroarType} onLog={addLog} platform={platform} />
        </div>

        {/* SPLITTER 3 (Horizontal) */}
        <div className="splitter-h" onMouseDown={startResizingConsole} />

        {/* BOTTOM PANEL: Diagnostic Console */}
        <div
          className={`w-full flex flex-col overflow-hidden px-4 bg-slate-950/20 ${consoleMax ? 'console-max' : ''}`}
          style={{ height: consoleHeight, minHeight: 0, marginBottom: 24 }}
        >
          {/* Action Log Console */}
          <section className="glass-panel h-full w-full flex flex-col overflow-hidden bg-slate-950/40">
            <div className="flex justify-between items-center px-4 py-2 border-b border-[var(--border)] bg-slate-900/40">
              <span className="text-[10px] font-bold text-white tracking-widest uppercase flex items-center gap-1.5">
                <Terminal size={12} className="text-[var(--primary)]" />
                {t('consoleTitle')}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setLogs([])}
                  className="text-[9px] text-[var(--text-muted)] hover:text-white uppercase font-bold"
                >
                  {t('clearConsole')}
                </button>
                <button
                  onClick={() => setConsoleMax(m => !m)}
                  className="text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                  title={consoleMax ? t('consoleRestore') : t('consoleMaximize')}
                >
                  {consoleMax ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] space-y-1.5 select-text">
              {logs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-[var(--text-muted)] select-none">[{log.time}]</span>
                  <span className={
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'warn' ? 'text-amber-400' :
                    log.type === 'error' ? 'text-rose-400' :
                    'text-cyan-300'
                  }>
                    {currentLang === 'pt-br' ? log.textPt : log.textEn}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </section>
        </div>

      </main>

      {/* Floating Sub-editor Hexadecimal Modal Overlay */}
      {isHexModalOpen && modalBuffer && (
        <div className="glass-modal-overlay" onClick={() => { setHexEditTarget(null); setIsHexModalOpen(false); }}>
          <div className="glass-modal-content" onClick={(e) => e.stopPropagation()} style={showDisasm ? { maxWidth: 1400, width: '96vw' } : undefined}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-active)] bg-slate-900/80">
              <div className="flex items-center gap-3">
                <Binary className="text-[var(--primary)] glow-text-primary" size={20} />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    {t('modalTitle')}
                  </h3>
                  <p className="text-[10px] text-[var(--text-secondary)] font-medium">
                    {t('modalSubtitle')} <strong className="text-cyan-400 font-mono">{modalFileName}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setHexEditTarget(null); setIsHexModalOpen(false); }}
                className="text-xs text-[var(--text-muted)] hover:text-white uppercase font-bold px-2 py-1 rounded hover:bg-slate-800 transition-all"
              >
                {t('modalClose')}
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-row">
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ minWidth: 0 }}>
                <HexEditor
                  buffer={modalBuffer}
                  onChange={(newBuf) => {
                    setModalBuffer(newBuf);
                  }}
                  baseAddress={loadAddr}
                  t={t}
                  onSelect={setHexSel}
                  onRangeChange={(s, e) => setHexRange([s, e])}
                />
              </div>
              {showDisasm && (
                <div
                  onMouseDown={startResizingDisasm}
                  className="flex-shrink-0"
                  style={{ width: 6, cursor: 'col-resize', background: 'var(--border-active)' }}
                  title={currentLang === 'pt-br' ? 'Arraste para redimensionar' : 'Drag to resize'}
                />
              )}
              {showDisasm && (() => {
                const origin = (parseInt(disasmOrigin, 16) || loadAddr || 0) & 0xFFFF;
                const lines = disasmFlow ? disassembleSmart(modalBuffer, origin, [execAddr], { dataRanges: disasmData, codeOffsets: disasmCode, cvecRanges: disasmCvec, dvecRanges: disasmDvec }) : disassemble(modalBuffer, origin);
                disasmLinesRef.current = lines;
                return (
                  <div className="flex flex-col min-h-0 flex-shrink-0" style={{ width: disasmWidth, minWidth: 240 }}>
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-slate-900/70 flex-shrink-0">
                      <Cpu size={13} className="text-[var(--primary)]" />
                      <span className="text-[10px] uppercase font-bold text-[var(--primary)] tracking-wider">ASM 6809</span>
                      <label className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 cursor-pointer ml-2" title={currentLang === 'pt-br' ? 'Segue o fluxo a partir do ponto de execução; o que não é código vira dados/strings (FCB/FCC). Desmarque p/ desmontagem linear.' : 'Follows flow from the exec point; non-code becomes data/strings (FCB/FCC). Uncheck for linear disassembly.'}>
                        <input type="checkbox" checked={disasmFlow} onChange={e => setDisasmFlow(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                        {currentLang === 'pt-br' ? 'Seguir fluxo' : 'Follow flow'}
                      </label>
                      <span className="text-[10px] text-[var(--text-secondary)] ml-auto">{currentLang === 'pt-br' ? 'Origem $' : 'Origin $'}</span>
                      <input
                        value={disasmOrigin}
                        onChange={e => setDisasmOrigin(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 4).toUpperCase())}
                        placeholder={(loadAddr || 0).toString(16).toUpperCase().padStart(4, '0')}
                        className="input-text py-0.5 text-[11px] font-mono text-center"
                        style={{ width: 64 }}
                        title={currentLang === 'pt-br' ? 'Endereço de carga (hex) onde o código começa. Padrão = endereço de carga do .BIN.' : 'Load address (hex) where code starts. Default = .BIN load address.'}
                      />
                    </div>
                    {/* Marcação manual (Fase 3): selecione bytes no hexa (clique + shift-clique) e marque. */}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--border)] bg-slate-950/40 flex-shrink-0 flex-wrap">
                      <span className="text-[9px] uppercase text-[var(--text-muted)] tracking-wider">{currentLang === 'pt-br' ? 'Marcar sel.:' : 'Mark sel.:'}</span>
                      <button
                        onClick={addDisasmDataMark}
                        disabled={hexRange[0] < 0}
                        className="dsk-tool text-[10px]" style={{ padding: '2px 6px' }}
                        title={currentLang === 'pt-br' ? 'Força a seleção a ser tratada como DADOS (FCB/FCC)' : 'Force selection to be treated as DATA (FCB/FCC)'}
                      >{currentLang === 'pt-br' ? 'Dados' : 'Data'}</button>
                      <button
                        onClick={addDisasmCodeMark}
                        disabled={hexRange[0] < 0}
                        className="dsk-tool text-[10px]" style={{ padding: '2px 6px' }}
                        title={currentLang === 'pt-br' ? 'Força o início da seleção a ser tratado como CÓDIGO (entrada do disassembly)' : 'Force the selection start to be treated as CODE (disassembly entry)'}
                      >{currentLang === 'pt-br' ? 'Código' : 'Code'}</button>
                      <button
                        onClick={addDisasmCvecMark}
                        disabled={hexRange[0] < 0}
                        className="dsk-tool text-[10px]" style={{ padding: '2px 6px' }}
                        title={currentLang === 'pt-br' ? 'Marca a seleção como TABELA DE VETORES DE CÓDIGO (FDB): cada par de bytes é um endereço de código, seguido e rotulado' : 'Mark selection as a CODE-VECTOR table (FDB): each 2-byte entry is a code address, followed and labeled'}
                      >C-vetor</button>
                      <button
                        onClick={addDisasmDvecMark}
                        disabled={hexRange[0] < 0}
                        className="dsk-tool text-[10px]" style={{ padding: '2px 6px' }}
                        title={currentLang === 'pt-br' ? 'Marca a seleção como TABELA DE VETORES DE DADOS (FDB): cada par de bytes é um endereço, rotulado (sem seguir como código)' : 'Mark selection as a DATA-VECTOR table (FDB): each 2-byte entry is an address, labeled (not followed as code)'}
                      >D-vetor</button>
                      <button
                        onClick={clearDisasmMarks}
                        disabled={!disasmData.length && !disasmCode.length && !disasmCvec.length && !disasmDvec.length}
                        className="dsk-tool text-[10px]" style={{ padding: '2px 6px' }}
                        title={currentLang === 'pt-br' ? 'Remove todas as marcações' : 'Clear all marks'}
                      >{currentLang === 'pt-br' ? 'Limpar' : 'Clear'}</button>
                      <span className="text-[9px] text-[var(--text-muted)] ml-1">
                        {hexRange[0] >= 0
                          ? `$${(origin + hexRange[0]).toString(16).toUpperCase().padStart(4, '0')}–$${(origin + hexRange[1]).toString(16).toUpperCase().padStart(4, '0')}`
                          : (currentLang === 'pt-br' ? '(clique/shift-clique no hexa)' : '(click/shift-click in hex)')}
                        {(disasmData.length || disasmCode.length || disasmCvec.length || disasmDvec.length) ? ` · ${disasmData.length}D/${disasmCode.length}C/${disasmCvec.length}cv/${disasmDvec.length}dv` : ''}
                      </span>
                    </div>
                    <div ref={disasmPreRef} className="flex-1 min-h-0 overflow-auto p-2 text-[11px] font-mono leading-tight select-text" style={{ color: 'var(--text-secondary)' }}>
                      {lines.map((l, k) => {
                        // destaca a instrução cujo intervalo de bytes contém o offset selecionado no hexa
                        const sel = hexSel != null && (origin + hexSel) >= l.addr && (origin + hexSel) < l.addr + l.bytes.length;
                        const isLabel = l.bytes.length === 0 && !!l.label; // marcador "L####:"
                        return (
                          <div
                            key={k}
                            data-disasm-addr={l.addr}
                            className="whitespace-pre px-1 rounded-sm"
                            style={sel ? { background: '#ff8c1a', color: '#000', fontWeight: 700 } : isLabel ? { color: 'var(--primary)', fontWeight: 700 } : undefined}
                          >
                            {formatLine(l)}
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-3 py-1.5 border-t border-[var(--border)] bg-slate-950/40 text-[9px] text-[var(--text-muted)] flex-shrink-0">
                      {disasmFlow && typeof (lines as { coverage?: number }).coverage === 'number' && (() => {
                        const cov = Math.round(((lines as { coverage?: number }).coverage || 0) * 100);
                        const sparse = (lines as { sparse?: boolean }).sparse;
                        return (
                          <div className={sparse ? 'text-amber-400 mb-1' : 'mb-1'}>
                            {currentLang === 'pt-br'
                              ? `Fluxo alcançou ${cov}% do arquivo como código.${sparse ? ' Baixa cobertura (provável loader que remapeia/salta p/ fora) — o resto foi desmontado linearmente. Marque os blocos de dados, ou ajuste a Origem.' : ''}`
                              : `Flow reached ${cov}% of the file as code.${sparse ? ' Low coverage (likely a relocating/mapping loader) — the rest was disassembled linearly. Mark the data blocks, or adjust Origin.' : ''}`}
                          </div>
                        );
                      })()}
                      {currentLang === 'pt-br'
                        ? 'Somente leitura. Labels L#### nos desvios e ponteiros (LDX #tab); registradores nomeados (MAPRAM=$FFDF); <$xx resolvido pelo DP (LDA #/TFR ..,DP). Marque tabelas com C-vetor (código) / D-vetor (dados) → FDB rotulado.'
                        : 'Read-only. L#### labels on branches and pointers (LDX #tab); named registers (MAPRAM=$FFDF); <$xx resolved via DP (LDA #/TFR ..,DP). Mark tables with C-vetor (code) / D-vetor (data) → labeled FDB.'}
                    </div>
                  </div>
                );
              })()}
            </div>
            
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border)] bg-slate-950/40">
              <button
                onClick={() => { setHexEditTarget(null); setIsHexModalOpen(false); }}
                className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase"
              >
                {t('modalCancel')}
              </button>
              <button
                onClick={handleHexSave}
                className="btn btn-primary py-2 px-5 text-xs font-bold uppercase shadow-[0_0_15px_rgba(20,250,200,0.15)]"
              >
                {t('modalSave')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit confirmation modal */}
      {isExitModalOpen && (
        <div className="glass-modal-overlay" onClick={() => setIsExitModalOpen(false)}>
          <div
            className="glass-panel p-5 flex flex-col gap-4"
            style={{ width: 380, maxWidth: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-rose-950/30 text-rose-400 flex-shrink-0">
                <LogOut size={20} />
              </div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{t('exitConfirmTitle')}</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{t('exitConfirmMsg')}</p>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setIsExitModalOpen(false)}
                className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase"
              >
                {t('modalCancel')}
              </button>
              <button
                onClick={() => { setIsExitModalOpen(false); window.cocoApi.appCloseConfirmed(); }}
                className="btn py-2 px-5 text-xs font-bold uppercase flex items-center gap-1.5"
                style={{ backgroundColor: 'hsl(0, 72%, 45%)', color: '#fff' }}
              >
                <LogOut size={13} />
                {t('exitButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GW read overwrite confirmation — alerta que o painel-alvo será sobrescrito pelo disco lido */}
      {gwReadConfirm && (
        <div className="glass-modal-overlay" onClick={() => setGwReadConfirm(false)}>
          <div className="glass-panel p-5 flex flex-col gap-4" style={{ width: 420, maxWidth: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-950/30 text-amber-400 flex-shrink-0"><AlertTriangle size={20} /></div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{currentLang === 'pt-br' ? `Sobrescrever Painel ${gwPane}?` : `Overwrite Pane ${gwPane}?`}</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {currentLang === 'pt-br'
                ? `O Painel ${gwPane} já contém uma imagem. A leitura do Greaseweazle vai SUBSTITUIR todo o conteúdo do Painel ${gwPane} pelo disco lido. Alterações não salvas serão perdidas — cancele para salvar antes.`
                : `Pane ${gwPane} already contains an image. The Greaseweazle read will REPLACE all of Pane ${gwPane}'s content with the read disk. Unsaved changes will be lost — cancel to save first.`}
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setGwReadConfirm(false)} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{t('modalCancel')}</button>
              <button onClick={doGwRead} className="btn py-2 px-5 text-xs font-bold uppercase flex items-center gap-1.5" style={{ backgroundColor: 'hsl(30, 75%, 42%)', color: '#fff' }}>
                <Download size={13} /> {currentLang === 'pt-br' ? `Ler e sobrescrever` : `Read and overwrite`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DSK "Gravar GW" confirmation — avisa que a gravação usará as configurações atuais da aba GW */}
      {dskGwConfirm && (
        <div className="glass-modal-overlay" onClick={() => setDskGwConfirm(false)}>
          <div className="glass-panel p-5 flex flex-col gap-4" style={{ width: 420, maxWidth: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-950/30 text-amber-400 flex-shrink-0"><AlertTriangle size={20} /></div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{currentLang === 'pt-br' ? 'Gravar no Greaseweazle?' : 'Write to Greaseweazle?'}</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {currentLang === 'pt-br'
                ? 'O disco será gravado agora, conforme as configuração do GW. Se você não ter certeza, cancele a operação e verifique suas configurações antes.'
                : 'The disk will be written now, using the current GW settings. If you are not sure, cancel the operation and check your settings first.'}
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setDskGwConfirm(false)} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{t('modalCancel')}</button>
              <button onClick={proceedDskWriteToGw} className="btn py-2 px-5 text-xs font-bold uppercase flex items-center gap-1.5" style={{ backgroundColor: 'hsl(30, 75%, 42%)', color: '#fff' }}>
                <HardDrive size={13} /> {currentLang === 'pt-br' ? 'Prosseguir' : 'Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BASIC "Salvar" in-place: arquivo de origem sumiu / disco trocado — confirma antes de gravar */}
      {basicUpdateConfirm && (
        <div className="glass-modal-overlay" onClick={() => setBasicUpdateConfirm(null)}>
          <div className="glass-panel p-5 flex flex-col gap-4" style={{ width: 450, maxWidth: '92%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-950/30 text-amber-400 flex-shrink-0"><AlertTriangle size={20} /></div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{currentLang === 'pt-br' ? 'Arquivo de origem indisponível' : 'Source file unavailable'}</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {currentLang === 'pt-br'
                ? (basicUpdateConfirm.reason === 'diskChanged'
                    ? `A imagem/disco do Painel ${basicUpdateConfirm.which} foi trocada desde que "${basicUpdateConfirm.name}" foi aberto. Não dá para garantir que seja o mesmo arquivo. Você pode CANCELAR, ou gravar "${basicUpdateConfirm.name}" como um NOVO arquivo no disco atual do Painel ${basicUpdateConfirm.which}.`
                    : `O arquivo "${basicUpdateConfirm.name}" não existe mais no disco atual do Painel ${basicUpdateConfirm.which} (foi removido ou a imagem mudou). Você pode CANCELAR, ou gravá-lo como um NOVO arquivo no disco atual.`)
                : (basicUpdateConfirm.reason === 'diskChanged'
                    ? `Pane ${basicUpdateConfirm.which}'s image/disk changed since "${basicUpdateConfirm.name}" was opened. It can't be guaranteed to be the same file. You can CANCEL, or save "${basicUpdateConfirm.name}" as a NEW file on Pane ${basicUpdateConfirm.which}'s current disk.`
                    : `"${basicUpdateConfirm.name}" no longer exists on Pane ${basicUpdateConfirm.which}'s current disk (removed, or the image changed). You can CANCEL, or save it as a NEW file on the current disk.`)}
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setBasicUpdateConfirm(null)} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{t('modalCancel')}</button>
              <button
                onClick={() => {
                  const c = basicUpdateConfirm; setBasicUpdateConfirm(null);
                  if (c) beginAddBatch(c.which, [{ name: c.name.split('.')[0], ext: 'BAS', fileType: 0, asciiFlag: 0xFF, data: basicTextToAsciiBytes(basicText) }]);
                }}
                className="btn btn-primary py-2 px-5 text-xs font-bold uppercase flex items-center gap-1.5"
              >
                <Save size={13} /> {currentLang === 'pt-br' ? 'Gravar como novo' : 'Save as new'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Novo" disco sobre painel com conteúdo — confirma antes de descartar a imagem atual */}
      {dskNewConfirm && (
        <div className="glass-modal-overlay" onClick={() => setDskNewConfirm(null)}>
          <div className="glass-panel p-5 flex flex-col gap-4" style={{ width: 430, maxWidth: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-950/30 text-amber-400 flex-shrink-0"><AlertTriangle size={20} /></div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{currentLang === 'pt-br' ? `Novo disco no Painel ${dskNewConfirm}?` : `New disk in Pane ${dskNewConfirm}?`}</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {currentLang === 'pt-br'
                ? `O Painel ${dskNewConfirm} já contém uma imagem. Criar um disco novo vai DESCARTAR a imagem atual do painel (alterações não salvas serão perdidas). Deseja continuar?`
                : `Pane ${dskNewConfirm} already contains an image. Creating a new disk will DISCARD the pane's current image (unsaved changes will be lost). Continue?`}
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setDskNewConfirm(null)} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{t('modalCancel')}</button>
              <button onClick={() => doDskNew(dskNewConfirm)} className="btn btn-primary py-2 px-5 text-xs font-bold uppercase flex items-center gap-1.5">
                <Plus size={13} /> {currentLang === 'pt-br' ? 'Criar' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BASIC: confirma gravar .BAS num painel que já tem disco/arquivos */}
      {basicSaveConfirm && (
        <div className="glass-modal-overlay" onClick={() => setBasicSaveConfirm(null)}>
          <div className="glass-panel p-5 flex flex-col gap-4" style={{ width: 430, maxWidth: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-950/30 text-amber-400 flex-shrink-0"><AlertTriangle size={20} /></div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{currentLang === 'pt-br' ? `Gravar no Painel ${basicSaveConfirm.pane}?` : `Save into Pane ${basicSaveConfirm.pane}?`}</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {currentLang === 'pt-br'
                ? `O Painel ${basicSaveConfirm.pane} já contém um disco com arquivos. O programa "${basicSaveConfirm.name}.BAS" será adicionado a esse disco (em caso de nome igual, será pedido para substituir/renomear). Deseja continuar?`
                : `Pane ${basicSaveConfirm.pane} already contains a disk with files. The program "${basicSaveConfirm.name}.BAS" will be added to that disk (on a name clash you'll be asked to overwrite/rename). Continue?`}
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setBasicSaveConfirm(null)} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{t('modalCancel')}</button>
              <button onClick={() => doBasicSaveToDisk(basicSaveConfirm.name, basicSaveConfirm.program, basicSaveConfirm.pane)} className="btn btn-primary py-2 px-5 text-xs font-bold uppercase flex items-center gap-1.5">
                <Save size={13} /> {currentLang === 'pt-br' ? 'Salvar' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BASIC: confirma abrir arquivo apagando o conteúdo atual do editor */}
      {basicOpenPending && (
        <div className="glass-modal-overlay" onClick={() => setBasicOpenPending(null)}>
          <div className="glass-panel p-5 flex flex-col gap-4" style={{ width: 430, maxWidth: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-950/30 text-amber-400 flex-shrink-0"><AlertTriangle size={20} /></div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{currentLang === 'pt-br' ? 'Abrir e substituir?' : 'Open and replace?'}</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {currentLang === 'pt-br'
                ? `O editor BASIC já contém um programa. Abrir "${basicOpenPending.label}" vai APAGAR o conteúdo atual do editor. Deseja continuar?`
                : `The BASIC editor already has a program. Opening "${basicOpenPending.label}" will ERASE the current editor content. Continue?`}
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setBasicOpenPending(null)} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{t('modalCancel')}</button>
              <button onClick={applyBasicOpen} className="btn btn-primary py-2 px-5 text-xs font-bold uppercase flex items-center gap-1.5">
                <FolderOpen size={13} /> {currentLang === 'pt-br' ? 'Abrir' : 'Open'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DSK name-collision modal */}
      {dskCollision && (
        <div className="glass-modal-overlay" onClick={() => setDskCollision(null)}>
          <div className="glass-panel p-5 flex flex-col gap-4" style={{ width: 420, maxWidth: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-950/30 text-amber-400 flex-shrink-0"><AlertTriangle size={20} /></div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">{t('collisionTitle')}</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{t('collisionMsg')}</p>
            <p className="text-xs font-mono text-[var(--primary)]">
              {dskCollision.collisionCount} / {dskCollision.files.length} {currentLang === 'pt-br' ? 'em conflito' : 'in conflict'}
            </p>
            <div className="flex justify-end gap-2 pt-1 flex-wrap">
              <button onClick={() => setDskCollision(null)} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{t('modalCancel')}</button>
              <button onClick={() => doAddBatch(dskCollision.which, dskCollision.files, 'rename')} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase text-[var(--primary)] border-[var(--primary)]/40">{t('collisionRename')}</button>
              <button onClick={() => doAddBatch(dskCollision.which, dskCollision.files, 'overwrite')} className="btn py-2 px-4 text-xs font-bold uppercase" style={{ backgroundColor: 'hsl(30, 75%, 42%)', color: '#fff' }}>{t('collisionOverwrite')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Disk picker — search/jump within a navigable container (DriveWire / MiniIDE / CoCoSDC) */}
      {/* Modal de desfragmentação total (out-of-place) com opções de ordem dos arquivos */}
      {defragModal && (() => {
        const pane = getPane(defragModal.which);
        if (!pane) return null;
        const frag = fragPercent(pane.files);
        const opts: Array<{ id: 'dir' | 'alpha' | 'size'; pt: string; en: string }> = [
          { id: 'dir', pt: 'Manter a ordem atual do diretório', en: 'Keep current directory order' },
          { id: 'alpha', pt: 'Ordem alfabética (A→Z) — também ordena o diretório', en: 'Alphabetical (A→Z) — also sorts the directory' },
          { id: 'size', pt: 'Por tamanho (maior → menor)', en: 'By size (largest → smallest)' },
        ];
        return (
          <div className="glass-modal-overlay" onClick={() => !imageBusy && setDefragModal(null)}>
            <div className="glass-panel flex flex-col" style={{ width: 470, maxWidth: '92%' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 p-4 border-b border-[var(--border)]">
                <div className="p-2 rounded-full bg-[var(--primary-glow)] text-[var(--primary)] flex-shrink-0"><Database size={18} /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide">{currentLang === 'pt-br' ? 'Desfragmentar disco' : 'Defragment disk'}</h3>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {currentLang === 'pt-br' ? 'Painel' : 'Pane'} {defragModal.which} · {pane.files.length} {currentLang === 'pt-br' ? 'arquivos' : 'files'} · {currentLang === 'pt-br' ? 'fragmentação' : 'fragmentation'} {frag}%
                  </div>
                </div>
                <button onClick={() => !imageBusy && setDefragModal(null)} className="dsk-tool" style={{ padding: 6 }}><X size={15} /></button>
              </div>
              {frag === 0 ? (
                <>
                  <div className="p-5 flex flex-col gap-2 items-center text-center">
                    <span style={{ fontSize: 30, color: 'var(--primary)', lineHeight: 1 }}>✓</span>
                    <p className="text-sm text-white font-bold">{currentLang === 'pt-br' ? 'Disco não fragmentado' : 'Disk not fragmented'}</p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {currentLang === 'pt-br'
                        ? 'Os arquivos já estão contíguos (0% de fragmentação) — não há nada a otimizar.'
                        : 'Files are already contiguous (0% fragmentation) — nothing to optimize.'}
                    </p>
                  </div>
                  <div className="flex justify-end p-3 border-t border-[var(--border)]">
                    <button onClick={() => setDefragModal(null)} className="btn btn-primary py-1.5 px-6 text-xs font-bold uppercase">OK</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 flex flex-col gap-3">
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {currentLang === 'pt-br'
                        ? 'Reescreve numa imagem nova em branco, gravando os arquivos em sequência — fica 100% contíguo (otimiza a leitura em disco físico). Não-destrutivo: o painel fica marcado como não-salvo até você salvar.'
                        : 'Rewrites to a fresh blank image, writing files sequentially — becomes 100% contiguous (optimizes physical-disk reads). Non-destructive: the pane is marked unsaved until you save.'}
                    </p>
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">{currentLang === 'pt-br' ? 'Ordem dos arquivos' : 'File order'}</span>
                    <div className="flex flex-col gap-2">
                      {opts.map((o) => (
                        <label key={o.id} className="flex items-center gap-2 cursor-pointer text-xs text-white">
                          <input type="radio" name="defragOrder" checked={defragOrder === o.id} onChange={() => setDefragOrder(o.id)} style={{ accentColor: 'var(--primary)' }} />
                          {currentLang === 'pt-br' ? o.pt : o.en}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 p-3 border-t border-[var(--border)]">
                    <button onClick={() => setDefragModal(null)} disabled={imageBusy} className="btn btn-secondary py-1.5 px-4 text-xs font-bold uppercase">{t('modalCancel')}</button>
                    <button
                      onClick={() => { const w = defragModal.which; const o = defragOrder; setDefragModal(null); startDefragAnimation(w, o); }}
                      disabled={imageBusy}
                      className="btn btn-primary py-1.5 px-5 text-xs font-bold uppercase shadow-[0_0_15px_rgba(20,250,200,0.15)]"
                    >{currentLang === 'pt-br' ? 'Desfragmentar' : 'Defragment'}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal NOSTÁLGICO de desfragmentação animada (anéis + arquivo atual + progresso) */}
      {defragRun && (() => {
        const r = defragRun;
        const pct = Math.min(100, Math.round((r.doneGranules / r.totalWork) * 100));
        const Lx = (pt: string, en: string) => (currentLang === 'pt-br' ? pt : en);
        return (
          <div className="glass-modal-overlay">
            <div className="glass-panel flex flex-col" style={{ width: 430, maxWidth: '94%', position: 'relative' }}>
              <div className="p-3 border-b border-[var(--border)] text-center">
                <div className="text-sm font-bold text-white uppercase tracking-wide">
                  {r.status === 'done' ? Lx('Desfragmentação concluída', 'Defragmentation complete')
                    : r.status === 'cancelled' ? Lx('Desfragmentação cancelada', 'Defragmentation cancelled')
                      : Lx('Desfragmentando', 'Defragmenting')} — <span className="text-[var(--primary)] font-mono">{r.diskName}</span>
                </div>
              </div>
              <div style={{ height: 300, display: 'flex', padding: 10 }}>
                <DiskMap files={r.files} totalGranules={r.totalGranules} selectedNames={r.currentName ? new Set([r.currentName]) : undefined} lang={currentLang} />
              </div>
              <div className="px-4 pb-3 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px]" style={{ minHeight: 16 }}>
                  <span className="text-[var(--text-secondary)] truncate">
                    {r.status === 'spinup' ? Lx('Acionando o motor…', 'Spinning up…')
                      : r.status === 'done' ? Lx('Pronto.', 'Done.')
                        : r.currentName ? <>{Lx('Lendo', 'Reading')}: <span className="font-mono text-white">{r.currentName}</span></> : ''}
                  </span>
                  <span className="font-mono text-[var(--text-muted)]">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${pct}%` }} />
                </div>
                {r.status === 'done' && (
                  <div className="text-[11px] text-[var(--text-secondary)] text-center">
                    {Lx('Fragmentação', 'Fragmentation')} {r.startFrag}% → <strong style={{ color: r.endFrag === 0 ? '#34d399' : '#fbbf24' }}>{r.endFrag}%</strong>
                    {' · '}{r.processed} {Lx('movido(s)', 'moved')}{r.skipped ? ` · ${r.skipped} ${Lx('sem espaço contíguo', 'no contiguous room')}` : ''}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 p-3 border-t border-[var(--border)]">
                {(r.status === 'running' || r.status === 'spinup') && (
                  <button onClick={() => { defragCtl.current.pause = true; }} className="btn btn-secondary py-1.5 px-4 text-xs font-bold uppercase">{t('modalCancel')}</button>
                )}
                {(r.status === 'done' || r.status === 'cancelled') && (
                  <button onClick={() => setDefragRun(null)} className="btn btn-primary py-1.5 px-6 text-xs font-bold uppercase">OK</button>
                )}
              </div>
              {/* Confirmação de cancelamento (sobreposta) */}
              {r.status === 'confirm' && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl" style={{ background: 'rgba(2,6,12,0.86)' }}>
                  <div className="glass-panel p-4 flex flex-col gap-3" style={{ width: 330 }}>
                    <div className="text-sm font-bold text-white text-center">{Lx('Cancelar a desfragmentação?', 'Cancel defragmentation?')}</div>
                    <div className="text-[11px] text-[var(--text-secondary)] text-center">{Lx('A operação foi suspensa. O que deseja fazer?', 'The operation is paused. What do you want to do?')}</div>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => { defragCtl.current.decision = 'current'; }} className="btn btn-primary py-2 px-4 text-xs font-bold uppercase">{Lx('Finalizar o arquivo atual e parar', 'Finish current file and stop')}</button>
                      <button onClick={() => { defragCtl.current.decision = 'all'; }} className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase">{Lx('Cancelar tudo (descartar)', 'Cancel all (discard)')}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {diskPicker && (() => {
        const dp = getPane(diskPicker.which);
        const c = dp?.container;
        if (!c) return null;
        const entries = c.entries || [];
        const q = imageFilter.trim().toLowerCase();
        const idxMap = (fileIndex && fileIndex.key === containerKey(c)) ? fileIndex.map : {};
        const fileMatch = (e: any): string | undefined => { const ns = idxMap[e.id]; return ns ? ns.find((n: string) => n.toLowerCase().includes(q)) : undefined; };
        const list = q ? entries.filter((e: any) => `${e.label} ${e.sub || ''}`.toLowerCase().includes(q) || !!fileMatch(e)) : entries;
        const indexing = fileIndex && fileIndex.key === containerKey(c) && fileIndex.building;
        const kindLabel = c.kind === 'cocosdc' ? 'CoCoSDC' : c.kind === 'miniide' ? 'MiniIDE' : 'DriveWire';
        return (
          <div className="glass-modal-overlay" onClick={() => !imageBusy && setDiskPicker(null)}>
            <div className="glass-panel flex flex-col" style={{ width: 620, maxWidth: '94%', maxHeight: '82vh' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 p-4 border-b border-[var(--border)]">
                <div className="p-2 rounded-full bg-[var(--primary-glow)] text-[var(--primary)] flex-shrink-0"><Database size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wide">{t('imgBrowserTitle')}</h3>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-[var(--primary)] border border-[var(--primary)]/30">{kindLabel} · {c.count}</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] font-mono truncate">{c.fileName || ''} → {currentLang === 'pt-br' ? 'Painel' : 'Pane'} {diskPicker.which}</div>
                </div>
                <button onClick={() => !imageBusy && setDiskPicker(null)} className="dsk-tool" style={{ padding: 6 }}><X size={15} /></button>
              </div>
              <div className="px-4 pt-3 pb-2 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1 bg-slate-950/50 border border-[var(--border)] rounded-lg px-2.5 py-1.5">
                    <Search size={13} className="text-[var(--text-muted)]" />
                    <input autoFocus value={imageFilter} onChange={(e) => setImageFilter(e.target.value)}
                      placeholder={currentLang === 'pt-br' ? 'Nome/nº do disco ou nome de arquivo…' : 'Disk name/number or file name…'}
                      className="bg-transparent outline-none text-xs text-white flex-1 placeholder:text-[var(--text-muted)]" />
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">{list.length}/{entries.length}</span>
                </div>
                {indexing && (
                  <div className="text-[9px] text-[var(--primary)]">
                    {currentLang === 'pt-br' ? 'Indexando arquivos' : 'Indexing files'} {fileIndex!.done}/{fileIndex!.total}…
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2" style={{ minHeight: 120 }}>
                {!list.length ? <div className="text-center text-[11px] text-[var(--text-muted)] p-6">{t('imgEmpty')}</div> :
                  list.slice(0, 500).map((e: any) => {
                    const active = e.id === c.index;
                    return (
                      <button key={e.id} onClick={async () => { await handleSelectContainerDisk(diskPicker.which, e.id); setDiskPicker(null); }} disabled={imageBusy}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 border ${active ? 'bg-cyan-950/40 border-[var(--primary)]/40' : 'border-transparent hover:bg-slate-800/70 hover:border-[var(--primary)]/30'}`}>
                        <span className="text-[10px] font-mono text-[var(--text-muted)] w-9 flex-shrink-0">#{e.id}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white font-mono truncate">{e.label}</div>
                          {e.sub && <div className="text-[10px] text-[var(--text-secondary)] truncate">{e.sub}</div>}
                          {q && (() => {
                            const fm = fileMatch(e);
                            const inMeta = `${e.label} ${e.sub || ''}`.toLowerCase().includes(q);
                            return fm && !inMeta ? <div className="text-[10px] text-[var(--primary)] font-mono truncate">↳ {fm}</div> : null;
                          })()}
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono whitespace-nowrap">{e.info}</span>
                        <ArrowRight size={13} className="text-[var(--primary)] flex-shrink-0" />
                      </button>
                    );
                  })}
                {list.length > 500 && <div className="text-center text-[10px] text-[var(--text-muted)] p-2">{currentLang === 'pt-br' ? `Mostrando 500 de ${list.length} — refine a busca` : `Showing 500 of ${list.length} — refine the search`}</div>}
              </div>
              <div className="flex items-center justify-between p-3 border-t border-[var(--border)]">
                <span className="text-[10px] text-[var(--text-muted)]">{imageBusy ? t('imgBusy') : t('imgOpenHint')}</span>
                <button onClick={() => !imageBusy && setDiskPicker(null)} className="btn btn-secondary py-1.5 px-4 text-xs font-bold uppercase">{t('modalCancel')}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Image load progress overlay */}
      {imageProgress && imageBusy && (
        <div className="glass-modal-overlay">
          <div className="glass-panel p-5 flex flex-col gap-3" style={{ width: 380, maxWidth: '90%' }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-[var(--primary-glow)] text-[var(--primary)]"><Database size={18} /></div>
              <div className="text-sm font-bold text-white">
                {imageProgress.phase === 'scan' ? (currentLang === 'pt-br' ? 'Analisando discos…' : 'Scanning disks…')
                  : imageProgress.phase === 'fat' ? (currentLang === 'pt-br' ? 'Lendo diretório FAT…' : 'Reading FAT directory…')
                    : (currentLang === 'pt-br' ? 'Lendo imagem…' : 'Reading image…')}
              </div>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-[var(--primary)] transition-all" style={{ width: imageProgress.total > 0 ? `${Math.min(100, Math.round(imageProgress.loaded / imageProgress.total * 100))}%` : '40%' }} />
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] font-mono text-right">
              {imageProgress.total > 0 ? `${(imageProgress.loaded / 1048576).toFixed(0)} / ${(imageProgress.total / 1048576).toFixed(0)} MB` : (currentLang === 'pt-br' ? 'aguarde…' : 'please wait…')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
