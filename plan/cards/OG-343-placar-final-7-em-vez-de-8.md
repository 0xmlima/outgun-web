# OG-343 — Placar do fim de partida mostra 7 em vez de 8

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | S36 |
| Status | Concluído |
| Dependências | — |
| Regras de negócio | RN-STA-03 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver o placar final certo, para não achar que o jogo acabou antes da hora.

## Contexto
- Relato do PO (2026-10-21): no fim de partida o placar do vencedor aparece 7, não 8.
- Suspeita: `packages/netcode/src/session.ts` (case `gameOver`) copia `teamScores` no instante em que a mensagem chega; a captura final ainda não chegou no frame/mensagem de placar, que vem depois. O feed faz o mesmo (`online-hud.ts`, `gameOverScores`).

## Escopo
- O placar final vem do servidor: a mensagem `gameOver` passa a levar o placar dos dois times (protocolo), e o cliente usa esse valor no overlay, no feed e no modal (OG-344).
- Conferir o mesmo no espectador e no replay.

## Critérios de aceite
- [x] Teste: captura que fecha o jogo no mesmo tick do `gameOver` mostra 8.
- [x] Relatório da partida e tela final batem.

## Notas de implementação
- Causa: o `gameOver` sai de dentro do `simulateFrame` (hook do fim de jogo) e o `scoreUpdate` da captura final só depois do frame; o cliente congelava o placar antigo. O relatório sempre esteve certo.
- Correção sem mudar o protocolo: o servidor manda o placar pendente antes do `gameOver` (`sendScores`). Espectador e replay recebem a mesma sequência; replays antigos continuam com o 7.
