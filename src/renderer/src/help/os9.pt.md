# Aba OS-9 / NitrOS-9 (sistema de arquivos RBF)

Esta aba é um **gerenciador de discos OS-9/NitrOS-9** — o sistema de arquivos **RBF**, com subpastas de
verdade, datas, atributos e permissões (diferente do RS-DOS da aba DSK). Aqui você **abre, navega, edita,
extrai, cria, torna bootável, desfragmenta e testa** discos OS-9, e ainda navega **partições OS-9 dentro de
cartões** (MiniIDE/CoCoSDC). Ao terminar este guia você saberá montar um disco OS-9 bootável e usável do
zero, mover arquivos entre discos e gravar de volta num cartão com segurança.

---

## 1. A tela: dois exploradores (Topo e Base)

A aba empilha **dois exploradores independentes** — **Topo** e **Base** — separados por uma divisória
arrastável. Enquanto **nenhum** disco está aberto, só o Topo aparece (em tela cheia). Ao abrir/criar um
disco, o segundo explorador surge, e você pode **arrastar arquivos/pastas de um para o outro** (copia).

Cada explorador tem três áreas:
- **Árvore (esquerda):** as pastas do disco (OS-9 tem subpastas reais). Cada pasta com subpastas tem um
  **chevron** (▸/▾) para **expandir/recolher**; **um clique** no nome **seleciona** a pasta (mostra o
  conteúdo na lista). A raiz aparece com o **nome do volume** (ou `/`).
- **Lista (centro):** os arquivos da pasta selecionada — colunas **Nome, Atributos, Tamanho, Modificado**.
  Pastas vêm primeiro; **um clique** seleciona o item; **duplo-clique** numa **pasta** entra nela, num
  **arquivo** o **extrai**. Pastas grandes truncadas aparecem com **`…`**.
- **Painel de mídia (direita):** o "prato" do disco com o mapa de ocupação por cluster (seção 8). No topo
  dele há um **selo de estado** do disco (**editável / não salvo / leitura**) ao lado do nome do arquivo.

Cada explorador trabalha em **um de três modos**: **EDITÁVEL** (disco em memória — Novo/Abrir/arrastado:
todas as operações + Salvar); **LEITURA** (partição de container, só ver/extrair); **EDIÇÃO DE CONTAINER**
(grava direto no arquivo do cartão — seção 9).

> Os dois exploradores são rotulados **Topo** e **Base** (um selo roxo no canto da barra). A **divisória**
> entre eles é arrastável (20–80% da altura); **Esc** cancela o arraste em andamento.

---

## 2. Estado-vazio: como começar

Quando a aba está sem disco, aparecem:
1. **Abrir OS-9** — escolhe um disco existente (`.os9`, `.dsk`, `.dmk`, `.sdf`).
2. **Novo OS-9…** (lista) — cria um disco novo (seção 4).
3. **? (Ajuda)** — este manual.

Ao criar/abrir, qualquer erro (ex.: gabarito incompatível) é mostrado ali mesmo, em vermelho; "Processando…"
indica que o app está trabalhando.

---

## 3. Abrir um disco OS-9

Use **Abrir** (ou **arraste** o arquivo do Windows para o explorador). O app detecta o formato, converte
DMK/SDF na leitura e abre **editável**. Discos OS-9 que aparecem como "ilegíveis" na aba DSK (dupla-face,
JVC) são **roteados automaticamente para cá**. Se já houver edição não salva, o app pergunta antes de trocar.

---

## 4. Criar um disco novo — o menu "Novo…"

O menu **Novo…** tem **três grupos**, cada um com as quatro geometrias:

| Geometria | Trilhas | Lados | Tamanho |
|---|---|---|---|
| `158K` | 35 | 1 (SS) | 158 KB |
| `180K` | 40 | 1 (SS) | 180 KB |
| `360K` | 40 | 2 (DS) | 360 KB |
| `720K` | 80 | 2 (DS) | 720 KB |

