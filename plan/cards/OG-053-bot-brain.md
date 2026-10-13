# OG-053 — Bots: decisões de bandeira e power-up e laço principal

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Pronto |
| Dependências | [OG-051](OG-051-bot-navigation.md), [OG-052](OG-052-bot-combat.md) |
| Regras de negócio | RN-BOT-02 |
| Skills | `outgun-re-spec`, `outgun-parity-harness` |

## História
Como jogador, quero bots que joguem CTF (pegar, levar, defender bandeira e buscar power-ups), para partidas completas com bots.

## Contexto e referências no original
- `src/robot.cpp:797-975` (`GetPowerup`, `captureOnFlag`, `pickUpFlag`, `GetFlag`, `Teams`, `AmILast`, `Escape`, `FollowFlag`).
- `src/robot.cpp:1160-1905` (`flagIgnored`, `ChooseDestination`, `Target*`, `updateUnknownPosition`, `getRobotControls`, `RobotMain`).
- `src/robot.cpp:1906-2112` (cliente virtual, `bot_ping`, mensagens de time).
- `botTestMode` em `src/server.cpp` para estatística de referência.

## Escopo
- Bot como cliente virtual no game server, só com snapshots + inputs e ping simulado `bot_ping` (300 ms).
- Lidar com bandeiras removidas na carga (`random_wild_flag`, locks) — ver nota do OG-048.

## Critérios de aceite
- [ ] Bot × bot em `outgun1`: capturas/partida a ±20% do original em 50 partidas (critério herdado do OG-048).
- [ ] Custo ≤ 1 ms por tick com 30 bots (critério herdado do OG-048).
- [ ] `random_wild_flag 1` com bots não derruba a sala.

## Notas técnicas
- Parte da quebra do [OG-048](OG-048-bots.md) (refinamento da S10).

## Notas de implementação
(preenchido durante a execução)
