# Aba FujiNet / Online

A aba **FujiNet / Online** liga o app à rede do ecossistema **FujiNet/TNFS** do CoCo/Dragon. Ela tem dois
lados, lado a lado:
- **Esquerda — Acessar servidores:** baixar imagens/arquivos de **links** e de **hubs TNFS** para dentro
  do app (e então editar/converter como qualquer outra imagem).
- **Direita — Servidor WiFi (FujiNet):** transformar o seu PC num **servidor de arquivos** que a sua placa
  **FujiNet** monta ao vivo pela rede.

Todas as mensagens de conexão/erro saem no **console** (rodapé), igual às outras abas.

> A placa FujiNet conversa com o **CoCo** e com a **Internet** — o nosso papel é ser **origem/servidor de
> imagens**, não "driver" da placa.

---

## Acessar servidores (lado esquerdo)

São duas formas de trazer imagens de fora — a **nativa do FujiNet** (TNFS, no topo) e a **manual** (URL,
embaixo).

### Servidores TNFS (hubs FujiNet) — primário (pronto)
A forma "FujiNet" de acessar. Digite o **host** (ex.: `tnfs.fujinet.online`) e clique **Conectar** (TNFS é
UDP, porta 16384). Aparece a listagem: **pastas** (clique para entrar; use **↑** para subir) e **arquivos**
(clique para **baixar e abrir** no painel). Discos OS-9 vão p/ a aba OS-9; `.zip` é descompactado na hora.
Ex.: `tnfs.fujinet.online` → pasta **COCO** → `news.dsk`/`weather.dsk`/`wiki.dsk`… **Desconectar** limpa a
listagem (o TNFS é por-operação, não há conexão presa).

**Escolher servidor (dropdown):** há um seletor com dois grupos — **Meus servidores** (seus favoritos) e
**Comunidade (ao vivo)**, esta buscada da lista pública `fujinet.online/tnfs-server-status` (servidores com
**UDP fora** ficam desabilitados, pois o TNFS é UDP). O botão **★** salva o host atual nos favoritos.

**Gerenciar (★):** abre um modal para **adicionar/remover** favoritos (host + rótulo + pasta inicial
opcionais), conectar direto e salvar servidores da comunidade. **Tudo é salvo** — favoritos, último host e
a pasta compartilhada persistem ao fechar o app, e a listagem/caminho sobrevivem à troca de aba.

> **Por que não vejo os mesmos servidores da minha placa FujiNet?** O app não lê a configuração da placa
> (ela fala com o CoCo + Internet, não com o PC). Para acessar outro servidor, **digite o host** dele (ou
> salve-o nos favoritos). O **SD da própria placa** não é acessível pela rede; servidores com **login**
> (usuário/senha) ainda não são suportados.

### Abrir por URL (HTTP/HTTPS) — manual (pronto)
Conveniência genérica: cole um **link** de um `.dsk/.vdk/.sdf/.os9/.img/.ccc/.cas` e clique **Abrir**. O app
baixa o arquivo e o **abre num painel** — discos OS-9 vão automaticamente para a aba **OS-9**; o restante
abre na aba **DSK**. Dali em diante é tudo o pipeline normal: editar, injetar, converter, mapa de disco,
testar no XRoar, gravar GW.

> **Arquivos `.zip` (ex.: Color Computer Archive):** o app **descompacta automaticamente**. Se o ZIP tiver
> **uma** imagem, ela abre direto; se tiver **várias**, aparece um **seletor** para você escolher qual abrir.

---

## Servidor WiFi de arquivos (lado direito — pronto)

O app vira um **servidor TNFS** (UDP **16384**, **somente leitura**) que a sua **FujiNet** monta ao vivo —
você edita/organiza aqui e o **CoCo vê na hora**, sem disquete nem reflash.

1. **Origem:** escolha **Pasta** (uma pasta com vários arquivos) ou **Container** (um `.img/.vhd/.dsk` de
   **MiniIDE / CoCoSDC / DriveWire** — cada disco interno é exposto como um `.dsk`).
2. Clique no botão de pasta para **selecionar** a pasta/arquivo. A lista **"Arquivos compartilhados"** mostra
   o que será servido.
3. **Ligar servidor.** Aparece o **endereço (IP)** do PC — ponha esse IP num **host slot** da sua FujiNet.
4. **Desligar servidor** quando terminar. As mensagens de conexão saem no **console**.

> A origem (pasta/container e caminho) é **lembrada** entre sessões. O servidor é **somente leitura**.

---

## Resumo
- **Baixar e usar:** Abrir por URL → o arquivo abre num painel → edite normalmente.
- **Servir para a FujiNet:** (em breve) escolher pasta → ligar servidor → pôr o IP do PC num host slot da
  FujiNet.
- **Console:** acompanha download, conexões e erros.
