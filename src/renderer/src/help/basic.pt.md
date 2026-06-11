# Aba BASIC — Editor de programas BASIC

A aba **BASIC** é um editor de texto pensado para programas **BASIC do Color Computer** (e clones como o
CP-400) e do **Dragon**. Ela **detokeniza** programas (transforma os bytes do disco/fita em texto legível),
deixa você **editar** com cara de tela do CoCo, e então **roda no XRoar**, **grava num disco** ou **salva**
como `.bas`/`.cas`. Ao terminar este guia você saberá trazer um programa de qualquer origem, editá-lo e
devolvê-lo rodando.

> **Cobertura de tokens (detokenização):** todas as palavras do **Color BASIC**, **Extended Color BASIC**,
> **Disk BASIC** e do **Super Extended Color BASIC (CoCo 3)** — incluindo comandos como `HSCREEN`, `PALETTE`,
> `HCOLOR`, `HDRAW`, `HPRINT`, `WIDTH`, `LOCATE` e funções como `LPEEK`, `BUTTON`, `HPOINT` — além do dialeto
> **Dragon**. Texto dentro de aspas, `REM`/`'` e `DATA` é mostrado **literalmente** (não vira comando), como no
> `LIST` real. Tabelas conferidas byte-a-byte com os disassemblies *Unravelled*. Um token desconhecido aparece
> como `[?XX]` (em vez de corromper a linha) — se você vir isso, reporte o código que a tabela é ajustada.

A tela tem três faixas fixas: a **toolbar** (em cima), a **área de edição** (no meio, que cresce) e o
**rodapé** de opções (embaixo). Quando você abre **Procurar/Substituir**, uma **barra** extra aparece entre a
toolbar e a área de edição. O botão **?** (na toolbar) reabre esta ajuda.

> **Abas de editor (até 6):** acima da toolbar há uma **barra de sub-abas** — cada aba é um editor BASIC
> independente. **+** abre uma nova aba; **×** fecha (pede confirmação se a aba tiver conteúdo). O rótulo é
> **`NOME.BAS`**; **dê duplo-clique no nome para renomear** (8 letras, A-Z/0-9 — formato CoCo). Cada aba nasce
> com um nome **único** (`SEMNOME1`…`SEMNOME6`), porque o **"Novo DSK + Salvar"** grava usando o nome da aba
> **ativa** — então não pode haver dois iguais. Os **botões de cima e o salvar/rodar** agem sempre na **aba
> ativa**; já os **ajustes do rodapé** (Maiúsculas, Tela VDG, Cores, Negrito, NEW/RUN/ENTER, 32 colunas,
> velocidade) são **globais** (valem para todas). O **cursor** volta para onde você o deixou em cada aba.
> Ao **exportar** um programa para o editor (do disco, da fita K7, etc.), a aba **adota o nome do arquivo**, o
> texto entra com uma **nova linha ao final** e o cursor fica nela; ele cai numa **aba vazia** ou **nova aba**,
> e se as 6 estiverem ocupadas, um aviso deixa você **escolher** em qual colocar (substituindo) ou **cancelar**.
> As abas abertas são **lembradas** ao reabrir o app.

---

## 1. Como um programa chega aqui

- **Abrir arquivo .BAS (texto)** (ícone de pasta na toolbar) — abre um `.bas/.txt` em **ASCII** do seu PC.
- **Da aba K7** — botão **"Abrir no BASIC"**: manda o BASIC lido da fita (já detokenizado).
- **Da aba DSK** — botão **"Editar .BAS"**: manda um `.BAS` do disco (precisa estar em **ASCII**; veja a
  seção 7).

Se já houver um programa no editor, o app pergunta antes de substituir. Ao abrir de um disco, aparece o selo
**"Editando"** (com o nome do arquivo na dica) e um botão **Salvar** que regrava **no próprio disco de
origem** (seção 6).

