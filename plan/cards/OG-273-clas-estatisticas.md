# OG-273 — Estatísticas do clã

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S19 |
| Status | Pronto |
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
- [ ] Testes: membro que sai do clã não leva nem apaga os números antigos do clã.
- [ ] Estatísticas na página do clã (OG-272).

## Notas de implementação
(preenchido durante a execução)
