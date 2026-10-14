# OG-102 — Observabilidade

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 3 pts |
| Sprint | S11 |
| Status | Em revisão |
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
- [x] Dashboard com as métricas acima; alerta quando p95 do tick > 20 ms.

## Notas técnicas
- —

## Notas de implementação
- Pacote novo `packages/observability` (D-32): registro de métricas no formato do Prometheus (contador, medidor, histograma com rótulos, sem alocação por observação), logs pino com `service`/`env`/`version` e segredos mascarados, `requestId` para correlação e `ErrorReporter`, que envia erros pelo protocolo de envelope do Sentry (Sentry ou GlitchTip) usando só `fetch`, com limite por minuto. O subcaminho `@outgun/observability/errors` roda no navegador.
- Game server (`apps/game-server/src/telemetry.ts`): histogramas do tick do processo, do tick de cada sala e do atraso do tick; salas e jogadores por modo, bots, espectadores, WebSockets abertos, bytes enviados/recebidos, conexões por resultado (aceita ou motivo da recusa), `outgun_errors_total{kind=tick|misbehavior|platform}`, CPU/memória/event loop. `/metrics` aceita `METRICS_TOKEN`. Uma sala que lança exceção no tick não derruba mais as outras: o erro é contado, registrado e enviado (antes a exceção interrompia o tick de todas as salas). `console.*` trocado por log JSON; `Room.kicks` limitado aos 50 últimos.
- API: `http_request_duration_seconds{method,route,status}` (rota do roteador; sem rota vira `unmatched`, para a cardinalidade não explodir), `outgun_api_errors_total`, erros 5xx para o `ErrorReporter`, `x-request-id` aproveitado ou gerado e devolvido. O game server manda `x-request-id: gs-<id>-<n>` nas chamadas internas, e o `jti` do ticket aparece no log da API ("ticket emitido") e do game server ("jogador entrou").
- Cliente web: `VITE_SENTRY_DSN` liga o envio de erros não tratados (`error`, `unhandledrejection`) com a rota; nenhum dado do jogador vai junto.
- Painel e alertas em `tools/observability/` (Prometheus 3.5, Alertmanager 0.28, Grafana 12.1 por docker compose): painel "Outgun" com tick p50/p95/p99, tick por sala, atraso, jogadores/salas, tráfego, conexões, erros, latência da API por percentil e por rota, pedidos por status e processos. Alertas: `OutgunTickP95Alto` (p95 > 20 ms por 1 min), ticks descartados, tráfego por cliente > 10 KB/s, exceção no tick, API lenta, 5xx, alvo fora. `check.sh` (também no CI) roda `promtool check config`, `promtool test rules` (o alerta do tick dispara com p95 de 35 ms e não dispara com 3 ms), `amtool check-config` e valida o JSON do painel.
- Demonstração local: API + game server com 4 clientes headless e 8 bots; p95 do tick 1,85 ms, 1,28 kB/s por cliente; print em `tools/parity/out/prints/og102/painel.png`. Ao derrubar o game server, `OutgunAlvoFora` chegou ao Alertmanager em menos de 2 min.
- Fica para o deploy (OG-103): qual serviço de erros (DSN) e para onde vão os alertas (receptor do Alertmanager).
