# OG-108 — Telemetria de rede e predição para ajuste com dados reais

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Should |
| Estimativa | 3 pts |
| Sprint | S12 |
| Status | Pronto |
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
- [ ] Resumos chegam e aparecem agregados por região; desligar nas opções para o envio.
- [ ] Nenhum dado pessoal no resumo (teste).

## Notas técnicas
- Limite de taxa por IP; corpo pequeno; enviar com `sendBeacon` no fim.

## Notas de implementação
_(preencher durante a execução: decisões, divergências intencionais, links de PR e specs)_
