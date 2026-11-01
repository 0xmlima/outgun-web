# OG-531 — Medalhas e número 1 do top 3 de outubro (hall de outubro sem o "Melhor do mês")

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Bug |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | — |
| Status | Concluído |
| Dependências | OG-410, OG-411, OG-354 |
| Regras de negócio | RN-NUM-01, D-79, D-66 |
| Skills | `outgun-card-workflow` |

## História
Como jogador do top 3 do "Melhor do mês" de outubro, quero o dourado, o prateado ou o bronze (e o líder, o número 1) em novembro, como prometido na D-79.

## Contexto
- Achado do PO em 2026-11-01, depois da virada da temporada: ninguém recebeu medalha nem pôde usar o número 1.
- Causa: `closeSeason` tratou outubro (`'2026-10' < LEADERBOARD_SINCE`) como temporada só do ranking clássico e gravou o hall por score/neg (`overall`, `3x3`). `previousPodium` só lê o quadro `stat:overall`, que não existia para outubro, e devolve `null` para todos. No beta: temporada 1 com só `overall` e `3x3` (coiote, master, Felix).
- Os testes do OG-410/411 inseriam o `stat:overall` à mão e não pegaram a falha.

## Escopo
- Fechamento de outubro grava os dois halls: o clássico e o do leaderboard (`stat:overall` e stats principais).
- `cli.js season reclose AAAA-MM` regrava o hall de uma temporada encerrada (idempotente; concede os marcos do pódio que faltarem).
- Hall da fama mostra os quadros dos dois sistemas em outubro.

## Critérios de aceite
- [x] Teste: fechar outubro com partidas dá a medalha e o número 1 ao pódio do "Melhor do mês"; o pódio clássico não dá medalha.
- [x] Teste: regravar outubro devolve o pódio sem duplicar; temporada ativa não se regrava.
- [x] No beta, depois do deploy: `node dist/cli.js season reclose 2026-10` (rodado em 2026-11-01 com a ordem do PO).

## Notas de implementação
- `STAT_HALL_SINCE = '2026-10'` em `ranking.ts`; `insertStatChampions` separado do apagar/clãs para outubro somar ao hall clássico.
- A medalha vai no ticket: o top 3 a recebe na próxima entrada numa sala; o líder ativa o número 1 na conta.
- Regravar outubro concede também Campeão/Vice da temporada (OG-392/399) a quem estiver no pódio dos stats.
