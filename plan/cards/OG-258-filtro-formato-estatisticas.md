# OG-258 — Rating por formato e filtro (3x3/4x4/5x5) no ranking, perfil e partidas

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 5 pts |
| Sprint | S19 |
| Status | Concluído |
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
- [x] Partidas sem formato (anteriores ao OG-250) só aparecem em "Todos".
- [x] Testes: o geral é igual à soma dos formatos (mais o histórico sem formato); consultas filtradas.

## Notas de implementação
- `ratings` continua sendo o geral; `format_ratings` (migration 0023) guarda cada formato e recebe os mesmos deltas quando a partida (ou a sala do delta de saída) tem formato — o geral = formatos + acumulado sem formato por construção. A migration copia o que já foi jogado com formato.
- Leaderboard por formato lê `format_ratings` ao vivo também em temporadas encerradas (a classificação final guardada na virada é só do geral).
- Ticket de sala com formato leva o rating daquele formato (modificador de time e deltas usam a força no formato).
- Cliente: abas "Todos / 3x3 / 4x4 / 5x5" (`?format=` na URL) no ranking e no perfil; no perfil o filtro vale para o ranking, os números do Ranked e as partidas recentes.
