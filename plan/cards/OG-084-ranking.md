# OG-084 — Ranking e temporadas

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Port |
| Prioridade | Must |
| Estimativa | 8 pts |
| Sprint | S9 |
| Status | Concluído |
| Dependências | [OG-083](OG-083-join-ticket.md), [OG-028](OG-028-scoring-stats.md) |
| Regras de negócio | RN-RNK-01, RN-RNK-02, RN-RNK-03, RN-RNK-04, RN-PTS-02, RN-MOD-05 |
| Skills | `outgun-re-spec` |

## História
Como jogador competitivo, quero um ranking global justo por temporada.

## Contexto e referências no original
- `Server::score_frag`, `score_neg`, `refresh_team_score_modifiers`, `rankingEnabled` (`server.cpp:450-515`).
- Envio de deltas (`servnet.cpp:924-960`).
- Participação (`data_ranking_participation`).

## Escopo
- Só salas **Ranked** (sem power-ups, RN-MOD-02/05) geram deltas; salas Casual nunca alteram o ranking.
- Game server calcula deltas (score com modificador de time, neg) e envia resultado assinado ao fim da partida e na saída do jogador.
- API aplica de forma idempotente (id da partida + jogador).
- Leaderboard em Redis (sorted set) + persistência em Postgres; temporadas.
- Opt-out de participação no ranking.

## Critérios de aceite
- [x] Testes reproduzindo o cálculo do original para cenários com times desbalanceados (modificador limitado a [1/3, 3]).
- [x] Partida abaixo dos mínimos de humanos/jogadores não altera ranking.
- [x] Partida Casual não altera ranking.
- [x] Reenvio do mesmo resultado não duplica pontos.

## Notas técnicas
- Resolver D-02 antes de fechar.

## Notas de implementação
- Spec: [`plan/specs/ranking.md`](../specs/ranking.md). Decisões D-02 (rating clássico, já decidida) e **D-25** (cálculo no game server, soma por temporada na API).
- **Game server** (`apps/game-server/src/ranking.ts`): `teamModifiers` (`refresh_team_score_modifiers`), `RankingDeltas` (`fdp`/`fdn`, truncamento, envio só de inteiro ≠ 0 e perda da fração). A sala liga os hooks `scoreFrag`/`scoreNeg` da sim; acumula só em sala Ranked com os mínimos e para contas que participam. Envio: com o resultado da partida (`ranked` = Ranked e mínimos ou algum delta) e por `POST /internal/rating-deltas` na saída, troca de mapa por voto, reinício com o 2º jogador e parada do servidor (que agora espera os envios pendentes).
- **`getLessScoredTeam`** agora usa o modificador (pendência da S7): o time mais fraco recebe o novo jogador no empate de humanos. A força vem do ticket (`rating`), também nas salas Casual, como no original.
- **API**: migration `0005_ranking` (`player_profiles.ranking_participation`, `rating_deltas`, índice do leaderboard); `applyDeltas` soma por temporada; `GET /leaderboard`, `GET /seasons`, `GET|PUT /account/ranking`; CLI `season start`. `scoreDelta` passa a ser inteiro com sinal (frag negativo × modificador) e partida não ranqueada não pode trazer deltas.
- **Sem Redis** (D-24): o leaderboard é consulta indexada no PostgreSQL — o "sorted set" do escopo não foi necessário nesta escala.
- `playerInfo` agora leva posição, score e neg da temporada (o HUD/F4 do cliente usa no OG-066).
- Testes: `apps/game-server/src/ranking.test.ts` (vetores da spec, deltas na sala, saída, opt-out, Casual, time do novo jogador) e `apps/api/src/routes/ranking.test.ts` (idempotência, Casual, leaderboard, ticket, opt-out, nova temporada).
