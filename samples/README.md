# Samples / Fixtures de validação

Coloque aqui os arquivos de referência para validarmos o conversor contra formatos reais.
Depois é só me dizer "analise a pasta samples" que eu rodo nossos parsers contra cada arquivo
e gero um relatório (nome, endereços de carga/execução, tamanho, checksum/SHA-256, estrutura).

## O que colocar (em ordem de valor para a validação)

### 1. Dump de cartucho comercial conhecido  →  `reference-carts/`
O MAIS valioso. Um `.ccc`/`.rom` de um cartucho real do CoCo nos dá a "verdade" sobre
a estrutura de autostart: confirma `'DK'` ($44 $4B) em $C000 e código executável em $C002.
Comparo a estrutura do que GERAMOS contra a de um cartucho que comprovadamente funciona.

### 2. Par casado .BIN + .CAS do mesmo programa  →  `bin/` e `cas/`
Permite checar que o parser de CAS produz o MESMO payload, load e exec que o .BIN (LOADM).

### 3. Imagem .DSK com um .BIN de código de máquina dentro  →  `dsk/`
Valida a extração RS-DOS. Ideal: incluir também o .BIN extraído por uma ferramenta de
referência (ex.: `decb` do ToolShed) em `expected/`, para eu comparar byte a byte.

### 4. Gravação .WAV de uma fita real  →  `wav/`
Valida o demodulador FSK. Ideal: incluir o .CAS conhecido do mesmo programa em `expected/`.

## Ferramentas externas que servem de "gabarito" (ground truth)
- **decb** (ToolShed) — extrai/inspeciona RS-DOS `.dsk` e LOADM `.bin`.
- **XRoar** ou **MAME** (driver `coco2`) — montam o `.ccc` gerado e confirmam se DÁ BOOT.
  Esse é o teste funcional definitivo.

## Não precisa
- Arquivos enormes; um programa pequeno por formato já valida o pipeline.
- Conteúdo proprietário sensível — use o que puder compartilhar à vontade.
