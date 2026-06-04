# ESTUDO DE IMPLEMENTAÇÃO — Aba K7 (fita cassete) com waveform, captura real e preservação

Status: **ESTUDO para avaliação** (nada implementado). Posição da aba: **entre DSK e OS-9**.
Absorve e amplia `ROADMAP_CASWAV.md` e `ROADMAP_WAV.md`. CoCo e Dragon compartilham o MESMO FSK de
fita (~1200 baud, 6809) → um pipeline serve aos dois.

> ⚠️ GPL: PyDC/cas2bas são GPL. Usar só FATOS de formato (frequências, blocos), reimplementar em TS.

---

## 1. Inventário de formatos de FITA (e relacionados)

### Áudio (o sinal da fita, analógico digitalizado)
- **WAV** (RIFF/PCM) — 8/16-bit, mono, 11/22/44.1 kHz. É o "retrato" da onda da fita. JÁ LEMOS (decodeWav).
- **VOC** (Creative Voice) — container de áudio antigo (blocos de tipo). Parser de header → PCM. (a fazer)
- **Linha de entrada do PC** (line-in/mic) — a fita REAL tocada num gravador ligado ao PC. Capturável
  via Web Audio (getUserMedia). É a "fita de verdade" entrando no app. (a fazer — núcleo do pedido)

### Digital (o fluxo de bytes já demodulado)
- **CAS** — imagem de cassete = a sequência de BYTES da fita. Estrutura padrão:
  - **Leader**: bytes `$55` (sincronização de bit).
  - **Namefile block** (bloco 0): nome 8 chars, tipo (0=BASIC,1=Data,2=Binário/ML), flag ASCII,
    flag GAP, endereços de EXEC e LOAD.
  - **Data blocks**: blocos de dados; cada bloco com checksum.
  - **EOF block**.
  - Variantes: **standard** (leader podem ser truncados) e **RAW** (jogos/proteção, loaders custom).
- **CUE** (extensão do CAS) — metadados de frequência/silêncio p/ loaders custom e proteção.
- **Raw bitstream** — fluxo de bits cru (sem estrutura de bloco), p/ casos não-padrão.

### Encoding FSK (do nosso decodeWav, confirmado)
- bit **0** = 1 ciclo de **1200 Hz** (~833 µs) · bit **1** = 1 ciclo de **2400 Hz** (~417 µs), LSB-first.
- Sync do CoCo: leader `$55` + marcador `$3C` (Dragon idem; suporta forma invertida `$AA`/`$C3`).

### Relacionados (já suportados no app — alvo do "enviar para painel DSK")
- Discos: DSK (RS-DOS), VDK (Dragon), OS9 (RBF), IMG/VHD (containers), JVC/DMK (a fazer).
- Programa: BIN, CCC, ROM. BASIC: BAS/ASC/TXT (temos tokenizer/detokenizer).

---

## 2. O que JÁ temos (reuso direto)
- `src/main/converter/wav.ts → decodeWav`: WAV PCM → demod FSK (zero-crossing) → bytes, acha sync
  `$55 $3C`. **É o coração da leitura de fita.**
- `src/main/converter/export.ts → encodeCas`: monta um `.CAS` (leader/namefile/data/EOF/checksum).
- `basicDetokenize.ts` + editor BASIC: tokenizar/detokenizar (CAS BASIC ↔ texto).
- Pipeline DSK/Dragon/OS-9 completo (destino do "enviar para painel").
- Cabeçalho já compactado → espaço para a nova aba.

---

## 3. A ABA K7 — layout proposto

