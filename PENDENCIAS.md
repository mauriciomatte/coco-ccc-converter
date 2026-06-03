# Pendências — backlog ativo

> Backlog de trabalho do CoCo DSK & CCC Utility. Itens marcados aqui são os **focos atuais**.
> Roadmaps maiores (não neste recorte) vivem em `ROADMAP_OS9.md`, `ROADMAP_MINIIDE.md`,
> `ROADMAP_FUJINET.md`, `ROADMAP_WAV.md`. Diferidos por ora: exportação **.WAV**, **FujiNet/TNFS**,
> limites **EPROM >16K / 32K / 64K**, **live-debug 6809**, e higiene de **CI (Node 20 nas Actions)**.

Última atualização: 2026-06-03 (a partir da v1.0.21).

---

## OS-9 / NitrOS-9 (RBF) — leitura ✅, escrita O1–O4 ✅

- [ ] **O5 — escrever na partição OS-9 de containers** (MiniIDE `.img` / CoCoSDC `.VHD`):
      inserir/editar **só em pastas de usuário**, jamais tocar a partição de sistema
      (OS9Boot/SYS/CMDS).
- [ ] **O6 — validação em Toolshed / emulador**: round-trip das escritas em hardware/emulador real
      antes de confiar.
- [ ] **Defrag / defrag de arquivo OS-9**: compactar segmentos fragmentados (reusa o motor O4) —
      espaço já reservado abaixo do platter.
- [ ] **Copiar PASTAS (recursivo)** entre os dois explorers (hoje só arquivos são arrastáveis).
- [ ] **Arrastar arquivo OS-9 para fora → Windows Explorer** (via `startDrag`; a aba DSK já tem,
      a OS-9 não).
- [ ] **Confirmar** se `.os9` aberto pela detecção/aba DSK fica editável (e não só pelo "Abrir" da
      aba OS-9).

## Dragon (.vdk) — leitura ✅

- [ ] **Edição completa** (hoje só leitura).
- [ ] **Auto-trocar a máquina Dragon no XRoar** ao abrir um `.vdk`.

## MiniIDE / HDBDOS (Fases A/B/F/I ✅)

- [ ] **Estudo profundo do catálogo do setor 322** (nome 8B + cache) — marcado "a fazer".
