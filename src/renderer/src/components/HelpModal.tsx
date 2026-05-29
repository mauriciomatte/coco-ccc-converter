import React from 'react';
import { BookOpen, X } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: (key: string) => string;
  currentLang?: string;
}

export default function HelpModal({ isOpen, onClose, t, currentLang }: HelpModalProps) {
  if (!isOpen) return null;

  const isEN = currentLang === 'en-us';

  const enContent = `
          <h1 class="text-2xl font-bold text-white mb-6 text-center">1. INTRODUCTION TO FORMAT ADAPTATION</h1>
          
          <p class="mb-4 indent-8 text-justify">
            Converting programs recorded on cassette tapes (<code>.cas</code> or <code>.wav</code>) or extracted from disk images (<code>.dsk</code>) into the Read-Only Memory (ROM) cartridge format (<code>.ccc</code> or <code>.bin</code>) requires changing the native behavior of the TRS-80 Color Computer. Since a tape program expects to be loaded into RAM, the system dynamically builds a "Bootloader" injected directly in machine language (6809E Assembly) at the base of the EPROM chip.
          </p>

          <h2 class="text-xl font-bold text-cyan-400 mt-8 mb-4">2. ROM CARTRIDGE FILE STRUCTURE</h2>

          <p class="mb-4 indent-8 text-justify">
            For the Color Computer to recognize the cartridge image at boot time (address <code>$C000</code>), the compiled file follows a strict hierarchical and sequential memory structure:
          </p>

          <ol class="list-decimal list-inside space-y-2 mb-6 ml-4">
            <li><strong>Signature Header:</strong> First 4 bytes containing the Color BASIC key.</li>
            <li><strong>Injected Bootstrap Loader:</strong> 6809E Assembly code for ROM-to-RAM transfer.</li>
            <li><strong>Program Payload:</strong> The binary machine code of the extracted program or game.</li>
            <li><strong>Padding:</strong> Null bytes (e.g., <code>$FF</code>) filling the physical size of the EPROM chip.</li>
          </ol>

          <h3 class="text-lg font-bold text-purple-400 mt-6 mb-3">2.1. The Signature Header</h3>

          <p class="mb-4 text-justify">
            The first two bytes at address <code>$C000</code> must contain the letters <strong>'D'</strong> and <strong>'K'</strong> (Disk ROM / Cartridge present flag). The next two bytes form the <strong>Execution Vector</strong> pointing to the bootloader's execution address (usually <code>$C004</code>).
          </p>

          <div class="bg-slate-950 border border-slate-800 p-4 rounded-lg font-mono text-xs mb-6 overflow-x-auto">
            <div class="text-emerald-400 mb-2">; CARTRIDGE HEADER (4 BYTES)</div>
            <pre class="text-slate-400">
C000: 44 4B       FCC  "DK"       ; Color BASIC Signature
C002: C0 04       FDB  $C004      ; Pointer (Execution Vector)
            </pre>
          </div>

          <h2 class="text-xl font-bold text-cyan-400 mt-8 mb-4">3. BOOTSTRAP LOADER INJECTION (HEX CODE)</h2>

          <p class="mb-4 indent-8 text-justify">
            Below are details of the two bootstrap engine variations the software can inject starting at address <code>$C004</code>. Users can switch between these injections via the interface options.
          </p>

          <h3 class="text-lg font-bold text-purple-400 mt-6 mb-3">3.1. Single-Stage Bootloader</h3>
          
          <p class="mb-4 text-justify">
            This method injects exactly 23 bytes. It uses the X and Y registers to iterate over the ROM memory, transferring the bytes to the game's native Load Address in RAM before jumping to its execution.
          </p>

          <div class="bg-slate-950 border border-slate-800 p-4 rounded-lg font-mono text-xs mb-6 overflow-x-auto">
            <div class="text-emerald-400 mb-2">; 6809E ASSEMBLY CODE - SINGLE STAGE LOADER</div>
            <pre class="text-slate-400">
C004: 1A 50       ORCC #$50       ; Disable interrupts (FIRQ and IRQ)
C006: CE C0 1B    LDX  #$C01B     ; X = Game Payload start address in ROM
C009: 10 CE xxxx  LDY  #RAM_DEST  ; Y = Program Load Address in RAM
C00D: A6 80 COPY: LDA  ,X+        ; Read 1 byte from ROM Payload and increment X
C00F: A7 A0       STA  ,Y+        ; Write byte to RAM destination address and increment Y
C011: 8C xx xx    CMPX #ROM_END   ; Check if reached the end of the Payload
C014: 26 F7       BNE  COPY       ; If not reached, repeat COPY loop
C016: 1C AF       ANDCC #$AF      ; Restore (enable) system interrupts
C018: 7E yy yy    JMP  EXEC_ADDR  ; Unconditional jump to start game in RAM
            </pre>

            <div class="text-amber-400 mt-4 border-t border-slate-800 pt-3 mb-2">; INJECTED HEXADECIMAL EQUIVALENT:</div>
            <pre class="text-white font-bold tracking-[0.2em] leading-relaxed">
1A 50 CE C0 1B 10 CE xx
xx A6 80 A7 A0 8C xx xx
26 F7 1C AF 7E yy yy
            </pre>
          </div>

          <h3 class="text-lg font-bold text-purple-400 mt-6 mb-3">3.2. Two-Stage Bootloader (All-RAM Map)</h3>

          <p class="mb-4 text-justify">
            For programs occupying the entire memory space (above $8000), the physical ROM conflicts with the Payload's destination in RAM. The engine injects a dual-loader that acts as an ingenious bridge: Stage 1 acts as an initial micro-copier, moving the switching routine to clean, low RAM ($0600).
          </p>

          <div class="bg-slate-950 border border-slate-800 p-4 rounded-lg font-mono text-xs mb-6 overflow-x-auto">
            <div class="text-emerald-400 mb-2">; STAGE 1: INITIAL MICRO-COPIER IN ROM ($C004)</div>
            <pre class="text-slate-400">
C004: 1A 50       ORCC #$50       ; Disable interrupts
C006: CE C0 19    LDX  #$C019     ; X = Stage 2 Routine start in ROM
C009: 10 CE 06 00 LDY  #$0600     ; Y = Destination in Low RAM
C00D: A6 80 C_SUB: LDA  ,X+       ; Read 1 byte from Stage 2
C00F: A7 A0       STA  ,Y+        ; Write byte to address $0600+
C011: 8C xx xx    CMPX #SUB_END   ; Reached end of routine?
C014: 26 F7       BNE  C_SUB      ; Repeat loop
C016: 7E 06 00    JMP  $0600      ; Execute Jump transferring control to RAM!
            </pre>
          </div>

          <p class="mb-4 text-justify">
            Once in RAM, Stage 2 gains control and can flash system chips by dynamically triggering SAM registers, allowing it to copy the true Payload while "turning off" the ROM itself.
          </p>

          <div class="bg-slate-950 border border-slate-800 p-4 rounded-lg font-mono text-xs mb-6 overflow-x-auto">
            <div class="text-emerald-400 mb-2">; STAGE 2: TWO STAGE SUBROUTINE RUNNING IN RAM ($0600)</div>
            <pre class="text-slate-400">
0600: 1A 50       ORCC #$50       ; Disable interrupts
0602: CE C0 37    LDX  #$C037     ; X = Game Payload start in ROM
0605: 10 CE xxxx  LDY  #RAM_DEST  ; Y = Final destination in RAM
0609: B7 FF DE COPY: STA  $FFDE   ; HARDWARE SWITCH: Enable ROM for Reading
060C: A6 80       LDA  ,X+        ; Read byte from ROM
060E: B7 FF DF    STA  $FFDF      ; HARDWARE SWITCH: Disable ROM and enable All-RAM
0611: A7 A0       STA  ,Y+        ; Write protected byte to native RAM
0613: 8C xx xx    CMPX #ROM_END   ; Check end of Payload
0616: 26 F1       BNE  COPY       ; PC-Relative Branch: -15 bytes ($F1) return to loop
0618: B7 FF DF    STA  $FFDF      ; Lock All-RAM enabled for the game
061B: 7E yy yy    JMP  EXEC_ADDR  ; Start program natively!
            </pre>

            <div class="text-amber-400 mt-4 border-t border-slate-800 pt-3 mb-2">; INJECTED HEXADECIMAL EQUIVALENT FOR STAGE 2:</div>
            <pre class="text-white font-bold tracking-[0.2em] leading-relaxed">
1A 50 CE C0 37 10 CE xx
xx B7 FF DE A6 80 B7 FF
DF A7 A0 8C xx xx 26 F1
B7 FF DF 7E yy yy
            </pre>
          </div>
  `;

  const ptContent = `
          <h1 class="text-2xl font-bold text-white mb-6 text-center">1. INTRODUÇÃO À ADAPTAÇÃO DE FORMATOS</h1>
          
          <p class="mb-4 indent-8 text-justify">
            A conversão de programas gravados em fita cassete (<code>.cas</code> ou <code>.wav</code>) ou extraídos de imagens de disquete (<code>.dsk</code>) para o formato de cartucho de Memória Somente de Leitura (ROM) (<code>.ccc</code> ou <code>.bin</code>) requer a alteração do comportamento nativo do TRS-80 Color Computer. Como um programa de fita espera ser carregado na RAM, o sistema constrói dinamicamente um "Bootloader" (Carregador Inicial) injetado diretamente em linguagem de máquina (Assembly 6809E) na base do chip EPROM.
          </p>

          <h2 class="text-xl font-bold text-cyan-400 mt-8 mb-4">2. ESTRUTURA DO ARQUIVO DE CARTUCHO ROM</h2>

          <p class="mb-4 indent-8 text-justify">
            Para que o Color Computer reconheça a imagem do cartucho no momento da inicialização (endereço <code>$C000</code>), o arquivo compilado obedece à seguinte estrutura hierárquica e sequencial no bloco de memória:
          </p>

          <ol class="list-decimal list-inside space-y-2 mb-6 ml-4">
            <li><strong>Cabeçalho de Assinatura (Header):</strong> 4 bytes iniciais contendo a chave do Color BASIC.</li>
            <li><strong>Bootstrap Loader Injetado:</strong> Código Assembly 6809E de transferência ROM para RAM.</li>
            <li><strong>Payload do Programa:</strong> O código de máquina binário do programa ou jogo extraído.</li>
            <li><strong>Padding (Enchimento):</strong> Bytes nulos (ex: <code>$FF</code>) completando o tamanho físico do chip EPROM.</li>
          </ol>

          <h3 class="text-lg font-bold text-purple-400 mt-6 mb-3">2.1. O Cabeçalho de Assinatura</h3>

          <p class="mb-4 text-justify">
            Os primeiros dois bytes no endereço <code>$C000</code> devem conter as letras <strong>'D'</strong> e <strong>'K'</strong> (Sinalizador de presença de ROM de Disco/Cartucho). Os próximos dois bytes formam o <strong>Vetor de Inicialização</strong> apontando para o endereço de execução do bootloader (geralmente <code>$C004</code>).
          </p>

          <div class="bg-slate-950 border border-slate-800 p-4 rounded-lg font-mono text-xs mb-6 overflow-x-auto">
            <div class="text-emerald-400 mb-2">; CABEÇALHO DO CARTUCHO (4 BYTES)</div>
            <pre class="text-slate-400">
C000: 44 4B       FCC  "DK"       ; Assinatura Color BASIC
C002: C0 04       FDB  $C004      ; Ponteiro (Vetor de Execução)
            </pre>
          </div>

          <h2 class="text-xl font-bold text-cyan-400 mt-8 mb-4">3. INJEÇÃO DO BOOTSTRAP LOADER (CÓDIGO HEXADECIMAL)</h2>

          <p class="mb-4 indent-8 text-justify">
            Abaixo estão detalhadas as duas variações do motor de bootstrap que o software permite injetar a partir do endereço <code>$C004</code>. O usuário pode alternar estas injeções via as opções de interface.
          </p>

          <h3 class="text-lg font-bold text-purple-400 mt-6 mb-3">3.1. Bootloader de Estágio Único (Single-Stage)</h3>
          
          <p class="mb-4 text-justify">
            Este método injeta exatamente 23 bytes. Ele utiliza os registradores X e Y para iterar sobre a memória da ROM, transferindo os bytes para o endereço de Carga (Load Address) nativo do jogo na RAM antes de saltar para sua execução.
          </p>

          <div class="bg-slate-950 border border-slate-800 p-4 rounded-lg font-mono text-xs mb-6 overflow-x-auto">
            <div class="text-emerald-400 mb-2">; CÓDIGO ASSEMBLY 6809E - SINGLE STAGE LOADER</div>
            <pre class="text-slate-400">
C004: 1A 50       ORCC #$50       ; Desativa as interrupções (FIRQ e IRQ)
C006: CE C0 1B    LDX  #$C01B     ; X = Endereço onde começa o Payload do Jogo na ROM
C009: 10 CE xxxx  LDY  #RAM_DEST  ; Y = Endereço de Carga do programa na RAM
C00D: A6 80 COPY: LDA  ,X+        ; Lê 1 byte do Payload na ROM e incrementa X
C00F: A7 A0       STA  ,Y+        ; Grava o byte no endereço de destino na RAM e incrementa Y
C011: 8C xx xx    CMPX #ROM_END   ; Compara se chegou no final do Payload
C014: 26 F7       BNE  COPY       ; Se não chegou, repete o laço COPY
C016: 1C AF       ANDCC #$AF      ; Restaura (ativa) as interrupções do sistema
C018: 7E yy yy    JMP  EXEC_ADDR  ; Salto incondicional para iniciar o jogo na RAM
            </pre>

            <div class="text-amber-400 mt-4 border-t border-slate-800 pt-3 mb-2">; HEXADECIMAL CORRESPONDENTE INJETADO:</div>
            <pre class="text-white font-bold tracking-[0.2em] leading-relaxed">
1A 50 CE C0 1B 10 CE xx
xx A6 80 A7 A0 8C xx xx
26 F7 1C AF 7E yy yy
            </pre>
          </div>

          <h3 class="text-lg font-bold text-purple-400 mt-6 mb-3">3.2. Bootloader de Dois Estágios (All-RAM Map)</h3>

          <p class="mb-4 text-justify">
            Para programas que ocupam todo o espaço de memória (acima de $8000), a ROM física conflita com o destino do Payload na RAM. O motor injeta um carregador duplo que age como uma ponte engenhosa: o Estágio 1 age como micro-copiador inicial, movendo a rotina de chaveamento para a parte inferior e limpa da RAM ($0600).
          </p>

          <div class="bg-slate-950 border border-slate-800 p-4 rounded-lg font-mono text-xs mb-6 overflow-x-auto">
            <div class="text-emerald-400 mb-2">; ESTÁGIO 1: MICRO-COPIADOR INICIAL NA ROM ($C004)</div>
            <pre class="text-slate-400">
C004: 1A 50       ORCC #$50       ; Desativa as interrupções
C006: CE C0 19    LDX  #$C019     ; X = Início da Rotina de Estágio 2 na ROM
C009: 10 CE 06 00 LDY  #$0600     ; Y = Destino na RAM Inferior
C00D: A6 80 C_SUB: LDA  ,X+       ; Lê 1 byte do Estágio 2
C00F: A7 A0       STA  ,Y+        ; Grava o byte no endereço $0600+
C011: 8C xx xx    CMPX #SUB_END   ; Chegou no fim da rotina?
C014: 26 F7       BNE  C_SUB      ; Repete o laço
C016: 7E 06 00    JMP  $0600      ; Executa Salto transferindo o controle para a RAM!
            </pre>
          </div>

          <p class="mb-4 text-justify">
            Uma vez na RAM, o Estágio 2 ganha controle e pode piscar os chips do sistema ativando os registradores SAM dinamicamente, permitindo copiar o verdadeiro Payload enquanto "desliga" a própria ROM.
          </p>

          <div class="bg-slate-950 border border-slate-800 p-4 rounded-lg font-mono text-xs mb-6 overflow-x-auto">
            <div class="text-emerald-400 mb-2">; ESTÁGIO 2: TWO STAGE SUBROUTINE RODANDO EM RAM ($0600)</div>
            <pre class="text-slate-400">
0600: 1A 50       ORCC #$50       ; Desativa as interrupções
0602: CE C0 37    LDX  #$C037     ; X = Início do Payload do Jogo na ROM
0605: 10 CE xxxx  LDY  #RAM_DEST  ; Y = Destino final na RAM
0609: B7 FF DE COPY: STA  $FFDE   ; CHAVEAMENTO HARDWARE: Ativa ROM para Leitura
060C: A6 80       LDA  ,X+        ; Lê o byte da ROM
060E: B7 FF DF    STA  $FFDF      ; CHAVEAMENTO HARDWARE: Desativa ROM e ativa All-RAM
0611: A7 A0       STA  ,Y+        ; Grava o byte protegido na RAM nativa
0613: 8C xx xx    CMPX #ROM_END   ; Verifica final do Payload
0616: 26 F1       BNE  COPY       ; PC-Relative Branch: -15 bytes ($F1) retorna ao loop
0618: B7 FF DF    STA  $FFDF      ; Trava All-RAM habilitado para o jogo
061B: 7E yy yy    JMP  EXEC_ADDR  ; Inicia o programa nativamente!
            </pre>

            <div class="text-amber-400 mt-4 border-t border-slate-800 pt-3 mb-2">; HEXADECIMAL CORRESPONDENTE INJETADO DO ESTÁGIO 2:</div>
            <pre class="text-white font-bold tracking-[0.2em] leading-relaxed">
1A 50 CE C0 37 10 CE xx
xx B7 FF DE A6 80 B7 FF
DF A7 A0 8C xx xx 26 F1
B7 FF DF 7E yy yy
            </pre>
          </div>
  `;

  return (
    <div className="glass-modal-overlay flex items-center justify-center p-8" onClick={onClose}>
      <div 
        className="bg-slate-900 border border-[var(--border)] rounded-xl shadow-2xl flex flex-col w-full max-w-4xl max-h-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border)] bg-slate-950/50">
          <div className="flex items-center gap-3">
            <BookOpen className="text-[var(--primary)] glow-text-primary" size={24} />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              {isEN ? "Technical Manual: Conversion & Injection Logic" : "Manual Técnico: Lógica de Conversão e Injeção"}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-rose-900/50 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div 
          className="flex-1 overflow-y-auto p-8 text-sm text-slate-300 leading-relaxed custom-scrollbar"
          dangerouslySetInnerHTML={{ __html: isEN ? enContent : ptContent }}
        />
      </div>
    </div>
  );
}
