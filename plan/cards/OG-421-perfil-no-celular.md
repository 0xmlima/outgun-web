# OG-421 — Perfil do jogador no celular

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
Como jogador no celular, quero ver o meu perfil e o dos outros, para acompanhar rating, marcos e partidas.

## Contexto
- Pedido do PO em 2026-10-25 (S45): o celular volta, mas sem a partida — estatísticas, perfis, relatórios em PDF e moderação, tudo no visual retrô da S44 (OG-416). D-80 substitui a D-50.
- `screens/Profile.tsx` (OG-212, OG-351, OG-393): rating, marcos por grupo com progresso, número, cores e medalhas (S43), companheiros e últimas partidas.

## Escopo
- Perfil em uma coluna: cabeçalho (nome, clã, número, medalha, rating), stats do mês e de sempre em cartões, marcos por grupo em lista recolhível, companheiros e partidas recentes com link para o relatório.
- Gráficos e tabelas sem rolagem horizontal da página.

## Critérios de aceite
- [x] Perfil completo em 360 px, com as mesmas informações do desktop.
- [x] Desktop sem mudança.

## Notas técnicas
- Só layout e CSS; reaproveitar `milestones-panel.tsx`.

## Notas de implementação
- O perfil já era uma coluna abaixo de ~40 rem (`report-grid` com 18 rem); no celular, os marcos viram grupos recolhíveis (`<details>`, `GroupBox`) com um marco por linha, e os números da aba Estatísticas ficam rótulo à esquerda e valor à direita.
- `Table` ganhou `hideOnPhone` por coluna: em "Partidas recentes" somem "Assistir" (o replay é só no computador) e "Capturas". As demais tabelas rolam dentro do painel com a 1ª coluna fixa (OG-418).
