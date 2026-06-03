# Corpus de testes & validação — CoCo CCC Converter

Catálogo das amostras reais usadas para validar o conversor e dos limites descobertos.
Serve de base para a expansão futura (suporte a 32K/64K, multi-banco, loaders customizados).

Harness de validação: `tools/inspect.ts` → `npx tsc -p tsconfig.tools.json && node out-tools/tools/inspect.js`.

## Legenda
- **load/exec**: endereços do programa na RAM. `exec` deve cair dentro de `[load, load+tamanho]`.
- **Cartucho?**: cabe em 1 banco de 16K ($C000–$FEFF, 16.128 B úteis incl. loader)?

## 1. Programas único-banco (≤16K) — CARTUCHO FUNCIONA ✅ (validados no XRoar)
| Jogo | Origem | load → exec | payload | EPROM | Status |
|---|---|---|---|---|---|
| Bustout | .cas (=.dsk) | $3F48 → $3F48 | 4.282 B | 8K (2764) | ✅ rodou no XRoar |
| Canyon Climber | .dsk (=.cas) | $1000 → $1000 | 8.288 B | 16K (27128) | ✅ rodou no XRoar |
| Qiks | .cas | $4B8F → $5302 | 9.330 B | 16K | ✅ rodou (load≠exec) |
| Star Blazer | .dsk | $3FC0 → $3FC0 | 8.552 B | 16K | ✅ rodou |
| Demolition Derby | .cas (=.dsk) | $3F00 → $3F00 | 8.448 B | 16K | parse ✓ |
| Quasar Commander | .cas (=.dsk) | $3F48 → $3F48 | 4.282 B | 8K | parse ✓ |

## 2. Programas únicos > 16K — CARTUCHO IMPOSSÍVEL ❌ / emulador ✅
Contíguos, carga < $8000, mas grandes demais para a janela de 16K (não há ROM de cartucho
suficiente nem para armazenar o programa a copiar). Só rodam via export emulador (.cas/.dsk).
| Jogo | load → exec | tamanho | obs |
|---|---|---|---|
| Sea Dragon | $2380 → $2380 | 19.584 B | |
| Sea Search | $0E00 → $1C00 | 28.527 B | load≠exec |
| Shock Trooper | $1C00 → $1F01 | 25.344 B | load≠exec |
| Speed Racer | $0E0F → $3C20 | 26.403 B | load≠exec |
| Syzygy v3.0 | $0E00 → $14EE | 28.929 B | load≠exec |
| Tut's Tomb (no loader) | $1E00 → $1F40 | 24.817 B | load≠exec |

## 3. Multi-parte / 64K (overlays, bank-switching próprio) — emulador ✅
Tape com vários arquivos; o jogo gerencia a própria carga. Cartucho não reproduz isso.
| Jogo | arquivos | obs |
|---|---|---|
| Sailor Man (Color selection) | 4 (SAILOR BASIC + SMPART1/2/3 ~16K) | overlays em ~$4000 |
| Sailor Man | 3 (SAILOR + SAILOR1 23K + SAILOR2 15K) | |

## 4. Loader proprietário / turbo — NÃO parseável ⚠️
| Jogo | sintoma |
|---|---|
| Tut's Tomb (with loader) | stub em $009F + dados em formato custom; parser gera ~104 "arquivos" lixo |

→ Comparar com a versão "(no loader)" (item 2), que é o dump em formato padrão.

## Bugs encontrados e corrigidos via este corpus
1. Autostart: cartuchos reais entram em **$C000 sem assinatura 'DK'** (7/7 dumps). Modelo DK→$C002 estava errado.
2. Loader 6809: opcodes **LDX/LDY trocados por LDU/LDS** (`8E`↔`CE`) — copiava com ponteiros não inicializados.
3. `cas.ts`: **load e exec invertidos** no namefile (exec=11-12, load=13-14). Invisível enquanto load==exec.
4. `parseCas`: parava no 1º EOF — agora lê **múltiplos arquivos** da fita.

