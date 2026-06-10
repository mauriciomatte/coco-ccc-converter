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

**Como o formato é auto-deduzido (na gravação a partir de um painel):**

| Conteúdo do painel | Formato GW escolhido |
|---|---|
| Disco **Dragon**, 40T, 1 lado | `dragon.40ss` |
| Disco **Dragon**, 40T, 2 lados | `dragon.40ds` |
| Disco **Dragon**, 80T, 1/2 lados | `dragon.80ss` / `dragon.80ds` |
| RS-DOS de **184320 bytes** (40 trilhas) | `coco.decb.40t` |
| Qualquer outro RS-DOS | `coco.decb` |

Quando o auto-ajuste troca o formato selecionado, o app registra no console: *"Perfil GW ajustado para o disco: … (auto)."*

> **Plataforma (CoCo/Dragon):** ao alternar a plataforma-alvo do app, o **formato GW padrão** muda junto —
> `coco.decb` para CoCo, `dragon.40ss` para Dragon. É só um padrão; você pode trocar manualmente a qualquer
> momento no dropdown.

---

## 2. Configuração da placa

- **Dispositivo / Porta** — campo de texto livre. Deixe **vazio** para **detecção automática**; informe
  (ex.: `COM3` no Windows, `/dev/ttyACM0` no Linux) só se houver mais de uma placa. O botão **Testar
  (gw info)** ao lado usa esta porta. Quando preenchido, é passado como `--device <valor>` em todas as
  operações.
- **Drive** — dropdown com opções fixas: **Padrão (auto)** (vazio — deixa o `gw` decidir), **A**, **B**, **0**
  e **1**. Use A/B (ou 0/1) quando há dois drives no mesmo cabo. Quando preenchido, vira `--drive <valor>`.
- **Caminho do gw** — caminho do executável `gw`. Deixe `gw` se já está no PATH; senão use **Procurar…**
  (abre um diálogo de arquivo) para apontar o executável (ex.: `C:\gw\gw.exe`). Este valor é **salvo**.
- **Argumentos extras** — opções avançadas separadas por espaço, ex.: `--no-verify` (pula a verificação),
  `--retries=3`, `--revs=2` (mais voltas na leitura). Este campo é **compartilhado** entre leitura e gravação;
  por isso, na **leitura** o app **remove automaticamente** as flags que só valem para gravação
  (`--no-verify`, `--erase-empty`, `--precomp…`, `--fake…`) — senão o `gw read` falharia (código 1).
- **Comando direto (opcional)** — para usuários avançados. Quando preenchido, o campo **ganha uma borda
  destacada (brilho)** e o app passa a **ignorar completamente** formato/dispositivo/drive/argumentos
  extras, usando **somente** esta linha como argumentos do `gw`. O caminho do arquivo temporário (.dsk) é
  acrescentado **no fim** automaticamente, tanto na leitura quanto na gravação. **Não é salvo** nas
  configurações (volta vazio ao reabrir o app). Ex.: `read --format coco.decb --device COM7 --drive 0 --revs 3`.

> **O que fica salvo:** Formato, Dispositivo, Drive, Caminho do gw, Argumentos extras, painel-alvo (A/B) e o
> valor do Step são persistidos entre sessões. **O Comando direto NÃO é salvo.**

---

## 3. Use o Painel (A / B)

Dropdown inline (**Painel A** / **Painel B**) ao lado das ações. Define **em qual painel** (A/B da aba DSK)
a imagem lida será carregada — e **de qual painel** a imagem será gravada. Os rótulos dos botões **Ler** e
**Gravar Painel** mudam dinamicamente para mostrar o painel escolhido (ex.: *"Ler → Painel B"*). Se o painel
já tiver conteúdo, o app pede confirmação antes de sobrescrever (ver §4.1). Esta escolha é **salva**.

---

## 4. As ações principais

- **Testar (gw info)** — executa `gw info`: confirma que a placa está conectada e respondendo. **Faça isto
  primeiro.** A saída aparece no console. O ícone gira enquanto roda; se falhar, o app avisa que talvez a
  placa não esteja conectada ou o `gw` não esteja instalado/no PATH.
- **Ler → Painel A/B** — lê o disquete físico e carrega a imagem no painel escolhido. Se o painel já tiver
  conteúdo, abre o modal de confirmação primeiro. Ao terminar com sucesso, a imagem entra no painel com um
  nome gerado (`GW_READ_<formato>.dsk`), é marcada como **não salva** (suja), e o app **salta automaticamente
  para a aba DSK** com esse painel ativo — revise e **Salve** lá. O tamanho lido (em bytes) é logado.
- **Gravar Painel A/B → Disco** — grava o disco do painel no disquete físico. **Desabilitado** se o painel
  escolhido estiver vazio. O **formato é auto-ajustado** ao conteúdo do painel (ver tabela da §1).
