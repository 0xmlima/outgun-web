# OG-274 — Ranking de clãs

| Campo | Valor |
|---|---|
| Épico | E13 |
| Tipo | Feature |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S19 |
| Status | Pronto |
| Dependências | [OG-273](OG-273-clas-estatisticas.md), [OG-267](OG-267-temporadas-mensais.md) |
| Regras de negócio | RN-CLA-07 |
| Skills | `outgun-card-workflow` |

## História
Como clã, quero aparecer num ranking contra os outros clãs, para ter uma disputa entre clãs ao longo das temporadas.

## Escopo
- Ranking de clãs por temporada e geral (todas as temporadas), por pontos em partidas clã x clã: vitória 3, empate 1; desempate por saldo de capturas; mínimo de 3 partidas na temporada para aparecer (D-47). O geral soma as temporadas.
- Aba "Clãs" em `/ranking`, com link para a página de cada clã.

## Critérios de aceite
- [ ] Testes do critério e do desempate; clã abaixo do mínimo de partidas não aparece.

## Notas de implementação
(preenchido durante a execução)
