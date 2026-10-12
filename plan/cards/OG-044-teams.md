# OG-044 — Times: entrada, troca e balanceamento

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S7 |
| Status | Backlog |
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
- [ ] Testes unitários para cada ramo da RN-TIM-02.
- [ ] Entrada com sala cheia de bots substitui um bot.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
