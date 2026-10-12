# OG-027 — Bandeiras e captura

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S4 |
| Status | Backlog |
| Dependências | [OG-024](OG-024-health-energy-damage.md) |
| Regras de negócio | RN-FLG-01, RN-FLG-02, RN-FLG-03, RN-FLG-04, RN-FLG-05, RN-FLG-06, RN-FLG-07, RN-FLG-08, RN-FLG-09, RN-FLG-10 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero pegar, largar, devolver e capturar bandeiras com as regras do original, inclusive bandeiras selvagens e variantes.

## Contexto e referências no original
- `Flag`, `Team` (`world.h:640-780`, `world.cpp:3927-4070`).
- Pegar/devolver/capturar em `simulatePlayerPostPhysics` (`world.cpp:3240-3365`).
- `try_capture`, `is_near_base_for_capture` (`world.cpp:3367-3445`).
- `player_steals_flag`, `player_captures_flag`, `team_gets_carrying_point` (`world.cpp:3639-3697`).
- `dropFlagIfAny` (`world.cpp:1758`).

## Escopo
- Estados e transições de bandeira.
- Tabela das 13 combinações de captura.
- Locks, delays, tempo mínimo de captura, assistência, pontos por posse, respawn na captura.
- `random_wild_flag`.

## Critérios de aceite
- [ ] Teste parametrizado cobrindo cada linha da tabela de captura (yes/no) em cada combinação de settings.
- [ ] Traces de partida completa com bots (capturas e devoluções) idênticos.

## Notas técnicas
- Ler também `doc/gamemod.html` para a semântica das flags de modo.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
