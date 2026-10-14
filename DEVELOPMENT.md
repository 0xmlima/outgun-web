# Desenvolvimento — Outgun Web

Este repositório tem duas partes:

- **Código original do Outgun 1.0.3** (raiz: `src/`, `maps/`, `config/`, `graphics/`...). É a referência do port e **não deve ser alterado**; `pnpm check:legacy` confere isso.
- **Monorepo do port web** (`apps/`, `packages/`, `tools/`), descrito em `plan/PLAN.md` (seção 5.2).

## Requisitos

- Node.js 22 ou superior (`.nvmrc`)
- pnpm via Corepack: `corepack enable` (a versão vem do campo `packageManager` do `package.json`)
- Docker (para o oráculo do jogo original, `tools/parity/`, e para os testes de integração da API, que sobem um PostgreSQL 16)

## Comandos

| Comando                             | O que faz                                                     |
| ----------------------------------- | ------------------------------------------------------------- |
| `pnpm install`                      | Instala dependências de todos os pacotes                      |
| `pnpm build`                        | Compila todos os pacotes (Turborepo, em ordem de dependência) |
| `pnpm test`                         | Testes (Vitest)                                               |
| `pnpm typecheck`                    | Checagem de tipos                                             |
| `pnpm lint`                         | ESLint                                                        |
| `pnpm format` / `pnpm format:check` | Prettier                                                      |
| `pnpm check:legacy`                 | Confere que os arquivos do Outgun original estão intactos     |
| `pnpm check:licenses`               | Licenças das dependências de produção e cabeçalhos SPDX       |
| `pnpm verify`                       | Tudo acima, na ordem do CI                                    |

## Pacotes

| Pacote                   | Papel                                                                             | Card            |
| ------------------------ | --------------------------------------------------------------------------------- | --------------- |
| `packages/sim`           | Simulação determinística (port de `src/world.cpp`), sem dependências de Node/DOM  | E2              |
| `packages/protocol`      | Mensagens binárias cliente/servidor                                               | OG-041          |
| `packages/content`       | Mapas, gerador, manifesto de assets                                               | OG-010 a OG-012 |
| `packages/settings`      | Configurações de sala e presets                                                   | OG-030          |
| `packages/i18n`          | Traduções                                                                         | OG-014          |
| `packages/tickets`       | Ticket de entrada no game server (JWT Ed25519: API assina, servidor confere)      | OG-083          |
| `packages/netcode`       | Cliente de rede do jogo: estado recebido, foguetes locais, predição, suavização   | OG-064          |
| `packages/bots`          | IA dos bots (port de `src/robot.cpp` e `src/bot_support.cpp`)                     | OG-050 a OG-053 |
| `packages/observability` | Métricas Prometheus, logs JSON (pino) e envio de erros (Sentry/GlitchTip)         | OG-102          |
| `apps/game-server`       | Servidor de jogo (10 Hz)                                                          | OG-040          |
| `apps/api`               | Contas, ranking, salas (Fastify + Drizzle + PostgreSQL; ver `apps/api/README.md`) | OG-080          |
| `apps/web`               | Cliente web                                                                       | OG-060          |

`packages/sim`, `packages/netcode` e `packages/bots` têm regras de lint próprias: sem `Math.random`, `Date.now`, globais de Node/DOM ou imports `node:*`. Aleatoriedade vem de um `Rng` injetado (OG-004).

Bots (OG-053): no servidor de jogo cada bot é um cliente virtual (`apps/game-server/src/bot-client.ts`). Para ver bots jogando localmente, suba o servidor com `CASUAL_BOTS_FILL=8` e entre em `/play`. `node apps/game-server/dist/bot-stats.js --matches 50 [--bots 6] [--minutes 3] [--map outgun1] [--set "linha do gamemod"]` roda partidas só de bots (como o `-bottest` do original) e mostra capturas por partida e o custo dos bots por frame. A paridade da IA com o original é conferida decisão a decisão pelos cenários `tools/parity/scenarios/bots-ai-*.txt` (diretiva `bottrace`).

## Convenções

Fluxo de cards, branches e commits: `plan/PLAN.md` seção 8 e a skill `.claude/skills/outgun-card-workflow`. Arquivos novos levam o cabeçalho `SPDX-License-Identifier: GPL-2.0-or-later`.

## Licença e créditos

GPL-2.0-or-later (texto em `COPYING`, créditos em `CREDITS.md`). `pnpm check:licenses` exige o cabeçalho SPDX em todo código novo de `apps/`, `packages/` e `tools/` e só aceita dependências de produção com licença compatível (lista em `tools/license-check/check.mjs`). Ao adicionar uma dependência com licença fora da lista, discuta antes com o PO.

## Cliente web (`apps/web`)

