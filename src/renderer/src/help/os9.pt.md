# Aba OS-9 / NitrOS-9 (sistema de arquivos RBF)

Esta aba é um **gerenciador de discos OS-9/NitrOS-9** (o sistema de arquivos **RBF**, com
subpastas, datas e permissões — diferente do RS-DOS da aba DSK). Aqui você **abre, navega, edita,
extrai, cria e torna bootáveis** discos OS-9.

## Visão geral da tela

Quando a aba está **vazia** (nenhum disco carregado), aparece **um único painel** com as opções de
abrir/criar — para não duplicar a informação. Esse primeiro painel é o **A (Topo)**. Assim que você
**abre ou cria** um disco, surge o **segundo painel (B / Base)**, e a tela passa a mostrar **dois
exploradores empilhados** (Topo e Base), no estilo do Explorer do Windows:

- **Árvore (esquerda):** as pastas do disco (OS-9 tem subpastas de verdade).
- **Lista (centro):** os arquivos da pasta selecionada — nome, atributos, tamanho e data.
- **Painel de mídia (direita):** o "prato" do disco mostrando o mapa de alocação (quais blocos estão
  ocupados); ao passar o mouse num arquivo, os blocos dele acendem.

Cada explorador trabalha com **um disco independente**. Você pode **arrastar arquivos/pastas de um
para o outro** (copia), arrastar de fora (Windows) para abrir, e arrastar para fora (Explorer) para
extrair.

## Quando a aba abre (estado vazio)

Aparece a tela inicial com duas ações:

1. **Abrir OS-9** — escolhe um arquivo de disco OS-9 já existente (`.os9`, `.dsk`, `.dmk`, `.sdf`).
2. **Novo OS-9…** (lista suspensa) — cria um disco novo (veja abaixo).

Ao lado dessas opções há o botão **? (Ajuda)**, que abre este manual.

## Abrir um disco OS-9

Use **Abrir** (ou arraste o arquivo para o explorador). O app detecta automaticamente que é um disco
OS-9 e o abre **editável**. Formatos aceitos: imagem crua (`.os9`/`.dsk`), imagem de trilha **DMK** e
**SDF** (CoCoSDC) — todas convertidas para setores na leitura. Discos OS-9 dentro de imagens grandes
(MiniIDE, CoCoSDC) também abrem por esta aba (veja "Partições de container").

## Criar um disco novo — o menu "Novo…"

O menu **Novo…** tem **três grupos**, e cada um oferece as quatro geometrias:

| Geometria | Trilhas | Lados | Tamanho |
|---|---|---|---|
| `158K` | 35 | 1 (SS) | 158 KB |
| `180K` | 40 | 1 (SS) | 180 KB |
| `360K` | 40 | 2 (DS) | 360 KB |
| `720K` | 80 | 2 (DS) | 720 KB |

> **SS** = single-side (um lado). **DS** = double-side (dois lados).

### 1) Em branco
Cria um disco OS-9 vazio e formatado, **do zero**. Não precisa de gabarito. Pronto para você inserir
arquivos. Não é bootável (é um disco de dados).

### 2) Bootável (gabarito NitrOS-9)
Cria um disco **que dá boot** no CoCo. Como o "aparato de boot" do OS-9 (a trilha de boot na Trilha 34
+ o arquivo `OS9Boot` + os arquivos de sistema) é um conteúdo binário específico de versão e
geometria — **não dá para gerar do nada** —, o app **clona um disco de sistema NitrOS-9**. O resultado
é um disco bootável e **usável** (com kernel, `sysgo`, `startup`, `CMDS`, `SYS`).

**O app já vem com gabaritos NitrOS-9 embutidos** para as geometrias **360K** e **720K** (marcadas com
**"✓ gabarito"** no menu). Para essas, o disco é criado **automaticamente**, sem pedir nada. Para
**158K** e **180K** (marcadas **"— referência sua"**) **não** existe sistema OS-9 livre para CoCo nessa
geometria, então o app pede que você indique um **disco de referência seu** (veja a próxima seção).

### 3) Bootável + programas
Igual ao anterior, mas além de clonar o sistema você escolhe **um ou mais programas**. Eles são
inseridos na pasta **CMDS** e o app **preserva o `startup` original e anexa** os nomes dos programas —
assim eles **rodam automaticamente no boot**, sem apagar a inicialização do sistema.

> Os programas devem ser **módulos OS-9 executáveis**. E o disco de referência precisa ter **espaço
> livre** suficiente para eles.

## O que é o "gabarito" (disco-semente do sistema)

Um **gabarito** é um disco OS-9/NitrOS-9 **bootável de verdade** usado como semente: o app clona dele
o aparato de boot + os arquivos de sistema para o seu disco novo. Ele precisa ser **da MESMA geometria**
escolhida (o app valida e avisa se não bater).

**Gabaritos embutidos (não precisa fazer nada):**

| Geometria | Gabarito embutido |
|---|---|
| **360K** (40T DS) | ✅ NitrOS-9 6809 Level 1 (CoCo) — incluído no app |
| **720K** (80T DS) | ✅ NitrOS-9 6809 Level 1 (CoCo) — incluído no app |

> Os gabaritos embutidos são imagens do **NitrOS-9**, distribuído livremente pela comunidade Color
> Computer (código sob GPL). Créditos no arquivo `NOTICE.txt` que acompanha os gabaritos.

> **Quer usar a SUA referência mesmo em 360K/720K?** Para cada uma dessas geometrias o menu também traz
> a variante **"— referência sua"** (tanto em *Bootável* quanto em *Bootável + programas*). Escolha-a
> quando quiser uma versão específica do sistema (ex.: NitrOS-9 6309, Level 2, ou um disco que você já
> configurou) em vez do gabarito embutido. Você nunca fica preso ao gabarito.

