# Roadmap 1 — Suporte a OS-9 / NitrOS-9 (sistema de arquivos RBF)

> ## ✅ STATUS ATUAL — 2026-06-12 (v1.0.64 publicada; próxima planejada v1.0.65)
> **A maior parte deste roadmap está CONCLUÍDA.** A aba **OS-9** entrega leitura + escrita completas:
> navegar (árvore/lista/prato de clusters), criar disco em branco (4 geometrias), nova pasta, renomear,
> inserir, excluir, defrag (arquivo + disco); **tornar bootável** e **clonar disco de sistema** com
> **gabaritos NitrOS-9 embutidos** (360K/720K) + opção "referência sua" (158K/180K e demais); **SDF**
> (CoCoSDC) leitura+escrita; ponte **"Testar" → XRoar** (força CoCo3+RGB+Suave, ou Dragon 64 + BOOT em
> plataforma Dragon — D11); **partições OS-9 em container** (MiniIDE/CoCoSDC) com leitura + edição-no-arquivo
> travada na área de sistema; leitura de DMK.
>
> **DESDE v1.0.57 (atualização v1.0.64):** o roadmap OS-9 já estava maduro em v1.0.57 e as versões
> v1.0.58–v1.0.64 NÃO acrescentaram recursos novos ao motor RBF — concentraram-se em DSK/contêiner, K7,
> BASIC, FujiNet e gravação de cartão CF. Os únicos toques relacionados a OS-9:
> - **Imagem OS-9 TRUNCADA reconhecida e roteada à aba OS-9 com aviso (v1.0.55/.57):** uma imagem cujo
>   cabeçalho indica OS-9 mas que está truncada (ex.: vinda de download/TNFS) agora é identificada e
>   roteada à aba OS-9 com aviso claro, em vez do erro "Invalid DSK image size".
> - **OS-9 servido pela FujiNet — BOOT REAL na PLACA CONFIRMADO (2026-06-12):** o cliente/servidor TNFS
>   (FujiNet) que serve discos `.dsk` OS-9 foi validado end-to-end em HARDWARE real. O FujiNet é
>   transparente a bloco, então não toca o RBF, mas com isso a entrega de discos OS-9 pela placa está
>   comprovada (ver ROADMAP_FUJINET.md).
>
> **PENDENTE (OS-9) — os dois únicos itens em aberto:**
> - **Harness de round-trip da escrita RBF** com CRC de módulo (verificação automatizada — §O6). Ainda
>   NÃO feito (item de engenharia).
> - **make-bootable "só boot" sobre disco que JÁ tem sistema** — o botão "Só boot (avançado)" existe
>   (`Os9Tab.tsx`); falta CONFIRMAR o BOOT real no XRoar nesse caso estreito (humano). O caminho comum
>   ("Novo → Bootável → 360K ✓ gabarito"/clone) já foi CONFIRMADO bootando até o shell (2026-06-09), e a
>   **proteção** (v1.0.47) avisa em disco sem sistema e oferece "Bootável COM sistema" na hora.
> - Formatar/criar um **cartão FAT do zero** — marcado como NÃO necessário (os discos já abrem/editam).

> Objetivo: ler (e depois editar) discos **OS-9/NitrOS-9** no CoCoDCU. Hoje só
> identificamos a presença de OS-9 (string "NitrOS-9/6809 Level…", `DD.TOT` no LSN0);
> não lemos o conteúdo. As imagens **MiniIDE** e **CoCoSDC RetroRewind** têm partições
> OS-9 inteiras inacessíveis.
>
> Premissa do usuário: **depois de entender bem o RBF, REANALISAR a MiniIDE** — é
> provável que a leitura OS-9 revele dados hoje vistos como "lixo"/opacos.

> 📄 **Relato consolidado em inglês (para compartilhar):** `docs/OS9_STATUS_EN.md` (+ `.txt`) —
> resumo completo do suporte OS-9 (arquitetura, formato on-disk, boot em 2 partes, validações,
> pendências) com um tópico dedicado ao **SDF** (o que temos × o que falta para implementar).

---

## Status (2026-06-07) — LEITURA + ESCRITA + PONTE XROAR na UI ✅