- `pnpm assets` uma vez (gera `apps/web/public/assets/`, ignorado pelo git: fontes, gráficos e sons convertidos). Sem ele o cliente funciona, mas os textos usam uma fonte CSS no lugar das fontes bitmap do original.
- `pnpm --filter @outgun/web dev` — servidor de desenvolvimento do Vite (http://localhost:5173).
- `pnpm --filter @outgun/web build` e `pnpm --filter @outgun/web preview` — build de produção e servidor local dele (http://localhost:4173).
- `/play` (o "Jogar agora") entra na sala `main` do servidor de jogo: suba antes `pnpm --filter @outgun/game-server start` (porta 7700; a 7000 é do AirPlay no macOS; `ROTATION="2 versus 2 (duel)"` para um mapa pequeno). Parâmetros: `server=ws://host:porta` (padrão: `VITE_GAME_SERVER` no build ou a porta 7700 da mesma máquina), `sala=ID`, `name=NOME` e, para depuração, `lag=MS&loss=PCT` (rede ruim simulada nos dois sentidos). Abra duas abas para dois jogadores.
- `/play?map=NOME&theme=TEMA&rooms=N&room=X,Y` mostra um mapa: setas trocam de sala, PageUp/PageDown mudam quantas salas aparecem. Com `/play?demo=N` (e `map` opcional, padrão sisso), roda uma partida local com N jogadores de controles aleatórios (a sim de verdade); `&stress=1` deixa todos com arma no máximo e energia cheia (teste de carga).
- Comparação visual com o cliente original (`tools/visual-compare`, precisa do Docker do oráculo e do Chrome; `CHROME_PATH` e `WEB_URL` opcionais): `pnpm --filter @outgun/visual-compare refs` gera os prints do original, `compare` gera os lados a lado e a % de pixels diferentes em `tools/parity/out/prints/og061/`, `fps` mede quadros por segundo (inclusive 32 jogadores com 256 foguetes), `shot` tira o print de uma rota, `keys` percorre as teclas do jogo na demonstração, `online` joga dois clientes no servidor de jogo (um com 150 ms de RTT e 2% de perda simulados; `LAG` e `LOSS` mudam) e mede a resposta da nave e as correções de predição, `hud` tira os prints do HUD com dois jogadores e chat, `audio` confere os sons (tiro, entrada, chat) e o atraso evento → som, `teams` testa a troca de time (Ctrl+End) com dois jogadores, `vote` testa a troca de mapa por voto (F8; suba o servidor com 2+ mapas em `ROTATION`), `reconnect.mjs` derruba a conexão de um jogador e confere a volta à mesma vaga, `moderation.mjs` testa `/list`, `/mute`, `/kick` e a auditoria na API (`AUDIT_CMD` lista `admin_actions`), `ticket.mjs` entra na partida com o ticket da API (servidor com `DEV_TICKETS=0`; logado, convidado, nome registrado, Ranked), `auth.mjs` percorre cadastro, login, recuperação de senha e exclusão de conta (API com `MAILER=memory DEV_ROUTES=1 WEB_URL=http://localhost:4173`). Rode com o build servido por `preview`.
- Chat e moderação (OG-046): comandos `/help` etc. no chat; admin (conta com `is_admin`, como `Admin` do seed) tem `/list`, `/kick n motivo`, `/ban n min motivo`, `/mute`, `/smute`, `/unmute`, `/forcemap`, `/set`. O game server registra as ações na API (`API_URL`, `GS_ID`/`GS_SECRET`, padrão `dev`, que bate com o `INTERNAL_SECRETS` de desenvolvimento da API); `CHAT_FILTER=palavra1,palavra2` liga o filtro de palavras.
- Entrada na partida (OG-083): `/play` pede o ticket à API (`POST /api/rooms/:id/join`) e conecta no endereço devolvido (`?server=` ainda manda no endereço). Sem a API no ar, usa o ticket `dev:Nome`, aceito só com `DEV_TICKETS` (padrão no desenvolvimento). O game server busca as chaves em `TICKET_JWKS_URL` (padrão `http://localhost:7800/.well-known/jwks.json`).
- Contas (OG-081): as telas Entrar, Criar conta, Esqueceu a senha, Conta usam a API em `/api`; `vite dev` e `vite preview` repassam para `http://localhost:7800` (`API_URL` muda o destino; `VITE_API_URL` no build aponta para outro endereço). Suba a API conforme `apps/api/README.md`. Sem a API, o jogo segue como convidado.
- `VITE_SOURCE_URL` (opcional, no build): endereço público do código-fonte para o link "Código-fonte (GPL)"; sem ele o link abre a página `/source`.

## Testes E2E e de carga (OG-101)

- `pnpm --filter @outgun/e2e e2e` (depois de `pnpm build`): Playwright com o Chrome instalado (no CI, o Chromium do Playwright). Sobe um PostgreSQL descartável no Docker (porta 55433; `E2E_DATABASE_URL` usa outro), a API (17800), o game server (17700, tickets de verdade, partidas de 1 minuto com 3 bots) e o `vite preview` (14173), e percorre cadastro → lobby → "Jogar agora" → partida até o fim → perfil com a partida → página da partida → ranking; também confere que convidado no Ranked vai para o login. Prints em `tools/parity/out/prints/og101/`, relatório e traces de falha em `tools/parity/out/e2e/`.
- `node tools/load/run.mjs [--rooms 20] [--players 32] [--seconds 60] [--warmup 20] [--workers 4] [--lag MS] [--jitter MS] [--loss PCT] [--server ws://...]`: sobe um game server próprio (porta 17790) com as salas fixas (variável `ROOMS` do game server) e N×M clientes headless em processos separados, com rede ruim simulada opcional; o relatório (tick por sala e do processo, CPU, tráfego por cliente, frames) sai em `tools/parity/out/load/report.md`. O resultado de referência está em `plan/reports/OG-101-carga.md`.

## Segurança (OG-104)

- Revisão ASVS nível 1 e anti-cheat em `plan/reports/OG-104-seguranca.md` (achados, correções e a lista de verificação do deploy).
- Game server: tickets `dev:` só fora de produção (ou com `DEV_TICKETS=1`); `MAX_CONNECTIONS_PER_IP` (8; 0 desliga); `/report nome motivo` no chat manda a denúncia para a API (`POST /internal/reports`, tabela `player_reports`). Bans de sala também pelo dispositivo.
- API: cabeçalhos de segurança em toda resposta (CSP, HSTS com `COOKIE_SECURE`), erro 5xx sem detalhes (`reqId` para achar no log), senhas comuns recusadas (`weak_password`), ban por dispositivo (hash do `device` mandado pelo cliente ao entrar).
- Cliente: `vite preview` serve o build com os cabeçalhos de `apps/web/security-headers.ts` (CSP sem `unsafe-eval`; `CSP_CONNECT_SRC` troca as origens locais de `connect-src`). O servidor de produção precisa mandar os mesmos. O PixiJS roda sem eval (`pixi.js/unsafe-eval`).

## Observabilidade (OG-102)

- Game server e API expõem `GET /metrics` no formato do Prometheus (`METRICS_TOKEN` exige `Authorization: Bearer`). Game server: `outgun_tick_duration_seconds` (tick de todas as salas: simulação + serialização), `outgun_room_tick_duration_seconds`, `outgun_tick_lateness_seconds`, `outgun_rooms`/`outgun_players` por modo, `outgun_bots`, `outgun_spectators`, bytes enviados/recebidos, conexões por resultado, `outgun_errors_total{kind}`. API: `http_request_duration_seconds{method,route,status}` e `outgun_api_errors_total`. Os dois: CPU, memória e atraso do event loop.
- Logs em JSON (pino) com `service`, `env` e `version` (`RELEASE`); `LOG_LEVEL` muda o nível. Correlação: a API devolve e registra o `x-request-id` (o game server manda `gs-<id>-<n>` nas chamadas internas) e a entrada numa sala registra o `jti` do ticket na API ("ticket emitido") e no game server ("jogador entrou").
- Erros: com `SENTRY_DSN` (API e game server) ou `VITE_SENTRY_DSN` no build do cliente, exceções vão para um serviço compatível com Sentry (Sentry ou GlitchTip), no máximo 30 por minuto (10 no cliente). Sem DSN, nada sai da máquina.
- Painel e alertas: `docker compose -f tools/observability/docker-compose.yml up -d` sobe Prometheus (http://localhost:9090), Alertmanager (:9093) e Grafana (http://localhost:3000, painel "Outgun") coletando o game server (7700) e a API (7800) locais. `bash tools/observability/check.sh` confere as configurações e roda os testes das regras de alerta (`promtool test rules`; p95 do tick > 20 ms por 1 min, ticks descartados, tráfego por cliente > 10 KB/s, exceção no tick, API lenta ou com 5xx, alvo fora do ar).

## Utilitários de desenvolvimento (`tools/dev/`)

- `bash tools/dev/verify.sh` — formata e roda `pnpm verify`; sucesso só se tudo passou (rodar antes de cada commit). Usa `corepack pnpm` se `pnpm` não estiver no PATH.
- `python3 tools/dev/set-status.py 042 "Em andamento"` — muda o status de um card no cabeçalho e na tabela da seção 10 do PLAN.
- `python3 tools/dev/fix-nbsp.py` — troca NBSP literal por ` ` nos fontes (a ferramenta de escrita do agente grava o caractere).
- `bash tools/dev/patch-workspace.sh DIR` — monta `DIR/a` (src original) e `DIR/b` (com o patch do oráculo) para editar `tools/parity/patches/001-trace.patch`; depois `(cd DIR && diff -ruN a b > …/001-trace.patch)` e `pnpm oracle build`.
