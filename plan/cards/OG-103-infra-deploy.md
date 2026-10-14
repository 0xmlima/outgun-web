# OG-103 — Infraestrutura e deploy

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S11 |
| Status | Pronto |
| Dependências | [OG-040](OG-040-game-server-core.md), [OG-080](OG-080-api-db.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como time, quero deploy automatizado e ambientes separados, para lançar com segurança.

## Contexto e referências no original
- D-04.

## Escopo
- Imagens Docker; ambientes staging e produção.
- Deploy contínuo a partir da main (staging) e por tag (produção).
- TLS, domínio, CDN para assets, backups do Postgres.
- Escalonamento de game servers por região.

## Critérios de aceite
- [ ] Deploy sem downtime da API; game servers drenam salas antes de desligar.
- [ ] Restore de backup testado.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
