# OG-512 — Heartbeat das salas falha ao ler os presets Casual (OUTGUN-SERVER-2)

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 2 pts |
| Sprint | S54 |
| Status | Pronto |
| Dependências | OG-087 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero que uma falha momentânea do banco não derrube o heartbeat das salas e que o Sentry mostre a causa de verdade.

## Contexto
- Sentry OUTGUN-SERVER-2 (release 2.48.0, 8 eventos entre 2026-10-27 19:32 e 20:24 UTC, `POST /internal/rooms/heartbeat`): `Error: Failed query: select ... from "casual_presets" ...` em `panelPresets` (`apps/api/src/platform-config.ts:27`). Não voltou desde então.
- A tabela existe desde a migração `0010_admin_panel` (OG-087), então não é tabela faltando. O drizzle embrulha o erro do Postgres e a causa (`error.cause`: conexão recusada, tempo esgotado, banco reiniciando no deploy...) não chega ao Sentry.
- Se a consulta falha, o heartbeat inteiro responde erro: o game server fica sem a configuração e sem os comandos do painel naquela batida.

## Escopo
- Ver nos logs da VM o que houve em 2026-10-27 por volta das 19:30–20:25 UTC (deploy da 2.48.0? Postgres reiniciou?) e anotar no card.
- `ErrorReporter` do servidor: incluir a `cause` encadeada (mensagem e código do Postgres) no evento.
- Heartbeat: se ler a configuração falhar, responder com a última configuração boa em memória (e sem trocar a `version`), registrando o erro uma vez; o resto da batida (salas, comandos) segue.
- Resolver o OUTGUN-SERVER-2 no Sentry depois do deploy.

## Critérios de aceite
- [ ] Com o banco falhando na leitura dos presets, o heartbeat responde 200 com a configuração anterior (teste).
- [ ] O evento do Sentry traz a causa encadeada (teste do reporter).
- [ ] Causa do episódio de 27/10 anotada no card.

## Notas de implementação
(preenchido durante a execução)
