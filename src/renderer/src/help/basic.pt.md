# Aba BASIC — Editor de programas BASIC

A aba **BASIC** é um editor de texto para escrever programas em **Color BASIC / Extended BASIC** e
**rodá-los** no emulador XRoar ou **salvá-los** num disquete.

## O editor

- É uma área de texto que **força MAIÚSCULAS** (o prompt do CoCo não usa minúsculas).
- Barra de ferramentas com **recortar / copiar / colar** e **localizar / localizar e substituir**.
- O conteúdo **permanece** ao trocar de aba (não se perde ao ir ao XRoar e voltar).

## Rodar no XRoar

Dois botões injetam o programa no emulador (digitando no prompt, como se você tivesse teclado):

- **Rodar** — digita `NEW` + o programa no prompt atual (sem reiniciar). Use quando o emulador já está
  no prompt `OK`.
- **Rodar com reset** — dá um **reset** primeiro (boot limpo, garante o prompt mesmo se algo estiver
  rodando) e então digita o programa.

A **velocidade da digitação** é ajustável (toggle "Vel. Export. Código"): **Rápida** (~12 ms/tecla) ou
**Normal** (~25 ms/tecla). Em fitas/máquinas mais sensíveis, use Normal.

## Salvar como `.BAS` (no disquete)

O botão **Salvar .BAS** grava o texto como um **arquivo BASIC ASCII** (tipo 0, terminado em CR
`0x0D`) no **painel ativo da aba DSK**. Como o CoCo lê BASIC ASCII com `LOAD"NOME"` normalmente, **não
é preciso tokenizar** — o arquivo carrega direto no CoCo.

## Fluxo típico

1. Escreva/edite o programa.
2. **Rodar com reset** para testar do zero no XRoar.
3. Ajustes → **Rodar** (rápido, sem reset) para iterar.
4. Quando estiver bom, **Salvar .BAS** para guardar no disquete (depois salve a imagem na aba DSK).

## Dicas

- Se a 1ª linha "sumir" ao rodar, use **Rodar com reset** (boot limpo) e/ou baixe a velocidade para
  **Normal**.
- Para abrir um `.BAS` existente e editar, traga o texto pelo fluxo da aba DSK/visualização (o editor
  trabalha com o texto do programa).
