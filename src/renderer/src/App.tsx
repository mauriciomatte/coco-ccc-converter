import React, { useState, useEffect, useRef } from 'react';
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
  HardDrive
} from 'lucide-react';
import HexEditor from './components/HexEditor';

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
    tabEprom: 'EPROM',
    hexEditorBtn: 'Editor Hexadecimal',
    tabGw: 'GW',
    gwTitle: 'Greaseweazle — Leitura/Gravação de Discos Reais',
    gwFormatLabel: 'Formato (CoCo / Dragon)',
    gwDeviceLabel: 'Dispositivo / Porta',
    gwDriveLabel: 'Drive',
    gwDriveDefault: 'Padrão (auto)',
    gwPathLabel: 'Caminho do gw',
    gwExtraLabel: 'Argumentos extras',
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
    gwHintExtra: 'Argumentos extras passados ao gw, separados por espaço. Ex.: --no-verify (pula a verificação na gravação), --retries=3, --revs=2 (mais voltas na leitura). Consulte "gw read --help" / "gw write --help".',
    gwHintActions: 'Testar: roda "gw info" para conferir a placa. Ler disco: lê o disquete físico e carrega a imagem no Painel A da aba DSK. Gravar Painel A: grava no disquete a imagem do Painel A. Gravar .dsk…: escolhe um arquivo .dsk e grava no disquete.',
    gwHintMap: 'Cada quadradinho é uma trilha (coluna) por lado (linha L0/L1). Acende em verde conforme o gw lê/grava cada trilha; a barra mostra o progresso total.',
    exitConfirmTitle: 'Sair do aplicativo?',
    exitConfirmMsg: 'Alterações não salvas em imagens .DSK ou conversões serão perdidas. Deseja realmente sair?',
    dskTabTitle: 'Gerenciador de Imagens DSK',
    dskTabSoon: 'O gerenciador de arquivos DSK (dois painéis, copiar/colar/mover entre imagens, injetar .BIN/.BAS) será construído nas próximas fases.',
    openDskBtn: 'Abrir .DSK',
    dskToolNew: 'Novo',
    dskToolInject: 'Injetar',
    dskToolCopy: 'Copiar',
    dskToolCut: 'Recortar',
    dskToolPaste: 'Colar',
    dskToolDelete: 'Excluir',
    dskToolUndo: 'Desfazer',
    dskToolRedo: 'Refazer',
    dskToolSave: 'Salvar',
    dskActivePane: 'Painel ativo',
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
    tabEprom: 'EPROM',
    hexEditorBtn: 'Hex Editor',
    tabGw: 'GW',
    gwTitle: 'Greaseweazle — Read/Write Real Disks',
    gwFormatLabel: 'Format (CoCo / Dragon)',
    gwDeviceLabel: 'Device / Port',
    gwDriveLabel: 'Drive',
    gwDriveDefault: 'Default (auto)',
    gwPathLabel: 'gw path',
    gwExtraLabel: 'Extra arguments',
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
    gwHintExtra: 'Extra arguments passed to gw, space-separated. E.g. --no-verify (skip write verification), --retries=3, --revs=2 (more read revolutions). See "gw read --help" / "gw write --help".',
    gwHintActions: 'Test: runs "gw info" to check the board. Read disk: reads the physical floppy and loads the image into Pane A of the DSK tab. Write Pane A: writes Pane A\'s image to the floppy. Write .dsk…: pick a .dsk file and write it to the floppy.',
    gwHintMap: 'Each little square is a track (column) per side (row L0/L1). It turns green as gw reads/writes each track; the bar shows overall progress.',
    exitConfirmTitle: 'Quit the application?',
    exitConfirmMsg: 'Unsaved changes to .DSK images or conversions will be lost. Do you really want to quit?',
    dskTabTitle: 'DSK Image Manager',
    dskTabSoon: 'The DSK file manager (dual pane, copy/paste/move between images, inject .BIN/.BAS) will be built in the next phases.',
    openDskBtn: 'Open .DSK',
    dskToolNew: 'New',
    dskToolInject: 'Inject',
    dskToolCopy: 'Copy',
    dskToolCut: 'Cut',
    dskToolPaste: 'Paste',
    dskToolDelete: 'Delete',
    dskToolUndo: 'Undo',
    dskToolRedo: 'Redo',
    dskToolSave: 'Save',
    dskActivePane: 'Active pane',
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

