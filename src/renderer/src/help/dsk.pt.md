# Aba DSK — Disquetes RS-DOS / Dragon

A aba **DSK** é o editor de **imagens de disquete** do CoCo (RS-DOS / Disk BASIC) e do **Dragon**
(Dragon DOS / `.vdk`). Tem **dois painéis** (A e B) lado a lado para comparar, copiar arquivos entre
discos e montar coleções.

## Os dois painéis (A e B)
Cada painel abre uma imagem independente. O **painel ativo** (destacado) é o alvo das ações da barra de
ferramentas — clique num painel para ativá-lo. À direita de cada painel há a **lista de arquivos**, o
**mapa do disco** e uma **barra de status** com ocupação e fragmentação.

## Barra de ferramentas (botões)
- **Novo** — cria um disco em branco no formato escolhido (veja "Criar disco novo").
- **Importar imagem** — abre `.dsk`/`.vdk`/`.jvc`/**DMK**/**SDF** e imagens de **contêiner**
  (DriveWire, MiniIDE, CoCoSDC).
- **Injetar** — insere um arquivo do PC (`.bin`/`.bas`/`.cas`…) no disco ativo.
- **Copiar / Recortar / Colar** — área de transferência de **arquivos**: copie/recorte um arquivo de um
  disco e cole em outro (ou no mesmo). **Excluir** remove o arquivo selecionado.
- **Desfazer / Refazer** — desfaz/refaz as últimas edições do disco (inserir, excluir, renomear, defrag…).
- **Ordenar A-Z** — ordena o diretório do **disco ativo** alfabeticamente. **Ordenar Todos** — ordena
  todos os discos de um **contêiner**.
- **Copiar Painel A → B** — copia o **disco ativo** do painel A para o B como um `.dsk` avulso.
- **Testar Painel** — monta o disco do painel ativo no **XRoar** (drive 0) para testar na hora.
- **Gravar GW** — grava o disco do painel ativo num **disquete físico** (aba GW / Greaseweazle).
- **Salvar / Salvar Como** — grava o disco (veja "Salvar").
- **?** (Ajuda) — esta ajuda, à direita da barra.

## Abrir / importar imagens
- **Importar imagem** abre: `.dsk` (RS-DOS), `.vdk` (Dragon), `.jvc`, **DMK** (imagem de trilha), **SDF**
  (CoCoSDC) e imagens grandes de **contêiner** — **DriveWire** (vários discos num arquivo),
  **MiniIDE/HDBDOS** e **CoCoSDC** (cartão FAT). Contêineres abrem como coleção navegável.
- **Arrastar** um arquivo de disco do Windows para o painel também abre.
- Soltar um arquivo num **painel vazio** cria um `.dsk` novo já com esse arquivo dentro.

## Navegar contêineres (vários discos)
Ao abrir um contêiner, o painel ganha um seletor: setas **◀ ▶**, um campo com o **número do disco** e
uma **lupa ("Buscar disco")** que pesquisa por **nome do disco OU nome de arquivo**. Cada disco é lido
sob demanda (não recarrega a imagem inteira).

## Criar disco novo
**Novo** cria um disco em branco no formato do painel (seletor "Novo: formato" na barra de status):
**CoCo 35T** (DECB padrão, 160K), **CoCo 40T** (JDOS/CODIMEX, 180K) ou **Dragon 40T**. Depois é só
inserir arquivos e salvar. (Há também a opção de **recriar** a imagem noutro formato mantendo os
arquivos.)

## Trabalhar com os arquivos
- **Extrair**: arraste o arquivo para fora (Windows) ou use copiar/colar.
- **Injetar/Inserir**: adiciona `.bin`/`.bas`/`.cas`… ao disco. Um `.cas` é interpretado: cada programa
  da fita vira um arquivo (ML → `.BIN` com preâmbulo LOADM; BASIC → `.BAS`; dados → `.DAT`).