```
┌───────────────────────────────────────────────────────────────────────────┐
│ BARRA DE FERRAMENTAS:                                                       │
│ [Abrir][Gravar WAV] │ [⏮][◀◀][▶ play][⏺ rec][■ stop] │ [↶ desfazer][↷ refa-│  ← toolbar
│ zer] │ [marcar][recortar][copiar][colar][trim][norm] │ [↔ Painel A/B][Exp▾]│
├───────────────────────────────────────────────────────────────────────────┤
│  ╔═══════════════════════ WAVEFORM (canvas) ═══════════════════════╗  ┌────┐│
│  ║  ~~~~/\~~/\/\~~~~  [região marcada]  ~~/\~~~~  [silêncio]        ║  │File││
│  ║  régua de tempo · marcadores · seleção · zoom                   ║  │info││
│  ╚═════════════════════════════════════════════════════════════════╝  │----││
│   00:12.3 / 03:40   44.1 kHz   pico ▮▮▯                                │nome││
│  ─────────────── barra de status (pos, dur, taxa, nível, estado) ────   │load││
│ ┌─ Ajustes (fino) ───────────────────────────────────┐                 │exec││
│ │ kHz: 11/22/44 ▾   Limiar ▮▮▯   Tolerância ▮▮▯   Ganho ▮▮▯           │tipo││
│ └────────────────────────────────────────────────────┘                 │blo-││
│                                                                        │cos ││
└───────────────────────────────────────────────────────────────────────────┘
```

- **BARRA DE FERRAMENTAS** (topo, fixa): agrupa TUDO — Abrir/Gravar · **transport** (⏮ rewind, ◀◀ FF,
  ▶ play, ⏺ **rec**, ■ stop) · **↶ Desfazer / ↷ Refazer** · ferramentas de edição (marcar, recortar,
  copiar, colar, trim, normalizar) · enviar ao Painel A/B · Exportar (CAS|WAV|VOC|BAS). Separadores
  finos `│` entre grupos (como já fizemos no cabeçalho/DSK).
- **Waveform** (canvas): desenha o PCM (downsample p/ exibir arquivos grandes), com régua de tempo,
  zoom/scroll, seleção de região, marcadores. Drag-and-drop de WAV/CAS/VOC do Windows + botão Abrir.
- **Painel Ajustes** (fino): taxa kHz, limiar de amplitude, tolerância de frequência, ganho/volume —
  os parâmetros estilo DC/DCWIN/PyDC (/W /S, tolerância 450 Hz) para destravar fitas difíceis.
- **Painel File info** (lado direito): nome, início (load), fim, execução (exec), tipo
  (BASIC/Máquina/Dados), flag ASCII/GAP, nº de blocos, checksum OK/erro. Lista de MÚLTIPLOS arquivos
  numa mesma fita. **Preenchido PROGRESSIVAMENTE** — ver §5b.
- **Barra de status**: posição, duração, taxa, nível de pico, estado (lendo/gravando/parado).

### 5b. Exibição PROGRESSIVA dos dados ao carregar
Ao iniciar o carregamento de um WAV (ou ao capturar uma fita), **assim que o decode interpreta o
namefile block**, o painel File info já mostra o **nome do arquivo** e os **parâmetros disponíveis**
(início/load, fim, execução/exec, tipo) — sem esperar o fim do decode. Conforme a fita avança,
vão aparecendo os blocos/arquivos seguintes (uma fita pode ter vários). Mostra também o NOME do
arquivo WAV em carregamento e o progresso. Decode em STREAMING/incremental no main, emitindo eventos
para o renderer ir preenchendo o painel.

---

## 4. Ler FITAS K7 REAIS (não só tocar WAV)

Núcleo do pedido: **gravar a fita real para dentro do CoCoDCU**.
- **Captura**: Web Audio API no renderer — `navigator.mediaDevices.getUserMedia({audio})` →
  `MediaStreamAudioSourceNode` → `ScriptProcessor/AudioWorklet` → acumula PCM (Float32) → WAV.
  Requer permissão de mídia (Electron: `session.setPermissionRequestHandler` liberando 'media').
- **Monitor de nível** (VU) durante a gravação para ajustar volume do gravador.
- **Playback**: Web Audio toca o WAV (monitorar a fita, ou alimentar um CoCo real pelo line-out do PC).
- Fluxo: ligar gravador no line-in → ⏺ REC → tocar a fita → ■ STOP → waveform aparece → decodificar
  → ver os arquivos → exportar CAS/WAV ou enviar ao painel DSK.

