# OG-013 — Conversão das fontes Allegro

| Campo | Valor |
|---|---|
| Épico | E1 |
| Tipo | Conteúdo |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S2 |
| Status | Em revisão |
| Dependências | [OG-002](OG-002-build-original-docker.md) |
| Regras de negócio | — |
| Skills | `outgun-asset-pipeline` |

## História
Como jogador, quero as fontes pixeladas originais, para manter a identidade visual.

## Contexto e referências no original
- `fonts/*.dat`: datafile Allegro compactado (magic `slh.ALL`, LZSS).
- Seleção de fonte em `Graphics::select_font`.

## Escopo
- Extrair glifos (via utilitário `dat`/`grabber` do Allegro no container do OG-002, ou unpacker LZSS em TS).
- Gerar BMFont (`.fnt` + `.png`) por fonte para `PIXI.BitmapText`.
- Fonte padrão definida (8×8 do original).

## Critérios de aceite
- [x] As 25 fontes convertidas; página de preview com todas.
- [x] Acentos do pt-BR/fi/it renderizam (verificar faixa de caracteres; fallback definido se faltarem glifos). _(as fontes cobrem ASCII 32–127 e Latin-1 160–255; fora disso, `?`)_

## Notas técnicas
- —

## Notas de implementação
- **Leitor próprio em TypeScript** (roda no CI sem Docker), em `tools/asset-pipeline/src`:
  - `datafile.ts`: datafile Allegro 4 com propriedades e blocos LZSS; o buffer inicial do LZSS é zerado, o que foi confirmado empiricamente;
  - `font.ts`: objeto FONT no formato "novo", com faixas de glifos de 1 bit por pixel e o bit mais significativo à esquerda; exporta BMFont (`.fnt` + atlas PNG RGBA branco de 256 px de largura) para o `PIXI.BitmapFont`.
- **Referência:** novo modo do oráculo `pnpm oracle allegro NOME`, que compila um programa só com a Allegro. O `fontdump.cpp` carrega cada fonte como o jogo (`load_datafile_object(..., "font"/"border")`) e desenha os glifos com `textout_ex`. As 25 fontes, objetos `font` e `border`, 192 glifos cada, **batem pixel a pixel** (fixture `fonts-reference.json.gz`).
- **`pnpm assets`** inclui as fontes no manifesto (`fonts[nome] = { font, border }`, com arquivos com hash) e na `preview.html`.
- **Regra do original para o HUD (OG-065):** com contorno, cada caractere do `border` é desenhado em (x−1, y−1) e o avanço usa a largura da fonte **principal** (`graphics.cpp:2987`); sem contorno, o texto é desenhado nas 8 posições vizinhas na cor da borda.
- **Restrição:** as fontes só cobrem Latin-1. Textos da interface (i18n, OG-014) devem evitar caracteres fora disso, como o travessão "—"; o fallback é `?`.
- Amostra visual em `tools/parity/out/prints/fontes-amostra.png`.
- Branch: `og-013-font-conversion`.
