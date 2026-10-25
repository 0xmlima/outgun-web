# OG-424 — Relatório da partida e da série no celular

| Campo | Valor |
|---|---|
| Épico | E9 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S45 |
| Status | Em revisão |
| Dependências | OG-418 |
| Regras de negócio | RN-SOC-01, RN-UI-08 |
| Skills | `outgun-card-workflow` |

## História
Como jogador no celular, quero abrir o relatório completo da partida, para rever o que aconteceu.

## Contexto
- Pedido do PO em 2026-10-25 (S45): o celular volta, mas sem a partida — estatísticas, perfis, relatórios em PDF e moderação, tudo no visual retrô da S44 (OG-416). D-80 substitui a D-50.
- `MatchReport.tsx` (OG-214, OG-257, OG-380): placar, destaques, matriz de abates, linha do tempo das capturas, rating e série.

## Escopo
- Relatório em uma coluna: placar e destaques no topo, tabela dos jogadores por time (colunas extras ao tocar), matriz de abates com rolagem dentro do painel, linha do tempo das capturas vertical.
- Série (`/series/:id`) e "última partida da sala" no mesmo layout.
- Link "Ver replay" vira o aviso do jogo (OG-417); botão "Baixar PDF" (OG-425) no topo.

## Critérios de aceite
- [x] Relatório de partida Casual, Ranked e série em 360 px com as mesmas informações do desktop.
- [x] Desktop sem mudança.

## Notas técnicas
- Só layout e CSS.

## Notas de implementação
- Relatório já em uma coluna abaixo de ~40 rem (`report-grid`); no celular: placar centralizado no topo, destaques em 2 colunas, linha do tempo mais estreita, "Ver replay" some.
- Tabelas por time ficam com jogador, frags, abates, mortes, capturas e rating; o resto (`hideOnPhone`) segue em "Estatísticas detalhadas", cujas tabelas e a matriz de abates rolam dentro do painel com a 1ª coluna fixa (no lugar de "colunas extras ao tocar").
- Série e "última partida da sala" usam as mesmas peças. Botão "Baixar PDF": OG-425/426.
