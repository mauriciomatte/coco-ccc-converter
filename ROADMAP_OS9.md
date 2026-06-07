# Roadmap 1 — Suporte a OS-9 / NitrOS-9 (sistema de arquivos RBF)

> Objetivo: ler (e depois editar) discos **OS-9/NitrOS-9** no CoCoDCU. Hoje só
> identificamos a presença de OS-9 (string "NitrOS-9/6809 Level…", `DD.TOT` no LSN0);
> não lemos o conteúdo. As imagens **MiniIDE** e **CoCoSDC RetroRewind** têm partições
> OS-9 inteiras inacessíveis.
>
> Premissa do usuário: **depois de entender bem o RBF, REANALISAR a MiniIDE** — é
> provável que a leitura OS-9 revele dados hoje vistos como "lixo"/opacos.

---

## Status (2026-06-02)

- **Fase 0 — CONCLUÍDA ✅.** O formato RBF foi estudado a partir de fontes reais
  (`amostras/os9/`: `OS9Defs`, `dosdir.asm` de Todd Wallace — licença permissiva —, e
  `hrsdos.c` de Robert Gault) e **validado byte-a-byte contra 19 discos OS-9 reais**.
  Spec confirmado abaixo (✔ marca campos verificados em disco real).
- **Fase 1 — REANÁLISE dos containers CONCLUÍDA ✅** (ver "Fase 1" abaixo). A hipótese se
  confirmou: a região "lixo" da MiniIDE é um **NitrOS-9 6309 Level 2** de 128 MB (690 arq) e o
  CoCoSDC.VHD é um **NitrOS-9/6809 Level 2** de 90 MB (574 arq) — ambos **raw (não-doubled)** no
  **offset 0**. Extração comprovada por **CRC de módulo** (1576 módulos = `0x800FE3`).
- **Fase 2 — protótipo de LEITURA pronto** (fora da UI): `src/main/converter/os9.ts`
  (parser clean-room) + harness `tools/os9probe.ts`. Lê LSN0, FDs, lista de segmentos,
  diretórios **hierárquicos**, atributos, datas, tipos de módulo e espaço livre. Validado em
  35T/40T/80T, **L1 e L2**, **6809 e 6309**, discos em branco e nas 2 partições reais.
- **⚠️ REGRA DE DETECÇÃO (descoberta com discos em branco):** um disco **OS-9 também passa no
  teste RS-DOS** (`isRsDosDisk`=true), mas um RS-DOS nunca passa no OS-9. Logo o discriminador
  **DEVE testar OS-9 (estrito) ANTES de RS-DOS**: `OS-9 → Dragon → RS-DOS → desconhecido`.
- **Próximo:** integração na UI (detecção no offset 0 + navegação hierárquica).

---

## Fase 0 — Estudo a fundo da arquitetura OS-9 (nível engenharia) ✅ CONCLUÍDA

Estudar e DOCUMENTAR internamente (nota clean-room, em TS depois — sem copiar GPL):

**1. Modelo de disco (RBF — Random Block File Manager)**
- Endereçamento por **LSN** (Logical Sector Number), setor de 256 bytes (padrão CoCo).
- **LSN 0 — Setor de Identificação** (campos `DD.*`):
  - `DD.TOT` (3B): total de setores do disco.
  - `DD.TKS` (1B): setores por trilha.
  - `DD.MAP` (2B): tamanho (bytes) do mapa de alocação.
  - `DD.BIT` (2B): setores por bit no mapa de alocação (tamanho do "cluster").
  - `DD.DIR` (3B): LSN do **descritor do diretório-raiz**.
  - `DD.OWN`, `DD.ATT`: dono e atributos do disco.
  - `DD.DSK` (2B): ID do disco; `DD.FMT` (1B): formato (lados/densidade/track0).
  - `DD.SPT` (2B): setores por trilha; `DD.BT`/`DD.BSZ`: LSN+tamanho do bootstrap.
  - `DD.DAT`, `DD.NAM` (nome do volume, último char com bit 7 setado), `DD.OPT`.
- **Mapa de alocação** (a partir do LSN 1, `DD.MAP` bytes): 1 bit por cluster
  (cluster = `DD.BIT` setores); bit=1 usado, 0 livre.

