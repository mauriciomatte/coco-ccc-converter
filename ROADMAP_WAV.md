# ROADMAP — Exportação de áudio .WAV (fita de cassete)

> ## ✅ STATUS ATUAL — 2026-06-11 (v1.0.64): CONCLUÍDO
> A exportação de `.WAV` foi entregue na aba **K7**: **→ WAV (limpo)** (FSK numa taxa escolhida 8/11/22/44 kHz,
> `buildCleanWav`/`encodeCasToWav` em `wav.ts`) e **→ Fita completa** (áudio original inteiro: header + tela +
> loader + jogo turbo). Também há **→ CAS**. Este roadmap está **realizado**; mantido como referência de design.
>
> **AMPLIADO desde então:** exportador `.WAV` no **PADRÃO DA ÉPOCA** (`buildEraTapeWav` em `wav.ts`, **v1.0.61**)
> — mono **8-bit 9600 Hz**, FSK 1200/2400 exata, silêncio inicial + leader/namefile + **silêncio após o
> cabeçalho** + dados contínuos + tom de fechamento (corrige o EOF colado no silêncio que dava I/O ERROR).
> Carrega em **tempo real** no XRoar (CLOAD/CLOADM:EXEC pelo tipo) e grava numa fita K7 REAL para um CoCo
> físico, sem erros. Disponível também por um botão na aba BASIC (ícone de ondas). Onda quadrada padrão;
> opção senoide/leader truncável continua como refinamento opcional futuro.

Recurso **futuro**: gerar um arquivo `.WAV` (áudio FSK de fita) a partir de programas do CoCo,
para tocar num gravador real ou no FujiNet/emulador como se fosse uma fita.

## Viabilidade

**Totalmente viável.** O app já tem o lado do *decode* (`src/main/converter/wav.ts → decodeWav`),
que converte o áudio FSK de volta em bytes. O *encode* é exatamente o **espelho** dele — toda a
especificação de tempo já está validada no decoder.

### Padrão FSK do CoCo (do decoder, confirmado)
- **Bit 1** = 1 ciclo completo de **2400 Hz** (~416,7 µs)
- **Bit 0** = 1 ciclo completo de **1200 Hz** (~833,3 µs)
- Bits **LSB-first**; bytes precedidos de **leader** de `$55` e marcador de **sync** `$3C`
- Suporta também a forma invertida (leader `$AA`, sync `$C3`)

### Encoder (a implementar) — `encodeWav(bytes, opts)`
1. Para cada byte, emitir 8 bits (LSB-first); cada bit = 1 ciclo senoidal/quadrado na frequência certa.
2. Gerar PCM (ex.: 44100 Hz, 8/16-bit mono) e envolver num cabeçalho **RIFF/WAVE**.
3. Parâmetros: sampleRate, leader length, ganho/amplitude, onda senoidal vs. quadrada.

## Caminhos de conversão

- **`.CAS → .WAV`** — DIRETO. O `.CAS` já é o fluxo de bytes da fita (leader/sync/blocos). Basta
  passar esses bytes pelo `encodeWav`. (O app já cria `.CAS` via `export.ts → encodeCas`.)
- **`.DSK → .WAV`** — INDIRETO. Uma imagem de disco não é formato de fita; só faz sentido para
  **arquivos** que cabem em fita (BASIC tokenizado, binários ML). Fluxo: extrair o arquivo do `.DSK`
  → montar um `.CAS` (encodeCas) → `encodeWav`. O sistema de arquivos do disco em si não vira áudio.

## Onde encaixa na UI (sugestão)
- Botão "Exportar .WAV" na aba DSK (para um arquivo selecionado) e na aba/fluxo de fita (`.CAS`).
- Reusa `encodeCas` (já existe) + novo `encodeWav` em `wav.ts`.

## Esforço
Baixo/médio: ~1 função de encode + cabeçalho RIFF + diálogo de save. Sem dependências externas
(geração de PCM é trivial em TS). Validação: `encodeWav` → `decodeWav` round-trip deve devolver os
bytes originais.
