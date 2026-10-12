# OG-102 — Observabilidade

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S11 |
| Status | Backlog |
| Dependências | [OG-040](OG-040-game-server-core.md), [OG-080](OG-080-api-db.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como operador, quero métricas, logs e alertas para detectar problemas antes dos jogadores.

## Contexto e referências no original
- —

## Escopo
- Métricas: tempo de tick (p50/p95/p99), jogadores, salas, bytes/s, erros, latência da API.
- Logs estruturados (pino) com correlação.
- Sentry no cliente e no servidor; dashboards e alertas.

## Critérios de aceite
- [ ] Dashboard com as métricas acima; alerta quando p95 do tick > 20 ms.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
