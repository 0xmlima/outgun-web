# OG-529 — OutCup: correções do teste de ponta a ponta antes da primeira edição

| Campo | Valor |
|---|---|
| Épico | E15 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | — |
| Status | Concluído |
| Dependências | OG-521, OG-525 |
| Regras de negócio | RN-CUP-06, RN-CUP-09 |
| Skills | `outgun-card-workflow` |

## História
Como jogador da OutCup, quero que a sala do confronto ponha cada dupla no seu lado e que o sorteio funcione com qualquer número de duplas, para a primeira edição não quebrar.

## Contexto
- Teste de ponta a ponta pedido pelo PO em 2026-10-31, horas antes do sorteio da edição `2026-11` (ambiente local, banco próprio, capturas de cada etapa).
- Três defeitos encontrados na v2.56.0:
  1. A sala `c-*` não guardava os lados da copa: `RoomManager.create` não repassava `cup` ao `Room`. As duplas se misturavam no lobby, "Pedir troca" aparecia e o resultado da série (dupla A = vermelho) podia ir para a dupla errada.
  2. Sorteio com número de duplas que não é potência de 2: `runDraw` chamava `settleNext` com a edição ainda sem `rounds`, então cada bye parecia a final. A edição terminava no sorteio, com campeã falsa anunciada a todos e marcos de campeão.
  3. Nome da sala com a fase errada ("OutCup Quartas" na semifinal).

## Escopo
- `apps/game-server/src/rooms.ts`: `RoomSpec.cup` repassado ao `Room`.
- `apps/api/src/cup.ts`: `settleNext` dos byes com a edição já gravada (`rounds`); `roundName` pela fase certa.

## Critérios de aceite
- [x] Sala da copa aberta pelo spawner (caminho do ticket) recusa conta de fora e põe cada dupla no seu lado (teste em `spawn.test.ts`, falha sem a correção).
- [x] 5 duplas: 3 byes, edição segue em disputa (teste em `cup.test.ts`, falha sem a correção).
- [x] Nome da fase: Semifinal/Final com 2 fases; Oitavas a Final com 4 (teste).
- [x] Fluxo completo refeito no ambiente local com as correções (lobby com as duplas certas, byes, W.O., disputa, título).

## Notas de implementação
- Pontos menores achados no mesmo teste ficaram no OG-530.
