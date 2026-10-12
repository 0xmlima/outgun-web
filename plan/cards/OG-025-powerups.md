# OG-025 — Power-ups

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S4 |
| Status | Backlog |
| Dependências | [OG-024](OG-024-health-energy-damage.md) |
| Regras de negócio | RN-PUP-01, RN-PUP-02, RN-PUP-03, RN-PUP-04, RN-PUP-05, RN-PUP-06, RN-PUP-07, RN-PUP-08, RN-PUP-09 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero os 7 power-ups com os mesmos efeitos, durações e frequências do original.

## Contexto e referências no original
- `PowerupSettings` (`world.h:994`, `world.cpp:1494-1576`).
- `respawn_powerup`, `check_powerup_creation`, `game_touch_powerup`, `drop_worst_powerup`, `drop_powerup` (`world.cpp:1928-2215`).
- Expiração e shadow em `simulatePlayerPrePhysics` (`world.cpp:3122`).

## Escopo
- Sorteio por peso, quantidade mínima/máxima (inclusive percentuais), respawn.
- Efeitos de cada tipo, acumulação de tempo, limite por jogador e descarte do pior.
- Compartilhamento por time e drop na morte.
- Power-ups iniciais.

## Critérios de aceite
- [ ] Com `GlibcRand`, sequência de power-ups gerados (tipo, sala, posição) idêntica ao trace por 3.000 frames.
- [ ] Cada efeito com teste unitário.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