## Roadmap de expansão (quando chegarem fontes 32K/64K)
- **>16K em cartucho** exige **bank-switching por software**, que o CoCoEPROMpak NÃO tem (bancos por jumper manual).
  Suportar isso depende de outro hardware de cartucho com registrador de seleção de banco, OU aceitar que >16K é só emulador.
- **Loader all-RAM (dois estágios, $FFDE/$FFDF)** ainda **não foi testado em emulador** — falta uma amostra que carregue ≥$8000 e caiba em 16K.
- **Robustez pendente**: guarda anti-lixo no parser (detectar loader proprietário) + passthrough do .cas original no export emulador.
- **Investigar**: caso `polaris` (BIN do .dsk extrai $1FFA/4103B vs .cas $4000/4113B).
- **Arkanoid**: 2 partes de ~16K — caso multi-banco.

## Achados de arquitetura (das fontes em `G:\...\DOCS\Fontes`)
Extraídos via `pdftotext` (docs com texto) e `pdftoppm`→PNG (escaneados). Poppler em `C:\Users\Matte\poppler`.

**All-RAM (valida o loader de dois estágios):**
- CoCo 2 = 64K RAM + 32K ROM; os 32K superiores ($8000–$FFFF) são RAM **ou** ROM conforme o bit **TY** do SAM, acessado em **$FFDE/$FFDF**. (Lomont; ColorComputer123HardwareProgramming)
- **$FFDE**: qualquer escrita → modo ROM (ROMs do sistema no mapa). **$FFDF**: qualquer escrita → modo all-RAM. Isso confirma o nosso loader toggle ($FFDE p/ ler a ROM do cartucho, $FFDF p/ escrever na RAM alta).

**Caminho para >16K em cartucho (a expansão futura):**
- CoCo 1/2 **não têm** bank-switching por software de RAM/cartucho — só o bit all-RAM do SAM. Logo, na CoCoEPROMpak (bancos por jumper manual) **não dá** para um programa >16K trocar bancos sozinho.
- **CoCo 3 / GIME**: MMU por software em **$FFA0–$FFA7 (task 0)** e **$FFA8–$FFAF (task 1)**, páginas de **8K**, mapeando até 512K. Este é o mecanismo de banco por software. → Suportar programas >16K como cartucho exige **alvo CoCo 3 + MMU GIME**, ou um cartucho com registrador de seleção de banco próprio (≠ CoCoEPROMpak).

**Para leitura futura (escaneados, sob demanda):** Tandy Technical Reference Manual e Disk System Programming Manual (sem camada de texto → render via pdftoppm). Esquemático do CoCo2 e pinouts (MC6821/MC6847 .png) para confirmar fiação CART/SCS/CTS do cartucho.

## CocoFLASH (alvo de expansão — doc oficial lida)
Fonte: go4retro/CocoFLASH `doc/Coco Flash Guide.pdf`. 8MB flash, ROMs de 2K a 256K, até 2048 bancos de 4K.
- **Imagem para o flasher**: `.bin` LOADM que **carrega em $4000** (lido por `PRGFLASH.BAS`). Bancos 0 e 1 reservados ao menu (BASIC). 16K = 4 bancos.
- **Menu `MENU.BAS`** entry: `"NOME",banco,type`. **type 2** = jogo autostart por IRQ (= nosso cartucho $C000, SEM DK). **type 0** = DOS com 'DK' nos 2 primeiros bytes. **type 34** = cartucho dividido em vários 16K (banked, RoboCop/Predator) — o caminho >16K.
- **$FF40–$FF5F** = registrador de OFFSET de 16K (habilitado por bit 5 de `$FF64`). Config em `$FF64–$FF67` (BANK_LO/HI = registrador de banco de 11 bits). Mapa: `FLASH = (addr CoCo − $8000) + banco*4096 + página*16384`.
- **Implementado:** export "CocoFLASH (.BIN)" empacota o cartucho compilado como `.bin @ $4000` (type 2), com orientação na UI. Cobre ≤16K.
- **Próximo (não feito):** loader **banked type-34** para >16K — copiar páginas de 16K via $FF40 para a RAM (rotina relocada p/ RAM baixa) e saltar. Precisa de validação (MAME/hardware) antes de confiar — NÃO repetir o erro do DK.

