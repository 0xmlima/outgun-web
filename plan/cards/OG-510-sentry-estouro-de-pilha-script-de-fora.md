# OG-510 — Sentry: estouro de pilha no portal vindo de um script de fora da página (OUTGUN-WEB-5)

| Campo | Valor |
|---|---|
| Épico | E11 |
| Tipo | Bug |
| Prioridade | Should |
| Estimativa | 1 pt |
| Sprint | S54 |
| Status | Pronto |
| Dependências | OG-434 |
| Regras de negócio | — |
| Skills | `outgun-card-workflow` |

## História
Como PO, quero que o Sentry só mostre erros do nosso código, para não perder tempo com ruído e não deixar passar um erro de verdade do portal.

## Contexto
- Sentry OUTGUN-WEB-5 (release 2.53.0, 7 eventos em 6 min, 2026-10-29 02:07–02:13 UTC, Presidente Prudente): `RangeError: Maximum call stack size exceeded`, recursão `Fk`↔`Hk` em `https://outgunweb.com.br/:230:63`. Rotas: `/matches/:id` (3 partidas) e `/players/coiote`. Navegador `outro` (o user agent não tem Chrome/Firefox/Safari: provável navegador embutido de app no celular).
- O arquivo dos quadros é a própria página, não um `/assets/*.js` (os sourcemaps públicos do OG-434 resolveriam). O `index.html` servido tem 57 linhas, então a linha 230 não é nossa: o código foi injetado pelo navegador (tradutor, modo escuro, webview).
- Nada indica que a página quebrou para o jogador, mas falta confirmar.

## Escopo
- Confirmar que a página de partida e o perfil abrem sem erro num navegador embutido (ex.: user agent de webview do Instagram/WhatsApp no iOS/Android) e que nenhum chunk nosso tem a linha 230 de `Fk`/`Hk`.
- No `ErrorReporter` do cliente (`apps/web/src/app/errors.ts`): não enviar erros sem nenhum quadro em código nosso (`/assets/` da origem ou módulos do Vite em dev). Erros sem pilha continuam indo.
- `browserName`: reconhecer `CriOS`, `FxiOS`, `EdgiOS` e marcar webviews (`wv`, `FBAN`, `Instagram`) para a etiqueta `browser` dizer de onde veio.
- Resolver o OUTGUN-WEB-5 no Sentry depois do deploy.

## Critérios de aceite
- [ ] Erro só com quadros de script injetado não é enviado (teste do filtro); erro com quadro nosso continua indo (teste).
- [ ] `browserName` cobre os navegadores de iOS e as webviews (teste).
- [ ] OUTGUN-WEB-5 resolvido no Sentry.

## Notas de implementação
(preenchido durante a execução)