- **Renomear / Excluir** o arquivo selecionado.
- **Duplo-clique** num arquivo: monta o disco no XRoar e **roda** (RUN para BASIC, LOADM/EXEC para
  máquina). A máquina do XRoar acompanha o formato do disco (CoCo/Dragon).

## Arrastar e soltar (drag-and-drop)
- **Entre os painéis A ↔ B:** arraste um arquivo de um painel e solte no outro. **Ctrl** = copiar,
  **Shift** = mover (o realce mostra a ação).
- **Do Windows para um painel:** arraste um `.dsk`/imagem (abre) ou um `.bin`/`.bas`/`.cas` (insere; em
  painel vazio cria um `.dsk` novo).
- **De um painel para o Windows:** arraste um arquivo da lista para o Explorer para **extrair**.

## Mapa do disco e desfragmentação
À direita há o **mapa do disco** (anéis concêntricos): trilhas/setores em cores —
**ocupado / livre / diretório / fragmentado / selecionado**. Hover mostra detalhes; clicar numa célula
seleciona o arquivo que a ocupa. A geometria é detectada (35/40 trilhas). A **barra de status** mostra
**% de ocupação** e **% de fragmentação**.
- **DEFRAG** — reorganiza o disco (com animação nostálgica de disquete) deixando os arquivos contíguos;
  escolha a ordem (manter / alfabética / por tamanho); dá para cancelar no meio com resultado parcial.
- **DEFRAG ARQ.** — desfragmenta só o arquivo selecionado.

## Discos de "arte" (somente-leitura)
Alguns discos têm nomes com **caracteres semigráficos** (arte no diretório). São listáveis e
extraíveis, mas ficam em **somente-leitura** (edição bloqueada) para não embaralhar o desenho.

## Hex / Disassembler 6809 (botão HEX/DISASM)
Abre um **editor hexadecimal** e um **desassemblador 6809** lado a lado, para inspecionar os bytes/código
de um arquivo selecionado. Dá para definir o **endereço de origem**, alternar **fluxo** (recursive-
descent) × linear, e **marcar** regiões como **código / dados / tabela de vetores** — útil para estudar
binários ML.

## Salvar
- **Salvar** — sobrescreve o arquivo de origem.
- **Salvar Como** — grava um novo `.dsk`/`.vdk`. Para um disco RS-DOS único, o diálogo também oferece o
  tipo **`.sdf`** (CoCoSDC) — veja "Imagens SDF".
- **Gravar de volta no contêiner** — ao editar um disco de **MiniIDE** ou **CoCoSDC**, o "Salvar" pode
  gravar o disco **de volta no slot/arquivo** do contêiner (com confirmação, pois pode ser sua mídia
  real). Recomenda-se trabalhar numa **cópia**.

## Imagens SDF (CoCoSDC)
`.SDF` é o formato do **CoCoSDC** para discos não-padrão / protegidos / densidade mista (um "DMK
pré-indexado"). O app **lê** SDF (abrir/extrair/editar) e **grava** SDF para geometria padrão (RS-DOS,
256 B/setor): em "Salvar Como", escolha o tipo **`.sdf`**. Detecção pelo conteúdo (assinatura `SDF1`),
não pela extensão. (Layouts FM/protegidos: leitura sim; geração não.)

## Gravar em disquete real (Greaseweazle)
**Gravar GW** envia o disco do painel ativo para a aba **GW** e grava num disquete físico (precisa da
placa Greaseweazle). Veja a Ajuda da aba GW.

## Observações importantes
- RS-DOS/DECB é **single-side** (160K/35T ou 180K/40T). Discos de **dois lados** geralmente são **OS-9**
  (use a aba OS-9) ou contêineres.
- Um disco "não suportado/ilegível" no painel costuma ser **OS-9, dupla-face ou com cabeçalho (JVC)** —
  se for OS-9, o app oferece abri-lo na **aba OS-9**.
