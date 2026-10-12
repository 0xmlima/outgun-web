# OG-040 — Núcleo do game server (salas, loop 10 Hz)

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S5 |
| Status | Em andamento |
| Dependências | [OG-029](OG-029-match-lifecycle.md) |
| Regras de negócio | RN-TIM-04 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero entrar numa sala online e jogar com outras pessoas em tempo real.

## Contexto e referências no original
- `Server::loop` (`server.cpp:1868`).
- Seção 5.3 do PLAN (modelo de rede).

## Escopo
- `apps/game-server` com uWebSockets.js, várias salas por processo.
- Loop de 10 Hz com compensação de drift (timer de alta resolução).
- Ciclo de vida da sala: criação a partir de preset + rotação de mapas, entrada/saída, encerramento quando vazia.
- Healthcheck e métricas básicas.

## Critérios de aceite
- [x] Duas abas do navegador conectam e veem o mesmo estado. — coberto por teste de integração com dois clientes WebSocket reais; página `/dev` pronta para conferência manual (a extensão do navegador não estava conectada para o print).
- [x] Tick estável em 100 ms ± 2 ms com 32 conexões simuladas. — medido: p50 0,43 ms, p95 1,54 ms, máx. 1,58 ms.
- [x] Sala vazia é encerrada após timeout configurável.

## Notas técnicas
- —

## Notas de implementação
- `apps/game-server`: `FixedRateLoop` (ticks em `início + n × 100 ms`, sem acumular atraso; descarta ticks perdidos após parada longa), `RoomManager` (um loop para todas as salas, encerra vazias após `emptyTimeoutMs`, salas fixas ficam), `Room` (entrar/sair, entradas, 10 Hz, frames e eventos, fim de partida), transporte uWebSockets.js (D-03) em `/rooms/:id`, `/health`, `/metrics` (formato Prometheus), `/rooms` e a página de depuração `/dev` (`pnpm --filter @outgun/game-server start`, porta 7000).
- Fiel ao original: entrada como em `client_connected` (spawn na base, morto até `clientReady`), recomeço da partida quando entra o 2º jogador, entradas aplicadas ao chegar (`incoming_client_data` + `data_fire_on/off`), frags enviados quando mudam, fim de partida síncrono com troca para o próximo mapa da rotação e 5 s (`game_end_delay`) sem simulação — igual aos traces (`match-sudden-death`: 50 frames).
- Sim: `addPlayer`/`removePlayer` (`client_connected`/`removePlayer` do original) e hook `kill` (`broadcast_kill`).
- Provisório até os próximos cards: ticket `dev:Nome` (API no OG-083), frame só com jogadores da mesma sala sem shadow/minimapa (OG-042), sem validação de entrada (OG-043), time pelo menor e menor pid livre (OG-044), rotação sequencial sem votos (OG-045).
- `check:licenses` corrigido: `pnpm licenses list` voltava vazio no pnpm 12 e não via dependências do GitHub; agora percorre `pnpm ls --prod`. uWebSockets.js é Apache-2.0 (permitido, obra combinada sob GPLv3+, como já previsto no checker). O binário do uWS cobre Node 20/22/23/24.
