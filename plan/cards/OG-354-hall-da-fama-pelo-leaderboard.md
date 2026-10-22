# OG-354 — Hall da fama mensal pelo leaderboard

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S37 |
| Status | Concluído |
| Dependências | OG-352, OG-350 |
| Regras de negócio | RN-LDB-05, RN-RKL-22 (D-66) |
| Skills | `outgun-card-workflow` |

## História
Como comunidade, quero um hall da fama que registre mês a mês quem dominou cada atributo, para ter um histórico bonito do jogo ao longo do tempo.

## Escopo
- Na virada da temporada (dia 1, 00:00 de Brasília), grava os 3 primeiros do mês que terminou em cada **stat principal** do leaderboard, todos os formatos juntos, com o valor.
- Stats principais (aprovados pelo PO em 2026-10-22): abates, capturas, devoluções, tempo com bandeira, K/D e precisão. Mínimo de 5 partidas no mês, como no leaderboard; selo para os 3 primeiros.
- Selo no perfil com stat, posição e mês (ex.: "1º em capturas · nov/2026"). Os selos do sistema antigo continuam, marcados como "ranking clássico".
- Hall dos clãs continua como está (vitórias clã x clã).
- A página do hall da fama mostra os meses do leaderboard e, abaixo, os do sistema antigo.
- Primeiro mês gravado assim: novembro de 2026 (virada de 1º de dezembro).

## Critérios de aceite
- [x] Teste da virada: grava os 3 primeiros de cada stat principal com o mínimo de partidas; regravar não duplica.
- [x] Perfil mostra selos novos e antigos.

## Notas de implementação
- `closeSeason` decide pelo mês: até 2026-10 grava a classificação e o hall do score/neg; desde 2026-11 (`LEADERBOARD_SINCE`), os 3 primeiros de cada stat principal (`stat:<id>`, migration 0030 libera o quadro) e os clãs. Partida que chega depois da virada regrava o hall do mês dela.
- `/hall-of-fame` passou a mandar `classic` e os quadros na ordem de exibição; a tela e os selos mostram "Campeão em capturas · Temporada 2026-11" e marcam os antigos como "ranking clássico".
