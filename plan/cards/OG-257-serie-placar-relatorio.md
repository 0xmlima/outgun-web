# OG-257 — Série no jogo e no relatório: placar, próximo jogo e fim

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S17 |
| Status | Backlog |
| Dependências | [OG-250](OG-250-formatos-series-ranked.md), [OG-256](OG-256-tela-lobby-ranked.md), [OG-265](OG-265-protecao-visual-hud.md) |
| Regras de negócio | RN-RKL-03, RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de uma md3/md5, quero ver o placar da série durante e depois dos jogos, para acompanhar a disputa inteira.

## Escopo
- Placar da série no HUD/placar e na tela de fim de jogo; ao fim de um jogo que não encerra a série, todos voltam ao lobby (voto do próximo mapa).
- Relatório da partida (OG-214) mostra formato, série, número do jogo e links para os outros jogos; página da série com o resultado final.

## Critérios de aceite
- [ ] md3 2-1: os três relatórios ligam entre si e mostram o vencedor da série.
- [ ] `pnpm visual:check` (OG-265) sem diferença fora da área nova do placar da série; conferido numa partida online de verdade, com capturas para o PO.

## Notas de implementação
(preenchido durante a execução)