**2. Descritor de arquivo (FD — File Descriptor)** — 1 setor por arquivo:
- `FD.ATT` (1B): atributos/permissões (d/s/p/e/w/r para owner e public; bit dir).
- `FD.OWN`, `FD.DAT` (data), `FD.LNK` (contagem de links), `FD.SIZ` (4B: tamanho em bytes).
- `FD.Creat` (data de criação), `FD.SEG`: **lista de segmentos** — até ~48 entradas de
  `{LSN inicial (3B), tamanho em setores (2B)}`. Arquivo pode ser **fragmentado** (multi-segmento).

**3. Diretório** — é um ARQUIVO cujo conteúdo são entradas de **32 bytes**:
- 29 bytes de nome (último char com bit 7 setado) + 3 bytes = LSN do FD do arquivo.
- Entradas `.` e `..`; entrada vazia = primeiro byte 0. **Hierárquico** (subdiretórios!).

**4. Variantes**: OS-9 **Level 1 × Level 2**; **NitrOS-9 6809 × 6309**; lado simples/duplo.

**Referências** (estudar a lógica, reimplementar limpo em TS):
- **NitrOS-9** — fonte do SO (`github.com/nitros9project/nitros9`).
- **Color Computer Toolshed** — utilitários em C que LÊEM/ESCREVEM imagens OS-9
  (`github.com/nitros9project/toolshed`). ⚠ conferir licença antes de usar como base.
- OS-9 Technical Reference / "OS-9 Disk Format" (dragon32.info, maddes, etc.).

### Spec RBF — CONFIRMADO em disco real (offsets big-endian, setor = 256 B)

`LSN0` — Setor de Identificação:
```
$00 DD.TOT 3B  total de setores            ✔ (DD.TOT*256 == tamanho do arquivo)
$03 DD.TKS 1B  setores por trilha (=18)    ✔
$04 DD.MAP 2B  bytes no bitmap de alocação ✔ (usado p/ espaço livre)
$06 DD.BIT 2B  setores por cluster (=1)    ✔
$08 DD.DIR 3B  LSN do FD do diretório-raiz ✔ (=2 nos floppies; =18 num DS80)
$0B DD.OWN 2B  ·  $0D DD.ATT 1B  ·  $0E DD.DSK 2B (id)
$10 DD.FMT 1B  formato (bit0 lados)        ✔ (0x02=SS, 0x01 visto em disco 2-lados)
$11 DD.SPT 2B  setores por trilha          ✔
$1F DD.NAM     nome do volume (último char com bit 7) ✔
```
`File Descriptor` (apontado por LSN):
```
$00 FD.ATT 1B  bit7 = diretório (D) + S/PE/PW/PR/E/W/R   ✔ (CMDS/SYS/DEFS deram <DIR>)
$03 FD.DAT 5B  data modif. (ano-1900, mês, dia, hora, min) ✔
$08 FD.LNK 1B  contagem de links
$09 FD.SIZ 4B  tamanho em bytes            ✔ (confirmado em todos)
$0D FD.DCR 3B  data de criação (ano-1900, mês, dia)
$10 FD.SEG     lista de segmentos: até 48 × {LSN 3B, nº setores 2B}, termina em entrada zero ✔
```
`Entrada de diretório` (32 B): nome 29 B (último char bit-7; 1º byte 0 = livre) + LSN do FD 3 B.
`.` e `..` presentes; slots obsoletos podem ler LSN `0xFFFFFF`. ✔

> Implementação clean-room: `src/main/converter/os9.ts`. Os offsets são fato técnico de
> formato (não copiável); `dosdir.asm`/`hrsdos.c` serviram só de referência.

**Entregável da Fase 0:** ~~`docs/os9-rbf.md`~~ → consolidado **neste spec** + o parser
`os9.ts` (auto-documentado) + o corpus catalogado em `docs/test-corpus.md`.

---

## Fase 1 — Reanálise dos containers com a lente OS-9 ✅ CONCLUÍDA

Análise somente-leitura sobre os arquivos reais (originais intactos). Resultado por container:

**MiniIDE** (`MiniIDE_Backup_v3.img`, 507 MB) — layout físico descoberto:
```
[0 ──────── 128 MB)   Partição OS-9 RAW: "NitrOS-9 6309 Level 2 v2.3.9"
                       DD.TOT=524288 SPT=32 cluster=2 rootDir@LSN129 — 1662 arq / 154 dirs
[128 ─ 165,7 MB)      Flash APAGADO (0xFF) — não é partição
[165,7 MB ─── fim)    HDBDOS: discos RS-DOS SECTOR-DOUBLED (o que o app já lê)
```
> Confirmação-chave: o **sector-doubling é só da região RS-DOS**; a partição OS-9 usa LSN
> nativo de 256 B em **offset 0**. Bate com `hrsdos.c`/`SPECS.BAS` (OS-9 e RS-DOS por offset).

**CoCoSDC.VHD** (135 MB) — ⚠️ a 1ª interpretação ("MiniIDE doubled") estava ERRADA:
```
[0 ──── 90 MB)   Partição OS-9 RAW: "NitrOS-9/6809 Level 2" — 2859 arq / 215 dirs (dir 399 entradas)
[90 ─ 135 MB)    Flash APAGADO (0xFF)
```
> Não é HDBDOS doubled — é **uma partição OS-9 raw**. Hoje o app a abre como "MiniIDE vazio".

**DriveWire** (`Games DW.dsk`, 11,45 MB): 71×161.280 **todos RS-DOS**, 0 OS-9 (1ª interpretação ok).
**RetroRewind** (15,85 GB): **MBR + FAT32** (`MSDOS5.0`) com os `.dsk` como arquivos; OS-9 só
nos `.dsk` individuais (parseáveis após extração da FAT).

**Provas de robustez (itens esgotados):**
- Travessia completa: 1662+2859 arquivos, prof. 5, dir de 399 entradas, **0 segmentos fora da imagem**.
- **Extração byte-perfeita:** **1576 módulos** com CRC OS-9 = `0x800FE3` (constante do `OS9Defs`);
  header-parity 1673/1673; **20 módulos fragmentados (multi-segmento) também passam no CRC**.
- Tipos de módulo (p/ coluna da UI): Program/DevDesc/Driver/FileMgr/System/Subr/Data; langs 6809/Basic09/Pascal/C.
- **L1 = L2** e **6809 = 6309** no nível de disco (mesmo código lê tudo).

**Detector estrito `isOs9Strict` (anti-falso-positivo p/ container):** base + `cluster`=potência-de-2
+ raiz começa com `.`/`..` apontando para o próprio FD. Aceita 22/22 discos + 2/2 partições +
**discos VAZIOS**, rejeita o outlier. Confiável **no offset 0**; varredura bruta de flash apagado
tem ~3 falsos/100 MB → **detectar no offset 0 / offsets de partição conhecidos, não varrer byte a byte**.

**Discos em branco canônicos** (`amostras/blank-disks`, Color Computer Archive) — referência por geometria:

| Tamanho | DD.TOT | DD.MAP | DD.FMT | DD.DIR | lados |
|---|---|---|---|---|---|
| 158K (35T) | 630 | 79 | 0x0 | LSN 2 | 1 |
| 180K (40T) | 720 | 90 | 0x0 | LSN 2 | 1 |
| 360K (DS) | 1440 | 180 | 0x1 | LSN 2 | 2 |
| 720K (DS) | 2880 | 360 | 0x3 | LSN 3 | 2 |

> `DD.FMT` e `DD.DIR` **variam** (raiz nem sempre no LSN2!) → ler dinâmico (já feito).
> **Bônus DMK:** os blanks vêm também em **DMK** (header 16 B + trilhas de 6400 B; byte1=cilindros,
> byte4 bit `0x10`=face única) — referência p/ o futuro suporte DMK.

**Entregável:** ✅ relatório (acima) + corpus confirmado em `docs/test-corpus.md`.

---

## Fase 2 — Implementar LEITURA OS-9 no app

