# Roadmap 2 — FujiNet / TNFS (implementação FUTURA)

> Status: **implementação futura** — registrado com os achados da pesquisa e o escopo
> que isolamos. Não bloqueia o roadmap OS-9.

> ## STATUS ATUAL — 2026-06-09 (v1.0.46): NADA implementado ainda (futuro)
> Continua 100% pendente. Pendências: **M1** cliente TNFS (baixar imagens dos hubs tnfs.fujinet.online),
> **M2** "enviar para dispositivo" (CoCoSDC/disquete-GW/MiniIDE), **M3** servidor TNFS (o PC serve discos
> ao vivo p/ a FujiNet do usuário), **M4** servidor DriveWire serial. É a maior área ainda não iniciada.

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

## Marcos (ordem sugerida)

### M1 — Cliente: baixar imagens online (MAIOR valor imediato; serve a todos)
- **Download HTTP/HTTPS** por URL (quick win): puxar `.dsk/.vdk/.ccc/.cas` p/ um painel.
- **Cliente TNFS** (UDP 16384): `mount`, `dir`, `read file`. UI "Abrir online (TNFS)":
  escolher hub (`tnfs.fujinet.online` + lista de status), navegar pastas, **baixar `.DSK`** p/ um painel.
- Reaproveita TODO o nosso pipeline (editar/converter/mapa de disco).

### M2 — "Enviar para dispositivo" (fechar a ponte offline)
- **CoCoSDC:** o cartão monta como **drive FAT no Windows** → botão "Enviar p/ CoCoSDC"
  copia o `.dsk` para o drive escolhido. (Não precisa de write-back FAT nem da placa.)
- **Disquete (Greaseweazle):** já existe.
- **MiniIDE:** injetar no `.img` (write-back já implementado) → usuário regrava o `.img` no CF
  (passo de flash manual; **não** gravar no CF cru direto — risco).

### M3 — Servidor TNFS (bônus p/ quem tem FujiNet, como o usuário)
- Servidor TNFS (UDP 16384) expondo uma **pasta de imagens**; a FujiNet adiciona o **IP do PC**
  num host slot e monta ao vivo. Editar/organizar aqui → CoCo vê na hora (sem flash/disquete).
- Referência: wiki oficial *"Setting up a TNFS Server"* + fonte `tnfsd`.

### M4 (opcional) — Servidor DriveWire serial (CoCo direto no PC, sem placa)
- Servir o `.dsk` ativo via **DriveWire** pela serial/Becker — o transporte nativo do CoCo
  (e o mesmo que a FujiNet usa). Alternativa "ao vivo" sem WiFi. Já entendemos contêineres DriveWire.

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
