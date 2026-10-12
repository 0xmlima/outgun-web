# OG-029 — Ciclo da partida, spawn e respawn

| Campo | Valor |
|---|---|
| Épico | E2 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S5 |
| Status | Em andamento |
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
- [x] Traces de partidas com time_limit + extra_time + sudden_death idênticos.
- [x] Ordem de respawn entre times idêntica.

## Notas técnicas
- —

## Notas de implementação
- Spec: [ciclo-partida.md](../specs/ciclo-partida.md). Código em `packages/sim/src/world/server.ts` (seção "ciclo da partida").
- Paridade: `respawn-order`, `match-time-win`, `match-sudden-death`, `match-extra-time` e `bots-match` (partida livre de 6 bots, 600 frames) idênticos ao original; `rocket-hit` e `pup-drop-at-death` deixaram de ser limitados. Total: 40 de 44 traces idênticos, 4 conferidos em @outgun/settings, nenhum pendente.
- Achado: no original o fim de partida (`server_next_map`) roda no meio do frame, e o resto do frame já acontece no mapa reiniciado. A sim reproduz isso com o hook síncrono `gameOver`, dentro do qual o servidor chama `changeMap`.
- Oráculo: o trace passou a gravar `extraTimePeriod` e `lastSpawn`; nova diretiva `flagreset F` (os bots jogam antes do `start` e pegam bandeiras); `at`/`suicide` ignoram PIDs vazios (slots vazios do original têm `dead = false`). `trace-schema.md` atualizado com todas as diretivas.
- Os traces com reinício de mapa só rodam em resync: o `start_game` acontece fora do frame gravado e sorteia power-ups com `rand()` não registrado.
- Balanceamento de times no reinício (`balance_teams`), votação de mapas e placar de fim de partida ficam com o servidor de sala (OG-040 e cards de E3).
