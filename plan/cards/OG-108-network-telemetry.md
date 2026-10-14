# OG-108 — Telemetria de rede e predição para ajuste com dados reais

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S12 |
| Status | Em revisão |
| Dependências | [OG-064](OG-064-prediction-interpolation.md), [OG-102](OG-102-observability.md) |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como time, quero medir latência, perda, correções de predição e fps dos testadores do beta, para ajustar a rede e a predição com dados reais (escopo do OG-105).

## Contexto e referências no original
- `packages/netcode` (predição, reconciliação), `tools/visual-compare/online.mjs` (medições de laboratório), D-18.

## Escopo
- O cliente envia, a cada partida (e no fim), um resumo anônimo: RTT p50/p95, jitter, perda estimada, correções de predição por minuto, maior correção, fps p5/p50, região, navegador; sem nome nem conta (opção de desligar nas opções).
- API guarda o resumo e expõe métricas agregadas para o painel do Grafana e uma visão no painel admin.
- Respeitar a política de privacidade (OG-107).

## Critérios de aceite
- [x] Resumos chegam e aparecem agregados por região; desligar nas opções para o envio.
- [x] Nenhum dado pessoal no resumo (teste).

## Notas técnicas
- Limite de taxa por IP; corpo pequeno; enviar com `sendBeacon` no fim.

## Notas de implementação
- Cliente: `apps/web/src/game/net/telemetry.ts` (`NetTelemetry`: amostra por segundo; resumo com ping p50/p95, atraso dos controles p50/p95, fps p5/p50, correções por minuto, segundos com menos de 8 dos 10 frames, frames/s, navegador e versão; nada com menos de 30 s), ligado no host do jogo (resumo a cada 5 min, ao sair e no `pagehide`, por `sendBeacon`). Preferência `shareNetStats` (padrão ligada) em Opções → Jogo.
- API: migration `0012_net_reports` (sem coluna de conta, nome ou IP; teste confere), `POST /telemetry` (sem ler a sessão, 60/h por IP, faixas validadas, campos extras descartados; região pelo servidor da sala), métricas `outgun_client_ping_seconds`, `outgun_client_corrections_per_minute`, `outgun_client_fps_p5`, `outgun_client_stall_seconds_total`, `outgun_client_seconds_total` por região; `GET /admin/network?days=` (moderador) com percentis por região.
- Painel: aba Rede (1/7/30 dias); Grafana: linha "Clientes" com ping, correções e quedas por região.
- Testes: `telemetry.test.ts` (web: resumo e navegador), `telemetry.test.ts` (API: anonimato, região, faixas, métricas, agregado) e o E2E confere que o resumo chega depois da partida.
- A política de privacidade (OG-107) descreve esse envio.