> **SS** = um lado (single-side). **DS** = dois lados (double-side).

### 1) Em branco
Cria um disco OS-9 vazio e formatado, **na hora**. Não precisa de gabarito. Pronto para receber arquivos.
**Não é bootável** (é um disco de dados).

### 2) Bootável (gabarito NitrOS-9)
Cria um disco **que dá boot** e é **usável** (com kernel, `sysgo`, `startup`, `CMDS`, `SYS`). Como o aparato
de boot do OS-9 (trilha de boot na Trilha 34 + o arquivo `OS9Boot` + arquivos de sistema) é binário e
específico de versão/geometria — **não dá para gerar do nada** —, o app **clona um disco de sistema**.
- **360K e 720K** trazem um **gabarito NitrOS-9 embutido** (opções **"✓ gabarito"**): o disco é criado
  **automaticamente**, sem pedir nada.
- **158K e 180K** (opções **"— referência sua"**): não há sistema OS-9 livre para CoCo nessas geometrias, então
  o app pede um **disco de referência seu** (veja a seção 5).

### 3) Bootável + programas
Igual ao anterior, mas além de clonar o sistema você escolhe **um ou mais programas**: eles vão para a pasta
**CMDS** e o app **preserva o `startup` original e anexa** os nomes — assim **rodam no boot**. Os programas
devem ser **módulos OS-9 executáveis** e o disco precisa ter espaço livre suficiente (se faltar, o app avisa
o tamanho necessário × livre).

> Após criar um bootável, o disco abre editável e **não salvo**: teste o boot no XRoar (seção 7) e use
> **"Salvar Como"**.

---

## 5. O "gabarito" (disco-semente do sistema)

Um **gabarito** é um disco OS-9/NitrOS-9 **bootável de verdade** usado como semente: o app clona dele o
aparato de boot + os arquivos de sistema. Ele precisa ser **da MESMA geometria** escolhida (o app valida e
recusa se não bater ou se não for bootável).

**Gabaritos embutidos (não precisa fazer nada):**

| Geometria | Gabarito embutido |
|---|---|
| **360K** (40T DS) | ✅ NitrOS-9 6809 Level 1 (CoCo) — incluído no app |
| **720K** (80T DS) | ✅ NitrOS-9 6809 Level 1 (CoCo) — incluído no app |

> Os gabaritos embutidos são imagens do **NitrOS-9**, distribuído livremente pela comunidade Color Computer
> (código sob GPL). Créditos no `NOTICE.txt` que acompanha os gabaritos.

> **Quer usar a SUA referência mesmo em 360K/720K?** Cada uma dessas geometrias também tem a variante
> **"— referência sua"** (em *Bootável* e em *Bootável + programas*). Use-a quando quiser uma versão específica
> (ex.: NitrOS-9 6309, Level 2, ou um disco já configurado) em vez do gabarito embutido. Você nunca fica preso
> ao gabarito.

**Geometrias sem gabarito embutido (você indica um disco seu):** **158K** (35T) — só existe o OS-9 Tandy
original, **proprietário**; **180K** (40T um lado) — o NitrOS-9 CoCo só vem em dois lados (40T-SS é formato de
Dragon). **Onde conseguir** um disco de referência: o **Color Computer Archive** (`colorcomputerarchive.com`,
seção *Disks → Operating Systems*) e a distribuição oficial do **NitrOS-9** (`nitros9.sourceforge.io`). Baixe
um disco **bootável** da geometria desejada e aponte-o quando o app pedir.

---

## 6. Barra de ferramentas (disco aberto)

- **Abrir / Novo…** — como acima.
- **Salvar** — sobrescreve o arquivo de origem (fica verde quando há alterações). Disco recém-criado abre
  "Salvar Como" na 1ª vez.
- **Salvar Como** — grava como novo `.os9`/`.dsk` **ou `.sdf` (CoCoSDC)** — escolha o tipo no diálogo. Ao
  editar um `.sdf`, o Salvar já regrava em SDF.