---

## 5. Edição em waveform (preservação ativa)
- **Marcar** regiões (início/fim de cada programa/bloco/leader/silêncio).
- **Recortar/Cortar/Copiar/Colar/Excluir** regiões do PCM (mover/limpar trechos).
- **Trim de silêncio** (remove leader/cauda mortos), **Normalizar** (amplitude ao range — melhora a demod).
- **Limpeza de onda** (suavizar antes de demodular — opção do DC).
- **DESFAZER / REFAZER** (↶/↷ na barra de ferramentas, atalhos Ctrl+Z/Ctrl+Y) — pilha de histórico
  do buffer PCM. Como WAV é grande, o histórico guarda PATCHES (região alterada + amostras antigas),
  não cópias inteiras; limite de N passos para controlar memória. (Mesmo espírito do dskUndo/dskRedo.)
- Tudo num buffer PCM em memória; "salvar" reescreve o WAV editado.

---

## 6. Preservar TELAS DE ABERTURA / loaders multi-estágio (histórico)

Caso que você descreveu: jogos com **loader custom** que, antes do jogo, montam uma **tela de
apresentação** da softhouse na memória de texto do VDG em **$400** (32×16 = 512 bytes; ASCII +
**semigráficos-4**), e só então carregam o programa principal. São CAS **RAW** (não-padrão).

Plano de preservação:
- Decodificar a fita em MÚLTIPLOS blocos e **classificar**: loader / tela($400) / programa principal.
- **Renderizar a tela $400** como imagem dentro do app (preciso de um **renderizador VDG texto/SG4**:
  cada byte → caractere ASCII invertido/normal ou bloco semigráfico-4 2×2; paleta verde/laranja).
  Isso mostra a "capa" recuperada — recurso de preservação único.
- Guardar a fita inteira como WAV + um CAS "anotado" (regiões marcadas) preservando o loader original.
- **Preciso analisar seus WAVs reais** para mapear esses loaders (estrutura varia por softhouse).

---

## 7. Arquitetura técnica

| Camada | Responsabilidade |
|---|---|
| **main** (Node) | parse/encode WAV, VOC, CAS (blocos/checksum/cue); demod/mod FSK (decodeWav + encodeWav novo); classificar blocos; extrair metadados; render $400 → bitmap (ou no renderer) |
| **renderer** | aba K7: canvas waveform, transport, edição (buffer PCM), **captura/playback Web Audio**, painéis, drag-drop, "enviar ao painel DSK" |
| **preload/IPC** | k7-decode, k7-encode-wav, k7-cas-parse, k7-voc-parse, k7-render-screen, k7-to-dsk… |

Captura/playback e o canvas ficam no renderer (Web Audio + Canvas). Demod/parse pesados no main.

---

## 8. Fases de implementação (K0 → K10)

**STATUS (2026-06-04):** ✅ **K0** (casco+waveform) · ✅ **K1** (player+cassete animada+zoom) ·
✅ **K2** (decode FSK→painel Programa+lista) · ✅ **K8** (ajuste fino: limiar/amplitude — destrava
o dinowars) · ✅ **K10** (Normalizar→CAS/WAV limpo e menor) · ✅ **extrair arquivo p/ PC** (parte de
K5/K6). Codec validado nas amostras reais (QUASAR/STINGER/dinowars). **FALTAM:** K3 (edição na
waveform+undo/redo) · K4 (REC line-in) · K5 pontes (→XRoar/↔Painel DSK) · K6 (detokenizar BASIC) ·
K7 (render tela $400) · K9 (fita-loader→DSK via emulador).


- **K0** — Casco da aba + **barra de ferramentas** + canvas waveform + Abrir WAV (drag-drop + botão) +
  desenho do PCM (downsample). Já mostra o NOME do WAV em carregamento.
