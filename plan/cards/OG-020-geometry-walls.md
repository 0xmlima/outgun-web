# OG-020 — Geometria e paredes (colisão contínua)

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S2 |
| Status | Backlog |
| Dependências | [OG-004](OG-004-constants-and-units.md), [OG-010](OG-010-map-parser.md) |
| Regras de negócio | RN-FIS-08, RN-FIS-09 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero que jogadores e foguetes colidam com paredes exatamente como no original, para que os mapas joguem igual.

## Contexto e referências no original
- `RectWall/TriWall/CircWall::intersects_circ`, `intersects_rect` (`world.cpp:120-295`).
- `Room::genGetTimeTillWall`, `fall_on_wall` (`world.cpp:333-375`).
- `tryBounce` (`world.cpp:1069-1165`).
- `getTimeTillBounce`, `getTimeTillWall`, `getTimeTillCollision` (`world.cpp:1163-1210`).

## Escopo
- `Vec`, `Coords`, `WorldCoords` em `packages/sim`.
- Paredes retangulares, triangulares e circulares (anel, setor com ângulos).
- Tempo até impacto e vetor de reflexão.
- Checagem `fall_on_wall` para spawns e power-ups.

## Critérios de aceite
- [ ] Testes de paridade por função com 10.000 casos aleatórios gerados no C++ (tolerância 1e-9).
- [ ] Cenários de trace de quique (reto, canto, triângulo, círculo, setor) idênticos.

## Notas técnicas
- Manter a mesma ordem de operações de ponto flutuante do C++ para evitar drift.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