// Trilhas ocupadas por um arquivo (a partir da cadeia de grânulos)
function fileTracks(entry: any): string {
  if (!entry || !entry.granuleChain) return '';
  return compressRanges(entry.granuleChain.map(granuleToTrack));
}

export default function App() {
  // Estado de idioma e configurações
  const [currentLang, setCurrentLang] = useState<'pt-br' | 'en-us'>('pt-br');
  const [activeTab, setActiveTab] = useState<'dsk' | 'gw' | 'eprom'>('dsk');
  const [consoleMax, setConsoleMax] = useState<boolean>(false);

  // Greaseweazle (aba GW)
  const [gwPath, setGwPath] = useState<string>('gw');
  const [gwFormat, setGwFormat] = useState<string>('coco.decb');
  const [gwDevice, setGwDevice] = useState<string>('');
  const [gwDrive, setGwDrive] = useState<string>('');
  const [gwExtra, setGwExtra] = useState<string>('');
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
  const [dskTopHeight, setDskTopHeight] = useState<number>(280);
  const dskDragItem = useRef<{ pane: 'A' | 'B'; entries: any[] } | null>(null);
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
  const [isExitModalOpen, setIsExitModalOpen] = useState<boolean>(false);
  const [modalBuffer, setModalBuffer] = useState<Uint8Array | null>(null);
  const [modalFileName, setModalFileName] = useState<string>('');

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
            if (typeof s.fillerByte === 'number') setFillerByte(s.fillerByte);
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
      window.cocoApi.saveConfig({ currentLang, gwPath, gwFormat, gwDevice, gwDrive, gwExtra, fillerByte });
    }
  }, [currentLang, gwPath, gwFormat, gwDevice, gwDrive, gwExtra, fillerByte]);

  const changeLanguage = (lang: 'pt-br' | 'en-us') => {
    setCurrentLang(lang);
    addLog(
      'Idioma alterado para Português (Brasil).',
      'Language changed to English (United States).',
      'success'
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
      await loadPaneFromBuffer(which, new Uint8Array(res.buffer), res.fileName);
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

  const STD_DISK = 161280; // disco RS-DOS padrão (35 trilhas)

  // Carrega uma imagem nova num painel; detecta contêiner multi-disco (N x 161280) e mostra o disco 0
  const loadPaneFromBuffer = async (which: 'A' | 'B', full: Uint8Array, fileName: string, index = 0): Promise<boolean> => {
    const count = (full.length > 0 && full.length % STD_DISK === 0) ? full.length / STD_DISK : 1;
    const slice = count > 1 ? full.slice(index * STD_DISK, (index + 1) * STD_DISK) : full;
    const res = await window.cocoApi.readDskDirectory(slice);
    if (!res.success) { addLog(`DSK: ${res.error}`, `DSK: ${res.error}`, 'error'); return false; }
    setPane(which, {
      buffer: slice, fileName, size: slice.length,
      files: res.files, freeGranules: res.freeGranules, totalGranules: res.totalGranules,
      container: count > 1 ? { full, count, index } : null
    });
    if (count > 1) {
      addLog(`Contêiner multi-disco detectado: ${count} discos de 160 KB. Mostrando o disco ${index} no painel ${which} — use o seletor de disco.`,
        `Multi-disk container detected: ${count} 160 KB disks. Showing disk ${index} in pane ${which} — use the disk selector.`, 'info');
    } else {
      addLog(`Imagem "${fileName}" no painel ${which}: ${res.files.length} arquivos, ${res.freeGranules} grânulos livres.`,
        `Image "${fileName}" in pane ${which}: ${res.files.length} files, ${res.freeGranules} free granules.`, 'success');
    }
    return true;
  };

  // Troca o disco ativo de um contêiner multi-disco
  const handleSelectContainerDisk = async (which: 'A' | 'B', index: number) => {
    const pane = getPane(which);
    if (!pane || !pane.container) return;
    const c = pane.container;
    if (index < 0 || index >= c.count) return;
    const slice = c.full.slice(index * STD_DISK, (index + 1) * STD_DISK);
    const res = await window.cocoApi.readDskDirectory(slice);
    if (!res.success) { addLog(`DSK: ${res.error}`, `DSK: ${res.error}`, 'error'); return; }
    if (selectedDsk?.pane === which) setSelectedDsk(null);
    setPane(which, {
      ...pane, buffer: slice, size: slice.length,
      files: res.files, freeGranules: res.freeGranules, totalGranules: res.totalGranules,
      container: { ...c, index }
    });
  };

  // Re-parse uma imagem modificada (mutação in-place); mantém e atualiza o contêiner, se houver
  const refreshPane = async (which: 'A' | 'B', image: Uint8Array, fileName?: string, size?: number) => {
    const res = await window.cocoApi.readDskDirectory(image);
    if (!res.success) { addLog(`DSK: ${res.error}`, `DSK: ${res.error}`, 'error'); return; }
    const prev = getPane(which) || {};
    let container = prev.container || null;
    if (container) {
      const full = new Uint8Array(container.full);
      full.set(image, container.index * STD_DISK);
      container = { ...container, full };
    }
    setPane(which, {
      buffer: image,
      fileName: fileName ?? prev.fileName ?? (which === 'A' ? 'NOVO_A.DSK' : 'NOVO_B.DSK'),
      size: size ?? image.length,
      files: res.files,
      freeGranules: res.freeGranules,
      totalGranules: res.totalGranules,
      container
    });
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
  const beginAddBatch = (which: 'A' | 'B', files: any[]) => {
    const pane = getPane(which);
    if (!pane) { addLog('Abra ou crie uma imagem no painel de destino primeiro.', 'Open or create an image in the target pane first.', 'warn'); return; }
    if (!files.length) return;
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
    if (!pane) return;
    pushDskUndo();
    let buffer: Uint8Array = pane.buffer;
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
      beginAddBatch(activePane, [{ name: res.name, ext: res.ext, fileType: res.fileType, asciiFlag: res.asciiFlag, data: res.data }]);
    } catch (err: any) { addLog(`Inject: ${err.message}`, `Inject: ${err.message}`, 'error'); }
  };

  const handleDskNew = async () => {
    pushDskUndo();
    try {
      const res = await window.cocoApi.dskNewBlank();
      if (!res.success) { addLog(`New disk: ${res.error}`, `New disk: ${res.error}`, 'error'); return; }
      await loadPaneFromBuffer(activePane, new Uint8Array(res.image), activePane === 'A' ? 'NOVO_A.DSK' : 'NOVO_B.DSK');
      addLog(`Novo disco vazio criado no painel ${activePane}.`, `New blank disk created in pane ${activePane}.`, 'success');
    } catch (err: any) { addLog(`New disk: ${err.message}`, `New disk: ${err.message}`, 'error'); }
  };

  const handleDskSavePane = async () => {
    const pane = getPane(activePane);
    if (!pane) { addLog('Painel ativo sem imagem.', 'Active pane has no image.', 'warn'); return; }
    try {
      // Para contêiner multi-disco, salva o arquivo inteiro (todos os discos); senão o disco único.
      const saveBuf = pane.container ? pane.container.full : pane.buffer;
      const r = await window.cocoApi.saveCartridgeFile(
        saveBuf, pane.fileName || 'disk.dsk',
        currentLang === 'pt-br' ? `Salvar imagem .DSK (painel ${activePane})` : `Save .DSK image (pane ${activePane})`,
        [{ name: 'RS-DOS Disk Image (.dsk)', extensions: ['dsk'] }, { name: 'All Files', extensions: ['*'] }]
      );
      if (r.success) addLog(`Imagem do painel ${activePane} salva em: ${r.filePath}${pane.container ? ` (contêiner com ${pane.container.count} discos)` : ''}`, `Pane ${activePane} image saved at: ${r.filePath}${pane.container ? ` (${pane.container.count}-disk container)` : ''}`, 'success');
      else if (r.error) addLog(`Save: ${r.error}`, `Save: ${r.error}`, 'error');
    } catch (err: any) { addLog(`Save: ${err.message}`, `Save: ${err.message}`, 'error'); }
  };

  // Drop externo num painel: .dsk abre a imagem; .bin/.bas injeta (aceita múltiplos)
  // Extrai TODOS os arquivos de um buffer .dsk (ciente de contêiner multi-disco)
  const extractAllFromDsk = async (bytes: Uint8Array): Promise<any[]> => {
    const DISK = 161280;
    const isContainer = bytes.length % DISK === 0 && bytes.length / DISK > 1;
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

    // Painel sem imagem: um .dsk solto ABRE a imagem
    if (!getPane(which)) {
      const dskFile = arr.find((f) => f.name.toLowerCase().endsWith('.dsk'));
      if (dskFile) {
        const reader = new FileReader();
        reader.onload = async () => {
          if (selectedDsk?.pane === which) setSelectedDsk(null);
          await loadPaneFromBuffer(which, new Uint8Array(reader.result as ArrayBuffer), dskFile.name);
        };
        reader.readAsArrayBuffer(dskFile);
      } else {
        addLog('Abra ou crie uma imagem neste painel antes de soltar arquivos.', 'Open or create an image in this pane before dropping files.', 'warn');
      }
      return;
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
        if (file.name.toLowerCase().endsWith('.dsk')) {
          out.push(...await extractAllFromDsk(bytes));
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
  const handleDskInternalDrop = async (targetWhich: 'A' | 'B', source: { pane: 'A' | 'B'; entries: any[] }) => {
    if (source.pane === targetWhich) return;
    const src = getPane(source.pane);
    if (!src) return;
    setActivePane(targetWhich);
    try {
      const files: any[] = [];
      for (const entry of source.entries) {
        const res = await window.cocoApi.dskExtractRaw(src.buffer, entry);
        if (res.success) files.push({ name: entry.name, ext: entry.ext, fileType: entry.fileType, asciiFlag: entry.asciiFlag, data: res.data });
      }
      beginAddBatch(targetWhich, files);
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
    if (extractedPayload) {
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
  const gwOpts = () => ({ gwPath, format: gwFormat, device: gwDevice.trim(), drive: gwDrive, extra: gwExtra.trim().split(/\s+/).filter(Boolean) });

  const handleGwInfo = async () => {
    setGwBusy(true); setGwOp('info');
    addLog('Greaseweazle: gw info…', 'Greaseweazle: gw info…', 'info');
    const r = await window.cocoApi.gwInfo({ gwPath, device: gwDevice.trim() });
    if (!r.success) addLog('gw info falhou — a placa está conectada e o gw instalado/no PATH?', 'gw info failed — is the board connected and gw installed/on PATH?', 'warn');
    setGwBusy(false); setGwOp('');
  };

  const handleGwRead = async () => {
    setGwBusy(true); setGwOp('read'); setGwDone(new Set());
    addLog(`Greaseweazle: lendo disco (${gwFormat})…`, `Greaseweazle: reading disk (${gwFormat})…`, 'info');
    try {
      const res = await window.cocoApi.gwRead(gwOpts());
      if (res.success) {
        await loadPaneFromBuffer('A', new Uint8Array(res.image), `GW_READ_${gwFormat.replace(/\./g, '_')}.dsk`);
        addLog(`Leitura concluída: ${res.size} bytes. Imagem carregada no Painel A (aba DSK) — revise e salve lá.`, `Read complete: ${res.size} bytes. Image loaded into Pane A (DSK tab) — review and save it there.`, 'success');
      } else addLog(`Falha na leitura (código ${res.code ?? res.error}).`, `Read failed (code ${res.code ?? res.error}).`, 'error');
    } catch (err: any) { addLog(`gw read: ${err.message}`, `gw read: ${err.message}`, 'error'); }
    setGwBusy(false); setGwOp('');
  };

  const doGwWrite = async (image: Uint8Array) => {
    setGwBusy(true); setGwOp('write'); setGwDone(new Set());
    addLog(`Greaseweazle: gravando disco (${gwFormat})…`, `Greaseweazle: writing disk (${gwFormat})…`, 'info');
    try {
      const res = await window.cocoApi.gwWrite(gwOpts(), image);
      if (res.success) addLog('Gravação concluída com sucesso.', 'Write completed successfully.', 'success');
      else addLog(`Falha na gravação (código ${res.code}).`, `Write failed (code ${res.code}).`, 'error');
    } catch (err: any) { addLog(`gw write: ${err.message}`, `gw write: ${err.message}`, 'error'); }
    setGwBusy(false); setGwOp('');
  };

  const handleGwWritePaneA = () => {
    if (!paneA) { addLog('Painel A (aba DSK) sem imagem.', 'Pane A (DSK tab) has no image.', 'warn'); return; }
    doGwWrite(paneA.buffer);
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
              <input className={fieldCls} value={gwDevice} placeholder="auto (ex.: COM3)" onChange={e => setGwDevice(e.target.value)} />
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
            <label className={labelCls}>
              <span>{t('gwPathLabel')}{gwHelp('gwHintPath')}</span>
              <input className={fieldCls} value={gwPath} onChange={e => setGwPath(e.target.value)} />
            </label>
            <label className={labelCls}>
              <span>{t('gwExtraLabel')}{gwHelp('gwHintExtra')}</span>
              <input className={fieldCls} value={gwExtra} placeholder="--no-verify --retries=3" onChange={e => setGwExtra(e.target.value)} />
            </label>
          </div>
          <div className="flex gap-2 flex-wrap pt-1 items-center">
            <button disabled={gwBusy} onClick={handleGwInfo} className="dsk-tool"><RefreshCw size={13} className={gwBusy && gwOp === 'info' ? 'animate-spin' : ''} /> {t('gwTestBtn')}</button>
            <button disabled={gwBusy} onClick={handleGwRead} className="dsk-tool" style={{ borderColor: 'var(--border-active)', color: 'var(--primary)' }}><Download size={13} /> {t('gwReadBtn')}</button>
            <button disabled={gwBusy || !paneA} onClick={handleGwWritePaneA} className="dsk-tool"><Upload size={13} /> {t('gwWritePaneBtn')}</button>
            <button disabled={gwBusy} onClick={handleGwWriteFile} className="dsk-tool"><Upload size={13} /> {t('gwWriteFileBtn')}</button>
            {gwHelp('gwHintActions')}
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
          <div className="mem-bar">
            <div className="mem-block bg-[var(--primary)]" style={{ width: `${pct}%` }} />
            <div className="mem-block bg-slate-900" style={{ flex: 1 }} />
          </div>
          <div className="flex flex-col gap-1.5 mt-1">
            {Array.from({ length: geo.heads }).map((_, h) => (
              <div key={h} className="flex items-center gap-2">
                <span className="text-[9px] text-[var(--text-muted)] font-mono" style={{ width: 28 }}>L{h}</span>
                <div className="flex flex-wrap" style={{ gap: 2 }}>
                  {Array.from({ length: geo.cyls }).map((_, c) => (
                    <div
                      key={c}
                      title={`${currentLang === 'pt-br' ? 'Trilha' : 'Track'} ${c} · ${currentLang === 'pt-br' ? 'Lado' : 'Side'} ${h}`}
                      style={{ width: 11, height: 11 }}
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

  const renderDskPane = (which: 'A' | 'B', pane: any) => {
    const usedGran = pane ? pane.totalGranules - pane.freeGranules : 0;
    const freeKB = pane ? ((pane.freeGranules * 2304) / 1024).toFixed(1) : '0';
    const usedKB = pane ? ((usedGran * 2304) / 1024).toFixed(1) : '0';
    return (
      <div
        onClick={() => setActivePane(which)}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => handlePaneDrop(which, e)}
        className={`glass-panel h-full flex flex-col overflow-hidden transition-all ${which === activePane ? 'dsk-pane-active' : ''}`}
      >
        <div className="flex-1 flex flex-row overflow-hidden" style={{ minHeight: 0 }}>
          {/* Left: open + image info */}
          <div className="flex flex-col gap-2 p-3 border-r border-[var(--border)] flex-shrink-0" style={{ width: 200 }}>
            <div className="flex items-center gap-2">
              <span className="step-badge">{which}</span>
              <span className="text-xs font-bold text-white uppercase tracking-wide">{currentLang === 'pt-br' ? 'Imagem' : 'Image'} {which}</span>
            </div>
            <button
              onClick={() => handleOpenDskPane(which)}
              className="btn btn-secondary py-1.5 text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 border-[var(--primary)]/40 text-[var(--primary)] hover:bg-[var(--primary-glow)]"
            >
              <FolderOpen size={12} /> {t('openDskBtn')}
            </button>
            {pane ? (
              <div className="flex flex-col gap-1 text-[11px] mt-1">
                <div className="text-white font-mono break-all">{pane.fileName}</div>
                <div className="text-[var(--text-secondary)]">{(pane.size / 1024).toFixed(0)} KB</div>
                {pane.container && (
                  <div className="flex flex-col gap-1 mt-1 bg-slate-950/40 rounded p-1.5 border border-[var(--primary)]/30" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{currentLang === 'pt-br' ? `Contêiner · ${pane.container.count} discos` : `Container · ${pane.container.count} disks`}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleSelectContainerDisk(which, pane.container.index - 1)} disabled={pane.container.index <= 0} className="dsk-tool" style={{ padding: '2px 7px' }}>◀</button>
                      <span className="text-[11px] font-mono text-[var(--primary)] font-bold flex-1 text-center">{currentLang === 'pt-br' ? 'Disco' : 'Disk'} {pane.container.index}/{pane.container.count - 1}</span>
                      <button onClick={() => handleSelectContainerDisk(which, pane.container.index + 1)} disabled={pane.container.index >= pane.container.count - 1} className="dsk-tool" style={{ padding: '2px 7px' }}>▶</button>
                    </div>
                    <input
                      type="number" min={0} max={pane.container.count - 1} value={pane.container.index}
                      onChange={(e) => handleSelectContainerDisk(which, Math.max(0, Math.min(pane.container.count - 1, parseInt(e.target.value) || 0)))}
                      className="input-text py-0.5 text-[11px] text-center font-mono"
                    />
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
                  </tr>
                </thead>
                <tbody>
                  {pane.files.map((f: any, idx: number) => (
                    <tr
                      key={idx}
                      draggable
                      onDragStart={(e) => {
                        const inSel = selectedDsk && selectedDsk.pane === which && selectedDsk.entries.some((x: any) => x.fullName === f.fullName);
                        dskDragItem.current = { pane: which, entries: inSel ? selectedDsk!.entries : [f] };
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={(e) => handleSelectDskFile(which, f, e)}
                      className={`cursor-pointer border-b border-[var(--border)]/40 hover:bg-slate-800 ${selectedDsk && selectedDsk.pane === which && selectedDsk.entries.some((x: any) => x.fullName === f.fullName) ? 'bg-cyan-950/40 text-cyan-300 font-semibold' : 'text-[var(--text-secondary)]'}`}
                    >
                      <td className="p-2 font-mono">{f.name}</td>
                      <td className="p-2 text-center">{f.ext}</td>
                      <td className="p-2 text-right font-mono">{f.totalSize} B</td>
                      <td className="p-2 text-center font-mono">{f.granuleChain ? f.granuleChain.length : '-'}</td>
                      <td className="p-2 font-mono text-[10px]">{fileTracks(f)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="h-full flex items-center justify-center text-[10px] text-[var(--text-muted)] p-4 text-center">{t('dskPaneEmpty')}</div>
            )}
          </div>
        </div>
        {/* Status bar */}
        <div className="dsk-statusbar">
          {pane
            ? `${pane.files.length} ${t('dskFilesWord')} · ${t('dskUsedWord')} ${usedKB} KB (${usedGran}g) · ${t('dskFreeWord')} ${freeKB} KB (${pane.freeGranules}g)`
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
            <h1 className="app-title-text">{t('title')}</h1>
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
            onClick={() => setActiveTab('gw')}
            className={`tab-btn ${activeTab === 'gw' ? 'tab-btn-active' : ''}`}
          >
            <HardDrive size={14} /> {t('tabGw')}
          </button>
          <button
            onClick={() => setActiveTab('eprom')}
            className={`tab-btn ${activeTab === 'eprom' ? 'tab-btn-active' : ''}`}
          >
            <Cpu size={14} /> {t('tabEprom')}
          </button>
        </div>

        {/* Global Toolbar (hex editor + language + exit) */}
        <div className="flex items-center gap-3 bg-slate-900/40 border border-[var(--border)] p-1.5 px-3 rounded-xl backdrop-blur-md">
          {/* Hex Editor (global) */}
          <button
            onClick={handleOpenHexEditor}
            className="px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer text-[var(--primary)] border border-[var(--primary)]/30 bg-[var(--primary-glow)] hover:bg-[var(--primary)] hover:text-slate-950"
            title={t('hexEditorBtn')}
          >
            <Binary size={13} /> HEX
          </button>
          <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />

          {/* BR and US Buttons */}
          <button
            onClick={() => changeLanguage('pt-br')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              currentLang === 'pt-br'
                ? 'bg-[var(--primary)] text-slate-950 shadow-[0_0_10px_var(--primary-glow)] font-extrabold'
                : 'text-[var(--text-secondary)] hover:text-white hover:bg-slate-800/50'
            }`}
            title="Português (Brasil)"
          >
            <span>🇧🇷</span> BR
          </button>
          <button
            onClick={() => changeLanguage('en-us')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              currentLang === 'en-us'
                ? 'bg-[var(--primary)] text-slate-950 shadow-[0_0_10px_var(--primary-glow)] font-extrabold'
                : 'text-[var(--text-secondary)] hover:text-white hover:bg-slate-800/50'
            }`}
            title="English (United States)"
          >
            <span>🇺🇸</span> US
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
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden p-3" style={{ minHeight: 0 }}>
            {/* DSK toolbar */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <button onClick={handleDskNew} className="dsk-tool"><Plus size={13} /> {t('dskToolNew')}</button>
              <button onClick={handleDskInject} className="dsk-tool"><FilePlus size={13} /> {t('dskToolInject')}</button>
              <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
              <button onClick={() => handleDskCopy(false)} disabled={!selectedDsk?.entries.length} className="dsk-tool"><Copy size={13} /> {t('dskToolCopy')}</button>
              <button onClick={() => handleDskCopy(true)} disabled={!selectedDsk?.entries.length} className="dsk-tool"><Scissors size={13} /> {t('dskToolCut')}</button>
              <button onClick={handleDskPaste} disabled={!dskClipboard} className="dsk-tool"><Clipboard size={13} /> {t('dskToolPaste')}</button>
              <button onClick={handleDskDelete} disabled={!selectedDsk?.entries.length} className="dsk-tool dsk-tool-danger"><Trash2 size={13} /> {t('dskToolDelete')}</button>
              <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
              <button onClick={handleDskUndo} disabled={dskUndo.length === 0} className="dsk-tool"><Undo2 size={13} /> {t('dskToolUndo')}</button>
              <button onClick={handleDskRedo} disabled={dskRedo.length === 0} className="dsk-tool"><Redo2 size={13} /> {t('dskToolRedo')}</button>
              <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />
              <button onClick={handleDskSavePane} className="dsk-tool"><Save size={13} /> {t('dskToolSave')}</button>
              <span className="ml-auto text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                {t('dskActivePane')}: <span className="text-[var(--primary)] font-bold">{activePane}</span>
                {dskClipboard && <span className="ml-2 text-[var(--text-secondary)]">📋 {dskClipboard.name}.{dskClipboard.ext}{dskClipboard.cut ? ' ✂' : ''}</span>}
              </span>
            </div>
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
        )}

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
          <div className="glass-modal-content" onClick={(e) => e.stopPropagation()}>
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
            
            <div className="flex-1 overflow-hidden">
              <HexEditor 
                buffer={modalBuffer}
                onChange={(newBuf) => {
                  setModalBuffer(newBuf);
                }}
                baseAddress={loadAddr}
                t={t}
              />
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
                onClick={() => window.close()}
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
    </div>
  );
}
