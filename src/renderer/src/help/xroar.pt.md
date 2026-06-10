# Aba XRoar — Emulador embutido

A aba **XRoar** é um **emulador completo** de CoCo/Dragon dentro do app. Serve para **testar na hora** os
discos, fitas e programas que você abre/edita nas outras abas — sem precisar de hardware. Ao terminar este
guia você saberá montar discos e fitas, escolher a máquina e o vídeo certos, rodar programas e bootar OS-9,
e deixar a tela grande e nítida.

A tela tem três zonas: **painel ESQUERDO** (drives, fita, programa, joystick), o **CENTRO** (a tela 4:3 do
emulador) e o **painel DIREITO** (estado, máquina, vídeo, filtro, imagem, controles, ajuda).

---

## 1. Pronto? O indicador de estado

No topo do painel direito, à direita do título **XRoar**, fica o indicador de estado:
- **● pronto** (em cor primária) — o emulador subiu e aceita comandos. O texto ao lado da bolinha pode mudar
  para mensagens de estado **enviadas pelo próprio emulador** (ex.: andamento de carga) — não é só "pronto".
- **iniciando…** (cinza) — o emulador ainda está bootando (ou rebootando após trocar máquina/vídeo/filtro).

Enquanto não estiver pronto, **a maioria dos controles fica desabilitada** (drives, fita, programa,
joysticks, imagem, controles). **Clique na tela** para capturar o teclado e liberar o áudio (o navegador só
toca som após um clique).

> **Quando o emulador monta:** o iframe do XRoar só é criado na **primeira vez** que você abre esta aba (e a
> tela 4:3 já tem tamanho). Antes disso aparece **"iniciando emulador…"** no centro. Depois de montado, ele
> **continua rodando** mesmo se você trocar de aba — voltar não reinicia nada.

---

## 2. Máquina

O seletor **Máquina** lista oito modelos:

| Opção no seletor | O que é |
|---|---|
| **Tandy CoCo 3 (NTSC)** | CoCo 3 americano (60 Hz) — padrão para CoCo. |
| **Tandy CoCo 3 (PAL)** | CoCo 3 europeu (50 Hz). |
| **Tandy CoCo 2 (NTSC)** | CoCo 2 americano. |
| **Tandy CoCo 2 (PAL)** | CoCo 2 europeu. |
| **Dragon 32** | Dragon 32K (PAL). |
| **Dragon 64** | Dragon 64K (PAL) — padrão para Dragon. |
| **Tano Dragon (NTSC)** | Dragon 64 versão americana (Tano), 60 Hz. |
| **Tandy MC-10** | O micro de entrada da Tandy (MC6803), bem mais simples. |

Trocar de máquina **reinicia o emulador** (boot da nova máquina) e, de quebra, **limpa o nome do programa
carregado** e **volta o toggle de colunas para 32**. O app já seleciona a máquina certa conforme o que você
está testando (CoCo→CoCo 3, Dragon→Dragon 64; OS-9 força CoCo 3, que o NitrOS-9 Level 2 exige).

> A **plataforma-alvo** do app (toggle CoCo/Dragon) define a máquina **padrão**: trocar para Dragon põe
> **Dragon 64**, trocar para CoCo põe **CoCo 3 (NTSC)**. Você pode escolher outra máquina à mão depois — vale
> até a próxima troca de plataforma.

---

## 3. Vídeo: Composto × RGB

O seletor **Saída de vídeo** tem **três** opções e muda como as cores e o texto aparecem:
- **Composto (azul-verm)** — simula o sinal NTSC: o monitor "inventa" **cores de artefato** a partir de
  pixels finos. É como muitos jogos do CoCo 1/2 produziam cor.
- **Composto (laranja-ciano)** — o **mesmo** composto, mas com a **fase do artefato invertida**: as cores que
  saíam azul/vermelho saem laranja/ciano. Muitos jogos só ficam "certos" numa das duas fases — se as cores de
  um jogo parecerem trocadas, **alterne entre estas duas opções**.
- **RGB (nítido)** — sinal digital exato do CoCo 3, **sem artefato**. **Essencial para as 80 colunas** do
  OS-9 (texto limpo, sem cores falsas).

As duas opções **Composto** ligam o decodificador de artefato (cross-colour); **RGB** o desliga. Trocar o
vídeo **reinicia** o emulador. Regra: **jogos com cor de artefato → Composto (teste as duas fases); texto/OS-9
→ RGB**.

