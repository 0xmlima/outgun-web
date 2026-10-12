# OG-080 — API e banco de dados

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S8 |
| Status | Backlog |
| Dependências | [OG-001](OG-001-monorepo-setup.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como dev, quero uma API e um modelo de dados sólidos para contas, partidas, ranking e salas.

## Contexto e referências no original
- Seção 4 e 5 do PLAN.

## Escopo
- Fastify + Drizzle + PostgreSQL + Redis; migrations; OpenAPI.
- Tabelas: users, sessions, player_profiles, seasons, matches, match_players (stats), ratings, rooms, bans, admin_actions.
- Endpoints internos autenticados para game servers (mTLS ou HMAC).

## Critérios de aceite
- [ ] Migrations reversíveis; seed de desenvolvimento.
- [ ] OpenAPI publicada; testes de integração com Postgres em container.

## Notas técnicas
- —

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