As Fases 2 e 3 foram ENTREGUES (v1.0.17→v1.0.23; DMK em v1.0.28; ponte XRoar em v1.0.29):
- **Fase 2 — leitura na UI ✅:** detecção `OS-9(strict)→Dragon→RS-DOS` no offset 0; aba **OS-9**
  (`src/renderer/src/components/Os9Tab.tsx`) com DOIS explorers empilhados (árvore hierárquica +
  lista + `Os9MediaPanel` com bitmap de clusters). Navega/extrai a partição OS-9 da MiniIDE/CoCoSDC
  e `.os9`/`.dsk` avulsos.
- **Fase 3 / O2–O5 — escrita na UI ✅:** O2 criar disco em branco (4 geometrias), O3 renomear/mkdir,
  O4 inserir/excluir, defrag (arquivo + disco), cópia recursiva de pasta entre discos (drag-drop),
  drag-out p/ Windows, e **O5 escrita em partição de container** (grava direto no `.img` com guarda
  de área de sistema OS9Boot/SYS/CMDS/DEFS + validação `parseOs9` antes de gravar). Motor em
  `src/main/converter/os9.ts`; IPC `os9-*` em `src/main/index.ts`; preload em `src/preload/index.ts`.
- **Ponte OS-9 → XRoar ✅ (item 1, v1.0.29):** botão **"Testar"** na toolbar da aba OS-9 (apenas
  discos EM MEMÓRIA — Novo / Abrir .os9 / drag-drop / .dsk avulso; **desabilitado** p/ partição de
  container, grande demais p/ um floppy). Modal: seletor de drive (0-3) + **Bootar OS-9** (`DOS` no
  CoCo / `BOOT` no Dragon, via `runCmd`), **Montar+Reset**, **Montar (sem reset)**. O disco raw OS-9
  é enviado ao XRoar como `.dsk` (o emulador acerta a geometria pela extensão/tamanho); `'os9'` foi
  adicionado a `DISK_EXTS` no `XRoarPanel.tsx` (renomeado p/ `.dsk` na VFS). Reusa `setXroarLoad`
  (mesmo caminho do "Testar Painel" da DSK). Handler `handleTestOs9InXroar` no `App.tsx`.

- **D12 — ESCRITA FAT (CoCoSDC/RetroRewind) ✅ (v1.0.30, 2026-06-07):** motor clean-room em
  `src/main/converter/fat.ts` (`fatAddFile`/`fatReplaceFile`/`fatDeleteFile` + `Writer` de acesso
  aleatório — nunca carrega a imagem inteira; atualiza as 2 cópias da FAT, gera LFN, cresce o
  diretório). IPC `image-fat-writeback`/`image-fat-add[-pick]`/`image-fat-delete` (VERIFICAM relendo).
  UI: "Salvar" do contêiner CoCoSDC faz write-back + botão "Inserir disco" (modal de confirmação igual
  à MiniIDE). Harness `tools/fatrt.ts` (FAT12+FAT32: insert/replace±/delete/reuso/cresce-dir/integridade
  = 28/28).
- **RetroRewind/FAT — OS-9 dentro da imagem ✅ (v1.0.30):** um `.dsk` OS-9 dentro de um contêiner FAT é
  detectado (`os9-detect-buffer`) e aberto EDITÁVEL na aba OS-9 (`maybeRouteOs9`), não mais "lixo" na DSK.
- **(c) Tornar disco BOOTÁVEL ✅ (v1.0.31, 2026-06-08):** o boot do CoCo tem 2 partes — (1) BOOT TRACK
  no **track 34** (LSN `34*SPT*sides`, `SPT` setores; o comando `DOS` carrega em $2600 e executa) e
  (2) arquivo **OS9Boot** (DD.BT/DD.BSZ). `os9MakeBootable(raw, refDisk)` CLONA os dois de um disco
  bootável de referência (mesma geometria): copia o boot track verbatim + reserva no bitmap + insere
  o OS9Boot + grava DD.BT/DD.BSZ/DD.FMT. `os9BootInfo()` lê bootável. IPC `os9-make-bootable` (escolhe
  o .dsk de referência) + botão "Bootável" + indicador "⚡/○". Validado `tools/os9mkboot.ts` (13/13,
  boot track byte-idêntico ao disco real). CAVEAT: carrega o kernel; sistema usável precisa também de
  sysgo/startup/CMDS/SYS. ⚠️ boot real no XRoar AINDA não confirmado por humano (config no README do corpus).
