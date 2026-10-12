# OG-029 — Ciclo da partida, spawn e respawn

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S5 |
| Status | Backlog |
| Dependências | [OG-027](OG-027-flags-capture.md) |
| Regras de negócio | RN-PAR-*, RN-SPW-* |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero que a partida comece, tenha tempo, prorrogação, morte súbita e termine como no original.

## Contexto e referências no original
- `respawnPlayer` (`world.cpp:1807`), `resetPlayer`, `killPlayer`, `suicide`.
- Respawn justo (`world.cpp:3516-3545`), `getRespawnTime` (`world.cpp:1627`).
- Tempo/limites em `simulateFrame` (`world.cpp:3560-3612`).
- `Server::server_next_map` (gameover) (`server.cpp:565`).

## Escopo
- Spawn inicial em spawn points, respawn em áreas ou sala desocupada.
- Tempos de respawn com balanceamento e penalidades.
- Proteção de spawn.
- Limites de captura/tempo, prorrogação, morte súbita, avisos de tempo, estado de game over.

## Critérios de aceite
- [ ] Traces de partidas com time_limit + extra_time + sudden_death idênticos.
- [ ] Ordem de respawn entre times idêntica.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
