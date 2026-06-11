# ROADMAP — Aba CAS/WAV/VOC (preservação de fita) + suíte de áudio CoCo/Dragon

> ## ✅ STATUS ATUAL — 2026-06-09 (v1.0.46)
> **Implementado na aba K7:** decode FSK, **→CAS (limpo)**, **→WAV (limpo)**, **→Fita completa** (áudio
> original inteiro), leitura de **VOC**, **REC** line-in, preview de tamanhos. O núcleo deste roadmap foi
> entregue.
>
> **ATUALIZAÇÃO 2026-06-10 — suíte WAV/CAS concluída (W1–W5):** os checkboxes A1–A4 abaixo estavam
> defasados — A1 (WAV→CAS), A2 (CAS→WAV) e A3 (VOC) já estavam prontos na aba K7. Nesta rodada foram
> entregues os dois gaps reais: **W3 — disco → fita** (botão **"Do disco"** na K7: empacota o arquivo
> selecionado num painel A/B em `.CAS` via `dsk-file-to-cas` e carrega no deck) e **W5 — FIXCAS** (botão
> **"FIXCAS"**: `fixCas` em `cas.ts` — varredura tolerante, recalcula checksums, refaz leader/sync, garante
> EOF; IPC `cas-fix`). Validado por `tools/casfixtest.ts` (24/24: íntegro, checksum corrompido, EOF ausente,
> lixo/falso-sync, multi-arquivo, e disco→cas com load/exec do LOADM).
>
> **PENDENTE:** **D11 — sabor Dragon** (auto-switch da máquina XRoar p/ Dragon ao testar); famílias de
> loader além de SoftKristian.

Recurso **futuro**. Origem: análise do material de preservação do worldofdragon.org, PyDragon32/PyDC,
cas2bas e tlindner (2026-06-03). Estende e absorve o `ROADMAP_WAV.md` (que cobria só `encodeWav`).

> ⚠️ **Licença:** PyDC e cas2bas são **GPL**. Aproveitar SÓ os fatos de formato (frequências FSK,
> layout de blocos do CAS, taxas de amostragem) e reimplementar limpo em TS. NÃO importar código GPL
> (o app é MIT). Estudar como referência, reescrever do zero.

## Decisão de arquitetura: ABA dedicada (hub-and-spoke, como a GW)

Criar uma **aba CAS/WAV** (entre EPROM e XRoar, p.ex.) que funciona como "conector" da mídia FITA,
trocando arquivos/discos com os painéis DSK — o MESMO padrão da aba Greaseweazle (lê → joga no
painel; pega do painel → grava). Mais organizado que espalhar os conceitos de áudio na toolbar DSK.

Fluxos:
- **Importar**: abrir `.WAV`/`.VOC`/`.CAS` → decodificar FSK → listar arquivos do CAS → extrair →
  **"Enviar para Painel A/B"** (vira disco RS-DOS/Dragon) ou extrair p/ o PC.
- **Exportar**: **"Carregar do Painel A/B"** (pega um arquivo do disco) → empacotar `.CAS` →
  gerar `.WAV`/`.VOC` (fita p/ gravador real, FujiNet, XRoar).
- Extras na própria aba: preview de forma de onda, detokenizar BASIC do CAS (reusa o tokenizer),
  validar/reparar CAS ("FIXCAS").

Nota: CoCo e Dragon usam o MESMO FSK de fita (~1200 baud, 6809) → um único pipeline serve aos dois.
Já temos `decodeWav` (FSK→bytes) e o `basicDetokenize.ts`/editor BASIC.

## Funcionalidades (relação priorizada)

### A. Áudio de fita ↔ CAS (maior valor — fecha o ROADMAP_WAV; CoCo + Dragon)
- [x] **A1 (W1). WAV → CAS — FEITO.** `buildCleanCas`/`buildFaithfulCas` em `wav.ts`; "→ CAS (limpo)" + Extrair `.cas`.
- [x] **A2 (W2). CAS → WAV — FEITO.** `encodeCasToWav`/`buildCleanWav` em `wav.ts`; "→ WAV (limpo)" 44/22/11/8 kHz.
      (Onda quadrada; opção senoide e leader truncável ficam como refinamento futuro opcional.)
