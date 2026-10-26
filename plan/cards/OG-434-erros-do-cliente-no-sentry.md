# OG-434 — Erros do cliente e dos servidores no Sentry

| Campo | Valor |
|---|---|
| Épico | E7 |
| Tipo | Infra |
| Prioridade | Must |
| Estimativa | 2 pts |
| Sprint | — (2.46.2) |
| Status | Concluído |
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
- [x] Erro de teste depois do deploy aparece no Sentry (OUTGUN-WEB-1, conferido pelo MCP, com as marcas). Na 2.46.3, o erro de teste do painel (OUTGUN-WEB-2) chegou com release `2.46.3` e a pilha em `src/screens/AdminScreen.tsx:1635` (sourcemaps públicos funcionam).

## Notas de implementação
- `app/errors.ts` ganhou `captureError` (erros já tratados, com marcas próprias); o `guardFrame` da partida usa ele. `deploy.sh` põe o DSN do cliente (público) no build; servidor: `SENTRY_DSN` e `CSP_EXTRA` no `/opt/outgun/.env` (README do deploy).
- A release do cliente era o commit (`b9489c9`); o `deploy.sh` passa a usar a versão do jogo em `VITE_RELEASE` (vale no próximo deploy). A release dos servidores segue o commit (`RELEASE: ${TAG}` no compose).
- O Sentry guarda o país/cidade aproximados (calculados do IP antes de descartá-lo).
- 2.46.3: a release dos servidores também passa a ser a versão (`RELEASE` no `.env`, gravado pelo `install.sh`); botão "Enviar erro de teste" na aba Feedback do painel, lançado do código do jogo, para conferir a pilha com a linha original.
