# OG-086 — Registro de salas e matchmaking

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S9 |
| Status | Em revisão |
| Dependências | [OG-080](OG-080-api-db.md), [OG-040](OG-040-game-server-core.md) |
| Regras de negócio | RN-CFG-03 |
| Skills | `outgun-card-workflow` |

## História
Como plataforma, quero saber quais salas existem e onde, para listar no lobby e alocar jogadores.

## Contexto e referências no original
- Master server do original (`servnet.cpp:2481-2580`, `config/master.txt`).

## Escopo
- Game servers registram salas e heartbeat no Redis (modo, jogadores, mapa, preset, região).
- Salas Ranked são criadas pela plataforma com o preset Ranked; "Jogar agora" funciona por modo.
- API cria salas sob demanda no servidor menos carregado.
- "Jogar agora": sala pública com vagas mais próxima do ping do jogador.

## Critérios de aceite
- [x] Sala some do lobby em ≤ 10 s após o servidor cair.
- [x] Criação de sala privada responde em < 1 s.

## Notas técnicas
- —

## Notas de implementação
- **Decisão D-24** (PLAN seção 12): registro no PostgreSQL, sem Redis. Migration `0004_game_servers` (tabela `game_servers`; `rooms.maps` para a rotação própria de sala privada).
- **Heartbeat** (`apps/game-server/src/platform.ts`, `startHeartbeat`): a cada 3 s, `POST /internal/rooms/heartbeat` com `server { wsBaseUrl, region, maxRooms }` e as salas (`RoomManager.hosted()`). A API considera no ar o que mandou heartbeat há < 10 s (`apps/api/src/registry.ts`); sala que o servidor encerrou sai do ar no heartbeat seguinte. Variáveis novas do game server: `PUBLIC_WS_URL`, `REGION`, `MAX_ROOMS`, `RANKED_ROTATION`, `HEARTBEAT=0`.
- **Abertura sob demanda**: a API não chama o game server. O ticket de entrada leva a claim `spawn` (nome, modo, preset, vagas, mapas, persistente) quando a sala não está no ar; o servidor escolhido (o da sala, se no ar; senão o menos carregado, região pedida primeiro) cria a sala ao receber o primeiro ticket (`apps/game-server/src/spawn.ts`). Ranked sempre usa a rotação oficial (`RANKED_ROTATION`); mapas desconhecidos saem da rotação; sem vaga (`MAX_ROOMS`) → `roomClosed`.
- **Rotas**: `GET /rooms?mode=` (no ar + salas da plataforma abríveis; campos novos `persistent`, `region`), `POST /rooms/quick-join` ("Jogar agora": sala pública no ar com vaga e mais gente, região pedida primeiro; senão a da plataforma), `POST /rooms` (sala privada Casual, só com conta, 10/h; preset Ranked recusado; `inviteUrl` = `WEB_URL/play?room=<id>`; apagada após 1 h fora do ar). OpenAPI regenerada.
- **Ping por região**: a escolha usa a região informada pelo cliente; medir o ping de cada região fica para o lobby (OG-069). Hoje há uma região (`local`).
- **Prova**: testes em `apps/api/src/routes/registry.test.ts`, `apps/game-server/src/{spawn,server,platform}.test.ts`. E2E local (API + game server reais): criar sala privada 35 ms; Ranked, sala privada e "Jogar agora" abertos pelo ticket; servidor morto com `kill -9` → salas fora do lobby em 7,8 s.