---

## 4. Filtro de tela: Nítido × Suave

- **Nítido (pixel)** — pixels exatos; melhor para **jogos** (pixel-art preservado).
- **Suave (texto 80 col)** — interpolação que **uniformiza as hastes finas** dos caracteres de 80 colunas;
  melhor para **OS-9/texto**, porque a tela é escalada para um tamanho não-inteiro e o "Nítido" deixaria as
  letras com espessura irregular.

Ao testar OS-9, o app já força **RGB + Suave** para você. Trocar o filtro também **reinicia** o emulador.

## Colunas (80/32) — minúsculas reais no CoCo 3

Quando a máquina é **CoCo 3**, aparece um bloco **"Colunas"** com um toggle **80 ↔ 32**. Ele digita
`WIDTH 80` / `WIDTH 32` no **prompt `OK` do BASIC**:
- **80 colunas** → tela hi-res do GIME, com **minúsculas de verdade**.
- **32 colunas** → modo VDG legado, onde minúscula aparece como **maiúscula invertida** (comportamento real
  do hardware).

Não altera RGB/Composto — só muda o modo de texto. Precisa estar no prompt `OK` do BASIC. (No OS-9, a janela
de 80 colunas já mostra minúsculas, sem precisar do toggle.)

---

## 5. Imagem ao vivo: Cor / Brilho / Contraste

Três controles deslizantes ajustam a imagem **na hora** (sem reiniciar). Os valores ficam salvos e são
reaplicados a cada boot.

---

## 6. Controles: Pausar / Reset / Reset total

- **Pausar / Continuar** — congela e retoma a emulação.
- **Reset** — reset suave da CPU (mantém a RAM).
- **Reset total** — boot frio (limpa a RAM). Atalho global: **Ctrl+Enter** (vale aqui e no mini-XRoar da
  aba K7).

---

## 7. Drives D0–D3 — montar disco

No painel esquerdo, cada linha **D0–D3** mostra o **nome do disco montado** (ou `—` se vazia), com um ícone
de disquete que **acende** (cor primária) quando há disco, mais dois botões:
- **Abrir** (pasta) — escolhe um disco do PC (`.dsk/.vdk/.jvc/.dmk/.os9`) e o monta naquela drive (um `.os9`
  é tratado como `.dsk` pela geometria). Fica desabilitado enquanto o emulador não está **pronto**.
- **Ejetar** (×) — desmonta aquela drive. Só fica habilitado quando a drive **tem** disco.

A **drive 0** é a de boot. Normalmente você nem usa isto à mão: as outras abas montam o disco para você
(seção 11). Trocar de máquina/vídeo **ejeta tudo** (as drives são limpas no reboot).

---

## 8. Fita (K7) — montar cassete + CLOAD automático

- **Abrir fita** monta um `.cas/.wav` no deck.
- O toggle **CLOAD(M) auto/manual**: **auto** = o XRoar roda `CLOAD`/`CLOADM` sozinho ao abrir a fita;
  **manual** = só anexa a fita (você digita `CLOAD`/`CLOADM` no emulador).
- **Ejetar fita** desmonta.

> Esta aba tem só montar/ejetar fita — o **play/rebobinar/contador** com carretéis fica na **mini-XRoar da
> aba K7**.

---

## 9. Programa (.bin/.rom/.ccc/.pak/.hex/.sna)

- O **nome do programa carregado** aparece em destaque no topo do bloco.
- **Abrir** carrega e **executa** um programa (`.bin/.rom/.ccc/.pak/.hex/.sna`); o XRoar detecta o formato.
- **`.pak`** é a ROM de cartucho do **VCC** (idêntica a `.rom/.ccc`) — o app a apresenta ao XRoar como cartucho
  `$C000` automaticamente (o nome de tela continua `.pak`). Roda direto, como qualquer cartucho.
- O toggle **"AutoRun"** (ao lado de Abrir): **ligado** = um `.bin/.hex` boota o emulador **com** o arquivo e roda sozinho;
  **desligado** = só carrega na memória (você roda com `EXEC`). Cartuchos `.ccc/.rom/.pak` e snapshots `.sna`
  **sempre** rodam direto.

---

## 10. Joystick / teclado