- [x] **A3 (W4). Importar `.VOC` — FEITO.** Decoder VOC em `K7Tab.tsx` (blocos 1/2/3/8/9) → PCM → mesmo FSK.
- [x] **A4 (W5). "FIXCAS" — FEITO (2026-06-10).** `fixCas` em `cas.ts` (varredura tolerante, recalcula
      checksums, refaz leader/sync, garante EOF) + IPC `cas-fix` + botão **FIXCAS** na K7. Teste `casfixtest.ts`.
- [x] **W3. Disco → fita — FEITO (2026-06-10).** Botão **"Do disco"** na K7: o arquivo selecionado num painel
      A/B vira `.CAS` (`dsk-file-to-cas`: ML via `parseBin`→load/exec+imagem; BASIC/dados crus) e carrega no deck.
- [ ] **A5. CAS RAW vs padrão** + metadados de frequência/silêncio (jogos/proteção) — avançado.

### B. CAS ↔ BASIC (reusa nosso tokenizer — vantagem sobre PyDC, que só faz ASCII)
- [ ] **B6. Abrir `.CAS`, listar e detokenizar BASIC → texto**; e tokenizar (texto → `.CAS`/`.bas`).
- [ ] **B7. Ligar ao editor BASIC**: "Abrir do CAS" / "Salvar como CAS (fita)".

### C. Formatos de imagem — ampliar compatibilidade (tlindner)
- [ ] **C8. JVC/`.dsk` com header** (CoCo): header 1–5 bytes (setores/trilha, lados, tamanho de
      setor, 1º ID). Hoje: VDK (Dragon) + DSK cru; JVC cobre a maioria dos `.dsk` CoCo com header.
- [ ] **C9. DMK** (track-level WD279x): discos com proteção/setores não-padrão. Complexo.
- [ ] **C10. Novo disco Dragon em mais geometrias** (40DS/80SS/80DS) — engine já faz DS; só expor.

### D. OS-9 para Dragon (CoCoSDC ALPHA)
- [ ] **D11. Sabor Dragon do OS-9**: o parser RBF é agnóstico → discos OS-9 Dragon já abrem; falta
      detectar e auto-trocar o XRoar p/ máquina Dragon ao testar OS-9 Dragon.
- [x] **D12. Escrever imagens CoCoSDC SD (FAT) — FEITO (v1.0.30, 2026-06-07).** `fat.ts` ganhou motor
      de escrita clean-room (`fatAddFile`/`fatReplaceFile`/`fatDeleteFile` + `Writer` de acesso
      aleatório; atualiza as 2 cópias da FAT, LFN, cresce o diretório; nunca carrega a imagem inteira).
      Write-back de `.dsk` editado + inserir novo `.dsk/.os9` no cartão, com confirmação e verificação
      pós-gravação. Validado em FAT12+FAT32 (`tools/fatrt.ts`, 28/28). Discos OS-9 dentro do FAT agora
      abrem na aba OS-9. (Gerar um cartão FAT do zero / formatar continua não feito — não é necessário:
      o usuário edita cartões existentes.)

### E. Conversão CoCo↔Dragon (já temos `cocoToDragonBin`)
- [ ] **E13. Patcher assistido de ML** (já em roadmap; ver dragon-vdk-support).

## Prioridade sugerida
A1+A2 (par WAV↔CAS, fecha o ROADMAP_WAV, beneficia CoCo+Dragon) → B6/B7 (CAS↔BASIC, reusa tokenizer)
→ C8 (JVC, compatibilidade barata). A ABA CAS/WAV é o "casco" que recebe A/B.

## Fontes (referência de FORMATO, não de código)
- worldofdragon.org — Tape/Disk Preservation (DC/DCWIN, FIXCAS, formatos CAS/JVC/VDK/DMK).
- PyDragon32/PyDC (GPL) — CAS/WAV/BAS, zero-crossing, 1100/2100 Hz detecção.
- cas2bas (GPL) — CAS → texto BASIC.
- tlindner.macmess.org — variantes de header de imagem (JVC 0–255 bytes).
- archive.worldofdragon.org — CoCoSDC SDCARD/DRAGON32/OS9/ALPHA (OS-9 para Dragon).
