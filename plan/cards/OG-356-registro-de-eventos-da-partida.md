# OG-356 — Registro de eventos da partida (multi-kill, troca, quem matou quem)

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Could |
| Estimativa | 8 pts |
| Sprint | — |
| Status | Quebrado |
| Dependências | OG-355 |
| Regras de negócio | RN-LDB-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero stats como multi-kill, troca e "abates no melhor jogador", para que o leaderboard mostre jogadas que dependem do momento de cada abate.

## Escopo
- Registro compacto dos eventos de cada ranqueada (abate com matador, vítima, momento e sala; ações de bandeira), enviado com o relatório e guardado na API.
- Stats derivados: multi-kill (2+ abates em poucos segundos), troca (matar quem acabou de matar um aliado), primeiro abate da disputa, abates por vítima.
- **Quebrado no planejamento da S38 (2026-10-22)** em OG-362 (registro dos eventos), OG-363 (multi-kill, troca e primeiro abate) e OG-364 (quem matou quem).

## Notas de implementação
(preenchido durante a execução)