## Corpus OS-9 / NitrOS-9 (RBF) — leitura

Fixtures em `amostras/os9/` (gitignored — locais, não vão para o repo). Usadas para validar o
parser `src/main/converter/os9.ts` via `tools/os9probe.ts`:
`npx tsc -p tsconfig.tools.json && node out-tools/tools/os9probe.js [arquivo]`.

Material de referência de formato na mesma pasta (não embarcado — só estudo):
`dosdir-os9/dosdir.asm` (listador de diretório, Todd Wallace, licença permissiva),
`dosdir-os9/OS9Defs` (tabela de símbolos OS-9 L1), `HRDOS/hrsdos.c` + `SPECS.BAS` (ponte
RS-DOS↔OS-9 num HD RGBDOS, Robert Gault — confirma o modelo "partição OS-9 + RS-DOS por offset").

19/20 imagens são RBF válidas (todas `DD.TOT*256 == tamanho`, parseadas 100%):

| Imagem | Trilhas | Volume | Conteúdo |
|---|---|---|---|
| DISKFIX.DSK | 40T DS80 | OS-9 CAD DISKFIX | rootDir@LSN18 (não-2) |
| DISTDRVR.DSK | 35T | DISTO SC-II DRIVERS | 14 arq, 5 dirs (LEVEL2/CMDS/PATCHES) |
| EZGEN110.DSK | 35T | XT-ROM V3.0 (Burke & Burke) | 16 arq, 2 dirs |
| FILRECVR.DSK | 35T | File Recovery System 1.0 | datas corrompidas (teste de robustez) |
| FILTERS1/2.DSK | 35T | FILTER KIT No.1 / No.2 | filtros em CMDS/ |
| FSREPK.DSK | 35T | File System Repack (B&B) | |
| GSHELLPAT.DSK | 80T | (GShell patch) | nome de volume curto |
| J&M-OS9.DSK | 35T | SDISK3 | |
| OS-9 Disk Fix & Utils.dsk | 35T | COMPUTERWARE | |
| OS9-L1V201B/M.DSK | 35T | OS-9 Level One Modules/System | sistema "limpo" p/ teste |
| OS9L1V2B/M.DSK | 35T | COLOR COMPUTER Boot/Master | OS9Boot, startup, CMDS/SYS/DEFS |
| OS9SDC.OS9 | 80T 2-lados | OS9 CoCo SDC Utilities | **CoCoSDC 360K**, validado |
| kermit.dsk | 40T | OS-9 Kermit | |
| pcxfer.dsk | 35T | PC TRANSFER UTILITIES | |
| vmicons.dsk | 35T | Multi-Vue icons | diretório longo (teste de listagem) |

**Outlier:** `OS9L1V1B.DSK` — LSN0 não conforme (DD.TKS/SPT inválidos), provável boot antigo
com track 0 especial. `isOs9Disk()` o **rejeita corretamente** (não trava o parser).

**Validações cobertas:** geometria 35T/40T-DS80/80T e 1/2 lados; `DD.DIR` ≠ 2 (DISKFIX);
recursão hierárquica (dirs aninhados); `FD.SIZ`/datas/atributos; espaço livre via bitmap (LSN1);
datas corrompidas não quebram o parser; slots obsoletos (`LSN 0xFFFFFF`) ignorados.
**Falta:** integração na UI (árvore/breadcrumb) e aplicar com `base`=offset na partição OS-9 da MiniIDE.

### Jogos OS-9 (mesma estrutura RBF — particularidades só de CONTEÚDO)

