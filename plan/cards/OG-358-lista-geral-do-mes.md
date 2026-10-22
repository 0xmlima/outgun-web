# OG-358 — Lista geral do mês (índice dos 6 stats principais) e selo de melhor do mês

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S37 |
| Status | Concluído |
| Dependências | OG-352, OG-353, OG-354 |
| Regras de negócio | RN-LDB-05, RN-LDB-06 (D-67) |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero uma lista única do mês que junte os fundamentos do jogo, para saber quem foi o melhor no geral e não só em cada stat.

## Contexto
- Pedido do PO na revisão da S37 (2026-10-22): o leaderboard só tinha listas por stat. Escolhida a opção "índice do mês" (média dos percentis com pesos), com os 6 stats principais e selo de melhor do mês.

## Escopo
- Índice de 0 a 100 = soma de peso × percentil em cada stat principal, entre quem tem 5 ranqueadas no período (1º lugar = 1, último = 0; sozinho = 1). Pesos (D-67): capturas 25%, abates 20%, devoluções 20%, tempo com bandeira 15%, K/D 10%, precisão 10%.
- API: `GET /leaderboard/overall` (mesmos filtros do leaderboard, com `player`) e os 3 primeiros em `GET /leaderboard/stats`.
- Página: quadro "Geral do mês" na visão geral e a lista completa com a posição em cada stat e os pesos à vista; na tela inicial, "Melhor do mês" na primeira linha.
- Hall da fama: quadro `stat:overall` com os 3 primeiros; selo "Melhor do mês" (1º) e "2º/3º lugar no geral do mês".

## Critérios de aceite
- [x] Teste do índice com os pesos e o desempate; pesos somam 1.
- [x] Hall da fama de novembro com o quadro do melhor do mês.
- [x] PO confere os pesos.

## Notas de implementação
- Pesos numa constante (`OVERALL_WEIGHTS`, `apps/api/src/leaderboard.ts`): mudar é uma linha.
- O índice é calculado a partir das 6 listas (uma consulta por stat); empate no índice, pelo nome.
