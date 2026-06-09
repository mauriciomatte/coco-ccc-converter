# Aba GW — Greaseweazle (ler/gravar disquetes reais)

A aba **GW** é a ponte entre o app e a placa **Greaseweazle**: ela **lê disquetes físicos** para dentro do
app e **grava imagens em disquetes físicos**. É como você preserva discos reais de CoCo/Dragon e como leva
seus discos editados de volta para a mídia. Ao terminar este guia você saberá configurar a placa, escolher o
formato certo, ler/gravar com segurança e diagnosticar um drive problemático.

> **Pré-requisitos:** (1) a placa **Greaseweazle** conectada via USB; (2) as **host tools `gw`** instaladas
> (no PATH, ou informe o caminho no campo "Caminho do gw"); (3) um **drive de disquete** ligado ao cabo.

Cada campo tem um pequeno **"?"** que mostra a dica logo abaixo. O botão **Ajuda** (canto do título) abre
este manual.

---

## 1. Formato (CoCo / Dragon)

O **Formato** define a geometria que o `gw` vai usar (e o tamanho do mapa de trilhas). Escolha o que
corresponde ao disco físico:

| Formato | Geometria | Para que serve |
|---|---|---|
| **coco.decb** | 35 trilhas, 1 lado | Disco RS-DOS/Disk BASIC padrão do CoCo (160K) |
| **coco.decb.40t** | 40 trilhas, 1 lado | RS-DOS de 40 trilhas (180K) |
| **coco.os9.40ss / .40ds** | 40T, 1 ou 2 lados | OS-9/NitrOS-9 40 trilhas |
| **coco.os9.80ss / .80ds** | 80T, 1 ou 2 lados | OS-9 80 trilhas |
| **dragon.40ss / .40ds** | 40T, 1 ou 2 lados | Dragon DOS 40 trilhas |
| **dragon.80ss / .80ds** | 80T, 1 ou 2 lados | Dragon DOS 80 trilhas |

> Ao gravar a partir de um painel da DSK, o app **deduz e ajusta o formato** automaticamente pelo conteúdo
> do disco.

---

## 2. Configuração da placa

- **Dispositivo / Porta** — deixe vazio para **detecção automática**; informe (ex.: `COM3` no Windows,
  `/dev/ttyACM0` no Linux) só se houver mais de uma placa.
- **Drive** — qual drive no cabo da Greaseweazle: **Padrão (auto)**, ou **A/B** (ou **0/1**) quando há dois
  drives no mesmo cabo.
- **Caminho do gw** — deixe `gw` se já está no PATH; senão use **Procurar…** para apontar o executável
  (ex.: `C:\gw\gw.exe`). Este valor é **salvo**.
- **Argumentos extras** — opções avançadas separadas por espaço, ex.: `--no-verify` (pula a verificação),
  `--retries=3`, `--revs=2` (mais voltas na leitura). Na leitura, as opções que só valem para gravação são
  ignoradas automaticamente.
- **Comando direto (opcional)** — para usuários avançados: quando preenchido, o app **ignora** formato/
  dispositivo/drive/extras e usa **somente** esta linha como argumentos do `gw` (o caminho do arquivo
  temporário é acrescentado no fim). Não é salvo.

---

## 3. Use o Painel (A / B)

Define **em qual painel** (A/B da aba DSK) a imagem lida será carregada — e **de qual painel** a imagem será
gravada. Se o painel já tiver conteúdo, o app pede confirmação antes de sobrescrever.

---

## 4. As ações principais

- **Testar (gw info)** — executa `gw info`: confirma que a placa está conectada e respondendo. **Faça isto
  primeiro.** A saída aparece no console.
- **Ler → Painel A/B** — lê o disquete físico e carrega a imagem no painel escolhido. Se o painel tiver
  conteúdo, confirma antes. Ao terminar, o app **salta para a aba DSK** com a imagem carregada (marcada como
  não salva) — revise e salve.
- **Gravar Painel A/B → Disco** — grava o disco do painel no disquete físico (o formato é auto-ajustado ao
  conteúdo do painel).
- **Gravar .dsk… → disco** — escolhe um arquivo `.dsk` do PC e o grava direto no disquete (usa o formato
  selecionado no momento).

> Você também pode iniciar a gravação a partir da aba **DSK** (botão "Gravar GW"): o app aponta o painel
> ativo, vem para esta aba e grava.

---

## 5. Mapa de Trilhas + progresso

A segunda seção mostra uma **grade**: uma linha por **lado** (L0/L1) e uma coluna por **trilha**. Cada
quadradinho **acende em verde** conforme o `gw` lê/grava aquela trilha; ao lado há o contador
**concluídas/total (%)**. É o seu retorno visual em tempo real. Erros não aparecem como cor — vão para o
**console** no rodapé (que mostra toda a saída do `gw`).

---

## 6. Diagnóstico do drive

Quando a leitura/gravação falha (erros de seek, "Verify Failure"), use:
- **Testar seek** — `gw seek 0`: move/recalibra a cabeça contra a trilha 0.
- **Ver tempos** — `gw delays`: mostra os tempos atuais do drive.
- **Step (µs) + Aplicar step** — ajusta o atraso entre passos da cabeça (`gw delays --step`). Aumente (ex.:
  8000–12000) para **drives lentos**. O valor fica gravado na própria placa e é **salvo** no app.

---

## 7. Mídia DD × HD (importante)

O `coco.decb` grava bem em **disquetes HD 1.44** se o **furo do sensor de densidade for tapado** com fita —
aí a mídia se comporta como **720K DD**, que é o que o CoCo espera. Um **"Verify Failure Track 0.0"** quase
sempre indica um **disco fisicamente ruim**, e não incompatibilidade HD×DD. Para pular a verificação na
gravação, use `--no-verify` em "Argumentos extras".

---

## 8. Fluxos práticos

**Preservar um disquete real no PC:**
1. Conectar a placa → **Testar (gw info)**.
2. Escolher o **Formato** do disco (ex.: `coco.decb`) e o **Painel** alvo.
3. **Ler → Painel A** → acompanhar o mapa de trilhas → o app abre na aba DSK → **Salvar** como `.dsk`.

**Gravar uma imagem num disquete:**
- *Do painel:* **Use o Painel** → **Gravar Painel A → Disco** (formato auto).
- *De arquivo:* **Gravar .dsk… → disco** → escolher o `.dsk`.
- *Pela aba DSK:* botão **Gravar GW** no painel ativo → confirmar → grava aqui.

**Drive teimoso:** **Testar seek** → **Ver tempos** → aumentar **Step (µs)** → tentar de novo.
