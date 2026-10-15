# OG-273 — Estatísticas do clã

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S19 |
| Status | Em revisão |
| Dependências | [OG-270](OG-270-clas-cadastro-api.md), [OG-259](OG-259-cla-vs-cla-marcos.md) |
| Regras de negócio | RN-CLA-06 |
| Skills | `outgun-card-workflow` |

## História
Como membro ou visitante, quero ver os números de um clã, para conhecer o histórico dele.

## Escopo
- Partidas e séries **clã x clã** (OG-259): jogos, vitórias, derrotas, empates, séries vencidas, adversários mais frequentes e retrospecto contra cada um.
- Números dos membros enquanto estavam no clã (partidas, kills, capturas), por temporada e no geral.
- Gravar o `clan_id` de cada jogador em `match_players` no fim da partida (a tag e o clã da época valem, mesmo que ele saia depois).

## Critérios de aceite
- [x] Testes: membro que sai do clã não leva nem apaga os números antigos do clã.
- [x] Estatísticas na página do clã (OG-272).

## Notas de implementação
- `match_players.clan_id` já é gravado desde o OG-259; números saem de `apps/api/src/clan-stats.ts` (reaproveitável pelo OG-274) e da rota `GET /clans/:tag/stats?season=`.
- "Por temporada" = partidas terminadas no intervalo da temporada; membros contam partidas de qualquer modo jogadas com o clã. Adversário apagado some da lista de adversários (continua nos totais).
- Página do clã: painel "Estatísticas" com abas Temporada atual/Geral (clã x clã, séries vencidas, adversários com retrospecto e membros pelo clã).
