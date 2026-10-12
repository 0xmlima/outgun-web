# OG-061 — Renderer PixiJS: salas e paredes

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S6 |
| Status | Em revisão |
| Dependências | [OG-010](OG-010-map-parser.md), [OG-012](OG-012-graphics-sound-pipeline.md) |
| Regras de negócio | RN-MAP-04, RN-VIS-01 |
| Skills | `outgun-re-spec`, `outgun-asset-pipeline` |

## História
Como jogador, quero ver as salas, chãos e paredes como no original, em qualquer resolução.

## Contexto e referências no original
- `Graphics::draw_background`, `setRoomLayout` (`graphics.cpp`).
- Antialiasing (`antialias.cpp`).
- Temas em `graphics/`.

## Escopo
- Render da sala atual escalada mantendo proporção 472×354; opção de salas vizinhas (D-05).
- Texturas por tema com fallback procedural.
- Cache de sala como textura (render once).

## Critérios de aceite
- [x] Comparação visual lado a lado com screenshots do original (OG-002) para 5 mapas e 3 temas.
- [x] 60 fps estáveis.

## Notas técnicas
- —

## Notas de implementação
- **Spec:** [`plan/specs/render-salas.md`](../specs/render-salas.md): layout das salas (`RoomLayoutManager`), ponto de vista (`viewTopLeft`), imagem da sala (`drawRoomBackground`), névoa e cache.
- **Achado — "visão original":** o default do código é 2 salas com rolagem, mas o `config/client.cfg` distribuído usa **1 sala, sem rolagem e sem tema**, ou seja, chão verde-escuro e paredes verdes das cores de fábrica (`src/colour_def.inc`). A web segue o distribuído, como no D-01 e no D-05. Tema, salas na tela e texturas contínuas ficam em Opções.
- **Código (`apps/web/src/game/render/`):**
  - `layout.ts`: port de `RoomLayoutManager::set`, `room_offset_x/y`, salas desenhadas, `getViewStartCoord`/`splitCompositeCoord`/`viewTopLeft` e detecção de mapa que dá a volta;
  - `theme.ts`: cores (fábrica + `colours.txt` do tema) e texturas 0..7 com o fallback do original (textura 0, depois cor sólida);
  - `room-painter.ts`: imagem da sala em Canvas 2D, na ordem do original: chão 0, áreas de chão, marcas de bandeira (gradiente com o alfa de `FlagmarkerPixelSource`), borda de meio pixel e paredes (retângulo, triângulo, círculo, anel, setor);
  - `room-worker.ts` e `room-source.ts`: pintura num Web Worker (OffscreenCanvas), com fila priorizada (salas na tela primeiro, depois as vizinhas). Sem OffscreenCanvas, pinta na thread principal;
  - `world-renderer.ts`: PixiJS 8 com uma textura por sala, cache LRU (vista + moldura de vizinhas), placeholder na cor do chão enquanto a sala não chega e névoa (`playfield_fog`, alfa 0x38).
- **`game/host.ts`:** cria o PixiJS (o canvas é dele) e, até a conexão do OG-064, mostra um mapa. Setas trocam de sala; PageUp/PageDown mudam quantas salas aparecem. Na URL: `/play?map=&theme=&rooms=&room=`. `data-status="ready"` na tela do jogo indica que as salas da primeira vista foram pintadas (usado nas comparações; servirá ao E2E do OG-101).
- **Pipeline de assets:** o manifesto ganhou `defaultColours` (151 cores de `colour_def.inc`) e `maps` (arquivos de `maps/` e `cmaps/` copiados como estão, com hash).
- **Oráculo:** `replay` aceita `--cfg "N VALOR"` (troca linhas do `client.cfg`: tema, salas visíveis, antialiasing) e `--prefix`; `server --map` aceita mapas de `cmaps/`.
- **Comparação visual (critério 1):** `tools/visual-compare` (`refs`, `compare`, `fps`).
  - 5 mapas (coliseu: arcos e setores; 6_askelta: anéis; sisso: áreas de chão; arena: triângulos, círculos, chão e paredes texturizados; outgun1: 6x6 retângulos) × 3 temas (sem tema, Ice, Grass) × (mapa inteiro, 1 sala) = **30 pares lado a lado**;
  - **pixels diferentes: no máximo 0,73%, média 0,29%**. O que difere são jogadores, power-ups e bandeiras que o original desenha por cima;
  - prints em `tools/parity/out/prints/og061/` e tabela em `relatorio.md` (fora do git).
  - No contêiner, a Allegro desvia levemente as cores ao desenhar no X (`#104000` vira `#073e00`). A captura foi testada e é fiel; detalhes na spec.
- **60 fps (critério 2):** `fps.mjs` no Chrome com GPU, janela 1280x960 com densidade 2 (canvas 2560x1920).
  - 1 sala com Ice trocando de sala a cada 250 ms, 36 salas com Ice e 1 sala sem tema: **60,0 fps, pior quadro 16,8 ms**.
  - Antes do worker, a troca de sala com textura levava 67 a 83 ms (pintura na thread principal).
  - Só no primeiro segundo após carregar o mapa há quadros longos (aquecimento do worker e pré-pintura).
- **Divergências (D-13):** antialiasing do Canvas 2D em vez do `SceneAntialiaser`, com paredes da mesma textura unidas para não haver costura; textura com 1 texel = 1 pixel CSS; sem o modo sem antialiasing e sem o modo info do mapa.
- **Testes:** `layout.test.ts` (vetores da spec, rolagem, borda, repetição, mapas que dão a volta) e `room-painter.test.ts` (escala, ângulos, marca de bandeira, fallback de texturas e cores), mais os do pipeline (cores de fábrica e mapas).
- **Para o OG-062/065:** o layout da tela inteira (`make_layout`: barra de baixo, minimapa e placar à direita) ainda não foi portado; hoje a área de jogo é o canvas todo. A névoa por sala já existe (`render(topLeft, fogged)`) e espera as visibilidades do OG-064.
- Branch: `og-061-renderer-world` (empilhada sobre `og-060-web-shell`).
