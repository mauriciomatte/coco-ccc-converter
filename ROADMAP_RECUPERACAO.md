# ROADMAP — Recuperação de Fitas Degradadas (CoCo K7)

> ## ✅ STATUS ATUAL — 2026-06-11 (R1–R6 ENTREGUES, v1.0.63)
> **R1+R2** (já validados): botão **"Recuperar"** (Sparkles) → limiar adaptativo por segmento (**Otsu** +
> varredura). Corpus de 102 fitas: **51 → 94 decodificadas, 0 regressões**.
>
> **✅ DETECÇÃO UNIVERSAL DE LOADERS (v1.0.63):** além do SoftKristian (`scanSoftKristian`), o app reconhece o
> loader **PLAN-SOFT/GAMEPACK** multi-parte (`scanPlanSoft`) pelas assinaturas de motor/BLKIN/CLOADM; a aba K7
> informa a FAMÍLIA do loader e, para PLAN-SOFT (all-RAM), orienta a rodar o `.CAS` fiel no mini-XRoar.
> *(Mais softhouses além desses dois permanecem como trabalho futuro — ver "Pendente" no fim.)*
>
> **✅ R3–R6 ENTREGUES (v1.0.63), validados por `tools/recovertest.ts` (6/6):**
> - **R3 — Diagnóstico:** `tapeDiagnostics`/`decodeRegion` (wav.ts) + IPC `tape-diagnostics`/`tape-decode-region`.
>   Painel "Recuperação avançada" na K7: **histograma de períodos** (limiar Otsu em vermelho) + **mapa de
>   blocos bom/ruim por segmento** + **re-decodificar só a seleção** da waveform.
> - **R4 — Fusão de capturas ("RAID"):** `mergeCaptures` (captura com mais blocos válidos = base; substitui os
>   blocos ruins pelos bons de outra captura, por índice) + IPC `tape-merge-captures` + `pick-wav-files`
>   (multi-seleção). Botão "Fundir capturas…" (inclui a fita aberta). Validado: nunca perde blocos.
> - **R5 — Pré-filtros + estéreo:** `preprocessSamples` (DC, banda-limite ZC-safe HP+LP de 1 polo, AGC por
>   janela, realce de agudos) + seleção de **canal** via `DecodeOpts.{prefilter,channel}` (fluem por todo o
>   decode). Toggles + seletor de canal no painel. ZC-safe (um bandpass biquad agudo zerava o decode → trocado).
> - **R6 — REC multi-passe + qualidade:** grave a mesma fita N vezes e use "Fundir capturas" (R4) p/ juntar os
>   melhores blocos; "Diagnóstico" (R3) mostra a qualidade de cada passe. (Medidor em TEMPO REAL durante a
>   captura = refinamento menor pendente; o VU já existe.)

Objetivo: **salvar um pedaço da história** — recuperar programas de fitas de 40+ anos e de
capturas de áudio imperfeitas, que hoje falham (NO-SYNC) ou decodificam só em parte. Cobre os
dois cenários: (A) **arquivos `.wav` já salvos** que precisam de ajuste, e (B) **captura física
em tempo real** via REC (line-in do datacorder).

Base no acervo SoftKristian: das 41 fitas, **14 dão NO-SYNC** hoje — não é falha de loader, é
dano real de mídia/leitura. Este roadmap ataca isso.

---

## 1. Por que fitas/leituras antigas falham (estudo das causas)

A gravação CoCo é **FSK**: bit 0 = 1200 Hz (≈833 µs/ciclo), bit 1 = 2400 Hz (≈417 µs/ciclo),
LSB-first, leader `$55`, sync de bloco `$3C`. As falhas vêm de:

1. **Deriva de velocidade (wow & flutter):** datacorder velho / fita esticada → o período do bit
   varia ao longo da fita. Nosso limiar fixo (≈600 µs) assume período estável → bits errados.
2. **Queda de nível (dropout):** óxido solto / sinal fraco → trechos de baixa amplitude onde o
   cruzamento por zero some no ruído.
3. **Erro de azimute:** cabeça desalinhada → perda de agudos (o 2400 Hz cai mais que o 1200 Hz) →
   a distinção 1×0 borra.
4. **Offset DC / assimetria:** onda fora do centro → detecção de cruzamento enviesada.
5. **Ruído/hiss:** alta frequência → cruzamentos falsos.
6. **Polaridade invertida:** captura espelhada (já tratamos `inverted`).
7. **Leader/sync corrompido:** o começo da fita é o mais gasto → sem achar `$55`/`$3C` o decoder
   nem trava (NO-SYNC), **mesmo que os dados estejam bons**.
8. **Bloco com 1 byte ruim:** o checksum reprova um bloco inteiro de 255 bytes.

## 2. Limites do decodificador atual

- **Limiar único** (`midUs`) para a fita toda — não acompanha a deriva.
- **Amplitude fixa** — não trata dropout.
- **Exige sync limpo** — leader ruim → NO-SYNC total.
- **Sem rastreio de velocidade, AGC, filtro ou tolerância a erro de bloco.**
- Aborta em vez de **re-sincronizar** e recuperar o resto.

## 3. Caixa de ferramentas de recuperação (técnicas)

