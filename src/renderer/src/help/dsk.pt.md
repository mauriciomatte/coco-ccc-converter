# Aba DSK — Disquetes RS-DOS / Dragon

A aba **DSK** é o editor completo de **imagens de disquete** do CoCo (RS-DOS / Disk BASIC) e do **Dragon**
(Dragon DOS / `.vdk`). Com ela você **abre, lê, edita, organiza, compara, converte, testa e grava** discos —
de uma única imagem `.dsk` a contêineres gigantes com milhares de discos. Ao terminar este guia você saberá
exatamente o que cada ferramenta entrega e como chegar a cada resultado.

---

## 1. A tela: dois painéis A e B

A aba tem **dois painéis empilhados** — **A (topo)** e **B (rodapé)** — separados por uma divisória que
você arrasta para dar mais espaço a um deles. Cada painel abre uma imagem **independente**, o que permite
comparar dois discos e copiar arquivos de um para o outro.

- **Painel ativo:** clique em qualquer ponto de um painel para ativá-lo — o selo do painel fica **laranja**.
  Quase toda ação da barra de ferramentas opera no **painel ativo**.
- Cada painel tem três colunas: **(esquerda)** abrir/limpar/formatar + informações da imagem;
  **(centro)** a lista de arquivos; **(direita)** o **mapa do disco** + botões de desfragmentação.
- **Divisória horizontal:** a barra entre A e B é arrastável — puxe para cima/baixo para dar mais altura
  ao painel que estiver usando.

**Resultado:** você enxerga dois discos ao mesmo tempo e move arquivos entre eles arrastando.

### A coluna esquerda — botões e selos de informação

A coluna esquerda de cada painel tem, em cima, o **selo do painel** ("Painel A/B") e três ícones:
**📁 Abrir** (abre uma imagem), **🧽 Limpar painel** (esvazia o painel, sem mexer no arquivo) e
**💿 Formatar** (apaga o disco — veja a seção 8). Abaixo, quando há um disco, aparecem as **informações**:

- **Nome da imagem** (encurtado; passe o mouse para ver o nome completo) e **tamanho em KB**.
- **Selo de origem:** **"Lida: {formato}"** (disco aberto de um arquivo — a cor/rótulo indicam o formato real
  detectado) **ou** **"Nova: {nome}"** (imagem criada pelo ✚ e ainda **não salva** em arquivo).
- **"⚠ Formato não suportado"** (vermelho) — só em contêineres cujos nomes de disco saem **ilegíveis**:
  abre **só para inspeção**, salvar **não é recomendado**.
- Em contêineres, o **bloco "Disco"** (navegação) com ◀ ▶, o nº do disco e os botões de cada tipo (seção 5).

---

## 2. Abrir e criar imagens

### Abrir uma imagem (coluna esquerda, ícone de pasta)
Abre qualquer formato: **`.dsk`** (RS-DOS), **`.vdk`** (Dragon), **`.jvc`**, **DMK** (imagem de trilha),
**SDF** (CoCoSDC) e **contêineres** — **DriveWire** (vários discos num arquivo), **MiniIDE/HDBDOS** e
**CoCoSDC** (cartão FAT). Discos OS-9 e dupla-face são **roteados automaticamente para a aba OS-9**.

### Criar disco novo (barra de status do painel: "Nova:")
1. No seletor **"Nova:"** escolha o formato: **CoCo 35T** (DECB padrão, 160K), **CoCo 40T (JDOS)** (180K)
   ou **Dragon 40T**.
2. Clique no **✚**. Se o painel já tem um disco, o app pede confirmação antes de descartar.

**Resultado:** um disco em branco formatado, pronto para receber arquivos e ser salvo.

> **Trocar o formato de um disco já aberto:** se você **mudar o seletor "Nova:"** entre **CoCo 35T** e
> **CoCo 40T (JDOS)** com um disco RS-DOS já carregado, o app oferece **recriar a imagem no novo nº de
> trilhas mantendo os arquivos** (modal "Recriar imagem em 35T/40T?"). Se algum arquivo não couber no novo
> formato, **nada é alterado**. A operação fica **não salva** — use "Salvar" depois.

