# OG-514 — Erros tratados (log.error) também vão ao Sentry

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Melhoria |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | — |
| Status | Backlog |
| Dependências | OG-434, OG-512 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero que todo erro registrado pelo servidor, mesmo os tratados, chegue ao Sentry, para eu ficar sabendo e poder agir sem depender de garimpar o Grafana.

## Contexto
- Achado do PO em 2026-10-29: o e-mail de boas-vindas falhava em produção (Resend HTTP 403, `MAIL_FROM=onboarding@resend.dev` no `.env` do beta) e o erro só aparecia no Grafana. O Sentry não viu nada.
- O `ErrorReporter` (`packages/observability/src/errors.ts`) só envia o que for passado a `capture`. Na API isso é só o hook `onError` (exceção não tratada que vira 5xx, `apps/api/src/app.ts:268`); no game server, `uncaughtException`/`unhandledRejection` e o erro no tick.
- Erros tratados que hoje só vão para o log: boas-vindas e redefinição de senha (`routes/auth.ts:136,228`), issue do GitHub (`routes/admin.ts:716`), alerta do vigia e pasta do backup (`security.ts:87,105`), virada da temporada e liberação de números (`main.ts:22,33`).

## Escopo
- API e game server: todo log de nível `error` ou acima com `err` vai também ao `ErrorReporter` (gancho único no logger pino, não chamada por chamada), com a mensagem do log como tag/título e `reqId`/rota quando houver.
- Não duplicar o que o `onError` já envia (5xx não tratado registrado como "erro interno").
- `warn` fica de fora. O limite por minuto do reporter continua valendo.

## Critérios de aceite
- [ ] Um `request.log.error({ err }, 'msg')` numa rota gera um evento no reporter com a mensagem e o `reqId` (teste).
- [ ] Exceção não tratada numa rota gera um único evento, não dois (teste).
- [ ] Mesmo comportamento no game server (teste).

## Notas de implementação