- **Nova pasta** — cria uma subpasta na pasta atual. Abre um **campo de nome** (até 28 caracteres;
  `/` `\` e caracteres não-ASCII são removidos automaticamente). **Enter** confirma, **Esc** cancela.
- **Renomear** — renomeia o item **selecionado** na lista (mesmo campo de nome; desabilitado sem seleção).
- **Extrair** — salva o arquivo selecionado para o PC (também por **duplo-clique** no arquivo).
- **Inserir** — adiciona um arquivo do PC na pasta atual (abre o diálogo de arquivo do sistema).
- **Excluir** — remove o arquivo (ou pasta **vazia**) selecionado e libera os clusters (pede confirmação).
- **Testar** — monta o disco no **XRoar** (só discos em memória — seção 7).
- **Bootável** — torna **bootável o disco já aberto** (avançado; injeta só o aparato de boot — **não** os
  arquivos de sistema). Para um disco **usável**, prefira **Novo… → Bootável**. ⚠️ Se o disco atual **não
  tem o sistema** (sem CMDS/"shell"), o app **avisa** e oferece, ali mesmo, criar um **"Bootável COM
  sistema"** (clona o gabarito da mesma geometria) — assim você corrige na hora sem cair em "BOOT FAILED".
- **Fechar** — descarta a imagem da tela (confirma se houver edição não salva).
- **?** — esta Ajuda.

> ⚠️ Não confunda os dois "Bootável": o **do menu Novo…** cria um disco novo, completo e usável; o **botão da
> barra** apenas injeta o boot num disco já aberto.

> **Proteção contra perda:** sempre que houver **edição não salva** e você for **Abrir**, **criar Novo**,
> **arrastar outro disco** ou **Fechar**, o app abre um modal **"Alterações não salvas"** com **Cancelar /
> Descartar / Salvar e continuar** (se o save for cancelado, a ação não prossegue). O selo de estado mostra
> **"não salvo"** (âmbar) sempre que há mudanças pendentes.

---

## 7. Testar / bootar no XRoar

O botão **Testar** (desabilitado para partições de container) abre um diálogo com um **dropdown de drive
(D0–D3)** — a **D0** é a de boot — e três botões de ação:
- **Bootar OS-9 (DOS / BOOT)** — reseta e digita o **comando de boot do OS-9**. No **CoCo** o comando é
  `DOS`; no **Dragon** é `BOOT` — o app escolhe **automaticamente** conforme a plataforma e o rótulo do botão
  muda. Precisa de um disco **bootável** na **drive 0**.
- **Montar + Reset** — monta na drive escolhida e reinicia limpo (você inspeciona com o OS-9 já rodando).
- **Montar (sem reset)** — só monta na drive escolhida, sem mexer no que já roda.

Ao testar, o app **já prepara o XRoar para OS-9**: máquina **CoCo 3** (o NitrOS-9 Level 2 exige), **vídeo
RGB** e **filtro Suave** (deixa as 80 colunas legíveis). Depois use **Expandir** na tela do XRoar para a
imagem ficar grande e nítida.

> O **Testar** só funciona com discos **em memória** (Novo / Abrir / avulso) — não com partição de container
> (o floppy do emulador é pequeno demais). Para **inspecionar um disco de dados**, monte-o numa drive e, com o
> OS-9 **já rodando**, use `dir /dX` (X = nº da drive). E lembre: o comando `dir` do **BASIC** **não** lê um
> disco OS-9 (mostra lixo + FS ERROR) — isso é normal; para ver o disco é preciso **bootar** o OS-9 e usar os
> comandos do OS-9.

---

## 8. Painel de mídia (o "prato" do disco)

À direita, um disco circular mostra a **ocupação por cluster**:
- Cores: **USO** (verde-água, cluster cheio) · **PARCIAL** (âmbar) · **LIVRE** (cinza); o cluster sob o mouse
  acende em branco, e o arquivo selecionado/sob o cursor fica **magenta**. O hub central mostra o **% cheio**.
- Passe o mouse sobre a árvore/lista e o painel **acende os clusters** daquele arquivo/pasta. **Clique numa
  célula** do prato para **selecionar o arquivo** que a ocupa (a árvore navega até ele).
- **Estatísticas** embaixo: KB usado/livre, clusters usados/total e o tamanho do cluster.
- **Defrag** (com contador de fragmentados) e **Defrag arquivo**: compactam os dados em clusters contíguos.
  Disponíveis só em disco **editável** (não em container). "Defrag arquivo" precisa de um arquivo selecionado
  com mais de um segmento.

---

## 9. Partições OS-9 dentro de cartões (MiniIDE / CoCoSDC)

Cartões grandes podem conter uma **partição OS-9** inteira. Abra o cartão pela aba DSK e clique no botão
**OS-9** — a partição abre aqui em **somente-leitura** (por segurança).

Para editar, clique em **Habilitar edição**: a partir daí as operações (nova pasta, renomear, inserir,
excluir) gravam **direto no arquivo do cartão** — **não há "Salvar/Desfazer"**. A **área de sistema**
(OS9Boot/SYS/CMDS/DEFS) fica **protegida** (só pastas de usuário podem mudar) e cada gravação é validada
antes de escrever. Aparece o selo **"⚠ edição grava no arquivo"**. **Recomendado: trabalhe numa CÓPIA do
cartão.** (Testar e Defrag ficam indisponíveis em partição de container.)

---

## 10. Mover/copiar arquivos e arrastar para o Windows

- **Entre os dois exploradores:** arraste um arquivo ou pasta de um para o outro — ele é **copiado** para a
  **pasta atualmente selecionada** no destino (pasta = cópia recursiva, com contagem de pastas/arquivos). Um
  realce verde tracejado mostra onde vai soltar; um **aviso** flutuante embaixo confirma "✓ copiado. Lembre de
  Salvar." (clique nele para fechar). Soltar na **própria** lista de origem não faz nada; destino
  somente-leitura é recusado.
- **Do Windows para o explorador:** arraste um disco para **abrir** (realce verde "Solte para abrir o disco
  OS-9"). Funciona inclusive no estado-vazio. Se já houver edição não salva, o app **confirma** antes
  (Cancelar / Descartar / Salvar e continuar).
- **Do explorador para o Windows:** use a alça **⠿** à esquerda de um **arquivo** para arrastá-lo direto ao
  Explorer do Windows (extrai o conteúdo real). Só arquivos têm alça, não pastas.

---

## 11. Barra de status

Mostra: nome do volume · tamanho · lados (1/2) · nº de arquivos/pastas · espaço livre · um indicador
**⚡ bootável** (com o LSN/tamanho do OS9Boot) ou **○ não-bootável**, a legenda do prato e um cartão com o
estado (**não salvo / salvo / leitura**) + barra de ocupação.

---

## 12. Fluxos práticos
- **Disco de dados vazio:** Novo… → Em branco → tamanho → Inserir arquivos → Salvar Como.
- **Disco que boota (360K/720K):** Novo… → Bootável → `360K`/`720K` (✓ gabarito) → Salvar Como → Testar →
  Bootar OS-9.
- **Bootável com versão específica do sistema:** Novo… → Bootável → "— referência sua" → indique seu disco
  NitrOS-9 da mesma geometria.
- **Bootável que já roda meus programas:** Novo… → Bootável + programas → (gabarito/referência) + escolha os
  módulos → Salvar Como → Testar.
- **Copiar um utilitário de um disco para outro:** abra os dois → arraste o arquivo do Topo para a Base →
  Salvar.
- **Editar um cartão CoCoSDC:** (faça uma cópia) → DSK abre o cartão → botão OS-9 → Habilitar edição → editar.
