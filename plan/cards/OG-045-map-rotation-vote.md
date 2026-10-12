# OG-045 — Rotação e votação de mapas

| Campo | Valor |
|---|---|
| Épico | E3 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S7 |
| Status | Pronto |
| Dependências | [OG-040](OG-040-game-server-core.md) |
| Regras de negócio | RN-VOT-01, RN-VOT-02, RN-VOT-03, RN-VOT-04, RN-VOT-05 |
| Skills | `outgun-re-spec` |

## História
Como jogador, quero votar no próximo mapa e para encerrar o atual.

## Contexto e referências no original
- `Server::check_map_exit` (`server.cpp:775`).
- `Server::server_next_map` (`server.cpp:565`).
- Votos negativos (`data_negative_map_votes`).

## Escopo
- Votos por mapa, voto de saída, votos negativos, bloqueio por tempo, escolha do próximo mapa, rotação aleatória.

## Critérios de aceite
- [ ] Testes cobrindo empate por tempo desde último jogo, sem votos e com votos negativos.
- [ ] Bots não contam na votação.

## Notas técnicas
- Bots (IA) são do OG-048 (S10): para o critério 2 basta um jogador marcado como bot na sala, sem IA.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
