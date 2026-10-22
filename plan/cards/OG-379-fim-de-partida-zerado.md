# OG-379 — Fim de partida com os números zerados no Casual

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S39 (2.39.1) |
| Status | Em revisão |
| Dependências | OG-344 |
| Regras de negócio | D-63 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver no fim da partida os números de verdade de cada um, para saber como fui sem abrir o relatório.

## Contexto
- Achado do PO em 2026-10-22: o modal do fim de partida vem zerado; o relatório (outra aba) tem os números.
- Causa: no Casual a partida acaba **dentro** de `simulateFrame` (`onGameOver` → `nextMap` → `sim.changeMap` → `resetWorld` zera `pl.stats`). Logo depois, no mesmo tick, o laço de `Room.tick` (o `running` foi calculado antes) vê os contadores mudados e manda `frags` e `stats` **zerados** a todos, depois do `gameOver`. O modal refaz o retrato a cada 250 ms enquanto aberto (para pegar o placar da série) e pega os zeros. No Ranked não acontece (a série não troca de mapa ali).

## Escopo
- Servidor: não mandar `frags`/`stats`/placar do time no tick em que a partida acabou (a partir do `gameOver`, só depois do `startGame`).
- Cliente: o modal congela os jogadores no primeiro retrato; só o placar da série continua atualizando.
- Teste no game server: fim por captura no Casual não manda contadores zerados depois do `gameOver`.

## Critérios de aceite
- [x] Partida Casual que acaba por captura ou tempo mostra no modal os mesmos números do relatório (teste no `room.test.ts`: nenhum contador depois do `gameOver`; frags finais > 0).
- [x] Placar da série no Ranked continua chegando ao modal (o retrato só troca a série).

## Notas de implementação
- `Room.sendCounters()` sai no `onGameOver` (antes do `gameOver`) e no tick só quando a partida não acabou nele; o placar zerado do mapa seguinte passa a chegar no recomeço. Modal: `setMatchEnd` mantém os jogadores do primeiro retrato e só troca `series`.