- Módulo `src/main/converter/os9.ts` — **FEITO (protótipo validado)**:
  - `isOs9Disk(raw, base?)` (valida LSN0 + confirma que o FD raiz é diretório),
    `parseOs9(raw, {base?, maxDepth?})` (ident + **árvore hierárquica**, conta arquivos/dirs,
    espaço livre), `readFD`, `readFileData` (segue `FD.SEG` → extrai arquivo), `listDir`,
    `flattenOs9` (caminhos estilo POSIX). Guard contra ciclos por conjunto de ancestrais.
  - Harness: `tools/os9probe.ts` (compila via `tsconfig.tools.json`, roda no corpus).
  - **Pendente:** `isOs9Strict` (detector p/ container) + mapear `Os9Node` para a UI (nome/tamanho/tipo).
- Detecção: **OS-9(strict) ANTES de RS-DOS** (regra obrigatória — disco OS-9 também passa em
  `isRsDosDisk`). Ordem: `OS-9 → Dragon → RS-DOS → desconhecido`. Em container, testar `isOs9Strict(buf, 0)`.
- UI:
  - Selo "LIDA: **OS-9 / RBF**" (cor própria); discos OS-9 **somente-leitura** primeiro.
  - **Navegação hierárquica** (OS-9 tem SUBDIRETÓRIOS; nossa lista é PLANA hoje) — precisa
    de árvore ou navegação por caminho (breadcrumb).
  - Extrair arquivo OS-9 → pasta do PC (reusa o extrator).
- As partições OS-9 da MiniIDE/CoCoSDC viram **navegáveis e extraíveis**.

---

## Fase 3 — ESCRITA OS-9 (ver/editar/inserir arquivos) — ESTUDO DE VIABILIDADE (2026-06-03)

> Pergunta do usuário: dá para VER / EDITAR / INSERIR arquivos na partição OS-9? Conclusão curta:
> **VER e EXTRAIR já funcionam.** ESCREVER é **possível**, porém **mais complexo e arriscado** que o
> RS-DOS — exige gerir o filesystem RBF inteiro de forma consistente. Viável por fases, com validação
> obrigatória em emulador/hardware.

### O que ESCREVER no RBF exige (todas as etapas têm que ficar consistentes)
INSERIR um arquivo:
  1. **Alocar espaço** no **bitmap de alocação** (LSN1, `DD.MAP` bytes): achar bits livres; 1 bit =
     1 cluster = `DD.BIT` setores (=2 na MiniIDE). Marcar usados.
  2. **Criar um File Descriptor (FD)** (1 setor): `FD.ATT`, `FD.OWN`, `FD.DAT`, `FD.LNK=1`,
     `FD.SIZ`, `FD.DCR`, e a **lista de segmentos `FD.SEG`** apontando p/ os clusters alocados.
  3. **Gravar os dados** do arquivo nos clusters.
  4. **Adicionar a entrada de 32 B** no arquivo-DIRETÓRIO pai (nome + LSN do FD). Se o diretório
     estiver cheio, **CRESCER o diretório** (alocar clusters + atualizar o FD do diretório).
  5. **Regravar o bitmap** atualizado.
EXCLUIR: liberar `FD.SEG` no bitmap → liberar o setor do FD → remover a entrada do diretório →
  **decrementar `FD.LNK`** (só libera de fato quando chega a 0 — OS-9 tem hard links).
EDITAR (substituir): excluir + inserir (ou in-place se o tamanho não mudar).
RENOMEAR: trocar o nome na entrada de 32 B do diretório (barato).
CRIAR DIRETÓRIO: novo FD de dir + entradas `.`/`..` + entrada no pai.

### O que é POSSÍVEL × DIFÍCIL/ARRISCADO
POSSÍVEL (ordem de menor→maior risco):
  - **Ver / extrair** — ✅ JÁ FEITO (`os9.ts`: `readFD`/`readFileData` seguem `FD.SEG`).
  - **Renomear** arquivo/dir — barato (só a entrada do diretório).
  - **Criar diretório** — sem alocação de dados grande.
  - **Criar disco OS-9 em branco** (`.os9` avulso) — escrever LSN0 + bitmap + raiz; temos os
    **templates canônicos** das 4 geometrias (ver Fase 1/blank-disks).
  - **Inserir arquivo** em diretório de USUÁRIO — precisa de alocação + FD + entrada + bitmap.
  - **Excluir arquivo** — bitmap + entrada + `FD.LNK`.
