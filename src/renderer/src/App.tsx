import React, { useState, useEffect, useRef } from 'react';
import { 
  FileAudio, 
  Disc, 
  FileCode, 
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
  Upload
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
    title: 'CoCo CCC Converter',
    subtitle: 'CONSTRUTOR DE CARTUCHOS EPROM PARA TRS-80 COLOR COMPUTER',
    selectFileButton: 'Selecionar Arquivo de Entrada',
    loading: 'Carregando...',
    inputSourceTitle: 'Origem do Programa de Entrada',
    clickToBrowse: 'Clique para navegar no seu sistema',
    supportedFormats: 'Formatos CAS, WAV, DSK ou BIN',
    fileNameLabel: 'Nome do Arquivo:',
    sizeLabel: 'Tamanho:',
    cocoProgramNameLabel: 'Nome do Programa CoCo:',
    loadAddrLabel: 'Endereço de Carga (RAM):',
    execAddrLabel: 'Endereço de Execução:',
    payloadSizeLabel: 'Tamanho do Payload:',
    dskFilesTitle: 'Arquivos da Imagem de Disco DSK',
    dskColName: 'Nome',
    dskColType: 'Tipo',
    dskColSize: 'Tamanho',
    casBlocksTitle: 'Blocos CAS Demodulados',
    extractedPayloadButton: 'Ver/Editar Programa Extraído',
    exportBinButton: 'Exportar Executável (.BIN)',
    noFileLoadedTitle: 'Nenhum arquivo ou programa carregado',
    noFileLoadedDesc: 'Selecione uma fita, imagem de disco, executável ou arquivo ROM no painel esquerdo para abrir o editor hexadecimal.',
    epromConfigTitle: 'Configurações de EPROM e Inicializador',
    epromSizeLabel: 'Tamanho da EPROM de Destino:',
    eprom8kOption: 'EPROM de 8 KB (2764)',
    eprom16kOption: 'EPROM de 16 KB (27128)',
    eprom32kOption: 'EPROM de 32 KB (27256)',
    epromSizeHint: 'Define o tamanho do chip EPROM físico de destino. O arquivo gerado (.CCC) será preenchido para ter exatamente este tamanho de memória.',
    allRamLabel: 'Inicializador All-RAM (Dois Estágios)',
    allRamDesc: 'Alternar paginação de hardware All-RAM',
    allRamHint: 'Mapeia o programa em RAM alta ($8000+), normalmente bloqueada pela ROM básica do CoCo. Copia o código para RAM baixa antes de chavear todo o sistema para RAM, evitando colisões.',
    dragonLabel: 'Compatibilidade Dragon 32/64',
    dragonDesc: "Adicionar cabeçalho de execução 'DK'",
    dragonHint: 'Grava a assinatura clássica "DK" no início do cartucho. Exigida pelos computadores Dragon 32/64 fabricados no Reino Unido e Brasil (Tano) para iniciar o jogo automaticamente.',
    fillerByteLabel: 'Byte de Preenchimento da ROM:',
    fillerByteHint: 'Byte usado para preencher espaços vazios do chip. O padrão $FF (255) representa células apagadas de EPROMs comuns (2764 a 27256), tornando a gravação muito mais rápida.',
    compileButton: 'Montar e Compilar ROM',
    exportRomButton: 'Exportar Cartucho (.CCC)',
    memoryMapTitle: 'Mapa de Memória Física (EPROM vs. RAM Baixa)',
    epromLayoutLabel: 'Layout da EPROM',
    freeSpaceLabel: 'LIVRE',
    bootLabel: 'BOOT',
    payloadLabel: 'PAYLOAD',
    consoleTitle: 'Console de Diagnóstico do Sistema',
    clearConsole: 'Limpar',
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
    title: 'CoCo CCC Converter',
    subtitle: 'EPROM CARTRIDGE BUILDER FOR TRS-80 COLOR COMPUTER',
    selectFileButton: 'Select Input File',
    loading: 'Loading...',
    inputSourceTitle: 'Input Program Source',
    clickToBrowse: 'Click to browse your system',
    supportedFormats: 'CAS, WAV, DSK or BIN formats',
    fileNameLabel: 'File Name:',
    sizeLabel: 'Size:',
    cocoProgramNameLabel: 'CoCo Program Name:',
    loadAddrLabel: 'Load Address (RAM):',
    execAddrLabel: 'Execution Address:',
    payloadSizeLabel: 'Payload Size:',
    dskFilesTitle: 'DSK Disk Image Files',
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
    eprom8kOption: '8 KB EPROM (2764)',
    eprom16kOption: '16 KB EPROM (27128)',
    eprom32kOption: '32 KB EPROM (27256)',
    epromSizeHint: 'Defines the physical size of the target EPROM chip. The final generated image (.CCC) will be padded to match this memory size precisely.',
    allRamLabel: 'All-RAM Bootstrap (Two Stages)',
    allRamDesc: 'Toggle All-RAM hardware paging',
    allRamHint: 'Maps the program above $8000 in high RAM, which normally collides with the CoCo ROM. Relocates the bootloader to low RAM before page-switching the system to All-RAM mode.',
    dragonLabel: 'Dragon 32/64 Compatibility',
    dragonDesc: "Add 'DK' execution header",
    dragonHint: 'Adds the "DK" signature at the start of the cartridge. Required by UK and Brazilian (Tano) Dragon 32/64 computers for automatic execution upon power-on.',
    fillerByteLabel: 'ROM Filler Byte:',
    fillerByteHint: 'Byte used to pad unused areas of the EPROM. The default $FF (255) represents the erased state of physical EPROMs, allowing much faster UV-chip programming.',
    compileButton: 'Assemble & Compile ROM',
    exportRomButton: 'Export Cartridge (.CCC)',
    memoryMapTitle: 'Physical Memory Map (EPROM vs. Low RAM)',
    epromLayoutLabel: 'EPROM Layout',
    freeSpaceLabel: 'FREE',
    bootLabel: 'BOOT',
    payloadLabel: 'PAYLOAD',
    consoleTitle: 'System Diagnostic Console',
    clearConsole: 'Clear',
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

export default function App() {
  // Estado de idioma e configurações
  const [currentLang, setCurrentLang] = useState<'pt-br' | 'en-us'>('pt-br');
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>(DEFAULT_TRANSLATIONS);

  // Estado do arquivo de entrada
  const [fileDetails, setFileDetails] = useState<any>(null);
  const [fileLoading, setFileLoading] = useState<boolean>(false);
  
  // Componentes analisados
  const [dskFiles, setDskFiles] = useState<any[]>([]);
  const [selectedDskFile, setSelectedDskFile] = useState<any>(null);
  const [casBlocks, setCasBlocks] = useState<any[]>([]);
  
  // Buffers separados: buffer do arquivo bruto (editor principal) e payload extraído (bootstrap/EPROM)
  const [rawFileBuffer, setRawFileBuffer] = useState<Uint8Array | null>(null);
  const [extractedPayload, setExtractedPayload] = useState<Uint8Array | null>(null);

  const [loadAddr, setLoadAddr] = useState<number>(0x1000);
  const [execAddr, setExecAddr] = useState<number>(0x1000);
  const [programName, setProgramName] = useState<string>('COCOGAME');

  // Configurações do Loader e EPROM
  const [epromSizeKb, setEpromSizeKb] = useState<number>(16);
  const [useTwoStage, setUseTwoStage] = useState<boolean>(false);
  const [useDragonHeader, setUseDragonHeader] = useState<boolean>(true);
  const [fillerByte, setFillerByte] = useState<number>(0xFF);
  const [activeHint, setActiveHint] = useState<string | null>(null);

  const toggleHint = (hintKey: string) => {
    setActiveHint(prev => prev === hintKey ? null : hintKey);
  };

  // Estados do Modal do Sub-editor Hexadecimal
  const [isHexModalOpen, setIsHexModalOpen] = useState<boolean>(false);
  const [modalBuffer, setModalBuffer] = useState<Uint8Array | null>(null);
  const [modalFileName, setModalFileName] = useState<string>('');

  // Resultados de compilação
  const [compiledRom, setCompiledRom] = useState<Uint8Array | null>(null);
  const [loaderSize, setLoaderSize] = useState<number>(0);
  const [payloadRomOffset, setPayloadRomOffset] = useState<number>(0);
  const [compilationSuccess, setCompilationSuccess] = useState<boolean>(false);

    // Logs do Console de Diagnóstico
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Rolagem automática do console
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (textPt: string, textEn: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    setLogs(prev => [...prev, { time, type, textPt, textEn }]);
  };

  // Carregar e persistir idiomas
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        if (window.cocoApi && typeof window.cocoApi.loadConfig === 'function') {
          const loaded = await window.cocoApi.loadConfig();
          if (loaded) {
            if (loaded.currentLang) {
              setCurrentLang(loaded.currentLang);
            }
            if (loaded.translations) {
              setTranslations(loaded.translations);
            }
            addLog(
              `Configurações de idioma carregadas do arquivo de configuração (${loaded.currentLang.toUpperCase()}).`,
              `Language settings loaded from configuration file (${loaded.currentLang.toUpperCase()}).`,
              'success'
            );
          } else {
            // First time load, save defaults
            await window.cocoApi.saveConfig({
              currentLang: 'pt-br',
              translations: DEFAULT_TRANSLATIONS
            });
            addLog(
              'Arquivo de configuração padrão criado e salvo.',
              'Default configuration file created and saved.',
              'info'
            );
          }
        }
      } catch (err) {
        console.error('Error fetching/setting language config:', err);
      }
    };
    fetchConfig();
  }, []);

  const changeLanguage = async (lang: 'pt-br' | 'en-us') => {
    setCurrentLang(lang);
    try {
      if (window.cocoApi && typeof window.cocoApi.saveConfig === 'function') {
        await window.cocoApi.saveConfig({
          currentLang: lang,
          translations
        });
      }
      addLog(
        'Idioma alterado para Português (Brasil).',
        'Language changed to English (United States).',
        'success'
      );
    } catch (err) {
      console.error('Error saving language config:', err);
    }
  };

  const t = (key: string): string => {
    const dict = translations[currentLang] || DEFAULT_TRANSLATIONS[currentLang] || DEFAULT_TRANSLATIONS['pt-br'];
    return dict[key] || DEFAULT_TRANSLATIONS['pt-br'][key] || key;
  };

  useEffect(() => {
    addLog(
      'Nenhum arquivo ou programa carregado. Selecione uma fita, imagem de disco, executável ou arquivo ROM no painel esquerdo para abrir o editor hexadecimal.',
      'No file or program loaded. Select a tape, disk image, executable or ROM file in the left panel to open the hex editor.',
      'info'
    );
    addLog(
      'Formatos suportados: .WAV, .CAS, .DSK, .BIN, .CCC.',
      'Supported formats: .WAV, .CAS, .DSK, .BIN, .CCC.',
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
      setSelectedDskFile(null);
      setCasBlocks([]);
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
          
          addLog(
            `Endereço de Carga: $${res.loadAddr.toString(16).toUpperCase()}, Execução: $${res.execAddr.toString(16).toUpperCase()}, Tamanho: ${res.payload.length} bytes`,
            `Load Address: $${res.loadAddr.toString(16).toUpperCase()}, Exec: $${res.execAddr.toString(16).toUpperCase()}, Size: ${res.payload.length} bytes`,
            'success'
          );
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
    if (!fileDetails || !fileDetails.buffer) return;
    try {
      addLog(
        `Extraindo "${entry.fullName}" da cadeia de grânulos [${entry.granuleChain.join(', ')}]...`,
        `Extracting "${entry.fullName}" from granule chain [${entry.granuleChain.join(', ')}]...`,
        'info'
      );
      setSelectedDskFile(entry);
      
      const uint8 = new Uint8Array(fileDetails.buffer);
      const res = await window.cocoApi.extractDskProgram(uint8, entry);
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
        useDragonHeader,
        cartridgeSizeKb: epromSizeKb,
        fillerByte
      };

      const res = await window.cocoApi.compileCartridge(extractedPayload, config);
      if (res.success) {
        setCompiledRom(res.romBuffer);
        setLoaderSize(res.loaderSize);
        setPayloadRomOffset(res.payloadRomOffset);
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

        {/* Global actions */}
        <div className="flex items-center gap-4">
          {/* Flags Language Selector */}
          <div className="flex items-center gap-2 bg-slate-900/60 border border-[var(--border)] p-1 px-2.5 rounded-full backdrop-blur-md shadow-inner">
            <button
              onClick={() => changeLanguage('pt-br')}
              className={`text-xl transition-all cursor-pointer ${currentLang === 'pt-br' ? 'scale-110 filter drop-shadow-[0_0_5px_rgba(20,250,200,0.8)] opacity-100' : 'opacity-40 hover:opacity-80 hover:scale-105'}`}
              title="Português (Brasil)"
            >
              🇧🇷
            </button>
            <div className="w-[1px] h-4 bg-[var(--border)]" />
            <button
              onClick={() => changeLanguage('en-us')}
              className={`text-xl transition-all cursor-pointer ${currentLang === 'en-us' ? 'scale-110 filter drop-shadow-[0_0_5px_rgba(20,250,200,0.8)] opacity-100' : 'opacity-40 hover:opacity-80 hover:scale-105'}`}
              title="English (United States)"
            >
              🇺🇸
            </button>
          </div>


        </div>
      </header>

      {/* Main App Grid */}
      <main className="flex-1 overflow-hidden grid grid-cols-12 gap-4 p-4" style={{ minHeight: 0, height: 0 }}>
        
        {/* LEFT COLUMN: Input Details & Configuration (4 cols) */}
        <div className="col-span-4 flex flex-col gap-4 overflow-y-auto pr-1 h-full max-h-full" style={{ minHeight: 0 }}>
          
          {/* File Upload card */}
          <section 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`glass-panel p-5 flex flex-col gap-4 animate-slideup relative transition-all duration-300 ${isDragging ? 'border-[var(--primary)] bg-slate-900/80 shadow-[0_0_20px_rgba(20,250,200,0.15)]' : ''}`}
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
              <div className="flex flex-col gap-3 text-xs bg-slate-950/30 p-3 rounded-lg border border-[var(--border)]">
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
                      <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-[var(--border)]">
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
            {dskFiles.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
                <h3 className="text-xs font-bold text-white tracking-wider uppercase mb-1 flex items-center gap-1">
                  <Disc size={12} className="text-yellow-400" />
                  {t('dskFilesTitle')}
                </h3>
                <div className="max-h-48 overflow-y-auto border border-[var(--border)] rounded-md">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-900 text-[var(--text-muted)] font-bold border-b border-[var(--border)]">
                        <th className="p-2">{t('dskColName')}</th>
                        <th className="p-2 text-center">{t('dskColType')}</th>
                        <th className="p-2 text-right">{t('dskColSize')}</th>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CAS tape blocks tracker */}
            {casBlocks.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
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

          {/* Cartridge build configuration card */}
          <section className="glass-panel p-5 flex flex-col gap-4 animate-slideup" style={{ animationDelay: '0.1s' }}>
            <h2 className="text-sm font-bold text-white border-b border-[var(--border)] pb-2 tracking-wide uppercase flex items-center gap-2">
              <Sliders className="text-purple-400" size={16} />
              {t('epromConfigTitle')}
            </h2>

            <div className="flex flex-col gap-4 text-xs">
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
                  <option value={8}>{t('eprom8kOption')}</option>
                  <option value={16}>{t('eprom16kOption')}</option>
                  <option value={32}>{t('eprom32kOption')}</option>
                </select>
                {activeHint === 'eprom' && (
                  <div className="text-[10px] text-[var(--text-secondary)] bg-slate-950/60 p-2.5 rounded-lg border border-[var(--primary)]/30 leading-relaxed mt-1 animate-slideup shadow-[0_0_10px_rgba(20,250,200,0.03)] flex gap-2 items-start">
                    <HelpCircle size={12} className="text-[var(--primary)] mt-0.5 flex-shrink-0" />
                    <span>{t('epromSizeHint')}</span>
                  </div>
                )}
              </div>

              {/* Loader Type Stage */}
              <div className="flex flex-col gap-2 bg-slate-900/40 p-3 rounded-lg border border-[var(--border)]">
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

              {/* Dragon 32/64 compatibility */}
              <div className="flex flex-col gap-2 bg-slate-900/40 p-3 rounded-lg border border-[var(--border)]">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    {t('dragonLabel')}
                    <button 
                      type="button"
                      onClick={() => toggleHint('dragon')}
                      className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${activeHint === 'dragon' ? 'bg-[var(--primary-glow)] text-[var(--primary)] border border-[var(--primary)]/30' : 'text-slate-500 hover:text-[var(--primary)] hover:bg-slate-800/40'}`}
                      title="Ajuda"
                    >
                      <HelpCircle size={12} />
                    </button>
                  </span>
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 accent-[var(--primary)] cursor-pointer flex-shrink-0"
                    checked={useDragonHeader}
                    onChange={(e) => setUseDragonHeader(e.target.checked)}
                  />
                </div>
                {activeHint === 'dragon' && (
                  <div className="text-[10px] text-[var(--text-secondary)] bg-slate-950/60 p-2.5 rounded-lg border border-[var(--primary)]/30 leading-relaxed mt-1 animate-slideup shadow-[0_0_10px_rgba(20,250,200,0.03)] flex gap-2 items-start">
                    <HelpCircle size={12} className="text-[var(--primary)] mt-0.5 flex-shrink-0" />
                    <span>{t('dragonHint')}</span>
                  </div>
                )}
              </div>

              {/* Filler Byte */}
              <div className="flex flex-col gap-2 bg-slate-900/10 p-3 rounded-lg border border-[var(--border)]/40">
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
                <button 
                  disabled={!extractedPayload}
                  onClick={handleCompile}
                  className="btn btn-primary w-full py-2.5 font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Cpu size={16} />
                  {t('compileButton')}
                </button>

                {compilationSuccess && compiledRom && (
                  <button 
                    onClick={handleSaveRom}
                    className="btn btn-secondary w-full py-2.5 font-bold uppercase tracking-wider text-emerald-400 border-emerald-900/60 hover:bg-emerald-950/30 flex items-center justify-center gap-2 pulse-primary"
                  >
                    <Download size={16} />
                    {t('exportRomButton')}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Hex Editor & visual memory maps (8 cols) */}
        <div className="col-span-8 flex flex-col gap-4 overflow-hidden h-full" style={{ minHeight: 0 }}>
          
          {/* Visual Memory Map */}
          {extractedPayload && (
            <section className="glass-panel p-4 flex flex-col gap-2 animate-slideup">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sliders size={14} className="text-cyan-400" />
                {t('memoryMapTitle')}
              </h3>
              
              {/* EPROM Visual Map */}
              <div className="flex flex-col gap-1 text-[10px]">
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>{t('epromLayoutLabel')} ($C000 - ${ (0xC000 + epromSizeKb * 1024 - 1).toString(16).toUpperCase() })</span>
                  <span>{epromSizeKb} KB</span>
                </div>
                <div className="mem-bar mt-1">
                  {/* Loader portion */}
                  <div 
                    className="mem-block bg-purple-600 border-r border-purple-800"
                    style={{ width: `${Math.max(5, (loaderSize / (epromSizeKb * 1024)) * 100)}%` }}
                    title={`Bootstrap: ${loaderSize} bytes`}
                  >
                    {loaderSize > 0 && t('bootLabel')}
                  </div>
                  {/* Game payload portion */}
                  <div 
                    className="mem-block bg-cyan-600 border-r border-cyan-800"
                    style={{ width: `${(extractedPayload.length / (epromSizeKb * 1024)) * 100}%` }}
                    title={`Payload: ${extractedPayload.length} bytes`}
                  >
                    {extractedPayload.length > 2000 ? `${(extractedPayload.length / 1024).toFixed(1)}K ${t('payloadLabel')}` : t('payloadLabel')}
                  </div>
                  {/* Remaining empty space */}
                  <div 
                    className="mem-block bg-slate-900 text-slate-500 font-normal"
                    style={{ flex: 1 }}
                    title={`Free space: ${epromSizeKb * 1024 - loaderSize - extractedPayload.length} bytes`}
                  >
                    {t('freeSpaceLabel')}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Hex Editor Container (fills remaining space) */}
          <section className="glass-panel flex-1 overflow-hidden flex flex-col animate-slideup">
            {rawFileBuffer ? (
              <HexEditor 
                buffer={rawFileBuffer}
                onChange={(newBuf) => {
                  setRawFileBuffer(newBuf);
                  setCompiledRom(null);
                  setCompilationSuccess(false);
                  // Sync raw edit back to extractedPayload if the raw file is a standalone executable/rom payload
                  if (fileDetails && (fileDetails.fileExt === '.bin' || fileDetails.fileExt === '.ccc')) {
                    setExtractedPayload(newBuf);
                  }
                }}
                baseAddress={loadAddr}
                t={t}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
                <FileCode size={48} className="opacity-20 animate-pulse text-cyan-400" />
                <div className="text-center max-w-sm">
                  <p className="text-sm font-semibold text-white">{t('noFileLoadedTitle')}</p>
                  <p className="text-xs mt-1">{t('noFileLoadedDesc')}</p>
                </div>
              </div>
            )}
          </section>

          {/* Action Log Console */}
          <section className="glass-panel h-36 flex flex-col overflow-hidden animate-slideup bg-slate-950/40">
            <div className="flex justify-between items-center px-4 py-2 border-b border-[var(--border)] bg-slate-900/40">
              <span className="text-[10px] font-bold text-white tracking-widest uppercase flex items-center gap-1.5">
                <Terminal size={12} className="text-[var(--primary)]" />
                {t('consoleTitle')}
              </span>
              <button 
                onClick={() => setLogs([])}
                className="text-[9px] text-[var(--text-muted)] hover:text-white uppercase font-bold"
              >
                {t('clearConsole')}
              </button>
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
        <div className="glass-modal-overlay" onClick={() => setIsHexModalOpen(false)}>
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
                onClick={() => setIsHexModalOpen(false)}
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
                onClick={() => setIsHexModalOpen(false)}
                className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase"
              >
                {t('modalCancel')}
              </button>
              <button 
                onClick={() => {
                  // Salva as alterações de volta no extractedPayload!
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
                }}
                className="btn btn-primary py-2 px-5 text-xs font-bold uppercase shadow-[0_0_15px_rgba(20,250,200,0.15)]"
              >
                {t('modalSave')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
