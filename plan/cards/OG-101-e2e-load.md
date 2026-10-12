# OG-101 — Testes E2E e de carga

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S11 |
| Status | Backlog |
| Dependências | [OG-064](OG-064-prediction-interpolation.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como time, quero garantir que fluxos completos funcionam e que o servidor aguenta salas cheias.

## Contexto e referências no original
- Seção 7 do PLAN (RNF).

## Escopo
- Playwright: cadastro → lobby → partida → fim → ranking.
- Clientes headless (Node) que jogam via protocolo para carga: 20 salas × 32 jogadores.
- Simulação de latência/perda.

## Critérios de aceite
- [ ] E2E verdes no CI.
- [ ] Relatório de carga confirma RNF de tick e tráfego.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