> **Seletor de plataforma-alvo (CoCo / Dragon), na barra global do topo:** define o **padrão** do "Novo
> disco", a **máquina do XRoar** e o **formato do Greaseweazle**. Discos que você **abre** continuam
> respeitando o **formato real** deles.

### Arrastar do Windows
Solte um `.dsk`/imagem sobre o painel para **abrir**; solte um `.bin/.bas/.cas` para **injetar**; solte um
arquivo num **painel vazio** e ele cria um `.dsk` novo já com aquele arquivo dentro.

---

## 3. A lista de arquivos — o que cada coluna diz

Para cada arquivo: **Nome**, **Tipo** (BASIC / DADOS / MÁQUINA / FONTE), **Tamanho**, **Grân.** (quantos
granules ocupa), **Trilhas** (em quais trilhas está, em faixas tipo "0-2, 4") e **Formato**.

- **Selecionar:** clique numa linha (fica laranja). **Shift+clique** seleciona um **intervalo** (a partir
  da última âncora); **Ctrl+clique** **liga/desliga** arquivos avulsos (multi-seleção esparsa). Assim você
  copia/exclui/extrai vários de uma vez.
- **Duplo-clique:** monta o disco no XRoar e **roda** o arquivo na hora — `RUN` para BASIC, `LOADM/EXEC`
  para máquina. A máquina do emulador acompanha o formato (CoCo/Dragon).
- **Arrastar a linha para o outro painel:** copia (com **Ctrl**) ou move (com **Shift**) o arquivo de A↔B.
- **Alça ⠿ (esquerda):** arraste para o **Windows Explorer** e o arquivo é **extraído** (arraste nativo do
  sistema) para a pasta — funciona mesmo num contêiner (o disco daquele momento é capturado no início do
  arraste).

> A coluna **Grân.** mostra o nº de granules (RS-DOS) **ou** "Ns" = nº de setores (Dragon). A coluna
> **Trilhas** lista as trilhas ocupadas em faixas (ex.: "0-2, 4").

---

## 4. Barra de ferramentas — cada botão e o que entrega

> Os botões de **arquivo selecionado** (Copiar, Renomear, Excluir, ver .BAS, comparar, converter) só
> aparecem quando há pelo menos um arquivo selecionado.

- **Injetar** — escolhe um arquivo do PC (`.bin/.bas/.cas`) e o adiciona ao disco ativo. Um `.cas` é
  interpretado: cada programa da fita vira um arquivo (ML → `.BIN` com preâmbulo LOADM; BASIC → `.BAS`;
  dados → `.DAT`).
- **Copiar / Colar** — área de transferência de **arquivos**. **Copiar** (botão ou **Ctrl+C**) leva os
  selecionados para a memória; **Colar** (botão ou **Ctrl+V**, só aparece quando há algo copiado) grava-os
  no painel ativo (no mesmo disco ou no outro). **Recortar** **não** tem botão na barra — use **Ctrl+X**
  (ou arraste a linha com **Shift**): a origem é removida **após** colar/soltar. Um indicador **📋 nome ✂**
  no fim da barra lembra o que está na área de transferência (o ✂ marca um recorte).
- **Renomear** (1 selecionado, ícone de lápis) — abre um modal com os campos **NOME (8)** e **EXT (3)**.
  Só a entrada de diretório muda; os dados ficam no lugar.
- **Excluir** (ou tecla **Delete**) — apaga os selecionados e libera os granules.
- **Visualização rápida .BAS** (lupa) — abre um **visualizador somente-leitura** que **detokeniza** o
  BASIC na hora, sem sair da aba. Ótimo para espiar um programa antes de extrair.
- **Editar .BAS** — manda o `.BAS` (em ASCII) para a **aba BASIC** para edição completa.
- **Extrair para o PC** (seta para baixo) — salva o(s) arquivo(s) selecionado(s) numa pasta do Windows.
- **Comparar** (1 selecionado) — abre um **diff hexadecimal** entre o arquivo do disco e um arquivo do PC:
  diz se são **idênticos** ou mostra quantos bytes diferem, a 1ª diferença e os trechos divergentes em
  vermelho. Use para conferir gravações/conversões.
