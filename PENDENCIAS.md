# Pendências — backlog ativo

> Backlog de trabalho do CoCo DSK & CCC Utility. Itens marcados aqui são os **focos atuais**.
> Roadmaps maiores (não neste recorte) vivem em `ROADMAP_OS9.md`, `ROADMAP_MINIIDE.md`,
> `ROADMAP_FUJINET.md`, `ROADMAP_WAV.md`. Diferidos por ora: exportação **.WAV**, **FujiNet/TNFS**,
> limites **EPROM >16K / 32K / 64K**, **live-debug 6809**, e higiene de **CI (Node 20 nas Actions)**.

Última atualização: 2026-06-03 (a partir da v1.0.21).

---

## OS-9 / NitrOS-9 (RBF) — leitura ✅, escrita O1–O4 ✅

- [x] **O5 — escrever na partição OS-9 de containers** ✅ v1.0.23 — botão "Habilitar edição" (grava
      direto no arquivo, só os setores alterados), **guarda de sistema** (`os9SystemArea`: OS9Boot/SYS/
      CMDS/DEFS protegidos — só pastas de usuário), valida antes de gravar. Validado por container sintético.
- [ ] **O6 — validação em Toolshed / emulador REAL**: testar O4/O5 num MiniIDE/CoCoSDC real + emulador
      antes de confiar 100% (nível de bytes já validado; falta hardware/emulador).
- [x] **Defrag / defrag de arquivo OS-9** ✅ v1.0.22.
- [x] **Copiar PASTAS (recursivo)** entre os dois explorers ✅ v1.0.23 (drag de pasta = cópia recursiva).
- [x] **Arrastar arquivo OS-9 para fora → Windows Explorer** ✅ v1.0.23 (alça ⠿ + `startDrag`).
- [x] **`.os9` aberto pela detecção fica editável** ✅ v1.0.23 — standalone abre editável em memória;
      partição de container abre leitura + "Habilitar edição" (O5).

## Dragon (.vdk) — leitura ✅

- [x] **Edição completa** ✅ — JÁ implementada e ligada (add/excluir/ordenar/defrag, SS e DS),
      validada por round-trip 2026-06-03. NÃO era só leitura (a memória estava desatualizada).
      Único gap de edição é **rename** por arquivo — que o RS-DOS também não tem (item geral abaixo).
- [x] **Auto-trocar a máquina Dragon no XRoar** ao abrir ✅ — `loadPaneFromBuffer` agora ajusta a
      plataforma (→ máquina do XRoar) ao formato do disco aberto (Dragon↔CoCo).

## Geral (todos os formatos)

- [x] **Renomear arquivo** (RS-DOS + Dragon) ✅ — engine (`renameDskFile`/`renameDragonFile`) +
      IPC + botão ✏️ na toolbar DSK + modal; validado por round-trip. (OS-9 já tinha.)

## MiniIDE / HDBDOS (Fases A/B/F/I ✅)

- [ ] **Estudo profundo do catálogo do setor 322** (nome 8B + cache) — marcado "a fazer".

## Preservação de fita — ABA CAS/WAV/VOC (ROADMAP_CASWAV.md)

Decisão: criar uma **aba dedicada CAS/WAV** (hub-and-spoke como a GW — lê/joga no painel DSK e vice-versa).
Itens detalhados em `ROADMAP_CASWAV.md`. Prioridade: **WAV↔CAS** (A1/A2, fecha o ROADMAP_WAV, serve
CoCo+Dragon) → **CAS↔BASIC** (B6/B7, reusa tokenizer) → **JVC `.dsk`** (C8).
