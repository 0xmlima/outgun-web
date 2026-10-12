# OG-061 — Renderer PixiJS: salas e paredes

| Campo | Valor |
|---|---|
| Épico | E4 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S6 |
| Status | Backlog |
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
- [ ] Comparação visual lado a lado com screenshots do original (OG-002) para 5 mapas e 3 temas.
- [ ] 60 fps estáveis.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