- **Converter para Dragon** (1 `.BIN` de máquina, em disco não-Dragon; ícone ciano de setas) — abre um modal
  para converter o binário CoCo para Dragon. Você escolhe **Carga direta** (carrega no mesmo endereço do
  CoCo) ou **Com relocador** (carrega baixo em `0x0C00` e um stub copia + executa) — o app **marca o modo
  recomendado** pelo endereço de carga. O resultado vai para um **disco Dragon novo no outro painel**; teste
  com "Testar Painel" antes de salvar. (Jogos reescritos para Dragon não convertem byte-a-byte.)
- **Ordenar A-Z** — alfabetiza o diretório do disco ativo. **Ordenar Todos** (só em contêineres) — ordena
  todos os discos do contêiner (pulando discos de arte).
- **Copiar Painel A → B** — duplica o disco ativo de A para B como `.dsk` avulso.
- **Desfazer / Refazer** (**Ctrl+Z** / **Ctrl+Y**) — desfaz/refaz as últimas edições (insere, exclui,
  renomeia, defrag, colar…). A pilha restaura os **dois painéis**.
- **Salvar / Salvar Como** — veja a seção 8.
- **Testar Painel** — monta o disco no XRoar (drive 0). Veja a seção 9.
- **Gravar GW** — grava o disco num disquete físico. Veja a seção 10.
- **?** (Ajuda) — este manual.

---

## 5. Navegar contêineres (milhares de discos)

Ao abrir um contêiner (DriveWire/MiniIDE/CoCoSDC), o painel ganha um seletor de disco:

- **◀ ▶** e um **campo numérico** (nº físico do drive, 000–255) para pular direto.
- **🔎 Buscar disco** — abre um navegador que pesquisa por **nome do disco OU nome de arquivo** (ele indexa
  os arquivos para você achar onde está um programa). Clique no resultado para abri-lo no painel.
- **Inserir disco** (CoCoSDC) — grava um `.dsk/.os9` novo dentro do cartão FAT (com confirmação, pois é
  mídia real).
- **OS-9 · {volume}** — abre a partição OS-9 do contêiner na aba OS-9 (somente-leitura por segurança).
- **Nomear/Renomear** (MiniIDE) — dá/edita o nome de catálogo SIDEKICK do drive.

Cada disco é lido **sob demanda** — abrir um contêiner de gigabytes é instantâneo. Ao abrir um contêiner
grande aparece uma **barra de progresso** ("Analisando discos…" / "Lendo diretório FAT…").

### Janela "Buscar disco" por dentro
- Campo de busca casa por **nº/nome/sub-rótulo do disco** e por **nome de arquivo** (com um indicador
  "Indexando arquivos X/Y…" enquanto o índice é montado). Quando o acerto vem de um arquivo, ele aparece
  como **"↳ nome.ext"** sob o disco.