DIFÍCIL / ARRISCADO:
  - Escrever na **partição de SISTEMA viva** (128 MB) do CF do usuário — alto risco (corromper o
    NitrOS-9 bootável). NÃO tocar OS9Boot/SYS/CMDS de sistema.
  - Manter o **bitmap**, **contagem de links** e **crescimento de diretório** sempre consistentes —
    bug = corrupção do filesystem.
  - **Fragmentação** (multi-segmento) quando não há cluster contíguo.

### A favor (reduz o risco)
  - **Sem CRC de filesystem:** o RBF não faz checksum de arquivos (só MÓDULOS têm CRC interno — e isso
    só importa se editarmos o CONTEÚDO de um módulo, não ao inserir/remover arquivos inteiros).
  - **Formato L1 = L2, 6809 = 6309 em disco** (mesmo código) — confirmado.
  - **Escrita é por setores** (random-access) no `.img`/`.os9`: muda só FD + clusters + bitmap +
    diretório; não reescreve a partição inteira.
  - **Templates de blank** já validados; corpus grande p/ teste; `os9probe.ts` p/ verificar round-trip.

### Plano por fases (proposto)
  - **O0 (baixo risco):** `renomear` + `criar diretório` (sem alocação pesada).
  - **O1:** **criar disco OS-9 em branco** (`.os9` avulso) — fresh, isolado, fácil de validar.
  - **O2:** **inserir arquivo** em diretório de usuário (alocação + FD + dir + bitmap), com round-trip
    e validação em **XRoar/MAME + Toolshed `os9 dir`** antes de tocar imagem real.
  - **O3:** **excluir arquivo** (+ `FD.LNK`).
  - **O4 (futuro):** escrita na partição de sistema da MiniIDE/CoCoSDC — só depois de O1–O3 muito sólidos.

### Salvaguardas (inegociáveis)
  - **Sempre em CÓPIA.** Nunca tocar a partição de sistema sem validação prévia.
  - **Validar com Toolshed** (`os9` lê/escreve imagens OS-9 — cross-check) e **bootar no XRoar/MAME**.
  - Bloquear escrita em arquivos de SISTEMA; começar só por diretórios de usuário (APPS/GAMES/TMP).
  - Reimplementar limpo em TS (sem GPL embarcado); usar NitrOS-9/Toolshed só como referência de formato.

### Conclusão
**Ver/extrair: pronto.** **Escrever: viável e bem mapeado**, mas é a parte mais delicada do projeto —
deve vir DEPOIS da escrita RS-DOS/MiniIDE estar madura, e começar por `.os9` avulso + diretórios de
usuário, com validação em emulador/Toolshed/hardware. **Não** mexer na partição de sistema até o motor
de escrita estar provado.

---

## Fase 4 — Imagens de TRILHA (DMK / SDF) — DMK ✅ (2026-06-07)

Muitos discos OS-9/NitrOS-9 (e os blanks do nosso corpus) circulam como **imagem de trilha**, não
como dump raw de setores. Os parsers (RBF, RS-DOS, Dragon) só consomem raw → a solução é **decodificar
a imagem de trilha para raw na leitura** e seguir o fluxo normal.

### DMK — ✅ IMPLEMENTADO (`src/main/converter/dmk.ts`, read-only)
Descoberta: 4 discos OS-9 do corpus estavam em DMK disfarçados de `.DSK` em `amostras/blank-disks/`
(tamanhos 224016/256016/512016/1024016 = `16 + trilhas×lados×6400`).

- **Formato** (clean-room, fato técnico): header 16 B (`[0]` write-protect; `[1]` nº trilhas; `[2..3]`
  trackLen LE incl. tabela IDAM; `[4]` flags, bit `0x10`=face única; `[12..15]` `0` ou `0x12345678`).
  Cada trilha = tabela IDAM de 64×2 B (offset 14 bits + bit `0x8000`=dupla densidade) + bytes crus
  da trilha (FM = cada byte DOBRADO → passo 2; MFM = passo 1). Setor = `A1 A1 A1 FE trk side sec sz crc`
  … `A1 A1 A1 (FB|F8) dados crc`.
