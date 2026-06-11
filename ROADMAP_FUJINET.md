# Roadmap 2 — FujiNet / TNFS (implementação FUTURA)

> Status: **implementação futura** — registrado com os achados da pesquisa e o escopo
> que isolamos. Não bloqueia o roadmap OS-9.

> ## STATUS ATUAL — 2026-06-10 (v1.0.59 + ajustes não commitados): CLIENTE e SERVIDOR COMPLETOS e VALIDADOS
> A aba **FujiNet / Online** (`FujiNetTab.tsx`) está madura: esquerda = **cliente** (acessar servidores),
> direita = **servidor WiFi**. Resumo do que está PRONTO:
>
> **CLIENTE (`src/main/net/tnfs.ts`):**
> - **M1a — Abrir por URL (HTTP/HTTPS)** + **ZIP automático** (leitor ZIP puro `converter/zip.ts`; 1 imagem→abre,
>   várias→seletor). OS-9 roteado p/ a aba OS-9.
> - **M1b — Cliente TNFS** (UDP 16384): MOUNT/UMOUNT/OPENDIR/READDIR/CLOSEDIR/STAT/OPEN/READ/CLOSE +
>   **OPENDIRX(0x17)/READDIRX(0x18)** (lista a pasta inteira com tamanho/tipo em 1 viagem; **fallback** p/
>   OPENDIR+STAT em servidores antigos) e **TELLDIR(0x15)/SEEKDIR(0x16)**. Navegar/baixar com cancelamento real
>   ("Interromper"). **Timeout de retransmissão ADAPTATIVO** (Jacobson/Karels: RTO=srtt+4×rttvar, teto 3 s, piso
>   500 ms) — antes era fixo 3 s e desperdiçava 3 s por pacote perdido em servidor rápido. Bloco de READ = 1024 B.
> - **Barra de progresso da LISTAGEM** (X/N itens, via o total do OPENDIRX; só aparece se passar de ~400 ms).
> - **Gestão de servidores:** dropdown favoritos (persistidos) + **comunidade ao vivo** (parse de
>   `fujinet.online/tnfs-server-status`, status UDP, fallback) + modal "Gerenciar". Aba SEMPRE MONTADA;
>   `cfg.fujinet` persiste favoritos/host/etc.
>
> **SERVIDOR (`src/main/net/tnfsServer.ts`):**
> - **M3 — Servidor TNFS** (UDP 16384): MOUNT/UMOUNT/OPENDIR/READDIR/CLOSEDIR/**OPENDIRX/READDIRX**/**TELLDIR/
>   SEEKDIR**/STAT/OPEN/READ/**WRITE**/CLOSE/**LSEEK** (LSEEK retorna a posição — exigido p/ versão >0x0100).
>   Provedores **folderProvider** (pasta) e **containerProvider** (MiniIDE/CoCoSDC-FAT/DriveWire → cada disco
>   interno como `.dsk`).
> - **ESCRITA em modo Pasta** (Leitura-escrita): o CoCo cria/sobrescreve arquivos reais (1 cliente por vez).
> - **Filtro de arquivos ocultos** (não envia desktop.ini/Thumbs.db/.DS_Store/lost+found/dotfiles… Win+mac+Linux),
>   **configurável** (botão "Ocultar arquivos da FujiNet": padrões fixos + adicionar/excluir com curingas).
> - **IP recomendado** = interface roteável (rota default), não a WiFi cega; quadro verde destaca o IP "rede ✓".
> - **Conveniências:** campo de pasta = combobox com **dropdown de recentes**; toggle Só-leitura/Ler-escrever.
>
> **CORREÇÕES-CHAVE contra a placa REAL (v1.0.57→.59):** (1) a placa lista via OPENDIRX/READDIRX → implementados
> no servidor; (2) a placa montava sempre o 1º arquivo → faltavam TELLDIR/SEEKDIR; (3) erro de I/O no DIR → o
> LSEEK precisava devolver a posição. Tudo validado por `tools/tnfsdirxtest.ts` (32/32) e no hub real.
>
> **AINDA PENDENTE:** **M2** "Enviar p/ dispositivo" (CoCoSDC=cópia p/ drive Windows; GW já existe; MiniIDE
> write-back+reflash); fluxo "baixar ARQUIVO avulso → INJETAR na imagem ativa"; **M4** (opc.) DriveWire serial
> (`serialport` = módulo nativo); **boot/validação REAIS na placa do usuário** (humano — em andamento, já lista,
> monta o arquivo certo e o DIR funciona após o fix do LSEEK).
>
> **DESCARTADO (2026-06-10):** **autenticação TNFS por usuário/senha** — a placa FujiNet REAL monta o nosso
> servidor de forma **anônima** sem problema, então o login por senha saiu do roadmap. O servidor continua
> ignorando os campos user/senha do MOUNT (anônimo). SD da placa também segue fora de escopo.

---

## Contexto isolado da pesquisa (o que descobrimos)

Fontes: manual *"FujiNet for CoCo — The Basics"* (Rich Stephens) + `FujiNetWIFI/fujinet-hardware/Coco`.

- **FujiNet SUPORTA CoCo oficialmente** (firmware nightly `fujinet-COCO`; hardware Rev000/0000;
  ROMs p/ CoCo 1/2/3 **e Dragon**). [Correção: pesquisa inicial via web estava desatualizada.]
- **Hardware/transporte:** cartucho (5V + **ROM que bootstrapa o HDB-DOS**) **+ cabo serial DIN-4**
  → fala o **protocolo DriveWire** (38.400–115.200 baud). Quem interpreta o disco é o CoCo (HDB-DOS).
- **Disco = `.DSK` padrão** (HDB-DOS = extensão do DECB; **OS-9 também monta**). "157k" = 35T
  (161.280) = nosso núcleo. 4 drive slots (0–3), R/O ou W.
- **8 host slots:** cada um = o **cartão SD** ("SD") **ou um servidor TNFS** (local ou remoto).
- **Confirmado no manual:** *"if you are running a tnfs file server on your local PC, you can usually
  use your PC's network name in a host slot."* → **o nosso PC pode ser o servidor TNFS da FujiNet.**
- **Hubs TNFS públicos:** `tnfs.fujinet.online/COCO/…` (NEWS/WEATHER/WIKI/NETCAT/LOBBY/jogos);
  lista em `fujinet.online/tnfs-server-status`.
- **TNFS:** protocolo simples sobre **UDP, porta 16384** (mount/dir/read/write).

**Conclusão estratégica:** o CoCoDCU vira uma **ponte de duas vias**, usando **`.DSK` padrão**
(que já dominamos) — sem o usuário precisar da placa FujiNet para o caminho "offline".

---

## Escopo / casos de uso
1. **Sem FujiNet (meio-termo):** baixar imagem online → manipular aqui → jogar no **CoCoSDC /
   MiniIDE / disquete** → usar no CoCo espetado, sem rede nem placa.
2. **Com FujiNet (bônus):** o app vira **servidor TNFS**; a FujiNet do usuário monta as imagens
   do PC ao vivo (host slot = IP do PC).

---

## Marcos / Plano de implementação (detalhado — 2026-06-09)

### Princípios
- **Toda a rede no processo MAIN** (Node: `dgram` UDP-TNFS, `https`/`http` download, `net`/`fs`); o renderer
  só fala por **IPC** (mesmo padrão de GW/FAT/OS-9). Renderer NUNCA abre socket cru.
- **Reaproveita 100% do pipeline:** toda imagem baixada passa por `normalizeDiskImage` + parse, cai num
  **painel A/B** e segue o `maybeRouteOs9` (OS-9 → aba OS-9). Editar/converter/mapa/GW já existem.
- **M1–M3 = só APIs nativas do Node → SEM módulo nativo → zero atrito de empacotamento.** Só o M4 (serial)
  traz dependência nativa (`serialport`), por isso fica por último/opcional.
- **UI mínima:** botão **"Abrir online"** (modal) na aba DSK + painel **"Servidor TNFS"** (Config/modal).
  Não criar aba nova de início. Nosso papel é ser **origem/servidor de imagens**, não "driver" da placa.

### M1 — Cliente: abrir imagens online (maior valor imediato)
**M1a. Download por URL (HTTP/HTTPS) — quick win**
- Main: `src/main/net/download.ts` + IPC `net-download-url(url)` (`https`/`http`, segue redirect, timeout,
  limite de tamanho, progresso no padrão `image-progress`).
- Renderer: modal "Abrir online" → colar URL → baixa → valida → `loadPaneFromBuffer` no painel ativo.
- Entrega: abrir `.dsk/.vdk/.ccc/.cas` de qualquer link. Esforço/risco: **baixo**.

**M1b. Cliente TNFS (UDP 16384) — núcleo do "cliente FujiNet"**
- Main: `src/main/net/tnfs.ts` com `dgram`. Sessão: header `u16 connId · u8 seq · u8 cmd`; **retransmissão
  com timeout/retries**. Comandos: `MOUNT`, `OPENDIR/READDIR/CLOSEDIR`, `STAT`, `OPEN/READ/CLOSE`
  (conferir opcodes na spec TNFS antes de codar; reimplementar limpo — `tnfsd` é referência, não copiar).
  Fluxo: `mount(host)` → `listDir(path)` → `readFile(path)` (loop de READ em blocos ~512 B → buffer).
- IPC/preload: `tnfsConnect(host)`, `tnfsList(path)`, `tnfsRead(path)`.
- Renderer: no modal, aba "TNFS": host (default `tnfs.fujinet.online`) + lista curada (de
  `fujinet.online/tnfs-server-status`), navegar pastas, escolher `.DSK` → painel.
- Esforço/risco: **médio** (robustez do UDP). Teste: `tools/tnfsprobe.ts` (monta/lista/baixa de
  `tnfs.fujinet.online/COCO` e de um `tnfsd` local), round-trip sem UI.

### M2 — "Enviar para dispositivo" (fecha a ponte offline, sem placa)
Botão **"Enviar p/ dispositivo"** no painel ativo:
- **CoCoSDC:** o cartão SD monta como **drive no Windows** → escolher pasta/drive → **cópia de arquivo** do
  `.dsk` (IPC `copy-to-path`). Não precisa de write-back FAT nem da placa.
- **Disquete (Greaseweazle):** **já existe** ("Gravar GW") — só listar como destino.
- **MiniIDE:** injetar no `.img` (write-back **já implementado**) → usuário reflashea o `.img` no CF
  (passo manual; **nunca** gravar no CF cru direto — risco).
- Esforço/risco: **baixo-médio** (cola de UI + IPC de cópia). Com M1+M2: "baixar online → editar aqui →
  jogar no CoCo" **sem o usuário ter a placa**.

### M3 — Servidor TNFS — ✅ FEITO (v1.0.55)
> Implementado: `src/main/net/tnfsServer.ts` (UDP 16384, read-only; MOUNT/UMOUNT/OPENDIR/READDIR/CLOSEDIR/
> STAT/OPEN/READ/CLOSE/**LSEEK**) + provedores **folderProvider** (pasta) e **containerProvider** (MiniIDE/
> CoCoSDC-FAT/DriveWire → cada disco interno como .dsk). IPCs `tnfs-server-start/stop/status/preview` +
> `pick-file`; preload. UI no painel direito da aba: origem Pasta×Container, listagem (preview), ligar/
> desligar, IP do host slot, log de conexões. Persiste origem. Validado loopback (`tools/tnfsservetest.ts`):
> LIST + READ idêntico (368.640 B). **ATUALIZAÇÃO (v1.0.57→.59): OPENDIRX/READDIRX + TELLDIR/SEEKDIR + LSEEK
> (posição) + ESCRITA em pasta + filtro de ocultos configurável + dropdown de recentes — TODOS FEITOS** (ver
> bloco STATUS no topo). **PENDENTE:** confirmação final de boot/uso na placa real (humano).
> **IDEIA do usuário (2026-06-09): servir um CONTAINER, não só uma pasta.** Projetar o servidor em torno
> de um **provedor de arquivos** plugável: (a) **pasta real** (arquivos no disco); (b) **container**
> (MiniIDE/DriveWire/CoCoSDC) — a árvore TNFS exibe **cada disco interno como um `.dsk`** (extraído sob
> demanda do `.img`/`.vhd`, reusando `scanMiniIdeImage`/FAT/DriveWire). Assim a FujiNet monta o nosso PC e
> vê todos os discos do container como arquivos. Obs.: TNFS = **um servidor (host) por conexão**; "cada
> disco um servidor diferente" vira, na prática, **um arquivo/subpasta por disco** dentro do mesmo host
> (modelo idiomático do TNFS) — o host slot da FujiNet aponta p/ o nosso servidor e o usuário escolhe o disco.
- Main: `src/main/net/tnfsServer.ts` — **servidor** TNFS (UDP 16384) expondo uma **pasta de imagens**:
  responde `MOUNT`, `OPENDIR/READDIR`, `STAT`, `OPEN/READ` (**read-only primeiro**; `WRITE` numa 2ª etapa).
  **Segurança:** travar tudo dentro da pasta (sem path traversal), read-only por padrão, ligar/desligar
  explícito.
- IPC/preload: `tnfsServerStart(folder, {writable})`, `tnfsServerStop()`, status/eventos.
- Renderer: painel "Servidor TNFS": escolher pasta, Ligar/Desligar, mostrar **IP:porta** (p/ pôr num host
  slot da FujiNet), indicador de atividade.
- Entrega: edita/organiza aqui → **FujiNet monta ao vivo** (host slot = IP do PC), sem flash/disquete.
- Esforço/risco: **médio-alto** (lado servidor do protocolo; firewall; segurança). Teste: montar a pasta
  pelo nosso próprio cliente (M1b), por um cliente TNFS de referência e pela **FujiNet real** (humano).

### M4 (opcional) — Servidor DriveWire serial (CoCo direto no PC, sem WiFi)
- Servir o `.dsk` ativo via **DriveWire** pela serial/Becker (OP_READ/OP_WRITE/OP_NAMEOBJ…). Transporte
  nativo do CoCo. **Custo:** `serialport` = **módulo nativo** (recompilar/empacotar no electron-builder) →
  por isso fica por último. Só vale se houver demanda por uso direto serial (quem tem FujiNet resolve com M3).

### Toques no código (resumo)
- **main:** `net/download.ts`, `net/tnfs.ts`, `net/tnfsServer.ts`; IPCs novos em `index.ts`.
- **preload:** `netDownloadUrl`, `tnfsConnect/list/read`, `tnfsServerStart/stop`, `copyToPath`.
- **renderer:** `components/OnlineBrowser.tsx` (modal URL+TNFS), painel "Servidor TNFS", botões "Abrir
  online" e "Enviar p/ dispositivo" na DSK; reusa `loadPaneFromBuffer`, `normalizeDiskImage`, `maybeRouteOs9`.
- **tools:** `tnfsprobe.ts` (cliente), `tnfsservecheck.ts` (servidor).
- **config:** persistir hosts, pasta compartilhada, estado do servidor.

### Sequência recomendada
1. **M1a (URL)** — baixo risco, valor imediato, valida "rede → painel".
2. **M1b (cliente TNFS)** — navegar/baixar dos hubs.
3. **M2 (enviar p/ dispositivo)** — fecha a ponte offline.
4. **M3 (servidor TNFS)** — o bônus que o usuário (com FujiNet) aproveita direto.
5. **M4 (serial)** — só se quiser uso direto sem WiFi (tem custo de empacotamento).

---

## Riscos / notas
- **TNFS** é simples, mas exige cuidado com UDP (retransmissão, tamanho de pacote, timeouts).
- **Compatibilidade:** `.DSK` 35T padrão = direto; **40T JDOS / Dragon / OS-9** dependem do que o
  HDB-DOS/OS-9 aceitam no lado do CoCo.
- **Firewall/permissões de rede** para o modo servidor.
- **Legalidade** do conteúdo online = responsabilidade do usuário.
- A placa FujiNet **não é controlada pelo PC** (ela conversa com o CoCo e a Internet); nosso papel
  é ser **servidor/origem de imagens**, não "driver" da placa.

## Referências
- Manual "FujiNet for CoCo — The Basics" (em `amostras/`).
- `FujiNetWIFI/fujinet-firmware` (+ wiki "Setting-up-a-TNFS-Server"), `tnfsd`, `fujinet-lib` (só referência).
- `fujinet.online` / `fujinet.online/tnfs-server-status`.
