# Aba GW — Greaseweazle (ler/gravar disquetes reais)

A aba **GW** usa a placa **Greaseweazle** para **ler** e **gravar** disquetes **físicos** de verdade,
fazendo a ponte entre a mídia real e as imagens `.dsk` do app.

## Pré-requisitos

- A **placa Greaseweazle** conectada por USB.
- O programa **`gw`** (Greaseweazle host tools) instalado. Se ele não estiver no PATH do sistema,
  informe o **caminho do executável** no campo correspondente (ex.: `C:\gw\gw.exe`). Esse valor fica
  salvo.
- Um **drive de disquete** ligado ao cabo da Greaseweazle.

## Botões e campos principais

- **Testar (gw info)** — roda `gw info` para conferir se a placa está respondendo. Faça isso primeiro.
- **Dispositivo / porta** — deixe vazio para detecção automática; informe (ex.: `COM3` no Windows,
  `/dev/ttyACM0` no Linux) se houver mais de uma placa.
- **Drive** — qual drive no cabo (Padrão deixa o `gw` decidir; use A/B ou 0/1 quando há dois drives).
- **Painel-alvo (A/B)** — define qual painel da aba DSK recebe a leitura **e** de qual painel sai a
  gravação. Os botões mudam de rótulo conforme o painel ("Ler → Painel X" / "Gravar Painel X").

## Ler um disquete físico

1. Coloque o disquete no drive.
2. Escolha o **painel-alvo** (A ou B).
3. Clique em **Ler**. A imagem é carregada no painel escolhido da aba **DSK** (se o painel já tiver
   conteúdo, aparece um aviso de sobrescrever — cancele para salvar antes).
4. O **mapa de trilhas** mostra o progresso por trilha/lado.

## Gravar num disquete físico

1. Tenha a imagem no painel (A ou B), ou escolha **Gravar .dsk…** para pegar um arquivo.
2. Insira um disquete **gravável** no drive.
3. Clique em **Gravar Painel X → Disco**. O mapa mostra o progresso.

> Você também pode acionar a gravação direto da aba **DSK** pelo botão **Gravar GW**, que abre esta
> aba já apontando para o painel ativo.

## Diagnóstico do drive

Para drives problemáticos:

- **Testar seek** — roda `gw seek 0` para exercitar/recalibrar a cabeça (ajuda contra erros de
  seek/Track 0).
- **Ver tempos** — roda `gw delays` e mostra os tempos atuais.
- **Step (µs) + Aplicar step** — roda `gw delays --step` para **alargar o atraso entre passos** da
  cabeça (aumente para ~8000–12000 em drives lentos). O valor fica salvo no dispositivo.

## Mídia (dica importante)

O formato CoCo (`coco.decb`) grava em **densidade dupla 720K (DD)**. Disquetes **HD 1.44 MB**
funcionam **se você tapar o furo do sensor de densidade** (assim o drive os trata como DD). Um erro
**"Verify Failure Track 0.0"** normalmente indica um disquete **fisicamente ruim**, não um problema de
HD vs DD.

## Fluxo típico

1. **Testar (gw info)** → confirma a placa.
2. **Ler** um disquete → edita na aba DSK → **Gravar** de volta (ou em outro disquete).
3. Se houver erros de leitura/gravação: **Testar seek**, e se preciso aumente o **Step**.
