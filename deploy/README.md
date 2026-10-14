# Deploy do Outgun Web (OG-103)

Plataforma: Fly.io (D-04). Tudo aqui funciona e foi testado localmente com as imagens de produção;
o primeiro deploy de verdade depende das contas e do domínio (ver "Falta decidir" no fim).

## Peças

| Serviço            | Imagem (`deploy/Dockerfile`) | No Fly                                                 | Notas                                                                                                              |
| ------------------ | ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Cliente web        | `--target web` (Caddy)       | app `outgun-web`, público, TLS                         | estáticos + `/api` para a API pela rede privada; cabeçalhos de segurança gerados de `apps/web/security-headers.ts` |
| API                | `--target api`               | app `outgun-api`, só privado (Flycast)                 | 2+ máquinas, deploy bluegreen, migrations no `release_command`                                                     |
| Game servers       | `--target game-server`       | app `outgun-gs`, público (WSS)                         | 1 máquina por vCPU (~20 salas cheias), regiões com `fly scale`, volume para replays, drenagem no SIGTERM           |
| Backup             | `deploy/backup/Dockerfile`   | máquina agendada (diária)                              | `pg_dump` → armazenamento S3 compatível                                                                            |
| PostgreSQL / Redis | —                            | gerenciados (Fly Managed Postgres / Upstash)           | sem porta pública                                                                                                  |
| Métricas e alertas | `tools/observability/`       | Prometheus/Grafana (ou o Prometheus gerenciado do Fly) | `METRICS_TOKEN`                                                                                                    |

Ambientes: **homologação** (apps com sufixo `-staging`, deploy a cada push na `main`) e **produção**
(deploy a cada tag `v*`, com aprovação no ambiente `production` do GitHub). O workflow é
`.github/workflows/deploy.yml`; ele roda o CI inteiro antes.

## Garantias e como foram testadas

- **Deploy da API sem queda.** No SIGTERM a API responde 503 no `/health` por `SHUTDOWN_GRACE_S`
  (5 s), o balanceador para de mandar pedidos, e ela fecha esperando os que estão em andamento.
  `node deploy/test/rolling-restart.mjs` reinicia as duas instâncias da homologação, uma de cada
  vez, com 8 clientes martelando a API: 9.651 pedidos, 0 erros.
- **Game servers drenam as salas antes de desligar.** No SIGTERM o servidor anuncia `maxRooms 0`
  (a API para de mandar salas novas para ele), avisa os jogadores, deixa a partida em andamento
  terminar (placar e resultado normais), fecha cada sala e sai; `DRAIN_TIMEOUT_S` (240 s) é o prazo,
  dentro do `kill_timeout` de 300 s. `node tools/load/drain.mjs` contra a homologação: aviso na hora,
  fora da escolha da API em 5 s, placar 60 s depois (partida de 1 min), sala fechada, saída com código 0.
- **Restore de backup.** `bash deploy/test/backup-restore.sh` faz o backup da homologação, restaura
  num PostgreSQL novo, compara as 16 tabelas (contagem e checksum: idênticas) e confere que a API de
  produção sobe no banco restaurado sem migration pendente.
- **As imagens rodam o jogo inteiro.** O E2E (`E2E_BASE_URL=http://localhost:18080 npx playwright test`
  em `tools/e2e`) passa contra a homologação local: cadastro, lobby, partida até o fim, histórico,
  ranking e CSP sem violações.

## Homologação local

```sh
bash deploy/staging.sh build    # imagens outgun-{api,game-server,web}:dev
bash deploy/staging.sh up       # PostgreSQL, Redis, migrations, 2 APIs, game server, Caddy
# http://localhost:18080 (cliente e /api), ws://localhost:17700 (game server)
bash deploy/staging.sh down
```

Para o E2E, suba o game server com partidas curtas e bots:
`CASUAL_BOTS_FILL=3 GAMEMOD="time_limit 1|game_end_delay 3" ROTATION="2 versus 2 (duel)" docker compose -f deploy/compose.yml up -d game-server`.

## Primeira configuração no Fly (uma vez por ambiente)

```sh
fly apps create outgun-api-staging; fly apps create outgun-gs-staging; fly apps create outgun-web-staging
fly ips allocate-v6 --private --app outgun-api-staging          # API só na rede privada (Flycast)
fly volumes create outgun_replays --region gru --size 3 --app outgun-gs-staging
fly secrets set --app outgun-api-staging DATABASE_URL=... REDIS_URL=... \
  TICKET_SIGNING_KEYS="$(node apps/api/dist/cli.js ticket-key)" INTERNAL_SECRETS="gs:<segredo>" \
  RESEND_API_KEY=... METRICS_TOKEN=... SENTRY_DSN=...
fly secrets set --app outgun-gs-staging GS_SECRET=<segredo> METRICS_TOKEN=... SENTRY_DSN=...
fly certs add <domínio> --app outgun-web-staging                 # TLS automático
```

Cada máquina de game server se registra como `gs.<id da máquina>` (o segredo é o da entrada `gs`) e
anuncia `wss://<app>.fly.dev/m/<id>`; um WebSocket que o proxy entregar a outra máquina volta com
`fly-replay` e é reenviado à certa. Regiões: `fly scale count 2 --region gru,iad --app outgun-gs`.
Mais salas por região = mais máquinas (o alerta de p95 do tick > 20 ms indica a hora).

Rotação de chaves dos tickets: `apps/api/README.md`.

## Backups

- Diário: `fly machine run <imagem de deploy/backup> --schedule daily` com `DATABASE_URL`,
  `BACKUP_S3_URI` e as credenciais do bucket (Tigris). Se o PostgreSQL for o gerenciado do Fly, os
  backups dele valem também; este é o backup lógico independente do fornecedor.
- Restaurar: `DATABASE_URL=<destino> RESTORE_CONFIRM=sim restore.sh <arquivo.dump>` (apaga o destino).
  Restaure primeiro num banco novo e confira antes de apontar a API para ele.

## Falta decidir (PO)

Domínio; conta/organização e orçamento no Fly; PostgreSQL gerenciado (Fly Managed Postgres) ou outro;
Redis (Upstash pelo Fly); bucket dos backups; regiões dos game servers no lançamento; serviço de erros
(Sentry ou GlitchTip) e para onde vão os alertas; CDN na frente do cliente (os arquivos já saem com
cache imutável; um CDN só ajuda com público fora da região).