- Cada item mostra o **nº físico (#000)**, o rótulo, um ícone **🎨** se for disco de arte e um contador
  **mostrando/total**. A lista exibe até **500** itens — refine a busca se passar disso. Clique para abrir.

### Estados especiais de um slot/disco
- **📭 Slot vazio** (CoCoSDC) — o slot 000–255 não tem disco. Botões **"Inserir imagem (.dsk)"** e
  **"Formatar"** aparecem na hora; use ◀ ▶ para passar pelos slots.
- **🚫 Disco em formato não suportado** — o disco do contêiner não é RS-DOS padrão (provável OS-9,
  dupla-face ou `.dsk` com cabeçalho JVC). Não é editável aqui; vá a outro disco com ◀ ▶ ou extraia este
  com **"Salvar Como"**.

---

## 6. Mapa do disco — ver a ocupação e a fragmentação

A coluna direita mostra o **prato do disco** em anéis concêntricos (trilha 0 = anel externo, cada fatia =
1 setor). O hub central mostra o **% cheio**.

Cores: **USO** (ciano) · **FRAG.** (vermelho, cadeia não-contígua) · **LIVRE** (cinza) · **DIR**
(diretório, roxo) · **SEL** (arquivo selecionado, laranja).

- Passe o mouse sobre uma célula: ela **acende todo o arquivo** e mostra um balão (nome, trilhas, granules,
  bytes, se está fragmentado). Clique para **selecionar** o arquivo.
- A barra de status traz **% de ocupação** e **% de fragmentação** do disco.

---

## 7. Desfragmentar (DEFRAG)

Arquivos espalhados em vários pedaços (fragmentados) deixam o disco mais lento no hardware real e aparecem
em vermelho no mapa.

- **DEFRAG** (disco todo) — abre um diálogo onde você escolhe a **ordem** final (manter a do diretório /
  alfabética / por tamanho) e roda uma **animação nostálgica de disquete** reorganizando tudo em blocos
  contíguos. É **não-destrutivo** (reescreve numa imagem nova; o painel fica "não salvo"). Dá para
  **cancelar no meio**: o app pergunta **"Finalizar o arquivo atual e parar"** (mantém o que já moveu, sem
  corromper) ou **"Cancelar tudo (descartar)"**. No fim mostra "Fragmentação X% → Y%" e quantos arquivos
  foram movidos / ficaram "sem espaço contíguo". Se o disco já está 0% fragmentado, o modal só avisa que não
  há o que otimizar.
- **DEFRAG ARQ.** — desfragmenta só o arquivo selecionado (precisa de um vão contíguo livre; desabilitado
  se o arquivo já está contíguo ou no Dragon).

(No Dragon a desfragmentação é sempre do disco inteiro.)

---

## 8. Salvar o seu trabalho

O botão **Salvar** fica **amarelo com um ponto** quando há alterações não salvas.

- **Salvar** — sobrescreve o arquivo de origem (sem diálogo). Em contêiner MiniIDE/CoCoSDC, pede
  confirmação porque grava **na mídia real**. Disco novo sem caminho → cai em "Salvar Como".
- **Salvar Como** — grava um novo arquivo. Os tipos oferecidos dependem do disco:
  - **Dragon:** `.vdk` (nativo) ou `.dsk` (raw).
  - **RS-DOS único:** `.dsk` ou **`.sdf` (CoCoSDC)**.
  - **Contêiner:** `.dsk` (o disco atual avulso).

### Formatar (coluna esquerda, ícone de disco)
Apaga o disco do painel. **Rápida** = limpa só o diretório/FAT (instantânea; dá para "recuperar" dados
antigos com ferramentas externas). **Completa** = zera tudo com `0xFF`.

---

## 9. Testar no XRoar (sem gravar nada)

**Testar Painel** monta o disco do painel ativo no **drive 0** do emulador embutido. Você escolhe **Testar
sem reset** (troca o disco ao vivo, mantém o que roda) ou **Reset e testar** (boot limpo). A máquina do
XRoar acompanha o formato (Dragon → Dragon; CoCo → CoCo). Para rodar um arquivo específico, dê
**duplo-clique** nele (faz `RUN`/`LOADM:EXEC` automaticamente).

**Resultado:** você valida o disco/programa na hora, sem mídia física.

---

## 10. Gravar em disquete real (Greaseweazle)

**Gravar GW** envia o disco do painel ativo para a aba **GW** e o grava num disquete físico (precisa da
placa Greaseweazle). O app já escolhe o **formato** certo pelo conteúdo do disco. Confirme no aviso e
acompanhe o mapa de trilhas na aba GW. Detalhes na Ajuda da aba GW.

---

## 11. Editor hexadecimal + Desassemblador 6809

O botão **HEX/DISASM** fica na **barra global do topo** (à direita das abas) e fica **verde** quando o modal
está aberto. Com um arquivo selecionado na lista, ele abre — lado a lado — um **editor hexadecimal** e um
**desassemblador 6809** desse arquivo. É a ferramenta para estudar e ajustar binários ML.

**Editor hex:**
- Escolha **8/16/24 colunas** e o **modo de caracteres**: **VDG verde** (maiúsculas verdes, minúsculas em
  vídeo invertido e os bytes ≥ 128 desenhados como **semigráficos 2×2** do VDG) ou **ASCII padrão**.
- **Buscar** por hex (`1A 50` / `1A50`) ou por texto, com contador **N/total** e navegação ◀ ▶ entre as
  ocorrências (que ficam realçadas).
- **Editar:** clique numa célula e digite em **HEX** (nibble alto, depois baixo — avança sozinho) ou em
  **ASCII** (uma tecla por byte); as **setas** navegam e **ESC** sai da seleção. O rodapé mostra
  **deslocamento**, **endereço ROM** e o **valor** do byte.
- A divisória vertical entre o hexa e o disasm é **arrastável** (redimensiona os dois painéis).
- **Salvar Alterações** regrava o arquivo no disco (com suporte a Desfazer); **Cancelar/Fechar** descarta.

**Desassemblador 6809** (painel à direita):
- **Origem $** — o endereço de carga onde o código começa (vem do `.BIN`).
- **Seguir fluxo** (ligado) — segue a execução a partir do ponto de entrada e separa **código** de
  **dados/strings** (FCB/FCC); desligado faz desmontagem **linear**. O rodapé informa quanto do arquivo
  virou código.
- **Marcar seleção** (selecione um intervalo no hexa com clique + shift-clique): force-o como **Dados**,
  **Código**, **C-vetor** (tabela de endereços de código, seguidos) ou **D-vetor** (tabela de ponteiros de
  dados). **Limpar** remove as marcas. As marcas **persistem por arquivo** entre sessões.
- Resolve símbolos de hardware do CoCo (PIA, GIME, MMU, SAM, paleta, vetores), labels nos desvios e o
  registrador DP. É somente-leitura (texto selecionável para copiar).

---

## 12. Discos de "arte" (somente-leitura)

Discos cujo diretório usa **caracteres semigráficos** (desenho no DIR) abrem em **somente-leitura**: você
**lista e extrai** normalmente, mas a edição fica bloqueada para não embaralhar a arte (selo "🎨 arte ·
🔒 leitura").

---

## 13. Atalhos de teclado (na aba DSK)

**Ctrl+C** copiar · **Ctrl+X** recortar (não há botão na barra) · **Ctrl+V** colar · **Delete** excluir ·
**Ctrl+Z** desfazer · **Ctrl+Y** (ou **Ctrl+Shift+Z**) refazer. Na lista: **clique** seleciona,
**Shift+clique** = intervalo, **Ctrl+clique** = liga/desliga avulsos, **duplo-clique** roda no XRoar.
**Arrastar** linha entre painéis: **Ctrl** = copiar, **Shift** = mover; **alça ⠿** arrasta para fora (PC).

---

## 14. Fluxos práticos (do começo ao fim)

- **Montar um disco de jogos:** Novo (CoCo 35T) → Injetar/arrastar os `.bin/.bas` → Ordenar A-Z → DEFRAG →
  Testar Painel → Salvar Como `.dsk`.
- **Copiar um programa de um disco para outro:** abra os dois discos (A e B) → selecione o arquivo em A →
  arraste para B (ou Ctrl+C / clique em B / Ctrl+V) → Salvar.
- **Tirar um arquivo do disco para o PC:** selecione → Extrair (ou arraste a alça ⠿ para o Explorer).
- **Conferir se uma gravação saiu certa:** selecione o arquivo → Comparar → escolha o arquivo do PC →
  veja "IDÊNTICOS" ou o diff.
- **Achar um programa num cartão CoCoSDC enorme:** abra o contêiner → 🔎 Buscar disco → digite o nome do
  programa → clique no resultado.
- **Pôr um disco real no PC:** aba GW → Ler → Painel A; **gravar um disco no disquete:** Gravar GW.

---

## 15. Observações importantes
- RS-DOS/DECB é **single-side** (160K/35T ou 180K/40T). Discos de **dois lados** geralmente são **OS-9**
  (aba OS-9) ou contêineres.
- Um disco "não suportado/ilegível" costuma ser **OS-9, dupla-face ou com cabeçalho (JVC)** — se for OS-9,
  o app oferece abri-lo na **aba OS-9**; use ◀▶ ou "Salvar Como" para extrair os dados.
