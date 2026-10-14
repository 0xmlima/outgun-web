# OG-103 — Infraestrutura e deploy

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 5 pts |
| Sprint | S11 |
| Status | Concluído |
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
- [x] Deploy sem downtime da API; game servers drenam salas antes de desligar.
- [x] Restore de backup testado.

## Notas técnicas
- —

## Notas de implementação
- Tudo local, como combinado: nada foi publicado. Guia em `deploy/README.md`.
- Imagens (`deploy/Dockerfile`, Node 22 Debian por causa do uWebSockets.js, pnpm 12 instalado pelo npm porque o corepack do Node 22 não o entende): API 388 MB, game server 358 MB (binários do uWS de outras plataformas removidos), web 97 MB (Caddy). Achado: `@outgun/bots` e `@outgun/netcode` estavam em devDependencies do game server, mas são usados pelos bots em produção — uma imagem `--prod` quebraria; movidos.
- Homologação local (`deploy/compose.yml` + `deploy/staging.sh`) com as imagens de produção em `NODE_ENV=production`: migrations num serviço único, 2 APIs atrás do Caddy, game server, segredos gerados. O E2E do OG-101 passa contra ela (3/3).
- Deploy sem queda da API: `/health` 503 por `SHUTDOWN_GRACE_S` no SIGTERM + Caddy com health check e repetição; `deploy/test/rolling-restart.mjs`: 9.651 pedidos durante o reinício das duas instâncias, 0 erros.
- Drenagem dos game servers: `RoomManager.drain`/`Room.drain` (aviso, sem partida nova, fecha no fim da partida, prazo `DRAIN_TIMEOUT_S`), heartbeat com `maxRooms 0`, e a API não devolve a sala a um servidor drenando. `drain.test.ts` + `tools/load/drain.mjs` no contêiner: aviso na hora, fora da escolha em 5 s, placar aos 60 s, saída com código 0.
- Backup: `deploy/backup/` (`pg_dump` custom, retenção, envio S3 opcional; imagem para máquina agendada); `deploy/test/backup-restore.sh`: restore num banco novo com as 16 tabelas idênticas e a API subindo nele.
- Escala por região no Fly: o endereço anunciado leva o id da máquina (`/m/<id>/rooms/...`) e a máquina errada responde `fly-replay` (`instance.test.ts`); cada máquina se registra como `gs.<id>` com o segredo do grupo (`packages/tickets`, teste). Configs em `deploy/fly/*.toml` (validadas como TOML; o `fly config validate` precisa da conta).
- CI/CD: `.github/workflows/deploy.yml` (main → homologação; tag `v*` → produção com aprovação; API → game servers → web → fumaça), CI reutilizado via `workflow_call`, job `images` que constrói as imagens e passo do actionlint (sem erros).
- CDN: os bundles com hash saem com cache imutável e o `index.html` com `no-cache`; CDN na frente fica como decisão do PO junto do domínio.
- Falta do PO para publicar: domínio, conta/orçamento do Fly, PostgreSQL/Redis gerenciados, bucket de backup, regiões, serviço de erros e destino dos alertas.
