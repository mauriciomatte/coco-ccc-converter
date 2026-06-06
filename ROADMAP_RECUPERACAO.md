# ROADMAP — Recuperação de Fitas Degradadas (CoCo K7)

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

## 4. Plano de implementação (fases)

- **R1 — Núcleo adaptativo** (maior ganho): limiar por histograma + rastreio de velocidade por
  segmento + cruzamento com histerese + sync difuso + re-sync + recuperação parcial. Já deve
  recuperar boa parte das 14 NO-SYNC. *(refatora `wav.ts: decodeStreamFromSamples`.)*
- **R2 — Botão "Recuperar" (varredura automática):** grade de parâmetros, escolhe o melhor por
  nº de blocos válidos; por segmento. Um clique na aba K7.
- **R3 — Diagnóstico:** histograma + mapa de blocos bom/ruim + re-decode de região. Mostra ao
  usuário ONDE falha.
- **R4 — Fusão de capturas ("RAID"):** abrir/gravar N capturas e fundir os blocos bons. Vale para
  `.wav` salvos e para passes do REC.
- **R5 — Pré-filtros:** DC, AGC, passa-faixa, azimute — limpeza opcional antes do decode.
- **R6 — Captura ao vivo (REC):** medidor de **qualidade de sinal / histograma em tempo real**
  durante a gravação (saber se o passe está bom antes de confiar nele) + fluxo de **multi-passe**
  (gravar a mesma fita várias vezes e fundir). Ajuda a achar o melhor **azimute** da cabeça.

## 5. Integração com o que já existe

Reaproveita: decodificação **gap-aware** (segmentação), controles **Limiar/Amplitude** (K8),
editor de **waveform** (seleção/edição), editor **hex** (patch), e o **REC** (line-in). A
recuperação é uma evolução do pipeline `decodeStreamFromSamples`, não um módulo isolado.

## 6. Ordem sugerida

R1 (núcleo) → R3 (ver onde falha) → R2 (1 clique) → R4 (RAID) → R5 (filtros) → R6 (REC ao vivo).
R1+R3 já entregam o essencial: recuperar mais fitas e enxergar o problema.
