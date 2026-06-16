# Aba Servidores (FujiNet WiFi + DriveWire serial)

A aba **Servidores** liga o app ao CoCo/Dragon — por **WiFi** (FujiNet/TNFS) e por **cabo serial** (DriveWire).
Ela tem **três painéis**, lado a lado (com **splitters** arrastáveis entre eles):

- **Esquerda — Acessar servidores:** **baixar** imagens/arquivos de **links** e de **hubs TNFS** para dentro
  do app (e então editar/converter como qualquer outra imagem).
- **Meio — Servidor WiFi (FujiNet):** transformar o seu PC num **servidor de arquivos** que a sua placa
  **FujiNet** monta ao vivo pela **rede**.
- **Direita — Servidor DriveWire (serial):** servir até **4 drives** a um CoCo real por **cabo serial** (sem WiFi).

Todas as mensagens de conexão/erro saem no **console** (rodapé), igual às outras abas. O botão **?** (canto
superior direito) reabre esta ajuda.

No **topo da aba** ficam dois **HUBs** que agem sobre o **arquivo que você baixar** de um servidor (cliente da
esquerda):
- **Enviar para…** — escolhe **para onde mandar** o disco baixado: **Painel DSK** (se for **RS-DOS**), **Aba
  OS-9** (se for **OS-9/NitrOS-9**), **XRoar** (testar no emulador) ou um **drive do DriveWire** (seletor **D0–D3**).
- **Salvar arquivo…** — **grava** o disco baixado: **Salvar no PC** (diálogo livre) ou **Salvar e apontar no
  Wi-Fi** (cai na pasta servida pelo Servidor WiFi, e a FujiNet já o enxerga).

> Selecione um arquivo na listagem (**1 clique**) e use um dos HUBs; **duplo-clique** abre o **Enviar para…**
> **na hora**. **O arquivo só é baixado quando você escolhe o destino** dentro do HUB — então o **tipo do disco**
> (OS-9 × RS-DOS × contêiner) só é detectado nesse momento (antes disso, todas as opções ficam ativas).

> A placa FujiNet conversa com o **CoCo** e com a **Internet** — o papel do app é ser **origem/servidor de
> imagens**, não "driver" da placa.

---

## LADO ESQUERDO — Acessar servidores

São duas formas de trazer imagens de fora: a **nativa do FujiNet** (TNFS, em cima) e a **manual** (URL, embaixo).

### 1) Servidores TNFS (hubs FujiNet)

A forma "FujiNet" de acessar arquivos pela rede (TNFS é **UDP, porta 16384**). Cada controle do bloco:

- **Dropdown "— escolher servidor —":** lista pronta com dois grupos:
  - **Meus servidores** — seus **favoritos** salvos.
  - **Comunidade (ao vivo)** — buscada da lista pública `fujinet.online/tnfs-server-status`. Servidores com
    **UDP fora** aparecem como "(UDP fora)" e **desabilitados** (o TNFS é UDP; sem UDP não dá para listar).
  - Escolher um item **conecta na hora** (usando a pasta inicial do favorito, se houver).
- **Botão "Gerenciar" (★):** abre o **modal de favoritos** (detalhado mais abaixo).
- **Campo de host:** digite o endereço do servidor (ex.: `tnfs.fujinet.online`, ou um IP/host na sua rede).
  **Enter** já conecta.
- **Botão ★ (estrela, ao lado do host):** **salva o host atual** nos favoritos (fica dourado quando o host já
  é favorito).
- **Botão "Conectar":** abre a listagem do servidor. Fica **laranja com animação** enquanto procura e **verde**
  quando conectado.
- **Botão "Desconectar" / "Interromper":** se estiver **conectando**, vira **"Interromper"** e **cancela de
  verdade** a tentativa (fecha o socket, não espera os ~12 s de retransmissão de um servidor fora do ar). Se já
  estiver conectado, vira **"Desconectar"** e **limpa a listagem** (o TNFS é por-operação; não há conexão presa).

