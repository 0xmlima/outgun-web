# OG-268 — Hall da fama

| Campo | Valor |
|---|---|
| Épico | E12 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S19 |
| Status | Backlog |
| Dependências | [OG-267](OG-267-temporadas-mensais.md), [OG-274](OG-274-ranking-clas.md) |
| Regras de negócio | RN-RKL-24 |
| Skills | `outgun-card-workflow` |

## História
Como jogador, quero ver os campeões de cada temporada, para que quem se destacou fique registrado para sempre.

## Escopo
- Página `/hall-da-fama`: para cada temporada encerrada, os 3 primeiros do ranking geral, de cada formato (3x3, 4x4, 5x5) e de clãs (D-48).
- Selo no perfil do jogador e na página do clã ("Campeão 3x3 — Temporada 2026-11").
- Gerado a partir da classificação final guardada pelo OG-267 (não recalcula).

## Critérios de aceite
- [ ] Temporada com menos de 3 classificados mostra só os que houver.
- [ ] Design system v2, URL estável.

## Notas de implementação
(preenchido durante a execução)
