# Aba XRoar — Emulador (CoCo / Dragon)

A aba **XRoar** roda o emulador embarcado para você **testar** discos, fitas, programas e cartuchos na
hora. Tem a tela do emulador no centro e painéis de controle nas laterais.

## Máquina e vídeo (painel direito)

- **Máquina** — escolha o computador: **Tandy CoCo 3** (NTSC/PAL), **CoCo 2**, **Dragon 32/64**,
  **Tano Dragon**, **MC-10**. Trocar a máquina **reinicia** o emulador. (Para **OS-9 Level 2** use
  **CoCo 3**.)
- **Saída de vídeo** — **Composto** (cores de artefato NTSC; bom para jogos que dependem disso) ou
  **RGB (nítido)** (sem artefato; melhor para texto e telas hi-res, como as 80 colunas do OS-9).
- **Filtro de tela** — **Nítido (pixel)** = pixels exatos (jogos); **Suave (texto 80 col)** = suaviza
  o texto fino quando a tela está numa escala não-inteira (deixa o OS-9 legível).
- **Imagem** — controles de **Cor / Brilho / Contraste** (ao vivo).

## Drives de disco (painel esquerdo)

Quatro drives (**D0–D3**). Em cada um você pode **Abrir** uma imagem (`.dsk/.vdk/.jvc/.dmk/.os9`) e
**Ejetar**. Imagens vindas das outras abas (Testar Painel / Testar OS-9) são montadas aqui
automaticamente, em geral no **D0**.

## Fita (K7)

Painel para **anexar** uma fita (`.cas`/`.wav`) e **ejetar**. O toggle **CLOAD(M) automático**:
quando **ligado**, ao abrir a fita o XRoar já roda `CLOAD`/`CLOADM` sozinho; **desligado**, a fita só
é anexada e você digita `CLOAD` (BASIC) ou `CLOADM` (máquina) no emulador.

## Programa (.bin/.rom/.ccc/.sna)

Abre e **roda** um programa. `.CCC`/`.ROM` (cartucho) e `.SNA` (snapshot) rodam direto. Um `.BIN` de
máquina precisa **bootar com o arquivo** para executar — controle isso pelo toggle **.bin AutoRun**.

## Joystick / teclado

Atribua **joysticks** às portas (mouse ou teclados-joystick predefinidos). No CoCo, o **joystick 0** é
o direito.

## Controles

- **Pausar / Continuar**, **Reset** (soft) e **Reset total** (hard).
- Clique na **tela** para capturar teclado e áudio.

## Expandir a tela

No **canto superior direito da tela** há o botão **Expandir** (⤢): ele **esconde as barras laterais e
o console de diagnóstico** do rodapé, dando ao emulador toda a área da aba. Como a tela 4:3 é limitada
pela **altura**, ganhar altura **aumenta** a imagem e melhora muito a nitidez (ótimo para as 80
colunas do OS-9). Clique de novo (⤡) para recolher.

## Atalho para OS-9

Ao usar **Testar/Bootar** na aba **OS-9**, o XRoar já é configurado para OS-9 automaticamente:
**CoCo 3 + RGB + filtro Suave**. Depois é só **Expandir**.

## Observações

- Trocar **máquina / vídeo / filtro** reinicia o emulador (e remonta o que estava carregado).
- O comando **`DOS`** (boot do OS-9) vem da ROM da controladora de disco, que é anexada quando há um
  disco montado.