- **K1** — Transport play/stop (Web Audio) na barra + zoom/scroll + barra de status (pos/dur/taxa/pico).
- **K2** — Demod FSK → CAS → painel File info **preenchido PROGRESSIVAMENTE** (nome/load/exec/tipo
  assim que interpretados) + lista de múltiplos arquivos (estende decodeWav p/ devolver blocos+metadados
  em streaming, não só os bytes).
- **K3** — Edição: marcar, seleção de região, recortar/copiar/colar/excluir, trim silêncio, normalizar,
  **Desfazer/Refazer** (histórico por patches).
- **K4** — **REC**: captura line-in (getUserMedia + permissão), VU de nível, gravar → WAV.
- **K5** — Export: **CAS→WAV** (encodeWav) e **WAV→CAS**; **enviar ao painel DSK** (extrai arquivos→disco);
  import **VOC**.
- **K6** — CAS↔BASIC (detokenizar do CAS, reusa o tokenizer) + "FIXCAS" (reparar SYNC/checksum).
- **K7** — Loaders multi-estágio + **render da tela $400** (VDG texto/SG4) — preservação de telas.
- **K8** — Ajuste fino (kHz, limiares, tolerância) + análise de sinal (histograma de frequência) para
  destravar fitas difíceis/ruidosas.

Sugestão de ordem de VALOR: K0→K1→K2 (já vê e decodifica fita) → K5 (converte/usa) → K4 (grava fita
real) → K3 (edita) → K7 (telas) → K6/K8.

---

## 9. Riscos / decisões a avaliar
- **Permissão de mídia** no Electron (line-in) — liberar 'media' no main; testar no Windows.
- **WAVs grandes** — downsample para desenhar; manter PCM completo em memória (ou stream).
- **Demod robusta** para fitas reais ruidosas — daí os ajustes finos (limiar/tolerância) do K8.
- **Render VDG $400** — implementar SG4/texto (ou reusar assets do XRoar) — preciso ver exemplos.
- **Escopo** — é uma aba grande; dá para entregar incremental (K0–K2 já é útil sozinho).

## 9b. Integração com o XRoar (fita) — JÁ DISPONÍVEL no bridge

O `src/renderer/public/xroar/xroar.html` JÁ expõe (via postMessage `fn`, prontos p/ `sendCmd`):
- `insert_tape` (fileName, fileData) → grava na VFS + `xroar_insert_input_tape`. **Aceita .CAS E .WAV.**
- `eject_tape` · `tape_play` · `tape_pause` · `tape_rewind` (rewind direto ou eject+reinsert = pos 0).
- **Contador de fita**: o iframe emite `xroar-tape-counter { position, playing }` automaticamente.
- `pause`/`resume` do emulador · `save_snapshot` (SNA) · `load_file` (auto).

HOJE o `XRoarPanel` NÃO usa nada disso: `.cas/.wav` caem no `load_file` auto, sem transport nem contador
(`DISK_EXTS = ['dsk','vdk','jvc','dmk']`; o resto vai pro load_file).

**A implementar no XRoar (relativo a K7):**
1. Rotear `.cas/.wav` para **`insert_tape`** (não load_file) — `CASSETTE_EXTS = ['cas','wav']`.
2. Seção "Fita (K7)" na aba XRoar: botões ▶ play / ⏸ pause / ⏮ rewind / ⏏ eject (mandam `tape_play`…).
3. **Contador/indicador de fita** ouvindo `xroar-tape-counter` (posição + LED playing) — barrinha de status.
4. **CLOAD/CLOADM/RUN automático**: após `insert_tape`, `type_string` 'CLOAD'/'CLOADM:EXEC' (auto-rodar).
5. **Ponte K7 → XRoar**: botão "→ XRoar" na aba K7 envia o WAV/CAS atual via `insert_tape` (prop
   `pendingTape`, no espírito do `pendingLoad`) — testa a fita preservada no emulador real.
