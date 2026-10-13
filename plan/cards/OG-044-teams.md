# OG-044 — Times: entrada, troca e balanceamento

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S7 |
| Status | Em revisão |
| Dependências | [OG-040](OG-040-game-server-core.md) |
| Regras de negócio | RN-TIM-01, RN-TIM-02, RN-TIM-03, RN-TIM-05 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero ser colocado num time equilibrado e poder trocar de time, como no original.

## Contexto e referências no original
- `ServerNetworking::client_connected` (`servnet.cpp:1333-1420`).
- `check_player_change_teams`, `move_player`, `swap_players`, `balance_teams` (`server.cpp:216-390`).
- Cores favoritas (`server.cpp:420-445`).

## Escopo
- Alocação na entrada, troca (Ctrl+End), balanceamento/shuffle por mapa, cores pessoais.

## Critérios de aceite
- [x] Testes unitários para cada ramo da RN-TIM-02.
- [x] Entrada com sala cheia de bots substitui um bot.

## Notas técnicas
- Bots (IA) são do OG-048 (S10): para o critério 2 basta um jogador marcado como bot na sala (`playerJoined.bot`), sem IA; a regra de substituição fica pronta para o OG-048.

## Notas de implementação
- Spec: [plan/specs/times.md](../specs/times.md). Sem divergências do original (ranking da RN-TIM-01 entra no OG-084).
- **Regras puras** em `apps/game-server/src/teams.ts` (entrada, pedido de troca, bot que sai, bot que equilibra, `balance_teams`, `shuffle_teams`, cores), com 20 testes cobrindo cada ramo (`teams.test.ts`).
- **Sim**: `movePlayer` e `swapPlayers` (larga a bandeira desfazendo o frag, reinicia quem está vivo, leva foguetes, explosões e atacante de deathbringer).
- **Servidor**: `Room.addBot`/`removeBot` (bots marcados, sem IA; proibidos no Ranked), entrada com substituição de bot, `changeTeam` on/off, verificação a cada tick (`server_think_after_broadcast`), balanceamento a cada mapa conforme `balance_teams`, cores pessoais (16 por time, favoritas via `favoriteColors`), `teamChange` para todos e o pid novo para o transporte.
- **Cliente**: a sessão move/troca o jogador (e o "eu"), guarda as cores pessoais; Ctrl+End pede/cancela, "CHANGE TEAMS" (traduzido) pisca no canto da área de jogo; mensagens "trocaram de time"/"foi para o time ..." e som `chanteam`. Os jogadores passam a ter as cores pessoais do servidor (antes `pid % 16`).
- Roteiro no navegador: `tools/visual-compare/teams.mjs` (pedido sozinho não troca; dois pedidos trocam); prints `og044-*.png`.
