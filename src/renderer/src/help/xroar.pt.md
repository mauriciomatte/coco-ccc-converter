# Aba XRoar — Emulador embutido

A aba **XRoar** é um **emulador completo** de CoCo/Dragon dentro do app. Serve para **testar na hora** os
discos, fitas e programas que você abre/edita nas outras abas — sem precisar de hardware. Ao terminar este
guia você saberá montar discos e fitas, escolher a máquina e o vídeo certos, rodar programas e bootar OS-9,
e deixar a tela grande e nítida.

A tela tem três zonas: **painel ESQUERDO** (drives, fita, programa, joystick), o **CENTRO** (a tela 4:3 do
emulador) e o **painel DIREITO** (estado, máquina, vídeo, filtro, imagem, controles, ajuda).

---

## 1. Pronto? O indicador de estado

No topo do painel direito, **● pronto** (em cor primária) significa que o emulador subiu e aceita comandos.
Enquanto não estiver pronto, a maioria dos controles fica desabilitada. **Clique na tela** para capturar o
teclado e liberar o áudio (o navegador só toca som após um clique).

---

## 2. Máquina

Escolha a máquina emulada: **CoCo 3 (NTSC/PAL)**, **CoCo 2 (NTSC/PAL)**, **Dragon 32**, **Dragon 64**,
**Tano Dragon**, **MC-10**. Trocar de máquina **reinicia o emulador** (boot da nova máquina). O app já
seleciona a máquina certa conforme o que você está testando (CoCo→CoCo 3, Dragon→Dragon 64; OS-9 força
CoCo 3, que o NitrOS-9 Level 2 exige).

---

## 3. Vídeo: Composto × RGB

O seletor **Saída de vídeo** muda como as cores e o texto aparecem:
- **Composto (azul-verm / laranja-ciano)** — simula o sinal NTSC: o monitor "inventa" **cores de artefato**
  a partir de pixels finos. É como muitos jogos do CoCo 1/2 produziam cor. **Porém borra o texto fino**, então
  é ruim para 80 colunas.
- **RGB (nítido)** — sinal digital exato do CoCo 3, **sem artefato**. **Essencial para as 80 colunas** do
  OS-9 (texto limpo, sem cores falsas).

Trocar o vídeo **reinicia** o emulador. Regra: **jogos com cor de artefato → Composto; texto/OS-9 → RGB**.

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

No painel esquerdo, cada linha **D0–D3** mostra o disco montado, com **Abrir** e **Ejetar**.
- **Abrir** escolhe um disco do PC (`.dsk/.vdk/.jvc/.dmk/.os9`) e o monta naquela drive (um `.os9` é tratado
  como `.dsk` pela geometria).
- **Ejetar** desmonta. A **drive 0** é a de boot.

Normalmente você nem usa isto à mão: as outras abas montam o disco para você (seção 11).

---

## 8. Fita (K7) — montar cassete + CLOAD automático

- **Abrir fita** monta um `.cas/.wav` no deck.
- O toggle **CLOAD(M) auto/manual**: **auto** = o XRoar roda `CLOAD`/`CLOADM` sozinho ao abrir a fita;
  **manual** = só anexa a fita (você digita `CLOAD`/`CLOADM` no emulador).
- **Ejetar fita** desmonta.

> Esta aba tem só montar/ejetar fita — o **play/rebobinar/contador** com carretéis fica na **mini-XRoar da
> aba K7**.

---

## 9. Programa (.bin/.rom/.ccc/.hex/.sna)

- O **nome do programa carregado** aparece em destaque no topo do bloco.
- **Abrir** carrega e **executa** um programa (`.bin/.rom/.ccc/.hex/.sna`); o XRoar detecta o formato.
- O toggle **"AutoRun"** (ao lado de Abrir): **ligado** = um `.bin/.hex` boota o emulador **com** o arquivo e roda sozinho;
  **desligado** = só carrega na memória (você roda com `EXEC`). Cartuchos `.ccc/.rom` e snapshots `.sna`
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
mostrar a tela, num único reinício.

---

## 12. Expandir a tela

O botão no canto da tela **expande**: esconde os painéis laterais (e o console), e a tela 4:3 fica **bem
maior e mais nítida**. Ideal para ler as 80 colunas do OS-9. Clique de novo para recolher.

---

## 13. Observações
- Trocar **Máquina**, **Saída de vídeo** ou **Filtro** **reinicia** o emulador (um disco/comando pendente é
  reaplicado no novo boot).
- Cor/Brilho/Contraste, máquina, vídeo, filtro e joysticks ficam **salvos** entre sessões.
- Para o **boot de OS-9** funcionar, o emulador já sobe com a auto-detecção de geometria OS-9 ligada — por
  isso o comando `DOS` encontra a trilha de boot correta.