**Navegando a listagem (depois de conectar):**
- **Barra de caminho** com o botão **↑** (subir um nível) e o caminho atual.
- **Pastas** (ícone roxo) — clique para **entrar**.
- **Arquivos** — **1 clique seleciona**; **duplo-clique** abre o HUB **Enviar para…** **na hora**. O tamanho
  aparece em **KB** à direita. Com um arquivo selecionado, os botões **Enviar para…** / **Salvar arquivo…** do
  topo abrem o HUB imediatamente; o **download** só ocorre ao escolher o destino.
  - O **destino** é escolhido no HUB conforme o **tipo**: **RS-DOS** → Painel DSK; **OS-9** → aba OS-9; ou
    **DriveWire** (qualquer um, gravando numa pasta e montando no drive escolhido).
  - **`.zip`** é descompactado na hora (veja "Abrir por URL") e o conteúdo cai no mesmo HUB.
  - **Download grande:** o TNFS transfere **512 bytes por ida-e-volta**, então arquivos grandes demoram. Acima
    de **4 MB** o app **pede confirmação** antes (imagens desse tamanho costumam ser cartões CoCoSDC, não
    disquetes). Durante o download aparece uma **barra de progresso** (KB e %) com botão **Cancelar**.

> Ex.: `tnfs.fujinet.online` → pasta **COCO** → `news.dsk` / `weather.dsk` / `wiki.dsk`…

### 2) Modal "Gerenciar" (favoritos + comunidade)

Aberto pelo botão **Gerenciar (★)**. Tem três áreas:

- **Adicionar servidor:** campos **host** (obrigatório), **rótulo** (opcional, nome amigável) e **pasta inicial**
  (opcional, ex.: `/COCO`) + botão **Adicionar**.
- **Lista de favoritos:** cada item tem o nome (rótulo/host + pasta) com botão para **conectar** e a **lixeira**
  para **remover**.
- **Comunidade (ao vivo):** botão **Atualizar** rebusca a lista pública; cada servidor mostra **UDP ✓/✗**, um
  botão para **conectar** (desabilitado se UDP fora) e a **★** para **salvar nos favoritos**.

> **Por que não vejo os mesmos servidores da minha placa FujiNet?** O app não lê a configuração da placa (ela
> fala com o CoCo + Internet, não com o PC). Para acessar outro servidor, **digite o host** dele (ou salve nos
> favoritos). O **SD da própria placa** não é acessível pela rede; servidores com **login** (usuário/senha)
> ainda não são suportados.

### 3) Abrir por URL (HTTP/HTTPS)

Conveniência genérica, abaixo do bloco TNFS:

- **Campo de URL:** cole um **link** direto de um `.dsk/.vdk/.sdf/.os9/.dmk/.jvc/.img/.vhd/.ccc/.cas/.bin/.rom`…
  (ou um **`.zip`** contendo um deles). **Enter** ou o botão **Abrir** baixam.
- **Botão "Abrir":** baixa o arquivo (segue redirecionamentos, tempo limite ~30 s, até ~64 MB) e abre o HUB
  **Enviar para…** (igual ao cliente TNFS) — dali você escolhe o destino conforme o tipo (Painel DSK / aba OS-9
  / DriveWire). Aberto no painel, segue o pipeline normal: editar, injetar, converter, mapa de disco, XRoar, GW.

> **Arquivos `.zip` (ex.: Color Computer Archive):** o app **descompacta automaticamente**. Se o ZIP tiver
> **uma** imagem reconhecível, ela vai para o HUB; se tiver **várias**, aparece um **seletor** para escolher qual.

### 4) HUBs do topo — "Enviar para…" e "Salvar arquivo…"

O HUB **abre na hora** (sem esperar download). O arquivo só é **baixado ao escolher o destino**; aí o **tipo** é
detectado (OS-9 × RS-DOS × contêiner) e, se você reabrir o HUB, só as opções compatíveis ficam habilitadas.

**Enviar para…** (também pelo **duplo-clique** no arquivo):
- **Painel DSK** — baixa e abre no painel (gateado para **RS-DOS** depois de conhecido o tipo).
- **Aba OS-9** — baixa e abre **editável** na aba OS-9 (gateado para **OS-9/NitrOS-9**; mostra o volume).
- **XRoar** — baixa e **monta no emulador** (drive 0, com **reset**/boot limpo). Um `.vdk` ajusta a máquina p/ Dragon.
- **DriveWire** — escolha o **drive D0–D3** e clique **Enviar**. **Primeiro a pasta**: se o **Servidor WiFi** já
  tem uma **pasta** definida, grava **nela**; senão o app **pede uma pasta** — que então **vira a pasta servida**
  por Wi-Fi. Depois baixa o disco, **grava na pasta** e **monta** no drive (a FujiNet também passa a ver).

**Salvar arquivo…** (1 clique seleciona → botão):
- **Salvar no PC** — baixa e abre o diálogo livre; salve onde quiser.
- **Salvar e apontar no Wi-Fi** — grava o disco e **aponta o Servidor WiFi** para ele:
  - **Disco simples** → cai na **pasta servida** (a já definida, ou uma que você escolher).
  - **Contêiner** (MiniIDE/CoCoSDC/DriveWire) → é apontado como **arquivo Container** (cada disco interno vira um
    `.dsk` para a FujiNet).