6. **Snapshot (SNA)**: `save_snapshot` já existe → botão "Salvar estado".

**IMPLEMENTADO: painel "Fita (K7)" na aba XRoar.** ⚠️ LIMITAÇÃO DO BUILD ATUAL do `xroar.wasm`:
só exporta `wasm_load_file` e `xroar_eject_input_tape`. NÃO exporta `xroar_insert_input_tape`,
`tape_play`, `tape_pause`, `xroar_rewind_input_tape`, `wasm_get_tape_position` (confirmado: `ccall`
dava "func is not a function"). Por isso o painel usa **load_file (auto-anexa+roda)** + **eject** +
**CLOAD/CLOADM** (type_string). Motor manual (play/pause/rewind) e contador NÃO existem neste build.
→ **Futuro:** recompilar o `xroar.wasm` com essas funções em EXPORTED_FUNCTIONS para ter transport +
contador reais. (A cassete ANIMADA da aba K7 — §9d — NÃO depende disso: roda do nosso decode/playback.)

**MELHORIAS FUTURAS (anotadas):**
- **Capturar CSAVE** do CoCo emulado (saída de fita → `.cas`/`.wav`) — exigiria `xroar_insert_output_tape`
  (se o WASM expõe). Caminho alternativo de aquisição: gerar a fita pelo próprio emulador.
- **Ponte K7 → XRoar** (`pendingTape`): botão "→ XRoar" na aba K7 empurrando a fita atual (hoje a aba
  XRoar abre a fita por diálogo; a ponte direta vem com a aba K7).
- **Contador em tempo (mm:ss)** se descobrirmos a unidade de `position` (hoje cru, 4 dígitos).

## 9c. ANÁLISE das amostras reais (amostras/K7) — 2026-06-03

3 WAV 22 kHz mono com TELA DE ABERTURA: QUASAR, STINGER, dinowars. Decodificados com `decodeWav`:

| Fita | Sync FSK | 1º arquivo (padrão) | Resto |
|---|---|---|---|
| **QUASAR** | OK | "QUASAR" **ML, load/exec $009F** | vira "lixo" após o loader (encoding custom) |
| **STINGER** | OK | "STINGER0" **ML, load/exec $009F** | ~25 blocos DATA (6144 B), alguns checksum ruim |
| **dinowars** | **NÃO sincronizou** | — | precisa ajuste de limiar (K8) ou é 100% custom |

**ACHADO-CHAVE:** todas usam **LOADER CUSTOM** — um ML minúsculo carregado em **$009F** (página direta)
que, ao rodar, decodifica o resto (jogo + **tela de abertura**) num **stream NÃO-padrão (turbo/custom
FSK)**. Nosso decoder padrão (1200 baud) lê só o NAMEFILE + o loader; o restante ele não decodifica
(daí o "lixo"). dinowars nem sincronizou → ou precisa de ajuste fino de amplitude/limiar (K8) ou usa
leader/encoding diferente.

**Consequência p/ converter em DSK** (ver §11): conversão direta FSK→DSK NÃO funciona para a parte
custom. O caminho viável é **ASSISTIDO POR EMULADOR**.

## 11. FUTURO — Converter fita com LOADER+TELA em DSK (assistido por emulador) ⭐⭐

Recurso futuro de ALTO valor (e a análise acima mostra que é o ÚNICO caminho prático p/ loaders custom):
1. **Inserir a fita** (.wav/.cas) no XRoar (já temos) → **CLOADM:EXEC** → o LOADER ORIGINAL roda e
   decodifica TUDO na RAM (incl. a tela de abertura montada em $400 e o programa principal).
2. **Capturar o snapshot** (SNA — `save_snapshot` já existe) ou ler regiões de memória do emulador.
3. **Reconstruir** a partir da RAM: o programa principal (achar load/exec reais) + a tela $400
   (512 B → render VDG texto/SG4) → montar um **.BIN** (LOADM) e **gravar num .DSK** (encodeDsk).