> Se o editor estiver **vazio**, todos os botões que precisam de conteúdo (Salvar, .CAS, Rodar, Novo DSK +
> Salvar, Salvar in-place) ficam **desabilitados** (esmaecidos).

---

## 2. A toolbar — botão por botão

A toolbar (da esquerda para a direita) reúne os comandos de arquivo, edição e execução. Passe o mouse sobre
qualquer ícone para ver a dica.

| Botão | Ícone | O que faz |
|-------|-------|-----------|
| **Abrir arquivo .BAS** | pasta | Abre um `.bas/.txt` (ASCII) do PC para o editor. |
| **Salvar como .BAS (texto)** | disquete | Grava o programa em **ASCII** num `.bas`/`.txt` do PC. |
| **Salvar como fita .CAS** | texto **.CAS** | Embrulha o programa num `.CAS` carregável por **CLOAD** (cassete de emulador). |
| **Salvar como áudio .WAV** | ondas de áudio | Gera o **áudio FSK** da fita no **padrão da época** (mono 8-bit 9600 Hz, com silêncio inicial, gap após o cabeçalho e final): carrega no **XRoar em tempo normal** (CLOAD) e grava numa **fita K7 real** p/ um CoCo físico, sem erros. |
| **Recortar** | tesoura | Recorta a seleção (área de transferência do sistema). |
| **Copiar** | duas folhas | Copia a seleção. |
| **Colar** | prancheta | Cola na posição do cursor (maiusculizado se "Maiúsculas auto" ligada). |
| **Procurar** | lupa | Abre a barra de busca. |
| **Procurar e substituir** | setas | Abre a barra já em modo substituir. |
| **Inserir ↑** | seta-pra-cima | Insere `^` (exponenciação) no cursor. Atalho: **Alt+↑**. |
| **Rodar no XRoar** | play | Digita `NEW` + programa no emulador (no prompt `OK`). |
| **Rodar com reset** | seta circular | Reinicia o emulador (boot limpo) e digita o programa. |
| **?** | interrogação | Abre esta ajuda. |

Ainda na toolbar, **à direita**, ficam os controles de gravação em disco:

- **Selo "Editando"** (só quando o programa veio de um disco) — lembra a origem.
- **Salvar** (só quando há origem) — regrava **in-place** no disco de origem (seção 6).
- **Painel** (A/B) — escolhe o disco de destino do "Novo DSK + Salvar".
- **Campo de nome** (`PRG-NOME`) — nome do arquivo `.BAS`. Aceita **só A-Z e 0-9**, é **maiusculizado** e
  **cortado em 8 caracteres** enquanto você digita (espaços/símbolos são descartados). Vazio vira `PRGNOME`.
- **Novo DSK + Salvar → A/B** — cria/usa o disco do painel e grava o programa como `.BAS` ASCII.

---

## 3. A área de edição e as três "telas"

Você edita texto livre (sem numeração automática nem realce de sintaxe). Quando vazia, a área mostra um
**exemplo-fantasma** (`10 CLS` / `20 PRINT "HELLO WORLD"` / `30 GOTO 20`) só como placeholder. O seletor
**Tela** (rodapé) muda só a **aparência**, para você ver como ficará no CoCo:

- **Normal** — texto monoespaçado comum; o seletor **Cores** escolhe o esquema (verde/preto, laranja/preto,
  preto/verde, preto/laranja, azul-marinho/branco, preto/branco).
- **VDG** — imita a tela do CoCo com a fonte do sistema: maiúsculas em **preto sobre verde**; **minúsculas em
  vídeo inverso** (verde-claro sobre verde-escuro — o VDG não tem letras minúsculas de verdade).
- **VDG 6847 (autêntica)** — desenha os **glifos pixelados reais** do chip MC6847 num canvas, com as opções
  **Escala** (Pequena/Média/Grande) e **32 colunas**.

**Os três modos são totalmente EDITÁVEIS** — o cursor, a seleção e a rolagem funcionam igual em todos.