**Geometrias sem gabarito embutido (você indica um disco seu):**

| Geometria | Por quê | O que fazer |
|---|---|---|
| **158K** (35T SS) | O NitrOS-9 não é construído para 35 trilhas; só existe o **OS-9 Tandy** original, que é **proprietário** (não pode ser embutido) | Indique um disco OS-9 35T bootável **seu** |
| **180K** (40T SS) | O NitrOS-9 para CoCo só vem em 40T/80T **dois lados**; 40T um lado é formato de Dragon | Indique um disco OS-9 40T-SS bootável **seu** |

**Onde conseguir um disco de referência** (para 158K/180K, ou outras versões de sistema): o
**Color Computer Archive** mantém um acervo enorme de discos OS-9/NitrOS-9 e jogos —
`https://colorcomputerarchive.com` (seção *Disks → Operating Systems*). A distribuição oficial do
NitrOS-9 também está em `https://nitros9.sourceforge.io`. Baixe um disco **bootável** da geometria
desejada e aponte-o quando o app pedir.

> O gabarito precisa ser **bootável de verdade** (campo de bootstrap preenchido). Um disco só de
> utilitários (sem boot) é recusado.

## Barra de ferramentas (com um disco aberto)

- **Abrir / Novo…** — como acima.
- **Salvar** — grava no arquivo de origem (sobrescreve). Em disco recém-criado, abre "Salvar Como".
- **Salvar Como** — grava como um novo `.os9`/`.dsk` **ou como `.sdf` (CoCoSDC)** — escolha o tipo no
  diálogo. Ao editar um `.sdf`, o **Salvar** já regrava em SDF.
- **Nova pasta** — cria uma subpasta na pasta atual.
- **Renomear** — renomeia o item selecionado.
- **Extrair** — salva o arquivo selecionado para o seu PC.
- **Inserir** — adiciona um arquivo do PC na pasta atual.
- **Excluir** — remove o arquivo (ou pasta **vazia**) selecionado; libera os blocos.
- **Testar** — monta o disco no emulador **XRoar** (veja abaixo).
- **Bootável** — torna o disco **já aberto** bootável (avançado; só injeta o aparato de boot a partir
  de um gabarito — não adiciona os arquivos de sistema). Para um disco **usável**, prefira o
  **Novo… → Bootável** (que clona o sistema completo).
- **Fechar** — descarta a imagem da tela e volta ao estado vazio (pede confirmação se houver edição
  não salva).
- **?** — esta Ajuda.

> ⚠️ Cuidado para não confundir **dois "Bootável"**: o **do menu Novo…** cria um disco novo, completo e
> usável; o **botão da barra** apenas injeta o boot num disco já aberto.

## Barra de status

Mostra o nome do volume, tamanho, nº de arquivos/pastas, espaço livre e um indicador
**⚡ bootável / ○ não-bootável** (lido dos campos de bootstrap do disco).

## Testar / bootar no XRoar

O botão **Testar** abre um diálogo com a drive de destino (D0–D3) e três modos:

- **Bootar OS-9** — reseta e digita `DOS` (o comando do Disk BASIC que carrega o OS-9). Use com um
  disco **bootável** na drive 0.
- **Montar + Reset** — monta o disco e reinicia limpo (você inspeciona com o OS-9 já rodando).
- **Montar (sem reset)** — só monta, sem reiniciar.

Ao testar OS-9, o app **já configura o XRoar para OS-9 automaticamente**: máquina **CoCo 3** (o
NitrOS-9 Level 2 exige), **vídeo RGB** e **filtro Suave** (deixa o texto de 80 colunas legível). Em
seguida, use o botão **Expandir** na tela do XRoar para a imagem ficar grande e nítida.

> Dica: o comando `dir` do BASIC **não** lê um disco OS-9 (mostra "lixo" + FS ERROR) — isso é normal.
> Para ver o disco, é preciso **bootar** o OS-9 (`DOS`) e usar os comandos do próprio OS-9.

## Partições OS-9 dentro de imagens de container (MiniIDE / CoCoSDC)

Imagens grandes (cartões CF/SD) podem conter uma **partição OS-9** inteira. Ao abrir a imagem pela aba
DSK/navegador, clique no botão **OS-9** para navegá-la aqui. Por segurança, ela abre **somente-leitura**;
para editar, use **Habilitar edição** — então as alterações gravam **direto no arquivo** do container,
com uma **trava que protege a área de sistema** (OS9Boot/SYS/CMDS/DEFS). Recomenda-se trabalhar numa
**cópia** do container.

## Desfragmentar

Quando um arquivo fica espalhado em vários trechos (fragmentado), o painel de mídia o marca. Há ações
de **defrag** (por arquivo e do disco todo) que reorganizam os blocos para ficarem contíguos,
preservando o conteúdo.

## Resumo rápido

- **Só quero um disco vazio:** Novo… → Em branco → tamanho.
- **Quero um disco que boota (360K/720K):** Novo… → Bootável → `360K`/`720K` — pronto, usa o gabarito
  embutido **automaticamente**.
- **Quero um bootável 158K/180K:** Novo… → Bootável → tamanho → indique um disco de sistema **seu**
  (veja "O que é o gabarito" → Color Computer Archive).
- **Quero que boote e rode meus programas:** Novo… → Bootável + programas → (gabarito) + programas.
- **Quero testar no emulador:** Testar → Bootar OS-9 → Expandir.
