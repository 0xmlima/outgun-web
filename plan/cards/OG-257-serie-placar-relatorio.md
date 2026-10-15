# OG-257 — Série no jogo e no relatório: placar, próximo jogo e fim

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S18 |
| Status | Em revisão |
| Dependências | [OG-250](OG-250-formatos-series-ranked.md), [OG-256](OG-256-tela-lobby-ranked.md), [OG-265](OG-265-protecao-visual-hud.md) |
| Regras de negócio | RN-RKL-03, RN-UI-05 |
| Skills | `outgun-card-workflow` |

## História
Como jogador de uma md3/md5, quero ver o placar da série durante e depois dos jogos, para acompanhar a disputa inteira.

## Escopo
- Placar da série no HUD/placar e na tela de fim de jogo; ao fim de um jogo que não encerra a série, todos voltam **direto ao lobby** da sala (voto do próximo mapa, vagas reabertas); ao fim da série — ou de uma md1 — todos voltam ao **menu inicial** (D-41).
- Relatório da partida (OG-214) mostra formato, série, número do jogo e links para os outros jogos; página da série com o resultado final.

## Critérios de aceite
- [x] md3: os três relatórios ligam entre si e mostram o resultado da série (conferido com md3 empatada 0 × 0; o caso 2-1 usa o mesmo `winner` da API, sem tela própria).
- [x] `pnpm visual:check` (OG-265) sem diferença fora da área nova do placar da série; conferido numa partida online de verdade, com capturas para o PO.

## Notas de implementação
- API: `/matches/:id` traz `format`, `gameNo` e `series` (placar, vencedor e os jogos); rota nova `GET /series/:id`. Cliente: bloco "Série" no relatório (jogo atual destacado, links para os outros) e página `/series/:id`.
- Partida: faixa "Melhor de N · Jogo X de N · Vermelho a × b Azul" no topo central (área nova, DOM; só em sala com série), também no placar final. A tela do lobby só volta depois de `game_end_delay`; no fim da série (ou md1) mostra o resultado e volta ao menu inicial em 10 s (D-41). "Ver relatório" fica dentro do lobby.
- Conferido com 6 contas numa md3 de verdade (jogos de 1 min): faixa, placar final, lobby entre jogos, fim da série, relatórios ligados e página da série. `visual:check` (sem série): 16/16 iguais.