> **32 colunas** (só nos modos VDG): em vez de não-quebrar com rolagem horizontal, a tela quebra na largura
> real do CoCo (32 colunas) e vira um **quadro 32×16 centralizado** num "bezel" escuro, parecendo um monitor.
> Desligado, a linha não quebra e rola na horizontal.

A opção **Maiúsculas auto** (ligada por padrão) força MAIÚSCULAS enquanto você digita (Color BASIC clássico),
maiusculizando **só o trecho recém-digitado/colado** e preservando o que já existia; desligue para permitir
minúsculas (CoCo 3 / Disk BASIC aceitam). **Negrito** engrossa a fonte — **exceto na tela VDG 6847**, que é
bitmap fixo do MC6847 e por isso desabilita o Negrito.

> **Seta-pra-cima ↑ (= `^`, exponenciação):** clique no botão **↑** da toolbar ou tecle **Alt+↑** para
> inserir (a tecla ↑ sozinha serve para navegar). Nas telas VDG o `^` aparece como ↑, como no CoCo real.

---

## 4. Editar texto: recortar/copiar/colar e procurar

- **Recortar / Copiar / Colar** na toolbar (texto colado também é maiusculizado se "Maiúsculas auto" estiver
  ligada). A inserção respeita a **posição do cursor** e a recoloca corretamente depois.
- **Procurar** e **Procurar e substituir** abrem uma **barra** sob a toolbar:
  - **Campo "Procurar…"** — digite o termo (a busca é **insensível à caixa**; tudo é tratado em maiúsculas).
  - **Próximo** — seleciona a próxima ocorrência a partir do cursor, **voltando ao início** ao chegar no fim.
  - **Substituir…** (quando só procurando) — expande a barra para o modo substituir.
  - **Campo "Substituir por…"**, **Substituir** (troca a ocorrência atual e pula para a próxima) e **Todos**
    (substitui tudo de uma vez).
  - **X** (fechar) — esconde a barra.

| Atalho | Onde | Ação |
|--------|------|------|
| **Alt+↑** | área de edição | Insere `^` (seta-pra-cima/exponenciação). |
| **Enter** | campo Procurar | Vai para a próxima ocorrência. |
| **Enter** | campo Substituir | Substitui a ocorrência atual e procura a próxima. |
| **Esc** | campos de busca | Fecha a barra de Procurar/Substituir. |

> **Sem regex.** "Substituir/Todos" trabalham em **maiúsculas** e devolvem o resultado todo maiusculizado.

---

## 5. Rodar no XRoar

- **Rodar no XRoar** — digita `NEW` + o seu programa no emulador (você precisa estar no prompt `OK`).
- **Rodar com reset** — reinicia o emulador (boot limpo, **sem `NEW`** — o reset já limpa a RAM) e então
  digita o programa.

As opções de rodapé controlam o que é injetado:

- **NEW antes de injetar** — limpa a memória antes do programa. **Só vale no "Rodar no XRoar"**; em "Rodar com
  reset" o hard-reset já limpa a RAM e o `NEW` é ignorado.
- **RUN ao final** — acrescenta `RUN` no fim, fazendo o programa rodar sozinho.
- **ENTER ao final** — dá um ENTER no fim quando a última linha é código sem quebra final, garantindo que ela
  seja inserida no emulador. Dispensável se "RUN ao final" estiver ligado (o RUN já gera o ENTER).
- **Vel.Export.Código** — rapidez com que as teclas são digitadas no XRoar: **Rápido (12 ms/tecla)** ou
  **Padrão (25 ms/tecla)**, mais seguro. Em máquinas lentas, "Rápido" pode perder algum caractere.

> O XRoar converte `\n` em `\r` (o ENTER do CoCo) automaticamente. Em máquinas **Dragon**, o app ainda manda
> um espaço inicial para dispensar o prompt "pressione uma tecla" do boot.

---

## 6. Salvar e exportar