---

## LADO DIREITO — Servidor WiFi de arquivos

O app vira um **servidor TNFS** (UDP **16384**) que a sua **FujiNet** monta ao vivo — você edita/organiza aqui
e o **CoCo vê na hora**, sem disquete nem reflash. Compatível com o **navegador de arquivos da FujiNet real**
(implementa os comandos de diretório estendidos que o firmware usa).

### Bloco "Configurações" — cada controle

1. **Origem (Pasta / Container):**
   - **Pasta** — serve uma pasta do PC com vários arquivos.
   - **Container** — serve um `.img/.vhd/.dsk` de **MiniIDE / CoCoSDC / DriveWire**; **cada disco interno** é
     exposto como um `.dsk` separado.
2. **Campo de caminho (digitável, com histórico):** um **único** campo onde você **cola/digita** o caminho
   **ou** escolhe um **recente** pela setinha do dropdown (os recentes ficam guardados entre sessões). O botão
   de **pasta** ao lado abre o **seletor do sistema** (pasta no modo Pasta, arquivo no modo Container). Escolher
   um recente de outro modo **troca o modo** automaticamente.
3. **Acesso (Só leitura / Ler-escrever):**
   - **Só leitura** (padrão) — o CoCo só lê.
   - **Ler-escrever** — o CoCo pode **criar/sobrescrever** arquivos reais. *Disponível só no modo **Pasta***
     (Container é sempre só leitura).
4. **Botão "Ocultar arquivos da FujiNet":** abre o gerenciador dos arquivos que **não** são enviados à FujiNet
   (veja abaixo). Só aparece no modo **Pasta**.
5. **Linha "Porta":** lembra que é **16384 (UDP)** e o modo de acesso atual.
6. **Botão "Ligar servidor" / "Desligar servidor":** liga/desliga o servidor. Quando ligado, surge o selo
   **"no ar"** no topo do bloco.
7. **Libere a porta no firewall** (passo essencial, abaixo).

### Liberar a porta no firewall (essencial)

Para a FujiNet **acessar o servidor**, o **firewall do Windows precisa permitir a UDP 16384**. Sem isso, mesmo
com o IP certo, a placa **não conecta** (ou conecta e não lista). Libere a **UDP 16384** para os perfis
**Pública E Privada** (a WiFi às vezes é classificada como "Pública"). Se a conexão falha **só na WiFi**, quase
sempre é o perfil do firewall.

### Quadro verde (com o servidor ligado) — qual IP usar

Ao ligar, aparece um **quadro verde** com o(s) **IP(s)** do PC e a porta. Para cada IP há um botão **copiar**.
Ponha o IP num **host slot** da sua FujiNet.

- Se o PC tem **mais de uma rede** (ex.: cabo **e** WiFi), o quadro lista todos e **destaca** o que tem o selo
  **"rede ✓"** — é a interface com **saída para a rede** (rota default), a única que a FujiNet realmente
  alcança. **Use esse.** Os demais ficam esmaecidos (selos "WiFi"/"cabo").
- A FujiNet e o PC precisam estar na **MESMA rede** (mesmo roteador/sub-rede). Um IP de uma WiFi **sem gateway**
  (ex.: um `192.168.137.x` de Hotspot do Windows) **não funciona** — por isso ele **não** recebe o selo "rede ✓".
- **Firewall do Windows:** libere a **UDP 16384** para os perfis **Pública E Privada** (a WiFi às vezes é
  classificada como "Pública"). Se a conexão falha só na WiFi, quase sempre é o perfil do firewall.

### Bloco "Arquivos compartilhados"

Lista (com contagem) o que **será/está sendo** servido — atualizada ao escolher a pasta/container, **antes mesmo
de ligar** o servidor, para você conferir.

> **Arquivos de sistema são ocultados automaticamente.** O servidor **não transmite** `desktop.ini`, `Thumbs.db`,
> `.DS_Store` e outros arquivos de sistema do **Windows, macOS e Linux** (e dotfiles que começam com "."). Sem
> isso, a FujiNet às vezes auto-selecionava o `desktop.ini` em vez do disco. Esses arquivos não aparecem na lista
> nem podem ser baixados.

### Gerenciar "Ocultar arquivos da FujiNet" (botão)

