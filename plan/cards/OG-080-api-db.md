# OG-080 — API e banco de dados

| Campo | Valor |
|---|---|
| Épico | E5 |
| Tipo | Feature |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S8 |
| Status | Em revisão |
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
- [x] Migrations reversíveis; seed de desenvolvimento.
- [x] OpenAPI publicada; testes de integração com Postgres em container.

## Notas técnicas
- —

## Notas de implementação
- **Stack:** Fastify 5.12 + TypeBox (validação e tipos das rotas) + Drizzle ORM 0.45 sobre `postgres` (postgres.js) + ioredis 6 (opcional: sem `REDIS_URL` a API roda e `/health` informa `disabled`). Versões fixas, todas com 2+ semanas de publicação. Porta padrão **7800**.
- **Migrations reversíveis:** SQL escrito à mão (`apps/api/migrations/NNNN_*.up.sql` + `.down.sql`), aplicado por um migrador próprio (`src/db/migrate.ts`: transação + advisory lock, tabela `schema_migrations`). O drizzle-kit não gera down; por isso o SQL é a fonte de verdade e `src/db/schema.ts` descreve as mesmas tabelas para as consultas — `migrate.test.ts` confere coluna a coluna (nome e nulidade) e testa up → down total → up.
- **Tabelas:** `users` (username/email + `*_key` normalizadas e únicas; o OG-082 refina a normalização do nome), `sessions` (só o hash do token), `player_profiles`, `seasons` (no máximo uma ativa), `rooms`, `matches` (única por `server_id`+`server_match_id`, reenvio idempotente), `match_players` (stats RN-STA-01 em jsonb + colunas principais; `user_id` vira NULL ao excluir a conta = anonimização RN-PLT-04), `ratings` (por temporada), `bans` (de sala com no máximo 7 dias, CHECK no banco), `admin_actions` (nomes copiados para sobreviver à exclusão). Restrições no banco: Ranked sem senha de sala, partida `ranked` só no modo ranked.
- **Rotas:** `GET /health`, `GET /rooms` (no ar = heartbeat há menos de 30 s), `GET /openapi.json`, `/docs` (Swagger UI); internas `POST /internal/rooms/heartbeat` (valida preset × modo contra `@outgun/settings`) e `POST /internal/matches` (recusa Ranked com bots — D-11; conta inexistente vira anônima). O cálculo de ranking a partir das partidas fica no OG-084; o envio pelo game server, no OG-086/OG-084.
- **Autenticação interna:** HMAC-SHA256 em vez de mTLS (funciona atrás de qualquer proxy e no Fly.io sem PKI): `x-outgun-server`, `x-outgun-timestamp`, `x-outgun-signature` sobre `timestamp.MÉTODO.caminho.sha256(corpo)`, janela de 30 s, mais de um segredo por servidor para rotação (`INTERNAL_SECRETS`). `signInternalRequest` é exportado pelo pacote.
- **OpenAPI publicada:** `apps/api/openapi.json` versionado (gerado por `pnpm --filter @outgun/api openapi`); `openapi.test.ts` falha se ficar desatualizado.
- **Testes de integração:** o globalSetup do Vitest sobe `postgres:16-alpine` (tmpfs) e cada arquivo cria seu banco; sem Docker os testes de banco são pulados localmente e falham no CI; `TEST_DATABASE_URL` usa um servidor existente. 22 testes.
- **Seed:** `pnpm --filter @outgun/api seed` (temporada 1, salas `main` e `ranked`, contas Admin/Jogador1/Jogador2 com senha `outgun-dev`, idempotente). `apps/api/compose.yaml` sobe Postgres 16 e Redis 7.
- `tools/license-check` passou a ignorar binários opcionais de outras plataformas não instalados (ex. `@node-rs/argon2-linux-x64`), em vez de quebrar.
