# OG-258 — Rating por formato e filtro (3x3/4x4/5x5) no ranking, perfil e partidas

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S19 |
| Status | Pronto |
| Dependências | [OG-250](OG-250-formatos-series-ranked.md) |
| Regras de negócio | RN-RKL-13, RN-SOC-02 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero filtrar estatísticas e partidas Ranked por formato, para comparar meu desempenho no 3x3, 4x4 e 5x5.

## Escopo
- Rating separado por formato (3x3, 4x4, 5x5) por temporada; rating geral = `(Σscore+1)/(Σneg+1)` somando os três formatos (D-42). Migration que separa o acumulado atual: o que existe hoje (sem formato) entra só no geral.
- API: parâmetro `format` nas rotas de perfil, partidas recentes e ranking; leaderboard por formato e geral.
- Cliente: filtro "Todos / 3x3 / 4x4 / 5x5" no perfil, na lista de partidas e no ranking; filtro guardado na URL.

## Critérios de aceite
- [ ] Partidas sem formato (anteriores ao OG-250) só aparecem em "Todos".
- [ ] Testes: o geral é igual à soma dos formatos (mais o histórico sem formato); consultas filtradas.

## Notas de implementação
(preenchido durante a execução)
