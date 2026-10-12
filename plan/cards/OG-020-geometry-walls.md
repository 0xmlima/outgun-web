# OG-020 — Geometria e paredes (colisão contínua)

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S2 |
| Status | Em revisão |
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
- [x] Testes de paridade por função com 10.000 casos aleatórios gerados no C++ (tolerância 1e-9).
- [ ] Cenários de trace de quique (reto, canto, triângulo, círculo, setor) idênticos. _(os traces precisam do movimento do OG-021; conferidos lá)_

## Notas técnicas
- Manter a mesma ordem de operações de ponto flutuante do C++ para evitar drift.

## Notas de implementação
- **Spec:** `plan/specs/geometria-quiques.md`.
- **Código:**
  - `packages/sim/src/geometry/bounce.ts`: `bounceFromPoint`/`Line`/`Arc`, `timeTillPlayerRocketCollision`, `timeTillPlayerPlayerCollision`, `NO_HIT`.
  - `tryBounce` nas três paredes (`walls.ts`), mantendo a ordem de avaliação e o desempate estrito.
  - `Room.timeTillWall` (`map.ts`).
- **Paridade:** fixture `bounces.cpp` com 13.800 consultas de parede (2.537 impactos) em todas as salas dos 46 mapas válidos, mais 2.000 jogador × foguete e 2.000 jogador × jogador.
  - As colisões entre círculos são idênticas bit a bit.
  - Nas paredes, 800 impactos diferem em até 1e-13.
- **Causa comprovada:** o `-ffast-math` do jogo distribuído. Com a imagem `outgun-oracle:nofastmath` (mesmo código, sem a flag), **0 diferenças em 100% dos casos**. O port é fiel ao código-fonte; os testes usam tolerância relativa de 1e-9.
- Branch: `og-020-geometry-walls`.
