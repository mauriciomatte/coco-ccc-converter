# Roadmap — MiniIDE / HDBDOS (região RS-DOS): edição, formatação e inserção

> Plano da parte de ESCRITA na região RS-DOS da MiniIDE (256 discos do SIDEKICK). A leitura já está
> sólida (ver "Concluído"). Tudo que ESCREVE no `.img` que vai para o cartão CF segue o protocolo de
> segurança: **sempre em CÓPIA + validação no hardware real** antes de confiar.

> ## ✅ STATUS ATUAL — 2026-06-11 (v1.0.64)
> **Leitura sólida + escrita RS-DOS implementadas:** navegar os 256 discos, inserir `.dsk` em slot vazio,
> editar e gravar de volta (write-back), nomear/renomear drive (catálogo SIDEKICK). Partições **OS-9** no
> container abrem e editam (com trava de área de sistema). Escrita **FAT** (CoCoSDC/RetroRewind) também
> entregue.
>
> **✅ GRAVAR a `.img` editada num cartão CF direto do app (reflash) — ENTREGUE E VALIDADO NO HARDWARE REAL
> (v1.0.62→v1.0.64):** botão Database (laranja) na toolbar DSK quando o painel ativo é um container com
> `container.filePath` → modal `cfModal`: lista **só** drives removíveis (`cf-list-removable`, exclui
> sistema/boot) e grava com barra de progresso real (`cf-flash`). A escrita usa `Clear-Disk` (remove o volume
> montado) + **.NET `FileStream` via PowerShell** (o `fs` do Node corrompe `\\.\PhysicalDriveN` → EIO; mídia
> removível **não** aceita `Set-Disk -IsOffline`). **VALIDADO num CF de verdade bootando a MiniIDE no hardware
> em DOIS modos (v1.0.64):** (a) app aberto como **Administrador**; (b) app aberto **normalmente** com
> **ELEVAÇÃO UAC SOB DEMANDA** — o UAC é pedido só na hora de gravar o cartão (único recurso que exige
> privilégio), com detecção de cancelamento e modal verde "Gravação concluída!" no fim.
>
> **✅ NOME DO DRIVE SIDEKICK NO PAINEL + APAGAR NOME (v1.0.64, validado no hw):** os contêineres MiniIDE
> exibem o NOME de cada disco (LSN 322) no rótulo "DISCO (nome)"; nomear/renomear e **APAGAR o nome** (zera o
> setor LSN 322 → volta ao estado "sem nome" autêntico) — todos validados no hardware real.
>
> **✅ LIMPAR INTERVALO de discos (v1.0.64, validado no hw):** substitui um INTERVALO (XX..YY) de discos por
> imagens RS-DOS VAZIAS formatadas, de uma só vez, com confirmação em duas etapas (irreversível). Discos
> limpos voltam a aparecer como RS-DOS USÁVEIS (não como "slot vazio").
>
> **✅ DRAG-AND-DROP `.dsk` do Explorer → slot MiniIDE (validado no hw, 2026-06-11)** e **✅ editar um BASIC de
> um slot MiniIDE com o editor da aba BAS e salvar de volta no slot (validado no hw, 2026-06-11).**
>
> **PENDENTE:** **FujiNet `.dsk` → injetar num contêiner (MiniIDE/CoCoSDC/DriveWire) → salvar → confirmar no
> hardware REAL** (engine pronto + round-trip em software OK; a cadeia completa ainda não foi exercida no hw);
> **Fase F — formatador de imagem MiniIDE do zero** (NÃO essencial: os cartões existentes já são lidos/editados
> e o "Limpar intervalo" já gera discos em branco válidos); **estudo profundo do catálogo** (setor 322: nome +
> cache de granules).

## ✅ Concluído (leitura)
- **Layout descoberto e documentado** (ver `miniide.txt`).
- **Navegação 000–255 completa** (Fase 1): uma entry por slot físico (ocupado / vazio / não-RS-DOS);
  numeração casa com o SIDEKICK/hardware; off-by-one corrigido (indexação por slot físico).
- **`parseDsk` lossless**: não descarta nem corrompe nomes semigráficos ("arte no DIR"); guarda
  `rawName`/`rawExt` (bytes exatos) → round-trip byte-a-byte.
- **Discos de arte** (ex.: 072 CHATWIG, 075 CITY BOMBER): listáveis e extraíveis, marcados
  **🎨 arte · 🔒 leitura**, com edição bloqueada (guard) para não embaralhar o desenho.
- **Nome de drive do SIDEKICK** lido (LSN 322) e exibido quando existe — **agora exibido no painel** (rótulo
  "DISCO (nome)") e com **nomear/renomear/apagar nome** (`writeSidekickName`) — v1.0.64, validado no hw.
- **`reDoubleDisk` / `image-write-slot`** (escrita de 1 slot in-place, preservando metades ímpares) já existem.

---

## Fase F — FORMATADOR de imagem (próximo a implementar)
**Gatilho/UI (definido com o usuário):** ao lado do "limpar painel" de **cada painel**, um **ícone**
com hint **"Formatar Imagem do Painel"** → abre **modal de confirmação** com **aviso de perda de dados**
e botões **Cancelar / Formatar**. Oferecer escolha **Rápida** × **Completa**.