- **Salvar como arquivo .BAS (texto)** — grava o programa em **ASCII** (como `SAVE"…",A` no CoCo), em `.bas`
  ou `.txt`.
- **Salvar como fita .CAS** — embrulha o programa num `.CAS` carregável por **CLOAD** no XRoar/MAME (e
  reimportável na aba K7).
- **Salvar como áudio .WAV** — o próprio **áudio FSK** da fita, reconstruído no **padrão da época** (mono
  8-bit, 9600 Hz, FSK 1200/2400 Hz exata) com a mesma **estrutura das fitas originais**: silêncio inicial,
  *leader* + cabeçalho (namefile), **silêncio após o cabeçalho** (o CoCo desliga o motor e o processa),
  *leader* + dados contínuos + EOF e silêncio final. Carrega no **XRoar em tempo normal** (`CLOAD`) e grava
  numa **fita K7 real** para um CoCo físico, sem erro de sincronismo. O programa é **tokenizado** (como o
  `CSAVE`); se a sintaxe for incomum e o tokenizador não bater, cai automaticamente para ASCII (o CoCo
  tokeniza ao carregar).
- **Novo DSK + Salvar → A/B** — cria/usa o disco do painel escolhido e grava o programa como **.BAS ASCII**
  (o CoCo carrega com `LOAD"NOME"`). Defina o **Painel** (A/B) e o **nome** (até 8 caracteres A-Z/0-9).
- **Salvar (in-place no DSK)** — aparece quando o programa veio de um disco (selo "Editando"): **atualiza o
  arquivo dentro daquele disco**. Se o disco/painel mudou desde a abertura, o app avisa e oferece salvar como
  arquivo novo.

> O editor salva sempre em **ASCII** — o CoCo/Dragon re-tokeniza na carga. Não há gravação em formato
> tokenizado.

---

## 7. Sobre detokenizar (e o limite ASCII)

O app entende o **BASIC tokenizado** (a imagem de memória que o disco/fita guarda) e o converte em texto:
reconhece os cabeçalhos do CoCo e do Dragon DOS, e as tabelas de comandos/funções dos dois dialetos
(verificadas contra os disassemblies oficiais). O **dialeto** (CoCo × Dragon) é escolhido pela
plataforma/formato de origem. Tokens desconhecidos saem marcados como `[?XX]` (em vez de corromper em
silêncio) — se você vir isso, vale reportar.

> **Importante:** para **editar** um `.BAS` vindo do disco, ele precisa estar em **ASCII**. Se for tokenizado,
> o app avisa para você primeiro salvá-lo como ASCII no CoCo (`SAVE"NOME",A`) e tentar de novo. Para só
> **espiar** um BASIC tokenizado sem editar, use a **"Visualização rápida .BAS"** na aba DSK (somente-leitura,
> detokeniza na hora).

---

## 8. O que é lembrado entre sessões

Estas preferências ficam guardadas (localStorage) e voltam ao reabrir o app: **Maiúsculas auto**, **Tela**
(Normal/VDG/VDG 6847), **32 colunas**, **Escala** da fonte 6847, **ENTER ao final** e a **Vel.Export.Código**
(compartilhada com a aba XRoar). O **contador** no canto direito do rodapé mostra o total de **linhas** e
**caracteres** do programa em tempo real.

---

## 9. Fluxos práticos
- **Editar um programa de fita:** K7 → "Abrir no BASIC" → editar → **Rodar com reset** para testar → **Salvar
  como .CAS** ou **Novo DSK + Salvar**.
- **Editar um .BAS de disco:** DSK → selecionar o `.BAS` → "Editar .BAS" → editar → **Salvar** (in-place).
- **Digitar um programa do zero:** escolher a tela (Normal/VDG) → digitar → **Rodar no XRoar** → **Salvar como
  .BAS**.
- **Ver como fica na tela do CoCo:** trocar **Tela** para **VDG 6847** + **32 colunas**.