Dois seletores configuram **Joystick 0 (direito)** e **Joystick 1 (esquerdo)**: **Nenhum**, **Mouse** ou um
**teclado-joystick** (setas+Alt, WASD+O,P, IJKL+X,Z, QAOP+Espaço). Ajuste ao vivo; no CoCo o joystick que
os jogos usam costuma ser o **0 (direito)**.

---

## 11. Como o conteúdo chega das OUTRAS abas

Quase sempre você não monta nada à mão — as outras abas mandam para cá e já trocam para esta aba:
- **DSK → "Testar Painel"** — monta o disco do painel ativo na drive 0 (com ou sem reset); a máquina segue o
  formato do disco.
- **DSK → duplo-clique num arquivo** — monta o disco e roda o arquivo (`RUN` / `LOADM:EXEC`).
- **OS-9 → "Testar"** — força **CoCo 3 + RGB + Suave**, monta o disco e (no modo "Bootar") digita **`DOS`**
  para bootar o OS-9.
- **K7 → "→ XRoar"** — anexa o WAV da fita; você usa `CLOAD`/`CLOADM`/`RUN`.
- **BASIC → "Rodar"** — digita `NEW` + o programa (ou, com reset, boota limpo e digita o programa).

Quando uma aba pede um vídeo/filtro diferente (ex.: OS-9 pede RGB+Suave), o app aplica isso **antes** de
mostrar a tela, num único reinício. Sempre que um conteúdo é **rodado** (duplo-clique, `DOS`, `RUN`…), o app
dá um **reset total** antes de digitar o comando — assim o texto vai para o prompt limpo (`OK`/`B:`) e não
para um programa que já esteja na tela; o disco montado permanece na drive.

> **Velocidade de digitação:** a injeção de comandos/BASIC é feita **tecla a tecla**. A cadência é controlada
> pelo toggle **"Vel.Export.Código"** da aba **BASIC**: **normal** ≈ 25 ms por tecla (padrão, mais seguro) e
> **rápida** ≈ 12 ms. Se uma linha começar a "perder" caracteres em máquinas mais sensíveis, use a normal.

> **Dragon:** ao bootar/resetar, a ROM do Dragon pede "pressione uma tecla". O app **prefixa um espaço** antes
> de cada comando digitado para dispensar esse prompt automaticamente (no prompt do BASIC o espaço é inócuo).

---

## 12. Expandir a tela

O botão no **canto superior direito da tela** (ícone de expandir/recolher) alterna o modo expandido:
**esconde os dois painéis laterais E o console de diagnóstico** (no app), de modo que a tela 4:3 — que é
limitada pela **altura** — fica **bem maior e mais nítida**. Ideal para ler as 80 colunas do OS-9. Clique de
novo (ou no ícone de recolher) para voltar a mostrar os painéis.

> A tela é sempre **4:3 com letterbox** (faixas pretas), centralizada e redimensionada automaticamente ao
> tamanho da janela — nunca distorce a imagem.

---

## 13. Botão de Ajuda

O botão **Ajuda** (no fim do painel direito) reabre este guia a qualquer momento.

---

## 14. Observações
- Trocar **Máquina**, **Saída de vídeo** ou **Filtro** **reinicia** o emulador (um disco/comando pendente é
  reaplicado no novo boot — assim você não precisa "testar 2×" depois de uma troca de máquina).
- **Persistência:** ficam **salvos** entre sessões (com um pequeno atraso após cada mudança) a **máquina**, a
  **saída de vídeo**, o **filtro**, **Cor/Brilho/Contraste** e os dois **joysticks**. As configurações são
  carregadas **antes** do primeiro boot (evita boot duplo).
- Cor/Brilho/Contraste são **inteiros 0–100** (neutro = 50) aplicados **ao vivo**; máquina, vídeo e filtro
  entram pelo **boot** (por isso reiniciam).
- Para o **boot de OS-9** funcionar, o emulador já sobe com a auto-detecção de geometria OS-9 ligada — por
  isso o comando `DOS` encontra a trilha de boot correta. Internamente, um `.os9` é montado como `.dsk` (mesma
  geometria) para o XRoar reconhecê-lo; o nome exibido na drive continua o original.
- Os `.pak` são apresentados ao XRoar como `.rom` (cartucho) só internamente; o nome de tela continua `.pak`.