- **Disco BOOTÁVEL USÁVEL + boot-com-programas ✅ (v1.0.33, 2026-06-08):** `os9CloneBootable(refDisk,
  programs[])` clona um disco de SISTEMA de referência (kernel+sysgo+startup+CMDS+SYS → usável) e, com
  programas, insere-os em CMDS (attr 0x2D) + PRESERVA o startup e ANEXA os nomes (rodam no boot). Dropdown
  "Novo…" da aba OS-9 = 3 grupos (Em branco/Bootável/Bootável+programas) × 35T/40T/DS(360k)/DS(720k); IPC
  `os9-new-bootable`. Validado `tools/os9clone.ts` 12/12. (disco de ref. precisa de espaço livre p/ os progs.)
- **VALIDAÇÕES em mídia/discos REAIS (2026-06-07/08):** D12 FAT vs CÓPIA do RetroRewind real (15,85 GB,
  FAT32, 4699 discos) = 10/10 (`tools/fatreal.ts`); escrita OS-9 vs discos NitrOS-9 reais bootáveis
  = 7/7 por disco (`tools/os9real.ts`); SDF vs DMK gêmeo = 630/630 (`tools/sdfprobe.ts`). Corpus
  (gitignored): `amostras/os9/nitros9-v3.3.0-6809-L2/` e `amostras/sdf/`.

**Pendências OS-9 que SOBRAM:** (atualizado v1.0.64 — ver header) o caso comum de **BOOT real** já foi
confirmado no XRoar; resta só o **make-bootable "só boot" sobre disco que JÁ tem sistema** (humano);
§O6 (harness round-trip de escrita OS-9/RBF com CRC de módulo + Toolshed `os9 dcheck` opcional, NÃO
instalado) continua em aberto. ~~**D11**~~ FEITO (v1.0.57). ~~**SDF**~~ FEITO: leitura (v1.0.40-validada)
+ escrita (v1.0.41).

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

### SDF — ✅ IMPLEMENTADO: LEITURA + ESCRITA (2026-06-08) — `src/main/converter/sdf.ts`
> **ESCRITA (v1.0.41):** `rawToSdf(raw,{sectorsPerTrack,sides})` gera SDF MFM padrão (256B) com address
> marks + GAPs + CRC-CCITT WD; **CRCs batem byte-a-byte com SDF real** (válido p/ CoCoSDC). Ligado em
> "Salvar Como .sdf" / "Salvar" (re-grava .sdf). Round-trip `tools/sdfrt.ts` = 9/9. Geração só p/
> geometria padrão; FM/protegido = só leitura.
SDF é o formato do **CoCoSDC** (Darren Atkinson) p/ discos NÃO-PADRÃO/protegidos. É **DMK pré-indexado**:
o ATmega328 do CoCoSDC não tem RAM p/ decodificar fluxo DMK cru em tempo real, então cada trilha leva uma
**Sector ID Table** no cabeçalho → busca instantânea. **Relevância p/ OS-9 = BAIXA** (OS-9/RBF é padrão
18×256, circula como `.dsk/.os9/.dmk`; SDF guarda jogos protegidos / FLEX densidade-mista) — NÃO bloqueia
nada do OS-9. ⚠️ **Detectar pelo magic `SDF1`, NUNCA pela extensão** (`.sdf` colide com "Sam Disk Format"
do SAM Coupé). O estudo **CONFIRMOU 100% o nosso mecanismo de boot** (boot na Trilha 34 Setor 1 via
cobbler/os9gen; DOS; OS9Boot; Toolshed injeta o boot na Trilha 34).

**FILE HEADER (512 B):** `0x000` 4B `'SDF1'` · `0x004` 1B cilindros (≤80) · `0x005` 1B lados (1/2) ·
`0x006` 1B write-perm (0x00=R/W, 0xFF=RO) · `0x007` 1B nested-sectors (0/1) · `0x008..0x1FF` reservado=0.
**Tamanho total = 512 + (C × S × 6656).**

**TRACK RECORD (6656 B, ordem física por (cilindro,lado)):** `0x0000..0x00FF` Track Header (256) ·
`0x0100..0x1969` Raw Track Data (6250) · `0x196A..0x19FF` Padding (150, alinha a 512).

