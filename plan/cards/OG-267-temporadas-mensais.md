# OG-267 — Temporadas mensais automáticas e ranking geral de todas as temporadas

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S16 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-RKL-22, RN-RKL-23 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero que o ranking recomece todo mês e que exista um ranking de todos os tempos, para ter sempre uma disputa nova sem perder a história.

## Contexto
- `seasons` (OG-084) com uma temporada `active`, trocada manualmente.

## Escopo
- Virada automática no dia 1 de cada mês às 00:00 (horário de Brasília, D-48): fecha a temporada, guarda a classificação final (`season_standings`) e abre a nova ("Temporada 2026-11").
- Ranking **geral**: soma de score e neg de todas as temporadas, `rating = (score+1)/(neg+1)`; também por formato (com o OG-258).
- `/ranking`: seletor "Temporada atual / temporadas anteriores / Geral".
- Virada idempotente (dois processos ou reinício no meio não criam duas temporadas); partida que termina na virada conta na temporada em que começou.

## Critérios de aceite
- [x] Testes: virada no fim do mês, virada repetida, partida na virada, geral = soma das temporadas.

## Notas de implementação
- `rollSeason` (advisory lock + `seasons.month` único) roda ao subir a API e a cada minuto (main.ts); a temporada ativa antiga, sem mês, vira a do mês corrente na primeira verificação — a primeira virada real é no próximo dia 1.
- Brasília fixo em UTC-3 (sem horário de verão desde 2019). `season_standings` guarda a final; partida que começou antes da virada vai para a temporada anterior e regrava a final dela. Deltas de quem saiu (`/rating-deltas`) continuam indo para a ativa.
- `/leaderboard` de temporada encerrada lê a final; `/leaderboard/overall` soma tudo. Por formato fica com o OG-258.
- `/ranking`: abas Temporada atual / Temporadas anteriores (seletor) / Geral.
