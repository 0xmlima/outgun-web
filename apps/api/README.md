# @outgun/api

API da plataforma do Outgun Web (cards OG-080 e OG-081): contas, salas, partidas e ranking. Fastify 5 +
Drizzle ORM + PostgreSQL 16 (+ Redis opcional). A especificação OpenAPI publicada é
[`openapi.json`](openapi.json); com a API no ar, `/openapi.json` e `/docs` (Swagger UI).

## Rodando localmente

```sh
docker compose -f apps/api/compose.yaml up -d      # PostgreSQL 16, Redis 7 e Mailpit
pnpm --filter @outgun/api build
pnpm --filter @outgun/api seed                     # migrations + dados de desenvolvimento
MAILER=mailpit pnpm --filter @outgun/api start     # http://localhost:7800 (e-mails em :8025)
```

O seed cria a temporada 1, as salas `main` (Casual, Clássico) e `ranked`, e as contas `Admin`,
`Jogador1` e `Jogador2`, todas com a senha `outgun-dev`.

## Variáveis de ambiente

| Variável              | Padrão                                           | Uso                                                                      |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `PORT` / `HOST`       | `7800` / `0.0.0.0`                               | Porta HTTP                                                               |
| `DATABASE_URL`        | `postgres://outgun:outgun@localhost:5432/outgun` | PostgreSQL                                                               |
| `REDIS_URL`           | vazio (sem Redis)                                | Redis                                                                    |
| `INTERNAL_SECRETS`    | `dev:outgun-dev-secret-0000` fora de produção    | `servidor:segredo[\|segredo-antigo],...` dos game servers (mín. 16 car.) |
| `INTERNAL_MAX_SKEW_S` | `30`                                             | Janela de relógio aceita nas rotas internas                              |
| `MIGRATE`             | `1`                                              | `0` não aplica migrations ao iniciar                                     |
| `LOG_LEVEL`           | `info`                                           | Nível do pino                                                            |

## Contas (OG-081)

- `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me`, `POST /auth/password/forgot`,
  `/auth/password/reset`; `POST /account/password`, `GET /account/export`, `DELETE /account`.
- Senha com argon2id (19 MiB, t=2); sessão em cookie `og_session` (httpOnly, SameSite=Lax; o banco
  guarda o hash do token). Login: 5 falhas por usuário (ou 10 por IP) → espera de 30 s, dobrando até
  15 min. Recuperação: link `WEB_URL/reset-password#token=…`, uso único, 30 min; resposta igual
  exista ou não a conta. Pedidos que mudam estado só com JSON e de origens de `WEB_ORIGINS`.
- O cliente web chama a API em `/api` (o Vite repassa para a porta 7800 no dev e no preview).

## Migrations

SQL escrito à mão em `migrations/NNNN_nome.up.sql` + `NNNN_nome.down.sql` (toda migration é
reversível; o teste aplica, desfaz tudo e reaplica). `src/db/schema.ts` descreve as mesmas tabelas
para o Drizzle, e um teste confere que as colunas batem.

```sh
pnpm --filter @outgun/api migrate up | down [N] | status
```

## Rotas internas (game server → API)

`/internal/*` exige HMAC-SHA256: cabeçalhos `x-outgun-server`, `x-outgun-timestamp` (ms) e
`x-outgun-signature` = hex de `HMAC(segredo, "timestamp.MÉTODO.caminho.sha256hex(corpo)")`.
`signInternalRequest` (exportado pelo pacote) faz a assinatura. Pedidos com mais de 30 s de
diferença de relógio são recusados.

- `POST /internal/rooms/heartbeat` — salas hospedadas, jogadores e mapa (a cada ~10 s).
- `POST /internal/matches` — resultado da partida; idempotente por `serverMatchId`.

## Testes

`pnpm --filter @outgun/api test` sobe um `postgres:16-alpine` em container (Docker) e cria um
banco por arquivo de teste. Sem Docker, os testes de banco são pulados (no CI, falham); para usar um
servidor existente, defina `TEST_DATABASE_URL` com um usuário que possa criar bancos.