**TRACK HEADER (256 B):** `0x00` = nº de entradas ativas; `0x01..0x07` reservado=0; `0x08..0xFF` =
Sector ID Table (até **31 entradas × 8 B**, empacotadas do início, resto zero).

**SECTOR ID TABLE ENTRY (8 B):**
- `0x00` u16 LE **ID Field Offset**: bits 0–13 = offset (a partir do início do Track Record) p/ o
  cabeçalho de ID do setor; **bit14** = densidade simples (FM); **bit15** = erro de CRC no ID.
- `0x02` u16 LE **Data Field Offset**: bits 0–13 = offset p/ o campo de dados; **bit14** = Deleted Data
  Mark; **bit15** = erro de CRC nos dados.
- `0x04` u8 cilindro físico · `0x05` u8 lado físico · `0x06` u8 **nº lógico do setor** (1–18) ·
  `0x07` u8 **código de tamanho** (0=128, 1=256, 2=512, 3=1024 B).

**FM (densidade simples):** cada byte lógico é DUPLICADO no Raw Track Data (`0x55 0xAA` → `0x55 0x55
0xAA 0xAA`) — mesmíssimo tratamento do nosso `dmk.ts`.

**Algoritmo de leitura (C/L/setor → bytes):** `TrackIndex = Cyl*S + Side`; `FileOffset = 512 +
TrackIndex*6656`; ler header 256 B; `count=hdr[0]`; varrer entries de `0x08` passo 8, casar `entry[0x06]`;
`dataOff = u16LE(entry+0x02) & 0x3FFF`; `size = 128 << entry[0x07]`; ler em `FileOffset+dataOff`
(de-duplicar se FM). **Escrita:** ao alterar um setor, recalcular/regravar o Data Field Offset (LE) +
flags no Track Header. **SDF em branco:** header + C×S records; track headers zerados (0 setores);
Raw+Padding preenchidos com `0xE5`/`0xF6`.

**Status: IMPLEMENTADO ✅ (read-only)** em `src/main/converter/sdf.ts`: `isSdf` (magic `SDF1`+tamanho
exato) e `sdfToRaw` (decodifica cada Sector ID Table, de-duplica FM como o `dmk.ts`, coloca por
(cil,lado)+setor normalizando interleave, conta `protectedSectors`). Ligado no `normalizeDiskImage`
(`dmk.ts`) → todas as leituras que já faziam de-DMK fazem de-SDF de graça; `.sdf` adicionado aos filtros
de "Abrir imagem"/OS-9. **Validado** (`tools/sdfprobe.ts`) contra a amostra REAL FHL Color FLEX 5.0.4
(`amostras/sdf/fhl_flex_5_0_4.sdf`, 35cil/1lado, track0=10 setores FM 256B) com **cross-check vs o mesmo
disco em DMK = 630/630 setores idênticos (100%)**. ESCRITA SDF não feita (read-only, como o DMK; sem
necessidade nos fluxos atuais). Refs: CoCo SDC User Guide v4 (Atkinson/Lindner); dmk2sdf (ANSI C);
`n6il/cocosdc-commander`. Estudo arquivado: `amostras/…SDF no Ecossistema OS.docx`.

## O6 — validação da ESCRITA em emulador/hardware (status 2026-06-07)
- **XRoar disponível** localmente: `G:\Meu Drive\EmuCoco\ASM_PRG\xroar\xroar.exe` (há também a aba
  XRoar embarcada p/ teste manual). **Toolshed NÃO instalado** (sem `os9`/`decb` no PATH).
- **(b) boot/dir manual no XRoar — DESTRAVADO ✅** pela ponte OS-9 → XRoar (botão "Testar" da aba
  OS-9; ver Status acima). Já dá p/ montar um disco que escrevemos numa drive e bootar/dir no
  emulador embarcado.
- **Plano restante:** (a) harness de **round-trip de consistência** (insert/delete/mkdir via `os9.ts`
  → re-parse → conferir bitmap × segmentos, todos os arquivos legíveis, CRC de módulos inalterado) —
  candidato a `tools/os9rt.ts` no `tsconfig.tools.json`, ao lado do `os9probe.ts`; (c) opcional:
  instalar Toolshed p/ cross-check `os9 dir`.

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
