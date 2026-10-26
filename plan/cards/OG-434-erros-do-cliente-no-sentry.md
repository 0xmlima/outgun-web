# OG-434 — Erros do cliente e dos servidores no Sentry

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | — (2.46.2) |
| Status | Em revisão |
| Dependências | OG-102, OG-428 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como time, queremos ver os erros que acontecem no navegador e no app dos jogadores, para achar causas como a do congelamento da issue #6 sem depender de relato.

## Contexto
- Pedido do PO em 2026-10-26. O envio de erros (OG-102) existia, mas o `deploy.sh` não passava `VITE_SENTRY_DSN` ao build e a CSP não deixava o navegador falar com o Sentry: nenhum erro do cliente era gravado.
- Conta do PO no sentry.io (plano Developer), projetos `outgun-web` e `outgun-server`, região US, sem guardar IP.

## Critérios de aceite
- [x] O build do beta leva o DSN do `outgun-web`; erros marcados com rota, cliente (navegador/desktop), navegador e versão.
- [x] Erro no desenho da partida chega com `area: render`.
- [ ] Erro de teste depois do deploy aparece no Sentry com a linha do código original (conferido pelo MCP).

## Notas de implementação
- `app/errors.ts` ganhou `captureError` (erros já tratados, com marcas próprias); o `guardFrame` da partida usa ele. `deploy.sh` põe o DSN do cliente (público) no build; servidor: `SENTRY_DSN` e `CSP_EXTRA` no `/opt/outgun/.env` (README do deploy).
