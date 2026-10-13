# @outgun/api

API da plataforma do Outgun Web (cards OG-080 a OG-083): contas, salas, partidas e ranking. Fastify 5 +
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

| Variável              | Padrão                                            | Uso                                                                      |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| `PORT` / `HOST`       | `7800` / `0.0.0.0`                                | Porta HTTP                                                               |
| `DATABASE_URL`        | `postgres://outgun:outgun@localhost:5432/outgun`  | PostgreSQL                                                               |
| `REDIS_URL`           | vazio (sem Redis)                                 | Redis                                                                    |
| `INTERNAL_SECRETS`    | `dev:outgun-dev-secret-0000` fora de produção     | `servidor:segredo[\|segredo-antigo],...` dos game servers (mín. 16 car.) |
| `INTERNAL_MAX_SKEW_S` | `30`                                              | Janela de relógio aceita nas rotas internas                              |
| `MIGRATE`             | `1`                                               | `0` não aplica migrations ao iniciar                                     |
| `LOG_LEVEL`           | `info`                                            | Nível do pino                                                            |
| `DEV_ROOM_WS_URL`     | `ws://localhost:7700/rooms/{id}` fora de produção | Servidor usado quando nenhum game server mandou heartbeat                |
| `ROOMS_PER_HOUR`      | `10`                                              | Salas privadas criadas por conta por hora                                |

## Contas (OG-081)

- `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me`, `POST /auth/password/forgot`,
  `/auth/password/reset`; `POST /account/password`, `GET /account/export`, `DELETE /account`.
- Senha com argon2id (19 MiB, t=2); sessão em cookie `og_session` (httpOnly, SameSite=Lax; o banco
  guarda o hash do token). Login: 5 falhas por usuário (ou 10 por IP) → espera de 30 s, dobrando até
  15 min. Recuperação: link `WEB_URL/reset-password#token=…`, uso único, 30 min; resposta igual
  exista ou não a conta. Pedidos que mudam estado só com JSON e de origens de `WEB_ORIGINS`.
- O cliente web chama a API em `/api` (o Vite repassa para a porta 7800 no dev e no preview).

## Nomes e entrada nas salas (OG-082, OG-083)

- `POST /account/username` (a cada 30 dias; nome antigo reservado por 90), `PUT /account/clan-tag`,
  `GET /names/check?name=`.
- `POST /rooms/:id/join` `{ name?, password? }` → `{ ticket, wsUrl, name, guest }`: confere sessão
  (Ranked exige conta), nome de convidado (sufixo `*`, nunca nome de conta), ban, senha da sala e
  lotação. O ticket é um JWT Ed25519 de 60 s para aquela sala; o game server confere com
  `GET /.well-known/jwks.json` (renovado a cada 5 min) e aceita cada ticket uma vez só.
- Rotação: gere a chave nova (`node dist/cli.js ticket-key`), ponha-a **depois** da atual em
  `TICKET_SIGNING_KEYS` (publicada, ainda sem assinar), espere 5 min (os game servers buscam o JWKS),
  passe-a para a frente e, após mais 1 min, retire a antiga.

## Registro de salas e matchmaking (OG-086)

- Cada game server manda heartbeat a cada 3 s com seu endereço, região, limite de salas e as salas
  que hospeda; sala ou servidor sem heartbeat por 10 s sai do ar (some do lobby). Sala encerrada
  pelo servidor sai na hora. O registro fica no PostgreSQL (`game_servers`, `rooms`; decisão D-24).
- `GET /rooms?mode=` lista as salas no ar e as da plataforma (`persistent`) que podem abrir agora.
- Sala fora do ar é aberta pelo próprio ticket: a API escolhe o servidor (o da sala, se estiver no
  ar; senão o menos carregado, de preferência na região pedida) e põe a configuração na claim
  `spawn`; o game server abre a sala ao receber o primeiro ticket.
- `POST /rooms/quick-join` `{ mode, name?, region? }` ("Jogar agora"): sala pública no ar com vaga e
  mais jogadores (a região pedida primeiro); senão uma sala da plataforma do modo.
- `POST /rooms` `{ name, preset, password?, maxPlayers?, maps?, region? }` (com conta): sala privada
  Casual (presets Ranked recusados) → `{ room, inviteUrl }`. Fica no servidor escolhido e é apagada
  depois de 1 h fora do ar.

## Ranking e temporadas (OG-084)

- O game server calcula os deltas (spec `plan/specs/ranking.md`) e os manda com o resultado da
  partida (`POST /internal/matches`, só `ranked`) ou, na saída do jogador e na troca de mapa,
  em `POST /internal/rating-deltas` `{ deltaId, roomId?, userId, scoreDelta, negDelta }`
  (idempotente por `deltaId`). A API só soma na temporada ativa (`ratings`).
- `GET /leaderboard?season=&limit=&offset=` (rating = (score+1)/(neg+1), score ≥ 100, desempate
  por score), `GET /seasons`, `GET|PUT /account/ranking` (`{ participate }`, opt-out).
- O ticket de entrada leva `rating { score, neg, participate, rank, of }` da conta.
- Nova temporada: `node dist/cli.js season start "Temporada 2"` (encerra a ativa).

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

- `POST /internal/rooms/heartbeat` — servidor, salas hospedadas, jogadores e mapa (a cada 3 s).
- `POST /internal/matches` — resultado da partida; idempotente por `serverMatchId`.

## Testes

`pnpm --filter @outgun/api test` sobe um `postgres:16-alpine` em container (Docker) e cria um
banco por arquivo de teste. Sem Docker, os testes de banco são pulados (no CI, falham); para usar um
servidor existente, defina `TEST_DATABASE_URL` com um usuário que possa criar bancos.