**Decodificação adaptativa (o coração):**
- **Limiar por HISTOGRAMA:** medir todos os períodos de cruzamento numa janela → histograma
  **bimodal** (picos em ~417 e ~833 µs). O **vale entre os picos** é o limiar — auto-calibra na
  velocidade REAL daquela fita. Robusto a deriva (o histograma desloca, o vale acompanha).
- **Rastreio de velocidade (PLL):** estimativa contínua do período do bit que segue o wow/flutter.
- **Por SEGMENTO:** a decodificação gap-aware já separa a fita; calibrar cada segmento isolado
  trata deriva entre trechos.
- **Cruzamento com histerese (Schmitt):** detecção que se adapta à amplitude local → trechos
  fracos ainda cruzam.

**Tolerância de estrutura:**
- **Sync difuso:** tolerar leader corrompido; achar o `$3C` com tolerância a erro de bit; tentar
  vários offsets de início.
- **Re-sync após erro:** bloco reprovou? não desiste — procura o próximo sync e recupera o resto.
- **Recuperação parcial:** entrega os blocos bons e **marca** os ruins (mapa de bytes
  recuperados/suspeitos) para o usuário corrigir ou aceitar carga parcial.

**Multi-passe / multi-parâmetro:**
- **Varredura automática:** testar uma grade de (limiar, amplitude, invertido, velocidade) e
  escolher a combinação que valida MAIS blocos (checksum). Botão "Recuperar" de 1 clique.
- **Parâmetros por segmento:** cada parte com seu melhor ajuste.

**Fusão de múltiplas capturas ("RAID de fita") — alto valor:**
- Carregar/gravar N capturas da MESMA fita (passes diferentes) e **fundir os blocos bons**: um
  bloco que falha na captura A pode passar na B. É o método mais eficaz para dano físico, pois
  capturas diferentes falham em pontos diferentes.

**Pré-processamento (limpeza opcional do áudio):**
- Remoção de **offset DC**, **AGC** por janela (dropout), **filtro passa-faixa** 1200–2400 Hz
  (hiss/rumble), realce de agudos (compensar azimute).

**Assistido (UI):**
- **Re-decodificar uma REGIÃO** selecionada com parâmetros próprios (já temos Limiar/Amplitude).
- **Diagnóstico visual:** histograma de períodos, marcas de sync, **mapa de blocos bom/ruim**
  (onde a fita falha), para o usuário focar o ajuste.
- **Patch de bytes:** decode quase completo → editar os poucos bytes ruins no hex e recalcular
  checksum.

## 4. Plano de implementação (fases) — ✅ R1–R6 ENTREGUES (R1+R2 antes; R3–R6 em v1.0.63)

- **✅ R1 — Núcleo adaptativo** (maior ganho): limiar por histograma + rastreio de velocidade por
  segmento + cruzamento com histerese + sync difuso + re-sync + recuperação parcial. Já deve
  recuperar boa parte das 14 NO-SYNC. *(refatora `wav.ts: decodeStreamFromSamples`.)*
- **✅ R2 — Botão "Recuperar" (varredura automática):** grade de parâmetros, escolhe o melhor por
  nº de blocos válidos; por segmento. Um clique na aba K7.
- **✅ R3 — Diagnóstico (v1.0.63):** histograma + mapa de blocos bom/ruim + re-decode de região. Mostra ao
  usuário ONDE falha.
- **✅ R4 — Fusão de capturas ("RAID") (v1.0.63):** abrir/gravar N capturas e fundir os blocos bons. Vale para
  `.wav` salvos e para passes do REC.
- **✅ R5 — Pré-filtros (v1.0.63):** DC, AGC, passa-faixa (Faixa), azimute (Agudos) + seleção de canal estéreo —
  limpeza opcional. **Os efeitos agora se aplicam à própria ONDA** (o PLAY e o mini-XRoar tocam o resultado).
- **✅ R6 — Captura ao vivo (REC) (v1.0.63):** fluxo de **multi-passe** (gravar a mesma fita várias vezes e
  fundir, via R4) + diagnóstico (R3) da qualidade de cada passe. Ajuda a achar o melhor **azimute** da cabeça.
  *(O medidor de **histograma em TEMPO REAL** durante a captura segue como refinamento menor PENDENTE — o VU
  já existe.)*

**Pendente (futuro):**
- **Medidor de qualidade em tempo real DURANTE o REC** (R6) — refinamento menor; hoje o VU já dá um indicativo.
- **Mais famílias de loader** além de SoftKristian e PLAN-SOFT/GAMEPACK (detecção universal multi-softhouse).

## 5. Integração com o que já existe

Reaproveita: decodificação **gap-aware** (segmentação), controles **Limiar/Amplitude** (K8),
editor de **waveform** (seleção/edição), editor **hex** (patch), e o **REC** (line-in). A
recuperação é uma evolução do pipeline `decodeStreamFromSamples`, não um módulo isolado.

## 6. Ordem sugerida

R1 (núcleo) → R3 (ver onde falha) → R2 (1 clique) → R4 (RAID) → R5 (filtros) → R6 (REC ao vivo).
R1+R3 já entregam o essencial: recuperar mais fitas e enxergar o problema.
