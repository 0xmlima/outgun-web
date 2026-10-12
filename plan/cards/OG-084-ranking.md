# OG-084 — Ranking e temporadas

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S9 |
| Status | Backlog |
| Dependências | [OG-083](OG-083-join-ticket.md), [OG-028](OG-028-scoring-stats.md) |
| Regras de negócio | RN-RNK-01, RN-RNK-02, RN-RNK-03, RN-RNK-04, RN-PTS-02 |
| Skills | `outgun-re-spec` |

## História
Como jogador competitivo, quero um ranking global justo por temporada.

## Contexto e referências no original
- `Server::score_frag`, `score_neg`, `refresh_team_score_modifiers`, `rankingEnabled` (`server.cpp:450-515`).
- Envio de deltas (`servnet.cpp:924-960`).
- Participação (`data_ranking_participation`).

## Escopo
- Game server calcula deltas (score com modificador de time, neg) e envia resultado assinado ao fim da partida e na saída do jogador.
- API aplica de forma idempotente (id da partida + jogador).
- Leaderboard em Redis (sorted set) + persistência em Postgres; temporadas.
- Opt-out de participação no ranking.

## Critérios de aceite
- [ ] Testes reproduzindo o cálculo do original para cenários com times desbalanceados (modificador limitado a [1/3, 3]).
- [ ] Partida abaixo dos mínimos de humanos/jogadores não altera ranking.
- [ ] Reenvio do mesmo resultado não duplica pontos.

## Notas técnicas
- Resolver D-02 antes de fechar.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
