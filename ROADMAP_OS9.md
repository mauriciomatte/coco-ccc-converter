# Roadmap 1 — Suporte a OS-9 / NitrOS-9 (sistema de arquivos RBF)

> Objetivo: ler (e depois editar) discos **OS-9/NitrOS-9** no CoCoDCU. Hoje só
> identificamos a presença de OS-9 (string "NitrOS-9/6809 Level…", `DD.TOT` no LSN0);
> não lemos o conteúdo. As imagens **MiniIDE** e **CoCoSDC RetroRewind** têm partições
> OS-9 inteiras inacessíveis.
>
> Premissa do usuário: **depois de entender bem o RBF, REANALISAR a MiniIDE** — é
> provável que a leitura OS-9 revele dados hoje vistos como "lixo"/opacos.

---

## Fase 0 — Estudo a fundo da arquitetura OS-9 (nível engenharia)

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

**Entregável da Fase 0:** documento interno `docs/os9-rbf.md` com a estrutura do RBF.

---

## Fase 1 — Reanálise das imagens MiniIDE / RetroRewind com a lente OS-9

- Localizar a partição OS-9 (já sabemos: a MiniIDE começa com OS-9 ~90 MB; `DD.TOT`).
- Parsear `LSN0` → geometria; ler o **diretório-raiz** (`DD.DIR`) → listar CMDS/SYS/DEFS/
  NITROS9/EXTRAS/APPS/GAMES/MUSIC… (que hoje aparecem como "lixo").
- **Expectativa (hipótese do usuário): NOVIDADES** — identificar o que realmente há na
  região OS-9, e talvez reinterpretar slots/dados antes vistos como ilegíveis.
- Validar contra a estrutura conhecida do NitrOS-9 e contra o Toolshed (`os9 dir`).

**Entregável:** relatório da reanálise + corpus de teste OS-9 confirmado.

---

## Fase 2 — Implementar LEITURA OS-9 no app

- Módulo `src/main/converter/os9.ts`:
  - `isOs9Disk(raw)` (valida LSN0: DD.* coerentes), `parseOs9(raw)` (geometria + raiz),
    `listOs9Dir(raw, lsn)` (recursivo, hierárquico), `extractOs9File(raw, fd)` (segue `FD.SEG`).
  - Mapear para a forma de diretório que a UI já consome (nome, tamanho, tipo).
- Detecção: somar OS-9 ao discriminador de `read-dsk-directory` (RS-DOS / Dragon / **OS-9** / desconhecido).
- UI:
  - Selo "LIDA: **OS-9 / RBF**" (cor própria); discos OS-9 **somente-leitura** primeiro.
  - **Navegação hierárquica** (OS-9 tem SUBDIRETÓRIOS; nossa lista é PLANA hoje) — precisa
    de árvore ou navegação por caminho (breadcrumb).
  - Extrair arquivo OS-9 → pasta do PC (reusa o extrator).
- As partições OS-9 da MiniIDE/CoCoSDC viram **navegáveis e extraíveis**.

---

## Fase 3 (depois) — ESCRITA OS-9 (adicionar/excluir/formatar) — AVANÇADO

- Gerenciar o **mapa de alocação**, criar **FD**, alocar **segmentos**, atualizar diretório,
  ajustar contagem de links. Risco alto → **adiar** até a leitura estar sólida e validada.

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
