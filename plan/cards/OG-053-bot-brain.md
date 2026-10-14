# OG-053 — Bots: decisões de bandeira e power-up e laço principal

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S10 |
| Status | Em revisão |
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
- [x] Bot × bot em `outgun1`: capturas/partida a ±20% do original em 50 partidas (critério herdado do OG-048).
- [x] Custo ≤ 1 ms por tick com 30 bots (critério herdado do OG-048).
- [x] `random_wild_flag 1` com bots não derruba a sala.

## Notas técnicas
- Parte da quebra do [OG-048](OG-048-bots.md) (refinamento da S10).

## Notas de implementação
- Spec: [plan/specs/bots-ia.md](../specs/bots-ia.md); decisões D-29 a D-31.
- `packages/bots/src/brain.ts` (`Robot`): `GetPowerup`, `captureOnFlag`, `pickUpFlag`, `GetFlag`, `Escape`, `FollowFlag`, `flagIgnored`, `ChooseDestination` e `Target*`, `IsMission`, `updateUnknownPosition`, `getRobotControls`, `RobotMain` (`decide`). Achado: o original lê `map.tinfo[2]` (fora do vetor) para as bases selvagens, o que pelo layout de `Map` é `map.wild_flags`; e o cliente apaga as bases das bandeiras removidas pelo servidor — a visão do bot guarda as suas bases.
- **Paridade** (`packages/bots/src/parity.test.ts`, modo resync com o patch 002 do oráculo): 5 cenários, 22.726 decisões, **controles, tiro e estado do bot idênticos ao original em todas** (giro livre: `gunDir` ±1e-15).
- **Cliente virtual** (`apps/game-server/src/bot-client.ts`, D-31): o bot recebe os mesmos bytes de um humano com o atraso de `bot_ping`, decodifica com o `ClientSession` do netcode (modo `headless`, sem suavização) e manda `input`/`fire` à sala no fim do frame; chat de time "d"/"a" com a confirmação `.Roger`. A sala passa a mandar `flagModes` (estava no protocolo, mas não era enviado) e ganhou `botTest` (bots sem humanos, como o `-bottest`) e `gamemod` inicial.
- Critério 1: `node apps/game-server/dist/bot-stats.js` — 6 bots em outgun1, partidas de 3 min: **web 4,13 capturas/partida em 300 partidas (4,34 em 50)**; o original (`-bottest`, mesmas regras) fez **4,40 em 11.742 partidas** → −6 %.
- Critério 2: 30 bots numa sala de 32 (M-series, Node 24): **decisões 0,9 ms por frame**; o bot inteiro (decodificar, simular foguetes, decidir) 1,45 ms; a sala toda 2,0 ms. Otimizações sem mudar resultado: tabelas de distância com peso 0 compartilhadas por mapa, área do bot memorizada por decisão, busca de área sem alocação, clone leve para a extrapolação, broadcast decodificado uma vez para todos os bots.
- Critério 3: `bot-client.test.ts` — 8 bots com `random_wild_flag 1` jogam duas partidas sem erro (no original isso derruba o servidor: `bases[fi]` fora do vetor).
- Prints: `tools/parity/out/prints/og053-bots-*.png` (cliente web, 8 bots em outgun1: mortes, devolução e bots carregando bandeiras).