**Comportamento:**
- **Rápida (só diretório + referências):** zera o diretório (trilha 17, setores 3–11 → `00`) e reseta
  a FAT (trilha 17, setor 2 → 68 granules = `FF` livres). Instantâneo; dados antigos permanecem nos
  granules (não-referenciados).
- **Completa (imagem toda):** gera um disco em branco (FAT `FF` + diretório vazio + dados `00`) e
  substitui tudo. Apaga de verdade (inclui a sobra OS-9 do slot 251).

**Contextos:**
- **Imagem isolada (painel não-contêiner):** formata o buffer do painel (gera blank / limpa FAT+dir).
- **Slot de contêiner (MiniIDE):** formata o disco, faz **sector-doubling** (→ 322.560 B) e grava só
  aquele slot em `âncora + slot×322560` (via `image-write-slot`).
  - **PRESERVAR o nome do drive do SIDEKICK** (LSN 322) se existir: ler o nome ANTES, formatar, e
    re-gravar o nome no setor 322 (ou preservar os bytes do campo). *Confirmar no estudo do catálogo (Fase B).*
- **Para 250–255** (slots degenerados: FAT `00` / lixo): formatar os transforma em **discos vazios
  válidos** (FAT `FF`) → prontos para uso.

**Travas de segurança:** só 35T (161.280) por slot; offset/âncora validados; escrever só o slot;
tamanho do `.img` inalterado; **cópia + teste no hardware**.

**Reuso:** `dskNewBlank` (blank RS-DOS) + `reDoubleDisk` + `image-write-slot` → pouco código novo.

---

## Fase B — Nomear/renomear drive do SIDEKICK (Opção A escolhida pelo usuário) — ✅ ENTREGUE (v1.0.64, validado no hw)
- **Local:** LSN 322 (offset `+164864` no slot doubled), 8 bytes, terminado em `NUL`. Validado em v3 e v4.
- **✅ ENTREGUE (v1.0.64):** exibição no painel, nomear/renomear e **apagar nome** (zera LSN 322) via
  `writeSidekickName` — validados no hardware real. (Opção B — replicar a estrutura completa do catálogo p/
  nomear drives sem nome com fidelidade total — permanece como estudo futuro, abaixo.)
- **Estudo profundo do catálogo (a fazer):** o setor 322 não é só o nome — tem `nome(8B) + NUL + cache
  de diretório` do SIDEKICK. Para nomear **drives sem nome** com fidelidade total (Opção B), entender e
  replicar essa estrutura. Para drives já nomeados, sobrescrever os 8 bytes do nome é seguro.
- **UI:** campo/botão "Renomear drive" no header do contêiner; grava os 8 bytes (+ estrutura, se preciso)
  nas duas metades do setor.
- **Travas:** cópia + validação no hardware (formato é específico do SIDEKICK).

---

## Fase I — Inserir imagem de disco em slot VAZIO — ✅ ENTREGUE (drag-and-drop validado no hw, 2026-06-11)
- Selecionar um slot vazio (000–255) → "Inserir imagem" → escolher um `.dsk` (35T RS-DOS).
- **✅ ENTREGUE:** inserir/injetar `.dsk` num slot (inclusive **arrastando do Explorer do Windows**, validado
  no hardware real em 2026-06-11). O "Limpar intervalo" (v1.0.64) também gera discos em branco válidos nos slots.
- **Sector-double** (→ 322.560 B) + gravar no slot (`image-write-slot`). Opcional: nomear via Fase B.
- **Travas:** só RS-DOS 35T (recusar 40T/dupla-face/OS-9 — não cabem no slot); offset correto; só o slot;
  cópia + hardware. Aproveita os ~19 slots vazios sem mexer em firmware (256 é teto rígido).

---

## Fase A — Montagem/gravação do `.img` para o CF — ✅ ENTREGUE E VALIDADA NO HARDWARE REAL (v1.0.62→v1.0.64)
- Sempre gerar/gravar numa **CÓPIA**; checagem de round-trip (ler de volta == esperado) antes de
  liberar para o cartão. Nunca gravar no original.
- **✅ ENTREGUE:** gravar a `.img` editada direto num cartão CF físico pelo app (`cf-flash`), com elevação UAC
  sob demanda — **validado num CF real bootando a MiniIDE** em modo Administrador E modo normal+UAC (v1.0.64).

---

## Riscos / invariantes (preservar verbatim)
- **256 é teto** do endereçamento HDBDOS — folga e espaço pós-255 não viram discos sem reflashar a ROM.
- **Sector-doubling** é só da região RS-DOS; a partição OS-9 (offset 0) é RAW — não confundir.
- A âncora (slot 0) é **detectada dinamicamente** (1ª sequência de 3 discos doubled) — não depende da ROM.
- Editar disco de **arte** reordena/embaralha o desenho do DIR → manter bloqueado.
- Toda escrita no `.img` → **cópia + validação no hardware real** (regra inegociável).