- **Gravar .dsk… → disco** — abre um diálogo, você escolhe um arquivo `.dsk` do PC e ele é gravado direto no
  disquete usando o **formato selecionado no momento** no dropdown (sem auto-dedução).

Enquanto qualquer operação roda, **todos os botões ficam desabilitados** (estado "ocupado") para evitar
comandos concorrentes na placa.

> Você também pode iniciar a gravação a partir da aba **DSK** (botão "Gravar GW", ícone de HD na barra de
> ferramentas do painel): o app aponta o painel ativo, **vem para esta aba** e grava, respeitando as
> configurações atuais do GW.

### 4.1. Modais de confirmação

- **"Sobrescrever Painel A/B?"** — aparece ao **Ler** se o painel-alvo já tem imagem. Avisa que a leitura vai
  **substituir todo o conteúdo** e que alterações não salvas serão perdidas. Botões: **Cancelar** (para salvar
  antes) ou **Ler e sobrescrever**.
- **"Gravar no Greaseweazle?"** — aparece quando você dispara a gravação pelo botão **Gravar GW** da aba DSK.
  Lembra que o disco será gravado **conforme as configurações atuais do GW**. Botões: **Cancelar** ou
  **Prosseguir**.

---

## 5. Mapa de Trilhas + progresso

A segunda seção mostra uma **grade**: uma linha por **lado** (rotulada **L0**/**L1**) e uma coluna por
**trilha**. O número de linhas/colunas vem da **geometria do formato selecionado** (ex.: `coco.decb` = 1
linha × 35 colunas; `dragon.80ds` = 2 linhas × 80 colunas). Cada quadradinho **acende em verde** conforme o
`gw` reporta aquela trilha; passe o mouse para ver *"Trilha N · Lado N"*. Ao lado do título há o contador
**concluídas/total (%)** e, durante a operação, um indicativo *"· lendo"* ou *"· gravando"*.

> **Como o mapa enxerga o progresso:** o app **lê a saída de texto do `gw`** e acende a trilha quando casa um
> padrão como `T<trilha>.<lado>` ou `Cyl=<n> Head=<n>`. O contador é reiniciado no começo de cada leitura/
> gravação. **Erros não mudam a cor** dos quadradinhos — eles vão para o **console** no rodapé do app, que
> espelha **toda** a saída do `gw` (linhas com "erro/error/fail" aparecem destacadas em vermelho no log).

---

## 6. Diagnóstico do drive

Linha separada (abaixo das ações principais), rotulada **"Diagnóstico do drive"**. A saída de todos estes
comandos cai no **console** do rodapé. Quando a leitura/gravação falha (erros de seek, "Verify Failure"), use:
- **Testar seek** — `gw seek 0`: move/recalibra a cabeça contra a trilha 0. Usa o **Drive** selecionado; se
  estiver em "Padrão (auto)", assume o drive **0**. O dispositivo (`--device`) é incluído se preenchido.
- **Ver tempos** — `gw delays`: mostra os tempos atuais do drive (e suas unidades) no console.
- **Step (µs)** — campo numérico (só aceita dígitos). É o atraso entre passos da cabeça.
- **Aplicar step** — roda `gw delays --step <valor>`. Aumente (ex.: 8000–12000) para **drives lentos**.
  Recusa valores inválidos/≤ 0. O valor fica gravado **na própria placa** e o campo é **salvo** no app.

---

## 7. Mídia DD × HD (importante)

O `coco.decb` grava bem em **disquetes HD 1.44** se o **furo do sensor de densidade for tapado** com fita —
aí a mídia se comporta como **720K DD**, que é o que o CoCo espera. Um **"Verify Failure Track 0.0"** quase
sempre indica um **disco fisicamente ruim**, e não incompatibilidade HD×DD. Para pular a verificação na
gravação, use `--no-verify` em "Argumentos extras".

---

## 8. O console (log) no rodapé

Toda a saída do `gw` — comandos enviados (`$ gw …`), progresso, tempos, e mensagens de erro — é espelhada no
**console/log** comum do app, no rodapé da janela (o mesmo log usado pelas outras abas). É lá que você lê o
detalhe quando uma operação falha. Cada linha é carimbada com a hora; linhas de erro aparecem em vermelho.

---

## 9. Fluxos práticos

**Preservar um disquete real no PC:**
1. Conectar a placa → **Testar (gw info)**.
2. Escolher o **Formato** do disco (ex.: `coco.decb`) e o **Painel** alvo.
3. **Ler → Painel A** → acompanhar o mapa de trilhas → o app abre na aba DSK → **Salvar** como `.dsk`.

**Gravar uma imagem num disquete:**
- *Do painel:* **Use o Painel** → **Gravar Painel A → Disco** (formato auto).
- *De arquivo:* **Gravar .dsk… → disco** → escolher o `.dsk`.
- *Pela aba DSK:* botão **Gravar GW** no painel ativo → confirmar → grava aqui.

**Drive teimoso:** **Testar seek** → **Ver tempos** → aumentar **Step (µs)** → tentar de novo.