4. Resultado: versão DISCO que carrega rápido, **preservando a tela de abertura** original.
- Variante sem emulador: reverter o encoding custom de cada loader (por softhouse) — caro/frágil.
- **Preservar a tela $400** isolada como imagem (render) é um sub-recurso (capa histórica).
- Precisa: leitura de memória do XRoar ($0400-$05FF e a faixa do programa) — investigar se o bridge
  expõe `wasm_read_memory`/dump de RAM, ou usar o SNA e parsear o snapshot.

## 9d. FITA K7 ANIMADA (cosmético, alto charme — VIÁVEL) ⭐

Análogo ao DiskMap/animação do defrag, mas uma **cassete animada** (SVG + requestAnimationFrame):
- Carcaça + **dois carretéis** com raios variáveis: alimentação (direita) ENCOLHE, recolhimento
  (esquerda) CRESCE; ambos giram. Realismo de época: velocidade angular ∝ 1/raio (cheio gira devagar).
- Cabeça de leitura/gravação embaixo + janelinha de contador. LED verde (PLAY) / vermelho (REC).
- **Progresso (0..1)** vem de: decode FSK · playback Web Audio (currentTime/duration) · `xroar-tape-counter`
  (anima junto com o emulador!) · tempo de REC.
- **Modo "Tempo real / Época"**: toca/anima na DURAÇÃO REAL da fita (~2–3 min p/ 16 KB a 1200 baud),
  seletor de velocidade (Instantâneo / Tempo real / ×2 ×4). O DECODE é instantâneo — a lentidão é só UX
  (mesma ideia do delay do defrag). Para ler fita REAL (line-in), a velocidade já é física.
- Sincroniza com a waveform (playhead correndo na onda).
- Risco BAIXO (SVG + rAF). Encaixa no K0/K1 ou como camada visual sobre a waveform.

## 9e. NORMALIZAR / REMASTER — fita bruta → arquivo limpo e MENOR (VIÁVEL) ⭐

Ideia do usuário: pegar um WAV bruto/grande lido do datacorder e, com 1 clique, **regerar um arquivo
LIMPO e padronizado** (menor) usando SÓ os bits decodificados.
- **Decodificar** o WAV ruidoso → bytes FSK (estrutura CAS). → **Reemitir**:
  - **`.CAS` limpo** (`encodeCas`, já temos): minúsculo (só os bytes digitais), 100% padrão CoCo/Dragon.
  - **`.WAV` limpo** (`encodeWav`, futuro): FSK perfeito numa taxa escolhida (ex.: 11 kHz) com leader/sync
    padrão — bem MENOR que a captura 22/44 kHz e lê de forma confiável no hardware real.
- É o **WAV→CAS (A1) + CAS→WAV (A2)** embalado num botão **"Normalizar"**.
- ⚠️ **Limite (da análise das amostras):** para fitas com **LOADER CUSTOM/turbo** (QUASAR/STINGER/…),
  o decoder lê só o namefile + loader padrão; o jogo está num stream não-padrão que ele não decodifica
  → a normalização cobre só a parte padrão. Para o jogo completo dessas, é o caminho **K9** (emulador →
  SNA → DSK). Para fitas PADRÃO (BASIC/ML salvos normalmente), a normalização funciona inteira.
- Vira a fase **K10 — Normalizar/Remaster** (botão na barra: decode → CAS/WAV limpo, menor, padrão).

## 10. O que preciso de você
- Os **WAVs reais** (fitas e, principalmente, os com **loader + tela de abertura**) para eu mapear a
  estrutura e validar o decode + o render da tela $400.
  → O usuário vai **criar uma subpasta em `amostras/`** com esses WAV e avisar. ENTÃO eu analiso o
    padrão (estrutura dos blocos, loaders multi-estágio, a tela $400) antes de implementar o K2/K7.
- Sua preferência de **ordem** (sugiro K0→K1→K2 primeiro: abrir, ver a onda e decodificar).
