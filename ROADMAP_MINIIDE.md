# Roadmap — MiniIDE / HDBDOS (região RS-DOS): edição, formatação e inserção

> Plano da parte de ESCRITA na região RS-DOS da MiniIDE (256 discos do SIDEKICK). A leitura já está
> sólida (ver "Concluído"). Tudo que ESCREVE no `.img` que vai para o cartão CF segue o protocolo de
> segurança: **sempre em CÓPIA + validação no hardware real** antes de confiar.

> ## ✅ STATUS ATUAL — 2026-06-09 (v1.0.46)
> **Leitura sólida + escrita RS-DOS implementadas:** navegar os 256 discos, inserir `.dsk` em slot vazio,
> editar e gravar de volta (write-back), nomear/renomear drive (catálogo SIDEKICK). Partições **OS-9** no
> container abrem e editam (com trava de área de sistema). Escrita **FAT** (CoCoSDC/RetroRewind) também
> entregue.
>
> **PENDENTE:** **Fase F — formatador de imagem MiniIDE do zero** (marcado como NÃO essencial: os cartões
> existentes já são lidos/editados); **estudo profundo do catálogo** (setor 322: nome + cache de granules).

## ✅ Concluído (leitura)
- **Layout descoberto e documentado** (ver `miniide.txt`).
- **Navegação 000–255 completa** (Fase 1): uma entry por slot físico (ocupado / vazio / não-RS-DOS);
  numeração casa com o SIDEKICK/hardware; off-by-one corrigido (indexação por slot físico).
- **`parseDsk` lossless**: não descarta nem corrompe nomes semigráficos ("arte no DIR"); guarda
  `rawName`/`rawExt` (bytes exatos) → round-trip byte-a-byte.
- **Discos de arte** (ex.: 072 CHATWIG, 075 CITY BOMBER): listáveis e extraíveis, marcados
  **🎨 arte · 🔒 leitura**, com edição bloqueada (guard) para não embaralhar o desenho.
- **Nome de drive do SIDEKICK** lido (LSN 322) e exibido quando existe.
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

## Fase B — Nomear/renomear drive do SIDEKICK (Opção A escolhida pelo usuário)
- **Local:** LSN 322 (offset `+164864` no slot doubled), 8 bytes, terminado em `NUL`. Validado em v3 e v4.
- **Estudo profundo do catálogo (a fazer):** o setor 322 não é só o nome — tem `nome(8B) + NUL + cache
  de diretório` do SIDEKICK. Para nomear **drives sem nome** com fidelidade total (Opção B), entender e
  replicar essa estrutura. Para drives já nomeados, sobrescrever os 8 bytes do nome é seguro.
- **UI:** campo/botão "Renomear drive" no header do contêiner; grava os 8 bytes (+ estrutura, se preciso)
  nas duas metades do setor.
- **Travas:** cópia + validação no hardware (formato é específico do SIDEKICK).

---

## Fase I — Inserir imagem de disco em slot VAZIO
- Selecionar um slot vazio (000–255) → "Inserir imagem" → escolher um `.dsk` (35T RS-DOS).
- **Sector-double** (→ 322.560 B) + gravar no slot (`image-write-slot`). Opcional: nomear via Fase B.
- **Travas:** só RS-DOS 35T (recusar 40T/dupla-face/OS-9 — não cabem no slot); offset correto; só o slot;
  cópia + hardware. Aproveita os ~19 slots vazios sem mexer em firmware (256 é teto rígido).

---

## Fase A — Montagem/gravação do `.img` para o CF
- Sempre gerar/gravar numa **CÓPIA**; checagem de round-trip (ler de volta == esperado) antes de
  liberar para o cartão. Nunca gravar no original.

---

## Riscos / invariantes (preservar verbatim)
- **256 é teto** do endereçamento HDBDOS — folga e espaço pós-255 não viram discos sem reflashar a ROM.
- **Sector-doubling** é só da região RS-DOS; a partição OS-9 (offset 0) é RAW — não confundir.
- A âncora (slot 0) é **detectada dinamicamente** (1ª sequência de 3 discos doubled) — não depende da ROM.
- Editar disco de **arte** reordena/embaralha o desenho do DIR → manter bloqueado.
- Toda escrita no `.img` → **cópia + validação no hardware real** (regra inegociável).
