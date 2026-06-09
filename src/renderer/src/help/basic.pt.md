# Aba BASIC — Editor de programas BASIC

A aba **BASIC** é um editor de texto pensado para programas **BASIC do Color Computer** (e clones como o
CP-400) e do **Dragon**. Ela **detokeniza** programas (transforma os bytes do disco/fita em texto legível),
deixa você **editar** com cara de tela do CoCo, e então **roda no XRoar**, **grava num disco** ou **salva**
como `.bas`/`.cas`. Ao terminar este guia você saberá trazer um programa de qualquer origem, editá-lo e
devolvê-lo rodando.

---

## 1. Como um programa chega aqui

- **Abrir arquivo .BAS (texto)** (toolbar) — abre um `.bas/.txt` em **ASCII** do seu PC.
- **Da aba K7** — botão **"Abrir no BASIC"**: manda o BASIC lido da fita (já detokenizado).
- **Da aba DSK** — botão **"Editar .BAS"**: manda um `.BAS` do disco (precisa estar em **ASCII**; veja a
  seção 6).

Se já houver um programa no editor, o app pergunta antes de substituir. Ao abrir de um disco, aparece o selo
**"Editando {arquivo}"** e um botão **Salvar** que regrava **no próprio disco de origem** (seção 5).

---

## 2. A área de edição e as três "telas"

Você edita texto livre (sem numeração automática nem realce de sintaxe). O seletor **Tela** (rodapé) muda só
a **aparência**, para você ver como ficará no CoCo:
- **Normal** — texto monoespaçado comum; o seletor **Cores** escolhe o esquema (verde/preto, laranja/preto,
  etc.).
- **VDG** — imita a tela do CoCo: maiúsculas em preto sobre verde; **minúsculas em vídeo inverso** (o VDG não
  tem letras minúsculas de verdade).
- **VDG 6847 (autêntica)** — desenha os **glifos pixelados reais** do chip MC6847, com a opção **Escala**
  (Pequena/Média/Grande) e **32 colunas** (a largura real da tela).

A opção **Maiúsculas auto** (ligada por padrão) força MAIÚSCULAS enquanto você digita (Color BASIC clássico);
desligue para permitir minúsculas (CoCo 3 / Disk BASIC aceitam). **Negrito** engrossa a fonte (exceto na tela
6847, que é bitmap fixo).

> **Seta-pra-cima ↑ (= `^`, exponenciação):** clique no botão **↑** ou tecle **Alt+↑** para inserir. Nas telas
> VDG o `^` aparece como ↑, como no CoCo real.

---

## 3. Editar texto: recortar/copiar/colar e procurar

- **Recortar / Copiar / Colar** na toolbar (texto colado também é maiusculizado se "Maiúsculas auto" estiver
  ligada).
- **Procurar** e **Procurar e substituir** abrem uma barra: digite o termo (a busca é maiúscula/insensível a
  caixa), use **Próximo** (com volta ao início), e **Substituir / Todos**. (Sem regex; "Todos" coloca o
  resultado todo em maiúsculas.)

---

## 4. Rodar no XRoar

- **Rodar no XRoar** — digita `NEW` + o seu programa no emulador (você precisa estar no prompt `OK`).
- **Rodar com reset** — reinicia o emulador (boot limpo, sem `NEW` — o reset já limpa a RAM) e então digita o
  programa.

As opções de rodapé controlam a injeção: **NEW antes de injetar**, **RUN ao final** (roda sozinho) e **ENTER
ao final** (garante que a última linha entre). **Vel.Export.Código** define a rapidez com que as teclas são
digitadas no XRoar (Rápido 12 ms / Padrão 25 ms).

---

## 5. Salvar e exportar

- **Salvar como arquivo .BAS (texto)** — grava o programa em **ASCII** (como `SAVE"…",A` no CoCo), em `.bas`
  ou `.txt`.
- **Salvar como fita .CAS** — embrulha o programa num `.CAS` carregável por **CLOAD** no XRoar/MAME (e
  reimportável na aba K7).
- **Novo DSK + Salvar → A/B** — cria/usa o disco do painel escolhido e grava o programa como **.BAS ASCII**
  (o CoCo carrega com `LOAD"NOME"`). Defina o **Painel** (A/B) e o **nome** (até 8 caracteres A-Z/0-9).
- **Salvar (in-place no DSK)** — aparece quando o programa veio de um disco (selo "Editando"): **atualiza o
  arquivo dentro daquele disco**. Se o disco/painel mudou desde a abertura, o app avisa e oferece salvar como
  arquivo novo.

> O editor salva sempre em **ASCII** — o CoCo/Dragon re-tokeniza na carga. Não há gravação em formato
> tokenizado.

---

## 6. Sobre detokenizar (e o limite ASCII)

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

## 7. Fluxos práticos
- **Editar um programa de fita:** K7 → "Abrir no BASIC" → editar → **Rodar com reset** para testar → **Salvar
  como .CAS** ou **Novo DSK + Salvar**.
- **Editar um .BAS de disco:** DSK → selecionar o `.BAS` → "Editar .BAS" → editar → **Salvar** (in-place).
- **Digitar um programa do zero:** escolher a tela (Normal/VDG) → digitar → **Rodar no XRoar** → **Salvar como
  .BAS**.
- **Ver como fica na tela do CoCo:** trocar **Tela** para **VDG 6847** + **32 colunas**.
