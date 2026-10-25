# OG-423 — Ranking, hall da fama e jogadores no celular

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S45 |
| Status | Pronto |
| Dependências | OG-418 |
| Regras de negócio | RN-LDB-01, RN-LDB-05, RN-LDB-06, RN-UI-08 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no celular, quero ver o ranking do mês e o hall da fama, para saber como estou.

## Contexto
- Pedido do PO em 2026-10-25 (S45): o celular volta, mas sem a partida — estatísticas, perfis, relatórios em PDF e moderação, tudo no visual retrô da S44 (OG-416). D-80 substitui a D-50.
- `leaderboard.tsx` (abas por atributo e formato, OG-358, OG-362), `HallOfFame.tsx`, `Players.tsx` (filtro de nomes, OG-284).

## Escopo
- Leaderboard: abas de atributo e formato roláveis; tabela com posição, jogador e o valor da aba fixos e o resto em detalhe ao tocar na linha.
- Hall da fama em cartões por mês.
- Jogadores com busca e lista no toque.
- Minha posição destacada e um atalho "ir para mim".

## Critérios de aceite
- [ ] Leaderboard, hall da fama e jogadores em 360 px, sem rolagem horizontal da página.
- [ ] Desktop sem mudança.

## Notas técnicas
- Só layout e CSS.

## Notas de implementação
(preenchido durante a execução)