- **`isDmk`** (magic + casamento EXATO de tamanho, zero falso-positivo) · **`dmkToRaw`** (decodifica
  por (trilha, lado) físicos, normaliza interleave, reporta `sectorsFound/Expected` p/ flagrar DMK
  degradado) · **`normalizeDiskImage`** (idempotente).
- **Integração:** de-DMK na LEITURA em `open-dsk-pane`, `image-analyze` (detecção OS-9/RS-DOS roda no
  raw), `image-extract`, `os9-pick-buffer`, `os9-open-path`, e IPC `normalize-image` no topo do
  `loadPaneFromBuffer` (cobre arrastar-e-soltar). O XRoar continua recebendo o `.dmk` NATIVO (ele lê DMK).
- **Validação (`tools/dmkprobe.ts`):** 4/4 detectados, geometria exata, **todos os setores
  decodificados** (630/720/1440/2880), OS-9 RBF válido; o par **720K bate byte-a-byte** com o `.OS9`
  gêmeo (1 byte de metadado). 158K/360K diferem só em metadados de formatação (são blanks distintos).

### SDF — ESTUDADO, DIFERIDO (sem amostra; baixa relevância p/ OS-9)
SDF é o formato do **CoCoSDC para discos NÃO-PADRÃO / protegidos** (o manual: "anything other than 18
sectors per track and 256 bytes per sector… copy-protection scheme"). Como o **OS-9/RBF é padrão**
(18 setores × 256 B), discos OS-9 **não** são distribuídos como SDF — SDF guarda jogos protegidos.
Spec coletado p/ implementação futura:
- Header de arquivo 512 B: `'SDF1'` (0-3), cilindros (4, ≤80), lados (5), write-perm (6), nested-sectors
  (7), resto zero. Track-records de **6656 B** em ordem física (cil/lado): header 256 B (`[0]`=nº
  entradas usadas, `[1..7]` reservado, `[8..255]` Sector ID Table = 31×8 B) + **6250 B** de dados crus
  + 150 B de padding (alinha a 512).
- **PENDENTE p/ implementar:** o layout exato da entrada de 8 B (cil/lado/setor/sz/flags/offset/CRC)
  não está claro nas páginas do manual; obter de uma **amostra `.sdf`** + firmware/`cocosdc-commander`
  (`libsdc.c`). **Ação:** pedir/baixar um `.sdf` real antes de codar (regra do projeto: nada de parser
  não-validado). Refs: CoCo SDC User Guide; `github.com/n6il/cocosdc-commander`.

## O6 — validação da ESCRITA em emulador/hardware (status 2026-06-07)
- **XRoar disponível** localmente: `G:\Meu Drive\EmuCoco\ASM_PRG\xroar\xroar.exe` (há também a aba
  XRoar embarcada p/ teste manual). **Toolshed NÃO instalado** (sem `os9`/`decb` no PATH).
- **Plano:** (a) harness de **round-trip de consistência** (insert/delete/mkdir via `os9.ts` → re-parse
  → conferir bitmap × segmentos, todos os arquivos legíveis, CRC de módulos inalterado); (b) **boot/dir
  manual no XRoar** de um disco que escrevemos; (c) opcional: instalar Toolshed p/ cross-check `os9 dir`.

---

## Riscos / pontos de atenção
- **Hierarquia de diretórios** (a UI atual é de diretório único) — maior mudança de UX.
- Arquivos **multi-segmento / fragmentados**; **Level 1 × Level 2**; **6809 × 6309**.
- Partição OS-9 da MiniIDE é grande (90+ MB) → **leitura sob demanda** (random-access).
- **Licença**: usar Toolshed/NitrOS-9 só como REFERÊNCIA de formato (fato técnico),
  reimplementando limpo em TS (regra do projeto: sem lógica GPL embarcada).
- O **FujiNet NÃO ajuda** aqui (é transparente a bloco); o que ajuda é Toolshed/NitrOS-9.

## Corpus de teste
- `MiniIDE_Backup_v3.img` (partição OS-9), CoCoSDC RetroRewind (discos `.dsk` OS-9, ex.: o
  de 737.280 B que hoje dá "formato não suportado"), e `.os9`/`.dsk` OS-9 avulsos.