O botão **Ocultar arquivos da FujiNet** (modo Pasta) abre um gerenciador com três partes:
- **Padrões fixos** — a lista embutida (Windows · macOS · Linux) + tudo que começa com ".". Não editável.
- **Também ocultar (seus padrões)** — adicione **mais** nomes/padrões a esconder. Aceita **curingas** `*` e `?`
  (ex.: `*.tmp`, `~$*`, `leiame.txt`).
- **Nunca ocultar (exceções)** — termos que **devem aparecer** mesmo que casem com um padrão fixo (úteis se algo
  embutido atrapalhar). A exceção **vence** o padrão.

As mudanças são **salvas** e valem ao **(re)ligar** o servidor; a prévia de "Arquivos compartilhados" já reflete
o filtro na hora.

### Ler-escrever (gravar a partir do CoCo)

No modo **Pasta** + **Ler-escrever**, o CoCo real pode **criar** e **sobrescrever** arquivos de verdade na
sua pasta (ex.: `SAVE`, gravar um setor de uma imagem montada como drive). Cuidados:
- **Um cliente por vez** é o uso seguro (não há trava de concorrência).
- A gravação é **lenta** (512 bytes por ida-e-volta, igual à leitura) — ótima para arquivos pequenos.
- **Container é sempre só leitura** (gravar dentro de uma imagem MiniIDE/CoCoSDC/DriveWire exigiria
  remapear setores com risco de corromper — fica para uma fase futura).
- A gravação só é confirmada quando o CoCo **fecha** o arquivo; as mensagens de gravação saem no **console**.

---

## Persistência, console e limites

- **Persistência:** favoritos, último host, origem do servidor (pasta/container), caminho, modo de acesso e as
  **pastas recentes** são **lembrados** entre sessões. A aba fica sempre montada → a listagem/caminho **sobrevivem
  à troca de aba**.
- **Console (rodapé):** acompanha downloads, conexões de clientes ao seu servidor, gravações e erros.
- **Ainda não suportado:** login TNFS (usuário/senha), acesso ao **SD da própria placa**, e **escrita em
  container** (MiniIDE/CoCoSDC/DriveWire).

## Servidor DriveWire (serial)

A terceira coluna, **DriveWire**, transforma o PC num **servidor de disco por CABO SERIAL** — o transporte
nativo do CoCo, sem WiFi. O CoCo real (com a ROM **HDB-DOS/DriveWire** do seu modelo) lê até **4 drives**
(0–3) direto do PC. Ótimo para **testar ao vivo** uma imagem que você acabou de editar, sem regravar cartão.

- **Conexão (colapsável):** escolha a **Porta** serial (o adaptador USB-serial aparece como COMx) e a
  **Máquina** — **CoCo 1** (38400 baud), **CoCo 2** (57600) ou **CoCo 3** (115200; exige 1.78 MHz). Use
  **Personalizado** para outros bauds (até 921600). O baud precisa **casar com a ROM** do CoCo. Depois de
  definir, clique no cabeçalho para **colapsar** e dar espaço aos drives.
- **Os 4 drives:** cada drive 5.25" recebe um `.dsk` — **arraste** um arquivo sobre o drive **ou clique** para
  escolher. A etiqueta mostra o **nome e as informações** do disco. **Dentro** do drive: o **⟳ recarregar** relê
  o `.dsk` **da origem no disco** (reflete edições feitas no arquivo) — com o **servidor no ar** o CoCo passa a
  ler a versão nova no próximo acesso, sem desligar; a **lista** mostra os arquivos, o **cadeado** alterna
  **leitura-escrita / só-leitura** e a **seta** **ejeta** o disco. O **LED** acende (verde) quando há disco e
  **pulsa** com o servidor no ar.
- **Ligar servidor:** com a porta escolhida e ao menos um disco montado, clique **Ligar servidor**. Ligue o
  cabo, dê **boot** no CoCo (com a ROM DriveWire) e ele lerá os drives do PC. As conexões saem no console.
- **No CoCo:** é preciso a ROM **HDB-DOS/DW** do modelo (a velocidade casa com ela) e o cabo serial. Quem tem
  **FujiNet** já consegue o mesmo por **WiFi** (coluna do meio) — o DriveWire é para quem usa **cabo**.

## Resumo rápido

- **Baixar e usar:** Abrir por URL / hub TNFS → o HUB **Enviar para…** abre → escolha Painel DSK / aba OS-9 /
  DriveWire (ou **Salvar arquivo…** → PC / pasta Wi-Fi).
- **Servir para a FujiNet:** escolher pasta/container → (opcional) **Ler-escrever** → **Ligar servidor** →
  copiar o IP **"rede ✓"** → pôr num **host slot** da FujiNet (porta 16384/UDP) → liberar a UDP 16384 no firewall.
