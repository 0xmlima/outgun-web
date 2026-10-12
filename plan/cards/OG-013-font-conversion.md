# OG-013 — Conversão das fontes Allegro

| Campo | Valor |
|---|---|
| Épico | E1 |
| Tipo | Conteúdo |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S2 |
| Status | Backlog |
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
- [ ] As 25 fontes convertidas; página de preview com todas.
- [ ] Acentos do pt-BR/fi/it renderizam (verificar faixa de caracteres; fallback definido se faltarem glifos).

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
