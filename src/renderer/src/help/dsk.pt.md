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

**Resultado:** você enxerga dois discos ao mesmo tempo e move arquivos entre eles arrastando.

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

### Arrastar do Windows
Solte um `.dsk`/imagem sobre o painel para **abrir**; solte um `.bin/.bas/.cas` para **injetar**; solte um
arquivo num **painel vazio** e ele cria um `.dsk` novo já com aquele arquivo dentro.

---

## 3. A lista de arquivos — o que cada coluna diz

Para cada arquivo: **Nome**, **Tipo** (BASIC / DADOS / MÁQUINA / FONTE), **Tamanho**, **Grân.** (quantos
granules ocupa), **Trilhas** (em quais trilhas está, em faixas tipo "0-2, 4") e **Formato**.

- **Selecionar:** clique numa linha (fica laranja). **Shift+clique** seleciona um intervalo; assim você
  copia/exclui vários de uma vez.
- **Duplo-clique:** monta o disco no XRoar e **roda** o arquivo na hora — `RUN` para BASIC, `LOADM/EXEC`
  para máquina. A máquina do emulador acompanha o formato (CoCo/Dragon).
- **Alça ⠿ (esquerda):** arraste para o **Windows Explorer** e o arquivo é **extraído** para a pasta.

---

## 4. Barra de ferramentas — cada botão e o que entrega

> Os botões de **arquivo selecionado** (Copiar, Renomear, Excluir, ver .BAS, comparar, converter) só
> aparecem quando há pelo menos um arquivo selecionado.

- **Injetar** — escolhe um arquivo do PC (`.bin/.bas/.cas`) e o adiciona ao disco ativo. Um `.cas` é
  interpretado: cada programa da fita vira um arquivo (ML → `.BIN` com preâmbulo LOADM; BASIC → `.BAS`;
  dados → `.DAT`).
- **Copiar / Recortar / Colar** — área de transferência de **arquivos**. **Copiar** (ou **Ctrl+C**) /
  **Recortar** (**Ctrl+X**) leva os selecionados para a memória; **Colar** (**Ctrl+V**) grava-os no painel
  ativo (no mesmo disco ou no outro). Recortar remove da origem **após** colar.
- **Renomear** (1 selecionado) — muda NOME (8) e EXT (3). Só a entrada de diretório muda; os dados ficam.
- **Excluir** (ou **Delete**) — apaga os selecionados e libera os granules.
- **Visualização rápida .BAS** (lupa) — abre um **visualizador somente-leitura** que **detokeniza** o
  BASIC na hora, sem sair da aba. Ótimo para espiar um programa antes de extrair.
- **Editar .BAS** — manda o `.BAS` (em ASCII) para a **aba BASIC** para edição completa.
- **Extrair para o PC** (seta para baixo) — salva o(s) arquivo(s) selecionado(s) numa pasta do Windows.
- **Comparar** (1 selecionado) — abre um **diff hexadecimal** entre o arquivo do disco e um arquivo do PC:
  diz se são **idênticos** ou mostra quantos bytes diferem, a 1ª diferença e os trechos divergentes em
  vermelho. Use para conferir gravações/conversões.
- **Converter para Dragon** (1 `.BIN` de máquina, em disco não-Dragon) — converte o binário CoCo para
  Dragon (carga direta ou com relocador) e joga o resultado num disco Dragon novo no outro painel.
- **Ordenar A-Z** — alfabetiza o diretório do disco ativo. **Ordenar Todos** — ordena todos os discos de
  um contêiner (pulando discos de arte).
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

Cada disco é lido **sob demanda** — abrir um contêiner de gigabytes é instantâneo.

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
  **cancelar no meio** mantendo o resultado parcial. No fim mostra "Fragmentação X% → Y%".
- **DEFRAG ARQ.** — desfragmenta só o arquivo selecionado (precisa de um vão contíguo livre).

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

O botão **HEX/DISASM** (topo) abre, lado a lado, um **editor hexadecimal** e um **desassemblador 6809**
do arquivo selecionado — a ferramenta para estudar e ajustar binários ML.

**Editor hex:**
- Escolha **8/16/24 colunas** e o **modo de caracteres** (VDG verde com minúsculas invertidas, ou ASCII).
- **Buscar** por hex (`1A 50`) ou texto, com navegação ◀ ▶ entre ocorrências.
- **Editar:** clique numa célula e digite em HEX (nibble a nibble) ou em ASCII; as setas navegam. O rodapé
  mostra deslocamento, endereço ROM e valor. **Salvar Alterações** regrava o arquivo no disco (com Desfazer).

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

**Ctrl+C** copiar · **Ctrl+X** recortar · **Ctrl+V** colar · **Delete** excluir · **Ctrl+Z** desfazer ·
**Ctrl+Y** (ou **Ctrl+Shift+Z**) refazer. **Arrastar** linha entre painéis: **Ctrl** = copiar, **Shift** =
mover.

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
