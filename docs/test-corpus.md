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