| Jogo | Volume | Estrutura | Particularidade |
|---|---|---|---|
| `nfl.dsk` | (em branco) | 3 arq, 0 dirs, **não-bootável** | **Basic09**: `nfl.b09` (I-code) + precisa de `runb`. `DD.FMT=0x00` (flag densidade simples). Disco de dados. |
| `DUTCHMAN.dsk` | MARC | 38 arq, CMDS+SYS, **bootável** (OS9Boot) | Aventura em **Basic09** (`runb`+`hires`); módulos am1/bm1/cm1/m2-m4; alguns arquivos com **data não-setada** (byte ano=0 → vazio, tratado). |
| `CAVEWALK.dsk` | M | 19 arq, CMDS, **bootável** (OS9Boot) | Jogo em **assembly 6809 nativo** (cave/cavemain/*sub, sem `runb`); `titlscrn`/`cavedata` = telas/dados; `l2initsub` sugere caminho Level-2. |

**Conclusão:** nenhuma novidade de FORMATO — os três são RBF 35T SS padrão e o parser lê 100%.
As diferenças são de conteúdo (Basic09 × asm nativo; bootável × dados; `DD.FMT=0x00`; nomes de
volume curtos/vazios; datas não-setadas), e todas serviram para **exercitar casos-limite do parser**, que passou.

### Reanálise dos CONTAINERS com a lente OS-9 (originais intactos, só leitura)

| Container | Achado | vs 1ª interpretação |
|---|---|---|
| **MiniIDE** `_v3.img` (507 MB) | `[0–128MB]` **NitrOS-9 6309 L2** (1662 arq) RAW · `[128–165,7MB]` 0xFF apagado · `[165,7MB–fim]` RS-DOS doubled | ✅ doubling é só do RS-DOS; OS-9 é raw @0 |
| **CoCoSDC.VHD** (135 MB) | `[0–90MB]` **NitrOS-9/6809 L2** (2859 arq, dir de 399) RAW · `[90–135MB]` 0xFF | ❌ NÃO é "MiniIDE doubled" — é partição OS-9 raw |
| **DriveWire** `Games DW.dsk` (11,45 MB) | 71×161.280 todos RS-DOS, 0 OS-9 | ✅ |
| **RetroRewind** (15,85 GB) | MBR + **FAT32** (`MSDOS5.0`) de arquivos `.dsk` | ✅ (OS-9 só nos `.dsk` avulsos) |

**Prova de correção da extração:** **1576 módulos** OS-9 extraídos das 2 partições validam o **CRC de
módulo = `0x800FE3`** (constante do `OS9Defs`); header-parity 1673/1673; **20 fragmentados (multi-segmento)
também passam** → seguir `FD.SEG` é byte-perfeito. Tipos: Program/DevDesc/Driver/FileMgr/System/Subr/Data.

### ⚠️ Regra de detecção (descoberta com os discos em branco)

Um disco **OS-9 também passa em `isRsDosDisk`** (`isOs9=true E isRsDos=true`); um RS-DOS nunca passa no
OS-9. Logo o discriminador **DEVE testar OS-9(estrito) ANTES de RS-DOS**:
`OS-9 → Dragon → RS-DOS → desconhecido`. `isOs9Strict` = base + `cluster`=potência-de-2 + raiz `.`/`..`
apontando p/ o próprio FD (funciona até em disco **vazio**); confiável **no offset 0**.

### Discos em branco canônicos — `amostras/blank-disks` (Color Computer Archive, gitignored)

OS-9 cru (`*-OS9 (1).DSK` / `*.OS9`) e RS-DOS cru (`*-RS (1).DSK`), mais variantes **DMK** (`*.DSK`
grandes = header 16 B + trilhas de 6400 B; byte1=cilindros, byte4 bit `0x10`=face única).

| Geometria | DD.TOT | DD.MAP | DD.FMT | DD.DIR |
|---|---|---|---|---|
| 158K 35T SS | 630 | 79 | 0x0 | LSN 2 |
| 180K 40T SS | 720 | 90 | 0x0 | LSN 2 |
| 360K DS | 1440 | 180 | 0x1 | LSN 2 |
| 720K DS | 2880 | 360 | 0x3 | **LSN 3** |

`DD.FMT`/`DD.DIR` variam por geometria (raiz nem sempre no LSN2) → ler dinâmico. Servem de **template**
para um futuro "criar disco OS-9 em branco".
